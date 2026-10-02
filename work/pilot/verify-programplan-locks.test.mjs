import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { cleanupProgramplanFixture, extractProgramplanFixture, withProgramplanTarget, programplanWorkerNames } from './verify-programplan-locks.mjs';

test('fixture extraction randomizes the complete owned graph and refuses ambiguous markers or unsafe blocks', async () => {
  const source = await readFile(new URL('../../supabase/tests/phase5_programplan_drafts.test.sql',import.meta.url),'utf8');
  const extracted = extractProgramplanFixture(source,'abcdef12');
  assert.ok(extracted.includes('abcdef12-0000-4000-8000-000000000001'));
  assert.ok(extracted.includes('https://abcdef12.programplan.example.test'));
  assert.equal(extracted.includes('55008000'),false);
  assert.equal(extracted.includes('select * from finish()'),false);
  assert.throws(()=>extractProgramplanFixture(source,'not-a-scope'));
  assert.throws(()=>extractProgramplanFixture(`${source}\n-- End programplan fixture.`,'abcdef12'));
  assert.throws(()=>extractProgramplanFixture(source.replace('-- End programplan fixture.','grant execute on all functions to public;\n-- End programplan fixture.'),'abcdef12'));
});
test('target refusal occurs before any database or fixture callback can run', async () => {
  let called=false;
  await assert.rejects(withProgramplanTarget(async name=>{assert.equal(name,'protected');throw new Error('REFUSED: remote target');},async()=>{called=true;}),/REFUSED/);
  assert.equal(called,false);
});
test('cleanup refuses ownership mismatch before any destructive statement', async () => {
  const statements=[];
  const tx=(strings)=>{statements.push(strings.join('?'));return Promise.resolve([{owned:false}]);};
  const db={begin:callback=>callback(tx)};
  await assert.rejects(cleanupProgramplanFixture(db,'abcdef12'),/fixture_cleanup_refused/);
  assert.equal(statements.length,1);
  assert.equal(statements.some(s=>/delete|replication_role/iu.test(s)),false);
});
test('owned cleanup preserves audit rows and referenced identities and reports retained anchors honestly', async () => {
  const statements=[];
  const remaining={customers:0,sessions:0,plans:0,receipts:0,educationevents:0,offerings:0,mandates:0,preservedAuditEvents:4,preservedAuditAnchors:2};
  const db=async(strings)=>{statements.push(strings.join('?'));return [remaining];};
  db.begin=async callback=>callback(async(strings)=>{statements.push(strings.join('?'));return [{owned:true}];});
  assert.deepEqual(await cleanupProgramplanFixture(db,'abcdef12'),remaining);
  assert.equal(statements.some(s=>/delete from public.security_events/iu.test(s)),false);
  assert.ok(statements.some(s=>/delete from public.identities.*not exists/iu.test(s)));
  assert.equal(statements.some(s=>/delete from public.programplan_catalogs/iu.test(s)),false);
  assert.ok(statements.filter(s=>s.includes('delete from')).every(s=>s.includes('where')));
});
test('import does not connect, create a report or replace existing evidence', async () => {
  const output=new URL('./results/phase5-08-locks.json',import.meta.url);
  const before=await stat(output).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  const bytes=before?await readFile(output,'utf8'):null;
  await import(`${new URL('./verify-programplan-locks.mjs',import.meta.url).href}?import-safety`);
  const after=await stat(output).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  assert.equal(after?.mtimeMs??null,before?.mtimeMs??null);
  if(after)assert.equal(await readFile(output,'utf8'),bytes);
});

test('SQL-låsprovet använder explicit stängd eller åtta-kommandoprofil',()=>{assert.equal(programplanWorkerNames().length,3);assert.equal(programplanWorkerNames('programplan').length,8);assert.equal(programplanWorkerNames('programplan').includes('phase5_programplan_result'),false);assert.throws(()=>programplanWorkerNames('auto'));});

test('workspace locks profile is an explicit ten-function set',()=>{const names=programplanWorkerNames('workspace');assert.equal(names.length,10);assert.ok(names.includes('phase5_programplan_workspace'));assert.ok(names.includes('phase5_list_programplan_offerings'));assert.equal(names.includes('phase5_programplan_workspace_audit'),false);});
