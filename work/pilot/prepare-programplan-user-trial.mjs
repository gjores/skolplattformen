// Additive, explicitly synthetic user-trial rows. No reset or mandate changes.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { assertTarget } from './verify-target.mjs';
import { verifyProgramplanCatalog, resolveProgramplanBasis } from '../../web/lib/programplan-catalog.ts';
import { parseRawProgramplanWorkspace } from '../../web/lib/programplan-workspace-contract.ts';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';

const customer = '33000000-0000-4000-8000-000000000001';
const unit = '33000000-0000-4000-8000-000000000111';
const id = n => `55100110-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const trialEducationSpecs = Object.freeze([
  Object.freeze({number:40,name:'Användarprov – programplan, skapa',plan:null,program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:41,name:'Användarprov – programplan, äldre utkast',plan:50,program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:42,name:'Användarprov – programplan, bundet utkast',plan:51,program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:43,name:'Användarprov – programplan, ny version',plan:52,program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:44,name:'Ekonomiprogrammet – Ekonomi',plan:null,program:'EK25',version:4,orientation:'EKEKI'}),
  Object.freeze({number:45,name:'Naturvetenskapsprogrammet – Naturvetenskap',plan:null,program:'NA25',version:4,orientation:'NANAP'}),
  Object.freeze({number:46,name:'Teknikprogrammet – Informations- och medieteknik',plan:null,program:'TE25',version:2,orientation:'TEINM'}),
  Object.freeze({number:47,name:'Estetiska programmet – Bild och formgivning',plan:null,program:'ES25',version:3,orientation:'ESBIF'}),
  Object.freeze({number:48,name:'Vård- och omsorgsprogrammet',plan:null,program:'VO25',version:4,orientation:null}),
]);
// 05-20 (D-08): kompletterande provutbildningar med framtida kullstart, så att 05-19:s tabellprov
// och 05-20:s livscykel kan prövas efter låsen. De tidigare 2026-exemplen ändras eller raderas aldrig.
export const futureTrialEducationSpecs = Object.freeze([
  Object.freeze({number:60,name:'Användarprov framtida kull – bundet utkast',plan:70,kind:'bound',program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:61,name:'Användarprov framtida kull – ny version',plan:71,kind:'locked',program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:62,name:'Användarprov framtida kull – skapa plan',plan:null,kind:null,program:'SA25',version:4,orientation:'SASAP'}),
  Object.freeze({number:63,name:'Användarprov framtida kull – ta bort eller arkivera',plan:73,kind:'bound',program:'SA25',version:4,orientation:'SASAP'}),
]);
const legacyKind=plan=>plan===51?'bound':plan===52?'locked':plan===null?null:'legacy';
export function requireTrialSchool(school) {
  if (!school || school.unit_id !== unit || school.customer_id !== customer
    || school.customer_name !== 'Syntetisk fas 3 kund 1' || school.school_name !== 'Syntetisk skola 11'
    || typeof school.organizer_id !== 'string') throw new Error('REFUSED: avsedd syntetisk provskola saknas');
  return school.organizer_id;
}
export function requireOwnedTrialEducation(row,spec,organizerId) {
  if (!row || row.id !== id(spec.number) || row.organizer_id !== organizerId || row.unit_id !== unit
    || row.kind !== 'gymnasium' || row.name !== spec.name || row.program_code !== spec.program
    || row.orientation_code !== spec.orientation) throw new Error('REFUSED: prov-ID används av annat underlag');
}

export async function prepareProgramplanUserTrial() {
  const target=await assertTarget('protected');
  const raw=JSON.parse(readFileSync(fileURLToPath(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url)),'utf8'));
  const catalog=await verifyProgramplanCatalog(raw);
  const reference={catalogId:raw.catalogId,programRef:{code:'SA25',version:4},orientationCode:'SASAP',startedOn:'2026-08-17',specializationRefs:[{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100}]};
  const futureStart=nextCohortStart(),futureYear=Number(futureStart.slice(0,4)),futureReference={...reference,startedOn:futureStart};
  if(resolveProgramplanBasis(catalog,futureReference).status!=='resolved')throw new Error('REFUSED: framtida provgrund kan inte lösas');
  const specs=[...trialEducationSpecs.map(spec=>({...spec,kind:legacyKind(spec.plan),future:false})),...futureTrialEducationSpecs.map(spec=>({...spec,future:true}))];
  if(resolveProgramplanBasis(catalog,reference).status!=='resolved')throw new Error('REFUSED: provets exakta kataloggrund kan inte lösas');
  for(const spec of trialEducationSpecs){
    if(resolveProgramplanBasis(catalog,{...reference,programRef:{code:spec.program,version:spec.version},orientationCode:spec.orientation,specializationRefs:[]}).status!=='resolved')
      throw new Error('REFUSED: ett programs exakta kataloggrund kan inte lösas');
  }
  const require=createRequire(new URL('../../web/package.json',import.meta.url));
  const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
  try {
    return await db.begin(async tx=>{
      const [school]=await tx`select s.id as unit_id,s.organizer_id,s.name as school_name,c.id as customer_id,c.name as customer_name
        from public.school_units s join public.organizers o on o.id=s.organizer_id join public.customers c on c.id=o.customer_id where s.id=${unit}`;
      const organizer=requireTrialSchool(school);
      await tx`select public.phase3_lock_customer(${customer})`;
      // Only the explicitly owned synthetic trial school is complemented.
      // Authority is still supplied by the pre-existing real mandates below.
      const schoolFormAdded=await tx`insert into public.school_unit_types(unit_id,school_type) values(${unit},'GY') on conflict(unit_id,school_type) do nothing returning unit_id`;
      const previous=await tx`select 'education' as kind,o.id,to_jsonb(o) as data from public.offerings o
        where o.id=any(${specs.map(s=>id(s.number))}::uuid[])
        union all select 'plan',p.id,to_jsonb(p) from public.point_plans p
        where p.offering_id=any(${specs.map(s=>id(s.number))}::uuid[])`;
      const [available]=await tx`select catalog_id from public.programplan_catalogs where catalog_id=${reference.catalogId}`;
      if(!available)throw new Error('REFUSED: den verifierade katalogen saknas i provdatabasen');
      for(const spec of specs){
        const [existing]=await tx`select id,organizer_id,unit_id,kind,name,program_code,orientation_code from public.offerings where id=${id(spec.number)}`;
        if(existing)requireOwnedTrialEducation(existing,spec,organizer);
        else await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
          values(${id(spec.number)},${organizer},${unit},'gymnasium',${spec.name},${spec.future?`Syntetiskt användarprov ${futureYear}–${futureYear+3}`:'Syntetiskt användarprov 2026'},${spec.program},${spec.orientation},${spec.future?futureYear:2026})`;
        if(spec.plan===null)continue;
        const [plan]=await tx`select id,organizer_id,offering_id,version from public.point_plans where id=${id(spec.plan)}`;
        if(plan){
          if(plan.organizer_id!==organizer||plan.offering_id!==id(spec.number)||plan.version!==1)throw new Error('REFUSED: provplanens ägarskap avviker');
          continue; // Never overwrite the user's changes, bindings, or new versions.
        }
        // If the user already created their own plan on this offering, preserve it.
        const [other]=await tx`select id from public.point_plans where offering_id=${id(spec.number)} limit 1`;
        if(other)continue;
        const bound=spec.kind==='bound',locked=spec.kind==='locked',basis=spec.future?futureReference:reference;
        await tx`insert into public.point_plans(id,organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,decided_on)
          values(${id(spec.plan)},${organizer},${id(spec.number)},1,${locked?'faststalld':'utkast'}::public.plan_status,
            ${basis.specializationRefs.map(r=>r.itemCode)}::text[],${bound?basis.catalogId:null},${bound?tx.json(basis):null}::jsonb,${locked?'2026-09-01':null}::date)`;
      }
      const [{count}]=await tx`select count(*)::integer as count from public.offerings where id=any(${specs.map(s=>id(s.number))}::uuid[]) and organizer_id=${organizer} and unit_id=${unit}`;
      if(count!==specs.length)throw new Error('REFUSED: ofullständigt provunderlag');
      // Existing real mandates supply authority; only the short-lived synthetic
      // session is new. Missing/revoked authority is never repaired by this script.
      let verifiedRoles=0;
      for(const role of ['rektor','huvudman']){
        const [actor]=await tx`select a.id,a.membership_id,m.identity_id from public.access_assignments a
          join public.memberships m on m.id=a.membership_id join public.mandate_units u on u.assignment_id=a.id
          where a.customer_id=${customer} and a.organizer_id=${organizer} and a.function=${role}
            and a.ended_at is null and m.status='active' and u.unit_id=${unit} and public.phase3_mandate_is_valid(a.id) order by a.id limit 1`;
        if(!actor)throw new Error('REFUSED: avsett befintligt mandat saknas');
        const [session]=await tx`insert into public.app_sessions(token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
          values(${randomBytes(32)},${actor.identity_id},${actor.membership_id},${actor.id},now()+interval '5 minutes',now()+interval '5 minutes') returning id`;
        await tx`select set_config('app.customer_id',${customer},true),set_config('app.assignment_id',${actor.id},true),
          set_config('app.membership_id',${actor.membership_id},true),set_config('app.identity_id',${actor.identity_id},true),
          set_config('app.session_id',${session.id},true)`;
        let found=new Set();
        for(let page=1;page<=100000;page++){
          await tx`select set_config('app.correlation_id',${randomUUID()},true)`;
          const [list]=await tx`select public.phase5_list_programplan_offerings(${page}) as result`;
          for(const row of list.result.offerings)found.add(row.id);
          if(page*list.result.pageSize>=list.result.count)break;
        }
        for(const spec of specs){
          if(!found.has(id(spec.number)))throw new Error('REFUSED: provutbildning saknas i verkligt mandat');
          const correlation=randomUUID();
          await tx`select set_config('app.correlation_id',${correlation},true)`;
          const [read]=await tx`select public.phase5_programplan_workspace(${id(spec.number)},1,${reference.catalogId}) as result`;
          const workspace=parseRawProgramplanWorkspace(read.result,{offeringId:id(spec.number),versionPage:1,catalogId:reference.catalogId});
          if(workspace.catalog.status!=='selected'||workspace.education.orientationCode!==spec.orientation||spec.future&&(workspace.lifecycle.phase!=='framtida'||workspace.lifecycle.archived))
            throw new Error('REFUSED: provunderlaget kan inte läsas');
          const stored=await verifyProgramplanCatalog({...workspace.catalog.payload,catalogId:reference.catalogId});
          const program=stored.programs.find(p=>p.code===spec.program);
          if(program?.version!==spec.version)throw new Error('REFUSED: lagrad programgrund avviker');
          const [{count:auditCount}]=await tx`select count(*)::integer as count from public.security_events
            where correlation_id=${correlation} and session_id=${session.id} and assignment_id=${actor.id}
              and source='db' and action='programplan_workspace_read' and outcome='ok' and object_id=${id(spec.number)}`;
          if(auditCount!==1)throw new Error('REFUSED: obligatorisk underlagslogg saknas');
        }
        await tx`delete from public.app_sessions where id=${session.id} and identity_id=${actor.identity_id}`;
        const [{count:remaining}]=await tx`select count(*)::integer as count from public.app_sessions where id=${session.id}`;
        if(remaining!==0)throw new Error('REFUSED: egen provsession kunde inte städas');
        verifiedRoles++;
      }
      for(const row of previous){
        const [after]=row.kind==='education'
          ? await tx`select to_jsonb(o) as data from public.offerings o where o.id=${row.id}`
          : await tx`select to_jsonb(p) as data from public.point_plans p where p.id=${row.id}`;
        if(!after||JSON.stringify(after.data)!==JSON.stringify(row.data))throw new Error('REFUSED: tidigare användarprovsdata ändrades');
      }
      return {target:'protected',status:'READY',educations:specs.length,futureEducations:futureTrialEducationSpecs.length,futureStart,school:'Syntetisk skola 11',programs:[...new Set(trialEducationSpecs.map(s=>s.program))],knownSyntheticStart:'2026-08-17',verifiedExistingRoles:verifiedRoles,
        preservedExistingRecords:previous.length,schoolForm:'GY',schoolFormAdded:schoolFormAdded.length===1,
        verification:'owned additive rows; actual existing rector/HM mandates with temporary SQL sessions and mandatory DB audit; no Worker, interactive IdP or human result implied'};
    });
  } finally {await db.end();}
}

if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  try {
    if(process.argv.length!==2)throw new Error('REFUSED: inga flaggor tillåtna');
    console.log(JSON.stringify(await prepareProgramplanUserTrial()));
  } catch(error){
    console.error('Programplansprov kunde inte förberedas:',/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'TARGET_OR_FIXTURE_CHECK_FAILED');
    process.exitCode=1;
  }
}
