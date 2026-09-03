import { PresentationRenderer } from '../render/PresentationRenderer';
import type { MemoriesApiClient } from '../api/MemoriesApiClient';
import type { Presentation } from '../api/types';

const FETCH_BATCH_SIZE = 5;
// Fetch more once we're this close to the end of the locally-held queue.
const REFILL_THRESHOLD = 2;
// If the queue comes back empty (e.g. a config PUT's queue regeneration
// still in flight — genuinely observed racing against a TV poll in Phase
// 3 testing), retry fast for a while first, on the assumption that's
// what's happening.
const EMPTY_QUEUE_FAST_RETRY_MS = 3000;
const EMPTY_QUEUE_FAST_RETRY_ATTEMPTS = 10;
// After that, an empty queue more likely means "paired but not
// configured yet" (a completely normal state — pairing and configuring
// are two separate dashboard steps, §5.9 then §4.2) rather than a
// transient race. Keep retrying, just gently, forever — there's no
// version of "give up permanently" that's ever correct for an always-on
// display: it would mean a TV paired before its album was configured
// never recovers even after someone *does* configure it, with no way to
// notice short of restarting the app. Caught on real hardware in Phase 6
// testing (paired via the dashboard, configured moments later, TV never
// picked it up).
const EMPTY_QUEUE_SLOW_RETRY_MS = 20_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Owns the local in-memory queue and current position; the actual
// materialized queue/ordering lives server-side (§6 — TV owns only
// rendering, local cache, and the current playback timer).
export class PlaybackController {
  private queue: Presentation[] = [];
  private index = -1;
  private paused = false;
  private renderer: PresentationRenderer;
  private onStatusChange: ((status: string) => void) | null = null;

  constructor(
    private readonly api: MemoriesApiClient,
    private readonly deviceId: string,
    container: HTMLElement,
  ) {
    this.renderer = new PresentationRenderer(container, (url) => this.api.resolveAssetUrl(url));
    this.renderer.setOnAdvance(() => this.next());
  }

  setOnStatusChange(callback: (status: string) => void): void {
    this.onStatusChange = callback;
  }

  get isPaused(): boolean {
    return this.paused;
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
      await sleep(attempt <= EMPTY_QUEUE_FAST_RETRY_ATTEMPTS ? EMPTY_QUEUE_FAST_RETRY_MS : EMPTY_QUEUE_SLOW_RETRY_MS);
    }
    this.index = 0;
    this.showCurrent();
  }

  private showCurrent(): void {
    const presentation = this.queue[this.index];
    if (!presentation) {
      this.onStatusChange?.('no playlist available — is an album configured for this TV?');
      return;
    }

    this.renderer.render(presentation, !this.paused);
    const filenames = presentation.assets
      .map((asset) => asset.metadata.filename)
      .filter((name): name is string => typeof name === 'string')
      .join(' + ');
    this.onStatusChange?.(
      `item ${this.index + 1}/${this.queue.length} · ${presentation.layout.type} · ${filenames}${
        this.paused ? ' · PAUSED' : ''
      }`,
    );
    void this.maybeFetchMore();
  }

  private async maybeFetchMore(): Promise<void> {
    if (this.index >= this.queue.length - REFILL_THRESHOLD) {
      await this.fetchMore();
    }
  }

  private async fetchMore(): Promise<void> {
    try {
      const result = await this.api.getPlaylist(this.deviceId, FETCH_BATCH_SIZE);
      this.queue.push(...result.items);
    } catch (err) {
      console.error('Playlist fetch failed', err);
    }
  }

  next(): void {
    if (this.index < this.queue.length - 1) {
      this.index += 1;
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
