import { PresentationRenderer } from '../render/PresentationRenderer';
import type { MemoriesApiClient } from '../api/MemoriesApiClient';
import type { Presentation } from '../api/types';

const FETCH_BATCH_SIZE = 5;
// Fetch more once we're this close to the end of the locally-held queue.
const REFILL_THRESHOLD = 2;
// If the queue comes back empty (e.g. a config PUT's queue regeneration
// is still in flight — genuinely observed racing against a TV poll in
// Phase 3 testing), retry rather than silently stalling forever.
const EMPTY_QUEUE_RETRY_MS = 3000;
const EMPTY_QUEUE_MAX_ATTEMPTS = 10;

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

  async start(): Promise<void> {
    for (let attempt = 1; attempt <= EMPTY_QUEUE_MAX_ATTEMPTS; attempt++) {
      await this.fetchMore();
      if (this.queue.length > 0) break;
      this.onStatusChange?.(`waiting for playlist… (${attempt}/${EMPTY_QUEUE_MAX_ATTEMPTS})`);
      await sleep(EMPTY_QUEUE_RETRY_MS);
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
