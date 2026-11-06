import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyBlocks, nextLegacyStep } from './legacy-block-retirement.ts';

const id = n => `58400000-0000-4000-8000-${String(n).padStart(12, '0')}`, today = '2027-03-10';
const block = { id: id(1), name: 'Moderna språk', revision: 4, groups: [{ id: id(2) }, { id: id(3) }] };
const read = extra => ({ blocks: [block, { id: id(9), name: 'Tomt', revision: 1, groups: [] }], rounds: [], placements: [], ...extra });
const row = (n, group, extra = {}) => ({ id: id(n), sourceKind: 'teaching_group', groupId: group, jointGroupId: null, ...extra });
const next = (r, rows = []) => nextLegacyStep(r, { rows }, block.id, today);

test('only blocks with live groups are listed, with what the retirement touches', () => {
  const rows = [row(10, id(2)), row(11, id(3), { jointGroupId: id(20) }), row(12, id(99)), { id: id(13), sourceKind: 'class_timplan' }];
  const placements = [{ id: id(30), groupId: id(2), startsOn: '2027-01-01', endsOn: null, revision: 1 }, { id: id(31), groupId: id(2), startsOn: '2027-01-01', endsOn: '2027-03-09', revision: 1 }];
  const [only, ...rest] = legacyBlocks(read({ placements, rounds: [{ id: id(40), blockId: block.id, status: 'open', revision: 2 }, { id: id(41), blockId: block.id, status: 'closed', revision: 2 }] }), { rows }, today);
  assert.equal(rest.length, 0);
  assert.deepEqual([only.rowIds, only.jointRows, only.openRounds, only.placements], [[id(10), id(11)], 1, 1, 1]);
});
test('steps run rows, rounds, placements and groups in that order', () => {
  const placement = { id: id(30), groupId: id(2), startsOn: '2027-01-01', endsOn: null, revision: 3 }, round = { id: id(40), blockId: block.id, status: 'open', revision: 2 };
  assert.deepEqual(next(read({ rounds: [round], placements: [placement] }), [row(10, id(2))]), { kind: 'delete_row', rowId: id(10) });
  assert.deepEqual(next(read({ rounds: [round], placements: [placement] })), { kind: 'elective', action: 'close_round', payload: { roundId: id(40), expectedRoundRevision: 2 } });
  assert.deepEqual(next(read({ placements: [placement] })), { kind: 'elective', action: 'end_placement', payload: { placementId: id(30), expectedPlacementRevision: 3, endsOn: '2027-03-09' } });
  assert.deepEqual(next(read({})), { kind: 'elective', action: 'retire_group', payload: { groupId: id(2), expectedBlockRevision: 4 } });
});
test('a future placement is withdrawn and one starting today stops the run', () => {
  const placement = startsOn => ({ id: id(30), groupId: id(2), startsOn, endsOn: '2027-06-01', revision: 1 });
  assert.equal(next(read({ placements: [placement('2027-04-01')] })).payload.endsOn, '2027-03-31');
  assert.deepEqual(next(read({ placements: [placement(today)] })), { stop: 'placement_today' });
});
test('a joint row stops the run and a finished block has no step', () => {
  assert.deepEqual(next(read({}), [row(10, id(2), { jointGroupId: id(20) })]), { stop: 'joint_row' });
  assert.equal(nextLegacyStep(read({}), { rows: [] }, id(9), today), null);
});
test('unreadable placements do not hide the other steps', () => {
  assert.equal(next(read({ placements: null })).action, 'retire_group');
});
