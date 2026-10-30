#!/usr/bin/env node
// Own ephemeral PostgreSQL, synthetic fixture only. Never accepts a live database URL.
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb} from './ephemeral-migrated-db.mjs';
import {createTjanstFixture,seedGrimNeeds,seedGy25Class} from './tjanst-fixtures.mjs';
import {parseElectiveRead,parseElectiveCommand,createElectiveCommandRef,parseElectiveReceipt,parseElectiveStatusReply} from '../../web/lib/elective-block-contract.ts';
const report={kind:'ephemeral-elective-block-sql',checks:[],sources:{},provenance:null};
const check=(name)=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const own=await createEphemeralMigratedDb();report.provenance=own.provenance;
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/elective-block-sql.json';
assert.ok(out?.startsWith('/private/tmp/'),'Only private output directory');
const cmd=(scope,revision,action,payload)=>parseElectiveCommand({...scope,commandId:randomUUID(),expectedRevision:revision,action,payload});
async function deny(tx,name,run,codes,hint){let e;try{await tx.savepoint(run);}catch(error){e=error;}assert.ok(e,name);assert.ok(codes.includes(e.code),`${name}: ${e.code} ${e.message}`);if(hint)assert.equal(e.hint,hint);check(name);}
try{
 let f,scope,baseSource,savedCommand,savedRef,blockId,optionId,groupId,initialCount;
 await own.db.begin(async tx=>{
  f=await createTjanstFixture(tx);const gr=await seedGrimNeeds(tx,f);
  // Synthetic preexisting approved GR source, using the same explicit fixture setup boundary as service tests.
  await tx`set local session_replication_role=replica`;
  await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${gr.grPlan},'sprakval',${[100,100,100]}::smallint[])`;
  await tx`set local session_replication_role=origin`;await f.actor(tx,'principalA');scope={unitId:f.schools.A,schoolYear:2026};
  const read=async()=>parseElectiveRead((await tx`select public.elective_block_read(${tx.json(scope)}) result`)[0].result.result,scope);
  initialCount=(await tx`select count(*)::integer n from public.pupil_class_memberships`)[0].n;
  const before=await read();assert.equal(before.policy.guardianConfirmation,null);assert.equal(before.blocks.length,0);assert.equal(typeof before.canReadPupils,'boolean');if(!before.canReadPupils)assert.equal(before.pupils,null);check('read is scoped, initially empty and explicit policy unset');
  baseSource=before.sources.find(s=>s.blockKind==='languageChoice');assert.ok(baseSource);assert.equal(baseSource.needHt,3000);assert.equal(baseSource.needVt,3000);assert.ok(baseSource.allowedOptionCodes.includes('GRGRMSP01'));check('GR language frame inherits existing even-split minutes');
  assert.ok(before.sources.every(s=>s.rowKey!=='matematik'&&s.rowKey!=='engelska'));check('ordinary fixed teaching rows never become choice frames');
  blockId=randomUUID();optionId=randomUUID();groupId=randomUUID();
  const block={id:blockId,kind:'languageChoice',name:'Syntetiskt språkval',startsOn:'2026-07-01',endsOn:'2027-06-30',sourceRefs:[baseSource],
   options:[{id:optionId,name:'Franska',subjectCode:'GRGRMSP01',levelCode:'GRGRMSP01',language:'fr',points:null}],
   groups:[{id:groupId,optionId,name:'Franska grupp 1',startsOn:'2026-07-01',endsOn:'2027-06-30',classIds:[baseSource.classId],sourceKeys:[baseSource.sourceKey],estimatedPupils:15}]};
  savedCommand=cmd(scope,before.revision,'save_block',{expectedBlockRevision:null,block});savedRef=await createElectiveCommandRef(savedCommand);
  const sent=(await tx`select public.elective_block_command(${tx.json(savedCommand)}) result`)[0].result;const receipt=parseElectiveReceipt(sent.result,savedRef);
  assert.equal(receipt.objectId,blockId);assert.equal(receipt.objectRevision,1);check('save creates real normalized block, option, group and exact references');
  const after=await read();assert.equal(after.blocks[0].groups[0].id,groupId);assert.deepEqual(after.blocks[0].sourceRefs,[baseSource]);assert.equal(after.revision,2);check('reload retains stable IDs and inherited sources');
  const replay=(await tx`select public.elective_block_command(${tx.json(savedCommand)}) result`)[0].result.result;assert.equal(parseElectiveReceipt(replay,savedRef).replayed,true);assert.equal((await read()).revision,2);check('same command replay does not duplicate records or bump revision');
  const status=(await tx`select public.elective_block_status(${tx.json(savedRef)}) result`)[0].result.result;assert.equal(parseElectiveStatusReply(status,savedRef).status,'found');check('minimal hash reference recovers exact committed command');
  await deny(tx,'status rejects wrong hash for existing command',sp=>sp`select public.elective_block_status(${tx.json({...savedRef,payloadHash:'a'.repeat(64)})})`,['40001'],'elective_command_conflict');
  await deny(tx,'same command ID cannot change payload',sp=>sp`select public.elective_block_command(${tx.json({...savedCommand,payload:{...savedCommand.payload,block:{...block,name:'Ändrat'}}})})`,['40001'],'elective_command_conflict');
  await deny(tx,'stale workspace revision cannot overwrite new state',sp=>sp`select public.elective_block_command(${tx.json(cmd(scope,1,'set_policy',{guardianConfirmation:false}))})`,['40001'],'elective_revision_conflict');
  const policy=cmd(scope,2,'set_policy',{guardianConfirmation:false});await tx`select public.elective_block_command(${tx.json(policy)})`;assert.equal((await read()).policy.guardianConfirmation,false);check('school explicitly switches guardian confirmation off');
  const wrongSource={...baseSource,needHt:3001};const invalid=cmd(scope,3,'save_block',{expectedBlockRevision:1,block:{...block,sourceRefs:[wrongSource]}});
  await deny(tx,'fabricated source time is rejected against authoritative reader',sp=>sp`select public.elective_block_command(${tx.json(invalid)})`,['40001'],'elective_stale_source');
  const invalidCode={...savedCommand,commandId:randomUUID(),expectedRevision:3,payload:{expectedBlockRevision:1,block:{...block,options:[{...block.options[0],levelCode:'NOT_A_CURRICULUM_CODE',language:null}]}}};
  await deny(tx,'SQL independently rejects an option outside frozen curriculum',sp=>sp`select public.elective_block_command(${tx.json(invalidCode)})`,['22023'],'elective_option_not_allowed');
  await deny(tx,'short group cannot inherit full year teaching time',sp=>sp`select public.elective_block_command(${tx.json({...savedCommand,commandId:randomUUID(),expectedRevision:3,payload:{expectedBlockRevision:1,block:{...block,groups:[{...block.groups[0],startsOn:'2026-08-01'}]}}})})`,['22023'],'elective_invalid');
  // Seed an already applied snapshot to verify draft editing cannot erase it.
  const appliedSnapshot={sourceRefs:[baseSource],groups:block.groups,options:block.options};
  await tx`update public.elective_blocks set applied=true,applied_revision=revision,applied_snapshot=${tx.json(appliedSnapshot)} where id=${blockId}`;
  const extra={...block.groups[0],id:randomUUID(),name:'Franska grupp 2'};
  const amendment=cmd(scope,3,'save_block',{expectedBlockRevision:1,block:{...block,groups:[block.groups[0],extra]}});
  await tx`select public.elective_block_command(${tx.json(amendment)})`;
  const edited=(await read()).blocks[0];assert.equal(edited.groups.length,2);assert.equal(edited.offeringRevision,1);assert.equal(edited.appliedRevision,1);assert.equal(edited.applied,true);
  assert.deepEqual((await tx`select applied_snapshot from public.elective_blocks where id=${blockId}`)[0].applied_snapshot,appliedSnapshot);
  check('adding a group preserves stable existing group, offering revision and applied snapshot');
  await f.actor(tx,'principalB');await deny(tx,'another school principal cannot read school A blocks',sp=>sp`select public.elective_block_read(${tx.json(scope)})`,['42501']);
  await f.actor(tx,'teacherGroup');await deny(tx,'teacher group mandate grants no block administration',sp=>sp`select public.elective_block_read(${tx.json(scope)})`,['42501']);
  await f.actor(tx,'hm');await deny(tx,'organizer does not receive new pupil/block school authority',sp=>sp`select public.elective_block_read(${tx.json(scope)})`,['42501']);
  await f.actor(tx,'principalA');
  assert.equal((await tx`select count(*)::integer n from public.pupil_class_memberships`)[0].n,initialCount);check('block organization leaves administrative pupil memberships unchanged');
  const tables=['elective_school_state','elective_blocks','elective_block_sources','elective_options','teaching_groups','teaching_group_sources','elective_commands'];
  for(const name of tables){const acl=(await tx`select relrowsecurity,relforcerowsecurity,has_table_privilege('skolplattform_worker',${'public.'+name},'select,insert,update,delete') access from pg_class where oid=${'public.'+name}::regclass`)[0];assert.equal(acl.access,false);assert.equal(acl.relrowsecurity,true);assert.equal(acl.relforcerowsecurity,true);}check('all new tables force RLS and deny Worker direct access');
  assert.equal((await tx`select has_function_privilege('skolplattform_worker','public.elective_sources(uuid,integer)','EXECUTE') p`)[0].p,false);check('raw source helper is not a Worker entrypoint');
  await tx`set local role skolplattform_worker`;
  const workerRead=(await tx`select public.elective_block_read(${tx.json(scope)}) result`)[0].result;parseElectiveRead(workerRead.result,scope);
  check('actual Worker role executes the narrow audited read entrypoint');
  await deny(tx,'actual Worker role cannot query block tables directly',sp=>sp`select * from public.elective_blocks`,['42501']);
  await tx`reset role`;
  await deny(tx,'committed command journal cannot be edited',sp=>sp`update public.elective_commands set payload_hash=${'b'.repeat(64)} where command_id=${savedCommand.commandId}`,['42501']);
 });
 await own.db.begin(async tx=>{
  const gy=await seedGy25Class(tx,f,'SYNELECTIVEGY');await f.actor(tx,'principalA');
  const activeBlock=gy.terms.find(x=>x.rowKey.startsWith('block:')&&x.points.some(p=>p>0));assert.ok(activeBlock);
  const offset=Math.floor(activeBlock.points.findIndex(p=>p>0)/2);
  if(offset>0){const revision=(await tx`select revision from public.timplans where id=${gy.planId}`)[0].revision;
   await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:gy.classId,schoolYear:gy.year+offset,planId:gy.planId,expectedPlanRevision:revision,columnId:'ar'+(offset+1),expectedLinkRevision:null,previousPlanId:null})})`;}
  const gyReadScope={unitId:f.schools.A,schoolYear:gy.year+offset};
  const data=parseElectiveRead((await tx`select public.elective_block_read(${tx.json(gyReadScope)}) result`)[0].result.result,gyReadScope);
  const sources=data.sources.filter(s=>s.classId===gy.classId);assert.ok(sources.length>0);
  for(const s of sources){assert.ok(s.rowKey.startsWith('block:'));assert.equal(s.schoolform,'gymnasium');assert.equal(s.needBasis,'terms');assert.equal(s.timeDetailRef,null);
   const i=2*(Number(s.column.slice(2))-1),time=gy.timeRows[s.rowKey];assert.ok(time);assert.equal(s.needHt,time.schoolMinutes[i]??0);assert.equal(s.needVt,time.schoolMinutes[i+1]??0);}
  check('GY V2 block sources inherit exact active-year cells and normalize only inactive terms');
  const ordinary=gy.rows.find(r=>!r.key.startsWith('block:')&&!r.key.startsWith('meta:'));assert.ok(ordinary);assert.ok(!sources.some(s=>s.rowKey===ordinary.key));
  check('frozen program choice-block metadata never converts fixed GY rows');
 });
 // Independent transactions serialize with a real school lock; one expected revision wins.
 const connection=own.connect(),revision=(await own.db`select revision from public.elective_school_state where unit_id=${scope.unitId}`)[0].revision;
 const a=cmd(scope,revision,'set_policy',{guardianConfirmation:true}),b=cmd(scope,revision,'set_policy',{guardianConfirmation:false});
 const run=(db,q)=>db.begin(async tx=>{await f.actor(tx,'principalA');return tx`select public.elective_block_command(${tx.json(q)})`;});
 const races=await Promise.allSettled([run(own.db,a),run(connection,b)]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.code==='40001').length,1);check('two simultaneous commands cannot both apply an old school revision');
 await own.db.begin(async tx=>{
  await f.actor(tx,'principalA');const rev=(await tx`select revision from public.elective_school_state where unit_id=${scope.unitId}`)[0].revision;
  await tx`create function public.elective_test_audit_fail() returns trigger language plpgsql as $$begin if new.action='elective_command' then raise exception 'synthetic audit failure';end if;return new;end$$`;
  await tx`create trigger elective_test_audit_fail before insert on public.security_events for each row execute function public.elective_test_audit_fail()`;
  await deny(tx,'audit failure rolls back policy and workspace revision',sp=>sp`select public.elective_block_command(${tx.json(cmd(scope,rev,'set_policy',{guardianConfirmation:true}))})`,['55000']);
  assert.equal((await tx`select revision from public.elective_school_state where unit_id=${scope.unitId}`)[0].revision,rev);
  await tx`drop trigger elective_test_audit_fail on public.security_events`;await tx`drop function public.elective_test_audit_fail()`;
 });
 for(const file of ['supabase/migrations/20261030110000_elective_blocks.sql','web/lib/elective-block-contract.ts','web/lib/server/elective-block.ts','work/pilot/verify-elective-block-sql.mjs'])report.sources[file]=createHash('sha256').update(readFileSync(new URL('../../'+file,import.meta.url))).digest('hex');
 report.ok=true;writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS`);
}catch(error){console.error('SQL verification failed:',error.code??'',error.message,error.where??error.stack?.split('\n').slice(1,4).join('\n')??'');process.exitCode=1;}finally{await own.end();}
