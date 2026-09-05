// In-memory, byte-bounded, LRU-evicting image cache (PROJECT.md §5.8,
// §9.2, §9.5 — "bounded, sensible local cache... never let it consume
// unlimited storage", "release image resources promptly"). Fetches each
// image once as a Blob and serves it back out as an object URL, so
// <img src> never re-hits the network for something already shown, and
// eviction can `URL.revokeObjectURL()` to release decoded memory promptly.
//
// Deliberately *not* backed by a Tizen-specific storage API or the
// browser's Cache Storage API: TizenAdapter exposes no filesystem/storage
// surface today, and either option would need a new, unverified Tizen
// manifest privilege. Plain Blobs need none, work identically in the
// browser-dev fallback (project convention), and don't need to survive an
// app restart to satisfy §5.8's actual goal — riding out an outage
// *during* a run, not a cold restart.
//
// `B` (the blob shape) and the fetch/create/revoke functions are generic
// and injectable purely for unit testing without a real browser — in
// production every default is the real global.
import { log } from '../log/Logger.js';

export interface FetchLikeResponse<B> {
  ok: boolean;
  status: number;
  blob(): Promise<B>;
}

export type FetchLike<B> = (url: string) => Promise<FetchLikeResponse<B>>;

export interface ImageCacheOptions<B extends { size: number }> {
  fetchFn: FetchLike<B>;
  createObjectUrl: (blob: B) => string;
  revokeObjectUrl: (url: string) => void;
  ceilingBytes?: number;
  now?: () => number;
}

interface CacheEntry {
  objectUrl: string;
  size: number;
  lastUsed: number;
}

export const DEFAULT_CEILING_BYTES = 200 * 1024 * 1024; // ~200MB soft ceiling (§5.8)

export class ImageCache<B extends { size: number } = Blob> {
  private entries = new Map<string, CacheEntry>();
  private readonly fetchFn: FetchLike<B>;
  private readonly createObjectUrl: (blob: B) => string;
  private readonly revokeObjectUrl: (url: string) => void;
  private readonly ceilingBytes: number;
  private readonly now: () => number;

  constructor(options: ImageCacheOptions<B>) {
    this.fetchFn = options.fetchFn;
    this.createObjectUrl = options.createObjectUrl;
    this.revokeObjectUrl = options.revokeObjectUrl;
    this.ceilingBytes = options.ceilingBytes ?? DEFAULT_CEILING_BYTES;
    this.now = options.now ?? (() => Date.now());
  }

  // Returns a locally-served object URL for `url`, fetching+storing it on
  // a cache miss. Marks the entry as just-used either way, for LRU.
  async get(url: string): Promise<string> {
    const existing = this.entries.get(url);
    if (existing) {
      existing.lastUsed = this.now();
      return existing.objectUrl;
    }

    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`ImageCache: fetch failed for ${url} (${res.status})`);
    const blob = await res.blob();
    const objectUrl = this.createObjectUrl(blob);
    this.entries.set(url, { objectUrl, size: blob.size, lastUsed: this.now() });
    return objectUrl;
  }

  // Fire-and-forget prefetch for images not needed *right now* but coming
  // up soon — failures are swallowed, since a failed prefetch just means a
  // later get() retries it when actually needed to render.
  prefetch(urls: string[]): void {
    for (const url of urls) {
      if (this.entries.has(url)) continue;
      void this.get(url).catch(() => {});
    }
  }

  has(url: string): boolean {
    return this.entries.has(url);
  }

  size(): number {
    return this.entries.size;
  }

  totalBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.size;
    return total;
  }

  // Evicts least-recently-used entries until under the byte ceiling, never
  // touching anything whose URL is in `keepUrls` — the currently-queued
  // set (PlaybackController) — so something still needed for imminent
  // playback is never released out from under it.
  evictToFit(keepUrls: ReadonlySet<string>): void {
    if (this.totalBytes() <= this.ceilingBytes) return;

    const bytesBefore = this.totalBytes();
    const evictable = [...this.entries.entries()]
      .filter(([url]) => !keepUrls.has(url))
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    let evicted = 0;
    for (const [url, entry] of evictable) {
      if (this.totalBytes() <= this.ceilingBytes) break;
      this.entries.delete(url);
      this.revokeObjectUrl(entry.objectUrl);
      evicted += 1;
    }

    if (evicted > 0) {
      log.debug('cache evicted', { evicted, bytesBefore, bytesAfter: this.totalBytes(), remaining: this.entries.size });
    }
  }
}

// Production default: the real browser fetch/Blob/URL globals.
export function createImageCache(): ImageCache<Blob> {
  return new ImageCache<Blob>({
    fetchFn: (url) => fetch(url),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  });
}
