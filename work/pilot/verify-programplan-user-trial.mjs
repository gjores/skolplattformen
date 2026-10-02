// Read-only Worker verification of persistent trial rows and existing mandates.
// Temporary synthetic sessions are removed; append-only audit is preserved.
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { requireTrialSchool, trialEducationSpecs } from './prepare-programplan-user-trial.mjs';
import { parseProgramplanOfferingList, parseProgramplanWorkspace } from '../../web/lib/programplan-workspace-contract.ts';
import { parseProgramplan } from '../../web/lib/programplan-contract.ts';

// This verifier describes the initial prepared trial, before human edits.
// Later reruns of the preparer preserve edits; they are not reset to this shape.
export function verifyInitialTrialPlan(workspace,spec,catalogId) {
  const id=n=>`55100110-0000-4000-8000-${String(n).padStart(12,'0')}`;
  if(spec.plan===null){
    if(workspace.versions.length||workspace.versionCount!==0||workspace.education.latestVersion!==0||workspace.education.draftId!==null)
      throw new Error('REFUSED: exempel för första utkastet avviker');
    return null;
  }
  const expectedId=id(spec.plan),p=workspace.versions.find(v=>v.id===expectedId),bound=spec.plan===51,locked=spec.plan===52;
  if(workspace.versionCount!==1||workspace.versions.length!==1||workspace.education.latestVersion!==1||!p
    ||p.version!==1||p.revision!==0||p.status!==(locked?'faststalld':'utkast')||p.decidedOn!==(locked?'2026-09-01':null)
    ||workspace.education.draftId!==(locked?null:expectedId)||p.catalogId!==(bound?catalogId:null))
    throw new Error('REFUSED: initial provversion saknas eller avviker');
  if(bound){
    const b=p.basisReference;
    if(!b||b.catalogId!==catalogId||b.startedOn!=='2026-08-17'||b.programRef.code!=='SA25'||b.programRef.version!==4||b.orientationCode!=='SASAP'
      ||b.specializationRefs.length!==1||b.specializationRefs[0].subjectCode!=='ANIM'||b.specializationRefs[0].subjectVersion!==1
      ||b.specializationRefs[0].itemCode!=='ANIM1000X'||b.specializationRefs[0].points!==100||p.legacySpecialization!==null)
      throw new Error('REFUSED: bunden provgrund avviker');
  }else if(p.basisReference!==null||JSON.stringify(p.legacySpecialization)!==JSON.stringify(['ANIM1000X']))
    throw new Error('REFUSED: äldre ordnade provval avviker');
  return p;
}

// Current-state mode accepts saved human changes while requiring exact metadata.
export function selectCurrentTrialPlan(workspace, versions) {
  const {latestVersion,draftId}=workspace.education;
  if(latestVersion===0){
    if(workspace.versionCount!==0||versions.length||draftId!==null)throw Error('REFUSED: aktuellt provurval avviker');
    return null;
  }
  if(versions.length!==workspace.versionCount||new Set(versions.map(p=>p.id)).size!==versions.length
    ||Math.max(...versions.map(p=>p.version))!==latestVersion)
    throw Error('REFUSED: ofullständig aktuell versionslista');
  const current=draftId?versions.find(p=>p.id===draftId):versions.find(p=>p.version===latestVersion);
  if(!current||(draftId&&current.status!=='utkast'))throw Error('REFUSED: aktuell provversion saknas');
  return current;
}

export async function verifyProgramplanUserTrial(baseURL='http://127.0.0.1:3012', {mode='initial'}={}) {
  if(!['initial','current'].includes(mode))throw Error('REFUSED: okänt provläge');
  if(baseURL!=='http://127.0.0.1:3012')throw new Error('REFUSED: avsedd lokal användarprovserver krävs');
  const manifest=await assertTarget('protected');
  const health=await fetch(`${baseURL}/api/health/db`,{signal:AbortSignal.timeout(10000)});
  const healthBody=await health.json();
  if(!health.ok||healthBody.role!=='skolplattform_worker'||healthBody.runtime!=='workerd')throw new Error('REFUSED: byggd Worker saknas');
  const require=createRequire(new URL('../../web/package.json',import.meta.url));
  const db=require('postgres')(manifest.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
  const customer='33000000-0000-4000-8000-000000000001',unit='33000000-0000-4000-8000-000000000111';
  const id=n=>`55100110-0000-4000-8000-${String(n).padStart(12,'0')}`;
  const catalogId='sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace';
  const sessions=[];
  let checked=0;
  const scenarios=[];
  const snapshot=async()=>{
    const rows=await db`select 'education' as kind,o.id,to_jsonb(o) as data from public.offerings o
      where o.id=any(${trialEducationSpecs.map(s=>id(s.number))}::uuid[])
      union all select 'plan',p.id,to_jsonb(p) from public.point_plans p
      where p.offering_id=any(${trialEducationSpecs.map(s=>id(s.number))}::uuid[]) order by kind,id`;
    return JSON.stringify(rows);
  };
  let before;

  try {
    const [school]=await db`select s.id as unit_id,s.organizer_id,s.name as school_name,c.id as customer_id,c.name as customer_name
      from public.school_units s join public.organizers o on o.id=s.organizer_id join public.customers c on c.id=o.customer_id where s.id=${unit}`;
    const organizer=requireTrialSchool(school);
    before=await snapshot();
    for(const role of ['rektor','huvudman']){
      const [actor]=await db`select a.id,a.membership_id,m.identity_id from public.access_assignments a
        join public.memberships m on m.id=a.membership_id join public.mandate_units u on u.assignment_id=a.id
        where a.customer_id=${customer} and a.organizer_id=${organizer} and a.function=${role} and a.ended_at is null
          and m.status='active' and u.unit_id=${unit} and public.phase3_mandate_is_valid(a.id) order by a.id limit 1`;
      if(!actor)throw new Error('REFUSED: avsett befintligt mandat saknas');
      const token=randomBytes(32).toString('base64url'),hash=createHash('sha256').update(token).digest();
      const [session]=await db`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,acr,amr,auth_time,
        proof_issuer,proof_client_id,proof_audience,proof_profile_id,proof_profile_version,proof_checked_at,expires_at,absolute_expires_at)
        values(${hash},${actor.identity_id},${actor.membership_id},${actor.id},'1',array['pwd'],now(),
          ${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),
          now()+interval '5 minutes',now()+interval '5 minutes') returning id,context_epoch`;
      sessions.push({id:session.id,identity:actor.identity_id});
      const request=async(route,body,action,objectType,objectId)=>{
        const response=await fetch(`${baseURL}/api/programplaner/${route}`,{method:'POST',headers:{'Content-Type':'application/json',
          Cookie:`sp_session=${token}`,'X-Context-Epoch':String(session.context_epoch),Origin:baseURL,'Sec-Fetch-Site':'same-origin'},
          body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
        if(response.status!==200)throw new Error('REFUSED: användarprovsunderlag är inte läsbart');
        const result=await response.json(),correlation=response.headers.get('x-correlation-id');
        const events=await db`select source from public.security_events where correlation_id=${correlation} and session_id=${session.id}
          and actor_identity_id=${actor.identity_id} and membership_id=${actor.membership_id} and assignment_id=${actor.id}
          and customer_id=${customer} and action=${action} and outcome='ok' and object_type=${objectType}
          and object_id is not distinct from ${objectId}::uuid`;
        if(events.length!==2||!events.some(e=>e.source==='db')||!events.some(e=>e.source==='worker'))throw new Error('REFUSED: obligatoriskt auditpar saknas');
        checked++;
        return result;
      };
      const found=new Map();
      for(let page=1;page<=100000;page++){
        const list=parseProgramplanOfferingList(await request('lista',{page},'programplan_offerings_listed','education_collection',null),page);
        for(const row of list.offerings)found.set(row.id,row);
        if(page*list.pageSize>=list.count)break;
      }
      for(const spec of trialEducationSpecs){
        const education=found.get(id(spec.number));
        if(!education||education.name!==spec.name||education.unitId!==unit)throw new Error('REFUSED: synligt provurval avviker');
        const input={offeringId:id(spec.number),versionPage:1,catalogId};
        const read=parseProgramplanWorkspace(await request('underlag',input,'programplan_workspace_read','education',input.offeringId),input);
        if(read.catalog.status!=='selected'||read.catalog.program?.code!==spec.program||read.catalog.program?.version!==spec.version
          ||read.education.orientationCode!==spec.orientation||read.decisionReady!==false)throw new Error('REFUSED: provets verifierade katalogprojektion avviker');
        let initial;
        if(mode==='initial')initial=verifyInitialTrialPlan(read,spec,catalogId);
        else {
          const versions=[...read.versions];
          for(let page=2;(page-1)*read.pageSize<read.versionCount;page++){
            const nextInput={...input,versionPage:page};
            const next=parseProgramplanWorkspace(await request('underlag',nextInput,'programplan_workspace_read','education',input.offeringId),nextInput);
            if(JSON.stringify(next.education)!==JSON.stringify(read.education)||next.versionCount!==read.versionCount)
              throw Error('REFUSED: provunderlag ändrades under läsning');
            versions.push(...next.versions);
          }
          initial=selectCurrentTrialPlan(read,versions);
          scenarios.push({role,scenario:spec.number,versionCount:read.versionCount,
            currentStatus:initial?.status??'no_plan',currentVersion:initial?.version??null,
            revision:initial?.revision??null,bound:!!initial?.basisReference,
            savedChoices:initial?.basisReference?.specializationRefs.length??initial?.legacySpecialization?.length??0});
        }
        if(initial){
          const plan=parseProgramplan(await request('lasa',{planId:initial.id},'programplan_read','programplan',initial.id));
          if(plan.id!==initial.id||plan.offeringId!==input.offeringId||plan.version!==initial.version||plan.revision!==initial.revision
            ||plan.status!==initial.status||plan.decidedOn!==initial.decidedOn||JSON.stringify(plan.basisReference)!==JSON.stringify(initial.basisReference))
            throw new Error('REFUSED: läst provplan avviker från underlaget');
        }
      }
    }
    if(await snapshot()!==before)throw Error('REFUSED: användarprovsdata ändrades under provet');
    return {status:'PASS',target:'protected',mode,roles:2,educationsPerRole:trialEducationSpecs.length,programs:[...new Set(trialEducationSpecs.map(s=>s.program))],auditedReads:checked,
      businessRowsPreserved:true,...(mode==='current'?{scenarios}:{}),
      proof:`${mode} trial scenarios, actual built Worker and existing school mandates with locally minted sessions; no interactive IdP or human result implied`};
  } finally {
    try {
      for(const session of sessions)await db`delete from public.app_sessions where id=${session.id} and identity_id=${session.identity}`;
      const [{count}]=await db`select count(*)::integer as count from public.app_sessions where id=any(${sessions.map(s=>s.id)}::uuid[])`;
      if(count!==0)throw new Error('REFUSED: tillfällig egen provsession kvarstår');
    } finally {await db.end();}
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  try {
    if(process.argv.length!==2)throw new Error('REFUSED: inga flaggor tillåtna');
    console.log(JSON.stringify(await verifyProgramplanUserTrial()));
  } catch {
    console.error('Användarprovets Worker-läsning misslyckades: TARGET_OR_READ_CHECK_FAILED');
    process.exitCode=1;
  }
}
