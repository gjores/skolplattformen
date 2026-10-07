// Source-only 05-41 extension. setup/mutations may run only after actual 39/40 release.
// Synthetic source history is never evidence of a production decision workflow.
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {createPlanningListFixture} from './phase5-planning-year-list-fixtures.mjs';
import {parseGymTimplan,parseGymTimplanUnderlag,parseGymTimplanCreateReply,parseGymTimplanRowReply} from '../../web/lib/gym-timplan.ts';
import {parseProgramplan} from '../../web/lib/programplan-contract.ts';
import {parseProgramplanTermReply,parseProgramplanTermDistribution} from '../../web/lib/programplan-terms-contract.ts';
import {verifyProgramplanCatalog,resolveProgramplanBasis} from '../../web/lib/programplan-catalog.ts';
import {programplanTermRows,validateProgramplanTermDistribution} from '../../web/lib/programplan-terms.ts';

/** @typedef {{offeringId:string,sourcePlanId:string,planId:string,unitId:string,startedOn:string,query:string,rowKey:string,rowName:string,levelName:string,pointTerms:number[],hours:number[],revision:number,sourceRevision:number,educationName:string,schoolName:string}} GymYearRecord */
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const POINTS=[5,10,15,20,23,27],HOURS=[11,22,33,44,55,66];
const fail=code=>{throw Object.assign(Error(code),{code:'GY_YEAR_FIXTURE_FAILED'});};
const one=(rows,code)=>{if(rows.length!==1)fail(code);return rows[0];};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function createPlanningGymFixture(){
 const target=await assertTarget('protected'),base=await createPlanningListFixture();
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let metadata,started=false,closed=false,unknown=false;
 const records=/** @type {GymYearRecord[]} */ ([]);
 const owned=async tx=>one(await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
  where c.id=${base.customerId} and o.id=${base.organizerId} and c.name='Syntetiskt programplansprov'`,'gym_year_customer_ownership');
 const ownSource=async(tx,record)=>{await owned(tx);one(await tx`select p.id from public.point_plans p
  join public.offerings o on o.id=p.offering_id and o.organizer_id=p.organizer_id
  join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id
  join public.school_units u on u.id=ou.unit_id and u.organizer_id=o.organizer_id
  where p.id=${record.sourcePlanId} and p.offering_id=${record.offeringId} and p.organizer_id=${base.organizerId}
  and p.catalog_id=${base.catalogId} and u.id=${base.unitId}`,'gym_year_source_ownership');};
 const ownPlan=async(tx,record)=>{await ownSource(tx,record);one(await tx`select t.id from public.timplans t
  where t.id=${record.planId} and t.organizer_id=${base.organizerId} and t.offering_id=${record.offeringId}
  and t.unit_id=${base.unitId} and t.source_programplan_id=${record.sourcePlanId}
  and t.gym_basis->>'planId'=${record.sourcePlanId}`,'gym_year_plan_ownership');};
 const recordFor=id=>{const r=records.find(r=>r.planId===id||r.sourcePlanId===id);if(!r)fail('gym_year_record_not_owned');return r;};
 const request=async(...args)=>{await assertTarget('protected');await owned(db);
  // The reviewed 40 wrapper owns exact GET-urval transport; other routes keep POST.
  try{return await base.request(...args);}catch(error){unknown=true;throw error;}};
 const positive=async(session,route,input,action,id,type='timplan')=>{
  const reply=await request(metadata.baseURL,session,route,input);
  if(reply.status!==200||!await base.pairedGym(reply.correlationId,session,action,id,type))fail('gym_year_actual_response_audit');return reply;
 };
 const readGym=async(record,session=base.principal)=>{
  await ownPlan(db,record);const reply=await positive(session,'/api/timplaner/gym/lasa',{planId:record.planId},'gym_timplan_read',record.planId);
  const plan=parseGymTimplan(reply.body,record.planId);
  if(plan.offeringId!==record.offeringId||plan.unitId!==base.unitId||plan.source.planId!==record.sourcePlanId)fail('gym_year_actual_identity');return plan;
 };
 const prepare=async(index,startedOn)=>{
  const record={offeringId:metadata.pageOfferingIds[index],sourcePlanId:metadata.pagePlanIds[index],unitId:base.unitId,
   startedOn,query:`${metadata.pageQuery} ${String(index+1).padStart(2,'0')}`,planId:'',rowKey:'',rowName:'',levelName:'',
   pointTerms:[...POINTS],hours:[...HOURS],revision:0,sourceRevision:0,educationName:'',schoolName:''};
  await assertTarget('protected');await db.begin(async tx=>{
   await ownSource(tx,record);
   const saved=one(await tx`select basis_reference,term_distribution from public.point_plans where id=${record.sourcePlanId}`,'gym_year_saved_source');
   const catalogue=one(await tx`select payload from public.programplan_catalogs where catalog_id=${base.catalogId}`,'gym_year_catalog');
   const basis={...saved.basis_reference,startedOn},program=catalogue.payload.programs.find(p=>p.code===basis.programRef.code&&p.version===basis.programRef.version);
   if(!program)fail('gym_year_catalog_identity');
   const verified=await verifyProgramplanCatalog({...catalogue.payload,catalogId:base.catalogId});
   if(resolveProgramplanBasis(verified,basis).status!=='resolved')fail('gym_year_catalog_start_not_applicable');
   const rows=programplanTermRows(program,basis),row=rows.find(r=>r.key==='foundation:ENGE:1:ENGE1000X')??rows.find(r=>r.points===100&&!r.key.startsWith('block:')&&!r.key.startsWith('meta:'));
   if(!row)fail('gym_year_six_term_row_missing');
   const distribution=parseProgramplanTermDistribution(saved.term_distribution).map(d=>d.rowKey===row.key?{rowKey:d.rowKey,points:[...POINTS]}:d);
   if(!distribution.some(d=>d.rowKey===row.key))distribution.push({rowKey:row.key,points:[...POINTS]});
   validateProgramplanTermDistribution(rows,distribution);
   await tx`set local session_replication_role=replica`;
   await ownSource(tx,record);
   one(await tx`update public.point_plans set basis_reference=${tx.json(basis)},term_distribution=${tx.json(distribution)},revision=revision+1
    where id=${record.sourcePlanId} and offering_id=${record.offeringId} and organizer_id=${base.organizerId} returning id`,'gym_year_source_update');
   await ownSource(tx,record);
   one(await tx`update public.offerings set start_year=${Number(startedOn.slice(0,4))},lifecycle_revision=lifecycle_revision+1
    where id=${record.offeringId} and organizer_id=${base.organizerId} returning id`,'gym_year_education_update');
   Object.assign(record,{rowKey:row.key,rowName:row.name,levelName:row.levelName,pointTerms:[...POINTS]});
  });
  const sourceReply=await positive(base.principal,'/api/timplaner/gym/underlag',{sourcePlanId:record.sourcePlanId},'gym_timplan_basis_read',record.sourcePlanId,'programplan');
  const source=parseGymTimplanUnderlag(sourceReply.body,record.sourcePlanId);
  if(!source.readiness.ready||source.source.startedOn!==startedOn||source.source.offeringId!==record.offeringId)fail('gym_year_actual_source_not_ready');
  const command={commandId:randomUUID(),sourcePlanId:record.sourcePlanId,expectedSourceRevision:source.source.revision,
   expectedEducationRevision:source.source.educationRevision,unitId:base.unitId,predecessorPlanId:null,expectedPredecessorRevision:null};
  const created=await request(metadata.baseURL,base.principal,'/api/timplaner/gym/skapa',command);
  if(created.status!==200)fail('gym_year_actual_create');
  const receipt=parseGymTimplanCreateReply(created.body,command);record.planId=receipt.id;
  if(receipt.offeringId!==record.offeringId||receipt.version!==1||!await base.pairedGym(created.correlationId,base.principal,'gym_timplan_created',record.planId))fail('gym_year_create_identity_audit');
  records.push(record);
  const plan=await readGym(record);
  const row=plan.rows.find(r=>r.key===record.rowKey);
  if(!row||JSON.stringify(row.pointTerms)!==JSON.stringify(POINTS))fail('gym_year_actual_six_indices');
  const write={planId:plan.id,expectedRevision:plan.revision,rowKey:record.rowKey,hours:[...HOURS]};
  const reply=await positive(base.principal,'/api/timplaner/gym/rad',write,'gym_timplan_row_changed',plan.id);
  parseGymTimplanRowReply(reply.body,write);
  const fresh=await readGym(record);
  if(JSON.stringify(fresh.hours[record.rowKey])!==JSON.stringify(HOURS))fail('gym_year_actual_hours_readback');
  Object.assign(record,{revision:fresh.revision,sourceRevision:fresh.source.revision,hours:[...HOURS],educationName:fresh.source.education.name,schoolName:fresh.schoolName});
  const programReply=await positive(base.principal,'/api/programplaner/lasa',{planId:record.sourcePlanId},'programplan_read',record.sourcePlanId,'programplan');
  const parsed=parseProgramplan(programReply.body);if(parsed.basisReference?.startedOn!==startedOn)fail('gym_year_program_start_provenance');
  return record;
 };
 const fixture={...base,request,
  async setup(baseURL){if(started)fail('gym_year_setup_started');started=true;
   let initial;try{initial=await base.setup(baseURL);}catch(error){unknown=true;throw error;}
   // SA25/version4 applies from 2026-07-01; all three own cohorts use that pinned version.
   const planningYear=Math.max(initial.planningYear,2028);
   metadata={...initial,planningYear,baseURL,cohorts:/** @type {GymYearRecord[]} */ ([]),spring:/** @type {GymYearRecord[]} */ ([])};
   for(let index=0;index<3;index++)metadata.cohorts.push(await prepare(index,`${metadata.planningYear-2+index}-08-17`));
   Object.assign(fixture,metadata);return metadata;
  },
  async addSpringSources(){if(!metadata||metadata.spring.length)fail('gym_year_spring_state');
   for(const[index,date]of[[3,`${metadata.planningYear+1}-01-15`],[4,`${metadata.planningYear+1}-04-15`]])metadata.spring.push(await prepare(index,date));
   return metadata.spring;
  },
  async readGym(id,session=base.principal){return readGym(recordFor(id),session);},
  async readTerms(id,session=base.principal){const record=recordFor(id);await ownSource(db,record);
   const reply=await positive(session,'/api/programplaner/terminer/lasa',{planId:record.sourcePlanId},'programplan_terms_read',record.sourcePlanId,'programplan');
   const result=parseProgramplanTermReply(reply.body);if(result.planId!==record.sourcePlanId)fail('gym_year_terms_identity');return result;
  },
  async writeHours(id,hours){const record=recordFor(id),before=await readGym(record);
   const command={planId:before.id,expectedRevision:before.revision,rowKey:record.rowKey,hours};
   const reply=await positive(base.principal,'/api/timplaner/gym/rad',command,'gym_timplan_row_changed',before.id);
   parseGymTimplanRowReply(reply.body,command);return readGym(record);
  },
  async changeCurrentStart(id){const record=recordFor(id),next=`${metadata.planningYear+5}-08-17`;
   await assertTarget('protected');await db.begin(async tx=>{await ownPlan(tx,record);await tx`set local session_replication_role=replica`;
    one(await tx`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(${next}::text)),revision=revision+1
     where id=${record.sourcePlanId} and organizer_id=${base.organizerId} returning id`,'gym_year_current_source_update');
    await ownPlan(tx,record);one(await tx`update public.offerings set start_year=${metadata.planningYear+5},lifecycle_revision=lifecycle_revision+1
     where id=${record.offeringId} and organizer_id=${base.organizerId} returning id`,'gym_year_current_education_update');});
   const plan=await readGym(record);if(!plan.sourceChanged||plan.source.startedOn!==record.startedOn)fail('gym_year_frozen_source_changed_validation');return plan;
  },
  async archive(id){const record=recordFor(id);await assertTarget('protected');await db.begin(async tx=>{await ownPlan(tx,record);await tx`set local session_replication_role=replica`;
   one(await tx`update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1
    where id=${record.offeringId} and organizer_id=${base.organizerId} returning id`,'gym_year_archive_owned');});
   const plan=await readGym(record);if(!plan.archived||plan.canPlan)fail('gym_year_actual_archive_validation');return plan;
  },
  async ownedState(id){const record=recordFor(id);await assertTarget('protected');await ownPlan(db,record);
   const p=one(await db`select to_jsonb(p) value from public.point_plans p where id=${record.sourcePlanId}`,'gym_year_state_source');
   const t=await base.timplanSnapshot(record.planId),links=await base.classLinks();return {sourceHash:hash(p.value),planHash:hash(t),classLinksHash:hash(links)};
  },
  async cleanup(){if(closed)fail('gym_year_closed');if(unknown)throw Object.assign(Error('gym_year_completion_unknown'),{code:'OWNED_READ_UNDRAINED',cleanupDeferred:true});
   try{await assertTarget('protected');await owned(db);const evidence=await base.cleanup();
    const[remaining]=await db`select count(*)::integer plans from public.timplans where id=any(${records.map(r=>r.planId)}::uuid[])`;
    if(remaining.plans!==0)throw Object.assign(Error('gym_year_remaining'),{cleanupEvidence:{gymYearRemaining:remaining}});
    return {...evidence,gymYearRemaining:remaining};
   }finally{closed=true;await db.end({timeout:3});}
  },
 };
 return fixture;
}
