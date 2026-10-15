#!/usr/bin/env node
// Real local PostgreSQL; synthetic rows; one rollback, no persistent apply.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {allPublicHashes} from './verify-atomic-cohort-copy.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {setupClassCohortDatesFixture} from './verify-class-cohort-dates.mjs';
import {parseClassCohortUnderlag,parseClassCohortCreateRequest,parseClassCohortCreateReply,parseClassCohortStatusReply} from '../../web/lib/class-cohort.ts';
import {classCohortLinkSourceHashes} from './verify-class-cohort-link-identity.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const migration='supabase/migrations/20261015102000_class_cohort_commands.sql';
const test='supabase/tests/phase5_class_cohort_commands.test.sql';
export function classCohortCommandSourceHashes(){
 const paths=new Set([migration,test,'work/pilot/verify-class-cohort-commands.mjs','web/lib/class-cohort.ts','web/lib/class-cohort.test.mjs']);
 const visit=path=>{for(const match of readFileSync(resolve(root,path),'utf8').matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/gu)){
  const absolute=resolve(resolve(root,path),'..',match[1]);if(absolute.startsWith(root)&&existsSync(absolute)){
   const relative=absolute.slice(root.length);if(!paths.has(relative)){paths.add(relative);visit(relative);}
  }
 }};
 for(const path of [...paths])if(/\.(?:mjs|ts|tsx)$/u.test(path))visit(path);
 return {...classCohortLinkSourceHashes(),...Object.fromEntries([...paths].sort().map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
}
export async function verifyClassCohortCommands(out){
 const output=resolve(out);assert.ok(output.startsWith('/private/tmp/')&&output.endsWith('.json'),'Private --out required');assert.ok(!existsSync(output),'Output exists; choose new private path');
 const sources=classCohortCommandSourceHashes(),target=await assertTarget('protected');
 const db=createRequire(resolve(root,'web/package.json'))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const rollback=Error('expected_cohort_commands_rollback');let before,after,fingerprint,afterFingerprint,failure,checks=[],passed=false;
 try{
  before=await allPublicHashes(db);fingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin('isolation level read committed',async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>='20261015100000'`).length,0,'Package already applied; use applied verifier');
   const f=await setupClassCohortDatesFixture(tx);
   await tx.unsafe(readFileSync(resolve(root,'supabase/migrations/20261015100000_class_cohort_dates.sql'),'utf8'));
   await tx.unsafe(readFileSync(resolve(root,'supabase/migrations/20261015101000_class_cohort_link_identity.sql'),'utf8'));
   // 02 tests assert all functions with this prefix are private; execute before
   // 04 intentionally exposes the three authenticated server entrypoints.
   await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_class_cohort_dates.test.sql'),'utf8'));
   checks.push(...(await tx`select name from cohort_checks order by name`).map(r=>({name:'02 regression: '+r.name,ok:true})));
   const before04=await allPublicHashes(tx);
   await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));
   const after04=await allPublicHashes(tx);delete after04.class_cohort_commands;
   assert.deepEqual(after04,before04);checks.push({name:'04 migration preserves every pre-existing public row',ok:true});
   await tx`update cohort_context set value=value||${tx.json({unitId:f.id(30),customerId:f.id(1),organizerId:f.id(2),earlyOfferingId:f.id(40),identityId:f.id(11),sessionId:f.id(81),year:f.year})}`;
   await tx.unsafe(readFileSync(resolve(root,test),'utf8'));
   checks.push(...(await tx`select name from cohort_command_checks order by name`).map(r=>({name:r.name,ok:true})));
   const [{value:ctx}]=await tx`select value from cohort_context`;
   const request=parseClassCohortCreateRequest(ctx.batchRequest);
   assert.deepEqual(parseClassCohortCreateReply(ctx.batchReply,request),ctx.batchReply);
   const status=(await tx`select public.phase5_class_cohort_status(${tx.json(request)}) r`)[0].r;
   assert.deepEqual(parseClassCohortStatusReply(status,request),status);
   for(const offeringId of [ctx.earlyOfferingId,ctx.offeringId,ctx.nullCalendarOfferingId,ctx.outsideYearOfferingId]){
    const input={offeringId,unitId:ctx.unitId},result=(await tx`select public.phase5_class_cohort_underlag(${offeringId},${ctx.unitId}) r`)[0].r;
    assert.deepEqual(parseClassCohortUnderlag(result,input),result);
   }
   checks.push({name:'Actual SQL draft legacy blocked read batch and status satisfy TS parsers',ok:true});
   // The actual narrow login role can execute all three entrypoints; direct
   // helper and receipt-table access stay denied, even with valid GUC context.
   await tx`set local role skolplattform_worker`;
   const input={offeringId:ctx.earlyOfferingId,unitId:ctx.unitId};
   const workerRead=parseClassCohortUnderlag((await tx`select public.phase5_class_cohort_underlag(${input.offeringId},${input.unitId}) r`)[0].r,input);
   const workerRequest=parseClassCohortCreateRequest({commandId:randomUUID(),...input,expectedEducationRevision:workerRead.educationRevision,expectedSourceToken:workerRead.sourceToken,startsOn:workerRead.educationStartsOn,names:['WORKER-ÅÄÖ','𐐀27','😀'.repeat(30)]});
   const workerReply=(await tx`select public.phase5_class_cohort_command(${tx.json(workerRequest)}) r`)[0].r;
   assert.deepEqual(parseClassCohortCreateReply(workerReply,workerRequest),workerReply);
   const workerStatus=(await tx`select public.phase5_class_cohort_status(${tx.json(workerRequest)}) r`)[0].r;
   assert.deepEqual(parseClassCohortStatusReply(workerStatus,workerRequest),workerStatus);
   for(const sql of ['select * from public.class_cohort_commands',"select public.phase5_class_cohort_name('A')"]){
    let error;try{await tx.savepoint(t=>t.unsafe(sql));}catch(e){error=e;}assert.equal(error?.code,'42501','Worker private surface denied');
   }
   await tx`reset role`;
   checks.push({name:'Actual Worker reads creates Unicode classes recovers receipt and cannot access private surface',ok:true});
   for(const value of ['\\ud800','\\udc00','A\\ud800B']){
    let error;try{await tx.savepoint(t=>t`select (${ '"'+value+'"'}::text)::jsonb`);}catch(e){error=e;}assert.equal(error?.code,'22P02','Malformed UTF16 transport denied');
   }
   checks.push({name:'PostgreSQL rejects lone surrogate JSON without replacement normalization',ok:true});
   // JS name oracle includes every changed uppercase / Cc/Cf codepoint, plus
   // all trim characters and astral/UTF-16 boundaries. No locale assumptions.
   const candidates=['SA27A','ÅÄÖ 27','A B','😀'.repeat(30),'𐐀27','',' A','A ','a','å','A\nB','A\u200dB','A\ufeffB','\u00a0A','A\u00a0','😀'.repeat(31),'𐐨27','ß27'];
   for(let cp=1;cp<=0x10ffff;cp++){const s=String.fromCodePoint(cp);if(/[\p{Cc}\p{Cf}]/u.test(s)||s.toUpperCase()!==s)for(const n of [cp-1,cp,cp+1])if(n>0&&n<=0x10ffff&&(n<0xd800||n>0xdfff))candidates.push('A'+String.fromCodePoint(n)+'B');}
   for(const cp of [9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279]){const s=String.fromCodePoint(cp);candidates.push(s+'A','A'+s,'A'+s+'B');}
   const rows=await tx`select n,public.phase5_class_cohort_name(n) ok from unnest(${candidates}::text[]) n`;
   for(const {n,ok}of rows)assert.equal(ok,n.length>=1&&n.length<=60&&n===n.trim().toUpperCase()&&!/[\p{Cc}\p{Cf}]/u.test(n),'Unicode name parity');
   checks.push({name:`SQL matches JS canonical names across ${rows.length} Unicode probes (${process.versions.unicode})`,ok:true});
   passed=true;throw rollback;
  });}catch(e){if(e!==rollback)throw e;}
 }catch(e){failure={code:e.code,message:e.message,where:e.where,hint:e.hint,position:e.position};}
 finally{
  try{after=await allPublicHashes(db);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);assert.equal(afterFingerprint,fingerprint);assert.deepEqual(classCohortCommandSourceHashes(),sources);}
  catch(e){failure={...failure,verificationFailure:e.message};}await db.end();
 }
 const report={kind:'class-cohort-commands-rollback',status:passed&&!failure?'PASS':'FAIL',target:'protected',stage:'04',sources,before,after,fingerprint,afterFingerprint,checks,
  rollbackRestored:JSON.stringify(before)===JSON.stringify(after)&&fingerprint===afterFingerprint,
  limitations:['No persistent apply','No two-session concurrency claim until plan08','SQL names checked against current Node Unicode, runtime upgrades require parity rerun'],failure};
 writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: ${checks.length} class command checks; rollback=${report.rollbackRestored}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Use --out /private/tmp/name.json');assert.equal(process.argv[2],'--out');
 const report=await verifyClassCohortCommands(process.argv[3]);if(report.status!=='PASS')process.exitCode=1;
}
