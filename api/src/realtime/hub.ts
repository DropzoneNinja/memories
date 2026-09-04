// In-memory WebSocket subscription registry for TV config-change push
// (PROJECT.md §5.10, Phase 7). Deliberately a plain in-process Map, not a
// pub-sub broker — this is a single-instance household deployment (§10:
// Docker Compose only), so there's no multi-instance fan-out problem to
// solve. This is purely a *push optimization*: the TV's heartbeat response
// (routes/tvs.ts) is the guaranteed fallback that makes correctness never
// depend on a socket actually being connected.
//
// `Socket` is a minimal structural type (not `ws`'s own type) so this
// module stays trivially unit-testable with plain fake objects and has no
// dependency of its own.
export interface Socket {
  readyState: number;
  send(data: string): void;
}

const OPEN = 1; // WebSocket.OPEN, same value across every WS implementation

const subscribers = new Map<string, Set<Socket>>();

export function subscribe(deviceId: string, socket: Socket): void {
  let sockets = subscribers.get(deviceId);
  if (!sockets) {
    sockets = new Set();
    subscribers.set(deviceId, sockets);
  }
  sockets.add(socket);
}

export function unsubscribe(deviceId: string, socket: Socket): void {
  const sockets = subscribers.get(deviceId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) subscribers.delete(deviceId);
}

// Best-effort: a dead/closing socket is silently skipped rather than
// thrown on — this must never be allowed to fail a config save (the
// heartbeat fallback covers it regardless).
export function notifyConfigChanged(deviceId: string, configurationVersion: number): void {
  const sockets = subscribers.get(deviceId);
  if (!sockets || sockets.size === 0) return;

  const message = JSON.stringify({ type: 'config-changed', configurationVersion });
  for (const socket of sockets) {
    if (socket.readyState !== OPEN) continue;
    try {
      socket.send(message);
    } catch {
      // Ignore — the TV's heartbeat-based polling fallback will still
      // pick up the change.
    }
  }
}

// Test-only: number of currently-subscribed sockets for a device.
export function subscriberCount(deviceId: string): number {
  return subscribers.get(deviceId)?.size ?? 0;
}
