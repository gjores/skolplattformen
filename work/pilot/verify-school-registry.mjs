#!/usr/bin/env node
// Synthetic ADMIN-01 probes inside one rollback; never resets existing data.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {classFixture} from './verify-class-timplans.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {allPublicHashes,privateOutput} from './verify-atomic-cohort-copy.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('school_registry_rollback');
export const migrationName='20261014120000_phase5_school_registry.sql';
export const grantName='20261014121000_phase5_worker_school_registry.sql';
export const signatures=['public.phase5_school_registry_list()','public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean)'];
export const newFunctions=['phase5_school_registry_actor','phase5_school_registry_audit','phase5_school_registry_revision','phase5_school_registry_list','phase5_school_registry_save'];
export const sourcePaths=['supabase/migrations/'+migrationName,'supabase/migrations/'+grantName,'supabase/tests/phase5_school_registry.test.sql',
 'work/pilot/verify-school-registry.mjs','work/pilot/verify-class-timplans.mjs','work/pilot/verify-plan-decision-flow.mjs','supabase/tests/phase5_programplan_drafts.test.sql'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
export async function registryCommand(tx,request,data=null,payload=null,statusOnly=false){
 return(await tx`select public.phase5_school_registry_save(${tx.json(request)},${data===null?null:tx.json(data)},${payload===null?null:tx.json(payload)},${statusOnly}) result`)[0].result;
}
export async function assertFoundationPreserved(db,before){
 const after=await allPublicHashes(db);assert.equal(after.school_registry_receipts.count,0);delete after.school_registry_receipts;assert.deepEqual(after,before);
}
async function scenarios(tx,checks){
 const {id,actor}=await classFixture(tx);await actor('hm');
 const orgNumber='990'+String(parseInt(id(1).slice(0,7),16)).padStart(7,'0').slice(-7);
 await tx`update public.organizers set organization_number=${orgNumber} where id=${id(2)}`;
 const [{code}]=await tx`select code from public.school_units where id=${id(30)}`;
 const fingerprint='a'.repeat(64),data={code,name:'Syntetisk registeruppdatering',status:'AKTIV',municipalityCode:'0000',municipalityName:'Syntetisk kommun',
  locality:'Syntetisk ort',address:{street:'Syntetisk gata 1',postalCode:'00000',locality:'Syntetisk ort',type:'BESOKSADRESS'},
  organizationNumber:orgNumber,schoolTypes:['GY'],programmes:{GY:['SA','ES']},modified:null,registryFingerprint:fingerprint,fetchedAt:new Date().toISOString()};
 const payload={data:{synthetic:true}};
 const ok=name=>checks.push({name,ok:true});
 const deny=async(name,fn,codes)=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}assert.ok(error,name);assert.ok(codes.includes(error.code),`${name}: ${error.code}`);ok(name);};
 const list=async()=>(await tx`select public.phase5_school_registry_list() result`)[0].result;
 const rev=async unitId=>(await tx`select public.phase5_school_registry_revision(${unitId}) revision`)[0].revision;
 await tx`update public.school_units set pupil_register_source='Bevara elevregister',head_master='Historisk registerupplysning' where id=${id(30)}`;
 await tx`update public.school_unit_types set grades=array[1,2,3]::smallint[],programmes=array['OLD'] where unit_id=${id(30)} and school_type='GY'`;
 await tx`insert into public.school_unit_types(unit_id,school_type,grades,programmes) values(${id(30)},'GR',array[4,5]::smallint[],array['LOCAL'])`;
 const untouched=['assignments','assignment_units','access_assignments','mandate_units','staff_assignment_bindings','offerings','offering_units','point_plans','timplans','school_classes','class_timplans','pupils','pupil_placements'];
 const beforeProtected=await decisionBusinessHashes(tx,untouched);
 const beforeList=await list();assert.equal(beforeList.organizer.organizationNumber,orgNumber);assert.equal(beforeList.units.length,2);assert.ok(beforeList.units.every(u=>u.canUpdate));ok('list is live HM mandate scoped and derives actual organizer');
 assert.ok(beforeList.units.find(u=>u.id===id(30)).principalName);ok('live bound principal shown for mandated school');
 try{await tx.savepoint(async s=>{
  await s`update public.access_assignments set ended_at=clock_timestamp() where id=(select id from programplan_roles where name='principal')`;
  assert.equal((await s`select public.phase5_school_registry_list() result`)[0].result.units.find(u=>u.id===id(30)).principalName,null);ok('revoked principal hidden although legacy local staff links remain');
  const [{result:newPrincipal}]=await s`select public.phase3_grant_mandate(${s.json({membershipId:id(22),function:'rektor',scopeKind:'school',unitIds:[id(30)]})}) result`;
  const [staff]=await s`select p.name from public.assignments p join public.access_assignments a on a.staff_assignment_id=p.id where a.id=${newPrincipal}`;
  assert.equal((await s`select public.phase5_school_registry_list() result`)[0].result.units.find(u=>u.id===id(30)).principalName,staff.name);ok('replacement live principal shown without previous revoked principal');
  throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 const request={commandId:randomUUID(),code,operation:'update',expectedRevision:await rev(id(30)),registryFingerprint:fingerprint};
 const missing={...request,commandId:randomUUID()};
 assert.deepEqual(await registryCommand(tx,missing,null,null,true),{commandId:missing.commandId,status:'not_found'});ok('unknown status returns not_found without upstream or mutation');
 const saved=await registryCommand(tx,request,data,payload);assert.equal(saved.status,'saved');assert.equal(saved.unitId,id(30));assert.equal(saved.replayed,false);assert.notEqual(saved.revision,request.expectedRevision);ok('one school updated atomically with opaque revision receipt');
 const [unit]=await tx`select * from public.school_units where id=${id(30)}`;assert.equal(unit.name,data.name);assert.deepEqual(unit.address,data.address);assert.equal(unit.head_master,'Historisk registerupplysning');assert.equal(unit.pupil_register_source,'Bevara elevregister');ok('registered name address updated and local register source old head master preserved');
 const types=Array.from(await tx`select school_type,grades,programmes from public.school_unit_types where unit_id=${id(30)} order by school_type`);
 assert.deepEqual(types,[{school_type:'GR',grades:[4,5],programmes:['LOCAL']},{school_type:'GY',grades:[1,2,3],programmes:['SA','ES']}]);ok('present programmes updated local grades and absent school types preserved');
 assert.deepEqual(await decisionBusinessHashes(tx,untouched),beforeProtected);ok('all principals mandates plans classes pupil registers unchanged');
 const afterList=await list(),current=afterList.units.find(u=>u.id===id(30));assert.deepEqual(current.schoolTypes,['GR','GY']);assert.deepEqual(current.sourceSchoolTypes,['GY']);assert.equal(current.revision,saved.revision);assert.equal(current.principalName,beforeList.units.find(u=>u.id===id(30)).principalName);ok('current source types distinguished from preserved local school types and principal');
 const snapshot=(await tx`select payload from public.registry_snapshots where organizer_id=${id(2)} and unit_code=${code} order by fetched_at desc limit 1`)[0];assert.deepEqual(snapshot.payload,payload);ok('raw registry provenance snapshot stored');
 const business=['school_units','school_unit_types','registry_snapshots','school_registry_receipts',...untouched];
 const afterSave=await decisionBusinessHashes(tx,business);
 assert.deepEqual(await registryCommand(tx,request,null,null,true),{...saved,replayed:true});assert.deepEqual(await registryCommand(tx,request,null,null),{...saved,replayed:true});assert.deepEqual(await decisionBusinessHashes(tx,business),afterSave);ok('same request replay and status without network never repeat data writes');
 for(const change of [{registryFingerprint:'b'.repeat(64)},{expectedRevision:'0'.repeat(64)},{operation:'import',expectedRevision:null}])await deny('receipt mismatch denied',s=>registryCommand(s,{...request,...change},null,null,true),['40001']);
 await deny('stale local revision denied',s=>registryCommand(s,{...request,commandId:randomUUID()},data,payload),['40001']);
 const fresh={...request,commandId:randomUUID(),expectedRevision:saved.revision};
 await deny('upstream fingerprint mismatch denied',s=>registryCommand(s,fresh,{...data,registryFingerprint:'b'.repeat(64)},payload),['22023']);
 await deny('other organizer denied',s=>registryCommand(s,fresh,{...data,organizationNumber:'0000000000'},payload),['22023']);
 await deny('principal injection denied',s=>registryCommand(s,fresh,{...data,principalName:'Injected'},payload),['22023']);
 await deny('duplicate school type denied',s=>registryCommand(s,fresh,{...data,schoolTypes:['GY','GY']},payload),['22023']);
 await deny('grade injection denied',s=>registryCommand(s,fresh,{...data,grades:[9]},payload),['22023']);
 for(const [label,change]of [['old fetch',{fetchedAt:'2020-01-01T00:00:00Z'}],['future fetch',{fetchedAt:'2099-01-01T00:00:00Z'}],['infinite modification',{modified:'infinity'}],['malformed modification',{modified:'not-a-date'}]])await deny(label+' denied',s=>registryCommand(s,fresh,{...data,...change},payload),['22023']);
 await deny('extra command field denied',s=>registryCommand(s,{...fresh,organizerId:id(2)},data,payload),['22023']);
 assert.deepEqual(await decisionBusinessHashes(tx,business),afterSave);ok('all failed commands preserve complete school and linked data');
 for(const role of ['principal','admin']){await actor(role);await deny(role+' cannot list',s=>s`select public.phase5_school_registry_list()`,['42501']);await deny(role+' cannot save',s=>registryCommand(s,fresh,data,payload),['42501']);await deny(role+' cannot inspect receipt',s=>registryCommand(s,request,null,null,true),['42501']);}await actor('hm');
 for(const stage of ['snapshot','receipt','audit']){
  const relation=stage==='snapshot'?'registry_snapshots':stage==='receipt'?'school_registry_receipts':'security_events';
  const condition=stage==='audit'?`new.customer_id='${id(1)}' and new.action='school_registry_updated'`:`new.organizer_id='${id(2)}'`;
  await tx.unsafe(`create or replace function pg_temp.fail_registry() returns trigger language plpgsql as $$begin if ${condition} then raise exception 'synthetic_registry_failure' using errcode='55000';end if;return new;end$$;create trigger fail_registry before insert on public.${relation} for each row execute function pg_temp.fail_registry();`);
  const fullBefore=await allPublicHashes(tx);await deny(stage+' failure aborts complete update',s=>registryCommand(s,{...fresh,commandId:randomUUID()},{...data,name:'Must roll back'},payload),['55000']);assert.deepEqual(await allPublicHashes(tx),fullBefore);ok(stage+' failure preserves full rows including audit identities');await tx.unsafe(`drop trigger fail_registry on public.${relation}`);
 }
 const importCode='99009901',importRequest={commandId:randomUUID(),code:importCode,operation:'import',expectedRevision:null,registryFingerprint:fingerprint};
 const imported=await registryCommand(tx,importRequest,{...data,code:importCode},payload);assert.equal(imported.status,'saved');assert.equal(imported.operation,'import');assert.equal(imported.replayed,false);ok('new same organizer school imported');
 assert.deepEqual(await decisionBusinessHashes(tx,untouched),beforeProtected);assert.equal((await tx`select count(*)::integer n from public.mandate_units where unit_id=${imported.unitId}`)[0].n,0);ok('import assigns no principal or mandates and leaves pupil register plans intact');
 const own=(await list()).units.find(u=>u.id===imported.unitId);assert.equal(own.canUpdate,false);assert.equal(own.principalName,null);assert.deepEqual(own.schoolTypes,['GY']);ok('own imported school visible via receipt with canUpdate false');
 try{await tx.savepoint(async s=>{
  await s`insert into public.assignments(id,organizer_id,name,role) values(${id(170)},${id(2)},'Syntetisk dold rektor','rektor')`;
  await s`insert into public.assignment_units(assignment_id,unit_id) values(${id(170)},${imported.unitId})`;
  assert.equal((await s`select public.phase5_school_registry_list() result`)[0].result.units.find(u=>u.id===imported.unitId).principalName,null);
  ok('receipt-only school never exposes local principal staff name');throw rollback;
 });}catch(e){if(e!==rollback)throw e;}
 assert.deepEqual(await registryCommand(tx,importRequest,null,null,true),{...imported,replayed:true});ok('own import status remains readable without newly granting school mandate');
 await deny('new import cannot update without school mandate',s=>registryCommand(s,{...importRequest,commandId:randomUUID(),operation:'update',expectedRevision:imported.revision},{...data,code:importCode},payload),['42501']);
 await deny('new command cannot reimport existing school',s=>registryCommand(s,{...importRequest,commandId:randomUUID()},{...data,code:importCode},payload),['40001']);
 await tx`insert into public.school_units(id,organizer_id,code,name,municipality_code) values(${id(39)},${id(2)},'99009902','Hidden synthetic school','0000')`;
 assert.equal((await list()).units.some(u=>u.id===id(39)),false);ok('unmandated existing school is not enumerated');
 await deny('unmandated existing import does not leak conflict',s=>registryCommand(s,{...importRequest,commandId:randomUUID(),code:'99009902'},null,null,true),['42501']);
 // A different valid HM identity is not entitled to another actor's receipt.
 await tx`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(${id(61)},${id(21)},${id(1)},${id(2)},'huvudman','synthetic-v1','school')`;
 await tx`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${id(61)},${id(1)},${id(2)},${id(30)}),(${id(61)},${id(1)},${id(2)},${imported.unitId})`;
 await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values(${id(85)},${Buffer.from(createHash('sha256').update(randomUUID()).digest('hex'),'hex')},${id(11)},${id(21)},${id(61)},clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours')`;
 for(const[key,value]of Object.entries({identity_id:id(11),membership_id:id(21),assignment_id:id(61),session_id:id(85)}))await tx`select set_config(${`app.${key}`},${value},true)`;
 await deny('different valid HM identity cannot read update receipt',s=>registryCommand(s,request,null,null,true),['40001']);await deny('different valid HM identity cannot replay import',s=>registryCommand(s,importRequest,null,null),['40001']);await actor('hm');
 // A genuine second tenant, not just a forged role GUC.
 await tx`insert into public.customers(id,name) values(${id(101)},'Syntetisk annan registerkund')`;
 await tx`insert into public.organizers(id,customer_id,name,type) values(${id(102)},${id(101)},'Syntetisk annan huvudman','Kommun')`;
 await tx`insert into public.memberships(id,identity_id,customer_id) values(${id(121)},${id(11)},${id(101)})`;
 await tx`insert into public.school_units(id,organizer_id,code,name,municipality_code) values(${id(130)},${id(102)},'99009903','Annan kunds skola','0000')`;
 await tx`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(${id(160)},${id(121)},${id(101)},${id(102)},'huvudman','synthetic-v1','school')`;
 await tx`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${id(160)},${id(101)},${id(102)},${id(130)})`;
 await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at) values(${id(180)},${Buffer.from(createHash('sha256').update(randomUUID()).digest('hex'),'hex')},${id(11)},${id(121)},${id(160)},clock_timestamp()+interval '1 hour',clock_timestamp()+interval '8 hours')`;
 for(const[key,value]of Object.entries({customer_id:id(101),organizer_id:id(102),identity_id:id(11),membership_id:id(121),assignment_id:id(160),session_id:id(180)}))await tx`select set_config(${`app.${key}`},${value},true)`;
 assert.equal((await list()).units.length,1);ok('separate tenant list excludes all original tenant schools');
 await deny('different tenant cannot inspect import receipt',s=>registryCommand(s,importRequest,null,null,true),['40001']);await deny('different tenant cannot read update receipt',s=>registryCommand(s,request,null,null,true),['42501']);await actor('hm');
 await tx`delete from public.mandate_units where assignment_id=${id(60)} and unit_id=${id(30)}`;
 await deny('lost current unit mandate blocks saved update status',s=>registryCommand(s,request,null,null,true),['42501']);assert.equal((await list()).units.some(u=>u.id===id(30)),false);ok('lost school mandate removes list visibility despite old update receipt');
 for(const [label,mutation]of [
  ['revoked session',s=>s`update public.app_sessions set revoked_at=clock_timestamp() where id=${id(80)}`],
  ['ended assignment',s=>s`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`],
  ['inactive membership',s=>s`update public.memberships set status='blocked',blocked_at=clock_timestamp(),block_reason='Syntetiskt spärrprov' where id=${id(20)}`],
  ['closed customer',s=>s`update public.customers set closed_at=clock_timestamp() where id=${id(1)}`],
 ])await deny(label+' blocks import receipt',async s=>{await mutation(s);return registryCommand(s,importRequest,null,null,true);},['42501']);
 await tx`select set_config('app.app_role','huvudman',true)`;await actor('principal');await deny('forged role does not give HM authority',s=>registryCommand(s,importRequest,null,null,true),['42501']);await actor('hm');
}

export async function runSchoolRegistry(out){
 const sources=sourceHashes(),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const checks=[];let before,after,beforeFingerprint,afterFingerprint,failure;
 try{
  before=await allPublicHashes(db);beforeFingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${migrationName.slice(0,14)}`).length,0,'REFUSED: migration already applied');
   await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8'));
   await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_school_registry.test.sql'),'utf8'));
   await assertFoundationPreserved(tx,before);checks.push({name:'closed foundation preserves all existing rows audit identities',ok:true});
   await scenarios(tx,checks);assert.deepEqual(sourceHashes(),sources);throw rollback;
  });}catch(e){if(e!==rollback)failure=e;}
  after=await allPublicHashes(db);afterFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);assert.equal(afterFingerprint,beforeFingerprint);checks.push({name:'all public rows DDL ACL journal rolled back exactly',ok:true});
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const finalSourceHashes=sourceHashes();if(JSON.stringify(sources)!==JSON.stringify(finalSourceHashes))failure=Error('Source changed');
 const report={kind:'school-registry-rollback',target:'protected',status:failure?'FAIL':'PASS',rollback:true,databaseClosed:true,sourceHashes:sources,finalSourceHashes,
  beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,checks,failure:failure?{code:failure.code,message:failure.message,stack:failure.stack}:null};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(`${report.status}: ${checks.length} school registry SQL checks`);if(failure)process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await runSchoolRegistry(privateOutput(process.argv.slice(2)));
