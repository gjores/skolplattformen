import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_CASES, REQUIRED_SELECTION_CASES, parseArgs, overallStatus, validWorkerFunctions } from './verify-timplan-api.mjs';
import { TIMPLAN_ENTRIES, PROGRAMPLAN_ENTRIES, WORKSPACE_ENTRIES, EDUCATION_ENTRIES, TERM_ENTRIES, LIFECYCLE_ENTRIES } from './verify-programplan-api.mjs';
const passed = name => ({ name, status: 'PASS', checks: [{ kind: 'response', ok: true }, { kind: 'persistent', ok: true }] });
test('livscykelprofilen kräver exakt sexton entrypoints och nekar extra eller saknad grant',()=>{
  const all=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES,...LIFECYCLE_ENTRIES];
  assert.equal(validWorkerFunctions(all,TIMPLAN_ENTRIES,true,true,true,true),true);
  for(const entries of [all.slice(1),[...all,'public.phase5_timplan_scope(uuid,boolean)'],[...all,all[0]],all.filter(f=>!LIFECYCLE_ENTRIES.includes(f))])assert.equal(validWorkerFunctions(entries,TIMPLAN_ENTRIES,true,true,true,true),false);
  assert.equal(validWorkerFunctions(all,TIMPLAN_ENTRIES,true,true,true),false);
  const args=parseArgs(['--target','protected','--out','/tmp/p522-timplan.json','--lifecycle']);
  for(const flag of ['selection','programplan','workspace','education','lifecycle'])assert.equal(args[flag],true);
  assert.throws(()=>parseArgs(['--target','protected','--out','/tmp/p522-timplan.json','--lifecycle','--preflight']));
});
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

test('explicit workspace profile cannot accept missing or extra signatures',()=>{const e=['public.phase5_read_timplan(uuid)','public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)','public.phase5_list_timplans(integer)'];const program=['public.phase5_read_programplan(uuid)','public.phase5_bind_programplan_draft(uuid,integer,jsonb)','public.phase5_replace_programplan_specialization(uuid,integer,jsonb)','public.phase5_create_programplan_draft(uuid,integer,jsonb)','public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)'];const workspace=['public.phase5_list_programplan_offerings(integer)','public.phase5_programplan_workspace(uuid,integer,text)'];const all=[...e,...program,...workspace];assert.equal(validWorkerFunctions(all,e,true,true),true);assert.equal(validWorkerFunctions(all.slice(1),e,true,true),false);assert.equal(validWorkerFunctions([...all,'helper'],e,true,true),false);assert.equal(parseArgs(['--target','protected','--out','/tmp/p510.json','--selection','--workspace']).workspace,true);assert.throws(()=>parseArgs(['--target','protected','--out','/tmp/p510.json','--workspace','--preflight']));});

test('education regression explicitly requires thirteen functions and retains closed helpers',()=>{const base=['public.phase5_read_timplan(uuid)','public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)','public.phase5_list_timplans(integer)'];const old=['public.phase5_read_programplan(uuid)','public.phase5_bind_programplan_draft(uuid,integer,jsonb)','public.phase5_replace_programplan_specialization(uuid,integer,jsonb)','public.phase5_create_programplan_draft(uuid,integer,jsonb)','public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)','public.phase5_list_programplan_offerings(integer)','public.phase5_programplan_workspace(uuid,integer,text)'];const added=['public.phase5_programplan_selection(uuid,text,jsonb)','public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb)','public.phase5_programplan_education_status(uuid)'],all=[...base,...old,...added];assert.equal(validWorkerFunctions(all,base,true,true,true),true);for(const subset of [all.slice(1),[...all,'public.phase5_programplan_unit(uuid,boolean)'],[...base,...old]])assert.equal(validWorkerFunctions(subset,base,true,true,true),false);assert.equal(validWorkerFunctions(all,base,true,true),false);assert.equal(parseArgs(['--target','protected','--out','/tmp/p515-timplan.json','--selection','--education']).education,true);assert.throws(()=>parseArgs(['--target','protected','--out','/tmp/p515-timplan.json','--education','--preflight']));});
