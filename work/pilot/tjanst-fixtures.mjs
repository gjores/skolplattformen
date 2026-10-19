// 05.1 tjänstefördelning: migrationsordning och syntetiska fixturer för SQL-proven (planerna 03, 06, 08, 09 och 10).
// Bara syntetiska personer, skolor och elever i en egen kund. Inga personnummer utöver repots syntetiska TEST-lista,
// inga hemligheter och inga riktiga namn. Fixturen skapar inga temporära objekt, så den kan committas i en ägd
// provdatabas och användas från flera anslutningar.
import { createHash, randomUUID } from 'node:crypto';
import { grimMigrations } from './verify-grim-class-timplans.mjs';

/** Installationsordning för fas 05.1:s migrationer (planerna 06, 08 och 09 lägger till sina sist). */
export const tjanstMigrations = [...grimMigrations, 'supabase/migrations/20261020110000_tjanst_personal_self.sql'];

const ROLE_NUMBERS = { hm: 10, principalA: 11, principalB: 12, principalAB: 13, teacherGroup: 14, teacherSelf: 15, teacherSelf2: 16, admin: 17, foreignHm: 18, teacherSelf3: 19 };

/**
 * Bas: kund 1/huvudman 2 med skolorna A (30), B (31) och C (32), en främmande kund 3/huvudman 4 med skola 33.
 * Huvudman (alla tre skolor), rektor A, rektor B, rektor AB, administratör A och en lärare med gruppmandat på klass 41.
 * Elever 60–62 på skola A: 60 och 61 i klass 41 (lärarens grupp), 62 i klass 42. Lärarkonton för Egen tjänst
 * (teacherSelf, teacherSelf2, teacherSelf3) har medlemskap men inget mandat; mandatet ges i provet.
 * Kräver bara schemat före 05.1-03.
 */
export async function createTjanstFixture(tx) {
  const prefix = randomUUID().slice(0, 8), id = n => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const roles = {};
  const identity = name => id(ROLE_NUMBERS[name]), membership = name => id(ROLE_NUMBERS[name] + 10), sessionId = name => id(ROLE_NUMBERS[name] + 80);
  const customerOf = name => name === 'foreignHm' ? id(3) : id(1);
  await tx`insert into public.customers(id,name) values(${id(1)},'Syntetisk tjänstefördelningskund'),(${id(3)},'Syntetisk främmande kund')`;
  await tx`insert into public.organizers(id,customer_id,name,type) values(${id(2)},${id(1)},'Syntetisk huvudman','Kommun'),(${id(4)},${id(3)},'Syntetisk främmande huvudman','Kommun')`;
  const code = String(parseInt(prefix.slice(0, 5), 16)).padStart(6, '0').slice(-6);
  await tx`insert into public.school_units(id,organizer_id,code,name,municipality_code) values
   (${id(30)},${id(2)},${code + '30'},'Syntetisk skola A','0000'),(${id(31)},${id(2)},${code + '31'},'Syntetisk skola B','0000'),
   (${id(32)},${id(2)},${code + '32'},'Syntetisk skola C','0000'),(${id(33)},${id(4)},${code + '33'},'Syntetisk främmande skola','0000')`;
  for (const name of Object.keys(ROLE_NUMBERS)) {
    await tx`insert into public.identities(id,issuer,subject,display_name) values(${identity(name)},${`https://${prefix}.tjanst.example.test`},${name},${'Syntetisk ' + name})`;
    await tx`insert into public.memberships(id,identity_id,customer_id) values(${membership(name)},${identity(name)},${customerOf(name)})`;
  }
  const session = async name => {
    await tx`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
     values(${sessionId(name)},${createHash('sha256').update(prefix + name).digest()},${identity(name)},${membership(name)},${roles[name]},clock_timestamp()+interval '2 hours',clock_timestamp()+interval '8 hours')
     on conflict(id) do update set assignment_id=excluded.assignment_id`;
  };
  // Huvudmännen är rotmandat (som i repots övriga fixturer).
  for (const [name, n, org, customer, units] of [['hm', 80, 2, 1, [30, 31, 32]], ['foreignHm', 88, 4, 3, [33]]]) {
    await tx`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(${id(n)},${membership(name)},${id(customer)},${id(org)},'huvudman','synthetic-v1','school')`;
    for (const u of units) await tx`insert into public.mandate_units values(${id(n)},${id(customer)},${id(org)},${id(u)})`;
    roles[name] = id(n); await session(name);
  }
  const actor = async (t, name) => {
    for (const [key, value] of Object.entries({ customer_id: customerOf(name), identity_id: identity(name), membership_id: membership(name), session_id: sessionId(name),
      assignment_id: roles[name], correlation_id: randomUUID() })) await t`select set_config(${'app.' + key},${value},true)`;
  };
  const grant = async (t, by, payload) => { await actor(t, by); return (await t`select public.phase3_grant_mandate(${t.json(payload)}) value`)[0].value; };
  const assign = async (t, name, by, payload) => { roles[name] = await grant(t, by, { membershipId: membership(name), ...payload }); await sessionFor(t, name); return roles[name]; };
  const sessionFor = async (t, name) => {
    await t`insert into public.app_sessions(id,token_hash,identity_id,membership_id,assignment_id,expires_at,absolute_expires_at)
     values(${sessionId(name)},${createHash('sha256').update(prefix + name).digest()},${identity(name)},${membership(name)},${roles[name]},clock_timestamp()+interval '2 hours',clock_timestamp()+interval '8 hours')
     on conflict(id) do update set assignment_id=excluded.assignment_id`;
  };

  await assign(tx, 'principalA', 'hm', { function: 'rektor', scopeKind: 'school', unitIds: [id(30)] });
  await assign(tx, 'principalB', 'hm', { function: 'rektor', scopeKind: 'school', unitIds: [id(31)] });
  await assign(tx, 'principalAB', 'hm', { function: 'rektor', scopeKind: 'school', unitIds: [id(30), id(31)] });
  await actor(tx, 'hm');
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values(${id(40)},${id(2)},${id(30)},'grundskola','Syntetisk GR 7–9','Läsåret 2026/27',${[7, 8, 9]}::smallint[],2026)`;
  await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values
   (${id(41)},${id(1)},${id(2)},${id(30)},${id(40)},'SYN7A',2026),(${id(42)},${id(1)},${id(2)},${id(30)},${id(40)},'SYN7B',2026)`;
  // Repots syntetiska TEST-format (kontrollsiffra prövas av phase4_synthetic_birth_date); tre giltiga nummer läggs i tillåtelselistan.
  const numbers = (await tx`select c from (select 'TEST-20130101-'||lpad(n::text,4,'0') c from generate_series(1,400) n) x
   where public.phase4_synthetic_birth_date(c) is not null order by c limit 3`).map(r => r.c);
  await tx`insert into public.synthetic_pupil_numbers(personal_number) select unnest(${numbers}::text[]) on conflict do nothing`;
  for (const [i, n] of [60, 61, 62].entries()) {
    await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name) values(${id(n)},${id(1)},${id(2)},${'Syntetisk elev ' + (i + 1)},${numbers[i]},${'Elev ' + (i + 1)})`;
    await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on) values(${id(n + 10)},${id(1)},${id(2)},${id(n)},${id(30)},${id(40)},'2026-07-01')`;
    await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on) values(${id(1)},${id(2)},${id(n)},${id(30)},${id(n === 62 ? 42 : 41)},${id(n + 10)},'2026-07-01')`;
  }
  await assign(tx, 'admin', 'principalA', { function: 'administrator', scopeKind: 'school', unitIds: [id(30)] });
  await assign(tx, 'teacherGroup', 'principalA', { function: 'larare', scopeKind: 'group', unitIds: [id(30)], groups: [{ id: id(41), kind: 'teaching' }] });
  return { prefix, id, roles, identity, membership, sessionId, actor, grant, assign, sessionFor, schools: { A: id(30), B: id(31), C: id(32), foreign: id(33) },
    classes: { group: id(41), other: id(42) }, pupils: { inGroup: id(60), inGroup2: id(61), outside: id(62) } };
}

/** Personalkommandon för proven (kräver 20261020110000). */
export const personalCommand = async (t, q) => (await t`select public.tjanst_personal_command(${t.json(q)}) value`)[0].value;
export const personalRead = async (t, q = {}) => (await t`select public.tjanst_personal_read(${t.json(q)}) value`)[0].value;
export const personalStatus = async (t, q) => (await t`select public.tjanst_personal_status(${t.json(q)}) value`)[0].value;
export const personalRef = (q, personId = null) => ({ family: 'personal', commandId: q.commandId, action: q.action,
  target: { unitId: q.payload.unitId ?? null, schoolYear: null, versionId: null, personId: q.payload.personId ?? personId } });
export const createPerson = (givenName, familyName, external = null) => ({ commandId: randomUUID(), action: 'create_person', expectedRevision: 0,
  payload: { givenName, familyName, externalId: external?.id ?? null, externalIdSource: external?.source ?? null } });
export const saveEmployment = (personId, expectedRevision, percent, startsOn, endsOn = null, employmentId = null) => ({ commandId: randomUUID(), action: 'save_employment',
  expectedRevision, payload: { personId, employmentId, percent, startsOn, endsOn } });
export const saveDuties = (personId, expectedRevision, employmentId, duties) => ({ commandId: randomUUID(), action: 'save_duties', expectedRevision,
  payload: { personId, employmentId, duties: duties.map(d => ({ dutyId: null, endsOn: null, ...d })) } });

/** Person med anställning och andelar via huvudmannens kommandon. Returnerar person-, anställnings- och andels-ID. */
export async function staffWithDuties(t, f, { givenName = 'Syntetisk', familyName, percent = 100, startsOn = '2026-07-01', endsOn = null, duties }) {
  await f.actor(t, 'hm');
  const created = await personalCommand(t, createPerson(givenName, familyName));
  const personId = created.result.receipt.personId;
  const employed = await personalCommand(t, saveEmployment(personId, 1, percent, startsOn, endsOn));
  const employment = employed.result.detail.people.find(p => p.id === personId).employments[0];
  const saved = await personalCommand(t, saveDuties(personId, 2, employment.id, duties));
  return { personId, employmentId: employment.id, revision: saved.result.receipt.revision, person: saved.result.detail.people.find(p => p.id === personId) };
}

/** Egen tjänst: rektor ger lärarkontot mandatet self för en person i huvudmannens personal. */
export async function grantSelf(t, f, { teacher = 'teacherSelf', by = 'principalA', unitIds, staffPersonId, extra = {} }) {
  return f.assign(t, teacher, by, { function: 'larare', scopeKind: 'self', unitIds, staffPersonId, ...extra });
}
