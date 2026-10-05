// Additive user-trial fixtures for the existing synthetic phase-3 school.
// Never resets data, widens mandates, or overwrites a user's previous edits.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
if (process.argv.length !== 2) throw new Error('REFUSED: inga flaggor tillåtna');
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
const customer = '33000000-0000-4000-8000-000000000001';
const unit = '33000000-0000-4000-8000-000000000111';
const id = n => `55100100-0000-4000-8000-${String(n).padStart(12, '0')}`;
const gr = ['bild','engelska','hkk','idrott','matematik','musik','no','biologi','fysik','kemi','so','geografi','historia','religion','samhallskunskap','slojd','svenska','teknik','sprakval'];
const im = {'im-sv':6,'im-ma':5,'im-en':4,'im-sh':2,'im-idh':2,'im-praktik':4,'im-mentor':1};
try {
  const result = await db.begin(async tx => {
    const [school] = await tx`select s.organizer_id from public.school_units s join public.organizers o on o.id=s.organizer_id join public.customers c on c.id=o.customer_id
      where s.id=${unit} and c.id=${customer} and c.name='Syntetisk fas 3 kund 1' and s.name='Syntetisk skola 11'`;
    if (!school) throw new Error('REFUSED: avsedd syntetisk provskola saknas');
    await tx`select public.phase3_lock_customer(${customer})`;
    for (const [n,kind,name] of [[40,'grundskola','Användarprov – grundskola'],[41,'introduktionsprogram','Användarprov – introduktionsprogram']]) {
      const existing = await tx`select id from public.offerings where id=${id(n)}`;
      if (existing.length) {
        const [owned] = await tx`select id from public.offerings where id=${id(n)} and organizer_id=${school.organizer_id} and unit_id=${unit} and name=${name} and kind=${kind}::public.offering_kind`;
        if (!owned) throw new Error('REFUSED: prov-ID används av annat underlag');
      } else await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades)
        values(${id(n)},${school.organizer_id},${unit},${kind}::public.offering_kind,${name},'Syntetiskt användarprov 2026',${kind==='grundskola'?[7,8,9]:null}::smallint[])`;
    }
    for (const [n,offering,version,locked] of [[51,40,2,true],[50,40,1,false],[52,41,1,false]]) {
      const [existing] = await tx`select offering_id,organizer_id,unit_id,version from public.timplans where id=${id(n)}`;
      if (existing) {
        if (existing.offering_id!==id(offering)||existing.organizer_id!==school.organizer_id||existing.unit_id!==unit||existing.version!==version) throw new Error('REFUSED: provplanens ägarskap avviker');
        continue; // Preserve all edits, revisions and cell values from previous runs.
      }
      await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis)
        values(${id(n)},${school.organizer_id},${id(offering)},${unit},${version},'Syntetiskt användarprov – inga nationellt fastställda timvärden')`;
      for (const row of offering===40?gr:Object.keys(im)) {
        const hours=offering===40?(row==='matematik'?[100,100,100]:row==='engelska'?[60,60,60]:[0,0,0]):[im[row]];
        await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${id(n)},${row},${hours}::smallint[])`;
      }
      if (locked) await tx`update public.timplans set status='faststalld',decided_on=public.app_today() where id=${id(n)}`;
    }
    const [actor] = await tx`select a.id,a.membership_id,m.identity_id from public.access_assignments a join public.memberships m on m.id=a.membership_id join public.mandate_units u on u.assignment_id=a.id
      where a.customer_id=${customer} and a.organizer_id=${school.organizer_id} and a.function='rektor' and a.ended_at is null and u.unit_id=${unit} order by a.id limit 1`;
    if (!actor) throw new Error('REFUSED: rektorsmandat saknas');
    await tx`select set_config('app.customer_id',${customer},true),set_config('app.assignment_id',${actor.id},true),set_config('app.membership_id',${actor.membership_id},true),set_config('app.identity_id',${actor.identity_id},true),set_config('app.correlation_id',${randomUUID()},true)`;
    const [list] = await tx`select public.phase5_list_timplans(1) as result`;
    for (const n of [50,51,52]) {
      if (!list.result.plans.some(p=>p.id===id(n))) throw new Error('Provplan saknas i mandatavgränsad lista');
      const [read] = await tx`select public.phase5_read_timplan(${id(n)}) as result`;
      if (!read.result.cells || !Object.keys(read.result.cells).length) throw new Error('Provmatris saknas');
    }
    return {target:'protected',plans:3,school:'Syntetisk skola 11',status:'READY',verification:'mandate-scoped SQL list and all three matrices'};
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error('Provunderlag kunde inte förberedas:', /^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'TARGET_OR_FIXTURE_CHECK_FAILED');
  process.exitCode=1;
} finally { await db.end(); }
