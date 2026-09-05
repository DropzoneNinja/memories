import { ImageStage } from './ImageStage';
import { VideoStage } from './VideoStage';
import type { MatTexture, Presentation } from '../api/types';

// Bundled locally (public/mats/) — never fetched through the API, so a
// material mat renders correctly even if the API/Immich link is briefly
// down (§9.4/§5.10, same resilience story as everything else on-screen).
const MAT_TEXTURE_URLS: Record<MatTexture, string> = {
  wood: '/mats/wood.jpg',
  cork: '/mats/cork.jpg',
  cotton: '/mats/cotton.jpg',
};

// Minimal surface this class needs from an image cache — satisfied by the
// real ImageCache, and decoupled here so PlaybackController's own CacheLike
// (cache/ImageCache.ts + playback/PlaybackController.ts) can be passed
// straight through without a cast.
export interface ImageCacheLike {
  get(url: string): Promise<string>;
}

// Shared with PlaybackController, which prefetches a presentation's images
// into the cache ahead of time without needing to duplicate this
// assetId-by-slot lookup. Only ever reads `asset.url` — never
// `asset.videoUrl` — so a video's streaming URL structurally never enters
// the Blob ImageCache pipeline (PlaybackController's prefetch/evictToFit
// both build their URL sets through this same function).
export function resolvePresentationUrls(presentation: Presentation, resolveUrl: (relativeUrl: string) => string): string[] {
  const assetsById = new Map(presentation.assets.map((asset) => [asset.id, asset]));
  return presentation.layout.slots.map((slot) => {
    const asset = assetsById.get(slot.assetId) ?? presentation.assets[0];
    return resolveUrl(asset.url);
  });
}

// Consumes real server-provided Presentation objects (PROJECT.md §5.1),
// driving ImageStage (photos) or VideoStage (post-Phase-8 addition, video)
// from them depending on presentation.kind. Both stages' root elements
// live in the same container at once; only the active one is visible.
//
// Image URLs are resolved through the shared ImageCache (Phase 7, §5.8)
// rather than handed to <img src> directly, so a photo already shown once
// (or prefetched ahead of time by PlaybackController) never re-hits the
// network. render() is therefore async — a cache miss means waiting on a
// real fetch before the crossfade can start. Video streams bypass the
// cache entirely (see resolvePresentationUrls) and are handed straight to
// <video src> so the browser's own HTTP range-request handling does the
// buffering.
export class PresentationRenderer {
  private imageStage: ImageStage;
  private videoStage: VideoStage;
  private activeKind: 'image' | 'video' = 'image';
  private advanceTimer: number | null = null;
  private onAdvance: (() => void) | null = null;
  // Guards against a slower, stale render() call (e.g. the viewer mashed
  // Next/Previous) clobbering a newer one that already finished resolving
  // its images, and against a video's `ended`/`error`/watchdog firing for
  // a presentation that's no longer the one on screen.
  private renderToken = 0;

  constructor(
    container: HTMLElement,
    private readonly resolveUrl: (relativeUrl: string) => string,
    private readonly imageCache: ImageCacheLike,
  ) {
    this.imageStage = new ImageStage(container);
    this.videoStage = new VideoStage(container);
    this.videoStage.setVisible(false);
  }

  setOnAdvance(callback: () => void): void {
    this.onAdvance = callback;
  }

  async render(presentation: Presentation, autoAdvance = true): Promise<void> {
    this.clearTimer();
    const token = ++this.renderToken;

    if (presentation.kind === 'video') {
      await this.renderVideo(presentation, autoAdvance, token);
    } else {
      await this.renderImage(presentation, autoAdvance, token);
    }
  }

  private async renderImage(presentation: Presentation, autoAdvance: boolean, token: number): Promise<void> {
    if (this.activeKind === 'video') {
      this.videoStage.teardown();
    }
    this.videoStage.setVisible(false);
    this.imageStage.setVisible(true);
    this.activeKind = 'image';

    const rawUrls = resolvePresentationUrls(presentation, this.resolveUrl);
    const cachedUrls = await Promise.all(rawUrls.map((url) => this.imageCache.get(url)));

    if (token !== this.renderToken) return; // superseded by a newer render() call

    const texture = presentation.background.texture;
    this.imageStage.setMatColor(presentation.background.colour, texture ? MAT_TEXTURE_URLS[texture] : null);
    this.imageStage.show(cachedUrls, presentation.frame, presentation.layout.type);

    if (autoAdvance) {
      this.advanceTimer = window.setTimeout(() => {
        this.onAdvance?.();
      }, presentation.duration * 1000);
    }
  }

  private async renderVideo(presentation: Presentation, autoAdvance: boolean, token: number): Promise<void> {
    this.imageStage.setVisible(false);
    this.videoStage.setVisible(true);
    this.activeKind = 'video';

    // No <video poster> (user-reported, post-launch): showing the
    // thumbnail proxy's JPEG while the stream buffers, then swapping to
    // the actual decoded first frame once playback starts, reads as a
    // jarring flash — two visually different images shown back to back.
    // Nothing here is async anymore, so `token` no longer guards a real
    // race, but it's kept for consistency with renderImage() and as a
    // guard against any future async step landing here.
    if (token !== this.renderToken) return; // superseded by a newer render() call

    const asset = presentation.assets[0];
    const videoUrl = asset?.videoUrl ? this.resolveUrl(asset.videoUrl) : '';
    this.videoStage.setBackgroundColor(presentation.background.colour);
    this.videoStage.show(videoUrl, presentation.loop);

    // A stalled/broken stream should skip forward rather than freeze the
    // display indefinitely (§5.10/§9.4) — strictly more resilient than the
    // image path, where a rejected imageCache.get() has no fallback
    // advance at all.
    this.videoStage.onError(() => {
      if (token === this.renderToken) this.onAdvance?.();
    });

    if (presentation.loop) {
      // Loop ON: the native `loop` attribute means `ended` never fires —
      // no advance, no watchdog. Still clear any stale ended-handler from
      // a previous (non-looping) item on this same persistent element.
      this.videoStage.onEnded(() => {});
      return;
    }

    this.videoStage.onEnded(() => {
      if (token === this.renderToken) this.onAdvance?.();
    });

    if (autoAdvance) {
      // Watchdog: `presentation.duration` is the video's real length when
      // known, else a fixed ceiling (presentation.ts's
      // VIDEO_WATCHDOG_CEILING_SECONDS) — whichever of {`ended`, this
      // timeout} fires first advances; renderToken prevents double-firing.
      this.advanceTimer = window.setTimeout(() => {
        if (token === this.renderToken) this.onAdvance?.();
      }, presentation.duration * 1000);
    }
  }

  clearTimer(): void {
    if (this.advanceTimer !== null) {
      window.clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  // Restarts the auto-advance timer for whatever is already on screen,
  // without re-rendering — used when recovering from an auto-freeze
  // (PlaybackController.recordSuccess) so reconnecting never causes a
  // visible re-fade of the same image (§5.10: "no visible hiccup").
  restartTimer(durationSeconds: number): void {
    this.clearTimer();
    this.advanceTimer = window.setTimeout(() => {
      this.onAdvance?.();
    }, durationSeconds * 1000);
  }

  // Freezes whatever's currently on screen in place — image: just stop the
  // advance timer (identical to today's clearTimer() behaviour); video:
  // additionally actually pause the element, so a playing video genuinely
  // stops rather than continuing to play silently behind a frozen timer
  // (PlaybackController.pause() / the FREEZE disconnected-behavior policy).
  pauseMedia(): void {
    this.clearTimer();
    if (this.activeKind === 'video') this.videoStage.pause();
  }

  // Counterpart to pauseMedia() — resumes in place rather than
  // re-rendering, so a paused video continues from where it left off
  // instead of restarting from frame 0 (PlaybackController.resume() / the
  // FREEZE auto-unfreeze path). `presentation` must be the one currently
  // on screen — its `duration`/`loop` govern whether a watchdog is rearmed.
  resumeMedia(presentation: Presentation): void {
    if (this.activeKind === 'video') {
      this.videoStage.resume();
      if (!presentation.loop) this.restartTimer(presentation.duration);
    } else {
      this.restartTimer(presentation.duration);
    }
  }
}
