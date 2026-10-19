#!/usr/bin/env node
// 05.1-03: personal, anställning, skolandelar (D-12), rektors skolvy (D-11), utkastlärare (D-19), mandatet Egen tjänst
// (D-03, alternativ A) och elevspärren. Egen databas, syntetiska fixturer, migrationen provas först med återrullning
// och installeras sedan bara i den egna databasen.
//   node work/pilot/verify-tjanst-personal.mjs --out /private/tmp/tjanst-personal-sql.json              (schemakopia av skyddat lokalt mål)
//   node work/pilot/verify-tjanst-personal.mjs --out /tmp/tjanst-personal-sql.json --ephemeral          (egen PostgreSQL byggd från migrationerna)
// Ingen HTTP/OIDC och inget installerat mål ändras.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { createPerson, createTjanstFixture, grantSelf, personalCommand, personalRead, personalRef, personalStatus, saveDuties, saveEmployment,
  staffWithDuties, tjanstMigrations } from './tjanst-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261020110000_tjanst_personal_self.sql';
const PREREQUISITES = tjanstMigrations.slice(0, tjanstMigrations.indexOf(OWN));
const sourceFiles = [OWN, 'work/pilot/verify-tjanst-personal.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs',
  'work/pilot/ephemeral-supabase-stubs.sql', 'supabase/tests/phase51_tjanst_hash_vectors.json'];
const sources = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const sql = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_tjanst_personal_rollback');
const DENY = '\n perform public.phase51_deny_self();';
/** Elevfunktionerna med spärren, som signatur för pg_get_functiondef. */
const PUPIL_FUNCTIONS = ['phase4_validate_selection(jsonb)', 'phase4_list_pupils(jsonb)', 'phase4_register_selection()', 'phase3_probe_scope()', 'phase4_card_row(jsonb)',
  'phase4_pupil_card(jsonb)', 'phase4_pupil_history(jsonb)', 'phase4_export_pupils(jsonb,boolean)', 'phase4_reveal_personal_number(jsonb)'];
const ENTRYPOINTS = ['tjanst_personal_read(jsonb)', 'tjanst_personal_command(jsonb)', 'tjanst_personal_status(jsonb)'];
const HELPERS = ['tjanst_journal_guard()', 'tjanst_uuid(jsonb)', 'tjanst_canonical(jsonb,integer)', 'tjanst_hash(jsonb)', 'tjanst_actor(text)', 'tjanst_audit_details(jsonb)',
  'tjanst_audit(text,text,uuid,jsonb)', 'tjanst_binding_audit(access_assignments,uuid,text,jsonb)', 'tjanst_capacity_check(uuid)',
  'phase51_bind_self_person(access_assignments,uuid,uuid,uuid,uuid[])', 'tjanst_command_ref(jsonb,text)', 'tjanst_personal_parse(jsonb)',
  'tjanst_duty_json(staff_school_duties)', 'tjanst_person_json(staff_people,uuid)', 'tjanst_personal_projection(access_assignments,uuid,uuid)',
  'tjanst_lock_person(access_assignments,uuid,integer)', 'phase51_deny_self()'];
/** TJANST-07: exakta kolumner; inga personnummer, avtal, arbetstidsramar eller bedömningar. */
const COLUMNS = {
  staff_people: ['id', 'customer_id', 'organizer_id', 'given_name', 'family_name', 'external_id', 'external_id_source', 'status', 'proposed_for_unit_id', 'draft_note', 'revision', 'created_at', 'updated_at'],
  staff_employments: ['id', 'customer_id', 'organizer_id', 'staff_person_id', 'percent', 'starts_on', 'ends_on', 'created_at', 'updated_at'],
  staff_school_duties: ['id', 'customer_id', 'organizer_id', 'staff_person_id', 'employment_id', 'unit_id', 'percent', 'starts_on', 'ends_on', 'created_at', 'updated_at'],
  staff_person_bindings: ['id', 'staff_person_id', 'membership_id', 'customer_id', 'organizer_id', 'access_assignment_id', 'bound_by_assignment_id', 'bound_at', 'ended_at'],
  tjanst_commands: ['command_id', 'family', 'action', 'customer_id', 'organizer_id', 'target', 'actor_identity_id', 'assignment_id', 'request', 'envelope', 'created_at'],
};

async function fingerprint(db) {
  const parts = await Promise.all([
    db`select p.oid::regprocedure::text s,md5(pg_get_functiondef(p.oid)) d,coalesce(p.proacl::text,'') acl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`,
    db`select c.relname,c.relkind,coalesce(c.relacl::text,'') acl,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='public'::regnamespace order by 1`,
    db`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) t,a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by 1,2`,
    db`select conrelid::regclass::text r,conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='public'::regnamespace order by 1,2`,
    db`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 1,2`,
    db`select tgrelid::regclass::text r,tgname,pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) order by 1,2`,
    db`select * from pg_policies where schemaname='public' order by tablename,policyname`]);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
const functionDefs = async (db, signatures) => Object.fromEntries((await db`select p.oid::regprocedure::text s,pg_get_functiondef(p.oid) d,coalesce(p.proacl::text,'') acl
  from pg_proc p where p.oid = any(${signatures.map(s => 'public.' + s)}::regprocedure[]) order by 1`).map(r => [r.s, { d: r.d, acl: r.acl }]));

function check(report, name, detail) { report.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
async function deny(tx, report, name, fn, codes, hint) {
  let error;
  try { await tx.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial');
  assert.ok(codes.includes(error.code), `${name}: got ${error.code} ${error.message}`);
  if (hint !== undefined) assert.equal(error.hint, hint, name + ': hint');
  check(report, name, { code: error.code, ...(error.hint ? { hint: error.hint } : {}) });
  return error;
}
const without = (value, keys) => JSON.parse(JSON.stringify(value, (k, v) => keys.includes(k) ? undefined : v));
const selection = (f, extra = {}) => ({ schoolYear: 2026, unitId: f.schools.A, classId: null, educationId: null, grade: null, status: null, page: 1, ...extra });
const card = (pupilId, extra = {}) => ({ pupilId, schoolYear: 2026, caseId: null, ...extra });
/** Alla nio elevfunktioner, som Worker anropar dem (de två interna anropas direkt som ägare). */
const PUPIL_CALLS = {
  'phase4_validate_selection(jsonb)': (t, f) => t`select public.phase4_validate_selection(${t.json(selection(f))}) value`,
  'phase4_list_pupils(jsonb)': (t, f) => t`select public.phase4_list_pupils(${t.json({ selection: selection(f), search: '', caseId: null })}) value`,
  'phase4_register_selection()': t => t`select public.phase4_register_selection() value`,
  'phase3_probe_scope()': t => t`select public.phase3_probe_scope() value`,
  'phase4_card_row(jsonb)': (t, f) => t`select to_jsonb(r) value from public.phase4_card_row(${t.json(card(f.pupils.inGroup))}) r`,
  'phase4_pupil_card(jsonb)': (t, f) => t`select public.phase4_pupil_card(${t.json(card(f.pupils.inGroup))}) value`,
  'phase4_pupil_history(jsonb)': (t, f) => t`select public.phase4_pupil_history(${t.json(card(f.pupils.inGroup, { page: 1 }))}) value`,
  'phase4_export_pupils(jsonb,boolean)': (t, f) => t`select public.phase4_export_pupils(${t.json({ mode: 'ids', ids: [f.pupils.inGroup], schoolYear: 2026, caseId: null, fields: ['id', 'displayName'], protectedIds: [], includePersonalNumber: false })},true) value`,
  'phase4_reveal_personal_number(jsonb)': (t, f) => t`select public.phase4_reveal_personal_number(${t.json(card(f.pupils.inGroup))}) value`,
};
/** Gruppmandatets och rektorns elevomfattning; samma anrop före och efter migrationen. */
async function pupilOutcomes(db, f) {
  const out = {};
  try {
    await db.begin(async tx => {
      for (const role of ['teacherGroup', 'principalA', 'admin']) {
        await f.actor(tx, role);
        for (const [name, call] of Object.entries(PUPIL_CALLS)) {
          try { out[`${role} ${name}`] = { ok: without(await tx.savepoint(t => call(t, f)), ['serverNow']) }; }
          catch (e) { out[`${role} ${name}`] = { code: e.code }; }
        }
        try { out[`${role} card outside group`] = { ok: without(await tx.savepoint(t => t`select public.phase4_pupil_card(${t.json(card(f.pupils.outside))}) value`), ['serverNow']) }; }
        catch (e) { out[`${role} card outside group`] = { code: e.code }; }
      }
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
  return out;
}
const dutySum = async (t, personId, on) => (await t`select coalesce(sum(percent),0)::int n from public.staff_school_duties where staff_person_id=${personId} and starts_on<=${on} and (ends_on is null or ends_on>=${on})`)[0].n;
const auditCount = async (t, action, objectId) => (await t`select count(*)::int n from public.security_events where action=${action} and (${objectId}::uuid is null or object_id=${objectId})`)[0].n;

async function matrix(tx, report, f) {
  const { id, actor, schools } = f;
  // --- Spår: person utan konto, anställning 100 %, andelar 60 % (A) + 40 % (B), self och nekad elevlista.
  await actor(tx, 'hm');
  const q1 = createPerson('Syntetisk', 'Lärare Ett', { id: 'SYN-0001', source: 'syntetisk-källa' });
  const created = await personalCommand(tx, q1);
  assert.deepEqual(Object.keys(created).sort(), ['actor', 'contractVersion', 'result']);
  assert.equal(created.contractVersion, 'tjanst_sql_v1');
  const hmAssignment = f.roles.hm, hmIdentity = f.identity('hm');
  assert.deepEqual(created.actor, { identityId: hmIdentity, assignmentId: hmAssignment });
  assert.deepEqual(Object.keys(created.result).sort(), ['detail', 'receipt']);
  check(report, 'kommandosvaret har omslaget {contractVersion: tjanst_sql_v1, actor: sessionens identitet och uppdrag, result: {receipt, detail}}');
  const p1 = created.result.receipt.personId;
  assert.equal(created.result.receipt.revision, 1); assert.equal(created.result.receipt.replayed, false);
  assert.equal(created.result.detail.scope, 'organizer'); assert.equal(created.result.detail.unitId, null);
  assert.ok(created.result.detail.people.some(p => p.id === p1 && p.status === 'active'));
  assert.equal((await tx`select count(*)::int n from public.staff_person_bindings where staff_person_id=${p1}`)[0].n, 0);
  check(report, 'person utan konto skapad av huvudmannen (revision 1, ingen bindning, huvudmannens hela vy som detalj)');
  const replay = await personalCommand(tx, q1);
  assert.equal(replay.result.receipt.replayed, true); assert.equal(replay.result.receipt.personId, p1);
  check(report, 'återspelning med samma commandId och begäran ger replayed och samma person');
  await deny(tx, report, 'ändrad begäran med samma commandId ger 40001', t => personalCommand(t, { ...q1, payload: { ...q1.payload, familyName: 'Annan' } }), ['40001'], 'tjanst_command_conflict');
  const employed = await personalCommand(tx, saveEmployment(p1, 1, 100, '2026-07-01'));
  const e1 = employed.result.detail.people.find(p => p.id === p1).employments[0];
  assert.equal(e1.percent, 100); assert.equal(employed.result.receipt.revision, 2);
  check(report, 'anställning 100 % sparad (revision 2)');
  const duties = await personalCommand(tx, saveDuties(p1, 2, e1.id, [{ unitId: schools.A, percent: 60, startsOn: '2026-07-01' }, { unitId: schools.B, percent: 40, startsOn: '2026-07-01' }]));
  const stored = (await tx`select id,unit_id,percent from public.staff_school_duties where staff_person_id=${p1} order by percent desc`);
  assert.deepEqual(stored.map(r => [r.unit_id, r.percent]), [[schools.A, 60], [schools.B, 40]]);
  assert.equal(await dutySum(tx, p1, '2026-09-01'), 100); assert.equal(duties.result.receipt.revision, 3);
  check(report, 'andelar 60 % (A) + 40 % (B) av 100 % sparade exakt som heltal (SS 12000 dutyPercent 60/40)');
  const updated = await personalCommand(tx, { commandId: randomUUID(), action: 'update_person', expectedRevision: 3,
    payload: { personId: p1, givenName: 'Syntetisk', familyName: 'Lärare Ettan', externalId: 'SYN-0001', externalIdSource: 'syntetisk-källa' } });
  assert.equal(updated.result.receipt.personId, p1); assert.equal(updated.result.receipt.revision, 4);
  assert.equal((await tx`select count(*)::int n from public.staff_school_duties where staff_person_id=${p1}`)[0].n, 2);
  check(report, 'person-ID och andelar består efter ändrade personuppgifter (SS 12000 Person.id stabilt)');

  const self = await grantSelf(tx, f, { unitIds: [schools.A], staffPersonId: p1 });
  const bindings = await tx`select * from public.staff_person_bindings where staff_person_id=${p1}`;
  assert.equal(bindings.length, 1); assert.equal(bindings[0].membership_id, f.membership('teacherSelf')); assert.equal(bindings[0].access_assignment_id, self);
  assert.equal(bindings[0].bound_by_assignment_id, f.roles.principalA); assert.equal(bindings[0].ended_at, null);
  const boundEvents = await tx`select actor_identity_id,assignment_id,details from public.security_events where action='tjanst_person_bound' and object_id=${bindings[0].id}`;
  assert.equal(boundEvents.length, 1); assert.equal(boundEvents[0].assignment_id, f.roles.principalA); assert.equal(boundEvents[0].actor_identity_id, f.identity('principalA'));
  assert.deepEqual(boundEvents[0].details, { personId: p1, membershipId: f.membership('teacherSelf'), assignmentId: self });
  const selfRow = (await tx`select function,scope_kind from public.access_assignments where id=${self}`)[0];
  assert.deepEqual([selfRow.function, selfRow.scope_kind], ['larare', 'self']);
  assert.equal((await tx`select count(*)::int n from public.mandate_groups where assignment_id=${self}`)[0].n, 0);
  check(report, 'self-mandat för A skapar exakt en bindning person–medlemskap och en audit-rad, utan grupper');
  await actor(tx, 'teacherSelf');
  assert.equal((await tx`select public.phase3_mandate_is_valid(${self}) v`)[0].v, true);
  await deny(tx, report, 'phase4_list_pupils med self ger 42501', t => PUPIL_CALLS['phase4_list_pupils(jsonb)'](t, f), ['42501']);

  // --- Full elevspärr.
  for (const [name, call] of Object.entries(PUPIL_CALLS)) await deny(tx, report, `self nekas i ${name} (42501)`, t => call(t, f), ['42501']);
  await deny(tx, report, 'self når inte personalläsningen (42501)', t => personalRead(t, { unitId: schools.A }), ['42501']);

  // --- Mandatformen.
  await actor(tx, 'hm');
  const p3 = await staffWithDuties(tx, f, { familyName: 'Lärare Tre', duties: [{ unitId: schools.A, percent: 50, startsOn: '2026-07-01' }] });
  const selfPayload = extra => ({ membershipId: f.membership('teacherSelf3'), function: 'larare', scopeKind: 'self', unitIds: [schools.A], staffPersonId: p3.personId, ...extra });
  await deny(tx, report, 'self-mandat med grupp nekas (42501)', t => f.grant(t, 'principalA', selfPayload({ groups: [{ id: f.classes.group, kind: 'teaching' }] })), ['42501']);
  await deny(tx, report, 'self-mandat med elev nekas (42501)', t => f.grant(t, 'principalA', selfPayload({ pupilIds: [f.pupils.inGroup] })), ['42501']);
  await tx`insert into public.phase3_probe_cases values(${id(70)},${f.pupils.inGroup},${id(1)},${schools.A})`;
  await deny(tx, report, 'self-mandat med ärende nekas (42501)', t => f.grant(t, 'principalA', selfPayload({ caseIds: [id(70)] })), ['42501']);
  for (const fn of ['administrator', 'elevhalsa']) await deny(tx, report, `self för funktionen ${fn} nekas (42501)`, t => f.grant(t, 'principalA', selfPayload({ function: fn })), ['42501']);
  await deny(tx, report, 'self för rektor nekas (42501)', t => f.grant(t, 'hm', selfPayload({ function: 'rektor' })), ['42501']);
  await deny(tx, report, 'self utan staffPersonId nekas (22023)', t => f.grant(t, 'principalA', selfPayload({ staffPersonId: undefined })), ['22023']);
  await deny(tx, report, 'staffPersonId på gruppmandat nekas (22023)', t => f.grant(t, 'principalA', selfPayload({ scopeKind: 'group', groups: [{ id: f.classes.group, kind: 'teaching' }] })), ['22023']);
  await deny(tx, report, 'staffPersonId utan skoluppdrag på mandatets skola nekas (22023)', t => f.grant(t, 'principalAB', selfPayload({ unitIds: [schools.A, schools.B] })), ['22023'], 'tjanst_person_not_at_school');
  const p4 = await staffWithDuties(tx, f, { familyName: 'Lärare Fyra', duties: [{ unitId: schools.A, percent: 50, startsOn: '2026-07-01', endsOn: '2026-12-31' }] });
  await deny(tx, report, 'skoluppdrag som inte överlappar mandatets giltighet nekas (22023)', t => f.grant(t, 'principalA', selfPayload({ staffPersonId: p4.personId, validFrom: '2027-01-01' })), ['22023'], 'tjanst_person_not_at_school');
  await actor(tx, 'foreignHm');
  const foreign = await personalCommand(tx, createPerson('Syntetisk', 'Främmande'));
  await deny(tx, report, 'person hos en annan huvudman kan inte bindas (42501)', t => f.grant(t, 'principalA', selfPayload({ staffPersonId: foreign.result.receipt.personId })), ['42501']);
  await deny(tx, report, 'tabellvillkoret nekar self för annan funktion än larare', t => t`update public.access_assignments set function='administrator' where id=${self}`, ['23514']);
  await deny(tx, report, 'en person som redan är bunden till ett annat konto med gällande mandat nekas (42501)', t => grantSelf(t, f, { teacher: 'teacherSelf2', unitIds: [schools.A], staffPersonId: p1 }), ['42501']);
  await actor(tx, 'principalA'); await tx`select public.phase3_revoke_mandate(${self})`;
  const self2 = await grantSelf(tx, f, { teacher: 'teacherSelf2', unitIds: [schools.A], staffPersonId: p1 });
  const after = await tx`select membership_id,access_assignment_id,ended_at is null active from public.staff_person_bindings where staff_person_id=${p1} order by bound_at,id`;
  assert.deepEqual(after.map(b => [b.membership_id, b.active]), [[f.membership('teacherSelf'), false], [f.membership('teacherSelf2'), true]]);
  assert.equal(await auditCount(tx, 'tjanst_binding_ended', null) >= 1, true);
  check(report, 'när det tidigare mandatet har upphört avslutas den gamla bindningen i samma transaktion och den nya auditeras', { activeAssignment: self2 === after[1].access_assignment_id });
  await deny(tx, report, 'bindningen kan inte ändras eller tas bort, bara avslutas', t => t`update public.staff_person_bindings set membership_id=${f.membership('teacherSelf3')} where staff_person_id=${p1} and ended_at is null`, ['42501']);

  // --- Kapacitet (D-12).
  await actor(tx, 'hm');
  await deny(tx, report, '60 % + 50 % av 100 % nekas', t => personalCommand(t, saveDuties(p1, 4, e1.id, [{ dutyId: stored[0].id, unitId: schools.A, percent: 60, startsOn: '2026-07-01' }, { unitId: schools.B, percent: 50, startsOn: '2026-07-01' }])), ['22023'], 'tjanst_capacity_exceeded');
  assert.equal(await dutySum(tx, p1, '2026-09-01'), 100);
  const p2 = await staffWithDuties(tx, f, { familyName: 'Lärare Två', startsOn: '2026-01-01', endsOn: '2026-12-31', duties: [{ unitId: schools.A, percent: 10, startsOn: '2026-01-01', endsOn: '2026-12-31' }] });
  await deny(tx, report, 'överlapp per datum: 60 % jan–jun + 50 % apr–dec nekas', t => personalCommand(t, saveDuties(p2.personId, p2.revision, p2.employmentId, [
    { unitId: schools.A, percent: 60, startsOn: '2026-01-01', endsOn: '2026-06-30' }, { unitId: schools.B, percent: 50, startsOn: '2026-04-01', endsOn: '2026-12-31' }])), ['22023'], 'tjanst_capacity_exceeded');
  const split = await personalCommand(tx, saveDuties(p2.personId, p2.revision, p2.employmentId, [
    { unitId: schools.A, percent: 60, startsOn: '2026-01-01', endsOn: '2026-03-31' }, { unitId: schools.B, percent: 50, startsOn: '2026-04-01', endsOn: '2026-12-31' }]));
  assert.equal(split.result.receipt.revision, p2.revision + 1);
  assert.equal((await tx`select count(*)::int n from public.staff_school_duties where staff_person_id=${p2.personId}`)[0].n, 2);
  check(report, 'överlapp per datum: 60 % jan–mar + 50 % apr–dec godkänns och ersätter tidigare andelar');
  const p1Revision = (await tx`select revision from public.staff_people where id=${p1}`)[0].revision;
  await deny(tx, report, 'sänkt grad under befintliga andelar nekas', t => personalCommand(t, saveEmployment(p1, p1Revision, 90, '2026-07-01', null, e1.id)), ['22023'], 'tjanst_capacity_exceeded');
  await deny(tx, report, 'förkortad anställning som lämnar andelar utanför perioden nekas', t => personalCommand(t, saveEmployment(p2.personId, p2.revision + 1, 100, '2026-01-01', '2026-06-30', p2.employmentId)), ['22023'], 'tjanst_invalid');
  await deny(tx, report, 'överlappande anställning för samma person nekas', t => personalCommand(t, saveEmployment(p1, p1Revision, 20, '2027-01-01')), ['22023'], 'tjanst_employment_overlap');
  const sequential = await personalCommand(tx, saveEmployment(p2.personId, p2.revision + 1, 50, '2027-01-01'));
  assert.equal(sequential.result.detail.people.find(p => p.id === p2.personId).employments.length, 2);
  check(report, 'en senare anställning utan överlapp godkänns');
  await deny(tx, report, 'inaktuell revision ger 40001', t => personalCommand(t, saveEmployment(p1, p1Revision - 1, 100, '2026-07-01', null, e1.id)), ['40001'], 'tjanst_revision_conflict');
  await deny(tx, report, 'andel på en skola utanför huvudmannens mandat nekas (42501)', t => personalCommand(t, saveDuties(p1, p1Revision, e1.id, [{ unitId: schools.foreign, percent: 10, startsOn: '2026-07-01' }])), ['42501']);
  await deny(tx, report, 'okänd nyckel i payload nekas (22023)', t => personalCommand(t, { ...createPerson('Syntetisk', 'Fel'), payload: { ...createPerson('a', 'b').payload, personnummer: 'x' } }), ['22023'], 'tjanst_invalid');

  // --- Rektors skolvy (D-11).
  const hmView = await personalRead(tx);
  const hmP1 = hmView.people.find(p => p.id === p1);
  assert.equal(hmView.scope, 'organizer'); assert.equal(hmP1.employments.length, 1); assert.deepEqual(hmP1.duties.map(d => d.percent).sort(), [40, 60]);
  assert.deepEqual(hmView.actions, ['create_person', 'update_person', 'save_employment', 'save_duties']); assert.deepEqual(hmView.capabilities, { canManage: true, canCreateDraft: false });
  check(report, 'huvudmannen läser anställning och alla andelar för hela huvudmannen');
  await actor(tx, 'principalB');
  const bView = await personalRead(tx, { unitId: schools.B });
  const bP1 = bView.people.find(p => p.id === p1);
  assert.equal(bView.scope, 'unit'); assert.equal(bView.unitId, schools.B); assert.deepEqual(bP1.employments, []);
  assert.deepEqual(bP1.duties.map(d => [d.unitId, d.percent]), [[schools.B, 40]]);
  const bText = JSON.stringify(bView);
  assert.ok(!bText.includes(schools.A) && !bText.includes('Syntetisk skola A') && !bText.includes(e1.id) && !/"percent":(60|100)\b/u.test(bText));
  assert.deepEqual(bView.actions, ['create_draft_teacher']); assert.deepEqual(bView.capabilities, { canManage: false, canCreateDraft: true });
  check(report, 'rektor B ser bara 40 % och ingen andel, summa, anställning eller skolnamn från A');
  await deny(tx, report, 'rektor B läser inte skola A (42501)', t => personalRead(t, { unitId: schools.A }), ['42501']);
  await deny(tx, report, 'rektor utan skola i begäran nekas (42501)', t => personalRead(t, {}), ['42501']);
  await actor(tx, 'principalAB');
  const abA = await personalRead(tx, { unitId: schools.A }), abB = await personalRead(tx, { unitId: schools.B });
  assert.deepEqual(abA.people.find(p => p.id === p1).duties.map(d => [d.unitId, d.percent]), [[schools.A, 60]]);
  assert.deepEqual(abB.people.find(p => p.id === p1).duties.map(d => [d.unitId, d.percent]), [[schools.B, 40]]);
  check(report, 'rektor AB ser 60 % på A och 40 % på B som egna skolposter');

  // --- Utkastlärare (D-19).
  await actor(tx, 'principalA');
  const draftQ = { commandId: randomUUID(), action: 'create_draft_teacher', expectedRevision: 0, payload: { unitId: schools.A, givenName: 'Syntetisk', familyName: 'Utkast', draftNote: 'Behov i matematik' } };
  const draft = await personalCommand(tx, draftQ);
  assert.deepEqual(draft.actor, { identityId: f.identity('principalA'), assignmentId: f.roles.principalA });
  assert.equal(draft.result.detail.scope, 'unit'); assert.equal(draft.result.detail.unitId, schools.A);
  const draftPerson = draft.result.detail.people.find(p => p.id === draft.result.receipt.personId);
  assert.equal(draftPerson.status, 'draft'); assert.equal(draftPerson.proposedForUnitId, schools.A); assert.equal(draft.result.receipt.revision, 1);
  check(report, 'rektor lägger upp en utkastlärare för sin skola; detaljen är skolvyn för kommandots skola');
  await deny(tx, report, 'rektor lägger inte upp utkast på annan skola (42501)', t => personalCommand(t, { ...draftQ, commandId: randomUUID(), payload: { ...draftQ.payload, unitId: schools.B } }), ['42501']);
  await deny(tx, report, 'rektor skapar inte personal direkt (42501)', t => personalCommand(t, createPerson('Syntetisk', 'Direkt')), ['42501']);
  await deny(tx, report, 'rektor sparar inte anställning (42501)', t => personalCommand(t, saveEmployment(p1, p1Revision, 100, '2026-07-01', null, e1.id)), ['42501']);
  await actor(tx, 'principalB');
  assert.ok(!(await personalRead(tx, { unitId: schools.B })).people.some(p => p.id === draftPerson.id));
  check(report, 'utkastläraren syns inte för rektor på en annan skola');
  await actor(tx, 'hm');
  await deny(tx, report, 'huvudmannen lägger inte upp utkastlärare (42501, plan 03)', t => personalCommand(t, { ...draftQ, commandId: randomUUID() }), ['42501']);
  const activated = await personalCommand(tx, saveEmployment(draftPerson.id, 1, 50, '2026-08-01'));
  assert.equal(activated.result.detail.people.find(p => p.id === draftPerson.id).status, 'active');
  check(report, 'huvudmannens första sparade anställning gör utkastpersonen aktiv');

  // --- Status.
  const statusRef = personalRef(q1);
  const completed = await personalStatus(tx, { command: statusRef });
  assert.equal(completed.contractVersion, 'tjanst_sql_v1'); assert.deepEqual(completed.actor, { identityId: hmIdentity, assignmentId: hmAssignment });
  assert.equal(completed.result.state, 'completed'); assert.equal(completed.result.result.receipt.replayed, true); assert.equal(completed.result.result.receipt.personId, p1);
  const missing = await personalStatus(tx, { command: { ...statusRef, commandId: randomUUID() } });
  assert.deepEqual(missing.result, { state: 'not_found', result: null });
  check(report, 'status: completed med samma kvitto (replayed) och not_found för okänt kommando, i samma omslag');
  await deny(tx, report, 'status med ändrad referens ger 40001', t => personalStatus(t, { command: { ...statusRef, action: 'update_person' } }), ['40001'], 'tjanst_command_conflict');
  await actor(tx, 'principalA');
  await deny(tx, report, 'främmande aktör i status nekas (40001)', t => personalStatus(t, { command: statusRef }), ['40001'], 'tjanst_command_conflict');
  const draftStatus = await personalStatus(tx, { command: personalRef(draftQ) });
  assert.equal(draftStatus.result.result.detail.scope, 'unit');
  await actor(tx, 'teacherGroup');
  await deny(tx, report, 'lärare når inte personalfamiljen (42501)', t => personalStatus(t, { command: statusRef }), ['42501']);

  // --- Audit, journal och direkta skrivningar.
  await actor(tx, 'hm');
  assert.ok(await auditCount(tx, 'tjanst_person_created', p1) === 1 && await auditCount(tx, 'tjanst_personal_read', null) >= 1);
  const details = await tx`select details from public.security_events where action like 'tjanst_%' and customer_id=${id(1)}`;
  assert.ok(details.every(r => !JSON.stringify(r.details).includes('Lärare') && !JSON.stringify(r.details).includes('Behov')));
  check(report, 'audit-rader har bara referenser, inga namn eller fritext');
  await deny(tx, report, 'audit-fel ger 55000 utan skrivning', async t => {
    await t`alter table public.security_events add constraint tjanst_audit_fault check (action<>'tjanst_person_created') not valid`;
    await personalCommand(t, createPerson('Syntetisk', 'Auditfel'));
  }, ['55000']);
  assert.equal((await tx`select count(*)::int n from public.staff_people where family_name='Auditfel'`)[0].n, 0);
  await deny(tx, report, 'kommandojournalen är oföränderlig', t => t`update public.tjanst_commands set action='create_person' where command_id=${q1.commandId}`, ['42501']);
  for (const role of ['authenticated', 'skolplattform_worker']) {
    await deny(tx, report, `direkt tabellskrivning nekas för ${role}`, async t => {
      await t.unsafe(`set local role ${role}`);
      await t`insert into public.staff_people(customer_id,organizer_id,given_name,family_name,status,revision) values(${id(1)},${id(2)},'X','Y','active',1)`;
    }, ['42501']);
    await deny(tx, report, `personalfunktionerna är stängda för ${role} före grant-migrationen`, async t => {
      await t.unsafe(`set local role ${role}`); await personalRead(t, {});
    }, ['42501']);
  }
}

/** D-12 vid samtidighet: två anslutningar mot committade fixturer i den ägda databasen. */
async function concurrency(db, connect, report, f) {
  const base = await db.begin(t => staffWithDuties(t, f, { familyName: 'Samtidig', duties: [{ unitId: f.schools.A, percent: 60, startsOn: '2026-07-01' }] }));
  const dutyA = base.person.duties[0].id;
  const c1 = await connect(), c2 = await connect();
  const waiting = async () => { for (let i = 0; i < 100; i++) {
    const [w] = await db`select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and state='active'`;
    if (w.n > 0) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
  const race = async (first, second) => {
    let release; const gate = new Promise(r => { release = r; }); let held;
    const heldReady = new Promise(r => { held = r; });
    const p1 = c1.begin(async t => { await f.actor(t, 'hm'); const v = await personalCommand(t, first); held(); await gate; return v; });
    await heldReady;
    const p2 = c2.begin(async t => { await f.actor(t, 'hm'); return personalCommand(t, second); });
    const blocked = await waiting(); release();
    const results = await Promise.allSettled([p1, p2]);
    return { blocked, results: results.map(r => r.status === 'fulfilled' ? { ok: true, revision: r.value.result.receipt.revision } : { ok: false, code: r.reason.code, hint: r.reason.hint }) };
  };
  const first = await race(saveDuties(base.personId, base.revision, base.employmentId, [{ dutyId: dutyA, unitId: f.schools.A, percent: 60, startsOn: '2026-07-01' }, { unitId: f.schools.B, percent: 40, startsOn: '2026-07-01' }]),
    saveDuties(base.personId, base.revision, base.employmentId, [{ dutyId: dutyA, unitId: f.schools.A, percent: 60, startsOn: '2026-07-01' }, { unitId: f.schools.B, percent: 50, startsOn: '2026-07-01' }]));
  assert.equal(first.blocked, true); assert.equal(first.results.filter(r => r.ok).length, 1); assert.equal(first.results[0].ok, true);
  assert.equal(first.results[1].code, '40001');
  assert.equal(await dutySum(db, base.personId, '2026-09-01'), 100);
  check(report, 'samtidiga andelar: 40 % och 50 % sparas från två anslutningar; exakt ett lyckat och ett nekat kommando, slutsumman 100 %', first);
  // Den andra fliken har redan läst den nya revisionen: den sänkta graden prövas mot de andelar som den första committade.
  const second = await race(saveDuties(base.personId, base.revision + 1, base.employmentId, (await db`select id,unit_id,percent,starts_on from public.staff_school_duties where employment_id=${base.employmentId} order by percent desc`)
    .map(d => ({ dutyId: d.id, unitId: d.unit_id, percent: d.percent, startsOn: '2026-07-01' }))),
    saveEmployment(base.personId, base.revision + 2, 80, '2026-07-01', null, base.employmentId));
  assert.equal(second.blocked, true); assert.equal(second.results[0].ok, true);
  assert.deepEqual(second.results[1], { ok: false, code: '22023', hint: 'tjanst_capacity_exceeded' });
  assert.equal((await db`select percent from public.staff_employments where id=${base.employmentId}`)[0].percent, 100);
  check(report, 'samtidig sänkt grad prövas efter låset mot den andra anslutningens committade andelar och nekas', second);
}

export async function verifyTjanstPersonal(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-personal-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    decision: 'Användarbeslut 2026-10-19, alternativ A: self bara för larare utan grupper, elever och ärenden; bindningen skapas och auditeras när mandatet ges; alla elevfunktioner nekar self med 42501',
    limitations: ['Own database and synthetic fixtures only; no installed target written', 'No HTTP/OIDC/browser claim; Worker grants come in plan 09',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target' : 'Schema-only copy of the protected local target',
      'Self mandate via invitation (phase3_validate/redeem_invitation) shares phase3_insert_mandate but is not exercised here',
      'SS 12000: Person/Duty mapping is intended compatibility, no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist();
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: tjanstMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end, connect: async () => e.connect() };
    } else {
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); }, connect: s.connect };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname like 'tjanst_%' or proname='phase51_deny_self'`)[0].n, 0, 'Personnel migration already present');
    // Tidigare 05.1-migrationer (som ännu inte är installerade) läggs in först i den egna databasen.
    for (const p of PREREQUISITES) await db.begin(tx => tx.unsafe(sql(p)));
    report.prerequisites = PREREQUISITES;
    const f = await db.begin(createTjanstFixture);
    const vectors = JSON.parse(sql('supabase/tests/phase51_tjanst_hash_vectors.json')).vectors;
    const baseline = { fingerprint: await fingerprint(db), rows: await allPublicHashes(db), pupil: await functionDefs(db, PUPIL_FUNCTIONS) };
    const outcomesBefore = await pupilOutcomes(db, f);
    assert.ok(outcomesBefore['teacherGroup phase4_list_pupils(jsonb)'].ok, 'group teacher baseline lists pupils');
    assert.equal(outcomesBefore['teacherGroup card outside group'].code, 'P0002');
    try { await db.begin(async tx => { await tx.unsafe(sql(OWN)); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await fingerprint(db), baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'återrullning av migrationen återställer exakt schema, ACL och alla rader');
    await db.begin(tx => tx.unsafe(sql(OWN)));
    const installedRows = await allPublicHashes(db);
    for (const [table, value] of Object.entries(baseline.rows)) assert.deepEqual(installedRows[table], value, table);
    for (const table of Object.keys(COLUMNS)) assert.equal(installedRows[table].count, 0, table);
    check(report, 'installation i den egna databasen lämnar alla befintliga rader orörda');
    const pupilAfter = await functionDefs(db, PUPIL_FUNCTIONS);
    for (const fn of PUPIL_FUNCTIONS) {
      const before = baseline.pupil['public.' + fn] ?? baseline.pupil[fn], now = pupilAfter['public.' + fn] ?? pupilAfter[fn];
      assert.ok(before && now, fn);
      assert.equal(now.d.split(DENY).length, 2, fn + ': exactly one denial');
      assert.equal(now.d.replace(DENY, ''), before.d, fn + ': body identical apart from the denial');
      const body = now.d.slice(now.d.indexOf('$', now.d.indexOf(' AS $')));
      assert.match(body, /^\$[a-z]*\$[\s\S]*?\bbegin\n perform public\.phase51_deny_self\(\);/u, fn + ': denial is the first statement');
      assert.equal(now.acl, before.acl, fn + ': ACL');
    }
    check(report, 'elevfunktioner oförändrade: alla nio har identisk pg_get_functiondef och ACL utöver spärren som första sats', { functions: PUPIL_FUNCTIONS });
    const outcomesAfter = await pupilOutcomes(db, f);
    assert.deepEqual(outcomesAfter, outcomesBefore);
    check(report, 'gruppmandat, rektor och administratör får exakt samma svar i alla elevfunktioner före och efter migrationen', { cases: Object.keys(outcomesBefore).length });
    for (const [table, columns] of Object.entries(COLUMNS)) {
      assert.deepEqual((await db`select a.attname from pg_attribute a where a.attrelid=${'public.' + table}::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`).map(r => r.attname), columns, table);
      const [t] = await db`select relrowsecurity r,relforcerowsecurity f from pg_class where oid=${'public.' + table}::regclass`;
      assert.ok(t.r && t.f, table + ' RLS');
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
        assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') v`)[0].v, false, role + table);
    }
    check(report, 'exakt kolumnlista per ny tabell (inga personnummer, avtal, arbetstidsramar eller bedömningar), tvingad RLS och inga klienträttigheter', COLUMNS);
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) for (const fn of [...ENTRYPOINTS, ...HELPERS])
      assert.equal((await db`select has_function_privilege(${role},${'public.' + fn},'EXECUTE') v`)[0].v, false, role + fn);
    check(report, 'alla nya funktioner är stängda för klientroller och Worker tills grant-migrationen (plan 09)');
    for (const v of vectors) {
      const [r] = await db`select public.tjanst_canonical(${db.json(v.input)}) c,public.tjanst_hash(${db.json(v.input)}) h`;
      assert.equal(r.c, v.canonical, v.name); assert.equal(r.h, v.sha256, v.name);
    }
    check(report, 'samtliga hashvektorer ger samma kanoniska form och sha256 i SQL som i TypeScript', { vectors: vectors.length });
    const installed = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='60s'`; await matrix(tx, report, f); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'hela personalprovet rullas tillbaka utan kvarvarande rader');
    await concurrency(db, source.connect, report, f);
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} personnel, capacity, self and pupil-denial SQL checks` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstPersonal(rest[1], { ephemeral });
}
