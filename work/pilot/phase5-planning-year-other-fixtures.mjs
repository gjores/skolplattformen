// SOURCE-ONLY 05-42 extension of the frozen 41 fixture. No production decisions are modelled.
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {createPlanningGymFixture} from './phase5-planning-year-gym-fixtures.mjs';
import {planningSelection} from './verify-planning-year-api.mjs';
import {parsePlanningSetup,parsePlanningSelection,parsePlanningOverview} from '../../web/lib/planning-year-contract.ts';
import {parseProtectedTimplan,parseTimplanCellReply} from '../../web/lib/protected-timplan.ts';

/** @typedef {{offeringId:string,planId:string,currentPlanId:string,unitId:string,name:string,query:string,kind:'grundskola'|'introduktionsprogram',classIds:string[],classNames:string[],year8:number,year9:number|null,version:number}} OtherYearRecord */
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const IM_ROWS=['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor'];
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=code=>{throw Object.assign(Error(code),{code:'OTHER_YEAR_FIXTURE_FAILED'});};
const one=(rows,code)=>{if(rows.length!==1)fail(code);return rows[0];};
export async function createPlanningOtherFixture(){
 const target=await assertTarget('protected'),base=await createPlanningGymFixture();
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let metadata,started=false,closed=false,unknown=false;
 const records=/** @type {OtherYearRecord[]} */ ([]);
 const owned=async tx=>one(await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
  where c.id=${base.customerId} and o.id=${base.organizerId} and c.name='Syntetiskt programplansprov'`,'other_customer_ownership');
 const ownPlan=async(tx,record,planId=record.planId)=>{
  await owned(tx);one(await tx`select t.id from public.timplans t join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
   join public.school_units u on u.id=t.unit_id and u.organizer_id=t.organizer_id
   where t.id=${planId} and t.offering_id=${record.offeringId} and t.unit_id=${record.unitId}
   and t.organizer_id=${base.organizerId} and o.kind=${record.kind}`,'other_plan_ownership');
 };
 const recordFor=id=>{const r=records.find(r=>r.planId===id||r.currentPlanId===id);if(!r)fail('other_record_not_owned');return r;};
 const request=async(...args)=>{await assertTarget('protected');await owned(db);try{return await base.request(...args);}catch(error){unknown=true;throw error;}};
 const readOther=async(planId,session=base.principal)=>{
  const r=recordFor(planId);await ownPlan(db,r,planId);const reply=await request(metadata.baseURL,session,'/api/timplaner/lasa',{planId});
  if(reply.status!==200||!await base.pairedGym(reply.correlationId,session,'timplan_read',planId))fail('other_actual_read_audit');
  const plan=parseProtectedTimplan(reply.body,planId);
  if(plan.unitId!==r.unitId||plan.offeringId!==r.offeringId||plan.education.kind!==r.kind)fail('other_actual_read_scope');return plan;
 };
 const annual=async(record,schoolYear=metadata.otherYear,session=base.hm)=>{
  const input=parsePlanningSelection(planningSelection(schoolYear,{view:'timplan',schoolform:record.kind,unitId:record.unitId,
   query:record.query,status:'all',cohortRelation:'all',archive:'all'}),metadata.otherSetup);
  const reply=await request(metadata.baseURL,session,'/api/planering/oversikt',input);
  if(reply.status!==200||!await base.pairedPlanning(reply.correlationId,session,'planning_year_overview_read'))fail('other_actual_annual_audit');
  return parsePlanningOverview(reply.body,input,metadata.otherSetup);
 };
 const insert=async(tx,kind,index,unitId,year,extra=false)=>{
  await owned(tx);one(await tx`select id from public.school_units where id=${unitId} and organizer_id=${base.organizerId}`,'other_school_ownership');
  const name=`Syntetisk ${kind==='grundskola'?'GR':'IM'} årsram ${extra?'annan skola':String(index+1).padStart(2,'0')}`;
  const r=/** @type {OtherYearRecord} */ ({offeringId:randomUUID(),planId:randomUUID(),currentPlanId:'',unitId,name,query:name,kind,
   classIds:[],classNames:[],year8:year,year9:index===0&&!extra&&kind==='grundskola'?year+1:null,version:1});
  r.currentPlanId=index===0&&!extra&&kind==='grundskola'?randomUUID():r.planId;
  one(await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,local_code)
   values(${r.offeringId},${base.organizerId},${unitId},${kind},${name},'Ingen klassnamnsprogression',
   ${kind==='grundskola'?[7,8,9]:null}::smallint[],${`OTHER-${kind==='grundskola'?'GR':'IM'}-${String(index+1).padStart(3,'0')}`}) returning id`,'other_offering_insert');
  await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${r.offeringId},${unitId},${base.organizerId})`;
  const frozen=kind==='grundskola'&&index===0&&!extra;
  one(await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on)
   values(${r.planId},${base.organizerId},${r.offeringId},${unitId},1,${frozen?'faststalld':'utkast'},'Syntetiskt eget positionsunderlag',${frozen?'2026-09-01':null}::date) returning id`,'other_plan_insert');
  if(kind==='grundskola'){
   await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${r.planId},'matematik',array[111,222,333]::smallint[])`;
   for(let n=0;n<(index===0&&!extra?2:1);n++){
    const classId=randomUUID(),className=`OTHERGR${index+1}${extra?'B':'A'}${n+1}`;
    r.classIds.push(classId);r.classNames.push(className);
    one(await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
     values(${classId},${base.customerId},${base.organizerId},${unitId},${r.offeringId},${className},${year-5}) returning id`,'other_class_insert');
    await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(${unitId},${className},${year},${r.planId},'ak8')`;
   }
   if(r.year9!==null){
    await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
     values(${unitId},${r.classNames[0]},${r.year9},${r.planId},'ak9'),(${unitId},'OTHERLEGACYNOMATCH',${year},${r.planId},'ak8')`;
    one(await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis)
     values(${r.currentPlanId},${base.organizerId},${r.offeringId},${unitId},2,'utkast','Syntetisk uttrycklig aktuell matris') returning id`,'other_current_insert');
    await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${r.currentPlanId},'matematik',array[444,555,666]::smallint[])`;
   }
  }else for(const row of IM_ROWS)await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${r.planId},${row},array[2]::smallint[])`;
  records.push(r);return r;
 };
 const fixture={...base,request,
  async setup(baseURL){
   if(started)fail('other_setup_started');started=true;let initial;
   try{initial=await base.setup(baseURL);}catch(error){unknown=true;throw error;}
   const setupReply=await request(baseURL,base.hm,'/api/planering/urval');
   if(setupReply.status!==200||!await base.pairedPlanning(setupReply.correlationId,base.hm,'planning_year_selection_read'))fail('other_setup_actual_audit');
   const setup=parsePlanningSetup(setupReply.body),year=setup.currentYear;
   const grRecords=/** @type {OtherYearRecord[]} */ ([]),imRecords=/** @type {OtherYearRecord[]} */ ([]);
   const otherSchool=await db.begin(async tx=>{
    await owned(tx);await tx`set local session_replication_role=replica`;
    // This additional synthetic mandate is confined to the existing owned actor.
    one(await tx`select a.id from public.access_assignments a join public.memberships m on m.id=a.membership_id
     where a.id=${base.principal.assignmentId} and m.id=${base.principal.membershipId} and m.identity_id=${base.principal.identityId}
     and a.customer_id=${base.customerId} and a.organizer_id=${base.organizerId}`,'other_principal_ownership');
    await tx`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id)
     values(${base.principal.assignmentId},${base.customerId},${base.organizerId},${base.nonGymUnitId}) on conflict do nothing`;
    one(await tx`select id from public.school_units where id=${base.secondUnitId} and organizer_id=${base.organizerId}`,'other_second_school_ownership');
    await tx`insert into public.school_unit_types(unit_id,school_type) values(${base.secondUnitId},'GR') on conflict do nothing`;
    for(let n=0;n<52;n++){
     grRecords.push(await insert(tx,'grundskola',n,base.nonGymUnitId,year));
     imRecords.push(await insert(tx,'introduktionsprogram',n,base.unitId,year));
    }
    return insert(tx,'grundskola',0,base.secondUnitId,year,true);
   });
   const refreshed=await request(baseURL,base.hm,'/api/planering/urval');
   if(refreshed.status!==200||!await base.pairedPlanning(refreshed.correlationId,base.hm,'planning_year_selection_read'))fail('other_refreshed_setup_audit');
   metadata={...initial,baseURL,otherYear:year,otherSetup:parsePlanningSetup(refreshed.body),grRecords,imRecords,otherSchool,
    grQuery:'Syntetisk GR årsram',imQuery:'Syntetisk IM årsram',grLastCode:'OTHER-GR-052',imLastCode:'OTHER-IM-052'};
   Object.assign(fixture,metadata);
   const first=grRecords[0],view=await annual(first);
   const bound=view.rows.find(r=>r.offeringId===first.offeringId);
   if(view.count!==1||bound?.plan?.id!==first.planId||bound.application?.columnId!=='ak8'||bound.columnMap?.kind!=='unknown'
    ||bound.classes.length!==2||!bound.diagnostics.includes('missing-class'))fail('other_actual_bound_provenance');
   const older=await readOther(first.planId),current=await readOther(first.currentPlanId);
   if(older.status!=='faststalld'||older.version!==1||current.status!=='utkast'||current.version!==2)fail('other_actual_versions');
   const weekly=await readOther(imRecords[0].planId);
   if(IM_ROWS.some(row=>weekly.cells[row]?.[0]!==2)||Object.values(weekly.cells).reduce((n,h)=>n+h[0],0)!==14)fail('other_actual_weekly_fourteen');
   return metadata;
  },
  readOther,annual,
  async writeCell(planId,index,hours,session=base.principal){
   const before=await readOther(planId,session),r=recordFor(planId);await ownPlan(db,r,planId);
   const rowId=r.kind==='grundskola'?'matematik':'im-ma',command={planId,expectedRevision:before.revision,rowId,columnIndex:index,hours};
   const reply=await request(metadata.baseURL,session,'/api/timplaner/cell',command);
   if(reply.status!==200||!await base.pairedGym(reply.correlationId,session,'timplan_cell_changed',planId))fail('other_actual_write_audit');
   parseTimplanCellReply(reply.body,{...command,columnCount:r.kind==='grundskola'?3:1});return readOther(planId,session);
  },
  async reorderGrades(planId){
   const r=recordFor(planId);if(r.kind!=='grundskola')fail('other_grades_kind');
   await assertTarget('protected');await db.begin(async tx=>{await ownPlan(tx,r,planId);await tx`set local session_replication_role=replica`;
    one(await tx`update public.offerings set grades=array[8,7,9]::smallint[] where id=${r.offeringId} and organizer_id=${base.organizerId} returning id`,'other_grades_update');});
   return annual(r);
  },
  async ownedState(planId){
   const r=recordFor(planId);await assertTarget('protected');await ownPlan(db,r,planId);
   const plan=one(await db`select to_jsonb(t) value from public.timplans t where id=${planId} and organizer_id=${base.organizerId}`,'other_snapshot_plan');
   const cells=await db`select to_jsonb(c) value from public.timplan_cells c where timplan_id=${planId} order by row_id`;
   const links=await db`select to_jsonb(l) value from public.class_timplans l where timplan_id in(${r.planId},${r.currentPlanId}) and unit_id=${r.unitId} order by start_year,class_name`;
   return {planHash:sha(plan.value),cellsHash:sha(cells.map(c=>c.value)),classLinksHash:sha(links.map(l=>l.value)),cells:Object.fromEntries(cells.map(c=>[c.value.row_id,c.value.hours]))};
  },
  async cleanup(){
   if(closed)fail('other_closed');if(unknown)throw Object.assign(Error('other_completion_unknown'),{code:'OWNED_READ_UNDRAINED',cleanupDeferred:true});
   try{await assertTarget('protected');await owned(db);const evidence=await base.cleanup();
    const [remaining]=await db`select (select count(*)::integer from public.timplans where id=any(${records.flatMap(r=>[r.planId,r.currentPlanId])}::uuid[])) plans,
     (select count(*)::integer from public.offerings where id=any(${records.map(r=>r.offeringId)}::uuid[])) offerings,
     (select count(*)::integer from public.school_classes where id=any(${records.flatMap(r=>r.classIds)}::uuid[])) classes`;
    if(Object.values(remaining).some(n=>n!==0))throw Object.assign(Error('other_remaining'),{cleanupEvidence:{otherYearRemaining:remaining}});
    return {...evidence,otherYearRemaining:remaining};
   }finally{closed=true;await db.end({timeout:3});}
  },
 };
 return fixture;
}
