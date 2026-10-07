// Owned extension only; historical fixtures, reports and source guards remain unchanged.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {createPlanningYearFixture} from './phase5-planning-year-fixtures.mjs';
import {defaultProgramplanChoiceBlocks} from '../../web/lib/programplan-choice-blocks.ts';
import {programplanTermRows,programplanLevelRanks,suggestProgramplanTerms} from '../../web/lib/programplan-terms.ts';
import {equal} from './apply-planning-year-migration.mjs';
const require=createRequire(new URL('../../web/package.json',import.meta.url));
export const SEARCH_FIXTURE_QUERY='Syntetisk sökram';
export const SEARCH_LAST_CODE="LKS-%_O'Hara-052";
export function searchFixtureName(index){
 if(!Number.isInteger(index)||index<0||index>=52)throw Error('search_fixture_index_invalid');
 return `${SEARCH_FIXTURE_QUERY} ${String(index+1).padStart(2,'0')}`;
}
export function pinnedSearchDetails(offering,basis,catalog){
 const program=basis&&catalog?.programs?.find(p=>p.code===basis.programRef?.code&&p.version===basis.programRef?.version);
 const programMatches=program&&offering.program_code===program.code;
 const orientation=programMatches&&offering.orientation_code===basis.orientationCode
  ?program.orientations.find(o=>o.code===basis.orientationCode):null;
 return {localCode:offering.local_code??null,programCode:offering.program_code??null,orientationCode:offering.orientation_code??null,
  programName:programMatches?program.name:null,orientationName:orientation?.name??null};
}
export async function createPlanningSearchFixture(){
 const target=await assertTarget('protected'),base=await createPlanningYearFixture();
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let metadata,closed=false,injected=false;
 const suffix=base.customerId.slice(0,8),trigger=`p5_search_audit_${suffix}`,triggerFn=`p5_search_audit_fn_${suffix}`;
 const owned=async tx=>{
  const rows=await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
   where c.id=${base.customerId} and o.id=${base.organizerId} and c.name='Syntetiskt programplansprov'`;
  if(rows.length!==1)throw Error('search_fixture_ownership');
 };
 const change=async fn=>{await assertTarget('protected');await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;await fn(tx);});};
 const fixture={...base,
  async setup(baseURL){
   if(metadata)throw Error('search_fixture_already_seeded');
   const initial=await base.setup(baseURL);
   const [catalogRow]=await db`select payload from public.programplan_catalogs where catalog_id=${base.catalogId}`;
   const catalog=catalogRow?.payload;
   const programs=[['SA25',4,'SASAP',49],['EK25',4,'EKEKI',50]].map(([code,version,orientationCode,index])=>{
    const program=catalog?.programs?.find(p=>p.code===code&&p.version===version);
    if(!program?.orientations.some(o=>o.code===orientationCode))throw Error('search_fixture_pinned_program_missing');
    const basis={catalogId:base.catalogId,programRef:{code,version},orientationCode,
     startedOn:`${initial.planningYear+(index%3)-1}-08-17`,specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,orientationCode)};
    return {index,program,basis,distribution:suggestProgramplanTerms(programplanTermRows(program,basis),[],programplanLevelRanks(program))};
   });
   const missingOfferingId=randomUUID();
   await change(async tx=>{
    // SQL name sort uses cohort before UUID ties; deterministic distinct names
    // keep row52 genuinely beyond page1 while the common query still finds52.
    for(let n=0;n<52;n++)await tx`update public.offerings set name=${searchFixtureName(n)},
     local_code=${n===51?SEARCH_LAST_CODE:`LKS-${String(n+1).padStart(3,'0')}`}
     where id=${initial.pageOfferingIds[n]} and organizer_id=${base.organizerId}`;
    for(const variant of programs){
     const offeringId=initial.pageOfferingIds[variant.index],planId=initial.pagePlanIds[variant.index];
     await tx`update public.offerings set program_code=${variant.program.code},orientation_code=${variant.basis.orientationCode}
      where id=${offeringId} and organizer_id=${base.organizerId}`;
     await tx`update public.point_plans set specialization='{}',basis_reference=${tx.json(variant.basis)},term_distribution=${tx.json(variant.distribution)}
      where id=${planId} and organizer_id=${base.organizerId} and offering_id=${offeringId}`;
    }
    // All-unit count differs from the explicit school count; own IDs remain separate.
    await tx`insert into public.offering_units(offering_id,unit_id,organizer_id)
     values(${initial.pageOfferingIds[0]},${base.secondUnitId},${base.organizerId})`;
    await tx`update public.offerings set local_code=null,orientation_code=null
     where id=${initial.pageOfferingIds[46]} and organizer_id=${base.organizerId}`;
    await tx`update public.offerings set orientation_code=null where id=${initial.pageOfferingIds[47]} and organizer_id=${base.organizerId}`;
    await tx`update public.offerings set archived_at=clock_timestamp() where id=${initial.pageOfferingIds[48]} and organizer_id=${base.organizerId}`;
    await tx`update public.offerings set local_code='MISSING-BASIS-LEGACY' where id=${base.legacyOfferingId} and organizer_id=${base.organizerId}`;
    await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,local_code,program_code,orientation_code)
     values(${missingOfferingId},${base.organizerId},${base.unitId},'gymnasium','Syntetisk saknad sökram','Syntetisk kull',null,'SA25','SABEP')`;
    await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${missingOfferingId},${base.unitId},${base.organizerId})`;
    const foreign=await tx`select id from public.customers where id=${initial.foreignCustomerId} and name='Syntetisk främmande årsplaneringskund'`;
    if(foreign.length!==1)throw Error('search_fixture_foreign_ownership');
    await tx`update public.offerings set name=${SEARCH_FIXTURE_QUERY},local_code=${SEARCH_LAST_CODE}
     where id=${initial.foreignOfferingId} and organizer_id=(select id from public.organizers where customer_id=${initial.foreignCustomerId})`;
   });
   for(const variant of programs){
    const planId=initial.pagePlanIds[variant.index],r=await base.request(baseURL,base.hm,'/api/timplaner/gym/underlag',{sourcePlanId:planId});
    if(r.status!==200||!await base.pairedGym(r.correlationId,base.hm,'gym_timplan_basis_read',planId,'programplan'))throw Error('search_fixture_actual_variant_validation_failed');
   }
   metadata={...initial,pageQuery:SEARCH_FIXTURE_QUERY,pageSearchQuery:SEARCH_LAST_CODE,missingOfferingId,
    variantOfferingIds:programs.map(v=>initial.pageOfferingIds[v.index]),lastCode:SEARCH_LAST_CODE,
    programNames:programs.map(v=>v.program.name),orientationNames:programs.map(v=>v.program.orientations.find(o=>o.code===v.basis.orientationCode).name)};
   Object.assign(fixture,metadata);return metadata;
  },
  async metadataMatches(rows){
   await owned(db);if(!Array.isArray(rows))return false;
   for(const row of rows){
    const expectedCustomer=row.customerId===metadata?.foreignCustomerId?metadata.foreignCustomerId:base.customerId;
    const [o]=await db`select o.local_code,o.program_code,o.orientation_code from public.offerings o join public.organizers g on g.id=o.organizer_id
     where o.id=${row.offeringId} and g.customer_id=${expectedCustomer}`;
    if(!o)return false;
    let basis=null,catalog=null;
    if(row.schoolform==='gymnasium'&&row.plan){
     const [t]=await db`select gym_basis->'basisReference' basis from public.timplans where id=${row.plan.id} and offering_id=${row.offeringId}`;
     if(t)basis=t.basis;
     else {const[p]=await db`select basis_reference basis from public.point_plans where id=${row.plan.id} and offering_id=${row.offeringId}`;basis=p?.basis??null;}
     if(basis){const[c]=await db`select payload from public.programplan_catalogs where catalog_id=${basis.catalogId}`;catalog=c?.payload;}
    }
    if(!equal(row.searchDetails,pinnedSearchDetails(o,basis,catalog)))return false;
   }
   return true;
  },
  async auditBoundary(session){
   await owned(db);
   const[r]=await db`select coalesce(max(id),0)::text last_id from public.security_events where session_id=${session.id}`;
   return r.last_id;
  },
  async finishTimedRead(session,boundary,route){
   // Client abort does not cancel the Worker DB transaction. No next request or
   // fixture cleanup is safe until this sole owned read has committed its audit.
   const actions=route==='urval'?['planning_year_selection_read']:['planning_year_selection_read',route==='lista'?'planning_year_list_read':'planning_year_overview_read'];
   const customerId=session.customerId??base.customerId,deadline=Date.now()+180000;
   while(Date.now()<deadline){
    const rows=await db`select correlation_id,source,action,outcome,actor_identity_id,membership_id,assignment_id,session_id,customer_id,object_type,object_id
     from public.security_events where session_id=${session.id} and id>${boundary}::bigint order by id`;
    if(rows.length){
     const corr=new Set(rows.map(r=>r.correlation_id));
     const exact=rows.length===actions.length*2&&corr.size===1&&actions.every(action=>['db','worker'].every(source=>rows.filter(r=>r.action===action&&r.source===source&&r.outcome==='ok'
      &&r.actor_identity_id===session.identityId&&r.membership_id===session.membershipId&&r.assignment_id===session.assignmentId&&r.customer_id===customerId&&r.object_type==='planning_year_collection'&&r.object_id===null).length===1));
     if(!exact)throw Object.assign(Error('search_owned_read_drain_failed'),{code:'OWNED_READ_UNDRAINED'});
     const rollbackBarrier=Error('search_owned_barrier_rollback');
     await db.begin(async tx=>{
      await tx`set local lock_timeout='5s'`;
      const[s]=await tx`select id from public.app_sessions where id=${session.id} and identity_id=${session.identityId} and membership_id=${session.membershipId} and assignment_id=${session.assignmentId} for update`;
      if(!s)throw Error('search_owned_session_missing');
      throw rollbackBarrier;
     }).catch(error=>{if(error!==rollbackBarrier)throw error;});
     return {ownedDbTransactionFinished:true,sessionLockReleased:true,auditEvents:rows.length};
    }
    await new Promise(done=>setTimeout(done,200));
   }
   throw Object.assign(Error('search_owned_read_drain_failed'),{code:'OWNED_READ_UNDRAINED'});
  },
  async changeLocalCode(){if(!metadata)throw Error('search_fixture_not_seeded');await change(tx=>tx`update public.offerings set local_code=${SEARCH_LAST_CODE+'-ändrad'}
   where id=${metadata.pageOfferingIds[51]} and organizer_id=${base.organizerId}`);},
  async changeFrozenEducation(){if(!metadata)throw Error('search_fixture_not_seeded');await change(tx=>tx`update public.offerings set orientation_code='SASAP'
   where id=${metadata.shared.offeringId} and organizer_id=${base.organizerId}`);},
  async injectAuditFailure(source,action){
   if(injected||!['db','worker'].includes(source)||!['planning_year_selection_read','planning_year_list_read','planning_year_overview_read'].includes(action))throw Error('search_fixture_audit_injection_invalid');
   await assertTarget('protected');await owned(db);
   await db.begin(async tx=>{
    await owned(tx);await tx.unsafe(`create function public.${triggerFn}() returns trigger language plpgsql as $$begin
     if new.customer_id='${base.customerId}'::uuid and new.source='${source}' and new.action='${action}' and new.outcome='ok'
      then raise exception 'Synthetic SEARCH audit failure' using errcode='P0001';end if;return new;end $$;
     create trigger ${trigger} before insert on public.security_events for each row execute function public.${triggerFn}();`);
   });injected=true;
  },
  async clearAuditFailure(){
   if(injected){await assertTarget('protected');await owned(db);await db.begin(async tx=>{
    await owned(tx);await tx.unsafe(`drop trigger if exists ${trigger} on public.security_events;drop function if exists public.${triggerFn}();`);
   });injected=false;}
   await base.clearAuditFailure();
  },
  async cleanup(){
   if(closed)throw Error('search_fixture_already_closed');
   try{
    await fixture.clearAuditFailure();
    const[remaining]=await db`select (select count(*)::integer from pg_trigger where tgname=${trigger}) triggers,
     (select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname=${triggerFn}) functions`;
    if(remaining.triggers!==0||remaining.functions!==0)throw Error('search_fixture_audit_cleanup_remaining');
    return {...await base.cleanup(),searchAuditFixtures:{...remaining}};
   }finally{closed=true;await db.end({timeout:3});}
  },
 };
 return fixture;
}
