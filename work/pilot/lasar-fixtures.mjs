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
  return { ...f, offerings: { gy, im }, schoolTypes: { A: ['GR', 'GY'], B: ['GR'], C: ['GY'] } };
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
