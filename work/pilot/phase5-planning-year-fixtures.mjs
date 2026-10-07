// Ägd syntetisk årsplaneringsfixtur. Inga ursprungsrader, audit eller identitetsankare städas.
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {createGymTimplanFixture,verifyGymTimplanBrowserTarget} from './phase5-gym-timplan-fixtures.mjs';
import {planningBusinessHashes} from './apply-planning-year-migration.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'web/package.json'));
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const PLANNING_FIXTURE_SOURCE_PATHS=['web/lib/planning-year-contract.ts','web/lib/planning-year-model.ts',
 'web/lib/server/planning-year.ts','web/lib/server/planning-year.test.mjs','web/app/api/planering',
 'web/lib/server/authz.ts','web/lib/server/http.ts','web/lib/server/mandate-route.ts','web/lib/server/db.ts',
 'web/lib/server/audit-details.ts','web/lib/programplan-catalog.ts','web/lib/programplan-catalog.generated.json',
 'supabase/migrations/20261006120000_phase5_planning_year_reads.sql'];
export const PLANNING_FIXTURE_TOOL_PATHS=[
 'work/pilot/phase5-planning-year-fixtures.mjs','work/pilot/verify-planning-year-api.mjs',
 'work/pilot/verify-planning-year-api.test.mjs'];

export async function verifyPlanningYearBrowserTarget(baseURL){
 const proof=await verifyGymTimplanBrowserTarget(baseURL);
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 if(git(['status','--porcelain','--',...PLANNING_FIXTURE_SOURCE_PATHS,...PLANNING_FIXTURE_TOOL_PATHS])
  ||git(['diff','--name-only',proof.buildRevision,'HEAD','--',...PLANNING_FIXTURE_SOURCE_PATHS]))throw Error('planning_build_sources_changed');
 return {...proof,protectedSources:[...proof.protectedSources,...PLANNING_FIXTURE_SOURCE_PATHS,...PLANNING_FIXTURE_TOOL_PATHS]};
}
function succeeded(reply,operation){
 if(reply.status!==200)throw Error(`planning_fixture_${operation}_HTTP_${reply.status}`);
 return reply.body;
}

export async function createPlanningYearFixture(){
 const target=await assertTarget('protected');
 const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 let base,closed=false,foreignCreated=false,metadata;
 let originalBusiness,originalAuditHash,originalIdentityHash,auditIds=[],identityIds=[];
 const auditHash=async()=>{
  const[r]=await db`select encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text,'sha256'),'hex') hash
   from public.security_events e where id=any(${auditIds}::bigint[])`;return r.hash;
 };
 const identityHash=async()=>sha((await db`select to_jsonb(i) row from public.identities i where id=any(${identityIds}::uuid[]) order by id`).map(r=>r.row));
 try{
  originalBusiness=await planningBusinessHashes(db);
  auditIds=(await db`select id::text from public.security_events order by id`).map(r=>r.id);
  identityIds=(await db`select id::text from public.identities order by id`).map(r=>r.id);
  originalAuditHash=await auditHash();originalIdentityHash=await identityHash();
  base=await createGymTimplanFixture();
  const prefix=base.customerId.slice(0,8),id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const foreignCustomerId=id(900),foreignOrganizerId=id(901),foreignUnitId=id(902),foreignOfferingId=id(903),
   foreignIdentityId=id(910),foreignMembershipId=id(920),foreignAssignmentId=id(960),foreignSessionId=id(980);
  const owned=async tx=>{
   const rows=await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
    where c.id=${base.customerId} and o.id=${base.organizerId} and c.name='Syntetiskt programplansprov'`;
   if(rows.length!==1)throw Error('planning_fixture_ownership');
  };
  const baselineEvidence=async()=>({originalBusiness,finalBusiness:await planningBusinessHashes(db),
   originalAuditHash,finalAuditHash:await auditHash(),originalIdentityHash,finalIdentityHash:await identityHash()});
  const cleanup=async()=>{
   if(closed)throw Error('planning_fixture_already_closed');
   let failure,evidence;
   try{
    await assertTarget('protected');
    // Även audit som skapats under provet är append-only. Bara hash och antal lämnar processen.
    const retainedAuditIds=(await db`select id::text from public.security_events order by id`).map(r=>r.id);
    const retainedIdentityIds=(await db`select distinct actor_identity_id::text id from public.security_events where actor_identity_id is not null order by id`).map(r=>r.id);
    const retainedAudit=async()=>{
     const[r]=await db`select count(*)::integer count,
      encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text,'sha256'),'hex') sha256
      from public.security_events e where id=any(${retainedAuditIds}::bigint[])`;return {...r};
    };
    const retainedAnchors=async()=>{
     const rows=await db`select to_jsonb(i) row from public.identities i where id=any(${retainedIdentityIds}::uuid[]) order by id`;
     return {count:rows.length,sha256:sha(rows.map(r=>r.row))};
    };
    const beforeRetainedAudit=await retainedAudit(),beforeRetainedAnchors=await retainedAnchors();
    if(foreignCreated)await db.begin(async tx=>{
     const rows=await tx`select c.id from public.customers c join public.organizers o on o.customer_id=c.id
      where c.id=${foreignCustomerId} and o.id=${foreignOrganizerId} and c.name='Syntetisk främmande årsplaneringskund'`;
     if(rows.length!==1)throw Error('planning_foreign_cleanup_ownership');
     // Bara denna fixturs affärsdata och session tas bort; refererade auditankare behålls.
     await tx`set local session_replication_role=replica`;
     await tx`delete from public.app_sessions where id=${foreignSessionId} and identity_id=${foreignIdentityId}`;
     await tx`delete from public.offering_units where organizer_id=${foreignOrganizerId}`;
     await tx`delete from public.offerings where id=${foreignOfferingId} and organizer_id=${foreignOrganizerId}`;
     const[retained]=await tx`select exists(select 1 from public.security_events where customer_id=${foreignCustomerId}) present`;
     if(!retained.present){
      await tx`delete from public.mandate_units where assignment_id=${foreignAssignmentId} and customer_id=${foreignCustomerId}`;
      await tx`delete from public.access_assignments where id=${foreignAssignmentId} and customer_id=${foreignCustomerId}`;
      await tx`delete from public.memberships where id=${foreignMembershipId} and customer_id=${foreignCustomerId}`;
      await tx`delete from public.school_unit_types where unit_id=${foreignUnitId}`;
      await tx`delete from public.school_units where id=${foreignUnitId} and organizer_id=${foreignOrganizerId}`;
      await tx`delete from public.organizers where id=${foreignOrganizerId} and customer_id=${foreignCustomerId}`;
      await tx`delete from public.customers where id=${foreignCustomerId} and name='Syntetisk främmande årsplaneringskund'`;
      await tx`delete from public.identities i where id=${foreignIdentityId} and issuer=${`https://${prefix}.foreign-planning.example.test`}`;
     }
    });
    const baseCleanup=await base.cleanup(),proof=await baselineEvidence();
    const afterRetainedAudit=await retainedAudit(),afterRetainedAnchors=await retainedAnchors();
    const originalBusinessUnchanged=equal(proof.originalBusiness,proof.finalBusiness),originalAuditPreserved=proof.originalAuditHash===proof.finalAuditHash,
     identityAnchorsPreserved=proof.originalIdentityHash===proof.finalIdentityHash;
    const[foreignRemaining]=await db`select (select count(*)::integer from public.offerings where organizer_id=${foreignOrganizerId}) offerings,
     (select count(*)::integer from public.offering_units where organizer_id=${foreignOrganizerId}) "offeringUnits",
     (select count(*)::integer from public.app_sessions where id=${foreignSessionId}) sessions`;
    const[foreignRetainedAuditAnchors]=await db`select
     (select count(*)::integer from public.security_events where customer_id=${foreignCustomerId}) events,
     (select count(*)::integer from public.security_events e join public.identities i on i.id=e.actor_identity_id
      join public.memberships m on m.id=e.membership_id and m.identity_id=i.id and m.customer_id=e.customer_id
      join public.access_assignments a on a.id=e.assignment_id and a.membership_id=m.id and a.customer_id=e.customer_id
      join public.customers c on c.id=e.customer_id join public.organizers o on o.id=a.organizer_id and o.customer_id=c.id
      where e.customer_id=${foreignCustomerId}) "anchoredEvents"`;
    const retainedAuditPreserved=equal(beforeRetainedAudit,afterRetainedAudit),retainedIdentityAnchorsPreserved=equal(beforeRetainedAnchors,afterRetainedAnchors);
    evidence={...baseCleanup,...proof,originalBusinessUnchanged,originalBusinessPreserved:originalBusinessUnchanged,
     originalAuditPreserved,identityAnchorsPreserved,retainedAuditPreserved,retainedIdentityAnchorsPreserved,
     beforeRetainedAudit,afterRetainedAudit,beforeRetainedAnchors,afterRetainedAnchors,foreignRemaining,foreignRetainedAuditAnchors,
     before:proof.originalBusiness,after:proof.finalBusiness};
    if(!originalBusinessUnchanged||!originalAuditPreserved||!identityAnchorsPreserved||!retainedAuditPreserved||!retainedIdentityAnchorsPreserved
     ||Object.values(foreignRemaining).some(n=>n!==0)||foreignRetainedAuditAnchors.events!==foreignRetainedAuditAnchors.anchoredEvents){
     const error=Error('planning_fixture_preservation_failed');
     // Separat diagnos är inte ett godkänt cleanup-bevis. Endast hash, antal och booleska utfall.
     error.cleanupEvidence={originalBusinessUnchanged,originalAuditPreserved,identityAnchorsPreserved,retainedAuditPreserved,
      retainedIdentityAnchorsPreserved,beforeRetainedAudit,afterRetainedAudit,beforeRetainedAnchors,afterRetainedAnchors,
      foreignRemaining,foreignRetainedAuditAnchors};
     throw error;
    }
   }catch(error){failure=error;}finally{closed=true;await db.end({timeout:3});}
   if(failure)throw failure;return evidence;
  };
  const fixture={...base,cleanup,originalBusiness,baselineEvidence,businessHashes:()=>planningBusinessHashes(db),
   foreignCustomerId,foreignUnitId,foreignOfferingId,imUnitId:base.unitId,
   async setup(baseURL){
    if(metadata)throw Error('planning_fixture_already_seeded');
    await assertTarget('protected');await owned(db);
    const ready=await base.createReadyProgramplan(baseURL,{twoSchools:true});
    const source=succeeded(await base.request(baseURL,base.hm,'/api/timplaner/gym/underlag',{sourcePlanId:ready.planId}),'source');
    const createInput=unitId=>({commandId:randomUUID(),sourcePlanId:ready.planId,expectedSourceRevision:source.source.revision,
     expectedEducationRevision:source.source.educationRevision,unitId,predecessorPlanId:null,expectedPredecessorRevision:null});
    const first=succeeded(await base.request(baseURL,base.principal,'/api/timplaner/gym/skapa',createInput(base.unitId)),'gym_first');
    const second=succeeded(await base.request(baseURL,base.principalB,'/api/timplaner/gym/skapa',createInput(base.secondUnitId)),'gym_second');
    const planningYear=Number(source.source.startedOn.slice(0,4));
    const foreignToken=randomBytes(32).toString('base64url'),foreignTokenHash=createHash('sha256').update(foreignToken).digest();
    const gr={unitId:base.nonGymUnitId,offeringId:id(700),oldPlanId:id(710),newPlanId:id(711),classIds:[id(720),id(721)],
     year8:planningYear,year9:planningYear+1,column8:'ak8',column9:'ak9'};
    const im={unitId:base.unitId,offeringId:id(701),planId:id(712),validOfferingId:id(702),validPlanId:id(713)};
    const pageOfferingIds=Array.from({length:52},(_,n)=>id(100+n)),pagePlanIds=Array.from({length:52},(_,n)=>id(300+n));
    await db.begin(async tx=>{
     await owned(tx);await tx`set local session_replication_role=replica`;
     // Historiska syntetiska programramar återbrukar den faktiskt skapade kanoniska ramen.
     for(let n=0;n<52;n++){
      const startYear=planningYear+(n%3)-1,name=`Syntetisk årsplaneringsram ${String(n+1).padStart(2,'0')}`;
      await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
       values(${pageOfferingIds[n]},${base.organizerId},${base.unitId},'gymnasium',${name},${`Syntetisk kull ${startYear}`},'SA25','SABEP',${startYear})`;
      await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${pageOfferingIds[n]},${base.unitId},${base.organizerId})`;
      await tx`insert into public.point_plans(id,organizer_id,offering_id,version,specialization,catalog_id,basis_reference,term_distribution,revision)
       select ${pagePlanIds[n]},organizer_id,${pageOfferingIds[n]},1,specialization,catalog_id,
        jsonb_set(basis_reference,'{startedOn}',to_jsonb(${`${startYear}-08-17`}::text)),term_distribution,revision
       from public.point_plans where id=${ready.planId} and organizer_id=${base.organizerId}`;
     }
     for(const [planId,hours]of[[first.id,10],[second.id,20]])await tx`update public.timplan_cells c set
      hours=array(select case when (d.value->'points'->>i)::integer>0 then ${hours} else 0 end::smallint from generate_series(0,5)i),
      allocated=array(select (d.value->'points'->>i)::integer>0 from generate_series(0,5)i)
      from public.timplans t cross join lateral jsonb_array_elements(t.gym_basis->'distribution') d(value)
      where c.timplan_id=t.id and t.id=${planId} and t.organizer_id=${base.organizerId} and d.value->>'rowKey'=c.row_id`;
     await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades) values
      (${gr.offeringId},${base.organizerId},${gr.unitId},'grundskola','Syntetisk årsplaneringsgrundskola','Ingen datumtolkning',array[7,8,9]::smallint[]),
      (${im.offeringId},${base.organizerId},${base.unitId},'introduktionsprogram','Syntetisk årsplaneringsintroduktion','Ingen datumtolkning',null),
      (${im.validOfferingId},${base.organizerId},${base.unitId},'introduktionsprogram','Syntetisk komplett introduktionsram','Ingen datumtolkning',null)`;
     await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values
      (${gr.offeringId},${gr.unitId},${base.organizerId}),(${im.offeringId},${base.unitId},${base.organizerId}),
      (${im.validOfferingId},${base.unitId},${base.organizerId})`;
     await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on) values
      (${gr.oldPlanId},${base.organizerId},${gr.offeringId},${gr.unitId},1,'faststalld','Syntetisk äldre bunden ram','2026-09-01'),
      (${gr.newPlanId},${base.organizerId},${gr.offeringId},${gr.unitId},2,'utkast','Syntetisk nyare obunden ram',null),
      (${im.planId},${base.organizerId},${im.offeringId},${base.unitId},1,'utkast','Syntetisk veckoram',null),
      (${im.validPlanId},${base.organizerId},${im.validOfferingId},${base.unitId},1,'utkast','Syntetisk komplett veckoram',null)`;
     await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values
      (${gr.oldPlanId},'engelska',array[111,222,333]::smallint[]),(${gr.oldPlanId},'okand_legacy',array[0,0,5]::smallint[]),
      (${gr.newPlanId},'engelska',array[444,555,666]::smallint[])`;
     for(const key of ['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor']){
      await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${im.planId},${key},${[key==='im-mentor'?null:2]}::smallint[])`;
      // Den äldre timplansläsningen kräver fullständiga numeriska celler. Dess positiva regressionsprov har en egen ram.
      await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${im.validPlanId},${key},array[2]::smallint[])`;
     }
     for(let n=0;n<2;n++)await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
      values(${gr.classIds[n]},${base.customerId},${base.organizerId},${gr.unitId},${gr.offeringId},${`SYNG${n+1}`},${planningYear-2})`;
     await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values
      (${gr.unitId},'SYNG1',${planningYear},${gr.oldPlanId},'ak8'),(${gr.unitId},'SYNG2',${planningYear},${gr.oldPlanId},'ak8'),
      (${gr.unitId},'SYNG1',${planningYear+1},${gr.oldPlanId},'ak9')`;
     await tx`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end)
      values(${base.organizerId},${base.unitId},${planningYear},${`${planningYear}-08-17`}::date,${`${planningYear}-12-20`}::date,
       ${`${planningYear+1}-01-10`}::date,${`${planningYear+1}-06-10`}::date)`;
     await tx`insert into public.customers(id,name) values(${foreignCustomerId},'Syntetisk främmande årsplaneringskund')`;
     await tx`insert into public.organizers(id,customer_id,name,type) values(${foreignOrganizerId},${foreignCustomerId},'Syntetisk främmande huvudman','Kommun')`;
     await tx`insert into public.school_units(id,organizer_id,code,name,municipality_code)
      values(${foreignUnitId},${foreignOrganizerId},${`${String(parseInt(prefix.slice(0,5),16)).padStart(6,'0').slice(-6)}90`},'Syntetisk främmande årsskola','0000')`;
     await tx`insert into public.school_unit_types(unit_id,school_type) values(${foreignUnitId},'GY')`;
     await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code)
      values(${foreignOfferingId},${foreignOrganizerId},${foreignUnitId},'gymnasium','Syntetisk främmande årsram','Syntetisk kull','SA25','SABEP')`;
     await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${foreignOfferingId},${foreignUnitId},${foreignOrganizerId})`;
     await tx`insert into public.identities(id,issuer,subject,display_name) values(${foreignIdentityId},
      ${`https://${prefix}.foreign-planning.example.test`},'synthetic-planning-hm','Syntetisk främmande provperson')`;
     await tx`insert into public.memberships(id,identity_id,customer_id) values(${foreignMembershipId},${foreignIdentityId},${foreignCustomerId})`;
     await tx`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind)
      values(${foreignAssignmentId},${foreignMembershipId},${foreignCustomerId},${foreignOrganizerId},'huvudman','synthetic-v1','school')`;
     await tx`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id)
      values(${foreignAssignmentId},${foreignCustomerId},${foreignOrganizerId},${foreignUnitId})`;
     await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,proof_issuer,
      proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
      values(${foreignSessionId},${foreignTokenHash},${foreignIdentityId},${foreignMembershipId},${foreignAssignmentId},'2',array['pwd','otp'],now(),
       ${target.idp.issuer},${target.idp.clientId},${[target.idp.clientId]},'local-keycloak-admin',1,now(),now()+interval '30 minutes',now()+interval '8 hours')`;
    });
    foreignCreated=true;
    const foreignHm={id:foreignSessionId,epoch:1,token:foreignToken,identityId:foreignIdentityId,membershipId:foreignMembershipId,
     assignmentId:foreignAssignmentId,customerId:foreignCustomerId};
    metadata={planningYear,shared:{offeringId:ready.offeringId,planId:ready.planId,firstTimplanId:first.id,secondTimplanId:second.id,
     basisStartedOn:source.source.startedOn,sourceRevision:source.source.revision,firstHours:10,secondHours:20},
     pageOfferingIds,pagePlanIds,pageQuery:'Syntetisk årsplaneringsram',pageSearchQuery:'Syntetisk årsplaneringsram 52',
     sharedQuery:'Syntetisk SA utan plan',gr,im,foreignCustomerId,foreignUnitId,foreignOfferingId,foreignHm};
    Object.assign(fixture,metadata);return metadata;
   },
   async pairedPlanning(correlationId,session,action){
    const all=await base.events(correlationId),actions=action==='planning_year_selection_read'?[action]:['planning_year_selection_read',action];
    return all.length===actions.length*2&&actions.every(a=>['db','worker'].every(source=>all.filter(e=>e.action===a&&e.source===source
     &&e.outcome==='ok'&&e.actor_identity_id===session.identityId&&e.membership_id===session.membershipId&&e.assignment_id===session.assignmentId
     &&e.session_id===session.id&&e.customer_id===(session.customerId??base.customerId)&&e.object_type==='planning_year_collection'&&e.object_id===null).length===1));
   },
   async changeListRevision(){
    if(!metadata)throw Error('planning_fixture_not_seeded');await assertTarget('protected');
    await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;
     await tx`update public.point_plans set revision=revision+1 where id=${metadata.pagePlanIds[0]} and organizer_id=${base.organizerId}`;});
   },
   async changeFrozenSource(){
    if(!metadata)throw Error('planning_fixture_not_seeded');await assertTarget('protected');
    await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;
     await tx`update public.point_plans set revision=revision+1,
      basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(${`${metadata.planningYear+1}-08-17`}::text))
      where id=${metadata.shared.planId} and organizer_id=${base.organizerId}`;});
   }
  };
  return fixture;
 }catch(error){if(base)await base.cleanup().catch(()=>{});await db.end({timeout:3});throw error;}
}
