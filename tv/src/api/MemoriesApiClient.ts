import type { PairingResponse, PlaylistResponse, RemoteCommand } from './types';

// The TV never talks to Immich, and never sees its credentials — this is
// the only backend it ever calls (PROJECT.md §6).
export class MemoriesApiClient {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async requestPairing(deviceId: string): Promise<PairingResponse> {
    const res = await fetch(this.url('/api/v1/tvs/pairing'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) throw new Error(`Pairing request failed: ${res.status}`);
    return res.json();
  }

  async getPlaylist(deviceId: string, count = 5): Promise<PlaylistResponse> {
    const res = await fetch(this.url(`/api/v1/tvs/${deviceId}/playlist?count=${count}`));
    if (!res.ok) throw new Error(`Playlist request failed: ${res.status}`);
    return res.json();
  }

  async sendHeartbeat(deviceId: string): Promise<void> {
    await fetch(this.url(`/api/v1/tvs/${deviceId}/heartbeat`), { method: 'POST' }).catch(() => {
      // Best-effort — a missed heartbeat isn't fatal (PROJECT.md §5.10
      // disconnected-behaviour policies land in Phase 7).
    });
  }

  async pollCommands(deviceId: string): Promise<RemoteCommand[]> {
    const res = await fetch(this.url(`/api/v1/tvs/${deviceId}/commands`));
    if (!res.ok) return [];
    return res.json();
  }

  // Playlist asset URLs are relative (server-provided, resolved against
  // this same API base) so the TV never needs to know about Immich.
  resolveAssetUrl(relativeUrl: string): string {
    return this.url(relativeUrl);
  }
}
