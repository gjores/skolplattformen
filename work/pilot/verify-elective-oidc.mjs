#!/usr/bin/env node
// Own schema-only PostgreSQL + GoTrue + workerd3015 + Keycloak users. Never deploys or targets3012.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync,mkdirSync,chmodSync,cpSync,readdirSync}from'node:fs';import{randomUUID,createHash}from'node:crypto';import{execFileSync}from'node:child_process';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import path from'node:path';
import{createNamedTimplanSnapshot,schemaFingerprint}from'./named-timplan-snapshot.mjs';import{createNamedTimplanRuntime}from'./named-timplan-runtime.mjs';import{createTjanstOidcFixture}from'./tjanst-oidc-fixtures.mjs';
import{createElectiveOidcParticipants,seedElectiveOidcData}from'./elective-oidc-fixtures.mjs';import{runElectiveOidcScenarios}from'./elective-oidc-scenarios.mjs';
import{assertTarget}from'./verify-target.mjs';import{artifactManifest}from'./verify-programplan-copy-api.mjs';import{productSources}from'./apply-apl-plan.mjs';import{verificationSources}from'./verify-tjanst-actual.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(path.join(root,'web/package.json')),hash=s=>createHash('sha256').update(s).digest('hex'),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
export async function verifyElectiveOidc({build,out,preflight=false}){
 const originalBuild=path.resolve(build);out=path.resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));assert.equal(existsSync(out),false);
 assert.ok(originalBuild.startsWith(root+'work/pilot/targets/protected/runtime/')||originalBuild===root+'web/dist-protected');
 const evidenceDir=out.slice(0,-5)+'-evidence';mkdirSync(evidenceDir,{mode:0o700});chmodSync(evidenceDir,0o700);
 const product=['web/app','web/lib','web/components','web/hooks','web/scripts','web/package.json','web/package-lock.json','web/vite.config.ts','web/vinext.config.ts'],sources=()=>preflight?Object.fromEntries(git(['ls-files','--cached','--others','--exclude-standard','--',...product]).split('\n').filter(Boolean).map(p=>[p,hash(readFileSync(root+p))])):productSources();
 const initialSources=sources(),sourceRevision=git(['rev-parse','HEAD']),mark=JSON.parse(readFileSync(path.join(originalBuild,'build-mode.json'),'utf8'));assert.equal(mark.mode,'protected');
 if(!preflight)assert.equal(git(['diff','--name-only',mark.revision,'HEAD','--',...Object.keys(initialSources)]),'','Protected build must match committed product sources');
 const allMigrationFiles=readdirSync(root+'supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/u.test(f)).sort(),migrationFiles=allMigrationFiles.filter(f=>!preflight||f.slice(0,14)<='20261030115400'),migrationSources=()=>Object.fromEntries((preflight?migrationFiles:readdirSync(root+'supabase/migrations').filter(f=>/^\d{14}_.*\.sql$/u.test(f)).sort()).map(f=>['supabase/migrations/'+f,hash(readFileSync(root+'supabase/migrations/'+f))]));
 const initialMigrations=migrationSources(),verification=()=>verificationSources({entrypoints:['work/pilot/verify-elective-oidc.mjs','work/pilot/elective-oidc-fixtures.mjs','work/pilot/elective-oidc-scenarios.mjs']}),initialVerification=verification();
 const buildRoot=root+'work/pilot/targets/protected/runtime/elective-'+randomUUID();cpSync(originalBuild,buildRoot,{recursive:true,filter:p=>!p.endsWith('/.dev.vars')});
 const report={kind:preflight?'elective-actual-worker-oidc-preflight':'elective-actual-worker-oidc',releaseEligible:false,excludedMigrationFiles:allMigrationFiles.filter(f=>!migrationFiles.includes(f)),status:'FAIL',startedAt:new Date().toISOString(),sourceRevision,build:mark,sources:initialSources,migrationSources:initialMigrations,verificationSources:initialVerification,checks:[],limits:['Own schema-only copy and synthetic identities; no source business or auth rows copied','No deployment, no runtime or DB changes on3012','Real local Keycloak/GoTrue/workerd HTTP chain; no claim of real municipality or SS12000 exchange']};
 const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();let snapshot,runtime,staff,participants,browser,failure;
 try{
  const target=await assertTarget('protected',{requireIdp:true}),source=require('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});let installed;
  try{installed=await source.begin('isolation level repeatable read read only',t=>t`select version,name,statements from supabase_migrations.schema_migrations order by version`);}finally{await source.end();}
  report.baselineJournal={count:installed.length,columns:['version','name','statements'],sha256:hash(JSON.stringify(installed)),rows:installed.map(r=>({version:r.version,name:r.name,statementsSha256:hash(JSON.stringify(r.statements))}))};
  const versions=new Set(installed.map(r=>r.version));assert.ok(versions.size>20);const latest=[...versions].sort().at(-1);
  const missing=migrationFiles.filter(f=>!versions.has(f.slice(0,14))),legacy=missing.filter(f=>f.slice(0,14)<=latest);assert.deepEqual(legacy,['20261002120000_phase5_programplan_education.sql','20261002121000_phase5_worker_programplan_education.sql'],'Unrecognized historical baseline gap');const pending=missing.filter(f=>f.slice(0,14)>latest);report.legacyUnjournalledBaseline=legacy;report.pendingMigrations=pending;report.installedVersionCount=versions.size;save();
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  assert.equal((await snapshot.db`select to_regclass('public.programplan_education_receipts') is not null and to_regprocedure('public.phase5_programplan_education_status(uuid)') is not null present`)[0].present,true,'Known unjournalled education baseline must actually exist in cloned DDL');
  report.baselineFingerprint=await schemaFingerprint(snapshot.db);report.sqlSourceHashes=initialMigrations;for(const f of pending)await snapshot.db.unsafe(readFileSync(root+'supabase/migrations/'+f,'utf8'));report.installedFingerprint=await schemaFingerprint(snapshot.db);save();
  const seed=await snapshot.db.begin(seedElectiveOidcData);
  runtime=await createNamedTimplanRuntime({snapshot,buildRoot,evidenceDir,port:3015,prefix:'elective'});report.runtime=runtime.proof;save();
  staff=await createTjanstOidcFixture({db:snapshot.db,provenance:snapshot.provenance,baseURL:runtime.baseURL,evidenceDir,seed,roles:['principalA','principalB','admin']});
  participants=await createElectiveOidcParticipants({snapshot,runtime,evidenceDir,staffFixture:staff});
  browser=await require('@playwright/test').chromium.launch({headless:true});
  report.result=await runElectiveOidcScenarios({snapshot,runtime,staff,participants,browser,seed,checks:report.checks,evidenceDir,preflight});save();report.finalSchemaFingerprint=await schemaFingerprint(snapshot.db);assert.equal(report.finalSchemaFingerprint,report.installedFingerprint,'Actual fault-injection cleanup must preserve installed product DDL/ACL');
  report.finalSources=sources();report.finalMigrationSources=migrationSources();report.finalVerificationSources=verification();report.finalArtifact=artifactManifest(buildRoot);
  if(!preflight)assert.deepEqual(report.finalSources,initialSources,'Product source changed during actual proof');else report.sourceBinding='preflight only: dirty source not release-bound';assert.deepEqual(report.finalMigrationSources,initialMigrations,'Migration source changed during actual proof');assert.deepEqual(report.finalVerificationSources,initialVerification,'Verifier source changed during actual proof');assert.deepEqual(report.finalArtifact,runtime.proof.artifact,'Worker artifact changed during actual proof');report.status='PASS';
 }catch(error){failure=error;report.failureCode=error.code??'ASSERTION';report.failure=error.message;writeFileSync(evidenceDir+'/failure.txt',String(error.stack),{mode:0o600});}
 finally{
  if(browser)await browser.close();
  for(const[key,object]of[['participantCleanup',participants],['staffCleanup',staff],['runtimeCleanup',runtime],['snapshotCleanup',snapshot]])if(object)try{report[key]=await object.cleanup();}catch(error){report[key]={status:'FAIL',code:error.code??'cleanup'};report.status='FAIL';failure??=error;}
  if(staff)report.staffOidc=staff.proof();if(participants)report.participantOidc=participants.proof();report.releaseEligible=report.status==='PASS'&&!preflight;report.finishedAt=new Date().toISOString();save();
 }
 console.log(report.status+': '+report.checks.length+' actual elective checks; private report '+out);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),preflight=args.includes('--preflight');if(preflight)args.splice(args.indexOf('--preflight'),1);assert.deepEqual([args[0],args[2]],['--build','--out']);assert.equal(args.length,4);const result=await verifyElectiveOidc({build:args[1],out:args[3],preflight});if(result.status!=='PASS')process.exitCode=1;
}
