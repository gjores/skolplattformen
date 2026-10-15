#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,cpSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createNamedTimplanSnapshot} from './named-timplan-snapshot.mjs';
import {createNamedTimplanRuntime} from './named-timplan-runtime.mjs';
import {createNamedTimplanOidcFixture} from './named-timplan-oidc-fixtures.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {namedTimplanApiScenarios} from './named-timplan-api-scenarios.mjs';
const root=path.resolve(fileURLToPath(new URL('../../',import.meta.url))),args=process.argv.slice(2),smoke=args.includes('--auth-smoke');
if(smoke)args.splice(args.indexOf('--auth-smoke'),1);
assert.deepEqual([args[0],args[2]],['--build','--out']);assert.equal(args.length,4);
const originalBuild=path.resolve(args[1]),out=path.resolve(args[3]);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));assert.equal(existsSync(out),false);
assert.ok(originalBuild.startsWith(root+'/work/pilot/targets/protected/runtime/')||originalBuild===root+'/web/dist-protected');
const evidenceDir=out.slice(0,-5)+'-evidence';mkdirSync(evidenceDir,{mode:0o700});chmodSync(evidenceDir,0o700);
const hash=s=>createHash('sha256').update(s).digest('hex'),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const product=['web/app','web/lib','web/components','web/hooks','web/scripts','web/package.json','web/package-lock.json','web/vite.config.ts','web/vinext.config.ts'];
const sourceFiles=git(['ls-files','--',...product]).split('\n').filter(Boolean);
const sources=()=>Object.fromEntries(sourceFiles.map(p=>[p,hash(readFileSync(path.join(root,p)))]));
const migrationNames=['20261015200000_named_timplan_series.sql','20261015201000_named_timplan_commands.sql','20261015202000_named_timplan_decisions.sql','20261015203000_named_timplan_reads.sql','20261015204000_worker_named_timplans.sql'];
const migrationSources=()=>Object.fromEntries(migrationNames.map(n=>['supabase/migrations/'+n,hash(readFileSync(path.join(root,'supabase/migrations',n)))]));
const verificationFiles=['work/pilot/named-timplan-snapshot.mjs','work/pilot/named-timplan-runtime.mjs','work/pilot/named-timplan-oidc-fixtures.mjs','work/pilot/named-timplan-api-scenarios.mjs','work/pilot/named-timplan-browser-scenarios.mjs','work/pilot/verify-named-timplans-api.mjs'];
const verificationClosure=new Set(),ts=createRequire(path.join(root,'web/package.json'))('typescript');
function includeVerificationFile(file){
 assert.ok(!path.isAbsolute(file)&&!file.split('/').includes('..'));if(verificationClosure.has(file))return;
 const absolute=path.join(root,file);assert.ok(existsSync(absolute),'Missing verification dependency: '+file);verificationClosure.add(file);
 const source=readFileSync(absolute,'utf8');
 const syntax=ts.createSourceFile(absolute,source,ts.ScriptTarget.Latest,true);
 for(const statement of syntax.statements){
  if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement)))continue;
  const specifier=statement.moduleSpecifier;if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue;
  const dependency=path.relative(root,path.resolve(path.dirname(absolute),specifier.text));
  if(/\.(?:mjs|js|ts)$/u.test(dependency))includeVerificationFile(dependency);
 }
}
for(const file of verificationFiles)includeVerificationFile(file);
const verificationSources=()=>Object.fromEntries([...verificationClosure].sort().map(p=>[p,hash(readFileSync(path.join(root,p)))]));
const initialSources=sources(),initialMigrations=migrationSources(),initialVerification=verificationSources(),mark=JSON.parse(readFileSync(path.join(originalBuild,'build-mode.json'),'utf8'));
if(!smoke){assert.equal(git(['status','--porcelain','--',...product]),'','Product sources must be committed');assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...product]),'','Build must match current product');}
const buildRoot=path.join(root,'work/pilot/targets/protected/runtime/named-'+randomUUID());cpSync(originalBuild,buildRoot,{recursive:true,filter:p=>!p.endsWith('/.dev.vars')});
const report={kind:smoke?'named-timplan-auth-smoke':'named-timplan-actual-api-browser',status:'FAIL',startedAt:new Date().toISOString(),build:mark,sourceRevision:git(['rev-parse','HEAD']),sources:initialSources,migrationSources:initialMigrations,verificationSources:initialVerification,browserEvidence:{},checks:[],limits:['Local synthetic fixture only; no live user rows copied','No claim of external SS12000 exchange']};
const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
let snapshot,runtime,fixture,browser,failure;
try{
 snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
 await snapshot.db.begin(async tx=>{await tx`set constraints all immediate`;for(const name of migrationNames)await tx.unsafe(readFileSync(path.join(root,'supabase/migrations',name),'utf8'));});
 runtime=await createNamedTimplanRuntime({snapshot,buildRoot,evidenceDir});report.runtime=runtime.proof;save();
 fixture=await createNamedTimplanOidcFixture({snapshot,runtime,evidenceDir});report.scope=fixture.scope;save();
 const playwright=createRequire(path.join(root,'web/package.json'))('@playwright/test');browser=await playwright.chromium.launch({headless:true});
 if(smoke){const context=await browser.newContext({baseURL:runtime.baseURL}),page=await context.newPage();await fixture.login(page,'principal');report.checks.push({name:'Actual isolated Keycloak-GoTrue-Worker callback and MFA',ok:true});await context.close();}
 else{
  const {runNamedBrowserScenarios}=await import('./named-timplan-browser-scenarios.mjs');
  const desktop=await runNamedBrowserScenarios({fixture,browser,device:'desktop',snapshot,checks:report.checks,evidenceDir});report.browserEvidence.desktop={path:path.join(evidenceDir,'browser-desktop.json'),sha256:hash(readFileSync(path.join(evidenceDir,'browser-desktop.json'))),result:desktop,visualReview:'pending'};save();await browser.close();browser=null;
  browser=await playwright.webkit.launch({headless:true});const phone=await runNamedBrowserScenarios({fixture,browser,device:'phone',snapshot,checks:report.checks,evidenceDir});report.browserEvidence.phone={path:path.join(evidenceDir,'browser-phone.json'),sha256:hash(readFileSync(path.join(evidenceDir,'browser-phone.json'))),result:phone,visualReview:'pending'};
  await browser.close();browser=await playwright.chromium.launch({headless:true});
  report.api=await namedTimplanApiScenarios({fixture,browser,snapshot,checks:report.checks});save();
  report.finalSources=sources();report.finalMigrationSources=migrationSources();report.finalVerificationSources=verificationSources();report.finalArtifact=artifactManifest(buildRoot);
  assert.deepEqual(report.finalSources,initialSources,'Product source changed during actual verification');assert.deepEqual(report.finalMigrationSources,initialMigrations);assert.deepEqual(report.finalVerificationSources,initialVerification);assert.deepEqual(report.finalArtifact,runtime.proof.artifact);
 }
 report.status='PASS';
}catch(error){failure=error;report.failureCode=error.code??'ASSERTION';report.failure=error.message;writeFileSync(path.join(evidenceDir,'failure.txt'),String(error.stack),{mode:0o600});}
finally{
 if(browser)await browser.close();
 for(const [key,object]of [['oidcCleanup',fixture],['runtimeCleanup',runtime],['snapshotCleanup',snapshot]]){if(object)try{report[key]=await object.cleanup();}catch(error){report[key]={status:'FAIL',code:error.code??'cleanup'};report.status='FAIL';failure??=error;}}
 if(fixture)report.oidc=fixture.proof();report.finishedAt=new Date().toISOString();save();
}
console.log(report.status+': '+report.checks.length+' actual checks; private report '+out);if(failure)process.exitCode=1;
