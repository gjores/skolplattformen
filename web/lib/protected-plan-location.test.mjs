import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlanLocation, readPlanLocationResult, planLocationQuery, normalizePlanLocation, planningLocationChange, planningReadScopeLost } from './protected-plan-location.ts';
const id='55004000-0000-4000-8000-000000000001', other='55004000-0000-4000-8000-000000000002';
test('source and school plan survive a reload without retaining pupil register selections',()=>{
  for(const location of [{view:'programplaner',programplan:{offeringId:id,planId:other}},{view:'timplaner',gym:{kind:'plan',id}},{view:'timplaner',gym:{kind:'source',id}}])assert.deepEqual(readPlanLocation(planLocationQuery(location)),location);
  assert.deepEqual(readPlanLocation(`?vy=timplaner&timplan=${id}&elev=private&skola=other`),{view:'timplaner',gym:{kind:'plan',id}});
});
test('malformed links provide no object reference or role authority',()=>{
  assert.equal(readPlanLocation('?vy=kund&roll=huvudman'),null);
  assert.deepEqual(readPlanLocation('?vy=timplaner&timplan=javascript:alert(1)'),{view:'timplaner',gym:null});
  assert.deepEqual(readPlanLocation(`?vy=programplaner&utbildning=${id}&programplan=bad`),{view:'programplaner',programplan:null});
});

const rev = 'sha256:' + 'a'.repeat(64);
const setup = () => ({ customerId: id, serverDate: '2026-10-07', currentYear: 2026, minimumYear: 2000, maximumYear: 2100,
  units: [id, other].map((unitId, i) => ({ unitId, schoolName: `Skola ${i}`, canRead: { programplan: true, gymnasium: true, grundskola: true, introduktionsprogram: true } })) });
test('new selection has isolated planning parameters and survives round trips', () => {
  const location = { view: 'timplaner', gym: null, planning: { schoolYear: 2027, unitId: null, schoolform: 'grundskola', query: 'kod & namn',
    status: 'utkast', cohortRelation: 'continuing', archive: 'all', grade: 8, sort: 'hours', direction: 'desc', page: 2, selectionRevision: rev }, allYears: true };
  const query = planLocationQuery(location);
  assert.deepEqual(readPlanLocation(query), location);
  assert.deepEqual(readPlanLocation(query + '&lasar=2020&skola=private&klass=a&elev=b&statusfilter=all'), location);
  for (const key of ['lasar', 'skola', 'klass', 'elev', 'statusfilter']) assert.equal(new URLSearchParams(query).has(key), false);
});
test('GR and IM use an explicit other target; GY retains its old identifiers and relative year', () => {
  for (const kind of ['grundskola', 'introduktionsprogram']) {
    const location = { view: 'timplaner', gym: null, other: { kind, id }, allYears: false };
    assert.deepEqual(readPlanLocation(planLocationQuery(location)), location);
  }
  const gym = { view: 'timplaner', gym: { kind: 'source', id }, relativeYear: 3 };
  assert.deepEqual(readPlanLocation(planLocationQuery(gym)), gym);
});
test('whitelist never serializes register values or arbitrary runtime properties', () => {
  const params = new URLSearchParams(planLocationQuery({ view: 'timplaner', gym: null, elev: 'private', planning: { schoolYear: 2027, lasar: 2019, skola: other, role: 'huvudman' } }));
  assert.deepEqual([...params.keys()], ['vy', 'planeringslasar']);
});
test('duplicate and malformed choices are rejected with an intelligible notice', () => {
  for (const suffix of ['planeringslasar=2027&planeringslasar=2028', 'planeringsskola=bad', 'planeringsform=anything',
    'planeringslasar=02027', 'planeringslasar=2101', 'planeringssida=-2', 'planeringssok=%00', 'planeringsarskurs=10',
    'planeringsrevision=sha256:bad', 'planeringsallaar=true', 'planeringsrelativar=4']) {
    const result = readPlanLocationResult('?vy=timplaner&' + suffix);
    assert.ok(result.normalizationNotice); assert.deepEqual(result.location, { view: 'timplaner', gym: null });
  }
  assert.equal(readPlanLocation('?vy=timplaner&vy=programplaner'), null);
  assert.deepEqual(readPlanLocation(`?vy=timplaner&timplan=${id}&timplan=${other}`), { view: 'timplaner', gym: null });
  assert.deepEqual(readPlanLocation(`?vy=timplaner&timplan=${id}&programunderlag=${other}`), { view: 'timplaner', gym: null });
});
test('pagination requires a validated selection revision and invalid filters discard stale pages', () => {
  assert.deepEqual(readPlanLocation('?vy=timplaner&planeringssida=2').planning, { page: 1 });
  assert.deepEqual(readPlanLocation(`?vy=timplaner&planeringssida=2&planeringsrevision=${rev}`).planning, { page: 2, selectionRevision: rev });
  assert.deepEqual(readPlanLocation(`?vy=timplaner&planeringsform=bad&planeringssida=2&planeringsrevision=${rev}`).planning, { page: 1 });
});
test('server setup supplies current year and permitted first school; explicit all remains all', () => {
  const old = { view: 'programplaner', programplan: { offeringId: id, planId: other } };
  const normalized = normalizePlanLocation(old, setup());
  assert.equal(normalized.selection.schoolYear, 2026); assert.equal(normalized.selection.unitId, id);
  assert.deepEqual(normalized.location.programplan, old.programplan);
  assert.equal(normalizePlanLocation({ ...old, planning: { schoolYear: 2027, unitId: null } }, setup()).selection.unitId, null);
});
test('current mandate normalizes a foreign school and incompatible filters, resetting pagination', () => {
  const result = normalizePlanLocation({ view: 'programplaner', programplan: null, planning: { schoolYear: 2200, unitId: '55004000-0000-4000-8000-000000000099',
    schoolform: 'grundskola', status: 'forslag', sort: 'hours', grade: 9, page: 2, selectionRevision: rev } }, setup());
  assert.ok(result.normalizationNotice); assert.equal(result.selection.schoolYear, 2026); assert.equal(result.selection.unitId, id);
  assert.equal(result.selection.schoolform, 'gymnasium'); assert.equal(result.selection.status, 'all'); assert.equal(result.selection.sort, 'name');
  assert.equal(result.selection.grade, null); assert.equal(result.selection.page, 1); assert.equal(result.selection.selectionRevision, null);
});
test('GR-only and HM-without-register scopes need no pupil register setup', () => {
  const scope = setup(); scope.units = [scope.units[1]]; scope.units[0].canRead = { programplan: false, gymnasium: false, grundskola: true, introduktionsprogram: false };
  const result = normalizePlanLocation({ view: 'timplaner', gym: null }, scope);
  assert.equal(result.selection.schoolform, 'grundskola'); assert.equal(result.selection.unitId, other);
  assert.equal(result.selection.schoolYear, scope.currentYear);
});

test('GR column and exact plan metadata round trip but never establish a binding', () => {
  for (const columnId of ['ak1', 'ak8', 'ak9', null]) {
    const location = { view: 'timplaner', gym: null, other: { kind: 'grundskola', id, columnId, offeringId: other, version: 3 } };
    assert.deepEqual(readPlanLocation(planLocationQuery(location)), location);
  }
  const prefix = `?vy=timplaner&ovrigtimplan=${id}&timplansform=grundskola`;
  for (const suffix of ['timplanskolumn=ak10', 'timplanskolumn=ak8&timplanskolumn=ak9', 'timplansversion=0', 'timplansutbildning=bad']) {
    const result = readPlanLocationResult(prefix + '&' + suffix);
    assert.ok(result.normalizationNotice);
    assert.deepEqual(result.location, { view: 'timplaner', gym: null, other: { kind: 'grundskola', id } });
  }
});

test('user school changes close references and reset pages; year changes retain plan but clear former year targets', () => {
  const location = { view: 'timplaner', gym: null, other: { kind: 'grundskola', id, columnId: 'ak8', offeringId: other, version: 3 },
    planning: { schoolYear: 2027, unitId: id, schoolform: 'grundskola', page: 2, selectionRevision: rev }, relativeYear: 2, allYears: true };
  const school = planningLocationChange(location, { unitId: other }, setup());
  assert.equal(school.location.other, undefined); assert.equal(school.location.gym, null); assert.equal(school.selection.page, 1); assert.equal(school.selection.selectionRevision, null);
  const year = planningLocationChange(location, { schoolYear: 2028 }, setup());
  assert.deepEqual(year.location.other, { kind: 'grundskola', id, offeringId: other, version: 3 });
  assert.equal(year.location.relativeYear, undefined); assert.equal(year.location.allYears, undefined);
  assert.equal(year.selection.page, 1); assert.equal(year.selection.selectionRevision, null);
  const page = planningLocationChange(location, { page: 3, selectionRevision: rev }, setup());
  assert.equal(page.selection.page, 3); assert.equal(page.selection.selectionRevision, rev);
});
test('normalization closes a reference when its selected school or form is no longer permitted', () => {
  const scope = setup(); scope.units = [scope.units[1]];
  const result = normalizePlanLocation({ view: 'programplaner', programplan: { offeringId: id, planId: other }, planning: { unitId: id } }, scope);
  assert.equal(result.location.programplan, null); assert.equal(result.selection.unitId, other); assert.ok(result.normalizationNotice);
});

test('schoolform changes close GY plan/source and GR references before choosing the new form', () => {
  for (const kind of ['plan', 'source']) {
    const changed = planningLocationChange({ view: 'timplaner', gym: { kind, id } }, { schoolform: 'grundskola' }, setup());
    assert.equal(changed.location.gym, null); assert.equal(changed.selection.schoolform, 'grundskola'); assert.equal(changed.selection.page, 1);
  }
  const changed = planningLocationChange({ view: 'timplaner', gym: null, other: { kind: 'grundskola', id, columnId: 'ak8', version: 3 } },
    { schoolform: 'introduktionsprogram' }, setup());
  assert.equal(changed.location.other, undefined); assert.equal(changed.selection.schoolform, 'introduktionsprogram');
});

test('first setup normalizes an invalid requested school without inventing a prior revoked mandate', () => {
  const fresh = setup(); fresh.units = [fresh.units[1]];
  assert.equal(planningReadScopeLost(null, fresh), false);
  const result = normalizePlanLocation({ view: 'timplaner', gym: null, planning: { unitId: id } }, fresh);
  assert.equal(result.selection.unitId, other); assert.ok(result.normalizationNotice);
});
test('fresh actual scope revokes the earlier selected school or its exact read capability', () => {
  for (const view of ['programplaner', 'timplaner']) {
    const before = setup(), location = view === 'programplaner' ? { view, programplan: null } : { view, gym: null };
    const selection = normalizePlanLocation(location, before).selection;
    const missing = setup(); missing.units = [missing.units[1]];
    assert.equal(planningReadScopeLost({ setup: before, selection }, missing), true);
    const revoked = setup(); revoked.units[0].canRead[selection.view === 'programplan' ? 'programplan' : selection.schoolform] = false;
    assert.equal(planningReadScopeLost({ setup: before, selection }, revoked), true);
  }
});
test('all-schools scope loses permission if any formerly readable selected school disappears or loses its form', () => {
  const before = setup(), selection = normalizePlanLocation({ view: 'timplaner', gym: null, planning: { unitId: null, schoolform: 'grundskola' } }, before).selection;
  const removed = setup(); removed.units = [removed.units[0]];
  assert.equal(planningReadScopeLost({ setup: before, selection }, removed), true);
  const changed = setup(); changed.units[1].canRead.grundskola = false;
  assert.equal(planningReadScopeLost({ setup: before, selection }, changed), true);
});
test('name, year, unselected schools and unrelated form changes are not a selected scope revocation', () => {
  const before = setup(), selection = normalizePlanLocation({ view: 'timplaner', gym: null }, before).selection;
  const fresh = setup(); fresh.units = [fresh.units[0]]; fresh.units[0].schoolName = 'Nytt namn'; fresh.units[0].canRead.grundskola = false;
  fresh.serverDate = '2027-08-01'; fresh.currentYear = 2027;
  assert.equal(planningReadScopeLost({ setup: before, selection }, fresh), false);
  const anotherCustomer = setup(); anotherCustomer.customerId = other;
  assert.equal(planningReadScopeLost({ setup: before, selection }, anotherCustomer), true);
});
