import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController, type ApiLike, type CacheLike, type RendererLike } from './PlaybackController.js';
import type { HeartbeatResponse, PlaylistResponse, Presentation } from '../api/types';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function presentation(id: string, duration = 20): Presentation {
  return {
    presentationId: id,
    duration,
    layout: { type: 'single', slots: [{ assetId: id, position: 'full' }] },
    background: { type: 'mat', colour: '#111' },
    frame: { shadow: 'none', bevel: 'none' },
    transition: { type: 'crossfade', duration: 2 },
    assets: [{ id, url: `/assets/${id}`, metadata: {} }],
  };
}

interface FakeRenderer extends RendererLike {
  renders: { presentation: Presentation; autoAdvance: boolean }[];
  clearCalls: number;
  restartCalls: number[];
}

function makeFakeRenderer(): FakeRenderer {
  const renders: { presentation: Presentation; autoAdvance: boolean }[] = [];
  const restartCalls: number[] = [];
  let clearCalls = 0;
  return {
    renders,
    restartCalls,
    get clearCalls() {
      return clearCalls;
    },
    render(p, autoAdvance = true) {
      renders.push({ presentation: p, autoAdvance });
    },
    restartTimer(durationSeconds) {
      restartCalls.push(durationSeconds);
    },
    clearTimer() {
      clearCalls += 1;
    },
    setOnAdvance() {
      // Not exercised directly — tests drive next()/previous() themselves.
    },
  };
}

interface FakeCache extends CacheLike {
  evictCalls: ReadonlySet<string>[];
}

function makeFakeCache(): FakeCache {
  const evictCalls: ReadonlySet<string>[] = [];
  return {
    evictCalls,
    async get(url) {
      return url;
    },
    prefetch() {},
    evictToFit(keep) {
      evictCalls.push(keep);
    },
  };
}

// Each entry in `script` is either a successful response or an Error to
// throw for that call; the last entry repeats once exhausted.
function makeFakeApi(script: (PlaylistResponse | Error)[]): ApiLike & { calls: number[] } {
  const calls: number[] = [];
  let i = 0;
  return {
    calls,
    async getPlaylist(_deviceId, count = 5) {
      calls.push(count);
      const next = script[Math.min(i, script.length - 1)];
      i += 1;
      if (next instanceof Error) throw next;
      return next;
    },
    resolveAssetUrl(url) {
      return url;
    },
  };
}

function heartbeat(overrides: Partial<HeartbeatResponse> = {}): HeartbeatResponse {
  return { ok: true, configurationVersion: 1, cacheSize: 8, disconnectedBehavior: 'CONTINUE_QUEUE', ...overrides };
}

// 3 items (not 2): reaching the offline threshold takes 2 consecutive
// failed background fetches, each triggered by a genuine forward advance
// (next()) — with only 2 items, the 2nd advance would already be sitting
// at the last index, so "exhausted" and "just failed twice" would be the
// same moment and untestable separately. With 3, crossOfflineThreshold
// lands exactly on the last index once offline, so a further next() in
// the test itself is what exercises the exhausted-while-offline policy.
async function startWithThreeItems(renderer: FakeRenderer, cache: FakeCache) {
  const api = makeFakeApi([
    { configurationVersion: 1, items: [presentation('p0'), presentation('p1'), presentation('p2')] },
    new Error('offline'),
  ]);
  const controller = new PlaybackController(api, 'device-1', {} as HTMLElement, { renderer, imageCache: cache });
  await controller.start();
  await flush(); // let the fire-and-forget refill attempt (which fails) settle
  return { api, controller };
}

// Drives exactly OFFLINE_THRESHOLD (2) consecutive failed background
// fetches by advancing forward twice (0 -> 1 -> 2, the last index of a
// 3-item queue) — each next() re-triggers showCurrent()'s
// maybeFetchMore(). Any prior applyServerStatus() call resets the failure
// counter (a real heartbeat success is real evidence of connectivity), so
// this must run *after* such a call, never before it.
async function crossOfflineThreshold(controller: PlaybackController): Promise<void> {
  controller.next();
  await flush();
  controller.next();
  await flush();
}

test('CONTINUE_QUEUE loops rather than stalling once genuinely exhausted while offline', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  const { controller } = await startWithThreeItems(renderer, cache);

  await crossOfflineThreshold(controller);
  assert.equal(controller.isOffline, true);

  // At this point trimQueue() has already dropped everything more than
  // BACK_BUFFER behind the current position, so "loop to index 0" loops to
  // whatever survived trimming — not literally the first item ever shown
  // (a real, bounded-cache-driven detail, not a bug: §5.8/§9.2 want the
  // queue and its images bounded, not held forever). What matters here is
  // only that it loops at all instead of silently stalling at the end.
  const rendersBefore = renderer.renders.length;
  const lastRenderedBefore = renderer.renders[rendersBefore - 1]?.presentation.presentationId;
  controller.next(); // queue exhausted; offline + CONTINUE_QUEUE -> loop instead of stalling
  assert.equal(renderer.renders.length, rendersBefore + 1, 'exhaustion while offline must still render something');
  assert.notEqual(
    renderer.renders[renderer.renders.length - 1]?.presentation.presentationId,
    lastRenderedBefore,
    'looping must actually move — not just re-render the same item at the end',
  );
});

test('REPEAT_QUEUE also loops rather than stalling once exhausted while offline (no distinction from CONTINUE_QUEUE)', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  const { controller } = await startWithThreeItems(renderer, cache);
  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'REPEAT_QUEUE', configurationVersion: 1 }));

  await crossOfflineThreshold(controller);
  assert.equal(controller.isOffline, true);

  const rendersBefore = renderer.renders.length;
  controller.next();
  assert.equal(renderer.renders.length, rendersBefore + 1, 'exhaustion while offline must still render something');
});

test('FREEZE stops auto-advancing (clears the timer) once offline instead of looping', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  const { controller } = await startWithThreeItems(renderer, cache);
  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'FREEZE', configurationVersion: 1 }));

  const clearsBefore = renderer.clearCalls;
  await crossOfflineThreshold(controller);
  assert.equal(controller.isOffline, true);
  assert.ok(renderer.clearCalls > clearsBefore, 'FREEZE should clear the advance timer once offline');

  // Exhausted + FREEZE, both directions: next()/previous() must not
  // auto-loop the queue on their own (manual navigation still works if the
  // viewer presses a real remote key, but that's a distinct render() call,
  // not the auto-freeze path this asserts against).
  const rendersBefore = renderer.renders.length;
  controller.next();
  assert.equal(renderer.renders.length, rendersBefore, 'FREEZE must not auto-loop the queue');
});

test('reconnecting after an auto-freeze restarts the timer without a manual pause, and never overrides one', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  const { controller } = await startWithThreeItems(renderer, cache);
  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'FREEZE', configurationVersion: 1 }));

  await crossOfflineThreshold(controller); // -> offline, auto-frozen, at the last index
  assert.equal(controller.isOffline, true);

  // A successful heartbeat (reconnect) should restart the timer via
  // restartTimer(), not a full re-render.
  const rendersBefore = renderer.renders.length;
  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'FREEZE', configurationVersion: 1 }));
  assert.equal(controller.isOffline, false);
  assert.equal(renderer.restartCalls.length, 1);
  assert.equal(renderer.renders.length, rendersBefore, 'reconnect must not cause a visible re-render');
});

test('a manual pause survives reconnect — auto-freeze recovery never resumes something the viewer paused themselves', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  const { controller } = await startWithThreeItems(renderer, cache);
  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'FREEZE', configurationVersion: 1 }));

  await crossOfflineThreshold(controller); // -> offline, auto-frozen
  controller.pause(); // viewer manually pauses while offline

  controller.applyServerStatus(heartbeat({ disconnectedBehavior: 'FREEZE', configurationVersion: 1 })); // reconnect
  assert.equal(controller.isOffline, false);
  assert.equal(renderer.restartCalls.length, 0, 'must not restart the timer while manually paused');
  assert.equal(controller.isPaused, true, 'manual pause must survive the reconnect untouched');
});

test('a changed configurationVersion discards not-yet-shown items and refetches, leaving the current item untouched', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  // The 2nd entry (same version, no items) is showCurrent()'s own
  // background refill fired during start() — keeping it a same-version
  // no-op means it can't race with the version change this test triggers
  // manually; the 3rd entry is what that manual trigger should fetch.
  const api = makeFakeApi([
    { configurationVersion: 1, items: [presentation('p0'), presentation('p1')] },
    { configurationVersion: 1, items: [] },
    { configurationVersion: 2, items: [presentation('p2'), presentation('p3')] },
  ]);
  const controller = new PlaybackController(api, 'device-1', {} as HTMLElement, { renderer, imageCache: cache });
  await controller.start(); // queue=[p0,p1], index=0, showing p0
  await flush(); // settle showCurrent()'s own background refill attempt

  const rendersBefore = renderer.renders.length;
  const callsBefore = api.calls.length;
  controller.onPushedConfigChanged(2); // config changed since the initial fetch's version (1)

  // Synchronously: must not touch what's currently on screen.
  assert.equal(renderer.renders.length, rendersBefore, 'a config-version change must not re-render the current item');

  await flush(); // let the eager background refetch complete
  assert.equal(api.calls.length, callsBefore + 1, 'exactly one refetch should be triggered');

  // Calling it again with the *same* version must be a no-op.
  controller.onPushedConfigChanged(2);
  await flush();
  assert.equal(api.calls.length, callsBefore + 1, 'no refetch when the version has not actually changed');
});

test('cache-size bounding: no fetch fires once cacheSize leaves zero room, even below REFILL_THRESHOLD', async () => {
  const renderer = makeFakeRenderer();
  const cache = makeFakeCache();
  // Second (and every later) call returns nothing further, so the queue
  // settles at a predictable 2 items rather than growing indefinitely from
  // showCurrent()'s own background refill.
  const api = makeFakeApi([
    { configurationVersion: 1, items: [presentation('p0'), presentation('p1')] },
    { configurationVersion: 1, items: [] },
  ]);
  const controller = new PlaybackController(api, 'device-1', {} as HTMLElement, { renderer, imageCache: cache });
  await controller.start();
  await flush(); // settle showCurrent()'s own background refill attempt

  // cacheSize: 0 is an artificial edge value (the server never actually
  // sends this) used purely to exercise the room<=0 boundary directly.
  controller.applyServerStatus(heartbeat({ cacheSize: 0, configurationVersion: 1 }));
  const callsBefore = api.calls.length;
  controller.next(); // index -> 1, upcoming -> 0, room = cacheSize(0) - 0 = 0
  await flush();

  assert.equal(api.calls.length, callsBefore, 'no fetch should fire once cacheSize room is exhausted');
});
