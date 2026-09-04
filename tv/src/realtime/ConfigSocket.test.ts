import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigSocket, wsUrlFor, type SocketLike } from './ConfigSocket.js';

class FakeSocket implements SocketLike {
  listeners = new Map<string, ((event: { data: unknown }) => void)[]>();
  closed = false;

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: string, data: unknown = undefined): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  close(): void {
    this.closed = true;
  }
}

test('wsUrlFor derives a ws(s) URL from an http(s) API base', () => {
  assert.equal(wsUrlFor('http://localhost:4000', 'dev-1'), 'ws://localhost:4000/api/v1/tvs/dev-1/ws');
  assert.equal(wsUrlFor('https://api.example.com/', 'dev-2'), 'wss://api.example.com/api/v1/tvs/dev-2/ws');
});

test('a config-changed message invokes the callback with the version', () => {
  const sockets: FakeSocket[] = [];
  let received: number | null = null;

  const socket = new ConfigSocket({
    url: 'ws://test',
    onConfigChanged: (v) => {
      received = v;
    },
    socketCtor: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  socket.connect();
  sockets[0].emit('message', JSON.stringify({ type: 'config-changed', configurationVersion: 7 }));

  assert.equal(received, 7);
});

test('a malformed or irrelevant message is silently ignored', () => {
  const sockets: FakeSocket[] = [];
  let calls = 0;

  const socket = new ConfigSocket({
    url: 'ws://test',
    onConfigChanged: () => {
      calls += 1;
    },
    socketCtor: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  socket.connect();
  sockets[0].emit('message', 'not json');
  sockets[0].emit('message', JSON.stringify({ type: 'something-else' }));
  sockets[0].emit('message', JSON.stringify({ type: 'config-changed', configurationVersion: 'nope' }));

  assert.equal(calls, 0);
});

test('on close, reconnects with growing backoff delays, resetting on a successful open', () => {
  const sockets: FakeSocket[] = [];
  const scheduled: { delayMs: number; run: () => void }[] = [];

  const socket = new ConfigSocket({
    url: 'ws://test',
    onConfigChanged: () => {},
    backoff: { baseMs: 1000, capMs: 30_000 },
    scheduleReconnect: (run, delayMs) => {
      scheduled.push({ delayMs, run });
    },
    socketCtor: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  socket.connect();
  sockets[0].emit('close');
  assert.equal(scheduled[0].delayMs, 1000);

  scheduled[0].run(); // reconnect attempt 1
  sockets[1].emit('close');
  assert.equal(scheduled[1].delayMs, 2000, 'second consecutive failure should back off further');

  scheduled[1].run(); // reconnect attempt 2
  sockets[2].emit('open'); // this one succeeds — resets the attempt counter
  sockets[2].emit('close');
  assert.equal(scheduled[2].delayMs, 1000, 'a successful open should reset backoff to the base delay');
});

test('stop() prevents any further reconnect attempts', () => {
  const sockets: FakeSocket[] = [];
  let scheduleCalls = 0;

  const socket = new ConfigSocket({
    url: 'ws://test',
    onConfigChanged: () => {},
    scheduleReconnect: () => {
      scheduleCalls += 1;
    },
    socketCtor: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  });

  socket.connect();
  socket.stop();
  assert.equal(sockets[0].closed, true);

  sockets[0].emit('close');
  assert.equal(scheduleCalls, 0, 'stop() must suppress reconnect scheduling');
});

test('when WebSocket is unavailable (socketCtor: null), the socket is unsupported and connect() is a safe no-op', () => {
  let scheduleCalls = 0;
  const socket = new ConfigSocket({
    url: 'ws://test',
    onConfigChanged: () => {},
    socketCtor: null,
    scheduleReconnect: () => {
      scheduleCalls += 1;
    },
  });

  assert.equal(socket.supported, false);
  assert.doesNotThrow(() => socket.connect());
  assert.equal(scheduleCalls, 0);
});
