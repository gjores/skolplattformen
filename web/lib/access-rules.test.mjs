import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentState,
  legacyAppRole,
  FUNCTION_LABEL,
  contextLabel,
  epochChanged,
  invalidAssignmentCode,
  selectableAssignments,
  todayInStockholm,
} from './access-rules.ts';

test('live-prövningen skiljer kommande uppdrag från utgångna', () => {
  assert.equal(
    invalidAssignmentCode({ validFrom: '2026-10-01', endedAt: null }, '2026-09-18'),
    'assignment_upcoming',
  );
  assert.equal(
    invalidAssignmentCode({ validFrom: '2026-08-01', endedAt: null }, '2026-09-18'),
    'assignment_expired',
  );
  assert.equal(
    invalidAssignmentCode(
      { validFrom: '2026-10-01', endedAt: new Date('2026-09-17T10:00:00Z') },
      '2026-09-18',
    ),
    'assignment_ended',
  );
});

function assignment(overrides = {}) {
  return {
    id: 'a1',
    membershipId: 'm1',
    customerId: 'c1',
    customerName: 'Provkund A',
    organizerName: null,
    unitName: null,
    function: 'kundadmin',
    membershipStatus: 'active',
    validFrom: '2026-09-01',
    validTo: null,
    endedAt: null,
    ...overrides,
  };
}

test('uppdrag som har börjat och inte avslutats är giltigt', () => {
  assert.equal(assignmentState(assignment(), '2026-09-13'), 'giltigt');
});

test('uppdrag som börjar senare är kommande', () => {
  assert.equal(assignmentState(assignment({ validFrom: '2026-10-13' }), '2026-09-13'), 'kommande');
});

test('uppdrag vars sista datum passerat är avslutat', () => {
  assert.equal(assignmentState(assignment({ validTo: '2026-09-12' }), '2026-09-13'), 'avslutat');
});

test('endedAt avslutar uppdraget oavsett datum', () => {
  assert.equal(
    assignmentState(assignment({ validFrom: '2026-10-13', endedAt: '2026-09-10T08:00:00Z' }), '2026-09-13'),
    'avslutat',
  );
});

test('uppdrag gäller från och med startdatumet', () => {
  assert.equal(assignmentState(assignment({ validFrom: '2026-09-13' }), '2026-09-13'), 'giltigt');
});

test('uppdrag gäller till och med slutdatumet', () => {
  assert.equal(assignmentState(assignment({ validTo: '2026-09-13' }), '2026-09-13'), 'giltigt');
});

test('valbara uppdrag grupperas och giltiga sorteras på kund, huvudman och funktion', () => {
  const result = selectableAssignments(
    [
      assignment({ id: '2', customerName: 'Övningskund', organizerName: 'B', function: 'rektor' }),
      assignment({ id: '1', customerName: 'Provkund A', organizerName: 'A', function: 'huvudman' }),
      assignment({ id: '3', customerName: 'Provkund A', organizerName: 'A', function: 'administrator' }),
    ],
    '2026-09-13',
  );
  assert.deepEqual(result.valid.map((item) => item.id), ['3', '1', '2']);
  assert.deepEqual(result.upcoming, []);
  assert.deepEqual(result.ended, []);
});

test('kommande uppdrag sorteras på stigande startdatum', () => {
  const result = selectableAssignments(
    [
      assignment({ id: 'sen', validFrom: '2026-12-01' }),
      assignment({ id: 'tidig', validFrom: '2026-10-01' }),
    ],
    '2026-09-13',
  );
  assert.deepEqual(result.upcoming.map((item) => item.id), ['tidig', 'sen']);
});

test('avslutade uppdrag sorteras på senaste slutpunkt först', () => {
  const result = selectableAssignments(
    [
      assignment({ id: 'äldre', validTo: '2026-04-01' }),
      assignment({ id: 'nyare', endedAt: '2026-09-12T12:00:00Z' }),
    ],
    '2026-09-13',
  );
  assert.deepEqual(result.ended.map((item) => item.id), ['nyare', 'äldre']);
});

test('spärrat medlemskap är inte valbart och markeras i avslutade uppdrag', () => {
  const result = selectableAssignments(
    [assignment({ id: 'spärrat', membershipStatus: 'blocked' })],
    '2026-09-13',
  );
  assert.deepEqual(result.valid, []);
  assert.equal(result.ended[0].id, 'spärrat');
  assert.equal(result.ended[0].blocked, true);
});

test('epokbyte upptäcks bara när båda epokerna är kända och olika', () => {
  assert.equal(epochChanged(1, 2), true);
  assert.equal(epochChanged(3, 3), false);
  assert.equal(epochChanged(2, null), false);
  assert.equal(epochChanged(null, 2), false);
});

test('kontextetikett utelämnar saknade nivåer och översätter funktionen', () => {
  assert.equal(contextLabel(assignment()), 'Provkund A · Kundadministration');
});

test('kontextetikett innehåller huvudman, skola och funktion', () => {
  assert.equal(
    contextLabel(assignment({ organizerName: 'Huvudman X', unitName: 'Skola Y', function: 'rektor' })),
    'Provkund A · Huvudman X · Skola Y · Rektor',
  );
});

test('svenskt datum följer Europe/Stockholm över UTC-dygnsgränsen', () => {
  assert.equal(todayInStockholm(new Date('2026-06-30T22:30:00Z')), '2026-07-01');
});

for (const role of ['elevhalsa', 'elevhalsoansvarig', 'it', 'support', 'kundadmin', 'granskare']) {
  test(`${role} behålls som åtkomstfunktion men ger ingen äldre verksamhetsroll`, () => {
    assert.equal(legacyAppRole(role), null);
    assert.ok(FUNCTION_LABEL[role]);
  });
}
test('etablerade verksamhetsroller behåller uttrycklig bakåtkompatibilitet', () => {
  for (const role of ['huvudman', 'rektor', 'administrator', 'larare']) assert.equal(legacyAppRole(role), role);
  assert.equal(legacyAppRole(null), null);
  assert.equal(legacyAppRole('unknown'), null);
});

test('servernekad livekedja är inte valbar trots giltiga kalenderdatum', () => {
  const item = assignment({serverValid: false});
  assert.equal(assignmentState(item, '2026-09-24'), 'avslutat');
  assert.equal(selectableAssignments([item], '2026-09-24').valid.length, 0);
});
