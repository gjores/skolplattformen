import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideMandate } from './mandate-policy.ts';

const now = '2026-09-23T10:00:00Z';
const make = (changes = {}) => ({
  id: 'a1', identityId: 'person1', customerId: 'c1', organizerId: 'o1',
  function: 'rektor', profileId: 'synthetic-v1', unitIds: ['s1'], scopeKind: 'school',
  groups: [], pupils: [], cases: [], validFrom: '2026-09-01', validTo: '2026-12-31',
  startsAt: null, endsAt: null, endedAt: null, parentAssignmentId: null,
  membershipActive: true, ...changes,
});
const pupil = { unitId: 's1', pupilId: 'p1', groupIds: ['g1'], caseId: null };
const read = (changes = {}) => ({ action: 'pupil.read', customerId: 'c1', organizerId: 'o1',
  fields: ['id', 'display_name'], resource: pupil, ...changes });
const run = (assignment, request = read(), overrides = {}) => decideMandate({
  assignment, ancestors: [], profileId: 'synthetic-v1', verifiedLocalTarget: true,
  serverNow: now, request, ...overrides,
});
const child = (changes = {}) => make({ id: 'child', identityId: 'person2', function: 'larare',
  scopeKind: 'group', groups: [{ unitId: 's1', id: 'g1', kind: 'teaching' }],
  parentAssignmentId: 'a1', ...changes });
const grant = (target, action = 'mandate.grant') => read({ action, fields: [], resource: null, target });
const support = () => child({ function: 'support', scopeKind: 'pupil', groups: [],
  pupils: [{ unitId: 's1', id: 'p1' }], startsAt: now, endsAt: '2026-09-23T11:00:00Z',
  purposeCode: 'synthetic-troubleshooting', approvedByAssignmentId: 'a1' });

const cases = [
  ['principal-school', make(), read(), true],
  ['unknown-action', make(), read({ action: 'godmode' }), false],
  ['foreign-customer', make(), read({ customerId: 'c2' }), false],
  ['foreign-organizer', make(), read({ organizerId: 'o2' }), false],
  ['foreign-school', make(), read({ resource: { ...pupil, unitId: 's2' } }), false],
  ['empty-school', make({ unitIds: [] }), read(), false],
  ['upcoming', make({ validFrom: '2026-10-01' }), read(), false],
  ['ended', make({ endedAt: now }), read(), false],
  ['expired', make({ validTo: '2026-09-22' }), read(), false],
  ['blocked-membership', make({ membershipActive: false }), read(), false],
  ['foreign-field', make(), read({ fields: ['medical_notes'] }), false],
  ['empty-field', make(), read({ fields: [] }), false],
  ['unknown-scope', make({ scopeKind: 'all' }), read(), false],
  ['teacher-group', make({ function: 'larare', scopeKind: 'group', groups: [{ unitId: 's1', id: 'g1', kind: 'teaching' }] }), read(), true],
  ['teacher-mentor', make({ function: 'larare', scopeKind: 'group', groups: [{ unitId: 's1', id: 'g1', kind: 'mentor' }] }), read(), true],
  ['teacher-empty', make({ function: 'larare', scopeKind: 'group' }), read(), false],
  ['teacher-foreign-group', make({ function: 'larare', scopeKind: 'group', groups: [{ unitId: 's2', id: 'g1', kind: 'teaching' }] }), read(), false],
  ['school-admin-export', make({ function: 'administrator' }), read({ action: 'pupil.export' }), true],
  ['teacher-export', make({ function: 'larare' }), read({ action: 'pupil.export' }), false],
  ['health-school', make({ function: 'elevhalsa' }), read(), true],
  ['health-pupil', make({ function: 'elevhalsa', scopeKind: 'pupil', pupils: [{ unitId: 's1', id: 'p1' }] }), read(), true],
  ['health-pupil-other', make({ function: 'elevhalsa', scopeKind: 'pupil', pupils: [{ unitId: 's1', id: 'p2' }] }), read(), false],
  ['health-case', make({ function: 'elevhalsa', scopeKind: 'case', cases: [{ unitId: 's1', id: 'case1', pupilId: 'p1' }] }), read({ resource: { ...pupil, caseId: 'case1' } }), true],
  ['health-case-no-context', make({ function: 'elevhalsa', scopeKind: 'case', cases: [{ unitId: 's1', id: 'case1', pupilId: 'p1' }] }), read(), false],
  ['health-case-other-pupil', make({ function: 'elevhalsa', scopeKind: 'case', cases: [{ unitId: 's1', id: 'case1', pupilId: 'p2' }] }), read({ resource: { ...pupil, caseId: 'case1' } }), false],
  ['health-export', make({ function: 'elevhalsa' }), read({ action: 'pupil.export' }), false],
  ['head-no-pupils', make({ function: 'huvudman' }), read(), false],
  ['customer-admin-no-pupils', make({ function: 'kundadmin' }), read(), false],
  ['it-no-pupils', make({ function: 'it' }), read(), false],
  ['health-lead-no-pupils', make({ function: 'elevhalsoansvarig' }), read(), false],
  ['principal-teacher', make(), grant(child()), true],
  ['principal-revoke', make(), grant(child(), 'mandate.revoke'), true],
  ['self-escalation', make(), grant(child({ identityId: 'person1' })), false],
  ['head-teacher', make({ function: 'huvudman' }), grant(child()), false],
  ['principal-principal', make(), grant(child({ function: 'rektor', scopeKind: 'school' })), false],
  ['head-principal', make({ function: 'huvudman' }), grant(child({ function: 'rektor', scopeKind: 'school' })), true],
  ['grant-foreign-school', make(), grant(child({ unitIds: ['s2'] })), false],
  ['grant-longer-time', make(), grant(child({ validTo: null })), false],
  ['principal-health', make(), grant(child({ function: 'elevhalsa', scopeKind: 'pupil', pupils: [{ unitId: 's1', id: 'p1' }] })), true],
  ['health-lead-multischool', make({ function: 'elevhalsoansvarig', unitIds: ['s1', 's2'] }), grant(child({ function: 'elevhalsa', scopeKind: 'school', unitIds: ['s1', 's2'] })), true],
  ['no-public-health-lead', make({ function: 'huvudman' }), grant(child({ function: 'elevhalsoansvarig' })), false],
  ['principal-support', make(), grant(support()), true],
  ['support-too-long', make(), grant({ ...support(), endsAt: '2026-09-23T11:00:01Z' }), false],
  ['support-no-purpose', make(), grant({ ...support(), purposeCode: '' }), false],
  ['support-no-approval', make(), grant({ ...support(), approvedByAssignmentId: null }), false],
];
for (const [name, assignment, request, allowed] of cases) {
  test(name, () => {
    const result = run(assignment, request);
    assert.equal(result.allowed, allowed);
    assert.equal(result.assignmentId, assignment.id);
    if (!allowed) assert.deepEqual(result.allowedFields, []);
    else assert.deepEqual(result.allowedFields, request.fields);
  });
}
for (const action of ['connection.read', 'connection.enable', 'connection.pause', 'connection.test']) {
  test(`it-admin-${action}`, () => assert.equal(run(make({ function: 'it' }), read({ action,
    fields: ['enabled', 'version'], resource: { unitId: 's1' } })).allowed, true));
}
for (const [time, allowed] of [['2026-09-23T09:59:59Z', false], [now, true],
  ['2026-09-23T10:59:59Z', true], ['2026-09-23T11:00:00Z', false]]) {
  test(`support-boundary-${time}`, () => assert.equal(run(support(), read(), {
    ancestors: [make()], serverNow: time,
  }).allowed, allowed));
}
for (const action of ['pupil.export', 'pupil.write', 'mandate.grant']) {
  test(`support-no-${action}`, () => assert.equal(run(support(), read({ action }), { ancestors: [make()] }).allowed, false));
}
for (const [name, overrides] of [
  ['real-profile', { profileId: 'real' }], ['unverified-target', { verifiedLocalTarget: false }],
  ['invalid-clock', { serverNow: 'nonsense' }], ['missing-assignment', { assignment: null }],
]) test(name, () => assert.equal(run(make(), read(), overrides).allowed, false));
test('parent-revoked', () => assert.equal(run(child(), read(), { ancestors: [make({ endedAt: now })] }).allowed, false));
test('parent-weakened', () => assert.equal(run(child(), read(), { ancestors: [make({ unitIds: ['s2'] })] }).allowed, false));
test('parent-missing', () => assert.equal(run(child()).allowed, false));
test('parent-cycle', () => assert.equal(run(child(), read(), { ancestors: [make({ parentAssignmentId: 'child' })] }).allowed, false));
test('no-union-of-assignments', () => assert.equal(run(make({ function: 'huvudman' }), read(), {
  ancestors: [make({ id: 'other', function: 'rektor' })],
}).allowed, false));
test('fields-are-exact-and-copied', () => {
  const request = read();
  const decision = run(make(), request);
  assert.deepEqual(decision.allowedFields, ['id', 'display_name']);
  assert.notEqual(decision.allowedFields, request.fields);
});
test('stockholm-inclusive-date-end', () => assert.equal(run(make({ validTo: '2026-09-23' }), read(), {
  serverNow: '2026-09-23T22:00:00Z',
}).allowed, false));
