import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_CASES, REQUIRED_SELECTION_CASES, parseArgs, overallStatus, validWorkerFunctions } from './verify-timplan-api.mjs';
const passed = name => ({ name, status: 'PASS', checks: [{ kind: 'response', ok: true }, { kind: 'persistent', ok: true }] });
test('alla namngivna fall och oberoende beständigt bevis krävs', () => {
  assert.equal(overallStatus(REQUIRED_CASES.map(passed)), 'PASS');
  assert.equal(overallStatus(REQUIRED_CASES.slice(1).map(passed)), 'FAIL');
  assert.equal(overallStatus([...REQUIRED_CASES.slice(1).map(passed), passed(REQUIRED_CASES[1])]), 'FAIL');
  assert.equal(overallStatus(REQUIRED_CASES.map((name, i) => i === 0 ? { ...passed(name), checks: [{ kind: 'response', ok: true }] } : passed(name))), 'FAIL');
  assert.equal(overallStatus(REQUIRED_CASES.map((name, i) => i === 0 ? { ...passed(name), checks: [{ kind: 'response', ok: false }, { kind: 'persistent', ok: true }] } : passed(name))), 'FAIL');
});
test('endast explicit lokalt protected-mål, säker rapportkatalog och port', () => {
  assert.throws(() => parseArgs([]), /target/u);
  assert.throws(() => parseArgs(['--target','baseline']), /target/u);
  assert.throws(() => parseArgs(['--target','protected','--out','report.json']), /out/u);
  assert.throws(() => parseArgs(['--target','protected','--out','/tmp/timplan.json','--port','80']), /port/u);
  assert.throws(() => parseArgs(['--target','protected','--out','/tmp/timplan.json','--linked']), /okänt/u);
  assert.equal(parseArgs(['--target','protected','--out','/tmp/timplan.json','--preflight']).preflight, true);
});

test('listdelen kräver alla gamla och nya bevis, inte ett delurval', () => {
  assert.equal(overallStatus(REQUIRED_SELECTION_CASES.map(passed), REQUIRED_SELECTION_CASES), 'PASS');
  assert.equal(overallStatus(REQUIRED_CASES.map(passed), REQUIRED_SELECTION_CASES), 'FAIL');
  assert.equal(parseArgs(['--target','protected','--out','/tmp/timplan.json','--selection','--preflight']).selection, true);
});

test('explicit programplansprofil tillåter exakt åtta signaturer och aldrig en helper',()=>{const old=['public.phase5_read_timplan(uuid)','public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)','public.phase5_list_timplans(integer)'];const added=['public.phase5_read_programplan(uuid)','public.phase5_bind_programplan_draft(uuid,integer,jsonb)','public.phase5_replace_programplan_specialization(uuid,integer,jsonb)','public.phase5_create_programplan_draft(uuid,integer,jsonb)','public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)'];assert.equal(validWorkerFunctions(old,old),true);assert.equal(validWorkerFunctions([...old,...added],old,true),true);assert.equal(validWorkerFunctions([...old,...added,'public.phase5_programplan_result(uuid)'],old,true),false);assert.equal(validWorkerFunctions([...old,...added],old,false),false);assert.equal(parseArgs(['--target','protected','--out','/tmp/timplan.json','--selection','--programplan']).programplan,true);});
