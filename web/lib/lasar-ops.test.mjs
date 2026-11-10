import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lasarOps } from './lasar-ops.ts';
import { proposeSchoolYear } from './lasar-model.ts';

// Syntetisk skolenhet och syntetiska grupp-ID:n; inga personuppgifter.
const UNIT = '51a50000-0000-4000-8000-000000000003';
const KLASS = 'klass:51a50000-0000-4000-8000-000000000501';
const AK1 = 'arskurs:51a50000-0000-4000-8000-000000000401:ak1';
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

test('ändrad anteckning på samma slag blir set_notes; borttagen anteckning saknar note', () => {
  const before = base();
  assert.deepEqual(lasarOps(before, structuredClone(before)), []);
  const [first, second] = Object.keys(before.exceptions).sort();
  const after = withExceptions(before, {
    ...before.exceptions,
    [first]: { kind: before.exceptions[first].kind, note: 'Höstlov för alla' },
    [second]: { kind: before.exceptions[second].kind, note: 'Höstlov för alla' },
  });
  assert.deepEqual(lasarOps(before, after), [{ op: 'set_notes', dates: [first, second], note: 'Höstlov för alla' }]);
  const removed = lasarOps(after, withExceptions(after, { ...after.exceptions, [first]: { kind: after.exceptions[first].kind } }));
  assert.deepEqual(removed, [{ op: 'set_notes', dates: [first] }]);
});

test('terminer blir set_term per ändrad kant, efter dagarna som faller bort', () => {
  const before = base();
  const after = { ...before, ht: { ...before.ht, end: '2026-12-21' }, vt: { ...before.vt, start: '2027-01-12' } };
  assert.deepEqual(lasarOps(before, after), [
    { op: 'set_term', term: 'ht', edge: 'end', date: '2026-12-21' },
    { op: 'set_term', term: 'vt', edge: 'start', date: '2027-01-12' },
  ]);
  const [date] = Object.keys(before.exceptions).sort();
  const exceptions = { ...before.exceptions };
  delete exceptions[date];
  const shrunk = { ...before, ht: { ...before.ht, start: '2026-08-24' }, exceptions };
  assert.deepEqual(lasarOps(before, shrunk).map((o) => o.op), ['set_days', 'set_term']);
});

test('gruppdagar och korta veckor blir egna kommandon med stabila grupp-ID:n', () => {
  const before = { ...base(), groupExceptions: { [KLASS]: { '2026-10-14': { cause: 'friluftsdag' } } } };
  const after = {
    ...before,
    groupExceptions: {
      [KLASS]: { '2026-10-15': { cause: 'nationellt prov', note: 'Provvakter' }, '2026-10-16': { cause: 'nationellt prov', note: 'Provvakter' } },
      [AK1]: { '2026-11-04': { cause: 'friluftsdag' } },
    },
    shortWeeks: { [AK1]: { weekday: 4, reason: 'Särskilda skäl för årskurs 1', columnId: 'ak1' } },
  };
  assert.deepEqual(lasarOps(before, after), [
    { op: 'clear_group_days', groupId: KLASS, dates: ['2026-10-14'] },
    { op: 'set_group_days', groupId: AK1, dates: ['2026-11-04'], cause: 'friluftsdag' },
    { op: 'set_group_days', groupId: KLASS, dates: ['2026-10-15', '2026-10-16'], cause: 'nationellt prov', note: 'Provvakter' },
    { op: 'set_short_week', groupId: AK1, columnId: 'ak1', weekday: 4, reason: 'Särskilda skäl för årskurs 1' },
  ]);
  assert.deepEqual(lasarOps(after, { ...after, shortWeeks: {} }), [{ op: 'clear_short_week', groupId: AK1 }]);
});

test('en dag före editableFrom hamnar aldrig i ett kommando (D-12)', () => {
  const before = { ...base(), groupExceptions: {} };
  const after = {
    ...before,
    ht: { ...before.ht, start: '2026-08-20' },
    exceptions: { ...before.exceptions, '2026-09-02': { kind: 'lovdag' }, '2026-11-18': { kind: 'lovdag' } },
    groupExceptions: { [KLASS]: { '2026-09-03': { cause: 'friluftsdag' }, '2026-11-19': { cause: 'friluftsdag' } } },
  };
  const ops = lasarOps(before, after, { editableFrom: '2026-11-09' });
  assert.deepEqual(ops, [
    { op: 'set_days', dates: ['2026-11-18'], kind: 'lovdag' },
    { op: 'set_group_days', groupId: KLASS, dates: ['2026-11-19'], cause: 'friluftsdag' },
  ]);
  const dates = ops.flatMap((o) => o.dates ?? [o.date]);
  assert.ok(dates.every((d) => d >= '2026-11-09'));
  // Utan filtret följer alla dagar och terminsstarten med, så vyn kan se att något var låst.
  const unfiltered = lasarOps(before, after);
  assert.deepEqual(unfiltered.map((o) => o.op), ['set_days', 'set_group_days', 'set_term']);
  assert.deepEqual(unfiltered[0].dates, ['2026-09-02', '2026-11-18']);
  assert.deepEqual(lasarOps(before, after, { editableFrom: null }), lasarOps(before, after));
});

test('olika kalenderversioner nekas', () => {
  assert.throws(() => lasarOps(base(), { ...base(), id: 'annan' }));
});
