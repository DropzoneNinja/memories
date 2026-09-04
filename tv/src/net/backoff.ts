// Shared exponential-backoff helper (PROJECT.md §9.4, Phase 7) — used by
// the WebSocket reconnect and the playlist empty-queue retry, so there's
// one implementation of "how long to wait before trying again" instead of
// several hand-rolled schedules.
export interface BackoffOptions {
  baseMs: number;
  capMs: number;
}

// attempt is 1-based (the delay *before* this retry). Doubles each time,
// clamped to capMs — no jitter needed at this scale (a handful of clients
// on a household LAN, not a thundering-herd concern).
export function nextDelay(attempt: number, options: BackoffOptions): number {
  const { baseMs, capMs } = options;
  const raw = baseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(raw, capMs);
}
