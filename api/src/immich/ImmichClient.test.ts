// Unit tests for the request()/retry-with-backoff logic (Phase 7,
// PROJECT.md §9.4) — mocks the global `fetch` so no real Immich instance
// is needed; see ImmichClient.integration.test.ts for the real thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImmichClient } from './ImmichClient.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function withMockedFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

test('a network error is retried and succeeds once fetch recovers', async () => {
  let calls = 0;
  const delays: number[] = [];
  await withMockedFetch(
    async () => {
      calls += 1;
      if (calls < 3) throw new Error('ECONNREFUSED');
      return jsonResponse([]);
    },
    async () => {
      const client = new ImmichClient({
        baseUrl: 'http://immich.test',
        apiKey: 'key',
        delayFn: async (ms) => {
          delays.push(ms);
        },
      });
      const albums = await client.listAlbums();
      assert.deepEqual(albums, []);
    },
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1500]);
});

test('a 500 response is retried and succeeds once Immich recovers', async () => {
  let calls = 0;
  await withMockedFetch(
    async () => {
      calls += 1;
      if (calls < 2) return new Response('server error', { status: 503 });
      return jsonResponse([]);
    },
    async () => {
      const client = new ImmichClient({
        baseUrl: 'http://immich.test',
        apiKey: 'key',
        delayFn: async () => {},
      });
      await client.listAlbums();
    },
  );
  assert.equal(calls, 2);
});

test('a 404 is never retried — fails immediately after a single attempt', async () => {
  let calls = 0;
  await withMockedFetch(
    async () => {
      calls += 1;
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    },
    async () => {
      const client = new ImmichClient({
        baseUrl: 'http://immich.test',
        apiKey: 'key',
        delayFn: async () => {
          throw new Error('should never delay/retry a 4xx');
        },
      });
      await assert.rejects(() => client.listAlbums(), /404/);
    },
  );
  assert.equal(calls, 1);
});

test('fetchVideoStream forwards the Range header and returns the response with its body unconsumed', async () => {
  let capturedHeaders: HeadersInit | undefined;
  await withMockedFetch(
    async (_url, init) => {
      capturedHeaders = init?.headers;
      return new Response('fake video bytes', {
        status: 206,
        headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-15/1000' },
      });
    },
    async () => {
      const client = new ImmichClient({ baseUrl: 'http://immich.test', apiKey: 'key' });
      const res = await client.fetchVideoStream('asset-1', 'bytes=0-15');
      assert.equal(res.status, 206);
      assert.equal(res.headers.get('content-range'), 'bytes 0-15/1000');
      // Body must still be readable by the caller (routes/tvs.ts pipes it
      // straight through) — fetchVideoStream must never consume it itself.
      const body = await res.text();
      assert.equal(body, 'fake video bytes');
    },
  );
  assert.equal((capturedHeaders as Record<string, string>)?.Range, 'bytes=0-15');
});

test('fetchVideoStream omits the Range header when none is given', async () => {
  let capturedHeaders: HeadersInit | undefined;
  await withMockedFetch(
    async (_url, init) => {
      capturedHeaders = init?.headers;
      return new Response('ok', { status: 200 });
    },
    async () => {
      const client = new ImmichClient({ baseUrl: 'http://immich.test', apiKey: 'key' });
      await client.fetchVideoStream('asset-1');
    },
  );
  assert.equal((capturedHeaders as Record<string, string> | undefined)?.Range, undefined);
});

test('a persistent network failure throws after exhausting all attempts', async () => {
  let calls = 0;
  await withMockedFetch(
    async () => {
      calls += 1;
      throw new Error('ETIMEDOUT');
    },
    async () => {
      const client = new ImmichClient({
        baseUrl: 'http://immich.test',
        apiKey: 'key',
        delayFn: async () => {},
      });
      await assert.rejects(() => client.listAlbums(), /ETIMEDOUT/);
    },
  );
  assert.equal(calls, 3);
});
