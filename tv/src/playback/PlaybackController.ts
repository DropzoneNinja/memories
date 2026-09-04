import { PresentationRenderer, resolvePresentationUrls } from '../render/PresentationRenderer';
import { createImageCache } from '../cache/ImageCache';
import { nextDelay, type BackoffOptions } from '../net/backoff';
import type { DisconnectedBehavior, HeartbeatResponse, PlaylistResponse, Presentation } from '../api/types';

const FETCH_BATCH_SIZE = 5;
// Fetch more once we're this close to the end of the locally-held queue.
const REFILL_THRESHOLD = 2;
// How many already-shown items stay in the queue behind the current one —
// just enough for a single Previous press (PROJECT.md §5.8's rolling
// cache is about *upcoming* items; a deep shown-history isn't the point).
const BACK_BUFFER = 1;
// Consecutive failed heartbeat/playlist-fetch attempts before treating the
// TV as offline (PROJECT.md §5.10) — 2 avoids flapping on a single blip.
const OFFLINE_THRESHOLD = 2;
const EMPTY_QUEUE_BACKOFF: BackoffOptions = { baseMs: 3000, capMs: 20_000 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Minimal surface PlaybackController needs from a renderer — satisfied by
// the real PresentationRenderer, and by a fake in tests (no DOM needed).
export interface RendererLike {
  render(presentation: Presentation, autoAdvance?: boolean): void | Promise<void>;
  restartTimer(durationSeconds: number): void;
  clearTimer(): void;
  setOnAdvance(callback: () => void): void;
}

// Minimal surface needed from the image cache — satisfied by ImageCache
// and by a fake in tests. Includes `get` (not used directly by
// PlaybackController itself) purely so the same instance can be passed
// straight through to PresentationRenderer's ImageCacheLike without a cast.
export interface CacheLike {
  get(url: string): Promise<string>;
  prefetch(urls: string[]): void;
  evictToFit(keepUrls: ReadonlySet<string>): void;
}

// Minimal surface needed from the API client — satisfied by the real
// MemoriesApiClient (a class instance always structurally satisfies an
// interface like this one) and by a fake in tests, since MemoriesApiClient
// has private fields that would otherwise block a plain test object from
// being assigned to its concrete type.
export interface ApiLike {
  getPlaylist(deviceId: string, count?: number): Promise<PlaylistResponse>;
  resolveAssetUrl(relativeUrl: string): string;
}

export interface PlaybackControllerOptions {
  renderer?: RendererLike;
  imageCache?: CacheLike;
  emptyQueueBackoff?: BackoffOptions;
}

// Owns the local in-memory queue and current position; the actual
// materialized queue/ordering lives server-side (§6 — TV owns only
// rendering, local cache, and the current playback timer).
//
// Phase 7 (Resilience, §5.8/§5.10) additions over the original Phase 3
// version: the queue is bounded to `cacheSize` upcoming items (server-
// configured, applied live via applyServerStatus) rather than growing
// unbounded; images are cached/evicted through CacheLike; a config-version
// change (learned via the heartbeat response or the ConfigSocket push)
// eagerly discards stale not-yet-shown items without touching what's
// currently on screen; and disconnectedBehavior governs what happens once
// the cache is genuinely exhausted while offline.
export class PlaybackController {
  private queue: Presentation[] = [];
  private index = -1;
  private paused = false;
  // Distinct from `paused` — set only by FREEZE-policy auto-detection, so
  // a manual pause is never silently overridden by a reconnect, and a
  // FREEZE auto-stop never looks like the viewer paused it themselves.
  private autoFrozen = false;
  private renderer: RendererLike;
  private imageCache: CacheLike;
  private readonly resolveUrl: (relativeUrl: string) => string;
  private readonly emptyQueueBackoff: BackoffOptions;
  private onStatusChange: ((status: string) => void) | null = null;

  private cacheSize = 8;
  private disconnectedBehavior: DisconnectedBehavior = 'CONTINUE_QUEUE';
  private lastKnownConfigVersion: number | null = null;
  private consecutiveFailures = 0;
  private offline = false;

  constructor(
    private readonly api: ApiLike,
    private readonly deviceId: string,
    container: HTMLElement,
    options: PlaybackControllerOptions = {},
  ) {
    this.resolveUrl = (url) => this.api.resolveAssetUrl(url);
    this.imageCache = options.imageCache ?? createImageCache();
    this.renderer = options.renderer ?? new PresentationRenderer(container, this.resolveUrl, this.imageCache);
    this.renderer.setOnAdvance(() => this.next());
    this.emptyQueueBackoff = options.emptyQueueBackoff ?? EMPTY_QUEUE_BACKOFF;
  }

  setOnStatusChange(callback: (status: string) => void): void {
    this.onStatusChange = callback;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isOffline(): boolean {
    return this.offline;
  }

  // What to report on the next heartbeat (§4.2, Phase 6) — null until the
  // first item has actually been shown.
  get currentStatus(): { presentationId: string; paused: boolean } | null {
    const presentation = this.queue[this.index];
    return presentation ? { presentationId: presentation.presentationId, paused: this.paused } : null;
  }

  async start(): Promise<void> {
    for (let attempt = 1; this.queue.length === 0; attempt++) {
      await this.fetchMore();
      if (this.queue.length > 0) break;
      this.onStatusChange?.(`waiting for playlist… (attempt ${attempt})`);
      await sleep(nextDelay(attempt, this.emptyQueueBackoff));
    }
    this.index = 0;
    this.showCurrent();
  }

  // Called after every heartbeat (tv/src/main.ts) — the guaranteed
  // fallback for learning about a config change, since it fires
  // unconditionally on a fixed interval regardless of the ConfigSocket
  // push staying connected. `null` means the heartbeat itself failed
  // (network-level), which counts toward offline detection the same as a
  // failed playlist fetch.
  applyServerStatus(status: HeartbeatResponse | null): void {
    if (status === null) {
      this.recordFailure();
      return;
    }
    this.recordSuccess();
    this.cacheSize = status.cacheSize;
    this.disconnectedBehavior = status.disconnectedBehavior;
    this.applyConfigVersion(status.configurationVersion);
  }

  // Called by ConfigSocket on a `config-changed` push — the fast path;
  // applyServerStatus (heartbeat) is what guarantees this is never missed
  // even if the push never arrives.
  onPushedConfigChanged(configurationVersion: number): void {
    this.applyConfigVersion(configurationVersion);
  }

  private applyConfigVersion(configurationVersion: number): void {
    if (this.lastKnownConfigVersion === null) {
      this.lastKnownConfigVersion = configurationVersion;
      return;
    }
    if (configurationVersion === this.lastKnownConfigVersion) return;

    this.lastKnownConfigVersion = configurationVersion;
    // Discard not-yet-shown stale items from the old config, but leave the
    // currently-displayed one (and its back-buffer) untouched — no visible
    // hiccup (PROJECT.md §5.10).
    this.queue.splice(this.index + 1);
    void this.fetchMore();
  }

  private recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.offline || this.consecutiveFailures < OFFLINE_THRESHOLD) return;
    this.offline = true;
    if (this.disconnectedBehavior === 'FREEZE') {
      this.autoFrozen = true;
      this.renderer.clearTimer();
      this.onStatusChange?.('offline — frozen on current image');
    } else {
      this.onStatusChange?.('offline — playing from cache');
    }
  }

  private recordSuccess(): void {
    const wasOffline = this.offline;
    this.consecutiveFailures = 0;
    this.offline = false;
    if (!wasOffline) return;

    if (this.autoFrozen) {
      this.autoFrozen = false;
      const current = this.queue[this.index];
      if (!this.paused && current) this.renderer.restartTimer(current.duration);
    }
    void this.fetchMore();
  }

  private showCurrent(): void {
    this.trimQueue();
    const presentation = this.queue[this.index];
    if (!presentation) {
      this.onStatusChange?.('no playlist available — is an album configured for this TV?');
      return;
    }

    // Fire-and-forget: rendering resolves images through the cache (a
    // cache miss awaits a real fetch), so it must never block the rest of
    // the app (§9.4) — a slow image just delays that one crossfade.
    void this.renderer.render(presentation, !this.paused);
    void this.maybeFetchMore();
  }

  // Drops consumed items beyond the back-buffer and evicts any
  // now-unreferenced cached images — keeps both the queue and the image
  // cache bounded (§5.8, §9.2) instead of growing for the life of the run.
  private trimQueue(): void {
    const dropCount = Math.max(0, this.index - BACK_BUFFER);
    if (dropCount > 0) {
      this.queue.splice(0, dropCount);
      this.index -= dropCount;
    }

    const keep = new Set<string>();
    for (const presentation of this.queue) {
      for (const url of resolvePresentationUrls(presentation, this.resolveUrl)) keep.add(url);
    }
    this.imageCache.evictToFit(keep);
  }

  private async maybeFetchMore(): Promise<void> {
    const upcoming = this.queue.length - this.index - 1;
    if (upcoming >= REFILL_THRESHOLD) return;
    const room = this.cacheSize - upcoming;
    if (room <= 0) return;
    await this.fetchMore(Math.min(FETCH_BATCH_SIZE, room));
  }

  private async fetchMore(count = FETCH_BATCH_SIZE): Promise<void> {
    try {
      const result = await this.api.getPlaylist(this.deviceId, count);
      this.queue.push(...result.items);
      this.applyConfigVersion(result.configurationVersion);
      this.imageCache.prefetch(result.items.flatMap((p) => resolvePresentationUrls(p, this.resolveUrl)));
      this.recordSuccess();
      this.trimQueue();
    } catch (err) {
      console.error('Playlist fetch failed', err);
      this.recordFailure();
    }
  }

  next(): void {
    if (this.index < this.queue.length - 1) {
      this.index += 1;
      this.showCurrent();
      return;
    }
    // Disconnected-behaviour policy (§5.10): once genuinely exhausted
    // while offline, CONTINUE_QUEUE/REPEAT_QUEUE loop the cached queue
    // rather than stalling; FREEZE (handled in recordFailure) already
    // stopped auto-advancing before this point was ever reached.
    if (this.offline && this.disconnectedBehavior !== 'FREEZE' && this.queue.length > 0) {
      this.index = 0;
      this.showCurrent();
    }
  }

  previous(): void {
    if (this.index > 0) {
      this.index -= 1;
      this.showCurrent();
    }
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.renderer.clearTimer();
    this.showCurrent();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.showCurrent();
  }
}
