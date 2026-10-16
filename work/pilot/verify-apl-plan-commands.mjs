#!/usr/bin/env node
// Actual SQL on an owned schema-only database. No active data or runtime writes.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeSync, ftruncateSync, fsyncSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire, registerHooks } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { approvedClassFixture, sourceHashes as fixtureSources } from './verify-class-timplans.mjs';
import { gymRowKey } from '../../web/lib/gym-timplan.ts';
import { parseAplCommand, parseAplReadReply, parseAplCommandReply, parseAplStatusReply, parseAplSqlEnvelope,
 verifyAplReadReply, projectAplPlan, aplHashCanonical, aplPlanCanonicalPayload,
 aplCanonicalSerialize } from '../../web/lib/apl-plan.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const aplMigration = 'supabase/migrations/20261016120000_apl_planning.sql';
const rollback = Error('expected_apl_commands_rollback');
// Load the real projection code under Node. Only the unused Worker bindings
// module is replaced; all actual mandates and writes are exercised in SQL.
async function loadProjection() {
 const ts=createRequire(resolve(root,'web/package.json'))('typescript');
 const hook=registerHooks({resolve(specifier,context,next){
  return specifier==='cloudflare:workers'?{url:'data:text/javascript,export%20const%20env%3D%7B%7D%3B',shortCircuit:true}:next(specifier,context);
 },load(url,context,next){
  if(url.startsWith(new URL('../../web/',import.meta.url).href)&&url.endsWith('.ts'))return{format:'module',shortCircuit:true,
   source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
  return next(url,context);
 }});
 try{return await import('../../web/lib/server/gym-timplan.ts');}finally{hook.deregister();}
}
const {projectGymTimplan,projectSource}=await loadProjection();
export function aplSources(additional = []) {
 const paths = new Set([...Object.keys(fixtureSources()), aplMigration, 'work/pilot/verify-apl-plan-commands.mjs',
  'supabase/tests/phase5_apl_hash_vectors.json', 'web/lib/apl-plan.ts', 'web/lib/server/gym-timplan.ts', 'web/package-lock.json', 'work/pilot/named-timplan-snapshot.mjs', 'web/lib/programplan-catalog.generated.json',
  'supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql', ...additional]);
 const ts = createRequire(resolve(root, 'web/package.json'))('typescript'), visited = new Set();
 const visit = file => {
  if (visited.has(file)) return; visited.add(file); paths.add(file);
  const absolute = resolve(root, file); assert.ok(absolute.startsWith(root));
  const syntax = ts.createSourceFile(absolute, readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const item of syntax.statements) {
   if (!(ts.isImportDeclaration(item) || ts.isExportDeclaration(item))) continue;
   const spec = item.moduleSpecifier;
   if (!spec || !ts.isStringLiteral(spec) || !spec.text.startsWith('.')) continue;
   const dependency = relative(root, resolve(dirname(absolute), spec.text));
   if (/\.(?:mjs|js|ts)$/u.test(dependency)) visit(dependency);
  }
 };
 for (const file of [...paths]) if (/\.(?:mjs|js|ts)$/u.test(file)) visit(file);
 return Object.fromEntries([...paths].sort().map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
}
export async function aplActor(tx, f, name) {
 const [identity, membership, session] = { hm: [10,20,80], principal: [11,21,81], principal2: [12,22,82], admin: [13,23,83] }[name];
 for (const [key,value] of Object.entries({ customer_id: f.id(1), organizer_id: f.id(2), identity_id: f.id(identity),
  membership_id: f.id(membership), session_id: f.id(session), assignment_id: f.roles[name], correlation_id: randomUUID() })) {
  await tx`select set_config(${`app.${key}`},${value},true)`;
 }
}
async function configured(tx, f, actor) {
 await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='30s'`; await tx`set local transaction_timeout='45s'`;
 await aplActor(tx, f, actor);
}
export async function aplRace(snapshot, report, f, name, leftActor, leftFn, rightActor, rightFn) {
 const left = await snapshot.connect(), right = await snapshot.connect(), db = snapshot.db;
 let release, resolveReady, rejectReady, resolvePid;
 const gate = new Promise(r => release = r), ready = new Promise((r,j) => {resolveReady=r; rejectReady=j;}), pidReady = new Promise(r => resolvePid=r);
 let leftPid, rp, observation;
 const lp = left.begin(async tx => {
  await configured(tx,f,leftActor); leftPid=(await tx`select pg_backend_pid() pid`)[0].pid;
  const value=await leftFn(tx); resolveReady(value); await gate; await tx`set constraints all immediate`; return value;
 }).then(value=>({ok:true,value}),error=>{rejectReady(error);return{ok:false,error};});
 try {
  await ready;
  rp=right.begin(async tx=>{await configured(tx,f,rightActor);resolvePid((await tx`select pg_backend_pid() pid`)[0].pid);return rightFn(tx);})
   .then(value=>({ok:true,value}),error=>{resolvePid(null);return{ok:false,error:{code:error.code,hint:error.hint,message:error.message}};});
  const rightPid=await pidReady; assert.ok(rightPid); assert.notEqual(leftPid,rightPid);
  const deadline=Date.now()+7000;
  while(Date.now()<deadline) {
   const [state]=await db`select wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=${rightPid}`;
   if(state?.blockers.includes(leftPid)){observation={leftPid,rightPid,...state,observedAt:new Date().toISOString()};break;}
   await delay(20);
  }
  assert.ok(observation,name+': no observed blocking overlap');
 } catch(error) {release();await Promise.allSettled([lp,...(rp?[rp]:[])]);throw error;} finally {release();}
 const l=await lp,r=await rp;if(!l.ok)throw l.error;
 report.races.push({name,...observation,left:'committed',right:r.ok?'committed':r.error.code}); return {left:l.value,right:r};
}
export async function aplDeny(tx, checks, name, fn, codes=['42501','40001','22023']) {
 const before=await allPublicHashes(tx);let error;
 try{await tx.savepoint(fn);}catch(e){error=e;}
 assert.ok(error,name);assert.ok(codes.includes(error.code),name+': unexpected '+error.code);
 assert.deepEqual(await allPublicHashes(tx),before,name+': no partial writes');checks.push({name,ok:true});
}
// Existing named-plan creation; independent of the new APL transport shape.
export async function aplDraftFromApproved(tx, f, name='Syntetisk APL') {
 await aplActor(tx,f,'principal');
 const [{revision:sourceRevision}]=await tx`select revision from public.point_plans where id=${f.programId}`;
 const [{revision:copyRevision}]=await tx`select revision from public.timplans where id=${f.planId}`;
 const q={commandId:randomUUID(),sourcePlanId:f.programId,expectedSourceRevision:sourceRevision,expectedEducationRevision:0,
  unitId:f.id(30),name,copyFromPlanId:f.planId,expectedCopyFromRevision:copyRevision};
 return (await tx`select public.phase5_named_timplan_create(${tx.json(q)}) result`)[0].result;
}
async function functionAcl(tx) {
 return tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner::text owner
  from pg_proc p where p.pronamespace='public'::regnamespace order by 1`;
}
export async function installAplCommands(tx, report) {
 await tx`set constraints all immediate`;
 const original=await allPublicHashes(tx),acl=await functionAcl(tx);
 await tx.unsafe(readFileSync(resolve(root,aplMigration),'utf8'));
 const after=await allPublicHashes(tx),afterAcl=await functionAcl(tx);
 for(const table of Object.keys(original))assert.deepEqual(after[table],original[table],table+': original rows must be untouched by additive DDL');
 for(const old of acl)assert.deepEqual(afterAcl.find(row=>row.signature===old.signature),old,old.signature+': existing privileges must be unchanged');
 report.migrationBeforeRows=original;report.migrationAfterRows=after;report.grantsUnchanged=true;
 report.checks.push({name:'migration preserves every existing row and existing function ACL',ok:true});
 await tx`set constraints all deferred`;
}

export async function aplVerifiedEnvelope(raw, operation, request) {
 const envelope=parseAplSqlEnvelope(raw, value=>operation==='read'?parseAplReadReply(value,request):
  operation==='command'?parseAplCommandReply(value,request):parseAplStatusReply(value,request));
 if(envelope.basis===null)return{envelope,context:null,detail:null};
 const basis=envelope.basis, gym=basis.gymTimplan, id=operation==='status'?request.command.planId:request.planId;
 const {body:plan}=await projectGymTimplan(gym,id);
 const ref=gym.source.basisReference.programRef;
 // projectSource independently verifies the full frozen catalog, selected frame and terms.
 // Administrative lifecycle flags are not content and must not alter the rector hash.
 const source=await projectSource({...gym.source,status:'faststalld',archived:false},gym.catalog);
 const program=gym.catalog.programs.find(p=>p.code===ref.code&&p.version===ref.version);
 assert.ok(program,'verified frozen program must exist');
 const context={organizerId:basis.organizerId,plan,copyReview:basis.copyReview,program:{
  code:program.code,version:program.version,category:program.category,startDate:program.startDate,
  endDate:program.endDate,canceledDate:program.canceledDate,sourceSupported:source.readiness.ready}};
 const detail=operation==='read'?envelope.result:operation==='command'?envelope.result.detail:envelope.result.result.detail;
 await verifyAplReadReply(detail,context);
 return{envelope,context,detail};
}
export const aplRead=async(tx,planId)=>aplVerifiedEnvelope((await tx`select public.phase5_apl_plan_read(${planId}) result`)[0].result,'read',{planId});
export const aplCommand=async(tx,q)=>aplVerifiedEnvelope((await tx`select public.phase5_apl_plan_command(${tx.json(q)}) result`)[0].result,'command',q);
export const aplStatus=async(tx,q)=>aplVerifiedEnvelope((await tx`select public.phase5_apl_plan_status(${tx.json({command:q})}) result`)[0].result,'status',{command:q});
export async function aplPreparedDraft(tx,f,name) {
 const created=await aplDraftFromApproved(tx,f,name),planId=created.reply.id;
 let {body:plan}=await projectGymTimplan(created.plan,planId);
 const row=plan.rows.find(r=>r.rowKind==='fixed'&&!r.key.startsWith('meta:')&&r.pointTerms[0]>0);
 assert.ok(row,'fixture needs real first-term level');
 const hours=[...plan.hours[row.key]];hours[0]=400;
 await tx`select public.phase5_write_gym_timplan_row(${planId},${plan.revision},${row.key},${tx.json(hours)})`;
 const raw=(await tx`select public.phase5_read_gym_timplan(${planId}) result`)[0].result;
 ({body:plan}=await projectGymTimplan(raw,planId));
 const d=new Date(plan.source.startedOn+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+(8-d.getUTCDay())%7);
 const startsOn=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()+104);const endsOn=d.toISOString().slice(0,10);
 const extra=plan.rows.find(r=>r.key!==row.key&&r.rowKind==='fixed'&&!r.key.startsWith('meta:')&&r.pointTerms[0]>0&&plan.hours[r.key][0]>=12);assert.ok(extra);
 const value={contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[{
  id:randomUUID(),name:'Syntetisk APL – höst',startsOn,endsOn,schoolYear:f.year,
  extent:{basis:'whole_weeks',weeks:15,reviewed:true,reviewNote:'Syntetiskt granskat underlag.'},
  contents:[{rowKey:row.key,description:'Syntetisk del av ämnesnivån'},{rowKey:extra.key,description:'Syntetiskt andra innehåll'}],
  allocations:[{rowKey:row.key,termIndex:0,gutMinutes:20010},{rowKey:extra.key,termIndex:0,gutMinutes:690}]}]};
 return{planId,plan,value,rowKey:row.key,hours};
}
export const aplSave=(draft,revision=draft.plan.revision,value=draft.value)=>parseAplCommand({contractVersion:'structured_v1',
 action:'save',commandId:randomUUID(),planId:draft.planId,expectedRevision:revision,plan:value,copyReviewResolutions:[]});
const clone=value=>structuredClone(value);
async function closedAccess(tx,checks) {
 const tables=(await tx`select tablename from pg_tables where schemaname='public' and starts_with(tablename,'apl_')`).map(r=>r.tablename);
 assert.deepEqual([...tables].sort(),['apl_plan_commands','apl_plan_copy_reviews','apl_plan_periods','apl_plan_underlag','apl_plan_write_permits','apl_period_contents','apl_rector_confirmations','apl_time_allocations'].sort());
 const functions=await tx`select p.oid::regprocedure::text signature from pg_proc p where p.pronamespace='public'::regnamespace and starts_with(p.proname,'phase5_apl_')`;
 assert.ok(functions.length>=3);
 for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
  for(const f of functions)assert.equal((await tx`select has_function_privilege(${role},${f.signature},'execute') allowed`)[0].allowed,false);
  await tx.savepoint(async t=>{await t.unsafe('set local role '+role);
   for(const table of tables)for(const sql of ['select * from public.'+table,'delete from public.'+table]){
    let error;try{await t.savepoint(s=>s.unsafe(sql));}catch(e){error=e;}assert.equal(error?.code,'42501');
   }
   for(const sql of ["select public.phase5_apl_plan_read('11111111-0000-4000-8000-000000000001')", "select public.phase5_apl_plan_command('{}')", "select public.phase5_apl_plan_status('{}')"]){
    let error;try{await t.savepoint(s=>s.unsafe(sql));}catch(e){error=e;}assert.equal(error?.code,'42501');
   }
   await t`reset role`;
  });checks.push({name:role+' actual role denied all APL tables and closed entrypoints/helpers',ok:true});
 }
}
async function aplRowKeyParity(tx,checks) {
 // Independent JS Unicode property boundaries; expected acceptance comes from
 // the actual shared term parser, never from the SQL implementation's ranges.
 const samples=new Set([32,45,48,57,65,90,95,97,122,160,0x200b,0xfeff,0x10ffff]);
 let previous=-1;
 for(let cp=1;cp<=0x10ffff;cp++){
  if(cp>=0xd800&&cp<=0xdfff)continue;
  const c=String.fromCodePoint(cp),kind=/\p{L}/u.test(c)?1:/\p{N}/u.test(c)?2:0;
  if(kind!==previous){if(cp>1&&cp-1!==0xdfff)samples.add(cp-1);samples.add(cp);previous=kind;}
 }
 const keys=[null,0,{},'', 'not:a:row','meta:individualChoice','meta:diplomaWork','block:x',
  'block:X','block:abcdefghijklmnop','block:abcdefghijklmnopq','foundation:A:0:B','foundation:A:1000000:B',
  'foundation:A:999999:B','alternative:foundation:A:1:B+C:2:D','alternative:foundation:A:1:B',
  'foundation:'+ 'A'.repeat(305)+':1:B','foundation:'+ 'A'.repeat(306)+':1:B'];
 for(const cp of samples){const c=String.fromCodePoint(cp);keys.push('foundation:'+c+':1:A','foundation:A'+c+':1:A');}
 const expected=keys.map(key=>{try{gymRowKey(key);return true;}catch{return false;}});
 const rows=await tx`select ordinality::int position,public.phase5_apl_row_key(value) valid from jsonb_array_elements(${tx.json(keys)}) with ordinality order by ordinality`;
 assert.equal(rows.length,keys.length);
 for(let i=0;i<keys.length;i++)assert.equal(rows[i].valid,expected[i],'rowKey parity sample '+i);
 checks.push({name:'SQL row-key grammar agrees with TypeScript across '+keys.length+' Unicode-boundary and grammar probes',ok:true});
}
async function aplHashVectors(tx,checks) {
 const small=['APL-å',23,null,true,false,['é',690]],smallCanonical=aplCanonicalSerialize(small);
 assert.equal(smallCanonical,'a6:s6:APL-åi23;ntfa2:s2:éi690;');
 assert.equal((await tx`select public.phase5_apl_canonical(${tx.json(small)}) value`)[0].value,smallCanonical);
 assert.equal(await aplHashCanonical(small),'sha256:b54eabd4a0ee5d100187de548a9cde8fa8402391e02ef338914515e14a62230c');
 const v=JSON.parse(readFileSync(resolve(root,'supabase/tests/phase5_apl_hash_vectors.json'),'utf8'));
 const [sql]=await tx`select public.phase5_apl_hash_payload(${tx.json(v.gym)},${v.organizer},${tx.json(v.apl)},${tx.json(v.reviews)},${tx.json(v.program)}) payload,
  public.phase5_apl_hash_value(${tx.json(v.gym)},${v.organizer},${tx.json(v.apl)},${tx.json(v.reviews)},${tx.json(v.program)}) hash`;
 assert.deepEqual(sql.payload,v.expectedPayload);assert.equal(aplCanonicalSerialize(sql.payload),v.expectedCanonical);
 assert.equal(sql.hash,v.expectedHash);assert.equal(await aplHashCanonical(sql.payload),sql.hash);
 checks.push({name:'portable UTF-8 canonical encoding and full APL-01 frozen hash vectors match actual SQL',ok:true});
}
export async function aplCommandMatrix(tx,report,f) {
 const checks=report.checks,ok=name=>checks.push({name,ok:true});
 await aplHashVectors(tx,checks);await aplRowKeyParity(tx,checks);await closedAccess(tx,checks);await aplActor(tx,f,'principal');
 const draft=await aplPreparedDraft(tx,f,'Syntetisk APL kommandoprov');
 const keyMalformed=clone(draft.value);keyMalformed.periods[0].contents[0].rowKey='not:a:row';keyMalformed.periods[0].allocations[0].rowKey='not:a:row';
 await aplDeny(tx,checks,'raw planning parser rejects malformed historical row keys',s=>s`select public.phase5_apl_plan_parse(${s.json(keyMalformed)})`,['22023']);
 const initial=await aplRead(tx,draft.planId);assert.equal(initial.detail.plan,null);
 assert.deepEqual(initial.detail.capabilities,{canSave:true,canConfirm:true});
 assert.equal(projectAplPlan(initial.context,null).state,'legacy');ok('legacy is explicit null with verified frozen source and no invented APL hours');
 assert.equal(projectAplPlan(initial.context,draft.value).readyForConfirmation,true);
 const save=aplSave(draft);
 assert.deepEqual((await aplStatus(tx,save)).envelope.result,{state:'not_found',result:null});
 const saved=await aplCommand(tx,save);assert.equal(saved.detail.revision,save.expectedRevision+1);
 assert.equal(saved.envelope.result.receipt.changed,true);assert.equal(aplCanonicalSerialize(aplPlanCanonicalPayload(saved.detail.plan)),aplCanonicalSerialize(aplPlanCanonicalPayload(save.plan)));
 assert.equal(saved.detail.confirmations.length,0);assert.equal(projectAplPlan(saved.context,saved.detail.plan).allocatedGutMinutes,20700);
 ok('atomic save and strict SQL→TypeScript projection/hash parity preserve 20 700 minutes inside total');
 const beforeReplay=await allPublicHashes(tx);
 const replay=await aplCommand(tx,save);assert.deepEqual(await allPublicHashes(tx),beforeReplay);
 const status=await aplStatus(tx,save);
 const replayResult=clone(saved.envelope.result);replayResult.receipt.replayed=true;
 assert.deepEqual(replay.envelope.result,replayResult);assert.deepEqual(status.envelope.result,{state:'completed',result:replayResult});
 assert.deepEqual(replay.envelope.basis,saved.envelope.basis);const afterStatus=await allPublicHashes(tx);
 for(const table of Object.keys(beforeReplay))if(table!=='security_events')assert.deepEqual(afterStatus[table],beforeReplay[table]);
 assert.equal(afterStatus.security_events.count,beforeReplay.security_events.count+1);
 ok('exact command replay has no new write/audit; status freezes basis/reply and audits only the read');
 await aplDeny(tx,checks,'same command ID changed payload conflicts',s=>aplCommand(s,{...save,plan:{...save.plan,classification:'unreviewed'}}),['40001']);
 await aplDeny(tx,checks,'stale new save conflicts',s=>aplCommand(s,{...save,commandId:randomUUID()}),['40001']);
 const reordered=clone(save.plan);reordered.periods[0].contents.reverse();reordered.periods[0].allocations.reverse();
 const noop=aplSave(draft,saved.detail.revision,reordered);
 const unchanged=await aplCommand(tx,noop);assert.equal(unchanged.detail.revision,saved.detail.revision);
 assert.equal(unchanged.envelope.result.receipt.changed,false);ok('semantic no-op uses same revision and new durable receipt');
 const audited=await tx`select action,count(*)::int n from public.security_events where customer_id=${f.id(1)} and action in ('apl_plan_saved','apl_plan_unchanged') group by action`;
 assert.equal(audited.find(x=>x.action==='apl_plan_saved')?.n,1);assert.equal(audited.find(x=>x.action==='apl_plan_unchanged')?.n,1);ok('save and no-op each audit exactly once');
 const confirm=parseAplCommand({contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:draft.planId,
  expectedRevision:saved.detail.revision,expectedContentHash:saved.detail.contentHash,comment:'Syntetisk rektorsgranskning'});
 await aplActor(tx,f,'admin');
 assert.deepEqual((await aplRead(tx,draft.planId)).detail.capabilities,{canSave:true,canConfirm:false});
 await aplDeny(tx,checks,'administrator cannot confirm rector placement',s=>aplCommand(s,confirm),['42501']);
 const adminSave=await aplCommand(tx,{...noop,commandId:randomUUID()});assert.equal(adminSave.envelope.result.receipt.changed,false);ok('administrator prepares within current school mandate');
 await aplActor(tx,f,'hm');assert.deepEqual((await aplRead(tx,draft.planId)).detail.capabilities,{canSave:false,canConfirm:false});
 await aplDeny(tx,checks,'HM cannot save APL',s=>aplCommand(s,{...noop,commandId:randomUUID()}),['42501']);
 await aplDeny(tx,checks,'HM cannot confirm APL',s=>aplCommand(s,confirm),['42501']);
 await aplActor(tx,f,'principal2');await aplDeny(tx,checks,'other-school rector cannot read',s=>aplRead(s,draft.planId),['42501']);
 await aplActor(tx,f,'principal');
 const confirmed=await aplCommand(tx,confirm);assert.equal(confirmed.detail.revision,confirm.expectedRevision+1);
 assert.equal(confirmed.detail.contentHash,saved.detail.contentHash);assert.equal(confirmed.detail.confirmations.length,1);
 assert.equal(confirmed.detail.confirmations[0].assignmentId,f.roles.principal);ok('actual rector event is immutable, identity-bound and content-bound; administrative revision leaves hash stable');
 await aplDeny(tx,checks,'another identity cannot retrieve original receipt',async s=>{await aplActor(s,f,'admin');await aplStatus(s,save);},['42501','40001']);
 await aplDeny(tx,checks,'foreign customer session scope denied',async s=>{await s`select set_config('app.customer_id',${randomUUID()},true)`;await aplStatus(s,save);},['42501']);
 for(const operation of [aplStatus,aplCommand])await aplDeny(tx,checks,'revoked actual mandate denies '+(operation===aplStatus?'status':'replay'),async s=>{
  await s`update public.access_assignments set ended_at=clock_timestamp() where id=${f.roles.principal}`;await operation(s,save);
 },['42501']);
 await aplDeny(tx,checks,'expired session cannot retrieve stored receipt',async s=>{
  await s`update public.app_sessions set expires_at=clock_timestamp()-interval '1 second' where id=${f.id(81)}`;await aplStatus(s,save);
 },['42501']);
 await aplDeny(tx,checks,'revoked session cannot replay stored command',async s=>{
  await s`update public.app_sessions set revoked_at=clock_timestamp() where id=${f.id(81)}`;await aplCommand(s,save);
 },['42501']);
 await aplDeny(tx,checks,'immutable rector event cannot be updated directly',s=>s`update public.apl_rector_confirmations set comment='Syntetisk otillåten ändring' where plan_id=${draft.planId}`,['42501']);
 await aplDeny(tx,checks,'immutable receipt cannot be deleted directly',s=>s`delete from public.apl_plan_commands where command_id=${save.commandId}`,['42501']);
 // Historical reads must keep the old 400h matrix after today's later row edit.
 const laterHours=[...draft.hours];laterHours[0]=401;
 await tx`select public.phase5_write_gym_timplan_row(${draft.planId},${confirmed.detail.revision},${draft.rowKey},${tx.json(laterHours)})`;
 const old=await aplStatus(tx,save);assert.deepEqual(old.envelope.basis,saved.envelope.basis);assert.deepEqual(old.envelope.result.result,replayResult);
 const today=await aplRead(tx,draft.planId);assert.notEqual(today.detail.contentHash,confirmed.detail.contentHash);
 assert.equal(today.detail.confirmations[0].contentHash,confirmed.detail.contentHash);ok('historical command basis survives changed totals; rector event becomes outdated without alteration');
 for(const total of [null,333]){const reduced=[...laterHours];reduced[0]=total;
  await aplDeny(tx,checks,'total '+total+' cannot erase or undercut allocated APL minutes',s=>s`select public.phase5_write_gym_timplan_row(${draft.planId},${today.detail.revision},${draft.rowKey},${s.json(reduced)})`,['22023','40001']);
 }
 const valid=aplSave(draft,today.detail.revision);
 for(const [name,mutate] of [
  ['foreign content row',v=>v.periods[0].contents[0].rowKey='programmeSpecific:ZZZZ:1:ZZZZ1000X'],
  ['allocation exceeds cell total',v=>v.periods[0].allocations[0].gutMinutes=30000],
  ['inactive term even zero',v=>{v.periods[0].allocations[0].termIndex=draft.plan.rows.find(r=>r.key===draft.rowKey).pointTerms.findIndex(n=>n===0);v.periods[0].allocations[0].gutMinutes=0;}],
  ['foreign period identity duplicates',v=>v.periods.push(clone(v.periods[0]))],
  ['unexpected client authority',v=>v.capabilities={canSave:true}],
  ['year zero is not a real date',v=>v.periods[0].startsOn='0000-01-01'],
  ['Unicode formatting control is rejected',v=>v.periods[0].name='APL\u200b'],
  ['Unicode boundary whitespace is rejected',v=>v.periods[0].name='APL\u00a0']
 ]){
  const value=clone(valid.plan);mutate(value);
  await aplDeny(tx,checks,name,s=>s`select public.phase5_apl_plan_command(${s.json({...valid,commandId:randomUUID(),plan:value})})`,['22023','23503','23505']);
 }
 await tx.unsafe(`create function pg_temp.fail_apl_audit() returns trigger language plpgsql as $$begin if new.customer_id='${f.id(1)}' and new.action like 'apl_%' then raise exception 'synthetic audit failure';end if;return new;end$$;
 create trigger fail_apl_audit before insert on public.security_events for each row execute function pg_temp.fail_apl_audit();`);
 await aplDeny(tx,checks,'mandatory audit failure rolls back plan rows revision and receipt',s=>aplCommand(s,{...valid,plan:{...valid.plan,classification:'unreviewed'}}),['55000']);
 await tx`drop trigger fail_apl_audit on public.security_events`;
 const unfinished=clone(valid.plan);Object.assign(unfinished.periods[0],{startsOn:null,endsOn:null,schoolYear:null,contents:[],allocations:[],extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''}});
 const incomplete=await aplCommand(tx,{...valid,commandId:randomUUID(),plan:unfinished});
 assert.equal(projectAplPlan(incomplete.context,incomplete.detail.plan).readyForConfirmation,false);ok('incomplete planning saves without inventing duration');
 await aplDeny(tx,checks,'incomplete plan cannot be confirmed',s=>aplCommand(s,{...confirm,commandId:randomUUID(),expectedRevision:incomplete.detail.revision,expectedContentHash:incomplete.detail.contentHash}),['22023','40001']);
 return{f,draft};
}
async function concurrency(snapshot,report) {
 const db=snapshot.db;let f,draft;
 await db.begin(async tx=>{await tx`set local statement_timeout='120s'`;f=await approvedClassFixture(tx,'BF25');await installAplCommands(tx,report);draft=await aplPreparedDraft(tx,f,'Syntetisk APL konkurrens');await tx`set constraints all immediate`;});
 const q=aplSave(draft),other={...q,commandId:randomUUID(),plan:{...q.plan,classification:'unreviewed'}};
 const raced=await aplRace(snapshot,report,f,'overlapping save/save','principal',t=>aplCommand(t,q),'admin',t=>aplCommand(t,other));
 assert.equal(raced.right.ok,false);assert.equal(raced.right.error.code,'40001');
 await db.begin(async t=>{await aplActor(t,f,'principal');const r=await aplRead(t,draft.planId);assert.equal(aplCanonicalSerialize(aplPlanCanonicalPayload(r.detail.plan)),aplCanonicalSerialize(aplPlanCanonicalPayload(q.plan)));
  assert.equal(r.detail.revision,q.expectedRevision+1);assert.equal((await aplStatus(t,other)).envelope.result.state,'not_found');});
 report.checks.push({name:'actual two-connection save/save observed lock overlap; loser CAS conflicts with no partial write',ok:true});
 const rowHours=[...draft.hours];rowHours[0]=500;
 const q2={...q,commandId:randomUUID(),expectedRevision:q.expectedRevision+1,plan:{...q.plan,classification:'unreviewed'}};
 const second=await aplRace(snapshot,report,f,'overlapping save/row','principal',t=>aplCommand(t,q2),'admin',
  t=>t`select public.phase5_write_gym_timplan_row(${draft.planId},${q2.expectedRevision},${draft.rowKey},${t.json(rowHours)})`);
 assert.equal(second.right.ok,false);assert.equal(second.right.error.code,'40001');
 await db.begin(async t=>{await aplActor(t,f,'principal');const r=await aplRead(t,draft.planId);assert.equal(aplCanonicalSerialize(aplPlanCanonicalPayload(r.detail.plan)),aplCanonicalSerialize(aplPlanCanonicalPayload(q2.plan)));
  assert.equal(r.detail.revision,q2.expectedRevision+1);assert.deepEqual(r.context.plan.hours[draft.rowKey],draft.hours);});
 report.checks.push({name:'actual two-connection save/row shares revision lock; loser preserves original row',ok:true});
 report.concurrencyComplete=true;
}
export async function verifyAplCommands(out) {
 const fd=openSync(out,'wx',0o600),report={kind:'apl-commands-private-schema-only',schemaVersion:1,status:'FAIL',runId:randomUUID(),checks:[],races:[],startedAt:new Date().toISOString(),
  limitations:['No active data copied or modified; only schema plus repository catalog and synthetic fixtures','Closed new RPC exercised as database owner with actual app session mandates; Worker grants not enabled','No HTTP/OIDC/browser or permanent installation proof']};
 const save=()=>{ftruncateSync(fd,0);writeSync(fd,JSON.stringify(report,null,2)+'\n',0,'utf8');fsyncSync(fd);};save();let snapshot;
 try{
  report.sources=aplSources();snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;save();
  const db=snapshot.db;report.before=await allPublicHashes(db);report.beforeSchema=await schemaFingerprint(db);
  try{await db.begin(async tx=>{await tx`set local lock_timeout='10s'`;await tx`set local statement_timeout='120s'`;await tx`set local transaction_timeout='240s'`;
   const f=await approvedClassFixture(tx,'BF25');await installAplCommands(tx,report);await aplCommandMatrix(tx,report,f);throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  report.after=await allPublicHashes(db);report.afterSchema=await schemaFingerprint(db);assert.deepEqual(report.after,report.before);assert.equal(report.afterSchema,report.beforeSchema);report.rollbackRestored=true;save();
  await concurrency(snapshot,report);
 }catch(error){report.failure={name:error.name,code:error.code,message:error.message,hint:error.hint,where:error.where,position:error.position,stack:error.stack};}
 finally{
  try{report.finalSources=aplSources();assert.deepEqual(report.finalSources,report.sources);}catch(error){report.sourceFailure={message:error.message};}
  try{if(snapshot)report.cleanup=await snapshot.cleanup();}catch(error){report.cleanupFailure={message:error.message};}
  if(!report.failure&&!report.sourceFailure&&!report.cleanupFailure&&report.rollbackRestored&&report.concurrencyComplete)report.status='PASS';
  report.completedAt=new Date().toISOString();save();closeSync(fd);
 }
 console.log(`${report.status}: ${report.checks.length} APL command checks; races=${report.races.length}; rollback=${report.rollbackRestored===true}; private report ${out}`);return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=privateOutput(process.argv.slice(2));if((await verifyAplCommands(out)).status!=='PASS')process.exitCode=1;
}
