#!/usr/bin/env node
// Exact locally approved maintenance of six old fixture offerings only.
// No identity/session is impersonated, no trigger/constraint is disabled, and
// all plan, mandate and audit rows are preserved. Private evidence records that
// this is administrator maintenance, not a user action through the app API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
const sourcePath=fileURLToPath(import.meta.url),sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const quote=x=>'"'+x.replaceAll('"','""')+'"',rollback=new Error('expected_maintenance_rollback');
const privatePath=p=>{const v=path.resolve(p);assert.ok(/^\/private\/tmp\/[^/]+\.json$/u.test(v));return v;};
const read=p=>JSON.parse(fs.readFileSync(privatePath(p),'utf8'));
const publish=(p,r)=>fs.writeFileSync(privatePath(p),JSON.stringify(r,null,2)+'\n',{flag:'wx',mode:0o600});
async function schema(tx){
 const rows=await tx`select c.relname,c.relkind,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
  (select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid)) order by t.tgname)
    from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) triggers,
  (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid) constraints
  from pg_class c where c.relnamespace='public'::regnamespace order by c.relname`;
 const journal=await tx`select version from supabase_migrations.schema_migrations order by version`;
 return sha({rows,journal});
}
async function preserved(tx,ids){
 const tables=await tx`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' order by relname`;
 const hashes={};
 for(const {relname} of tables){
  // Normalize only the three explicitly permitted fields of the exact six rows.
  const row=relname==='offerings'?"case when t.id=any($1::uuid[]) then to_jsonb(t)-'archived_at'-'lifecycle_revision'-'updated_at' else to_jsonb(t) end":'to_jsonb(t)';
  const [r]=await tx.unsafe(`select count(*)::int count,encode(extensions.digest(coalesce(string_agg(h,'' order by h),''),'sha256'),'hex') sha256
    from(select encode(extensions.digest((${row})::text,'sha256'),'hex') h from public.${quote(relname)} t) fingerprints`,relname==='offerings'?[ids]:[]);
  hashes[relname]=r;
 }
 return hashes;
}
async function rows(tx,customerId){return (await tx`select to_jsonb(o) row from public.offerings o join public.organizers g on g.id=o.organizer_id
 where g.customer_id=${customerId} order by o.id`).map(r=>r.row);}
async function noActiveOwner(tx,customerId){
 const [r]=await tx`select
  (select count(*)::int from public.app_sessions s join public.memberships m on m.id=s.membership_id
   where m.customer_id=${customerId} and s.revoked_at is null and least(s.expires_at,s.absolute_expires_at)>now()) live_sessions,
  (select count(*)::int from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and xact_start is not null) other_transactions`;
 assert.equal(r.live_sessions,0);assert.equal(r.other_transactions,0);return r;
}
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--prepare','--verify','--apply'].includes(mode));
 for(let i=0;i<args.length;i+=2){assert.ok(['--trace','--backup','--verification','--out'].includes(args[i])&&args[i+1]);opts[args[i]]=privatePath(args[i+1]);}
 assert.ok(opts['--out']);assert.ok(!fs.existsSync(opts['--out']));
 const sourceSha256=sha(fs.readFileSync(sourcePath,'utf8')),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{},
  connection:{application_name:'approved_fixture_archive_maintenance',default_transaction_read_only:mode==='--prepare'?'on':'off'}});
 let result,stage='preflight',transactionReturned=false;
 try{
  if(mode==='--prepare'){
   const trace=read(opts['--trace']);assert.equal(trace.kind,'protected-cleanup-provenance');assert.equal(trace.readOnly,true);
   const candidate=trace.customers.find(c=>c.customer_id===trace.reviewGraph.customerId);assert.ok(candidate&&candidate.completedRecoveryMatches.length===0);
   const prior=trace.reviewGraph.rows.find(r=>r.table==='offerings');assert.equal(prior.count,6);
   result=await db.begin('isolation level repeatable read read only',async tx=>{
    await tx`set local statement_timeout='30s'`;await tx`set local lock_timeout='3s'`;
    const [owner]=await tx`select count(*)::int count from public.customers where id=${candidate.customer_id} and name='Syntetiskt programplansprov'`;
    assert.equal(owner.count,1);
    const offerings=await rows(tx,candidate.customer_id);assert.equal(offerings.length,6);assert.ok(offerings.every(o=>o.archived_at===null&&o.kind==='gymnasium'));
    const [priorHash]=await tx`select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'sha256'),'hex') sha256
      from public.offerings t join public.organizers g on g.id=t.organizer_id where g.customer_id=${candidate.customer_id}`;
    assert.equal(priorHash.sha256,prior.sha256);
    const ids=offerings.map(o=>o.id),activity=await noActiveOwner(tx,candidate.customer_id);
    return {kind:'approved-fixture-archive-backup',status:'PASS',mode,createdAt:new Date().toISOString(),target:'protected',sourceSha256,
      traceSha256:sha(fs.readFileSync(opts['--trace'],'utf8')),customerId:candidate.customer_id,ids,offerings,activity,
      schemaSha256:await schema(tx),preservedRows:await preserved(tx,ids),writes:0,
      scope:'Only archived_at, lifecycle_revision and trigger-managed updated_at of these exact six offerings may change; no other rows may change.',
      recovery:'Restore archived_at from this backup only after a fresh explicit restore decision, exact archived-row comparison and a new transaction; increment lifecycle_revision again and retain updated_at from the normal trigger. Never overwrite later changes or rewind revisions.'};
   });
  }else{
   const backup=read(opts['--backup']);assert.equal(backup.kind,'approved-fixture-archive-backup');assert.equal(backup.status,'PASS');
   assert.equal(backup.sourceSha256,sourceSha256);assert.equal(backup.ids.length,6);assert.equal(new Set(backup.ids).size,6);
   const backupSha256=sha(fs.readFileSync(opts['--backup'],'utf8'));
   if(mode==='--apply'){
    const verify=read(opts['--verification']);assert.equal(verify.kind,'approved-fixture-archive-maintenance');assert.equal(verify.status,'PASS');
    assert.equal(verify.mode,'--verify');assert.equal(verify.rolledBack,true);assert.equal(verify.sourceSha256,sourceSha256);assert.equal(verify.backupSha256,backupSha256);
   }
   let afterOfferings,verification,before;
   stage='transaction';
   try{await db.begin('isolation level serializable',async tx=>{
    await tx`set local statement_timeout='30s'`;await tx`set local lock_timeout='3s'`;await tx`set local idle_in_transaction_session_timeout='60s'`;
    await tx`select pg_advisory_xact_lock(552099)`;
    await noActiveOwner(tx,backup.customerId);
    await tx`select id from public.offerings where id=any(${backup.ids}::uuid[]) order by id for update`;
    assert.equal(await schema(tx),backup.schemaSha256);assert.deepEqual(await rows(tx,backup.customerId),backup.offerings);
    before=await preserved(tx,backup.ids);assert.deepEqual(before,backup.preservedRows);
    const changed=await tx`update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1
      where id=any(${backup.ids}::uuid[]) and archived_at is null returning id`;
    assert.equal(changed.length,6);
    afterOfferings=await rows(tx,backup.customerId);
    for(let i=0;i<6;i++){
     const old=backup.offerings[i],fresh=afterOfferings[i];assert.equal(fresh.id,old.id);assert.ok(fresh.archived_at);assert.equal(fresh.lifecycle_revision,old.lifecycle_revision+1);
     const normalize=({archived_at,lifecycle_revision,updated_at,...rest})=>rest;
     assert.deepEqual(normalize(fresh),normalize(old));assert.ok(fresh.updated_at);
    }
    assert.deepEqual(await preserved(tx,backup.ids),before);assert.equal(await schema(tx),backup.schemaSha256);
    verification={exactSixArchived:true,allOtherColumnsPreserved:true,allOtherRowsPreserved:true,allPlansAndAuditPreserved:true,allTriggersAndConstraintsPreserved:true};
    if(mode==='--verify')throw rollback;
   });transactionReturned=true;}catch(e){if(e!==rollback)throw e;transactionReturned=true;}
   stage='post-transaction-verification';
   // Read-after-completion proves known commit/rollback outcome. No inferred success.
   const current=await rows(db,backup.customerId);assert.deepEqual(current,mode==='--verify'?backup.offerings:afterOfferings);
   assert.deepEqual(await preserved(db,backup.ids),before);assert.equal(await schema(db),backup.schemaSha256);
   result={kind:'approved-fixture-archive-maintenance',status:'PASS',mode,createdAt:new Date().toISOString(),target:'protected',sourceSha256,backupSha256,
    customerId:backup.customerId,ids:backup.ids,rolledBack:mode==='--verify',committed:mode==='--apply',writes:mode==='--apply'?6:0,
    afterOfferings:mode==='--apply'?afterOfferings:null,verification,
    audit:'Explicit local administrator maintenance recorded in this private report; no user identity/session was impersonated and existing app audit/history rows are byte-preserved.'};
  }
 }catch(error){
  const failure={kind:'approved-fixture-archive-maintenance',status:'FAIL',mode,target:'protected',sourceSha256,stage,transactionReturned,commitOutcomeRequiresInspection:mode==='--apply'&&stage!=='preflight',code:/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'VERIFICATION_FAILED'};
  if(!fs.existsSync(opts['--out']))publish(opts['--out'],failure);
  throw error;
 }finally{await db.end({timeout:5});}
 publish(opts['--out'],result);
 console.log(JSON.stringify({status:'PASS',mode,changedRows:result.writes,allPlansAndHistoryPreserved:true,privateEvidenceWritten:true}));
}
await main().catch(()=>{console.error('FAIL: exact fixture archival did not complete verification; preserve private backup and inspect state before any retry. Database details were not logged.');process.exitCode=1;});
