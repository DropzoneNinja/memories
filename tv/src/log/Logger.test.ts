import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Logger } from './Logger.js';

test('recent() returns entries oldest-to-newest, capped at the requested limit', () => {
  const logger = new Logger('debug');
  logger.info('one');
  logger.warn('two');
  logger.error('three');

  const all = logger.recent(10);
  assert.deepEqual(
    all.map((e) => e.event),
    ['one', 'two', 'three'],
  );

  const capped = logger.recent(2);
  assert.deepEqual(
    capped.map((e) => e.event),
    ['two', 'three'],
  );
});

test('every entry lands in the ring buffer regardless of the display level', () => {
  const logger = new Logger('error'); // quiet — only 'error' would print
  logger.debug('noisy-debug');
  logger.info('noisy-info');

  assert.deepEqual(
    logger.recent().map((e) => e.event),
    ['noisy-debug', 'noisy-info'],
  );
});

test('the ring buffer is bounded — old entries fall off rather than growing forever', () => {
  const logger = new Logger('debug');
  for (let i = 0; i < 500; i++) logger.debug(`event-${i}`);

  const all = logger.recent(1000);
  assert.ok(all.length <= 200, `ring buffer should be capped, got ${all.length} entries`);
  assert.equal(all[all.length - 1].event, 'event-499', 'the most recent entry must survive eviction');
});

test('lastProblem() finds the most recent warn/error, ignoring info/debug noise after it', () => {
  const logger = new Logger('debug');
  logger.info('startup');
  logger.error('immich unreachable');
  logger.info('heartbeat ok');

  const problem = logger.lastProblem();
  assert.equal(problem?.event, 'immich unreachable');
});

test('lastProblem() returns null when nothing has ever gone wrong', () => {
  const logger = new Logger('debug');
  logger.info('startup');
  logger.debug('tick');

  assert.equal(logger.lastProblem(), null);
});

test('fields are preserved on the entry for structured inspection', () => {
  const logger = new Logger('debug');
  logger.warn('playlist fetch failed', { deviceId: 'abc', status: 503 });

  const [entry] = logger.recent();
  assert.deepEqual(entry.fields, { deviceId: 'abc', status: 503 });
});
