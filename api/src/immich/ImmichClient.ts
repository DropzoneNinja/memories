import type { ImmichAlbum, ImmichAsset, ImmichThumbnailSize } from './types.js';

export interface ImmichClientOptions {
  baseUrl: string;
  apiKey: string;
}

// Immich mounts its REST API under /api (see the OpenAPI spec's
// `servers` field) and authenticates via the `x-api-key` header.
const ASSET_PAGE_SIZE = 250;

export class ImmichClient {
  private readonly apiBase: string;
  private readonly apiKey: string;

  constructor(options: ImmichClientOptions) {
    this.apiBase = `${options.baseUrl.replace(/\/+$/, '')}/api`;
    this.apiKey = options.apiKey;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-api-key': this.apiKey };
    if (init.body) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
    });

    if (!res.ok) {
      // Never include response headers/body verbatim in logs upstream of
      // this — Immich error bodies don't echo the API key, but keep the
      // habit (PROJECT.md §9.15).
      const body = await res.text().catch(() => '');
      throw new Error(`Immich API ${path} failed: ${res.status} ${res.statusText} ${body}`);
    }
    return res;
  }

  async listAlbums(): Promise<ImmichAlbum[]> {
    const res = await this.request('/albums');
    return (await res.json()) as ImmichAlbum[];
  }

  async getAlbum(albumId: string): Promise<ImmichAlbum> {
    const res = await this.request(`/albums/${albumId}`);
    return (await res.json()) as ImmichAlbum;
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
