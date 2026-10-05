import test from 'node:test';
import assert from 'node:assert/strict';
import { programplanPhaseAt, addCalendarYears, stockholmToday, nextCohortStart, startsAfter, programplanLifecycleActions, programplanLockReason,
  parseProgramplanLifecycle, parseProgramplanLifecycleCommand, parseProgramplanLifecycleReply, programplanPhaseLabel, programplanSchoolActions, programplanSchoolLabel } from './programplan-lifecycle.ts';

const id = '55102000-0000-4000-8000-000000000001', unit = '55102000-0000-4000-8000-000000000002';
const lifecycle = (over = {}) => ({ phase: 'framtida', startsOn: '2027-08-17', archived: false, revision: 0, units: [{ id: unit, name: 'Syntetisk skola', primary: true, inMandate: true }], ...over });
const T = '2026-10-04';

// Samma falltabell som pgTAP-provet för phase5_programplan_phase_at.
test('status från exakt start: dagen före, startdagen, tre kalenderår och 29 februari', () => {
  assert.equal(programplanPhaseAt('2026-10-05', null, false, T), 'framtida');
  assert.equal(programplanPhaseAt('2026-10-04', null, true, T), 'pagaende');
  assert.equal(programplanPhaseAt('2023-10-05', null, true, T), 'pagaende');
  assert.equal(programplanPhaseAt('2023-10-04', null, true, T), 'avslutad');
  assert.equal(addCalendarYears('2024-02-29', 3), '2027-02-28');
  assert.equal(programplanPhaseAt('2024-02-29', null, true, '2027-02-27'), 'pagaende');
  assert.equal(programplanPhaseAt('2024-02-29', null, true, '2027-02-28'), 'avslutad');
  assert.equal(programplanPhaseAt('2023-08-17', 2020, true, '2026-08-16'), 'pagaende', 'exakt start går före startår');
});
test('bara startår och utan underlag gissar aldrig', () => {
  assert.equal(programplanPhaseAt(null, 2027, true, T), 'framtida');
  assert.equal(programplanPhaseAt(null, 2026, false, T), 'okand');
  assert.equal(programplanPhaseAt(null, 2023, false, T), 'okand');
  assert.equal(programplanPhaseAt(null, 2022, false, T), 'avslutad');
  assert.equal(programplanPhaseAt(null, null, false, T), 'framtida');
  assert.equal(programplanPhaseAt(null, null, true, T), 'okand');
  assert.throws(() => programplanPhaseAt('2026-02-30', null, false, T));
  assert.deepEqual(Object.values(programplanPhaseLabel), ['Framtida', 'Pågående', 'Avslutad', 'Start okänd']);
});
test('datum i Europe/Stockholm och framtida kullstart', () => {
  assert.equal(stockholmToday(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  assert.equal(stockholmToday(new Date('2026-06-30T21:59:00Z')), '2026-06-30');
  assert.equal(nextCohortStart(T), '2027-08-17');
  assert.equal(startsAfter('2026-10-05', T), true);
  assert.equal(startsAfter('2026-10-04', T), false);
  assert.equal(startsAfter('inte ett datum', T), false);
});
test('åtgärder per status och roll (D-01)', () => {
  assert.deepEqual(programplanLifecycleActions(lifecycle(), 'huvudman'), { editDetails: true, changePlan: true, delete: true, archive: true, restore: false });
  assert.deepEqual(programplanLifecycleActions(lifecycle(), 'rektor'), { editDetails: false, changePlan: true, delete: false, archive: false, restore: false });
  for (const phase of ['pagaende', 'avslutad', 'okand']) {
    assert.deepEqual(programplanLifecycleActions(lifecycle({ phase }), 'huvudman'), { editDetails: false, changePlan: false, delete: false, archive: true, restore: false });
    assert.deepEqual(programplanLifecycleActions(lifecycle({ phase }), 'rektor'), { editDetails: false, changePlan: false, delete: false, archive: false, restore: false });
    assert.ok(programplanLockReason(lifecycle({ phase })));
  }
  assert.deepEqual(programplanLifecycleActions(lifecycle({ archived: true }), 'huvudman'), { editDetails: false, changePlan: false, delete: false, archive: false, restore: true });
  assert.deepEqual(programplanLifecycleActions(lifecycle({ archived: true }), 'rektor'), { editDetails: false, changePlan: false, delete: false, archive: false, restore: false });
  assert.equal(programplanLifecycleActions(lifecycle({ units: [{ id: unit, name: 'S', primary: true, inMandate: false }] }), 'huvudman').delete, false);
  assert.equal(programplanLockReason(lifecycle()), null);
});
test('strikt lifecycle-parser', () => {
  assert.deepEqual(parseProgramplanLifecycle(lifecycle()), lifecycle());
  for (const mutate of [v => v.phase = 'pagande', v => v.startsOn = '2027-02-30', v => v.archived = 'false', v => v.revision = -1, v => v.units = [],
    v => v.units[0].primary = false, v => v.extra = 1, v => delete v.units, v => v.units.push({ ...v.units[0] }), v => v.units[0].id = 'x'])
  { const value = lifecycle(); mutate(value); assert.throws(() => parseProgramplanLifecycle(value)); }
  const getter = lifecycle(); Object.defineProperty(getter, 'phase', { get() { throw new Error('getter executed'); }, enumerable: true });
  assert.throws(() => parseProgramplanLifecycle(getter), /invalid_programplan_lifecycle/u);
});
test('kommando- och svarsparser', () => {
  const del = { offeringId: id, expectedRevision: 0, command: 'delete', details: {} };
  assert.deepEqual(parseProgramplanLifecycleCommand(del), del);
  const upd = { offeringId: id, expectedRevision: 2, command: 'update', details: { name: ' Ny ', localCode: null, cohort: 'K', startedOn: '2027-08-17' } };
  assert.deepEqual(parseProgramplanLifecycleCommand(upd).details, { name: 'Ny', localCode: null, cohort: 'K', startedOn: '2027-08-17' });
  for (const value of [{ ...del, details: { force: true } }, { ...del, command: 'drop' }, { ...del, expectedRevision: '0' }, { ...del, organizerId: id },
    { ...upd, details: { ...upd.details, name: '' } }, { ...upd, details: { ...upd.details, startedOn: '17/8' } }, { ...upd, details: { name: 'a', cohort: 'b', startedOn: null } }])
    assert.throws(() => parseProgramplanLifecycleCommand(value));
  assert.deepEqual(parseProgramplanLifecycleReply({ offeringId: id, command: 'delete', lifecycle: null }, del), { offeringId: id, command: 'delete', lifecycle: null });
  assert.throws(() => parseProgramplanLifecycleReply({ offeringId: id, command: 'delete', lifecycle: lifecycle() }, del));
  const archive = { ...del, command: 'archive' };
  assert.equal(parseProgramplanLifecycleReply({ offeringId: id, command: 'archive', lifecycle: lifecycle({ archived: true, revision: 1 }) }, archive).lifecycle.archived, true);
  assert.throws(() => parseProgramplanLifecycleReply({ offeringId: id, command: 'archive', lifecycle: lifecycle({ archived: true, revision: 2 }) }, archive), 'ny revision krävs');
  assert.throws(() => parseProgramplanLifecycleReply({ offeringId: id, command: 'restore', lifecycle: lifecycle({ archived: true, revision: 1 }) }, { ...del, command: 'restore' }));
  assert.throws(() => parseProgramplanLifecycleReply({ offeringId: unit, command: 'delete', lifecycle: null }, del));
});
test('gammal borttagning och ändring i organisation-store skriver inte till offerings', async () => {
  const { installClientForTests } = await import('./supabase.ts');
  const { deleteOffering, updateOfferingRow, OFFERING_LIFECYCLE_ONLY } = await import('./organisation-store.ts');
  const tables = [];
  const chain = new Proxy(function () {}, { get: (_t, key) => key === 'then' ? undefined : chain, apply: () => chain });
  installClientForTests({ from(table) { tables.push(table); return chain; }, rpc(name) { tables.push(`rpc:${name}`); return chain; }, auth: chain });
  try {
    await assert.rejects(() => deleteOffering(id, 'Syntetisk'), { message: OFFERING_LIFECYCLE_ONLY });
    await assert.rejects(() => updateOfferingRow(id, { name: 'Ny' }), { message: OFFERING_LIFECYCLE_ONLY });
    assert.deepEqual(tables, []);
  } finally { installClientForTests(null); }
});

const schoolB = '55102000-0000-4000-8000-000000000003';
const shared = (over = {}) => lifecycle({ units: [...lifecycle().units, { id: schoolB, name: 'Skola B', primary: false, inMandate: true }], ...over });
test('delad plan kräver alla skolors mandat vid varje ändring, men får läsas', () => {
  const partial = shared({ units: [...lifecycle().units, { id: schoolB, name: 'Skola B', primary: false, inMandate: false }] });
  assert.equal(programplanLifecycleActions(partial, 'rektor').changePlan, false);
  assert.equal(programplanLifecycleActions(partial, 'huvudman').delete, false);
  assert.equal(programplanLifecycleActions(partial, 'huvudman').archive, false);
  assert.equal(programplanLifecycleActions(partial, 'huvudman').restore, false);
  assert.equal(programplanLockReason(partial), 'Planen delas med skolor utanför ditt uppdrag och kan bara läsas');
  assert.equal(programplanLifecycleActions(shared(), 'rektor').changePlan, true);
  assert.equal(programplanSchoolLabel(shared()), 'Syntetisk skola + 1');
});
test('skolval: huvudman lägger till även efter start, tar bort bara framtida', () => {
  assert.deepEqual(programplanSchoolActions(shared(), 'huvudman'), { add: true, remove: true });
  for (const phase of ['pagaende', 'avslutad', 'okand']) assert.deepEqual(programplanSchoolActions(shared({ phase }), 'huvudman'), { add: true, remove: false });
  assert.deepEqual(programplanSchoolActions(shared({ archived: true }), 'huvudman'), { add: false, remove: false });
  assert.deepEqual(programplanSchoolActions(shared(), 'rektor'), { add: false, remove: false });
});
test('strikt units-kommando: 1–100 unika skolor, bara unitIds i details', () => {
  const command = { offeringId: id, expectedRevision: 4, command: 'units', details: { unitIds: [unit, schoolB] } };
  assert.deepEqual(parseProgramplanLifecycleCommand(command), command);
  const ids = Array.from({ length: 100 }, (_, n) => `55102000-0000-4000-8000-${String(n).padStart(12, '0')}`);
  assert.equal(parseProgramplanLifecycleCommand({ ...command, details: { unitIds: ids } }).details.unitIds.length, 100);
  for (const details of [{ unitIds: [] }, { unitIds: [unit, unit.toUpperCase()] }, { unitIds: [...ids, schoolB] }, { unitIds: ['x'] }, { unitIds: [unit], organizerId: id }, { unitIds: [, unit] }])
    assert.throws(() => parseProgramplanLifecycleCommand({ ...command, details }));
});
test('units-svar kvitterar exakt skolurval och revision, inte en annan sparning', () => {
  const expected = { offeringId: id, expectedRevision: 4, command: 'units', details: { unitIds: [schoolB, unit] } };
  const reply = { offeringId: id, command: 'units', lifecycle: shared({ revision: 5 }) };
  assert.deepEqual(parseProgramplanLifecycleReply(reply, expected), reply);
  assert.throws(() => parseProgramplanLifecycleReply({ ...reply, lifecycle: lifecycle({ revision: 5 }) }, expected));
  assert.throws(() => parseProgramplanLifecycleReply({ ...reply, lifecycle: shared({ revision: 4 }) }, expected));
  const units = Array.from({ length: 100 }, (_, n) => ({ id: `55102000-0000-4000-8000-${String(n).padStart(12, '0')}`, name: 'Skola', primary: n === 0, inMandate: true }));
  assert.equal(parseProgramplanLifecycle(lifecycle({ units })).units.length, 100);
});
