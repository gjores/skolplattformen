#!/usr/bin/env node
// Isolated actual Worker + OIDC + PostgreSQL + desktop/phone evidence. No live DDL or 3012 switch.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,cpSync,realpathSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createNamedTimplanSnapshot} from './named-timplan-snapshot.mjs';
import {createNamedTimplanRuntime} from './named-timplan-runtime.mjs';
import {createAplPlanOidcFixture,recoverAplOidcFixture} from './apl-plan-oidc-fixtures.mjs';
import {seedAplUxActualFixture} from './apl-ux-fixtures.mjs';
import {runAplTermIntentBrowserScenarios,runAplTermIntentApiScenarios} from './apl-term-intent-browser-scenarios.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {productSources,sha} from './apply-apl-plan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(path.join(root,'web/package.json'));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const delta='20261016130000_apl_term_intent.sql';
const migrationSources=()=>Object.fromEntries([delta].map(n=>['supabase/migrations/'+n,sha(readFileSync(path.join(root,'supabase/migrations',n)))]));
const verificationFiles=['work/pilot/verify-apl-term-intent-api.mjs','work/pilot/apl-term-intent-browser-scenarios.mjs'];
function verificationSources(){
 const files=new Set(),ts=require('typescript');
 const include=file=>{assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));if(files.has(file))return;
  const absolute=path.join(root,file);assert.ok(existsSync(absolute),'Missing verification dependency: '+file);files.add(file);
  const syntax=ts.createSourceFile(absolute,readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
  for(const statement of syntax.statements){if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement)))continue;
   const specifier=statement.moduleSpecifier;if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue;
   const dependency=path.relative(root,path.resolve(path.dirname(absolute),specifier.text));
   if(/\.(?:mjs|js|ts|tsx)$/u.test(dependency))include(dependency);
   else if(!path.extname(dependency)){const resolved=['.ts','.tsx','.mjs','.js'].map(ext=>dependency+ext).find(p=>existsSync(path.join(root,p)));if(resolved)include(resolved);}
  }
 };verificationFiles.forEach(include);return Object.fromEntries([...files].sort((a,b)=>a<b?-1:a>b?1:0).map(file=>[file,sha(readFileSync(path.join(root,file)))]));
}
export async function verifyAplTermIntentActual({build,out}) {
 const originalBuild=realpathSync(build);out=path.resolve(out);
 assert.ok(originalBuild.startsWith(path.join(root,'work/pilot/targets/protected/runtime/')),'Only an owned separately built candidate is allowed');
 assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));assert.equal(existsSync(out),false);
 const evidenceDir=out.slice(0,-5)+'-evidence';mkdirSync(evidenceDir,{mode:0o700});chmodSync(evidenceDir,0o700);
 const initialSources=productSources(),initialMigrations=migrationSources(),initialVerification=verificationSources();
 const mark=JSON.parse(readFileSync(path.join(originalBuild,'build-mode.json'),'utf8'));assert.equal(mark.mode,'protected');
 assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...Object.keys(initialSources)]),'','Candidate product does not match current committed sources');
 const buildRoot=path.join(root,'work/pilot/targets/protected/runtime/apl-'+randomUUID());cpSync(originalBuild,buildRoot,{recursive:true,filter:p=>!p.endsWith('/.dev.vars')});
 const report={kind:'apl-term-intent-actual-api-browser',status:'FAIL',startedAt:new Date().toISOString(),build:mark,sourceRevision:git(['rev-parse','HEAD']),sources:initialSources,migrationSources:initialMigrations,
  verificationSources:initialVerification,browserEvidence:{},checks:[],limits:['Own schema-only database and synthetic identities/classes only; no live rows copied or business writes on3012',
   'No external SS12000 exchange or completed APL evidence','No authentication/business/transport mocks; browser scenarios run once per device, retries 0']};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 let snapshot,runtime,fixture,browser,failure;
 try {
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const seeds={};for(const name of ['desktop','phone','api']){
   const connection=await snapshot.connect();
   try{seeds[name]=await seedAplUxActualFixture({...snapshot,db:connection});}
   finally{await connection.end();}
  }
  await snapshot.db.begin(async tx=>{await tx`set constraints all immediate`;for(const name of [delta])await tx.unsafe(readFileSync(path.join(root,'supabase/migrations',name),'utf8'));});
  report.scope=Object.fromEntries(Object.entries(seeds).map(([key,s])=>[key,{customerId:s.ids[1],unitId:s.ids[30],programId:s.programId,legacyPlanId:s.planId}]));
  runtime=await createNamedTimplanRuntime({snapshot,buildRoot,evidenceDir});report.runtime=runtime.proof;save();
  report.browserRuns={retries:0,workers:1,devices:['desktop-chromium','phone-webkit']};
  for(const device of ['desktop','phone']) {
   const ownDir=path.join(evidenceDir,'oidc-'+device);mkdirSync(ownDir,{mode:0o700});
   let deviceFixture,deviceBrowser;
   const cleanup={status:'FAIL'};
   try {
    deviceFixture=await createAplPlanOidcFixture({snapshot,runtime,evidenceDir:ownDir,seed:seeds[device]});
    deviceBrowser=await require('@playwright/test')[device==='phone'?'webkit':'chromium'].launch({headless:true});
    await runAplTermIntentBrowserScenarios({fixture:deviceFixture,browser:deviceBrowser,device,snapshot,checks:[],evidenceDir});
   }finally {
    try{if(deviceBrowser)await deviceBrowser.close();}finally{
     if(deviceFixture){cleanup.cleanup=await deviceFixture.cleanup();cleanup.proof=deviceFixture.proof();cleanup.status='PASS';}
    }
    writeFileSync(path.join(evidenceDir,'oidc-'+device+'.json'),JSON.stringify(cleanup,null,2)+'\n',{mode:0o600});
    const file=path.join(evidenceDir,`browser-${device}.json`);
    if(existsSync(file)){
     const result=JSON.parse(readFileSync(file,'utf8'));report.browserEvidence[device]={path:file,sha256:sha(readFileSync(file)),result,visualReview:'pending',screenshotHashes:Object.fromEntries(result.screenshots.map(s=>[s.file,sha(readFileSync(path.join(evidenceDir,s.file)))]))};
     report.checks.push(...result.checks.map(c=>({...c,name:device+': '+c.name})));
    }
    save();
   }
   assert.equal(report.browserEvidence[device]?.result.status,'PASS');
  }
  const apiDir=path.join(evidenceDir,'oidc-api');mkdirSync(apiDir,{mode:0o700});
  fixture=await createAplPlanOidcFixture({snapshot,runtime,evidenceDir:apiDir,seed:seeds.api});
  browser=await require('@playwright/test').chromium.launch({headless:true});report.api=await runAplTermIntentApiScenarios({fixture,browser,snapshot,checks:report.checks});save();
  report.finalSources=productSources();report.finalMigrationSources=migrationSources();report.finalVerificationSources=verificationSources();report.finalArtifact=artifactManifest(buildRoot);
  assert.deepEqual(report.finalSources,initialSources);assert.deepEqual(report.finalMigrationSources,initialMigrations);assert.deepEqual(report.finalVerificationSources,initialVerification);assert.deepEqual(report.finalArtifact,runtime.proof.artifact);
  report.status='PASS';
 }catch(error){failure=error;report.failureCode=error.code??'ASSERTION';report.failure=error.message;writeFileSync(path.join(evidenceDir,'failure.txt'),String(error.stack),{mode:0o600});}
 finally {
  if(browser)try{await browser.close();}catch(error){failure??=error;report.status='FAIL';report.browserCleanup={cleanup:'failed'};}
  const oidc=[];
  if(fixture)try{const cleanup=await fixture.cleanup();report.oidc=fixture.proof();writeFileSync(path.join(evidenceDir,'oidc-api.json'),JSON.stringify({status:'PASS',cleanup,proof:report.oidc})+'\n',{mode:0o600});}
   catch(error){failure??=error;report.status='FAIL';report.apiFixtureCleanupFailure=error.code??'cleanup';}
  for(const device of ['desktop','phone','api']){
   const file=path.join(evidenceDir,`oidc-${device}.json`),journal=path.join(evidenceDir,'oidc-'+device,'oidc-private.json');
   const proof=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;
   if(proof?.cleanup?.cleanup==='complete')oidc.push(proof.cleanup);
   else if(existsSync(journal))try{oidc.push(await recoverAplOidcFixture(journal));}catch(error){failure??=error;oidc.push({cleanup:'failed',code:error.code??'cleanup'});}
  }
  const expectedFixtures=['desktop','phone','api'].filter(device=>existsSync(path.join(evidenceDir,'oidc-'+device,'oidc-private.json'))).length;
  report.oidcCleanup={cleanup:oidc.length===expectedFixtures&&oidc.every(p=>p.cleanup==='complete')?'complete':'incomplete',expectedFixtures,verifiedCallbacks:oidc.reduce((sum,p)=>sum+(p.verifiedCallbacks??0),0),fixtures:oidc};
  for(const [key,object]of [['runtimeCleanup',runtime],['snapshotCleanup',snapshot]])if(object)try{report[key]=await object.cleanup();}catch(error){report[key]={cleanup:'failed',code:error.code??'cleanup'};failure??=error;report.status='FAIL';}
  if(report.oidcCleanup.cleanup!=='complete')report.status='FAIL';report.finishedAt=new Date().toISOString();save();
 }
 console.log(`${report.status}: ${report.checks.length} actual APL term-intent checks; private report ${out}`);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);assert.deepEqual([args[0],args[2]],['--build','--out']);assert.equal(args.length,4);
 const report=await verifyAplTermIntentActual({build:args[1],out:args[3]});if(report.status!=='PASS')process.exitCode=1;
}
