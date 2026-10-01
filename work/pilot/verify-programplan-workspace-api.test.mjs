import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceArgs, workspaceStatus, workspaceTarget, WORKSPACE_ENTRIES, REQUIRED_CASES } from './verify-programplan-workspace-api.mjs';
import { withTemporaryGrants, exactFunctions } from './verify-programplan-api.mjs';
const pass=name=>({name,status:'PASS',checks:[{kind:'response',ok:true},{kind:'persistent',ok:true}]});
test('workspace matrix requires every unique named case and persistent evidence',()=>{
 assert.equal(workspaceStatus(REQUIRED_CASES.map(pass)),'PASS');assert.equal(workspaceStatus(REQUIRED_CASES.slice(1).map(pass)),'FAIL');
 assert.equal(workspaceStatus([...REQUIRED_CASES.map(pass),pass(REQUIRED_CASES[0])]),'FAIL');
 for(const mutate of [c=>c.status='SKIP',c=>c.checks.pop(),c=>c.checks[0].ok=false]){const values=REQUIRED_CASES.map(pass);mutate(values[0]);assert.equal(workspaceStatus(values),'FAIL');}
});
test('imports are inert, target/path are explicit and exactly two workspace signatures exist',async()=>{
 for(const args of[[],['--target','baseline'],['--target','protected','--out','report.json'],['--target','protected','--out','/tmp/p510.json','--port','80'],['--target','protected','--out','/tmp/p510.json','--linked']])assert.throws(()=>workspaceArgs(args));
 assert.equal(workspaceArgs(['--target','protected','--out','/tmp/p510.json','--preflight']).preflight,true);assert.equal(WORKSPACE_ENTRIES.length,2);
 assert.equal(exactFunctions([...WORKSPACE_ENTRIES,'public.phase5_programplan_education(offerings)'],WORKSPACE_ENTRIES),false);
 let called=false;await assert.rejects(()=>workspaceTarget(async target=>{assert.equal(target,'protected');throw Error('REFUSED');},()=>{called=true;}));assert.equal(called,false);
});
test('partial grant or execution failures restore exact ACL and restoration failure cannot pass',async()=>{
 for(const fail of['grant','execute',null]){const trace=[];const fn=()=>withTemporaryGrants(['exact prior ACL'],async()=>{trace.push('grant');if(fail==='grant')throw Error('grant');},async before=>{assert.deepEqual(before,['exact prior ACL']);trace.push('restore');},async()=>{trace.push('verify');return true;},async()=>{trace.push('execute');if(fail==='execute')throw Error('execute');return'PASS';});if(fail)await assert.rejects(fn);else assert.equal(await fn(),'PASS');assert.deepEqual(trace.slice(-2),['restore','verify']);}
 await assert.rejects(()=>withTemporaryGrants([],async()=>{},async()=>{},async()=>false,async()=>'PASS'),/acl_restore_failed/u);
});
