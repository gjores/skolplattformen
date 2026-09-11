import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitsForRole } from './organisation-model.ts';
import { createTimplanState } from './timplan-model.ts';
import { deriveClasses } from './admin-model.ts';
import { copyCohort } from './cohort-model.ts';
import {
  createPilotFixture,
  PILOT_UNIT_GR,
  PILOT_UNIT_GY,
  schoolLabel,
  pupilsForUnit,
  adminForUnit,
} from './pilot-fixtures.ts';

const GR = '99999902';
const GY = '99999903';
const unitOf = (fixture, id) => fixture.organisation.units.find((u) => u.id === id);

test('huvudmannen har en grundskola och ett gymnasium med stabila koder', () => {
  const { organisation } = createPilotFixture();
  assert.equal(PILOT_UNIT_GR, GR);
  assert.equal(PILOT_UNIT_GY, GY);
  assert.equal(organisation.organizer.name, 'Exempelstads kommun');
  assert.equal(organisation.organizer.organizationNumber, '2120009999');
  assert.equal(organisation.organizer.type, 'Kommunal');
  assert.equal(organisation.units.length, 2);
  const gr = unitOf({ organisation }, GR);
  const gy = unitOf({ organisation }, GY);
  assert.equal(gr.code, GR);
  assert.equal(gr.name, 'Björkhagens grundskola');
  assert.deepEqual(gr.schoolTypes, [{ code: 'GR', name: 'Grundskola', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9] }]);
  assert.equal(gy.code, GY);
  assert.equal(gy.name, 'Exempelstads gymnasium');
  assert.deepEqual(gy.schoolTypes, [{ code: 'GY', name: 'Gymnasieskola', programmes: ['SA', 'EK'] }]);
  assert.equal(organisation.activeUnitId, GR);
});

test('utbildningarna hör till rätt skola och behåller sina ID:n', () => {
  const { organisation } = createPilotFixture();
  const by = (id) => organisation.offerings.find((o) => o.id === id);
  assert.equal(organisation.offerings.length, 4);
  const gr = by('gr');
  assert.equal(gr.unitId, GR);
  assert.equal(gr.kind, 'grundskola');
  assert.deepEqual(gr.grades, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(gr.status, 'aktiv');
  for (const id of ['sa25', 'ek25']) {
    const o = by(id);
    assert.equal(o.unitId, GY, id);
    assert.equal(o.kind, 'gymnasium', id);
    assert.equal(o.pointPlans[0].status, 'fastställd', id);
  }
  const foto = by('es-foto');
  assert.equal(foto.unitId, GY);
  assert.equal(foto.status, 'planerad');
  assert.equal(foto.pointPlans[0].status, 'utkast');
  const unitIds = organisation.units.map((u) => u.id);
  for (const o of organisation.offerings) assert.ok(unitIds.includes(o.unitId), `${o.id} saknar skola`);
});

test('timplaner skapas för gr, sa25 och ek25', () => {
  const fixture = createPilotFixture();
  const { plans } = createTimplanState(fixture.organisation);
  for (const id of ['gr', 'sa25', 'ek25'])
    assert.ok(plans.some((p) => p.educationId === id), `timplan saknas för ${id}`);
  for (const id of ['gr', 'sa25', 'ek25'])
    assert.ok(fixture.timplans.plans.some((p) => p.educationId === id), `fixturens timplan saknas för ${id}`);
});

test('rektorn leder båda skolorna och lärarna är fördelade per skola', () => {
  const { organisation } = createPilotFixture();
  const by = (id) => organisation.assignments.find((a) => a.id === id);
  assert.equal(by('rektor-robin').name, 'Robin Berg');
  assert.equal(by('rektor-robin').role, 'rektor');
  assert.deepEqual(by('rektor-robin').unitIds, [GR, GY]);
  assert.deepEqual(by('larare-sam').unitIds, [GR]);
  assert.deepEqual(by('larare-alex').unitIds, [GY]);
  assert.deepEqual(by('larare-mira').unitIds, [GY]);
  assert.deepEqual(unitsForRole(organisation, 'rektor').map((u) => u.id), [GR, GY]);
  assert.deepEqual(unitsForRole(organisation, 'huvudman').map((u) => u.id), [GR, GY]);
});

test('24 elever fördelas på två skolor och fyra klasser utan personnummer', () => {
  const { pupils } = createPilotFixture();
  assert.equal(pupils.length, 24);
  assert.deepEqual(
    pupils.map((p) => p.id),
    Array.from({ length: 24 }, (_, i) => `E-${2001 + i}`),
  );
  assert.equal(pupils[0].id, 'E-2001');
  assert.equal(pupils[23].id, 'E-2024');
  const inGR = pupils.filter((p) => p.unitId === GR);
  const inGY = pupils.filter((p) => p.unitId === GY);
  assert.equal(inGR.length, 12);
  assert.equal(inGY.length, 12);
  const count = (list, classId) => list.filter((p) => p.classId === classId).length;
  assert.equal(count(inGR, `klass:${GR}:4A`), 6);
  assert.equal(count(inGR, `klass:${GR}:7B`), 6);
  assert.equal(count(inGY, `klass:${GY}:SA26A`), 6);
  assert.equal(count(inGY, `klass:${GY}:EK26A`), 6);
  for (const p of inGR) {
    assert.equal(p.schoolType, 'GR');
    assert.equal(p.educationId, 'gr');
  }
  for (const p of inGY) {
    assert.equal(p.schoolType, 'GY');
    assert.equal(p.educationId, p.classId.endsWith('SA26A') ? 'sa25' : 'ek25');
  }
  for (const p of pupils) {
    assert.equal(p.placementStart, '2026-08-17');
    assert.ok(!('personalNumber' in p), 'personnummer får inte finnas');
    assert.ok(!('personnummer' in p), 'personnummer får inte finnas');
  }
  assert.equal(new Set(pupils.map((p) => p.displayName)).size, 24);
});

test('klasserna är fyra med konsekventa skolreferenser', () => {
  const { classes, pupils } = createPilotFixture();
  assert.deepEqual(
    classes.map((c) => c.id),
    [`klass:${GR}:4A`, `klass:${GR}:7B`, `klass:${GY}:SA26A`, `klass:${GY}:EK26A`],
  );
  const by = (id) => classes.find((c) => c.id === id);
  const k4a = by(`klass:${GR}:4A`);
  const k7b = by(`klass:${GR}:7B`);
  const sa = by(`klass:${GY}:SA26A`);
  const ek = by(`klass:${GY}:EK26A`);
  assert.equal(k4a.kind, 'grundskola');
  assert.equal(k4a.grade, 4);
  assert.equal(k4a.unitId, GR);
  assert.equal(k7b.kind, 'grundskola');
  assert.equal(k7b.grade, 7);
  assert.equal(k7b.unitId, GR);
  assert.equal(sa.kind, 'gymnasium');
  assert.equal(sa.cohortYear, 2026);
  assert.equal(sa.educationId, 'sa25');
  assert.equal(sa.unitId, GY);
  assert.equal(ek.kind, 'gymnasium');
  assert.equal(ek.cohortYear, 2026);
  assert.equal(ek.educationId, 'ek25');
  assert.equal(ek.unitId, GY);
  for (const p of pupils) {
    const klass = by(p.classId);
    assert.ok(klass, `${p.id} saknar klass`);
    assert.equal(klass.unitId, p.unitId, `${p.id} har klass vid annan skola`);
  }
});

test('adminregistret speglar eleverna med studieplan för gymnasiet', () => {
  const { admin, pupils } = createPilotFixture();
  assert.equal(admin.pupils.length, 24);
  for (const p of pupils) {
    const a = admin.pupils.find((x) => x.id === p.id);
    assert.ok(a, `${p.id} saknas i admin`);
    assert.equal(a.unitId, p.unitId);
    assert.equal(a.className, p.classId.split(':')[2]);
    if (p.schoolType === 'GR') {
      assert.equal(a.regime, 'Grundskola');
      assert.equal(a.program, 'Grundskola');
      assert.deepEqual(a.plan, []);
    } else {
      assert.equal(a.regime, 'Gy25');
      assert.equal(a.offering.id, p.educationId);
      assert.ok(a.plan.length > 0, `${p.id} saknar studieplan`);
    }
  }
  const ids = new Set(admin.pupils.map((p) => p.id));
  for (const g of admin.groups)
    for (const m of g.members) assert.ok(ids.has(m), `${g.id} har okänd medlem ${m}`);
  const grSv = admin.groups.find((g) => g.id === 'gr-sv');
  for (const p of pupils.filter((x) => x.schoolType === 'GR'))
    assert.ok(grSv.members.includes(p.id), `${p.id} saknas i gr-sv`);
});

test('klasser härleds per skola ur adminregistret', () => {
  const fixture = createPilotFixture();
  assert.deepEqual(
    deriveClasses(adminForUnit(fixture, GR)).map((c) => c.name),
    ['4A', '7B'],
  );
  assert.deepEqual(
    deriveClasses(adminForUnit(fixture, GY)).map((c) => c.name),
    ['EK26A', 'SA26A'],
  );
  assert.equal(pupilsForUnit(fixture, GY).length, 12);
  assert.equal(pupilsForUnit(fixture, GR).length, 12);
});

test('skoletiketten anger skolform', () => {
  const fixture = createPilotFixture();
  assert.equal(schoolLabel(unitOf(fixture, GR)), 'Björkhagens grundskola — Grundskola');
  assert.equal(schoolLabel(unitOf(fixture, GY)), 'Exempelstads gymnasium — Gymnasium');
});

test('två anrop ger lika innehåll men oberoende objekt', () => {
  const a = createPilotFixture();
  const b = createPilotFixture();
  // Timplanernas plan- och historik-ID:n kommer ur uid() och jämförs strukturellt.
  const stable = ({ organisation, admin, classes, pupils, units }) => ({ organisation, admin, classes, pupils, units });
  assert.deepEqual(stable(a), stable(b));
  const shape = (t) => t.plans.map((p) => ({ educationId: p.educationId, version: p.version, status: p.status, cells: p.cells }));
  assert.deepEqual(shape(a.timplans), shape(b.timplans));
  a.organisation.units[0].name = 'Ändrad';
  a.admin.pupils[0].name = 'Ändrad';
  a.pupils[0].displayName = 'Ändrad';
  a.classes[0].name = 'Ändrad';
  assert.equal(b.organisation.units[0].name, 'Björkhagens grundskola');
  assert.equal(b.admin.pupils[0].name, 'Alma Berg');
  assert.equal(b.pupils[0].displayName, 'Alma Berg');
  assert.equal(b.classes[0].name, '4A');
});

test('kullkopiering lämnar fixturen orörd', () => {
  const f = createPilotFixture();
  const tp = createTimplanState(f.organisation);
  const snapshot = structuredClone({ organisation: f.organisation, tp, pupils: f.pupils, adminPupils: f.admin.pupils });
  const next = copyCohort(f.organisation, tp.plans, 'huvudman', 'sa25', 2027);
  assert.equal(next.offering.unitId, GY);
  assert.equal(next.offering.status, 'planerad');
  assert.deepEqual({ organisation: f.organisation, tp, pupils: f.pupils, adminPupils: f.admin.pupils }, snapshot);
});

test('fixturen refererar inte till den gamla enskolefixturen', () => {
  const json = JSON.stringify(createPilotFixture());
  assert.ok(!json.includes('99999901'));
  assert.ok(!json.includes('Testskolan'));
});
