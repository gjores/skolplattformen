// Egen syntetisk kund. Ingen testförberedelse eller städning får beröra användarens planer.
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { createProgramplanBrowserFixture, verifyProgramplanBrowserTarget, STARTED_START } from './phase5-programplan-browser-fixtures.mjs';
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(path.join(root,'web/package.json'));
const SOURCE_PATHS=['web/lib/gym-timplan.ts','web/lib/gym-timplan.test.mjs','web/lib/server/gym-timplan.ts','web/lib/server/gym-timplan.test.mjs',
  'web/app/api/timplaner/gym','web/app/protected-gym-timplan-workspace.tsx','web/app/protected-gym-timplan.css','web/app/protected-timplan-workspace.tsx','web/app/protected-timplan.css',
  'web/app/protected-home.tsx','web/app/protected-programplan-workspace.tsx','web/app/protected-programplan-board.tsx',
  'web/lib/protected-plan-location.ts','web/lib/protected-plan-location.test.mjs','web/lib/server/http.ts',
  'web/lib/server-client.ts','web/lib/unsaved-changes.tsx','web/components/ui/dialog.tsx',
  'web/lib/mandate-policy.ts','web/lib/server/audit-details.ts','web/lib/session-channel.ts',
  'supabase/migrations/20261005110000_phase5_gym_timplan_transition.sql','supabase/migrations/20261005111000_phase5_worker_gym_timplan_transition.sql',
  'supabase/tests/phase5_program_timplan_transition.test.sql','work/pilot/phase5-gym-timplan-fixtures.mjs',
  'web/e2e/phase5-gym-timplan.spec.ts','web/playwright.phase5-gym-timplan.config.ts','web/e2e/phase5-timplan.spec.ts','web/playwright.phase5-timplan.config.ts'];
const BUSINESS_TABLES=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','timplan_events','class_timplans',
  'school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages','gym_timplan_receipts'];
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

export async function verifyGymTimplanBrowserTarget(baseURL) {
  const proof=await verifyProgramplanBrowserTarget(baseURL);
  const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(git(['status','--porcelain','--',...SOURCE_PATHS])||git(['diff','--name-only',proof.buildRevision,'HEAD','--',...SOURCE_PATHS])) {
    throw Error('Gymnasietimplansprovet kräver samma versionshanterade källor som bygget.');
  }
  return {...proof,scope:'local-synthetic-only',protectedSources:SOURCE_PATHS};
}

async function businessHashes(db) {
  const result={};
  for(const table of BUSINESS_TABLES) {
    const [exists]=await db`select to_regclass(${`public.${table}`}) is not null present`;
    if(!exists.present)throw Error(`Provtabellen ${table} saknas.`);
    // Sluten tabellista ovan; hela JSON-raden omfattar även tidsstämplar och nya nullable fält.
    const rows=await db.unsafe(`select to_jsonb(t) as row from public.${table} t order by to_jsonb(t)::text`);
    result[table]={count:rows.length,sha256:sha(rows.map(value=>value.row))};
  }
  return result;
}

function mustSucceed(reply,operation) {
  if(reply.status!==200)throw Error(`Den syntetiska ${operation} kunde inte förberedas (HTTP ${reply.status}).`);
  return reply.body;
}

export async function createGymTimplanFixture() {
  const manifest=await assertTarget('protected');
  const db=require('postgres')(manifest.dbUrl,{max:2,prepare:false,connect_timeout:10,onnotice:()=>{}});
  let base,closed=false;
  try {
    // Körs före den egna kunden skapas. DB-prov mot samma mål måste köras sekventiellt.
    const originalBusiness=await businessHashes(db);
    base=await createProgramplanBrowserFixture();
    const organizerId=`${base.customerId.slice(0,8)}-0000-4000-8000-000000000002`;
    const owned=async tx=>{
      const rows=await tx`select o.id from public.organizers o join public.customers c on c.id=o.customer_id
        where o.id=${organizerId} and c.id=${base.customerId} and c.name='Syntetiskt programplansprov'`;
      if(rows.length!==1)throw Error('Syntetiskt ägarskap kunde inte verifieras.');
    };
    const ownPlan=async(tx,planId)=>{
      await owned(tx);const rows=await tx`select t.id from public.timplans t join public.offerings o on o.id=t.offering_id
        where t.id=${planId} and t.organizer_id=${organizerId} and o.organizer_id=${organizerId}`;
      if(rows.length!==1)throw Error('REFUSED: främmande timplan.');
    };
    const cleanup=async()=>{
      if(closed)throw Error('Fixturen har redan städats.');
      let failure,evidence,remaining;
      try {
        await assertTarget('protected');
        await db.begin(async tx=>{
          await owned(tx);await tx`set local session_replication_role=replica`;
          // Klasslänkar här är bara egna syntetiska legacy-länkar. Främmande länkar raderas aldrig.
          const foreign=await tx`select l.timplan_id from public.class_timplans l join public.timplans t on t.id=l.timplan_id
            join public.school_units u on u.id=l.unit_id where t.organizer_id=${organizerId} and u.organizer_id<>${organizerId}`;
          if(foreign.length)throw Error('REFUSED: främmande klasskoppling till provplan.');
          await tx`delete from public.class_timplans where timplan_id in(select id from public.timplans where organizer_id=${organizerId})`;
          await tx`delete from public.gym_timplan_receipts where organizer_id=${organizerId}`;
          await tx`delete from public.timplan_events where timplan_id in(select id from public.timplans where organizer_id=${organizerId})`;
          await tx`delete from public.timplan_cells where timplan_id in(select id from public.timplans where organizer_id=${organizerId})`;
          await tx`delete from public.timplans where organizer_id=${organizerId}`;
          [remaining]=await tx`select (select count(*)::int from public.gym_timplan_receipts where organizer_id=${organizerId}) as "gymReceipts",
            (select count(*)::int from public.timplans where organizer_id=${organizerId}) as "timplans",
            (select count(*)::int from public.class_timplans l join public.school_units u on u.id=l.unit_id where u.organizer_id=${organizerId}) as "classLinks"`;
          if(Object.values(remaining).some(n=>n!==0))throw Error('gym_fixture_cleanup_remaining');
        });
        // Ny source_programplan_id har FKrestrict; timrader och kvittenser ska bort först.
        evidence=await base.cleanup();
        const after=await businessHashes(db);
        if(JSON.stringify(after)!==JSON.stringify(originalBusiness))throw Error('Originalens hela verksamhetsrader ändrades under provet.');
        evidence={...evidence,...remaining,originalBusinessUnchanged:true,before:originalBusiness,after};
      }catch(error){failure=error;}finally{closed=true;await db.end({timeout:3});}
      if(failure)throw failure;
      return evidence;
    };
    return {...base,organizerId,originalBusiness,cleanup,
      async createReadyProgramplan(baseURL,{session=base.hm,twoSchools=false,started=false,incomplete=false}={}) {
        await assertTarget('protected');await owned(db);
        const created=mustSucceed(await base.request(baseURL,session,'/api/programplaner/skapa',{
          offeringId:base.emptyOfferingId,expectedLatestVersion:0,basisReference:base.choiceBasis()}),'programramen');
        const planId=created.id;
        const program=JSON.parse(readFileSync(path.join(root,'web/lib/programplan-catalog.generated.json'),'utf8')).programs.find(p=>p.code==='SA25'&&p.version===4);
        if(!program)throw Error('REFUSED: låst SA-katalogprogram saknas.');
        const distribution=incomplete?[]:suggestProgramplanTerms(programplanTermRows(program,base.choiceBasis()),[],programplanLevelRanks(program));
        const terms=mustSucceed(await base.request(baseURL,session,'/api/programplaner/terminer',{planId,expectedRevision:created.revision,distribution}),'terminsramen');
        if(twoSchools)mustSucceed(await base.request(baseURL,base.hm,'/api/programplaner/utbildning/livscykel',{
          offeringId:base.emptyOfferingId,expectedRevision:0,command:'units',details:{unitIds:[base.unitId,base.secondUnitId]}}),'skolkopplingen');
        // Datum-/låsprov: endast den egna syntetiska källan flyttas, efter faktisk API-ramförberedelse.
        if(started)await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;
          await tx`update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(${STARTED_START}::text))
            where id=${planId} and organizer_id=${organizerId}`;});
        return {planId,offeringId:base.emptyOfferingId,distribution,revision:terms.revision};
      },
      async timplanSnapshot(planId) {
        await assertTarget('protected');await ownPlan(db,planId);
        const [plan]=await db`select to_jsonb(t) row from public.timplans t where t.id=${planId}`;
        return {plan:plan.row,cells:await db`select to_jsonb(c) row from public.timplan_cells c where c.timplan_id=${planId} order by c.row_id`,
          events:await db`select to_jsonb(e) row from public.timplan_events e where e.timplan_id=${planId} order by e.created_at,e.id`};
      },
      async classLinks() {
        await assertTarget('protected');await owned(db);
        return db`select to_jsonb(l) row from public.class_timplans l join public.school_units u on u.id=l.unit_id where u.organizer_id=${organizerId} order by l.unit_id,l.class_name,l.start_year`;
      },
      async seedLegacyClassLink() {
        const planId=randomUUID();await assertTarget('protected');
        await db.begin(async tx=>{await owned(tx);await tx`set local session_replication_role=replica`;
          await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,status,basis,decided_on)
            values(${planId},${organizerId},${base.offeringId},${base.unitId},1,'faststalld','Syntetisk historisk treårsmatris','2026-09-10')`;
          await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${planId},'ENGE1000X',array[30,40,50]::smallint[])`;
          await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
            values(${base.unitId},'SYN1A',2027,${planId},'ar1')`;});
        return {planId,snapshot:await this.timplanSnapshot(planId),links:await this.classLinks()};
      },
      async pairedGym(correlationId,session,action,objectId,objectType='timplan') {
        const all=await base.events(correlationId),rows=all.filter(row=>row.action===action);
        return all.length===2&&rows.length===2&&['db','worker'].every(source=>rows.some(row=>row.source===source&&row.outcome==='ok'
          &&row.actor_identity_id===session.identityId&&row.membership_id===session.membershipId&&row.assignment_id===session.assignmentId
          &&row.session_id===session.id&&row.customer_id===base.customerId&&row.object_type===objectType&&row.object_id===objectId));
      },
    };
  }catch(error){if(base)await base.cleanup().catch(()=>{});if(!closed)await db.end({timeout:3});throw error;}
}
