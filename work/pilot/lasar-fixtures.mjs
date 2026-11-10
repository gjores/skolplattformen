// 05.1.1 läsårskalender: syntetiska fixturer och anropshjälp för SQL-proven (plan 06 och senare).
// Bygger på tjänstefördelningens bas (createTjanstFixture): kund 1/huvudman 2 med skolorna A, B och C, en främmande
// kund 3/huvudman 4 med en egen skola, huvudman för alla tre skolor, rektor A, rektor B, rektor AB och skoladministratör
// på skola A. Här läggs skolformer och utbildningar till: A har GR och GY med en GY- och en IM-utbildning, B bara GR och
// C bara GY. Bara syntetiska namn, inga personnummer utöver repots syntetiska TEST-lista, inga demofunktioner.
// SS 12000: skolenheterna nycklas på stabila ID (Organisation, organisationType=Skolenhet); kalendern saknar objekt i standarden.
import { randomUUID } from 'node:crypto';
import { createTjanstFixture, lasarMigrations } from './tjanst-fixtures.mjs';
import { lasarPayloadHash } from '../../web/lib/lasar-contract.ts';
import { proposeSchoolYear } from '../../web/lib/lasar-model.ts';

export { lasarMigrations };

/** Tjänstefördelningens bas plus skolformer och utbildningar per skola. Kräver bara schemat före 05.1.1-06. */
export async function createLasarFixture(tx) {
  const f = await createTjanstFixture(tx);
  await f.actor(tx, 'hm');
  await tx`insert into public.school_unit_types(unit_id,school_type) values
   (${f.schools.A},'GR'),(${f.schools.A},'GY'),(${f.schools.B},'GR'),(${f.schools.C},'GY') on conflict do nothing`;
  const gy = randomUUID(), im = randomUUID();
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,start_year) values
   (${gy},${f.id(2)},${f.schools.A},'gymnasium','Syntetiskt SA25','Syntetisk kull 2027','SA25',2027)`;
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year) values
   (${im},${f.id(2)},${f.schools.A},'introduktionsprogram','Syntetiskt IM','Läsåret 2027/28',2027)`;
  const groups = await seedLasarGroups(tx, f, { gy, im });
  return { ...f, offerings: { gy, im, gr: groups.gr }, groups, schoolTypes: { A: ['GR', 'GY'], B: ['GR'], C: ['GY'] } };
}

/**
 * 05.1.1-08 (LASAR-04): skolans grupper för läsåret 2027 på skola A. GR-utbildningen åk 1–3 med fastställd timplan och klasserna
 * SYN1A (åk 1), SYN3A (åk 3) och SYN2X (utan koppling); IM-klassen SYNIM27 (vecka) i fixturens IM-utbildning; gymnasieklassen SA27A
 * utan koppling i SA25. Klasserna SYN7A och SYN7B (2026) hör inte till läsåret 2027. Timplanernas status sätts direkt av ägaren
 * (syntetiskt, som seedGrimNeeds); kopplingarna går genom rektors GR/IM-kommando. Inga elever och inga elevantal (A-18).
 */
export async function seedLasarGroups(tx, f, { gy, im }) {
  const gr = randomUUID(), grPlan = randomUUID(), imPlan = randomUUID();
  const classes = { ak1: randomUUID(), ak3: randomUUID(), unlinked: randomUUID(), im: randomUUID(), gy: randomUUID() };
  await f.actor(tx, 'hm');
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
   (${gr},${f.id(2)},${f.schools.A},'grundskola','Syntetisk GR 1–3','Läsåret 2027/28',${[1, 2, 3]}::smallint[],2027)`;
  await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values
   (${grPlan},${f.id(2)},${gr},${f.schools.A},1,'Syntetisk GR 1–3'),(${imPlan},${f.id(2)},${im},${f.schools.A},1,'Syntetiskt IM 2027')`;
  await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values
   (${grPlan},'svenska',${[100, 110, 120]}::smallint[]),(${grPlan},'matematik',${[80, 90, 100]}::smallint[]),(${grPlan},'no',${[40, 40, 40]}::smallint[]),
   (${grPlan},'biologi',${[10, 10, 10]}::smallint[]),(${imPlan},'im-sv',${[5]}::smallint[]),(${imPlan},'im-ma',${[3]}::smallint[])`;
  await tx`set local session_replication_role=replica`;
  await tx`update public.timplans set status='faststalld',decided_on='2027-06-01' where id in (${grPlan},${imPlan})`;
  await tx`set local session_replication_role=origin`;
  await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
   (${classes.ak1},${f.id(1)},${f.id(2)},${f.schools.A},${gr},'SYN1A',2027),(${classes.ak3},${f.id(1)},${f.id(2)},${f.schools.A},${gr},'SYN3A',2027),
   (${classes.unlinked},${f.id(1)},${f.id(2)},${f.schools.A},${gr},'SYN2X',2027),(${classes.im},${f.id(1)},${f.id(2)},${f.schools.A},${im},'SYNIM27',2027),
   (${classes.gy},${f.id(1)},${f.id(2)},${f.schools.A},${gy},'SA27A',2027)`;
  await f.actor(tx, 'principalA');
  const link = (classId, planId, columnId) => tx`select public.phase51_grim_class_command(${tx.json({ action: 'link', commandId: randomUUID(), classId, planId,
    expectedPlanRevision: 0, columnId, expectedLinkRevision: null, previousPlanId: null })}) value`;
  await link(classes.ak1, grPlan, 'ak1'); await link(classes.ak3, grPlan, 'ak3'); await link(classes.im, imPlan, 'vecka');
  await f.actor(tx, 'hm');
  return { gr, grPlan, imPlan, classes };
}

const value = rows => rows[0].value;
export const lasarRead = async (t, q) => value(await t`select public.lasar_read(${t.json(q)}) value`);
export const lasarSend = async (t, q) => value(await t`select public.lasar_command(${t.json(q)}) value`);
/** Utfallet för ett kommando-id (05.1.1-07): samma aktör, mål och läsår; utförs aldrig igen. */
export const lasarStatus = async (t, q) => value(await t`select public.lasar_status(${t.json(q)}) value`);
export const school = unitId => ({ kind: 'school', unitId });

/** Kommando som klienten bygger det (payloadHash över exakt de kommandon som skickas). */
export async function lasarCommand({ unitId, schoolYear, versionId = null, expectedRevision = null, ops, commandId = randomUUID() }) {
  return { commandId, target: school(unitId), schoolYear, versionId, expectedRevision, ops, payloadHash: await lasarPayloadHash(ops) };
}
/** Som servern gör för create med källan proposal: innehållet räknas fram med proposeSchoolYear för skolans skolformer. */
export function proposalContent(schoolYear, unitId, schoolTypes) {
  const p = proposeSchoolYear(schoolYear, unitId, schoolTypes);
  return { terms: { ht: p.ht, vt: p.vt }, exceptions: p.exceptions };
}
export async function createCommand(unitId, schoolYear, schoolTypes, extra = {}) {
  return { ...(await lasarCommand({ unitId, schoolYear, ops: [{ op: 'create', source: 'proposal' }], ...extra })), proposal: proposalContent(schoolYear, unitId, schoolTypes) };
}
/** Återställ förslaget: servern räknar fram innehållet som vid create (05.1.1-07). */
export async function resetCommand({ unitId, schoolYear, versionId, expectedRevision, schoolTypes, commandId }) {
  return { ...(await lasarCommand({ unitId, schoolYear, versionId, expectedRevision, ops: [{ op: 'reset_to_proposal' }], ...(commandId ? { commandId } : {}) })),
    proposal: proposalContent(schoolYear, unitId, schoolTypes) };
}
export function lasarDecision({ unitId, schoolYear, versionId, expectedRevision, action, text = '', commandId = randomUUID() }) {
  return { commandId, target: school(unitId), schoolYear, versionId, expectedRevision, action, text, mode: null, confirmAffected: [] };
}
