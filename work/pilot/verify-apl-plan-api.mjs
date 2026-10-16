#!/usr/bin/env node
// Isolated actual Worker + OIDC + PostgreSQL + desktop/phone evidence. No live DDL or 3012 switch.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,cpSync,openSync,closeSync,realpathSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createNamedTimplanSnapshot} from './named-timplan-snapshot.mjs';
import {createNamedTimplanRuntime} from './named-timplan-runtime.mjs';
import {createAplPlanOidcFixture,recoverAplOidcFixture,seedAplActualFixture} from './apl-plan-oidc-fixtures.mjs';
import {runAplApiScenarios} from './apl-plan-api-scenarios.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {productSources,migrationSources,migrations,sha} from './apply-apl-plan.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(path.join(root,'web/package.json'));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const verificationFiles=['work/pilot/verify-apl-plan-api.mjs','work/pilot/apl-plan-oidc-fixtures.mjs','work/pilot/apl-plan-api-scenarios.mjs','work/pilot/apl-plan-browser-scenarios.mjs',
 'web/playwright.apl-actual.config.ts','web/e2e/apl-plan-actual.spec.ts','work/pilot/apply-apl-plan.mjs','work/pilot/deliver-apl-plan.mjs','work/pilot/deliver-apl-plan.test.mjs'];
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
async function runPlaywright(evidenceDir,manifestPath,baseURL){
 const log=path.join(evidenceDir,'playwright.log'),fd=openSync(log,'wx',0o600);
 try {return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.join(root,'web/node_modules/@playwright/test/cli.js'),'test','-c','playwright.apl-actual.config.ts'],{
   cwd:path.join(root,'web'),stdio:['ignore',fd,fd],env:{...process.env,PHASE5_BASE_URL:baseURL,APL_ACTUAL_MANIFEST:manifestPath,APL_ACTUAL_EVIDENCE_DIR:evidenceDir}});
  child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,log}));
 });}finally{closeSync(fd);}
}
export async function verifyAplActual({build,out}) {
 const originalBuild=realpathSync(build);out=path.resolve(out);
 assert.ok(originalBuild.startsWith(path.join(root,'work/pilot/targets/protected/runtime/')),'Only an owned separately built candidate is allowed');
 assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));assert.equal(existsSync(out),false);
 const evidenceDir=out.slice(0,-5)+'-evidence';mkdirSync(evidenceDir,{mode:0o700});chmodSync(evidenceDir,0o700);
 const initialSources=productSources(),initialMigrations=migrationSources(),initialVerification=verificationSources();
 const mark=JSON.parse(readFileSync(path.join(originalBuild,'build-mode.json'),'utf8'));assert.equal(mark.mode,'protected');
 assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...Object.keys(initialSources)]),'','Candidate product does not match current committed sources');
 const buildRoot=path.join(root,'work/pilot/targets/protected/runtime/apl-'+randomUUID());cpSync(originalBuild,buildRoot,{recursive:true,filter:p=>!p.endsWith('/.dev.vars')});
 const report={kind:'apl-plan-actual-api-browser',status:'FAIL',startedAt:new Date().toISOString(),build:mark,sourceRevision:git(['rev-parse','HEAD']),sources:initialSources,migrationSources:initialMigrations,
  verificationSources:initialVerification,browserEvidence:{},checks:[],limits:['Own schema-only database and synthetic identities/classes only; no live rows copied or business writes on3012',
   'No external SS12000 exchange or completed APL evidence','One labelled browser transport fault drops a response only after a real Worker 200; all business reads/writes and authentication are actual']};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 let snapshot,runtime,fixture,browser,failure;
 try {
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const seeds={};for(const name of ['desktop','phone','api'])seeds[name]=await seedAplActualFixture(snapshot);
  await snapshot.db.begin(async tx=>{await tx`set constraints all immediate`;for(const name of migrations)await tx.unsafe(readFileSync(path.join(root,'supabase/migrations',name),'utf8'));});
  report.scope=Object.fromEntries(Object.entries(seeds).map(([key,s])=>[key,{customerId:s.ids[1],unitId:s.ids[30],programId:s.programId,legacyPlanId:s.planId}]));
  runtime=await createNamedTimplanRuntime({snapshot,buildRoot,evidenceDir});report.runtime=runtime.proof;save();
  const manifestPath=path.join(evidenceDir,'browser-manifest.json');writeFileSync(manifestPath,JSON.stringify({kind:'apl-actual-owned-runtime',baseURL:runtime.baseURL,provenance:snapshot.provenance,seeds:{desktop:seeds.desktop,phone:seeds.phone}}),{mode:0o600,flag:'wx'});
  report.playwright=await runPlaywright(evidenceDir,manifestPath,runtime.baseURL);
  for(const device of ['desktop','phone']) {
   const file=path.join(evidenceDir,`browser-${device}.json`);if(!existsSync(file))continue;
   const result=JSON.parse(readFileSync(file,'utf8'));report.browserEvidence[device]={path:file,sha256:sha(readFileSync(file)),result,visualReview:'pending',screenshotHashes:Object.fromEntries(result.screenshots.map(s=>[s.file,sha(readFileSync(path.join(evidenceDir,s.file)))]))};
   report.checks.push(...result.checks.map(c=>({...c,name:device+': '+c.name})));
  }
  save();assert.equal(report.playwright.code,0,'Actual browser failure; inspect private Playwright log/report');
  for(const device of ['desktop','phone'])assert.equal(report.browserEvidence[device]?.result.status,'PASS');
  const apiDir=path.join(evidenceDir,'oidc-api');mkdirSync(apiDir,{mode:0o700});
  fixture=await createAplPlanOidcFixture({snapshot,runtime,evidenceDir:apiDir,seed:seeds.api});
  browser=await require('@playwright/test').chromium.launch({headless:true});report.api=await runAplApiScenarios({fixture,browser,snapshot,checks:report.checks});save();
  report.finalSources=productSources();report.finalMigrationSources=migrationSources();report.finalVerificationSources=verificationSources();report.finalArtifact=artifactManifest(buildRoot);
  assert.deepEqual(report.finalSources,initialSources);assert.deepEqual(report.finalMigrationSources,initialMigrations);assert.deepEqual(report.finalVerificationSources,initialVerification);assert.deepEqual(report.finalArtifact,runtime.proof.artifact);
  report.status='PASS';
 }catch(error){failure=error;report.failureCode=error.code??'ASSERTION';report.failure=error.message;writeFileSync(path.join(evidenceDir,'failure.txt'),String(error.stack),{mode:0o600});}
 finally {
  if(browser)await browser.close();
  const oidc=[];
  if(fixture)try{oidc.push(await fixture.cleanup());report.oidc=fixture.proof();}catch(error){failure??=error;report.status='FAIL';oidc.push({cleanup:'failed'});}
  for(const device of ['desktop','phone',...(fixture?[]:['api'])]){
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
 console.log(`${report.status}: ${report.checks.length} actual APL checks; private report ${out}`);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const args=process.argv.slice(2);assert.deepEqual([args[0],args[2]],['--build','--out']);assert.equal(args.length,4);
 const report=await verifyAplActual({build:args[1],out:args[3]});if(report.status!=='PASS')process.exitCode=1;
}
