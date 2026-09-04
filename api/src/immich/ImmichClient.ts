import type { ImmichAlbum, ImmichAsset, ImmichThumbnailSize } from './types.js';

export interface ImmichClientOptions {
  baseUrl: string;
  apiKey: string;
  // Test-only hook — overrides the delay between retries so tests don't
  // actually wait. Defaults to a real setTimeout-based sleep.
  delayFn?: (ms: number) => Promise<void>;
}

// Immich mounts its REST API under /api (see the OpenAPI spec's
// `servers` field) and authenticates via the `x-api-key` header.
const ASSET_PAGE_SIZE = 250;

// Retry/backoff for the API<->Immich link (PROJECT.md §9.4, Phase 7): a
// transient network blip or Immich 5xx during a config save shouldn't fail
// the whole `regenerateQueue`. Never retries a 4xx — a bad request or auth
// failure won't fix itself on a retry.
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ImmichClient {
  private readonly apiBase: string;
  private readonly apiKey: string;
  private readonly delay: (ms: number) => Promise<void>;

  constructor(options: ImmichClientOptions) {
    this.apiBase = `${options.baseUrl.replace(/\/+$/, '')}/api`;
    this.apiKey = options.apiKey;
    this.delay = options.delayFn ?? defaultDelay;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-api-key': this.apiKey };
    if (init.body) headers['Content-Type'] = 'application/json';

    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${this.apiBase}${path}`, {
          ...init,
          headers: { ...headers, ...init.headers },
        });
      } catch (err) {
        // Network-level failure (DNS, connection refused, timeout) —
        // retryable, same as a 5xx.
        if (attempt >= MAX_ATTEMPTS) throw err;
        await this.delay(RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }

      if (res.ok) return res;

      if (res.status >= 500 && attempt < MAX_ATTEMPTS) {
        await this.delay(RETRY_DELAYS_MS[attempt - 1]);
        continue;
      }

      // Never include response headers/body verbatim in logs upstream of
      // this — Immich error bodies don't echo the API key, but keep the
      // habit (PROJECT.md §9.15).
      const body = await res.text().catch(() => '');
      throw new Error(`Immich API ${path} failed: ${res.status} ${res.statusText} ${body}`);
    }
  }

  async listAlbums(): Promise<ImmichAlbum[]> {
    const res = await this.request('/albums');
    return (await res.json()) as ImmichAlbum[];
  }

  async getAlbum(albumId: string): Promise<ImmichAlbum> {
    const res = await this.request(`/albums/${albumId}`);
    return (await res.json()) as ImmichAlbum;
  }

  // Single-asset lookup — used only for the dashboard's on-demand
  // location map (Phase 6), not the TV/playlist pipeline (which already
  // has EXIF in bulk from listAlbumAssets). Verified against the real
  // instance: `GET /assets/{id}` returns the same exifInfo shape,
  // including latitude/longitude/city/state/country.
  async getAsset(assetId: string): Promise<ImmichAsset> {
    const res = await this.request(`/assets/${assetId}`);
    return (await res.json()) as ImmichAsset;
  }

  // NOTE: `/search/metadata` with `albumIds` was marked deprecated in the
  // Immich API as of v3.2.0 in favour of the columnar `/timeline/bucket`
  // endpoint — but that endpoint returns struct-of-arrays data designed
  // for timeline scrolling, not curated-album fetching, and is
  // meaningfully more awkward to consume correctly. Using the
  // still-functional `/search/metadata` for now; revisit if Immich
  // actually removes it.
  async listAlbumAssets(albumId: string): Promise<ImmichAsset[]> {
    const assets: ImmichAsset[] = [];
    let page: number | null = 1;

    while (page !== null) {
      const res = await this.request('/search/metadata', {
        method: 'POST',
        body: JSON.stringify({
          albumIds: [albumId],
          page,
          size: ASSET_PAGE_SIZE,
          withExif: true,
        }),
      });
      const data = (await res.json()) as {
        assets: { items: ImmichAsset[]; nextPage: string | null };
      };
      assets.push(...data.assets.items);
      page = data.assets.nextPage ? Number(data.assets.nextPage) : null;
    }

    return assets;
  }

  async fetchThumbnail(
    assetId: string,
    size: ImmichThumbnailSize = 'preview',
  ): Promise<{ body: ArrayBuffer; contentType: string }> {
    const res = await this.request(`/assets/${assetId}/thumbnail?size=${size}`);
    const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
    const body = await res.arrayBuffer();
    return { body, contentType };
  }
}
