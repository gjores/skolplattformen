import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_CASES, parseArgs, overallStatus } from './verify-register.mjs';

const passed = (name) => ({ name, status: 'PASS', checks: [
  { kind: 'response', ok: true }, { kind: 'persistent', ok: true },
] });

test('full PASS requires every named case and two independent forms of evidence', () => {
  assert.equal(REQUIRED_CASES.length, 18);
  assert.equal(overallStatus(REQUIRED_CASES.map(passed)), 'PASS');
  assert.equal(overallStatus(REQUIRED_CASES.slice(1).map(passed)), 'FAIL');
  assert.equal(overallStatus([...REQUIRED_CASES.slice(1).map(passed), passed(REQUIRED_CASES[1])]), 'FAIL');
  assert.equal(overallStatus(REQUIRED_CASES.map(name => name === REQUIRED_CASES[0]
    ? { name, status: 'PASS', checks: [{ kind: 'response', ok: true }, { kind: 'response', ok: true }] }
    : passed(name))), 'FAIL');
});

test('partial selection and missing evidence cannot become PASS', () => {
  assert.equal(overallStatus([passed(REQUIRED_CASES[0])], { subset: true }), 'PARTIAL');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), checks: [{ kind: 'response', ok: true }] }], { subset: true }), 'FAIL');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), status: 'BLOCKED' }], { subset: true }), 'BLOCKED');
  assert.equal(overallStatus([{ ...passed(REQUIRED_CASES[0]), status: 'FAIL' }], { subset: true }), 'FAIL');
});

test('CLI rejects unknown cases, unsafe paths and invalid ports', () => {
  assert.throws(() => parseArgs(['--case', 'missing']), /okänt fall/u);
  assert.throws(() => parseArgs(['--out', 'somewhere/report.json']), /--out/u);
  assert.throws(() => parseArgs(['--port', '80']), /port/u);
  assert.throws(() => parseArgs(['--linked']), /okänt argument/u);
  const opts = parseArgs(['--case', REQUIRED_CASES[0], '--case', REQUIRED_CASES[1]]);
  assert.equal(opts.subset, true);
  assert.deepEqual(opts.cases, REQUIRED_CASES.slice(0, 2));
});

test('period probes select today within the actor school and leave durable future/history untouched',async()=>{
 const {currentRegisterProbePeriods}=await import('./verify-register.mjs');
 const placements=[
  {id:'future',unit_id:'school',starts_on:'2026-11-01',ends_on:null},
  {id:'current',unit_id:'school',starts_on:'2026-09-01',ends_on:'2026-10-31'},
  {id:'past',unit_id:'school',starts_on:'2025-09-01',ends_on:'2026-08-31'},
 ];
 const classes=[
  {class_id:'futureClass',unit_id:'school',placement_id:'future',starts_on:'2026-11-01',ends_on:null},
  {class_id:'currentClass',unit_id:'school',placement_id:'current',starts_on:'2026-09-15',ends_on:'2026-10-31'},
  {class_id:'pastClass',unit_id:'school',placement_id:'current',starts_on:'2026-09-01',ends_on:'2026-09-14'},
 ];
 const before=JSON.stringify({placements,classes});
 const own=currentRegisterProbePeriods(placements,classes,'2026-10-05','school');
 assert.deepEqual(own.placements,[{...placements[1],ends_on:null}]);
 assert.deepEqual(own.classes,[{...classes[1],ends_on:null}]);
 assert.equal(JSON.stringify({placements,classes}),before);
 assert.throws(()=>currentRegisterProbePeriods(placements,classes,'2026-10-05','otherSchool'),/scoped placement/);
 assert.throws(()=>currentRegisterProbePeriods([...placements,{...placements[1],id:'duplicate'}],classes,'2026-10-05','school'),/not unique/);
 assert.throws(()=>currentRegisterProbePeriods(placements,classes.filter(c=>c.class_id!=='currentClass'),'2026-10-05','school'),/scoped class/);
});
test('period probe dates accept database Date values and inclusive final day',async()=>{
 const {currentRegisterProbePeriods}=await import('./verify-register.mjs');
 const placement={id:'p',unit_id:'s',starts_on:new Date('2026-09-01T00:00:00Z'),ends_on:new Date('2026-10-05T00:00:00Z')};
 const classes=[{placement_id:'p',unit_id:'s',class_id:'c',starts_on:'2026-09-01',ends_on:'2026-10-05'}];
 assert.equal(currentRegisterProbePeriods([placement],classes,'2026-10-05','s').classes[0].class_id,'c');
 assert.throws(()=>currentRegisterProbePeriods([placement],classes,'2026-10-06','s'),/scoped placement/);
});
