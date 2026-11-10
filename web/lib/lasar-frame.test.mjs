import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameDeviation, frameChanges, applyFrameChanges } from './lasar-frame.ts';
import { proposeSchoolYear } from './lasar-model.ts';

// Syntetiska data: ram och skola utgår från förslaget för 2026/27.
const proposal = proposeSchoolYear(2026, 'u1', ['GR']);
const frame = (patch = {}, exceptions = {}) => ({
  versionId: '51a10000-0000-4000-8000-0000000000f1', version: 1,
  terms: { ht: { ...proposal.ht }, vt: { ...proposal.vt } },
  exceptions: { ...proposal.exceptions, ...exceptions },
  ...patch,
});
const without = (record, ...keys) => Object.fromEntries(Object.entries(record).filter(([k]) => !keys.includes(k)));
const school = (patch = {}) => ({ ...proposal, ht: { ...proposal.ht }, vt: { ...proposal.vt }, exceptions: { ...proposal.exceptions }, ...patch });
const keys = (list) => list.map((c) => c.key);
const groupId = 'arskurs:51a10000-0000-4000-8000-000000000001:ak1';
const groupParts = { groupExceptions: { [groupId]: { '2026-09-16': { cause: 'friluftsdag', note: 'Skogen' } } }, shortWeeks: { [groupId]: { weekday: 4, reason: 'Inskolning', columnId: 'ak1' } } };

test('frameDeviation: samma innehåll som ramen ger tom lista', () => {
  assert.deepEqual(frameDeviation(school(), frame()), []);
});

test('frameDeviation: terminskanter och dagar som skiljer från ramversionen listas', () => {
  const s = school({
    ht: { start: '2026-08-18', end: proposal.ht.end },
    exceptions: { ...without(proposal.exceptions, '2026-10-30'), '2026-11-20': { kind: 'studiedag', note: 'Fortbildning' }, '2027-03-01': { kind: 'studiedag', note: 'Sportlov' } },
  });
  const f = frame({}, { '2027-03-02': { kind: 'lovdag', note: 'Sportlov, ny text' } });
  const list = frameDeviation(s, f);
  assert.deepEqual(keys(list), ['term:ht:start', 'day:2026-10-30', 'day:2026-11-20', 'day:2027-03-01', 'day:2027-03-02']);
  assert.deepEqual(list[0], { key: 'term:ht:start', school: '2026-08-18', frame: '2026-08-17' });
  assert.deepEqual(list[1], { key: 'day:2026-10-30', school: null, frame: { kind: 'lovdag', note: 'Höstlov' } });
  assert.deepEqual(list[2], { key: 'day:2026-11-20', school: { kind: 'studiedag', note: 'Fortbildning' }, frame: null });
});

test('frameDeviation: skolans gruppdagar och korta veckor räknas inte som avvikelse', () => {
  assert.deepEqual(frameDeviation(school(groupParts), frame()), []);
});

test('frameChanges: våra = bas och deras ≠ bas ger apply, för både dag och terminskant', () => {
  const theirs = frame({ version: 2, terms: { ht: { ...proposal.ht }, vt: { start: proposal.vt.start, end: '2027-06-10' } } }, { '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } });
  const changes = frameChanges(frame(), theirs, school());
  assert.deepEqual(keys(changes.apply), ['term:vt:end', 'day:2026-11-20']);
  assert.deepEqual(changes.apply[0], { key: 'term:vt:end', base: '2027-06-11', theirs: '2027-06-10', ours: '2027-06-11' });
  assert.deepEqual(changes.apply[1], { key: 'day:2026-11-20', base: null, theirs: { kind: 'studiedag', note: 'Gemensam' }, ours: null });
  assert.deepEqual(changes.conflicts, []);
  assert.deepEqual(changes.own, []);
});

test('frameChanges: båda ändrade olika ger conflict, för både dag och terminskant', () => {
  const theirs = frame({ version: 2, terms: { ht: { start: '2026-08-18', end: proposal.ht.end }, vt: { ...proposal.vt } } }, { '2026-10-30': { kind: 'studiedag', note: 'Ram' } });
  const ours = school({ ht: { start: '2026-08-19', end: proposal.ht.end }, exceptions: { ...proposal.exceptions, '2026-10-30': { kind: 'studiedag', note: 'Skolan' } } });
  const changes = frameChanges(frame(), theirs, ours);
  assert.deepEqual(keys(changes.conflicts), ['term:ht:start', 'day:2026-10-30']);
  assert.deepEqual(changes.conflicts[0], { key: 'term:ht:start', base: '2026-08-17', theirs: '2026-08-18', ours: '2026-08-19' });
  assert.deepEqual(changes.apply, []);
  assert.deepEqual(changes.own, []);
});

test('frameChanges: bara skolans ändringar ger own och lämnas orörda', () => {
  const ours = school({ vt: { start: '2027-01-12', end: proposal.vt.end }, exceptions: { ...without(proposal.exceptions, '2026-10-26'), '2027-04-12': { kind: 'studiedag', note: 'Egen' } } });
  const changes = frameChanges(frame(), frame({ version: 2 }), ours);
  assert.deepEqual(keys(changes.own), ['term:vt:start', 'day:2026-10-26', 'day:2027-04-12']);
  assert.deepEqual(changes.apply, []);
  assert.deepEqual(changes.conflicts, []);
});

test('frameChanges: båda ändrade lika ger ingen post', () => {
  const theirs = frame({ version: 2, terms: { ht: { ...proposal.ht }, vt: { start: proposal.vt.start, end: '2027-06-10' } } }, { '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } });
  const ours = school({ vt: { start: proposal.vt.start, end: '2027-06-10' }, exceptions: { ...proposal.exceptions, '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } } });
  assert.deepEqual(frameChanges(frame(), theirs, ours), { apply: [], conflicts: [], own: [] });
});

test('applyFrameChanges ändrar exakt de godkända punkterna och inget annat', () => {
  const theirs = frame({ version: 2, terms: { ht: { ...proposal.ht }, vt: { start: proposal.vt.start, end: '2027-06-10' } } }, { '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } });
  delete theirs.exceptions['2027-03-05'];
  theirs.exceptions['2026-10-30'] = { kind: 'studiedag', note: 'Ram' };
  const ours = school({ ...groupParts, exceptions: { ...proposal.exceptions, '2026-10-30': { kind: 'studiedag', note: 'Skolan' }, '2027-04-12': { kind: 'studiedag', note: 'Egen' } } });
  const changes = frameChanges(frame(), theirs, ours);
  assert.deepEqual(keys(changes.apply), ['term:vt:end', 'day:2026-11-20', 'day:2027-03-05']);
  assert.deepEqual(keys(changes.conflicts), ['day:2026-10-30']);
  assert.deepEqual(keys(changes.own), ['day:2027-04-12']);

  const result = applyFrameChanges(ours, changes, ['term:vt:end', 'day:2027-03-05', 'day:2026-10-30']);
  assert.equal(result.vt.end, '2027-06-10');
  assert.equal(result.exceptions['2027-03-05'], undefined);
  assert.deepEqual(result.exceptions['2026-10-30'], { kind: 'studiedag', note: 'Ram' });
  // Ej godkänd ändring och skolans egen avvikelse ligger kvar.
  assert.equal(result.exceptions['2026-11-20'], undefined);
  assert.deepEqual(result.exceptions['2027-04-12'], { kind: 'studiedag', note: 'Egen' });
  const expected = structuredClone(ours);
  expected.vt.end = '2027-06-10';
  delete expected.exceptions['2027-03-05'];
  expected.exceptions['2026-10-30'] = { kind: 'studiedag', note: 'Ram' };
  assert.deepEqual(result, expected);
  // Ingen sidoeffekt på indata.
  assert.equal(ours.vt.end, proposal.vt.end);
  assert.deepEqual(ours.exceptions['2027-03-05'], { kind: 'lovdag', note: 'Sportlov' });
});

test('applyFrameChanges med tom lista ger innehåll som är djupt lika med skolans', () => {
  const theirs = frame({ version: 2 }, { '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } });
  const ours = school(groupParts);
  assert.deepEqual(applyFrameChanges(ours, frameChanges(frame(), theirs, ours), []), ours);
});

test('applyFrameChanges nekar skolans egna avvikelser, okända punkter och inaktuella jämförelser', () => {
  const theirs = frame({ version: 2 }, { '2026-11-20': { kind: 'studiedag', note: 'Gemensam' } });
  const ours = school({ exceptions: { ...proposal.exceptions, '2027-04-12': { kind: 'studiedag', note: 'Egen' } } });
  const changes = frameChanges(frame(), theirs, ours);
  assert.throws(() => applyFrameChanges(ours, changes, ['day:2027-04-12']));
  assert.throws(() => applyFrameChanges(ours, changes, ['day:2026-12-01']));
  const moved = { ...ours, exceptions: { ...ours.exceptions, '2026-11-20': { kind: 'lovdag' } } };
  assert.throws(() => applyFrameChanges(moved, changes, ['day:2026-11-20']));
});

test('skolans gruppdagar och korta veckor påverkas aldrig av ramens ändringar', () => {
  const theirs = frame({ version: 2, terms: { ht: { start: '2026-08-18', end: proposal.ht.end }, vt: { ...proposal.vt } } }, { '2026-09-16': { kind: 'lovdag', note: 'Ram' } });
  const ours = school(groupParts);
  const changes = frameChanges(frame(), theirs, ours);
  assert.ok([...changes.apply, ...changes.conflicts, ...changes.own].every((c) => c.key.startsWith('term:') || c.key.startsWith('day:')));
  const result = applyFrameChanges(ours, changes, keys(changes.apply));
  assert.equal(result.ht.start, '2026-08-18');
  assert.deepEqual(result.exceptions['2026-09-16'], { kind: 'lovdag', note: 'Ram' });
  assert.deepEqual(result.groupExceptions, groupParts.groupExceptions);
  assert.deepEqual(result.shortWeeks, groupParts.shortWeeks);
});
