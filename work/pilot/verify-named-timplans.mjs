#!/usr/bin/env node
// Actual overlapping PostgreSQL transactions, exclusively in an owned schema-only fixture DB.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {createNamedTimplanSnapshot,schemaFingerprint} from './named-timplan-snapshot.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {approvedClassFixture} from './verify-class-timplans.mjs';
import {namedSeriesSources} from './verify-named-timplan-series.mjs';
import {parseNamedTimplanCreateReply,parseNamedTimplanRenameReply} from '../../web/lib/named-timplan.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migrationNames=['20261015200000_named_timplan_series.sql','20261015201000_named_timplan_commands.sql','20261015202000_named_timplan_decisions.sql','20261015203000_named_timplan_reads.sql','20261015204000_worker_named_timplans.sql'];
const rollback=Error('owned-migration-rollback');
function sources(){return{...namedSeriesSources(),...Object.fromEntries([...migrationNames.map(n=>'supabase/migrations/'+n),'work/pilot/verify-named-timplans.mjs','web/lib/named-timplan.ts'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]))};}
async function install(tx){await tx`set constraints all immediate`;for(const n of migrationNames)await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',n),'utf8'));await tx`set constraints all deferred`;}
async function oldProjection(db,tables){const out={};for(const table of tables){assert.match(table,/^[a-z_][a-z0-9_]*$/u);const strip=table==='timplans'?"-'series_id'-'name_at_creation'":table==='plan_decision_history'?"-'name_at_decision'":'';[out[table]]=await db.unsafe(`select count(*)::integer count,md5(coalesce(string_agg(r::text,'' order by r::text),'')) hash from(select to_jsonb(t)${strip} r from public.${table} t)s`);}return out;}
async function setActor(tx,f,name){const [i,m,s]={hm:[10,20,80],principal:[11,21,81],principal2:[12,22,82],admin:[13,23,83]}[name];for(const [key,value] of Object.entries({customer_id:f.id(1),organizer_id:f.id(2),identity_id:f.id(i),membership_id:f.id(m),session_id:f.id(s),assignment_id:f.roles[name],correlation_id:randomUUID()}))await tx`select set_config(${`app.${key}`},${value},true)`;}
async function configured(tx,f,actor){await tx`set local lock_timeout='10s'`;await tx`set local statement_timeout='30s'`;await tx`set local transaction_timeout='45s'`;await setActor(tx,f,actor);}
async function exercise(snapshot,report){
 const db=snapshot.db;let f;
 await db.begin(async tx=>{f=await approvedClassFixture(tx,'SA25');});
 const baseline=await allPublicHashes(db),fingerprint=await schemaFingerprint(db),tables=Object.keys(baseline),original=await oldProjection(db,tables);
 try{await db.begin(async tx=>{await install(tx);assert.deepEqual(await oldProjection(tx,tables),original);await tx`set constraints all immediate`;throw rollback;});}catch(e){if(e!==rollback)throw e;}
 assert.deepEqual(await allPublicHashes(db),baseline);assert.equal(await schemaFingerprint(db),fingerprint);report.migrationRollback={exactOriginalColumns:true,allTablesRestored:true,schemaAclRestored:true,tableCount:tables.length};
 await db.begin(async tx=>{await install(tx);assert.deepEqual(await oldProjection(tx,tables),original);await tx`set constraints all immediate`;});report.installed={originalColumnsPreserved:true,fingerprint:await schemaFingerprint(db)};
 const originalRecords={};for(const table of Object.keys(await allPublicHashes(db)))originalRecords[table]=await db.unsafe('select to_jsonb(t) r from public.'+table+' t');
 await snapshot.withPrivateTarget(({dbUrl,workerDbUrl,database})=>{const admin=new URL(dbUrl),worker=new URL(workerDbUrl);assert.equal(admin.hostname,'127.0.0.1');assert.equal(worker.hostname,admin.hostname);assert.equal(worker.port,admin.port);assert.equal(admin.pathname,'/'+database);assert.equal(worker.pathname,admin.pathname);assert.equal(decodeURIComponent(worker.username),'skolplattform_worker');});
 report.privateTargetCallbackVerified=true;
 const left=await snapshot.connect(),right=await snapshot.connect();
 const run=(actor,fn)=>db.begin(async tx=>{await configured(tx,f,actor);return fn(tx);});
 const ok=name=>{report.checks.push({name,ok:true});console.log('PASS: '+name);};
 const plan=async pid=>(await db`select * from public.timplans where id=${pid}`)[0];
 const createRequest=async name=>({commandId:randomUUID(),sourcePlanId:f.programId,expectedSourceRevision:(await db`select revision from public.point_plans where id=${f.programId}`)[0].revision,expectedEducationRevision:0,unitId:f.id(30),name,copyFromPlanId:f.planId,expectedCopyFromRevision:(await plan(f.planId)).revision});
 const create=async(tx,q)=>parseNamedTimplanCreateReply((await tx`select public.phase5_named_timplan_create(${tx.json(q)}) r`)[0].r.reply,q);
 const decisionRequest=async(pid,action,kind='timplan')=>run(action==='approve'?'hm':'principal',async tx=>{const raw=(await tx`select public.phase5_plan_decision_basis(${kind},${pid}) r`)[0].r,b=raw.detail??raw;return{kind,planId:pid,commandId:randomUUID(),action,expectedRevision:b.revision,expectedDecisionRevision:b.decisionRevision,basisHash:b.basisHash,comment:'',confirmedChecks:b.checks.map(c=>c.id)};});
 const decide=(tx,q)=>tx`select public.phase5_plan_decision_command(${tx.json(q)}) r`.then(r=>r[0].r);
 const decision=async(pid,action,kind='timplan')=>{const q=await decisionRequest(pid,action,kind);return run(action==='approve'?'hm':'principal',tx=>decide(tx,q));};
 // The holder has completed its actual command but keeps the transaction open.
 // The contender's real command is observed waiting on that exact backend PID.
 async function race(name,leftActor,leftFn,rightActor,rightFn){
  let release,readyResolve,readyReject,rightPidResolve;const gate=new Promise(r=>release=r),ready=new Promise((r,j)=>{readyResolve=r;readyReject=j;}),rightPidReady=new Promise(r=>rightPidResolve=r);
  let leftPid;
  const lp=left.begin(async tx=>{await configured(tx,f,leftActor);leftPid=(await tx`select pg_backend_pid() pid`)[0].pid;const value=await leftFn(tx);readyResolve(value);await gate;await tx`set constraints all immediate`;return value;}).then(value=>({ok:true,value}),error=>{readyReject(error);return{ok:false,error};});
  let rp,observation;try{
   await ready;
   rp=right.begin(async tx=>{await configured(tx,f,rightActor);const pid=(await tx`select pg_backend_pid() pid`)[0].pid;rightPidResolve(pid);return rightFn(tx);}).then(value=>({ok:true,value}),error=>({ok:false,error:{code:error.code,message:error.message,hint:error.hint}}));
   const rightPid=await rightPidReady;assert.notEqual(leftPid,rightPid);
   const start=Date.now();while(Date.now()-start<7000){const [state]=await db`select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=${rightPid}`;
    if(state?.blockers.includes(leftPid)){observation={leftPid,rightPid,waitEventType:state.wait_event_type,waitEvent:state.wait_event,blockers:state.blockers,observedAt:new Date().toISOString()};break;}
    await delay(20);
   }
   assert.ok(observation,name+': real contender did not block on held command');
  }finally{release();}
  const l=await lp,r=await rp;if(!l.ok)throw l.error;report.races.push({name,...observation,left:'committed',right:r.ok?'committed':r.error.code});return{left:l.value,right:r};
 }
 const nextRequest=async pid=>{const p=await plan(pid);return{commandId:randomUUID(),sourcePlanId:f.programId,sourceRevision:(await db`select revision from public.point_plans where id=${f.programId}`)[0].revision,unitId:f.id(30),predecessor:pid,revision:p.revision};};
 const next=(tx,q)=>tx`select public.phase5_create_gym_timplan(${q.commandId},${q.sourcePlanId},${q.sourceRevision},0,${q.unitId},${q.predecessor},${q.revision}) r`.then(r=>r[0].r.reply);
 let q1=await nextRequest(f.planId),q2=await nextRequest(f.planId);
 let raced=await race('same-series next version','principal',tx=>next(tx,q1),'principal',tx=>next(tx,q2));assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');
 assert.equal((await db`select count(*)::integer n from public.timplans where series_id=${(await plan(f.planId)).series_id}`)[0].n,2);assert.equal((await db`select count(*)::integer n from public.gym_timplan_receipts where command_id=${q2.commandId}`)[0].n,0);ok('same-series race creates one successor and no loser receipt');
 const qa=await createRequest('Samtidigt namn'),qb={...qa,commandId:randomUUID()};
 raced=await race('same name new series','principal',tx=>create(tx,qa),'principal',tx=>create(tx,qb));assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');assert.equal((await db`select count(*)::integer n from public.timplan_series where offering_id=${f.id(46)} and name='Samtidigt namn'`)[0].n,1);assert.equal((await db`select count(*)::integer n from public.named_timplan_commands where command_id=${qb.commandId}`)[0].n,0);ok('same-name race retains one series with no loser receipt');
 const replayQ=await createRequest('Samtidigt återförsök');raced=await race('same command ID','principal',tx=>create(tx,replayQ),'principal',tx=>create(tx,replayQ));assert.equal(raced.right.ok,true);assert.equal(raced.right.value.id,raced.left.id);assert.equal(raced.right.value.replayed,true);assert.equal((await db`select count(*)::integer n from public.named_timplan_commands where command_id=${replayQ.commandId}`)[0].n,1);ok('overlapping identical command replays one stable series and plan');
 const bq=await createRequest('Oberoende B'),cq=await createRequest('Oberoende C');const b=await run('principal',tx=>create(tx,bq)),c=await run('principal',tx=>create(tx,cq));
 await decision(b.id,'submit');await decision(c.id,'submit');const bd=await decisionRequest(b.id,'approve'),cd=await decisionRequest(c.id,'approve');
 raced=await race('different-series approve','hm',tx=>decide(tx,bd),'hm',tx=>decide(tx,cd));assert.equal(raced.right.ok,true);assert.equal((await plan(b.id)).status,'faststalld');assert.equal((await plan(c.id)).status,'faststalld');ok('overlapping approvals retain both independent approved series');
 q1=await nextRequest(b.id);q2=await nextRequest(c.id);raced=await race('different-series next version','principal',tx=>next(tx,q1),'principal',tx=>next(tx,q2));assert.equal(raced.right.ok,true);assert.equal(raced.left.version,2);assert.equal(raced.right.value.version,2);assert.notEqual((await plan(raced.left.id)).series_id,(await plan(raced.right.value.id)).series_id);ok('overlapping successors each receive version two in their own series');
 const b2=raced.left.id;await decision(b2,'submit');const staleApprove=await decisionRequest(b2,'approve'),bs=(await db`select s.* from public.timplan_series s join public.timplans t on t.series_id=s.id where t.id=${b2}`)[0];
 const renameQ={commandId:randomUUID(),planId:b2,seriesId:bs.id,expectedSeriesRevision:bs.revision,name:'B efter namnbyte'};
 raced=await race('rename versus reviewed approval','principal',async tx=>parseNamedTimplanRenameReply((await tx`select public.phase5_named_timplan_rename(${tx.json(renameQ)}) r`)[0].r,renameQ),'hm',tx=>decide(tx,staleApprove));assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');assert.equal((await plan(b2)).status,'forslag');assert.equal((await plan(b.id)).status,'faststalld');assert.equal((await db`select count(*)::integer n from public.plan_decision_receipts where command_id=${staleApprove.commandId}`)[0].n,0);ok('overlapping rename invalidates old approval hash without status or decision receipt');
 const classCreate={operation:'create',commandId:randomUUID(),planId:b.id,expectedPlanRevision:(await plan(b.id)).revision,name:'SAMTIDIG KLASS',startYear:f.year};
 const klass=await run('principal',tx=>tx`select public.phase5_class_command(${tx.json(classCreate)}) r`.then(r=>r[0].r));
 const linkQ={operation:'link',commandId:randomUUID(),classId:klass.id,schoolYear:f.year,planId:b.id,expectedPlanRevision:(await plan(b.id)).revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
 const otherLink={...linkQ,commandId:randomUUID(),planId:c.id,expectedPlanRevision:(await plan(c.id)).revision};
 raced=await race('class link versus competing update','principal',tx=>tx`select public.phase5_class_command(${tx.json(linkQ)}) r`,'principal',tx=>tx`select public.phase5_class_command(${tx.json(otherLink)}) r`);assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');const links=await db`select * from public.class_timplans where class_id=${klass.id} and start_year=${f.year}`;assert.equal(links.length,1);assert.equal(links[0].timplan_id,b.id);assert.equal((await db`select count(*)::integer n from public.class_plan_commands where command_id=${otherLink.commandId}`)[0].n,0);ok('overlapping class link keeps one exact year binding and rejects stale replacement');
 const sourceQ=await createRequest('Föråldrad källa'),source=(await db`select * from public.point_plans where id=${f.programId}`)[0];
 const p2=await run('principal',tx=>tx`select public.phase5_clone_programplan_draft(${f.programId},${source.revision},${source.version},null) r`.then(r=>r[0].r));await decision(p2.id,'submit','programplan');const approveSource=await decisionRequest(p2.id,'approve','programplan');
 raced=await race('source change versus create','hm',tx=>decide(tx,approveSource),'principal',tx=>create(tx,sourceQ));assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');assert.equal((await db`select count(*)::integer n from public.named_timplan_commands where command_id=${sourceQ.commandId}`)[0].n,0);assert.equal((await db`select count(*)::integer n from public.timplan_series where offering_id=${f.id(46)} and name='Föråldrad källa'`)[0].n,0);ok('overlapping source replacement rejects stale create without partial series or receipt');
 let preservedRows=0;
 for(const [table,records] of Object.entries(originalRecords)){
  const current=await db.unsafe('select to_jsonb(t) r from public.'+table+' t'),exact=new Set(current.map(row=>JSON.stringify(row.r)));
  for(const {r:record} of records){
   if(table==='point_plans'&&record.id===f.programId){const changed=current.find(row=>row.r.id===record.id).r;assert.equal(changed.status,'ersatt');assert.equal(changed.revision,record.revision+1);const stable=value=>{const {status,revision,updated_at,...rest}=value;return rest;};assert.deepEqual(stable(changed),stable(record));}
   else assert.ok(exact.has(JSON.stringify(record)),table+': synthetic original row unexpectedly changed');
   preservedRows++;
  }
 }
 report.originalPreservation={rows:preservedRows,allRowsPresent:true,onlyAllowedOriginalChange:'Explicit source predecessor retirement: status/revision/updated_at'};ok('all installed synthetic original rows remain exact except the explicitly exercised source retirement');
 report.finalFingerprint=await schemaFingerprint(db);assert.equal(report.finalFingerprint,report.installed.fingerprint);report.finalHashes=await allPublicHashes(db);
 assert.equal(report.races.length,8);assert.ok(report.races.every(r=>r.leftPid!==r.rightPid&&r.blockers.includes(r.leftPid)));ok('all eight races prove distinct backend PIDs and observed blocking overlap');
}
export async function verifyNamedTimplans(out){
 out=resolve(out);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'));const fd=openSync(out,'wx',0o600);closeSync(fd);
 const report={kind:'named-timplan-installed-concurrency',status:'FAIL',startedAt:new Date().toISOString(),sources:sources(),checks:[],races:[],limitations:['Only schema and synthetic repository fixtures; no original user rows copied','Real PostgreSQL overlap; no HTTP, browser, OIDC or live installation claim']};let snapshot;const save=()=>writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});save();
 try{snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;await exercise(snapshot,report);assert.deepEqual(sources(),report.sources);report.status='PASS';}
 catch(error){report.failure={code:error.code??'ASSERTION',message:error.message,hint:error.hint,where:error.where,stack:error.stack};}
 finally{if(snapshot)try{report.cleanup=await snapshot.cleanup();}catch(e){report.status='FAIL';report.cleanupFailure=e.message;}report.finishedAt=new Date().toISOString();save();}
 console.log(`${report.status}: ${report.checks.length} installed/concurrency checks, ${report.races.length} observed overlaps`);if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){assert.equal(process.argv[2],'--out');assert.equal(process.argv.length,4);await verifyNamedTimplans(process.argv[3]);}
