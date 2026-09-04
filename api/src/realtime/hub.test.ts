import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribe, unsubscribe, notifyConfigChanged, subscriberCount, type Socket } from './hub.js';

function fakeSocket(readyState = 1): Socket & { sent: string[] } {
  const sent: string[] = [];
  return {
    readyState,
    sent,
    send(data: string) {
      sent.push(data);
    },
  };
}

test('notifyConfigChanged sends to every subscribed open socket for that device', () => {
  const a = fakeSocket();
  const b = fakeSocket();
  subscribe('device-1', a);
  subscribe('device-1', b);

  notifyConfigChanged('device-1', 5);

  assert.equal(a.sent.length, 1);
  assert.equal(b.sent.length, 1);
  assert.deepEqual(JSON.parse(a.sent[0]), { type: 'config-changed', configurationVersion: 5 });

  unsubscribe('device-1', a);
  unsubscribe('device-1', b);
});

test('notifyConfigChanged never reaches a socket subscribed under a different device', () => {
  const a = fakeSocket();
  subscribe('device-1', a);

  notifyConfigChanged('device-2', 1);

  assert.equal(a.sent.length, 0);
  unsubscribe('device-1', a);
});

test('a socket that is not OPEN is skipped, not sent to', () => {
  const closed = fakeSocket(3); // WebSocket.CLOSED
  subscribe('device-1', closed);

  notifyConfigChanged('device-1', 1);

  assert.equal(closed.sent.length, 0);
  unsubscribe('device-1', closed);
});

test('unsubscribe removes exactly that socket, leaving others subscribed', () => {
  const a = fakeSocket();
  const b = fakeSocket();
  subscribe('device-1', a);
  subscribe('device-1', b);
  assert.equal(subscriberCount('device-1'), 2);

  unsubscribe('device-1', a);
  assert.equal(subscriberCount('device-1'), 1);

  notifyConfigChanged('device-1', 9);
  assert.equal(a.sent.length, 0);
  assert.equal(b.sent.length, 1);

  unsubscribe('device-1', b);
  assert.equal(subscriberCount('device-1'), 0);
});

test('notifyConfigChanged on a device with no subscribers is a silent no-op', () => {
  assert.doesNotThrow(() => notifyConfigChanged('nobody-listening', 1));
});

test('a socket whose send() throws does not prevent delivery to other sockets', () => {
  const broken: Socket = {
    readyState: 1,
    send() {
      throw new Error('socket closed mid-send');
    },
  };
  const healthy = fakeSocket();
  subscribe('device-1', broken);
  subscribe('device-1', healthy);

  assert.doesNotThrow(() => notifyConfigChanged('device-1', 2));
  assert.equal(healthy.sent.length, 1);

  unsubscribe('device-1', broken);
  unsubscribe('device-1', healthy);
});
