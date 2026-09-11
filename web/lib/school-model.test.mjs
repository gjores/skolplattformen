import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closureReasons, initialTasks, weekDates } from './school-model.ts';

test('ett besvarat meddelande kan inte ersätta uppföljningens uppgifter', () => {
  assert.equal(
    closureReasons(initialTasks, 'Dokumenterad avslutsgrund').length,
    1,
  );
});
test('slutförda uppgifter utan dokumenterad grund räcker inte för avslut', () => {
  const tasks = initialTasks.map((t) => ({ ...t, done: true }));
  assert.equal(closureReasons(tasks, '  ').length, 1);
  assert.deepEqual(
    closureReasons(tasks, 'Uppföljt; fortsatt ansvar dokumenterat.'),
    [],
  );
});
test('varje kvarstående uppgift hindrar avslut', () => {
  for (const task of initialTasks) {
    const tasks = initialTasks.map((t) => ({ ...t, done: t.id !== task.id }));
    assert.equal(closureReasons(tasks, 'Grund finns').length, 1);
  }
});
test('veckonavigation går över månads- och årsskifte utan tidszonsförskjutning', () => {
  assert.equal(weekDates(0)[0].toISOString(), '2026-08-31T00:00:00.000Z');
  assert.equal(weekDates(1)[4].toISOString(), '2026-09-11T00:00:00.000Z');
  assert.equal(weekDates(18)[4].toISOString(), '2027-01-08T00:00:00.000Z');
  assert.equal(weekDates(-1)[0].getUTCDay(), 1);
});
