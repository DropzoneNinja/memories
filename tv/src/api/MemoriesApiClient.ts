import type { HeartbeatResponse, PairingResponse, PlaylistResponse, RemoteCommand } from './types';

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

  // `status` lets Memories Web show "currently displaying" + EXIF (§4.2,
  // Phase 6) — distinct from the playlist hand-out cursor, which runs
  // ahead of what's actually on screen. The response is also
  // PlaybackController's guaranteed fallback for learning about a config
  // change (Phase 7, §5.10) — `null` means a genuine network-level
  // failure (never thrown; a missed heartbeat is never fatal), which
  // PlaybackController.applyServerStatus treats as an offline signal.
  async sendHeartbeat(
    deviceId: string,
    status?: { presentationId: string; paused: boolean },
  ): Promise<HeartbeatResponse | null> {
    try {
      const res = await fetch(this.url(`/api/v1/tvs/${deviceId}/heartbeat`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status ?? {}),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
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
