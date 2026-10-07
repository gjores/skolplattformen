// Source-only prepared wrapper. Calling setup later requires the reviewed protected
// target and its actually applied performance/SEARCH predecessors. No legacy
// frame substitutes for the canonical six-term school plans created below.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {createPlanningSearchFixture} from './phase5-planning-year-search-fixtures.mjs';
import {planningSelection} from './verify-planning-year-api.mjs';
import {parsePlanningSetup,parsePlanningList} from '../../web/lib/planning-year-contract.ts';
import {parseGymTimplan,parseGymTimplanUnderlag,parseGymTimplanCreateReply} from '../../web/lib/gym-timplan.ts';
import {parseProgramplanWorkspace} from '../../web/lib/programplan-workspace-contract.ts';

const require=createRequire(new URL('../../web/package.json',import.meta.url));
const refuse=code=>{throw Object.assign(Error(code),{code:'LIST_FIXTURE_FAILED'});};
const exact=(result,count,code)=>{if(result.length!==count)refuse(code);};

export async function createPlanningListFixture(){
 const target=await assertTarget('protected'),base=await createPlanningSearchFixture();
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let metadata,started=false,closed=false,unknownCompletion=false;
 const classId=randomUUID(),className=`SYNGYL-${base.customerId.slice(0,8).toUpperCase()}`;
 const owned=async tx=>{
  exact(await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
   where c.id=${base.customerId} and o.id=${base.organizerId} and c.name='Syntetiskt programplansprov'`,1,'list_fixture_customer_ownership');
 };
 const ownSource=async(tx,planId,offeringId,unitId)=>{
  await owned(tx);
  exact(await tx`select p.id from public.point_plans p join public.offerings o on o.id=p.offering_id
   join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id
   join public.school_units u on u.id=ou.unit_id and u.organizer_id=o.organizer_id
   where p.id=${planId} and p.offering_id=${offeringId} and p.organizer_id=${base.organizerId}
   and o.organizer_id=${base.organizerId} and u.id=${unitId} and p.catalog_id=${base.catalogId}`,1,'list_fixture_source_ownership');
 };
 const ownPlan=async(tx,planId,offeringId,unitId,sourcePlanId)=>{
  await ownSource(tx,sourcePlanId,offeringId,unitId);
  exact(await tx`select t.id from public.timplans t where t.id=${planId} and t.organizer_id=${base.organizerId}
   and t.offering_id=${offeringId} and t.unit_id=${unitId} and t.source_programplan_id=${sourcePlanId}
   and t.gym_basis->>'planId'=${sourcePlanId} and jsonb_array_length(t.gym_basis->'rows')>0`,1,'list_fixture_plan_ownership');
 };
 const request=async(baseURL,session,route,body)=>{
  await assertTarget('protected');await owned(db);
  try{
   if(route==='/api/planering/urval'){
    if(body!==undefined)refuse('list_fixture_setup_body_forbidden');
    const response=await fetch(`${baseURL}${route}`,{method:'GET',headers:{Cookie:`sp_session=${session.token}`,
     'X-Context-Epoch':String(session.epoch),'Sec-Fetch-Site':'same-origin',Origin:baseURL},signal:AbortSignal.timeout(30000)});
    const correlationId=response.headers.get('x-correlation-id'),noStore=response.headers.get('cache-control')==='no-store';
    const reply={status:response.status,body:await response.json(),correlationId,noStore};
    if(!noStore||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(correlationId??''))refuse('list_fixture_setup_headers_failed');
    return reply;
   }
   return await base.request(baseURL,session,route,body);
  }catch(error){unknownCompletion=true;throw error;}
 };
 const actual=async(baseURL,session,route,body)=>{
  const reply=await request(baseURL,session,route,body);
  if(reply.status!==200)refuse('list_fixture_actual_response_failed');
  return reply;
 };
 const audit=async(reply,session,action,id,type='timplan')=>{
  if(!await base.pairedGym(reply.correlationId,session,action,id,type))refuse('list_fixture_actual_audit_failed');
 };
 const fixture={...base,request,
  async setup(baseURL){
   if(started)refuse('list_fixture_setup_already_started');started=true;
   let initial;
   try{initial=await base.setup(baseURL);}catch(error){unknownCompletion=true;throw error;}
   // Page44 has the selected year's first canonical year. Its point frame remains
   // an unchanged draft, preserving the SEARCH52 programme-list dataset.
   const offeringId=initial.pageOfferingIds[43],sourcePlanId=initial.pagePlanIds[43],unitId=base.unitId;
   await ownSource(db,sourcePlanId,offeringId,unitId);
   const sourceReply=await actual(baseURL,base.principal,'/api/timplaner/gym/underlag',{sourcePlanId});
   const source=parseGymTimplanUnderlag(sourceReply.body,sourcePlanId);
   await audit(sourceReply,base.principal,'gym_timplan_basis_read',sourcePlanId,'programplan');
   if(source.source.offeringId!==offeringId||!source.readiness.ready||Number(source.source.startedOn?.slice(0,4))!==initial.planningYear)refuse('list_fixture_canonical_source_not_ready');
   const command={commandId:randomUUID(),sourcePlanId,expectedSourceRevision:source.source.revision,
    expectedEducationRevision:source.source.educationRevision,unitId,predecessorPlanId:null,expectedPredecessorRevision:null};
   await ownSource(db,sourcePlanId,offeringId,unitId);
   const created=await actual(baseURL,base.principal,'/api/timplaner/gym/skapa',command);
   const older=parseGymTimplanCreateReply(created.body,command);
   if(older.offeringId!==offeringId||older.version!==1)refuse('list_fixture_old_plan_identity');
   await audit(created,base.principal,'gym_timplan_created',older.id);
   await assertTarget('protected');
   await db.begin(async tx=>{
    await ownPlan(tx,older.id,offeringId,unitId,sourcePlanId);
    await tx`set local session_replication_role=replica`;
    // Synthetic historical state only. No production decision flow is simulated.
    exact(await tx`update public.timplans set status='faststalld',decided_on='2026-09-10',revision=revision+1
     where id=${older.id} and organizer_id=${base.organizerId} and offering_id=${offeringId}
     and unit_id=${unitId} and status='utkast' and revision=${older.revision} returning id`,1,'list_fixture_old_plan_update');
    await ownPlan(tx,older.id,offeringId,unitId,sourcePlanId);
    exact(await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
     values(${classId},${base.customerId},${base.organizerId},${unitId},${offeringId},${className},${initial.planningYear}) returning id`,1,'list_fixture_owned_class_insert');
    await ownPlan(tx,older.id,offeringId,unitId,sourcePlanId);
    exact(await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
     values(${unitId},${className},${initial.planningYear},${older.id},'ar1') returning timplan_id`,1,'list_fixture_owned_binding_insert');
   });
   const oldRead=await actual(baseURL,base.principal,'/api/timplaner/gym/lasa',{planId:older.id});
   const oldPlan=parseGymTimplan(oldRead.body,older.id);await audit(oldRead,base.principal,'gym_timplan_read',older.id);
   if(oldPlan.status!=='faststalld'||oldPlan.version!==1||oldPlan.source.planId!==sourcePlanId)refuse('list_fixture_old_plan_actual_validation');
   const nextCommand={...command,commandId:randomUUID(),predecessorPlanId:oldPlan.id,expectedPredecessorRevision:oldPlan.revision};
   await ownPlan(db,oldPlan.id,offeringId,unitId,sourcePlanId);
   const nextReply=await actual(baseURL,base.principal,'/api/timplaner/gym/skapa',nextCommand);
   const newer=parseGymTimplanCreateReply(nextReply.body,nextCommand);
   if(newer.id===oldPlan.id||newer.offeringId!==offeringId||newer.version!==2)refuse('list_fixture_new_plan_identity');
   await audit(nextReply,base.principal,'gym_timplan_created',newer.id);
   const newRead=await actual(baseURL,base.principal,'/api/timplaner/gym/lasa',{planId:newer.id});
   const newPlan=parseGymTimplan(newRead.body,newer.id);await audit(newRead,base.principal,'gym_timplan_read',newer.id);
   if(newPlan.status!=='utkast'||newPlan.version!==2||newPlan.source.planId!==sourcePlanId)refuse('list_fixture_new_plan_actual_validation');
   const setupReply=await actual(baseURL,base.hm,'/api/planering/urval');
   const setup=parsePlanningSetup(setupReply.body);
   if(!await base.pairedPlanning(setupReply.correlationId,base.hm,'planning_year_selection_read'))refuse('list_fixture_setup_audit');
   const query=initial.pageQuery+' 44',selection=planningSelection(initial.planningYear,{view:'timplan',unitId,query,status:'all'});
   const listReply=await actual(baseURL,base.hm,'/api/planering/lista',selection);
   const bound=parsePlanningList(listReply.body,selection,setup);
   if(!await base.pairedPlanning(listReply.correlationId,base.hm,'planning_year_list_read')||!await base.metadataMatches(bound.rows))refuse('list_fixture_bound_audit_metadata');
   if(bound.rows.length!==1||bound.count!==1||bound.rows[0].plan?.id!==oldPlan.id||bound.rows[0].application?.planId!==oldPlan.id
    ||bound.rows[0].application?.version!==1||bound.rows[0].underlag!=='class-bound'||bound.rows[0].source?.planId!==sourcePlanId
    ||bound.rows[0].classes.length!==1||bound.rows[0].classes[0].id!==classId)refuse('list_fixture_bound_projection_failed');
   const missingOfferingId=initial.pageOfferingIds[51],missingPlanId=initial.pagePlanIds[51];
   await ownSource(db,missingPlanId,missingOfferingId,unitId);
   const missingSelection=planningSelection(initial.planningYear,{view:'timplan',unitId,query:initial.lastCode,status:'all'});
   const missingReply=await actual(baseURL,base.hm,'/api/planering/lista',missingSelection);
   const missing=parsePlanningList(missingReply.body,missingSelection,setup);
   if(!await base.pairedPlanning(missingReply.correlationId,base.hm,'planning_year_list_read')||!await base.metadataMatches(missing.rows))refuse('list_fixture_missing_audit_metadata');
   if(missing.count!==1||missing.rows[0].offeringId!==missingOfferingId||missing.rows[0].plan!==null||missing.rows[0].source!==null)refuse('list_fixture_missing_projection_failed');
   const workspaceInput={offeringId:missingOfferingId,versionPage:1,catalogId:null};
   const workspaceReply=await actual(baseURL,base.hm,'/api/programplaner/underlag',workspaceInput);
   const workspace=parseProgramplanWorkspace(workspaceReply.body,workspaceInput);
   if(!await base.paired(workspaceReply.correlationId,base.hm,'programplan_workspace_read',missingOfferingId,'education')
    ||!workspace.versions.some(version=>version.id===missingPlanId&&version.version===1))refuse('list_fixture_missing_explicit_version_failed');
   const ownRecords=await db`select t.id from public.timplans t where t.id=any(${[oldPlan.id,newPlan.id]}::uuid[])
    and t.organizer_id=${base.organizerId} and t.unit_id=${unitId} and t.offering_id=${offeringId}`;
   exact(ownRecords,2,'list_fixture_two_owned_versions');
   metadata={...initial,historyGym:{unitId,offeringId,sourcePlanId,oldPlanId:oldPlan.id,newPlanId:newPlan.id,classId,className,
     schoolYear:initial.planningYear,columnId:'ar1',query,oldVersion:1,newVersion:2,oldRevision:oldPlan.revision,newRevision:newPlan.revision},
    missingTimplan:{unitId,offeringId:missingOfferingId,programPlanId:missingPlanId,query:initial.lastCode,version:1}};
   Object.assign(fixture,metadata);return metadata;
  },
  async cleanup(){
   if(closed)refuse('list_fixture_already_closed');
   if(unknownCompletion)throw Object.assign(Error('list_fixture_completion_unknown'),{code:'OWNED_READ_UNDRAINED',cleanupDeferred:true});
   try{
    await assertTarget('protected');await owned(db);
    const evidence=await base.cleanup();
    const[remaining]=await db`select
     (select count(*)::integer from public.school_classes where id=${classId}) classes,
     (select count(*)::integer from public.class_timplans where unit_id=${base.unitId} and class_name=${className}) bindings,
     (select count(*)::integer from public.timplans where id=any(${metadata?[metadata.historyGym.oldPlanId,metadata.historyGym.newPlanId]:[]}::uuid[])) versions`;
    if(Object.values(remaining).some(value=>value!==0))throw Object.assign(Error('list_fixture_remaining'),{cleanupEvidence:{listRemaining:remaining}});
    return {...evidence,listRemaining:remaining};
   }finally{closed=true;await db.end({timeout:3});}
  },
 };
 return fixture;
}
