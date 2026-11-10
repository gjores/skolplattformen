import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lasarOps } from './lasar-ops.ts';
import { proposeSchoolYear } from './lasar-model.ts';

const UNIT = '51a50000-0000-4000-8000-000000000003';
const base = () => proposeSchoolYear(2026, UNIT, ['GR']);
const withExceptions = (sy, exceptions) => ({ ...sy, exceptions });

test('en lovdag blir ett set_days med datum och slag', () => {
  const before = base();
  const after = withExceptions(before, { ...before.exceptions, '2026-10-07': { kind: 'lovdag' } });
  assert.deepEqual(lasarOps(before, after), [{ op: 'set_days', dates: ['2026-10-07'], kind: 'lovdag' }]);
});

test('flera dagar grupperas per slag och anteckning i datumordning', () => {
  const before = base();
  const after = withExceptions(before, {
    ...before.exceptions,
    '2026-10-09': { kind: 'studiedag', note: 'Fortbildning' },
    '2026-10-07': { kind: 'studiedag', note: 'Fortbildning' },
    '2026-10-08': { kind: 'lovdag' },
    '2026-11-12': { kind: 'studiedag', note: 'Bedömning' },
  });
  assert.deepEqual(lasarOps(before, after), [
    { op: 'set_days', dates: ['2026-10-08'], kind: 'lovdag' },
    { op: 'set_days', dates: ['2026-11-12'], kind: 'studiedag', note: 'Bedömning' },
    { op: 'set_days', dates: ['2026-10-07', '2026-10-09'], kind: 'studiedag', note: 'Fortbildning' },
  ]);
});

test('en återställd skoldag tar bort undantaget utan anteckning', () => {
  const before = base();
  const [date] = Object.keys(before.exceptions).sort();
  const exceptions = { ...before.exceptions };
  delete exceptions[date];
  const ops = lasarOps(before, withExceptions(before, exceptions));
  assert.deepEqual(ops, [{ op: 'set_days', dates: [date], kind: 'skoldag' }]);
  assert.equal(Object.hasOwn(ops[0], 'note'), false);
});

test('ändrad anteckning på samma slag skickas, oförändrad kalender ger tom lista', () => {
  const before = base();
  assert.deepEqual(lasarOps(before, structuredClone(before)), []);
  const [date] = Object.keys(before.exceptions).sort();
  const after = withExceptions(before, { ...before.exceptions, [date]: { kind: 'lovdag', note: 'Höstlov för alla' } });
  assert.deepEqual(lasarOps(before, after), [{ op: 'set_days', dates: [date], kind: 'lovdag', note: 'Höstlov för alla' }]);
});

test('olika kalenderversioner nekas', () => {
  assert.throws(() => lasarOps(base(), { ...base(), id: 'annan' }));
});
