import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlanningWriteQueue } from './planning-write-queue.ts';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test('skrivkön låter första skrivningen slutföras före nästa', async () => {
  const queue = new PlanningWriteQueue();
  const gate = deferred();
  const events = [];
  const first = queue.run(async () => { events.push('start1'); await gate.promise; events.push('slut1'); });
  const second = queue.run(async () => { events.push('start2'); });
  await Promise.resolve();
  assert.deepEqual(events, ['start1']);
  gate.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['start1', 'slut1', 'start2']);
});

test('skrivfel stoppar redan köade uppgifter och en tömd kö kan användas igen', async () => {
  const queue = new PlanningWriteQueue();
  let writes = 0;
  const error = new Error('Syntetiskt skrivfel');
  const first = queue.run(async () => { throw error; });
  const second = queue.run(async () => { writes++; });
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every(r => r.status === 'rejected' && r.reason === error));
  assert.equal(writes, 0);
  await queue.run(async () => { writes++; });
  assert.equal(writes, 1);
});

test('olika köer blockerar inte varandra', async () => {
  const gate = deferred();
  const first = new PlanningWriteQueue().run(() => gate.promise);
  let done = false;
  await new PlanningWriteQueue().run(async () => { done = true; });
  assert.equal(done, true);
  gate.resolve();
  await first;
});
