// The parent runner owns the schema-only snapshot, migrations and single built Worker.
// This spec owns only random OIDC fixtures and their scoped UI/HTTP scenario.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test} from '@playwright/test';
import {assertTarget} from '../../work/pilot/verify-target.mjs';
import {createAplPlanOidcFixture} from '../../work/pilot/apl-plan-oidc-fixtures.mjs';
import {runAplBrowserScenarios} from '../../work/pilot/apl-plan-browser-scenarios.mjs';
const postgres=createRequire(import.meta.url)('postgres');

test('APL: faktisk inloggning, perioder, återhämtning, beslut och exakta klasslänkar',async({browser},info)=>{
  const device=info.project.name==='apl-actual-desktop'?'desktop':'phone';
  assert.ok(['apl-actual-desktop','apl-actual-phone'].includes(info.project.name));
  const manifestPath=process.env.APL_ACTUAL_MANIFEST!,evidenceDir=process.env.APL_ACTUAL_EVIDENCE_DIR!;
  assert.ok(manifestPath.startsWith('/private/tmp/')&&evidenceDir.startsWith('/private/tmp/'));
  assert.equal(realpathSync(manifestPath),manifestPath);assert.equal(statSync(manifestPath).mode&0o077,0);
  assert.equal(statSync(evidenceDir).mode&0o077,0);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.kind,'apl-actual-owned-runtime');assert.equal(manifest.baseURL,'http://127.0.0.1:3014');assert.equal(process.env.PHASE5_BASE_URL,manifest.baseURL);
  assert.equal(manifest.provenance.dataCopied,false);assert.match(manifest.provenance.database,/^named_timplan_[a-f0-9]{32}$/u);
  const target=await assertTarget('protected',{requireIdp:true});assert.equal(target.projectId,manifest.provenance.sourceProject);
  const endpoint=new URL(target.dbUrl);assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.port,manifest.provenance.sourcePort);
  assert.notEqual(endpoint.pathname,'/'+manifest.provenance.database);endpoint.pathname='/'+manifest.provenance.database;
  // Credentials remain in memory. The private manifest contains only synthetic IDs and provenance.
  const db=postgres(endpoint.toString(),{max:1,prepare:false,onnotice:()=>{}});
  const ownDir=path.join(evidenceDir,'oidc-'+device);mkdirSync(ownDir,{mode:0o700});
  let fixture:Awaited<ReturnType<typeof createAplPlanOidcFixture>>|undefined;
  const checks:unknown[]=[];
  const cleanup:{status:string;cleanup?:unknown;proof?:unknown;databaseClosed?:boolean}={status:'FAIL'};
  try {
    const [identity]=await db`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;
    assert.equal(identity.database,manifest.provenance.database);assert.equal(identity.system_identifier,manifest.provenance.source.system_identifier);
    fixture=await createAplPlanOidcFixture({snapshot:{db,provenance:manifest.provenance},runtime:{baseURL:manifest.baseURL},evidenceDir:ownDir,seed:manifest.seeds[device]});
    const result=await runAplBrowserScenarios({fixture,browser,device,snapshot:{db},checks,evidenceDir});
    assert.equal(result.status,'PASS');
    await info.attach('actual-checks',{body:JSON.stringify(checks),contentType:'application/json'});
  }finally {
    try {if(fixture){cleanup.cleanup=await fixture.cleanup();cleanup.proof=fixture.proof();cleanup.status='PASS';}}
    finally {await db.end();cleanup.databaseClosed=true;writeFileSync(path.join(evidenceDir,`oidc-${device}.json`),JSON.stringify(cleanup,null,2)+'\n',{mode:0o600});}
  }
});
