#!/usr/bin/env node
// Beställd årsmodell på samma lokala mål. Inga migrationer eller verksamhetskommandon.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseSha, verifySchemaUatRelease } from './prepare-uat-release.mjs';
import { assertTarget } from '../pilot/verify-target.mjs';
import { connect, classCohortTargetIdentity } from '../pilot/verify-class-cohort.mjs';
import { readMigrationJournal } from '../pilot/apply-elective-blocks.mjs';
import { schemaFingerprint } from '../pilot/named-timplan-snapshot.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const revision='7e38ba670a4cef400c203390a094ad96d5e5b75c';
const release='/private/tmp/schema-uat-release-20261116-7e38ba67';
const manifestHash='e97f88b02595405a3051b5068cff848ba0ffba87d43d38321a5c68d92a06dffe';
const stage=path.join(root,'work/pilot/targets/protected/runtime/schema-7e38ba670a');
const previous=path.join(root,'work/pilot/targets/protected/runtime/schema-69c5923a24');
const oldBase=path.join(previous,'runtime'), appDir=path.join(stage,'runtime/web'),motorDir=path.join(stage,'runtime/motor');
const targetFile=path.join(root,'work/pilot/targets/protected/manifest.json');
const node='/opt/homebrew/opt/node@25/bin/node',runId=randomUUID();
const out=path.join(root,'work/schema/results/annual-7e38ba670a-install.json');
const report={kind:'schema-requested-annual-pattern-installation',revision,request:'Det ska vara så lite ändringar mellan VT och ht som möjlgt och eventuella skillnader för varje änmne på vår och höst behöver beräknas utifrån hela läsåret istället.',startedAt:new Date().toISOString(),status:'FAIL',checks:[],migrationsApplied:0,rollback:{performed:false}};
const pass=name=>{report.checks.push({name,status:'PASS'});console.log(JSON.stringify({stage:name,status:'PASS'}));};
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const execute = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }).trim();
const request = (url, options = {}) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), ...options });
function listener(port) {
  try { const ids = [...new Set(execute('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean))]; assert.ok(ids.length <= 1); return ids[0] ? Number(ids[0]) : null; }
  catch (error) { if (error.status === 1 && !String(error.stdout ?? '').trim()) return null; throw error; }
}
function cwd(pid) {
  try { return execute('/usr/sbin/lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).split('\n').find(s => s.startsWith('n'))?.slice(1) ?? null; } catch { return null; }
}
function processIdentity(pid) { return releaseSha({ pid, cwd: cwd(pid), start: execute('/bin/ps', ['-p', String(pid), '-o', 'lstart=']), command: execute('/bin/ps', ['-p', String(pid), '-o', 'command=']) }); }
function appRoot(pid, directory) {
  assert.equal(cwd(pid), directory);
  for (let n = 0; n < 8; n++) { const parent = Number(execute('/bin/ps', ['-p', String(pid), '-o', 'ppid='])); if (parent <= 1 || cwd(parent) !== directory) return pid; pid = parent; }
  assert.fail('unexpected_app_ancestry');
}
async function stop(pid, directory, port, expectedIdentity) {
  assert.equal(cwd(pid), directory); assert.equal(processIdentity(pid), expectedIdentity); process.kill(pid, 'SIGTERM');
  for (let n = 0; n < 150; n++) { if (!listener(port) && cwd(pid) === null) return; await delay(100); }
  assert.fail('owned_process_did_not_stop');
}
async function ready(port, directory, url) {
  for (let n = 0; n < 180; n++) {
    const owner = listener(port); if (owner) { assert.equal(cwd(owner), directory); try { if ((await request(url)).status === 200) return owner; } catch { /* bounded startup */ } }
    await delay(150);
  }
  assert.fail('runtime_not_ready');
}
function envMap(file) { return new Map(readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])); }
function launch(base, role, token, label) {
  const directory = path.join(base, role), fd = openSync(path.join(base, `${role}-301x-${label}.log`), 'ax', 0o600);
  try {
    const env = { PATH: '/opt/homebrew/opt/node@25/bin:' + process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
      SCHEMAMOTOR_ADDR: '127.0.0.1:3013', SCHEMAMOTOR_URL: 'http://127.0.0.1:3013', SCHEMAMOTOR_TOKEN: token, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' };
    const child = spawn(role === 'motor' ? path.join(directory, 'schemamotor-tjanst') : node,
      role === 'motor' ? [] : ['scripts/run-mode.mjs', 'preview', '--mode', 'protected', '--port', '3012'], { cwd: directory, env, detached: true, stdio: ['ignore', fd, fd] });
    child.on('error', () => {}); assert.ok(Number.isInteger(child.pid)); child.unref(); return child.pid;
  } finally { closeSync(fd); }
}
const privateFiles = new Set(['runtime/web/dist-protected/server/.dev.vars', 'runtime/web/dist-protected/server/.dev.vars.lock', 'runtime/motor/token']);
function stageInventory(manifest, live = false, directory = stage, expectedHash = manifestHash) {
  assert.equal(releaseSha(readFileSync(path.join(directory, 'artifact.json'))), expectedHash);
  const found = [];
  const visit = rel => { for (const d of readdirSync(path.join(directory, rel), { withFileTypes: true })) { const name = rel + '/' + d.name;
    if (d.isDirectory()) visit(name); else { assert.ok(d.isFile()); if (live && privateFiles.has(name)) { assert.equal(lstatSync(path.join(directory, name)).mode & 0o777, 0o600); continue; } found.push(name); } } };
  for (const rel of ['runtime/web/dist-protected', 'runtime/web/scripts', 'runtime/motor', 'sql']) visit(rel);
  found.push('runtime/web/package.json', 'runtime/web/package-lock.json'); assert.deepEqual(found.sort(), manifest.artifact.files.map(f => f.path).sort());
  for (const f of manifest.artifact.files) { const file = path.join(directory, f.path), s = lstatSync(file); assert.ok(s.isFile() && !s.isSymbolicLink()); assert.equal(s.size, f.bytes); assert.equal(releaseSha(readFileSync(file)), f.sha256); assert.equal(Boolean(s.mode & 0o111), f.executable); }
}

assert.deepEqual(process.argv.slice(2),['--install-requested-year-pattern']);
assert.match(manifestHash,/^[a-f0-9]{64}$/u);assert.ok(!existsSync(stage)&&!existsSync(out));
let db,oldApp,oldMotor,oldAppId,oldMotorId,newApp,newMotor,token,priorRevisions,appAttempted=false,motorAttempted=false,appStopped=false,motorStopped=false;
try {
 assert.equal(releaseSha(readFileSync(path.join(release,'artifact.json'))),manifestHash);
 const actual=json(path.join(root,'work/schema/results/annual-actual-7e38ba67.json'));
 assert.equal(actual.kind,'schema-lasarsmonster-owned-actual');assert.equal(actual.status,'PASS');assert.equal(actual.releaseRevision,revision);
 assert.equal(actual.releaseManifestSha256,manifestHash);assert.equal(actual.cleanup.status,'PASS');assert.equal(actual.cleanup.targetTouched,false);assert.equal(actual.cleanup.credentialsRemoved,true);
 assert.equal(actual.syntheticOnly,true);assert.ok(actual.checks.length>=5 && actual.checks.every(c=>c.status==='PASS') && Number.isFinite(Date.parse(actual.apiCompletedAt)));
 pass('same frozen candidate passed actual owned API tests and full cleanup');
 const manifest=verifySchemaUatRelease(release,{nodeModules:path.join(root,'web/node_modules')});assert.equal(actual.releaseArtifactSha256,manifest.artifact.sha256);assert.equal(manifest.source.revision,revision);assert.deepEqual(manifest.contracts,{app:8,motor:5});assert.equal(manifest.previousRuntimeRevision,'69c5923a2439a854a054e1cb095bb99364bc2784');
 const installed=json(path.join(root,'work/schema/results/uat-693d63138e-install.json'));assert.equal(installed.status,'PASS');assert.equal(installed.migrationsCommitted,true);
 assert.equal(releaseSha(readFileSync(path.join(previous,'artifact.json'))),'f1faac725cac88ce0379f9c63737b452a31d42a98686bef733f59c40fc2be601');
 const prior=json(path.join(previous,'artifact.json'));assert.deepEqual(prior.sql,manifest.sql);stageInventory(prior,true,previous,'f1faac725cac88ce0379f9c63737b452a31d42a98686bef733f59c40fc2be601');
 assert.equal(execute('/usr/bin/git',['diff','--name-only','69c5923a2439a854a054e1cb095bb99364bc2784',revision,'--','supabase/migrations','web/lib/server/mandates.ts','web/lib/server/mandates.test.mjs','web/lib/server/mandate-route.ts']), '');
 const target=await assertTarget('protected',{requireRunning:false,requireIdp:false});db=connect(target);
 const reviewed=json(path.join(root,'work/schema/results/schema-uat-target-readonly-final-20261116.json'));
 await db.begin('isolation level repeatable read read only',async tx=>{
  assert.equal((await classCohortTargetIdentity(tx,target)).sha256,reviewed.database.identitySha256);
  assert.equal(releaseSha(await readMigrationJournal(tx)),installed.database.installed.journalSha256);assert.equal(await schemaFingerprint(tx),installed.database.installed.fingerprint);
 });
 pass('exact old product files, unchanged SQL and mandate gate; installed169journal read only');
 oldApp=appRoot(listener(3012),path.join(oldBase,'web'));oldMotor=listener(3013);assert.equal(cwd(oldMotor),path.join(oldBase,'motor'));
 oldAppId=processIdentity(oldApp);oldMotorId=processIdentity(oldMotor);
 const tokenBytes=readFileSync(path.join(oldBase,'motor/token'));token=tokenBytes.toString('utf8').trim();assert.match(token,/^[a-f0-9]{32,128}$/u);
 const varsBefore=envMap(path.join(oldBase,'web/dist-protected/server/.dev.vars'));assert.equal(varsBefore.get('SCHEMAMOTOR_TOKEN'),token);
 cpSync(path.join(release,'runtime'),path.join(stage,'runtime'),{recursive:true});cpSync(path.join(release,'sql'),path.join(stage,'sql'),{recursive:true});chmodSync(stage,0o700);
 for(const f of ['artifact.json','dependencies.json'])copyFileSync(path.join(release,f),path.join(stage,f));
 symlinkSync(path.join(root,'web/node_modules'),path.join(appDir,'node_modules'),'dir');const mf=path.join(stage,'runtime/work/pilot/targets/protected');mkdirSync(mf,{recursive:true});symlinkSync(targetFile,path.join(mf,'manifest.json'));
 stageInventory(manifest);writeFileSync(path.join(motorDir,'token'),tokenBytes,{flag:'wx',mode:0o600});
 appAttempted=true;await stop(oldApp,path.join(oldBase,'web'),3012,oldAppId);appStopped=true;
 priorRevisions=Array.from(await db.begin('isolation level repeatable read read only',tx=>tx`select draft_id::text,revision,content_hash,source_hash from public.schema_draft_revisions order by draft_id,revision`));
 report.preservedRevisions={count:priorRevisions.length,sha256:releaseSha(priorRevisions)};
 motorAttempted=true;await stop(oldMotor,path.join(oldBase,'motor'),3013,oldMotorId);motorStopped=true;
 newMotor=launch(path.join(stage,'runtime'),'motor',token,runId);await ready(3013,motorDir,'http://127.0.0.1:3013/v1/health');
 newApp=launch(path.join(stage,'runtime'),'web',token,runId);const app=await ready(3012,appDir,'http://127.0.0.1:3012/');assert.equal(appRoot(app,appDir),newApp);
 assert.equal(json(path.join(appDir,'dist-protected/build-mode.json')).revision,revision);assert.equal((await(await request('http://127.0.0.1:3013/v1/health')).json()).contract_version,5);
 assert.deepEqual((await(await request('http://127.0.0.1:3013/v1/health')).json()).supported_problem_versions,[4,5]);pass('requested annual model on3012 and compatible motor5 on3013');
 for(const endpoint of ['forslag','kontroll','lagen','folj','samling','aktiviteter','diagnos','placering','fonster','datum','salar','villkorsforslag','utkast/las','utkast/spara','utkast/status']){
  const response=await request('http://127.0.0.1:3012/api/schema/'+endpoint,{method:'POST',headers:{Origin:'http://127.0.0.1:3012','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);assert.equal((await response.json()).code,'no_session');assert.equal(response.headers.get('Cache-Control'),'no-store');
 }
 pass('all15protected schema paths retain session gate');
 const vars=envMap(path.join(appDir,'dist-protected/server/.dev.vars'));assert.equal(vars.get('SESSION_SECRET'),varsBefore.get('SESSION_SECRET'));assert.equal(vars.get('SCHEMAMOTOR_TOKEN'),token);
 await db.begin('isolation level repeatable read read only',async tx=>{assert.equal(releaseSha(await readMigrationJournal(tx)),installed.database.installed.journalSha256);assert.equal(await schemaFingerprint(tx),installed.database.installed.fingerprint);});
 const after=Array.from(await db.begin('isolation level repeatable read read only',tx=>tx`select draft_id::text,revision,content_hash,source_hash from public.schema_draft_revisions order by draft_id,revision`));
 const keys=new Set(priorRevisions.map(r=>r.draft_id+':'+r.revision));assert.deepEqual(after.filter(r=>keys.has(r.draft_id+':'+r.revision)),priorRevisions);
 stageInventory(manifest,true);pass('same169journal, all prior draft revisions, session secret and exact new product files');
 report.manifestSha256=manifestHash;report.inventorySha256=manifest.artifact.sha256;report.stage=path.relative(root,stage);report.previousStage=path.relative(root,previous);report.processes={appRoot:newApp,appListener:listener(3012),motorListener:listener(3013)};report.status='PASS';
}catch(error){
 process.exitCode=1;report.failure={name:error.name,code:error.code??null,messageSha256:releaseSha(String(error.message??''))};
 if(appAttempted||motorAttempted){report.rollback.performed=true;try{
  if(newApp&&cwd(newApp)===appDir)await stop(newApp,appDir,3012,processIdentity(newApp));
  if(newMotor&&cwd(newMotor)===motorDir)await stop(newMotor,motorDir,3013,processIdentity(newMotor));
  if(appAttempted&&!appStopped){if(listener(3012))await stop(oldApp,path.join(oldBase,'web'),3012,oldAppId);assert.equal(listener(3012),null);assert.equal(cwd(oldApp),null);}
  if(motorAttempted&&!motorStopped){if(listener(3013))await stop(oldMotor,path.join(oldBase,'motor'),3013,oldMotorId);assert.equal(listener(3013),null);assert.equal(cwd(oldMotor),null);}
  if(motorAttempted&&!listener(3013))launch(oldBase,'motor',token,runId+'-rollback');
  if(appAttempted&&!listener(3012))launch(oldBase,'web',token,runId+'-rollback');
  const rm=await ready(3013,path.join(oldBase,'motor'),'http://127.0.0.1:3013/v1/health'),ra=await ready(3012,path.join(oldBase,'web'),'http://127.0.0.1:3012/');await delay(300);assert.equal(listener(3012),ra);assert.equal(listener(3013),rm);report.rollback.status='PASS';
 }catch(e){report.rollback.status='FAIL';report.rollback.failure={name:e.name,messageSha256:releaseSha(String(e.message??''))};}}
}finally{if(db)await db.end({timeout:5});report.finishedAt=new Date().toISOString();writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({status:report.status,checks:report.checks.length,rollback:report.rollback,report:path.relative(root,out)}));}
