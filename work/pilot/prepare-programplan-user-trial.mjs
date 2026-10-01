// Additive, explicitly synthetic user-trial rows. No reset or mandate changes.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { assertTarget } from './verify-target.mjs';
import { verifyProgramplanCatalog, resolveProgramplanBasis } from '../../web/lib/programplan-catalog.ts';

const customer = '33000000-0000-4000-8000-000000000001';
const unit = '33000000-0000-4000-8000-000000000111';
const id = n => `55100110-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const trialEducationSpecs = Object.freeze([
  Object.freeze({number:40,name:'Användarprov – programplan, skapa',plan:null}),
  Object.freeze({number:41,name:'Användarprov – programplan, äldre utkast',plan:50}),
  Object.freeze({number:42,name:'Användarprov – programplan, bundet utkast',plan:51}),
  Object.freeze({number:43,name:'Användarprov – programplan, ny version',plan:52}),
]);
export function requireTrialSchool(school) {
  if (!school || school.unit_id !== unit || school.customer_id !== customer
    || school.customer_name !== 'Syntetisk fas 3 kund 1' || school.school_name !== 'Syntetisk skola 11'
    || typeof school.organizer_id !== 'string') throw new Error('REFUSED: avsedd syntetisk provskola saknas');
  return school.organizer_id;
}
export function requireOwnedTrialEducation(row,spec,organizerId) {
  if (!row || row.id !== id(spec.number) || row.organizer_id !== organizerId || row.unit_id !== unit
    || row.kind !== 'gymnasium' || row.name !== spec.name || row.program_code !== 'SA25'
    || row.orientation_code !== 'SASAP') throw new Error('REFUSED: prov-ID används av annat underlag');
}

export async function prepareProgramplanUserTrial() {
  const target=await assertTarget('protected');
  const raw=JSON.parse(readFileSync(fileURLToPath(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url)),'utf8'));
  const catalog=await verifyProgramplanCatalog(raw);
  const reference={catalogId:raw.catalogId,programRef:{code:'SA25',version:4},orientationCode:'SASAP',startedOn:'2026-08-17',specializationRefs:[{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100}]};
  if(resolveProgramplanBasis(catalog,reference).status!=='resolved')throw new Error('REFUSED: provets exakta kataloggrund kan inte lösas');
  const require=createRequire(new URL('../../web/package.json',import.meta.url));
  const db=require('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
  try {
    return await db.begin(async tx=>{
      const [school]=await tx`select s.id as unit_id,s.organizer_id,s.name as school_name,c.id as customer_id,c.name as customer_name
        from public.school_units s join public.organizers o on o.id=s.organizer_id join public.customers c on c.id=o.customer_id where s.id=${unit}`;
      const organizer=requireTrialSchool(school);
      await tx`select public.phase3_lock_customer(${customer})`;
      const previous=await tx`select 'education' as kind,o.id,to_jsonb(o) as data from public.offerings o
        where o.id=any(${trialEducationSpecs.map(s=>id(s.number))}::uuid[])
        union all select 'plan',p.id,to_jsonb(p) from public.point_plans p
        where p.offering_id=any(${trialEducationSpecs.map(s=>id(s.number))}::uuid[])`;
      const [available]=await tx`select catalog_id from public.programplan_catalogs where catalog_id=${reference.catalogId}`;
      if(!available)throw new Error('REFUSED: den verifierade katalogen saknas i provdatabasen');
      for(const spec of trialEducationSpecs){
        const [existing]=await tx`select id,organizer_id,unit_id,kind,name,program_code,orientation_code from public.offerings where id=${id(spec.number)}`;
        if(existing)requireOwnedTrialEducation(existing,spec,organizer);
        else await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
          values(${id(spec.number)},${organizer},${unit},'gymnasium',${spec.name},'Syntetiskt användarprov 2026','SA25','SASAP',2026)`;
        if(spec.plan===null)continue;
        const [plan]=await tx`select id,organizer_id,offering_id,version from public.point_plans where id=${id(spec.plan)}`;
        if(plan){
          if(plan.organizer_id!==organizer||plan.offering_id!==id(spec.number)||plan.version!==1)throw new Error('REFUSED: provplanens ägarskap avviker');
          continue; // Never overwrite the user's changes, bindings, or new versions.
        }
        // If the user already created their own plan on this offering, preserve it.
        const [other]=await tx`select id from public.point_plans where offering_id=${id(spec.number)} limit 1`;
        if(other)continue;
        const bound=spec.plan===51,locked=spec.plan===52;
        await tx`insert into public.point_plans(id,organizer_id,offering_id,version,status,specialization,catalog_id,basis_reference,decided_on)
          values(${id(spec.plan)},${organizer},${id(spec.number)},1,${locked?'faststalld':'utkast'}::public.plan_status,
            ${reference.specializationRefs.map(r=>r.itemCode)}::text[],${bound?reference.catalogId:null},${bound?tx.json(reference):null}::jsonb,${locked?'2026-09-01':null}::date)`;
      }
      const [{count}]=await tx`select count(*)::integer as count from public.offerings where id=any(${trialEducationSpecs.map(s=>id(s.number))}::uuid[]) and organizer_id=${organizer} and unit_id=${unit}`;
      if(count!==4)throw new Error('REFUSED: ofullständigt provunderlag');
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
        for(const spec of trialEducationSpecs){
          if(!found.has(id(spec.number)))throw new Error('REFUSED: provutbildning saknas i verkligt mandat');
          const correlation=randomUUID();
          await tx`select set_config('app.correlation_id',${correlation},true)`;
          const [read]=await tx`select public.phase5_programplan_workspace(${id(spec.number)},1,${reference.catalogId}) as result`;
          if(read.result.education.id!==id(spec.number)||read.result.catalog.status!=='selected')throw new Error('REFUSED: provunderlaget kan inte läsas');
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
      return {target:'protected',status:'READY',educations:4,school:'Syntetisk skola 11',program:'SA25',programVersion:4,orientation:'SASAP',knownSyntheticStart:'2026-08-17',verifiedExistingRoles:verifiedRoles,
        preservedExistingRecords:previous.length,
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
