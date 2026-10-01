import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { programplanBrowserBuildProof,verifyProgramplanBrowserTarget } from './phase5-programplan-browser-fixtures.mjs';
import { summarizeProgramplanBrowser } from './verify-programplan-browser.mjs';
const source='a'.repeat(40),build='b'.repeat(40),mark={mode:'protected',revision:build},health={ok:true,role:'skolplattform_worker',runtime:'workerd'};
test('browser provenance refuses dirty/stale sources and a dev/server-owner runtime',()=>{
  assert.deepEqual(programplanBrowserBuildProof(mark,source,false,true,health),{sourceRevision:source,buildRevision:build});
  for(const args of [[mark,source,true,true,health],[mark,source,false,false,health],[{mode:'example',revision:build},source,false,true,health],
    [{mode:'protected',revision:'unknown'},source,false,true,health],[mark,source,false,true,{...health,runtime:'node'}],
    [mark,source,false,true,{...health,role:'postgres'}],[mark,source,false,true,{...health,ok:false}]])assert.throws(()=>programplanBrowserBuildProof(...args));
});
test('non-loopback browser targets are refused before configuration, database or fetch',async()=>{
  for(const url of ['https://127.0.0.1:3056','http://localhost:3056','http://127.0.0.1:3056/path','http://example.test:3056','http://127.0.0.1:3056@evil.test'])await assert.rejects(verifyProgramplanBrowserTarget(url),/Endast lokal/u);
});
test('fixture imports have no database/run/report side effects',()=>{
  const url=new URL('./phase5-programplan-browser-fixtures.mjs',import.meta.url).href;
  const result=spawnSync(process.execPath,['--input-type=module','-e',`const m=await import(${JSON.stringify(url)});if(typeof m.createProgramplanBrowserFixture!=='function')throw Error('missing');`],{encoding:'utf8'});
  assert.equal(result.status,0);assert.equal(result.stdout,'');assert.equal(result.stderr,'');
});
test('browser summary fails on missing/skipped/duplicated cases, stale provenance or absent cleanup',()=>{
  const proof={sourceRevision:source,buildRevision:build};
  const attachment=(name,value)=>({name,body:Buffer.from(JSON.stringify(value)).toString('base64')});
  const cleanup={customers:0,sessions:0,plans:0,offerings:0,mandates:0,mintedSessions:0,triggers:0,functions:0,preservedAuditEvents:3,preservedAuditAnchors:1};
  const report=()=>({errors:[],suites:[{specs:Array.from({length:15},(_,i)=>({title:`${String(i+1).padStart(2,'0')}: flow`,tests:['programplan-desktop','programplan-phone'].map(projectName=>({projectName,expectedStatus:'passed',results:[{status:'passed',attachments:[attachment('cleanup.json',cleanup),...(i===0?[attachment('source-build.json',{...proof,scope:'local-synthetic-only'})]:[])]}]}))}))}]});
  assert.equal(summarizeProgramplanBrowser(report(),proof).status,'PASS');
  const advancedHead=report();const attachments=advancedHead.suites[0].specs[0].tests[1].results[0].attachments;
  attachments[1]=attachment('source-build.json',{...proof,sourceRevision:'c'.repeat(40),scope:'local-synthetic-only'});
  assert.equal(summarizeProgramplanBrowser(advancedHead,proof).status,'PASS');
  assert.deepEqual(summarizeProgramplanBrowser(advancedHead,proof).observedSourceRevisions,[source,'c'.repeat(40)]);
  const missed=report();missed.suites[0].specs.pop();assert.equal(summarizeProgramplanBrowser(missed,proof).status,'FAIL');
  const skipped=report();skipped.suites[0].specs[4].tests[0].results[0].status='skipped';assert.equal(summarizeProgramplanBrowser(skipped,proof).status,'FAIL');
  const duplicate=report();duplicate.suites[0].specs[3].title='01: duplicate';assert.equal(summarizeProgramplanBrowser(duplicate,proof).status,'FAIL');
  const unclean=report();unclean.suites[0].specs[5].tests[1].results[0].attachments=[];assert.equal(summarizeProgramplanBrowser(unclean,proof).status,'FAIL');
  assert.equal(summarizeProgramplanBrowser(report(),{...proof,buildRevision:source}).status,'FAIL');
});
