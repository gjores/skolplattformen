import test from 'node:test';
import assert from 'node:assert/strict';
import { readPlanLocation, readPlanLocationResult, planLocationQuery, normalizePlanLocation, planningLocationChange, planningReadScopeLost, planningCollectionLocation } from './protected-plan-location.ts';
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


test('overview is an explicit whitelist marker with the unchanged program/timplan collection contract', () => {
  for (const view of ['programplaner', 'timplaner']) for (const overview of [true, false]) {
    const location = { view, ...(view === 'programplaner' ? { programplan: null } : { gym: null }), overview,
      planning: { schoolYear: 2027, unitId: other, schoolform: 'gymnasium', query: 'lokal kod' } };
    assert.deepEqual(readPlanLocation(planLocationQuery(location)), location);
    assert.equal(normalizePlanLocation(location, setup()).selection.view, view === 'programplaner' ? 'programplan' : 'timplan');
  }
  for (const marker of ['true', 'yes', '2', '', '01', '1&planeringsoversikt=0']) {
    const result = readPlanLocationResult('?vy=timplaner&planeringsoversikt='+marker);
    assert.ok(result.normalizationNotice); assert.equal(result.location.overview, undefined);
  }
  assert.equal(readPlanLocation('?vy=elever&planeringsoversikt=1'), null);
});
test('overview URL parsing, serialization and canonical normalization never retain an open writer', () => {
  const targets = [{ view: 'programplaner', programplan: { offeringId: id, planId: other, version: 3, unitId: id } },
    { view: 'timplaner', gym: { kind: 'plan', id, offeringId: other, version: 2, unitId: id } },
    { view: 'timplaner', gym: null, other: { kind: 'grundskola', id, columnId: 'ak8', version: 2 } }];
  for (const target of targets) {
    const result = readPlanLocationResult(planLocationQuery(target)+'&planeringsoversikt=1&planeringsrelativar=2');
    assert.ok(result.normalizationNotice);assert.equal(result.location.overview,true);
    assert.equal(result.location.relativeYear,undefined);assert.equal(result.location.view === 'programplaner' ? result.location.programplan : result.location.gym,null);assert.equal(result.location.other,undefined);
    const query = planLocationQuery({...target,overview:true,relativeYear:2,allYears:true});
    for (const key of ['programplan','utbildning','timplan','programunderlag','ovrigtimplan','planeringsrelativar','planeringsallaar','programplansversion','timplansversion']) assert.equal(new URLSearchParams(query).has(key),false);
    const normalized = normalizePlanLocation({...target,overview:true,relativeYear:2},setup());
    assert.equal(normalized.location.overview,true);assert.equal(normalized.location.view === 'programplaner' ? normalized.location.programplan : normalized.location.gym,null);assert.equal(normalized.location.other,undefined);
  }
});
test('overview Back/reload keeps canonical year/school/filter and discards list revision-bound pages', () => {
  const first = normalizePlanLocation({view:'timplaner',gym:null,overview:true,planning:{schoolYear:2028,unitId:other,schoolform:'grundskola',query:'kod',grade:8,page:2,selectionRevision:rev}},setup());
  assert.equal(first.selection.page,1);assert.equal(first.selection.selectionRevision,null);
  const restored=normalizePlanLocation(readPlanLocation(planLocationQuery(first.location)),setup());
  assert.deepEqual(restored.location,first.location);assert.deepEqual(restored.selection,first.selection);
  assert.equal(restored.selection.query,'kod');assert.equal(restored.selection.unitId,other);assert.equal(restored.selection.schoolYear,2028);
});
test('year/school/form changes preserve overview without recreating targets; real scope loss still forces clear', () => {
  const location=normalizePlanLocation({view:'timplaner',gym:null,overview:true,planning:{schoolYear:2027,unitId:id,schoolform:'grundskola',query:'bevara'}},setup()).location;
  for (const patch of [{schoolYear:2028},{unitId:other},{schoolform:'introduktionsprogram'}]) {
    const next=planningLocationChange(location,patch,setup());assert.equal(next.location.overview,true);assert.equal(next.location.gym,null);assert.equal(next.location.other,undefined);
    assert.equal(next.selection.page,1);assert.equal(next.selection.selectionRevision,null);assert.equal(next.selection.query,'bevara');
  }
  const before=normalizePlanLocation(location,setup()),fresh=setup();fresh.units=fresh.units.filter(u=>u.unitId!==id);
  assert.equal(planningReadScopeLost({setup:setup(),selection:before.selection},fresh),true);
  assert.equal(normalizePlanLocation(location,fresh).location.overview,true);
});
test('explicit overview collection selection resets filters, page and targets while retaining actual year/scope', () => {
  const original={view:'programplaner',programplan:{offeringId:id,planId:other},planning:{schoolYear:2029,unitId:null,query:'old',status:'utkast',cohortRelation:'future',archive:'all',grade:2,sort:'version',direction:'desc',page:2,selectionRevision:rev}};
  for (const [view,form] of [['programplan','gymnasium'],['timplan','gymnasium'],['timplan','grundskola'],['timplan','introduktionsprogram']]) {
    const next=planningCollectionLocation(original,view,form,setup());assert.equal(next.location.overview,true);assert.equal(next.selection.view,view);assert.equal(next.selection.schoolform,form);
    assert.equal(next.selection.schoolYear,2029);assert.equal(next.selection.unitId,null);assert.equal(next.selection.query,'');assert.equal(next.selection.status,'all');
    assert.equal(next.selection.cohortRelation,'relevant');assert.equal(next.selection.archive,'active');assert.equal(next.selection.grade,null);assert.equal(next.selection.sort,'name');assert.equal(next.selection.direction,'asc');
    assert.equal(next.selection.page,1);assert.equal(next.selection.selectionRevision,null);assert.equal(next.location.view === 'programplaner' ? next.location.programplan : next.location.gym,null);
  }
  assert.throws(()=>planningCollectionLocation(original,'programplan','grundskola',setup()));
});
test('exact program and gym plan/source metadata survives reload but never establishes school authority', () => {
  const targets=[{view:'programplaner',programplan:{offeringId:id,planId:other,unitId:id,version:3}},
    ...['plan','source'].map(kind=>({view:'timplaner',gym:{kind,id,unitId:id,offeringId:other,version:3}}))];
  for (const target of targets) {
    assert.deepEqual(readPlanLocation(planLocationQuery(target)),target);
    const denied=normalizePlanLocation({...target,planning:{unitId:other}},setup());assert.equal(denied.location.view === 'programplaner' ? denied.location.programplan : denied.location.gym,null);
    const changed=planningLocationChange(target,{unitId:other},setup());assert.equal(changed.location.view === 'programplaner' ? changed.location.programplan : changed.location.gym,null);
  }
  for(const query of [`?vy=programplaner&utbildning=${id}&programplan=${other}&programplansversion=0`,
    `?vy=timplaner&timplan=${id}&timplansversion=0`,`?vy=timplaner&programunderlag=${id}&timplansskola=bad`,
    `?vy=timplaner&timplan=${id}&timplansversion=2&timplansversion=3`]) assert.ok(readPlanLocationResult(query).normalizationNotice);
});

test('ambiguous overview markers cannot open a supplied plan and exact permitted target school survives missing global selection', () => {
  for (const marker of ['true', '1&planeringsoversikt=0']) {
    const parsed=readPlanLocationResult(`?vy=programplaner&utbildning=${id}&programplan=${other}&planeringsoversikt=${marker}`);
    assert.ok(parsed.normalizationNotice);assert.equal(parsed.location.programplan,null);
  }
  const target={view:'timplaner',gym:{kind:'plan',id,unitId:other,offeringId:id,version:2}};
  const permitted=normalizePlanLocation(readPlanLocation(planLocationQuery(target)),setup());
  assert.equal(permitted.selection.unitId,other);assert.deepEqual(permitted.location.gym,target.gym);
  const foreign=normalizePlanLocation({...target,gym:{...target.gym,unitId:'55004000-0000-4000-8000-000000000099'}},setup());
  assert.equal(foreign.location.gym,null);assert.equal(foreign.selection.unitId,id);assert.ok(foreign.normalizationNotice);
});
