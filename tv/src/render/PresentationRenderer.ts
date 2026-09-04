import { ImageStage } from './ImageStage';
import type { Presentation } from '../api/types';

// Minimal surface this class needs from an image cache — satisfied by the
// real ImageCache, and decoupled here so PlaybackController's own CacheLike
// (cache/ImageCache.ts + playback/PlaybackController.ts) can be passed
// straight through without a cast.
export interface ImageCacheLike {
  get(url: string): Promise<string>;
}

// Shared with PlaybackController, which prefetches a presentation's images
// into the cache ahead of time without needing to duplicate this
// assetId-by-slot lookup.
export function resolvePresentationUrls(presentation: Presentation, resolveUrl: (relativeUrl: string) => string): string[] {
  const assetsById = new Map(presentation.assets.map((asset) => [asset.id, asset]));
  return presentation.layout.slots.map((slot) => {
    const asset = assetsById.get(slot.assetId) ?? presentation.assets[0];
    return resolveUrl(asset.url);
  });
}

// Consumes real server-provided Presentation objects (PROJECT.md §5.1),
// driving ImageStage from them. Renders every slot in a multi-image
// composition (Phase 4) — layout.slots gives the display order (left to
// right), which presentation.assets is looked up against by id rather
// than assumed to already be in that order.
//
// Image URLs are resolved through the shared ImageCache (Phase 7, §5.8)
// rather than handed to <img src> directly, so a photo already shown once
// (or prefetched ahead of time by PlaybackController) never re-hits the
// network. render() is therefore async — a cache miss means waiting on a
// real fetch before the crossfade can start.
export class PresentationRenderer {
  private stage: ImageStage;
  private advanceTimer: number | null = null;
  private onAdvance: (() => void) | null = null;
  // Guards against a slower, stale render() call (e.g. the viewer mashed
  // Next/Previous) clobbering a newer one that already finished resolving
  // its images.
  private renderToken = 0;

  constructor(
    container: HTMLElement,
    private readonly resolveUrl: (relativeUrl: string) => string,
    private readonly imageCache: ImageCacheLike,
  ) {
    this.stage = new ImageStage(container);
  }

  setOnAdvance(callback: () => void): void {
    this.onAdvance = callback;
  }

  async render(presentation: Presentation, autoAdvance = true): Promise<void> {
    this.clearTimer();
    const token = ++this.renderToken;

    const rawUrls = resolvePresentationUrls(presentation, this.resolveUrl);
    const cachedUrls = await Promise.all(rawUrls.map((url) => this.imageCache.get(url)));

    if (token !== this.renderToken) return; // superseded by a newer render() call

    this.stage.setMatColor(presentation.background.colour);
    this.stage.show(cachedUrls, presentation.frame, presentation.layout.type);

    if (autoAdvance) {
      this.advanceTimer = window.setTimeout(() => {
        this.onAdvance?.();
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
}
