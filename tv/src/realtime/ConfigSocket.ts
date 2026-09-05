// Push channel client (PROJECT.md §5.10, Phase 7) — connects to the API's
// `/tvs/:deviceId/ws` endpoint and calls back on a `config-changed`
// message, so a dashboard save can take effect within a second or two
// instead of waiting for the next heartbeat/refill. Purely an
// optimization: `PlaybackController.applyServerStatus` (fed by the
// heartbeat response, tv/src/main.ts) is the guaranteed fallback, so this
// class degrades to doing nothing at all — never throwing, never blocking
// startup — if `WebSocket` isn't available on this Tizen firmware
// (feature-detected, matching the project's existing
// `crypto.randomUUID` fallback convention in device/DeviceId.ts) or if the
// connection can't be established.
import { nextDelay, type BackoffOptions } from '../net/backoff.js';
import { log } from '../log/Logger.js';

// Minimal structural shape this class needs from a WebSocket — lets tests
// inject a fake without depending on a real `WebSocket` global existing.
// One non-overloaded signature (rather than per-event-type overloads) so a
// plain test fake can implement it without fighting TS overload matching —
// `event` is simply unused for open/close/error listeners.
export interface SocketLike {
  addEventListener(type: 'open' | 'close' | 'error' | 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

export type SocketCtor = (url: string) => SocketLike;

const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 2000, capMs: 30_000 };

export interface ConfigSocketOptions {
  url: string;
  onConfigChanged: (configurationVersion: number) => void;
  // Defaults to the real global `WebSocket`, wrapped as a SocketCtor; pass
  // `null` to force the feature-detected-absent path even where a real
  // WebSocket exists (used by tests, and reflects an actual Tizen firmware
  // that lacks it).
  socketCtor?: SocketCtor | null;
  backoff?: BackoffOptions;
  scheduleReconnect?: (run: () => void, delayMs: number) => void;
}

function defaultSocketCtor(): SocketCtor | null {
  const ctor = (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
  if (!ctor) return null;
  return (url: string) => new ctor(url);
}

export class ConfigSocket {
  private readonly url: string;
  private readonly onConfigChanged: (configurationVersion: number) => void;
  private readonly socketCtor: SocketCtor | null;
  private readonly backoff: BackoffOptions;
  private readonly scheduleReconnect: (run: () => void, delayMs: number) => void;
  private socket: SocketLike | null = null;
  private attempt = 0;
  private stopped = false;

  constructor(options: ConfigSocketOptions) {
    this.url = options.url;
    this.onConfigChanged = options.onConfigChanged;
    this.socketCtor = options.socketCtor !== undefined ? options.socketCtor : defaultSocketCtor();
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
    this.scheduleReconnect = options.scheduleReconnect ?? ((run, ms) => setTimeout(run, ms));
  }

  get supported(): boolean {
    return this.socketCtor !== null;
  }

  connect(): void {
    if (this.stopped || !this.socketCtor) return;

    let socket: SocketLike;
    try {
      socket = this.socketCtor(this.url);
    } catch {
      this.retry();
      return;
    }

    socket.addEventListener('open', () => {
      if (this.attempt > 0) log.info('config push channel reconnected', { afterAttempts: this.attempt });
      this.attempt = 0;
    });
    socket.addEventListener('close', () => this.retry());
    socket.addEventListener('error', () => {
      // 'close' fires after 'error' for a real WebSocket — retry() is
      // scheduled there, not here, to avoid double-scheduling.
    });
    socket.addEventListener('message', (event) => {
      const parsed = this.parseConfigChanged(event.data);
      if (parsed !== null) this.onConfigChanged(parsed);
    });

    this.socket = socket;
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
  }

  private retry(): void {
    if (this.stopped) return;
    this.attempt += 1;
    const delay = nextDelay(this.attempt, this.backoff);
    // debug, not warn: the heartbeat is the guaranteed fallback (module
    // comment above) — a disconnected push channel alone is not a problem
    // worth surfacing on the diagnostics view's "last problem" line.
    log.debug('config push channel reconnecting', { attempt: this.attempt, delayMs: delay });
    this.scheduleReconnect(() => this.connect(), delay);
  }

  private parseConfigChanged(data: unknown): number | null {
    try {
      const msg = JSON.parse(String(data)) as { type?: unknown; configurationVersion?: unknown };
      if (msg.type === 'config-changed' && typeof msg.configurationVersion === 'number') {
        return msg.configurationVersion;
      }
    } catch {
      // Malformed message — ignore; the heartbeat fallback still applies.
    }
    return null;
  }
}

// Derives a ws(s):// URL for the config socket from the same HTTP(S) base
// URL the rest of MemoriesApiClient uses.
export function wsUrlFor(apiBaseUrl: string, deviceId: string): string {
  const wsBase = apiBaseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  return `${wsBase}/api/v1/tvs/${deviceId}/ws`;
}
