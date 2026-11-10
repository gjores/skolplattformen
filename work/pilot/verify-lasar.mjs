#!/usr/bin/env node
// 05.1.1-06: läsårskalenderns versioner och tracer i SQL. Egen databas och syntetiska fixturer; inget installerat mål ändras.
//   node work/pilot/verify-lasar.mjs --ephemeral --out /private/tmp/lasar-sql.json   (egen PostgreSQL byggd från migrationerna)
//   node work/pilot/verify-lasar.mjs --out /private/tmp/lasar-sql.json               (schemakopia av det skyddade lokala målet)
// Ingen HTTP/OIDC och ingen Worker; den faktiska kedjan provas i plan 15. Varje beteende är ett namngivet fall i rapporten.
import assert from 'node:assert/strict';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createLasarFixture, createCommand, gymClass, lasarCommand, lasarDecision, lasarRead, lasarSend, lasarStatus, lasarMigrations, resetCommand, school } from './lasar-fixtures.mjs';
import { seedGy25Class } from './tjanst-fixtures.mjs';
import { parseLasarCommandReply, parseLasarDecisionReply, parseLasarEnvelope, parseLasarReadReply, lasarSchoolYear } from '../../web/lib/lasar-contract.ts';
import { lasarContentHash } from '../../web/lib/lasar-content.ts';
import { LASAR_RULE_CODES } from '../../web/lib/lasar-rule-codes.ts';
import { addDays, allIssues, dayInfo, groupSummary, proposeSchoolYear, setTerm, summarize } from '../../web/lib/lasar-model.ts';
import { arskursGroupId, groupsFromRefs, klassGroupId } from '../../web/lib/lasar-groups.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollback = Error('expected_lasar_rollback');
const YEAR = 2027;
/**
 * Funktioner som får nämna school_years (assumption_delta_decision): accessorn, lasar-ingångarna och deras hjälp,
 * triggervakten för dagar och det distinkta läsårsurvalet phase4_register_selection (fas 4, omdefinierat i 05.1; det läser
 * bara vilka läsår som finns). En ny läsare som inte står här gör provet rött; den ska gå via lasar_current eller ange en
 * version uttryckligen.
 */
export const SCHOOL_YEAR_READERS = Object.freeze([
  'guard_school_year_days', 'lasar_command', 'lasar_content_hash', 'lasar_create_proposal', 'lasar_current', 'lasar_detail', 'lasar_group_ref_guard',
  'lasar_history', 'lasar_lock_version', 'lasar_reset_proposal', 'lasar_rules', 'lasar_school_days', 'lasar_set_term', 'phase4_register_selection',
]);
const FORBIDDEN_DEMO = ['sign' + 'InDemo', 'bootstrap_' + 'demo_profile'];

function caseRunner(report) {
  return async function step(t, name, fn) {
    const started = Date.now();
    try { await t.savepoint(fn); report.cases.push({ name, status: 'PASS', ms: Date.now() - started }); }
    catch (e) {
      if (e === rollback) throw e;
      report.cases.push({ name, status: 'FAIL', code: e.code ?? null, hint: e.hint ?? null, message: String(e.message).slice(0, 500) });
    }
  };
}
async function denied(t, fn, code, hint) {
  let error;
  try { await t.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, 'väntat nekande uteblev');
  assert.equal(error.code, code, `${error.code} ${error.hint ?? ''} ${error.message}`);
  if (hint !== undefined) assert.equal(error.hint, hint, error.message);
  return error;
}
const actorOf = (f, name) => ({ identityId: f.identity(name), assignmentId: f.roles[name] });

/** Statiska kontroller av migrationsfilerna och fixturerna (inga databasanrop). */
function staticChecks(report) {
  const file = p => readFileSync(resolve(root, p), 'utf8');
  const record = (name, fn) => { try { fn(); report.cases.push({ name, status: 'PASS' }); } catch (e) { report.cases.push({ name, status: 'FAIL', message: String(e.message).slice(0, 500) }); } };
  record('versionsfilen lägger inte till något enumvärde (Pitfall 1)', () => {
    assert.equal((file(lasarMigrations[0]).match(/add value/giu) ?? []).length, 0);
  });
  record('versionsfilen har inga rättighetssatser; grant-filen bara execute på lasar_read, lasar_command och lasar_status', () => {
    assert.equal(file(lasarMigrations[0]).split('\n').filter(l => !l.startsWith('--') && /grant /iu.test(l)).length, 0);
    const lines = file(lasarMigrations[1]).split('\n').filter(l => l.trim() && !l.startsWith('--'));
    assert.deepEqual(lines, ['grant execute on function public.lasar_read(jsonb) to skolplattform_worker;', 'grant execute on function public.lasar_command(jsonb) to skolplattform_worker;',
      'grant execute on function public.lasar_status(jsonb) to skolplattform_worker;']);
  });
  record('inga demofunktioner i lasar-fixturer och prov', () => {
    for (const p of ['work/pilot/lasar-fixtures.mjs', 'work/pilot/verify-lasar.mjs', 'work/pilot/verify-lasar-groups.mjs']) for (const word of FORBIDDEN_DEMO) assert.ok(!file(p).includes(word), p);
  });
  record('gruppfilen (05.1.1-08) ger inga rättigheter, lägger inte till enumvärden och stänger inte av triggrar', () => {
    const sql = file(lasarMigrations[2]);
    assert.ok(lasarMigrations[2].endsWith('20261112100000_lasar_groups.sql'));
    assert.equal(sql.split('\n').filter(l => !l.trim().startsWith('--') && /\bgrant\b/iu.test(l)).length, 0);
    assert.equal((sql.match(/add value/giu) ?? []).length, 0);
    assert.ok(!/session_replication_role|disable\s+trigger/iu.test(sql));
  });
  record('demons vilande vägar är orörda: database.types.ts och planning-store.ts har kvar group_key (Pitfall 9)', () => {
    assert.ok(file('web/lib/database.types.ts').includes('group_key')); assert.ok(file('web/lib/planning-store.ts').includes('group_key'));
  });
}

async function structure(t, step) {
  await step(t, 'school_year_status har exakt fyra värden (inget ersatt-värde)', async u => {
    assert.equal((await u`select enum_range(null::public.school_year_status)::text v`)[0].v, '{utkast,forslag,atersand,faststalld}');
  });
  await step(t, 'unique (unit_id, start_year) är borttagen; versionsnyckel och partiella index finns', async u => {
    const cons = (await u`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.school_years'::regclass and contype='u' order by 1`).map(r => r.d);
    assert.deepEqual(cons, ['UNIQUE (unit_id, start_year, version)']);
    const idx = (await u`select indexname n, indexdef d from pg_indexes where schemaname='public' and tablename='school_years' and indexname like 'school_years_one_%' order by 1`);
    assert.deepEqual(idx.map(i => i.n), ['school_years_one_current', 'school_years_one_open']);
    assert.ok(idx.every(i => /UNIQUE INDEX/u.test(i.d) && /superseded_by IS NULL/u.test(i.d)));
    const cols = (await u`select attname from pg_attribute where attrelid='public.school_years'::regclass and attnum>0 and not attisdropped order by attnum`).map(r => r.attname);
    for (const c of ['version', 'revision', 'superseded_at', 'superseded_by', 'previous_id', 'content_hash', 'change_reason', 'decision_comment']) assert.ok(cols.includes(c), c);
  });
  await step(t, 'Workern får bara execute på lasar_read, lasar_command och lasar_status; övriga lasar-funktioner är stängda', async u => {
    const rows = await u`select p.oid::regprocedure::text s, has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') w,
      has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') c,
      exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0) pub
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'lasar\\_%' order by 1`;
    assert.ok(rows.length >= 20, String(rows.length));
    assert.deepEqual(rows.filter(r => r.w).map(r => r.s), ['lasar_command(jsonb)', 'lasar_read(jsonb)', 'lasar_status(jsonb)']);
    assert.deepEqual(rows.filter(r => r.c || r.pub).map(r => r.s), []);
  });
  await step(t, 'lasar_commands har tvingad RLS utan policyer och inga rättigheter för Worker eller klientroller', async u => {
    const [rls] = await u`select relrowsecurity r, relforcerowsecurity f from pg_class where oid='public.lasar_commands'::regclass`;
    assert.ok(rls.r && rls.f);
    assert.equal((await u`select count(*)::int n from pg_policy where polrelid='public.lasar_commands'::regclass`)[0].n, 0);
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
      assert.equal((await u`select has_table_privilege(${role},'public.lasar_commands','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') v`)[0].v, false, role);
  });
  await step(t, 'Workerns tabellrättigheter på kalendertabellerna är oförändrade (inga nya)', async u => {
    const rows = await u`select c.relname t, p.priv from pg_class c cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
      where c.relnamespace='public'::regnamespace and c.relname in ('school_years','school_year_days','school_year_group_days','school_year_short_weeks','school_year_events')
       and has_table_privilege('skolplattform_worker',c.oid,p.priv) order by 1,2`;
    assert.deepEqual(rows.map(r => r.t + ':' + r.priv), ['school_year_events:INSERT', 'school_year_events:SELECT', 'school_years:SELECT']);
  });
}

async function invariant(t, step) {
  const readers = async u => [...new Set((await u`select p.proname n from pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ 'school_years' order by 1`).map(r => r.n))];
  await step(t, 'invariant: varje funktion som nämner school_years står i SCHOOL_YEAR_READERS', async u => {
    assert.deepEqual(await readers(u), [...SCHOOL_YEAR_READERS].sort());
  });
  // Provfunktionen finns bara i transaktionen, som alltid rullas tillbaka.
  await step(t, 'invariant: en ny läsare utanför listan gör provet rött', async u => {
    await u.unsafe(`create function public.lasar_probe_reader() returns integer language sql as 'select count(*)::integer from public.school_years'`);
    const found = await readers(u);
    assert.ok(found.includes('lasar_probe_reader'));
    assert.notDeepEqual(found, [...SCHOOL_YEAR_READERS].sort());
  });
}

async function vectors(t, step) {
  const data = JSON.parse(readFileSync(resolve(root, 'supabase/tests/lasar_content_hash_vectors.json'), 'utf8'));
  await step(t, `lasar_content_hash ger hashvektorernas värden (${data.vectors.length} vektorer)`, async u => {
    for (const v of data.vectors) assert.equal((await u`select public.lasar_content_hash_json(${u.json(v.input)}) h`)[0].h, v.sha256, v.name);
  });
}

async function tracer(t, step, f) {
  const A = f.schools.A, B = f.schools.B, C = f.schools.C;
  const env = (raw, name) => parseLasarEnvelope(raw, actorOf(f, name));
  const read = async (name, unitId = A, schoolYear = YEAR, versionId = null) => {
    await f.actor(t, name);
    const q = { target: school(unitId), schoolYear, versionId };
    return parseLasarReadReply(env(await lasarRead(t, q), name), q);
  };
  const send = async (name, q) => { await f.actor(t, name); return parseLasarCommandReply(env(await lasarSend(t, q), name), q); };
  const decide = async (name, q) => { await f.actor(t, name); return parseLasarDecisionReply(env(await lasarSend(t, q), name), q); };
  const basis = async () => (await t`select (public.tjanst_year_core(a,${A},${YEAR}))->'base'->>'basisHash' h from public.access_assignments a where a.id=${f.roles.principalA}`)[0].h;
  const weeks = async (unitId = A, year = YEAR) => (await t`select public.tjanst_school_weeks(${unitId},${year}) w`)[0].w;
  const startsOn = async () => (await t`select public.phase5_programplan_starts_on(o)::text d from public.offerings o where o.id=${f.offerings.gy}`)[0].d;
  const content = c => ({ terms: c.terms, exceptions: c.exceptions, groupDays: c.groupDays, shortWeeks: c.shortWeeks, frameVersionId: c.frameVersionId, version: c.version });
  const s = {};

  await step(t, 'rektor A läser skola A 2027 utan kalender: inget innehåll, förmågan att skapa förslag och skolans skolformer', async () => {
    const r = await read('principalA');
    assert.equal(r.calendar, null); assert.deepEqual(r.versions, []); assert.deepEqual(r.capabilities.canCreate, ['proposal']);
    assert.deepEqual(r.schoolTypes, f.schoolTypes.A); assert.equal(r.schoolName, 'Syntetisk skola A'); assert.equal(r.mode, 'eget');
    s.types = r.schoolTypes; s.basis0 = await basis(); assert.equal(await weeks(), null); assert.equal(await startsOn(), null);
  });
  await step(t, 'rektor A skapar förslag (källan proposal, innehållet framräknat som i servern)', async () => {
    s.create = await createCommand(A, YEAR, s.types);
    s.created = await send('principalA', s.create);
    const c = s.created.detail.calendar;
    assert.equal(c.status, 'utkast'); assert.equal(c.version, 1); assert.equal(c.revision, 1); assert.equal(s.created.receipt.replayed, false);
    assert.deepEqual(c.terms, s.create.proposal.terms); assert.deepEqual(c.exceptions, s.create.proposal.exceptions);
    assert.ok(s.created.detail.capabilities.canEdit && s.created.detail.capabilities.canSubmit); assert.deepEqual(s.created.detail.capabilities.canCreate, []);
    s.versionId = c.versionId;
  });
  await step(t, 'återspelning med samma kommando-id, aktör och begäran ger samma svar utan ny rad', async () => {
    const again = await send('principalA', s.create);
    assert.equal(again.receipt.replayed, true); assert.deepEqual({ ...again, receipt: { ...again.receipt, replayed: false } }, s.created);
    assert.equal((await t`select count(*)::int n from public.school_years where unit_id=${A} and start_year=${YEAR}`)[0].n, 1);
  });
  await step(t, 'samma kommando-id från en annan aktör nekas', async () => {
    await denied(t, async u => { await f.actor(u, 'admin'); await lasarSend(u, s.create); }, '40001', 'lasar_command_conflict');
  });
  await step(t, 'samma kommando-id med en annan kropp nekas', async () => {
    const other = { ...s.create, proposal: { ...s.create.proposal, exceptions: {} } };
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, other); }, '40001', 'lasar_command_conflict');
  });
  await step(t, 'rektor A sparar en lovdag i utkastet', async () => {
    const sy = lasarSchoolYear(s.created.detail);
    let d = `${YEAR}-10-01`; while (dayInfo(sy, d).status !== 'skoldag') d = addDays(d, 1);
    s.day = d;
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 1, ops: [{ op: 'set_days', dates: [d], kind: 'lovdag', note: 'Syntetisk lovdag' }] });
    s.saved = await send('principalA', q);
    assert.equal(s.saved.receipt.revision, 2); assert.deepEqual(s.saved.detail.calendar.exceptions[d], { kind: 'lovdag', note: 'Syntetisk lovdag' });
  });
  await step(t, 'ett sparat utkast ändrar varken basisHash, IM-behovets skoldagar eller programplanens reservstart (Pitfall 3, D-19)', async () => {
    assert.equal(await basis(), s.basis0); assert.equal(await weeks(), null); assert.equal(await startsOn(), null);
  });
  await step(t, 'en gammal revision nekas', async () => {
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 1, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, q); }, '40001', 'lasar_revision_conflict');
  });
  await step(t, 'en payload-hash som inte stämmer med kommandona nekas', async () => {
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 2, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, { ...q, payloadHash: 'sha256:' + '0'.repeat(64) }); }, '22023', 'lasar_payload_hash');
  });
  await step(t, 'huvudmannen kan inte spara dagar i skolans utkast', async () => {
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 2, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'hm'); await lasarSend(u, q); }, '42501');
  });
  await step(t, 'rektor B når inte skola A, varken läsning eller kommando', async () => {
    await denied(t, async u => { await f.actor(u, 'principalB'); await lasarRead(u, { target: school(A), schoolYear: YEAR, versionId: null }); }, '42501');
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 2, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'principalB'); await lasarSend(u, q); }, '42501');
  });
  await step(t, 'en främmande kunds huvudman nekas', async () => {
    await denied(t, async u => { await f.actor(u, 'foreignHm'); await lasarRead(u, { target: school(A), schoolYear: YEAR, versionId: null }); }, '42501');
  });
  await step(t, 'skoladministratören sparar en dag som rektor (D-18)', async () => {
    let d = addDays(s.day, 1); const sy = lasarSchoolYear(s.saved.detail); while (dayInfo(sy, d).status !== 'skoldag') d = addDays(d, 1);
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 2, ops: [{ op: 'set_days', dates: [d], kind: 'studiedag', note: 'Syntetisk studiedag' }] });
    s.adminSaved = await send('admin', q); assert.equal(s.adminSaved.receipt.revision, 3);
  });
  await step(t, 'rektor kan inte fastställa', async () => {
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 3, action: 'approve', text: 'Syntetiskt beslut' })); }, '42501');
  });
  await step(t, 'förslaget kräver en text', async () => {
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 3, action: 'submit', text: '' })); }, '22023', 'lasar_text_required');
  });
  await step(t, 'rektor A skickar förslaget', async () => {
    s.submitted = await decide('principalA', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 3, action: 'submit', text: 'Syntetiskt förslag' }));
    const c = s.submitted.detail.calendar;
    assert.equal(c.status, 'forslag'); assert.equal(c.revision, 4); assert.equal(s.submitted.detail.capabilities.canEdit, false);
    assert.equal(await basis(), s.basis0); assert.equal(await weeks(), null);
  });
  await step(t, 'ett skickat förslag går inte att ändra (kommando och trigger)', async () => {
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 4, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, q); }, '40001', 'lasar_locked_status');
    await denied(t, u => u`delete from public.school_year_days where school_year_id=${s.versionId} and day=${s.day}`, 'P0001');
    await denied(t, u => u`update public.school_years set ht_end=ht_end-1 where id=${s.versionId}`, 'P0001');
  });
  await step(t, 'skoladministratören kan inte fastställa', async () => {
    await denied(t, async u => { await f.actor(u, 'admin'); await lasarSend(u, lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 4, action: 'approve', text: 'Syntetiskt beslut' })); }, '42501');
  });
  await step(t, 'huvudmannen läser förslaget och kan fastställa det', async () => {
    const r = await read('hm');
    assert.equal(r.calendar.status, 'forslag'); assert.equal(r.capabilities.canApprove, true); assert.equal(r.capabilities.canEdit, false); assert.deepEqual(r.capabilities.canCreate, []);
  });
  await step(t, 'huvudmannen fastställer: version 1, beslutsdatum och kontrollsumma lika med TS-hashen', async () => {
    s.approved = await decide('hm', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 4, action: 'approve', text: 'Syntetiskt beslut' }));
    const c = s.approved.detail.calendar;
    assert.equal(c.status, 'faststalld'); assert.equal(c.version, 1); assert.equal(c.revision, 5); assert.ok(c.decidedOn);
    const [row] = await t`select content_hash, public.lasar_content_hash(id) computed, decision_comment from public.school_years where id=${s.versionId}`;
    assert.equal(row.content_hash, await lasarContentHash(content(c))); assert.equal(row.content_hash, row.computed); assert.equal(c.contentHash, row.content_hash);
    assert.equal(row.decision_comment, 'Syntetiskt beslut');
    assert.deepEqual(s.approved.detail.versions, [{ versionId: s.versionId, version: 1, status: 'faststalld', decidedOn: c.decidedOn, current: true }]);
  });
  await step(t, 'tjanst_school_weeks läser exakt den fastställda versionen och ger samma skoldagar som summarize', async () => {
    const sum = summarize(lasarSchoolYear(s.approved.detail), s.types);
    assert.deepEqual(await weeks(), { htSchoolDays: sum.terms.ht.skoldagar, vtSchoolDays: sum.terms.vt.skoldagar });
  });
  await step(t, 'fastställandet ändrar tjänstefördelningens basisHash', async () => {
    s.basis1 = await basis(); assert.notEqual(s.basis1, s.basis0);
  });
  await step(t, 'programplanens reservstart läser den fastställda versionens höststart (D-19)', async () => {
    assert.equal(await startsOn(), s.approved.detail.calendar.terms.ht.start);
  });
  await step(t, 'en fastställd version går inte att ändra (kommando och trigger)', async () => {
    const q = await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.versionId, expectedRevision: 5, ops: [{ op: 'set_days', dates: [s.day], kind: 'skoldag' }] });
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, q); }, '40001', 'lasar_locked_status');
    await denied(t, u => u`insert into public.school_year_days(school_year_id,day,kind) values(${s.versionId},${addDays(s.day, 7)},'lovdag')`, 'P0001');
    await denied(t, u => u`update public.school_years set content_hash=${'sha256:' + '1'.repeat(64)} where id=${s.versionId}`, 'P0001');
  });
  await step(t, 'ett nytt utkast med tidigare höststart ändrar varken reservstart, IM-skoldagar eller basisHash (D-19, Pitfall 3)', async () => {
    const v1 = s.approved.detail.calendar;
    s.v2 = (await t`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,version,previous_id)
      values(${f.id(2)},${A},${YEAR},${addDays(v1.terms.ht.start, -7)},${v1.terms.ht.end},${v1.terms.vt.start},${v1.terms.vt.end},'utkast',2,${s.versionId}) returning id`)[0].id;
    assert.equal(await startsOn(), v1.terms.ht.start);
    const sum = summarize(lasarSchoolYear(s.approved.detail), s.types);
    assert.deepEqual(await weeks(), { htSchoolDays: sum.terms.ht.skoldagar, vtSchoolDays: sum.terms.vt.skoldagar });
    assert.equal(await basis(), s.basis1);
    assert.equal((await t`select (public.lasar_current(${A},${YEAR})).id v`)[0].v, s.versionId);
  });
  await step(t, 'en öppen och en gällande version per skola och läsår', async () => {
    const v1 = s.approved.detail.calendar;
    await denied(t, u => u`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,version) values(${f.id(2)},${A},${YEAR},${v1.terms.ht.start},${v1.terms.ht.end},${v1.terms.vt.start},${v1.terms.vt.end},'utkast',3)`, '23505');
    await denied(t, u => u`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on,version) values(${f.id(2)},${A},${YEAR},${v1.terms.ht.start},${v1.terms.ht.end},${v1.terms.vt.start},${v1.terms.vt.end},'faststalld','2027-05-01',3)`, '23505');
  });
  await step(t, 'version 2 fastställs: version 1 ersätts först, sedan gäller version 2 för läsarna (Pitfall 5)', async () => {
    const sub = await decide('principalA', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v2, expectedRevision: 0, action: 'submit', text: 'Syntetisk ändring' }));
    const ok = await decide('hm', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v2, expectedRevision: sub.receipt.revision, action: 'approve', text: 'Syntetiskt nytt beslut' }));
    assert.deepEqual(ok.detail.versions.map(v => [v.version, v.status, v.current]), [[1, 'faststalld', false], [2, 'faststalld', true]]);
    assert.equal((await t`select (public.lasar_current(${A},${YEAR})).id v`)[0].v, s.v2);
    const sum = summarize(lasarSchoolYear(ok.detail), s.types);
    assert.deepEqual(await weeks(), { htSchoolDays: sum.terms.ht.skoldagar, vtSchoolDays: sum.terms.vt.skoldagar });
    assert.equal(await startsOn(), ok.detail.calendar.terms.ht.start); assert.notEqual(await basis(), s.basis1);
    const old = await read('hm', A, YEAR, s.versionId); assert.equal(old.calendar.versionId, s.versionId); assert.equal(old.versions.find(v => v.version === 1).current, false);
  });
  await step(t, 'en ersatt version går inte att ändra', async () => {
    await denied(t, u => u`update public.school_years set decision_comment='Ändrad' where id=${s.versionId}`, 'P0001');
    await denied(t, u => u`delete from public.school_year_days where school_year_id=${s.versionId}`, 'P0001');
  });
  await step(t, 'färre än 178 skoldagar hindrar förslaget (skola B, bara grundskola, 2027)', async () => {
    const created = await send('principalB', await createCommand(B, YEAR, f.schoolTypes.B));
    const c = created.detail.calendar;
    const error = await denied(t, async u => { await f.actor(u, 'principalB'); await lasarSend(u, lasarDecision({ unitId: B, schoolYear: YEAR, versionId: c.versionId, expectedRevision: c.revision, action: 'submit', text: 'Syntetiskt förslag' })); }, '40001', 'lasar_rules_failed');
    assert.deepEqual(JSON.parse(error.detail), ['school_days_min']);
    assert.ok(summarize(lasarSchoolYear(created.detail), f.schoolTypes.B).skoldagar < 178);
  });
  await step(t, 'fixturkalender utan lagrad kontrollsumma läses med beräknad kontrollsumma (Pitfall 6)', async () => {
    await t`set local session_replication_role=replica`;
    const id = (await t`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on) values(${f.id(2)},${C},2026,'2026-08-17','2026-12-22','2027-01-11','2027-06-11','faststalld','2026-05-01') returning id`)[0].id;
    await t`insert into public.school_year_days(school_year_id,day,kind) values(${id},'2026-10-30','lovdag')`;
    await t`set local session_replication_role=origin`;
    const r = await read('hm', C, 2026);
    assert.equal(r.calendar.versionId, id); assert.equal(r.calendar.contentHash, await lasarContentHash(content(r.calendar)));
    assert.ok((await weeks(C, 2026)).htSchoolDays > 0);
  });
  await step(t, 'kommandon och beslut loggas utan personuppgifter', async () => {
    const rows = await t`select action, object_type, details from public.security_events where action like 'lasar\\_%' order by id`;
    assert.ok(rows.some(r => r.action === 'lasar_command') && rows.some(r => r.action === 'lasar_decision') && rows.some(r => r.action === 'lasar_read'));
    for (const r of rows) {
      assert.equal(r.object_type, 'school_year');
      assert.ok(Object.keys(r.details).every(k => ['commandId', 'action', 'revision', 'version', 'unitId', 'schoolYear'].includes(k)), JSON.stringify(r.details));
      assert.ok(!JSON.stringify(r.details).includes('Syntetisk'));
    }
  });
}

/** 05.1.1-07: hela flödet för skolans version 1 med mandat per åtgärd (D-18), historik (A-16) och statusvägen. */
async function flow(t, step, f) {
  const A = f.schools.A, B = f.schools.B, types = f.schoolTypes.A;
  const env = (raw, name) => parseLasarEnvelope(raw, actorOf(f, name));
  const read = async (name, unitId = A) => {
    await f.actor(t, name);
    const q = { target: school(unitId), schoolYear: YEAR, versionId: null };
    return parseLasarReadReply(env(await lasarRead(t, q), name), q);
  };
  const send = async (name, q) => { await f.actor(t, name); return parseLasarCommandReply(env(await lasarSend(t, q), name), q); };
  const decide = async (name, q) => { await f.actor(t, name); return parseLasarDecisionReply(env(await lasarSend(t, q), name), q); };
  const deny = (name, q, code, hint) => denied(t, async u => { await f.actor(u, name); await lasarSend(u, q); }, code, hint);
  const s = {};
  const keep = r => { s.rev = r.receipt.revision; s.last = r; return r; };
  const cmd = (ops, rev = s.rev) => lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: rev, ops });
  const dec = (action, text, rev = s.rev) => lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: rev, action, text });
  const reset = (extra = {}) => resetCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev, schoolTypes: types, ...extra });
  const schoolDay = (sy, from) => { let d = from; while (dayInfo(sy, d).status !== 'skoldag') d = addDays(d, 1); return d; };
  const snapshot = async () => (await t`select y.status::text status, y.revision,
    (select count(*)::int from public.school_year_events e where e.school_year_id=y.id) events,
    (select count(*)::int from public.lasar_commands c where c.school_year_id=y.id) commands,
    (select count(*)::int from public.school_year_days d where d.school_year_id=y.id) days from public.school_years y where y.id=${s.v}`)[0];
  const onlyB = async u => {
    const aid = randomUUID();
    await u`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(${aid},${f.membership('hm')},${f.id(1)},${f.id(2)},'huvudman','synthetic-v1','school')`;
    await u`insert into public.mandate_units values(${aid},${f.id(1)},${f.id(2)},${B})`;
    const saved = f.roles.hm; f.roles.hm = aid;
    try { await f.sessionFor(u, 'hm'); await f.actor(u, 'hm'); } finally { f.roles.hm = saved; }
  };

  await step(t, 'flöde: rektor A skapar version 1 ur förslaget; historiken får raden Förslag skapat', async () => {
    const r = keep(await send('principalA', await createCommand(A, YEAR, types)));
    s.v = r.detail.calendar.versionId;
    const h = r.detail.calendar.history;
    assert.deepEqual(h.map(x => [x.action, x.role, x.actorName, x.version]), [['Förslag skapat', 'rektor', 'Syntetisk principalA', 1]]);
    assert.equal(r.detail.capabilities.canComment, true);
  });
  await step(t, 'rektor ändrar höstterminens slut (set_term); dagar utanför terminen faller bort som i modellen', async () => {
    const ht = s.last.detail.calendar.terms.ht, day = schoolDay(lasarSchoolYear(s.last.detail), addDays(ht.end, -2));
    assert.ok(day <= ht.end);
    keep(await send('principalA', await cmd([{ op: 'set_days', dates: [day], kind: 'lovdag', note: 'Syntetisk lovdag' }])));
    const before = lasarSchoolYear(s.last.detail), end = addDays(ht.end, -7);
    const r = keep(await send('principalA', await cmd([{ op: 'set_term', term: 'ht', edge: 'end', date: end }])));
    const expected = setTerm({ role: 'rektor', years: [before] }, before.id, 'ht', 'end', end).years[0];
    assert.equal(r.detail.calendar.terms.ht.end, end); assert.equal(r.detail.calendar.exceptions[day], undefined);
    assert.deepEqual(r.detail.calendar.exceptions, expected.exceptions);
  });
  await step(t, 'terminer i fel ordning nekas med regelkoden term_order; ett annat kalenderår nekas', async () => {
    const vt = s.last.detail.calendar.terms.vt;
    const e = await deny('principalA', await cmd([{ op: 'set_term', term: 'ht', edge: 'end', date: addDays(vt.start, 1) }]), '40001', 'lasar_rules_failed');
    assert.deepEqual(JSON.parse(e.detail), ['term_order']);
    await deny('principalA', await cmd([{ op: 'set_term', term: 'vt', edge: 'end', date: `${YEAR + 2}-06-09` }]), '22023', 'lasar_invalid');
  });
  await step(t, 'skoladministratören sätter och tar bort en anteckning på en lovdag (set_notes); en skoldag nekas', async () => {
    const c = s.last.detail.calendar, lov = Object.keys(c.exceptions).sort()[0], kind = c.exceptions[lov].kind;
    let r = keep(await send('admin', await cmd([{ op: 'set_notes', dates: [lov], note: 'Syntetisk anteckning' }])));
    assert.deepEqual(r.detail.calendar.exceptions[lov], { kind, note: 'Syntetisk anteckning' });
    r = keep(await send('admin', await cmd([{ op: 'set_notes', dates: [lov] }])));
    assert.deepEqual(r.detail.calendar.exceptions[lov], { kind });
    const sd = schoolDay(lasarSchoolYear(r.detail), `${YEAR}-09-01`);
    await deny('admin', await cmd([{ op: 'set_notes', dates: [sd], note: 'Syntetisk' }]), '22023', 'lasar_invalid');
  });
  await step(t, 'rektor kommenterar; en tom kommentar nekas med lasar_text_required', async () => {
    const r = keep(await send('principalA', await cmd([{ op: 'comment', text: 'Syntetisk kommentar\nandra raden' }])));
    const h = r.detail.calendar.history[0];
    assert.deepEqual([h.role, h.actorName, h.action, h.comment, h.version], ['rektor', 'Syntetisk principalA', 'Kommentar', 'Syntetisk kommentar\nandra raden', 1]);
    await deny('principalA', await cmd([{ op: 'comment', text: '' }]), '22023', 'lasar_text_required');
  });
  await step(t, 'huvudmannen kommenterar utkastet men kan inte ändra eller återställa det', async () => {
    const r = keep(await send('hm', await cmd([{ op: 'comment', text: 'Syntetisk fråga' }])));
    assert.equal(r.detail.calendar.history[0].role, 'huvudman'); assert.equal(r.detail.capabilities.canEdit, false);
    await deny('hm', await cmd([{ op: 'set_term', term: 'ht', edge: 'end', date: r.detail.calendar.terms.ht.end }]), '42501');
    await deny('hm', await reset(), '42501');
  });
  await step(t, 'skoladministratören återställer förslaget: terminer och lov enligt förslaget, gruppdagar ligger kvar', async () => {
    await deny('admin', await cmd([{ op: 'reset_to_proposal' }]), '22023', 'lasar_invalid');
    await deny('admin', { ...(await cmd([{ op: 'comment', text: 'Syntetisk' }])), proposal: (await reset()).proposal }, '22023', 'lasar_invalid');
    const key = klassGroupId(f.groups.classes.ak1), gd = schoolDay(lasarSchoolYear(s.last.detail), `${YEAR}-09-06`);
    keep(await send('admin', await cmd([{ op: 'set_group_days', groupId: key, dates: [gd], cause: 'friluftsdag' }])));
    const r = keep(await send('admin', await reset()));
    const p = proposeSchoolYear(YEAR, A, types);
    assert.deepEqual(r.detail.calendar.terms, { ht: p.ht, vt: p.vt }); assert.deepEqual(r.detail.calendar.exceptions, p.exceptions);
    assert.deepEqual(r.detail.calendar.groupDays, { [key]: { [gd]: { cause: 'friluftsdag' } } });
    assert.deepEqual([r.detail.calendar.history[0].action, r.detail.calendar.history[0].role], ['Förslag återställt', 'skoladministrator']);
  });
  await step(t, 'rektor B kan varken ändra, kommentera, återställa eller ta tillbaka i skola A', async () => {
    await deny('principalB', await cmd([{ op: 'comment', text: 'Syntetisk' }]), '42501');
    await deny('principalB', await cmd([{ op: 'set_term', term: 'ht', edge: 'end', date: s.last.detail.calendar.terms.ht.end }]), '42501');
    await deny('principalB', await reset(), '42501');
    await deny('principalB', dec('withdraw', ''), '42501');
  });
  await step(t, 'rektor skickar; skoladministratören tar tillbaka förslaget utan text (withdraw)', async () => {
    let r = keep(await decide('principalA', dec('submit', 'Syntetiskt förslag')));
    assert.equal(r.detail.calendar.status, 'forslag'); assert.equal(r.detail.capabilities.canWithdraw, true);
    r = keep(await decide('admin', dec('withdraw', '')));
    assert.equal(r.detail.calendar.status, 'utkast'); assert.equal(r.detail.capabilities.canEdit, true); assert.equal(r.detail.capabilities.canWithdraw, false);
    assert.deepEqual([r.detail.calendar.history[0].action, r.detail.calendar.history[0].role], ['Förslag återtaget', 'skoladministrator']);
    await deny('principalA', dec('withdraw', ''), '40001', 'lasar_locked_status');
  });
  await step(t, 'skoladministratören kan inte återsända, fastställa, öppna eller avslå (D-18); rektor kan inte återsända', async () => {
    keep(await decide('admin', dec('submit', 'Syntetiskt förslag igen')));
    for (const action of ['return', 'approve', 'reopen', 'decline_request']) await deny('admin', dec(action, 'Syntetisk text'), '42501');
    await deny('principalA', dec('return', 'Syntetisk text'), '42501');
  });
  await step(t, 'återsändning kräver text', async () => {
    await deny('hm', dec('return', ''), '22023', 'lasar_text_required');
  });
  await step(t, 'en revision som inte stämmer ger lasar_revision_conflict utan delresultat', async () => {
    const before = await snapshot();
    await deny('hm', dec('return', 'Syntetisk text', s.rev - 1), '40001', 'lasar_revision_conflict');
    await deny('hm', await cmd([{ op: 'comment', text: 'Syntetisk' }], s.rev - 1), '40001', 'lasar_revision_conflict');
    assert.deepEqual(await snapshot(), before);
  });
  await step(t, 'huvudmannen återsänder; rektor ändrar och skickar på nytt', async () => {
    s.returnQ = dec('return', 'Syntetisk begäran om ändring');
    s.returned = keep(await decide('hm', s.returnQ));
    assert.equal(s.returned.detail.calendar.status, 'atersand'); assert.equal(s.returned.detail.capabilities.canReturn, false);
    const pr = await read('principalA'); assert.equal(pr.capabilities.canEdit, true); assert.equal(pr.capabilities.canSubmit, true);
    const day = schoolDay(lasarSchoolYear(s.returned.detail), `${YEAR}-11-15`);
    keep(await send('principalA', await cmd([{ op: 'set_days', dates: [day], kind: 'studiedag', note: 'Syntetisk studiedag' }])));
    assert.equal(keep(await decide('principalA', dec('submit', 'Syntetiskt nytt förslag'))).detail.calendar.status, 'forslag');
    const hr = await read('hm'); assert.equal(hr.capabilities.canReturn, true); assert.equal(hr.capabilities.canApprove, true);
  });
  await step(t, 'lasar_status ger utfallet för ett journalfört kommando-id utan att utföra det igen', async () => {
    const before = await snapshot();
    await f.actor(t, 'hm');
    const st = env(await lasarStatus(t, { commandId: s.returnQ.commandId, target: school(A), schoolYear: YEAR }), 'hm');
    assert.equal(st.state, 'completed'); assert.equal(st.result.receipt.replayed, true);
    assert.deepEqual(parseLasarDecisionReply({ ...st.result, receipt: { ...st.result.receipt, replayed: false } }, s.returnQ), s.returned);
    const none = env(await lasarStatus(t, { commandId: randomUUID(), target: school(A), schoolYear: YEAR }), 'hm');
    assert.deepEqual(none, { state: 'not_found', result: null });
    assert.deepEqual(await snapshot(), before);
  });
  await step(t, 'lasar_status nekar en annan aktör, ett annat läsår och en skola utanför uppdraget', async () => {
    const q = { commandId: s.returnQ.commandId, target: school(A), schoolYear: YEAR };
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarStatus(u, q); }, '40001', 'lasar_command_conflict');
    await denied(t, async u => { await f.actor(u, 'hm'); await lasarStatus(u, { ...q, schoolYear: YEAR + 1 }); }, '40001', 'lasar_command_conflict');
    await denied(t, async u => { await f.actor(u, 'principalB'); await lasarStatus(u, q); }, '42501');
    await denied(t, async u => { await f.actor(u, 'hm'); await lasarStatus(u, { ...q, extra: 1 }); }, '22023', 'lasar_invalid');
  });
  await step(t, 'en huvudman utan skolans enhet i sitt uppdrag nekas', async () => {
    await denied(t, async u => { await onlyB(u); await lasarSend(u, dec('approve', 'Syntetiskt beslut')); }, '42501');
    await denied(t, async u => { await onlyB(u); await lasarRead(u, { target: school(A), schoolYear: YEAR, versionId: null }); }, '42501');
  });
  await step(t, 'ett ogiltigt mandat nekas (rektorns utfärdande huvudmannauppdrag är avslutat)', async () => {
    await denied(t, async u => {
      await u`update public.access_assignments set ended_at=clock_timestamp() where id=${f.roles.hm}`;
      await f.actor(u, 'principalA'); await lasarSend(u, await cmd([{ op: 'comment', text: 'Syntetisk' }]));
    }, '42501');
  });
  await step(t, 'huvudmannen fastställer; historiken visar varje steg med roll, verifierad aktör och version (A-16)', async () => {
    const r = keep(await decide('hm', dec('approve', 'Syntetiskt beslut')));
    const h = r.detail.calendar.history;
    assert.deepEqual(h.map(x => [x.action, x.role]), [['Fastställd', 'huvudman'], ['Förslag skickat', 'rektor'], ['Återsänd för ändring', 'huvudman'],
      ['Förslag skickat', 'skoladministrator'], ['Förslag återtaget', 'skoladministrator'], ['Förslag skickat', 'rektor'], ['Förslag återställt', 'skoladministrator'],
      ['Kommentar', 'huvudman'], ['Kommentar', 'rektor'], ['Förslag skapat', 'rektor']]);
    assert.deepEqual(h.slice(0, 3).map(x => x.comment), ['Syntetiskt beslut', 'Syntetiskt nytt förslag', 'Syntetisk begäran om ändring']);
    assert.ok(h.every(x => x.version === 1 && x.actorName === `Syntetisk ${{ huvudman: 'hm', rektor: 'principalA', skoladministrator: 'admin' }[x.role]}`));
    assert.ok(h.every((x, i) => i === 0 || x.at <= h[i - 1].at));
  });
  await step(t, 'Workern ser inte kalenderns historikrader och kan inte skriva dem direkt', async () => {
    const [p] = await t`select polpermissive p, pg_get_expr(polqual, polrelid) q from pg_policy where polrelid='public.school_year_events'::regclass and polname='school_year_events_lasar_rpc_only'`;
    assert.equal(p.p, false); assert.match(p.q, /actor_identity_id IS NULL/u);
    await denied(t, async u => {
      await f.actor(u, 'hm'); await u`set local role skolplattform_worker`;
      await u`insert into public.school_year_events(school_year_id,actor_role,action,comment) values(${s.v},'huvudman','lasar_approve','Syntetiskt förfalskat')`;
    }, '42501');
  });
  await step(t, 'statusläsning och kalenderns åtgärder loggas utan personuppgifter', async () => {
    const rows = await t`select action, object_type, details from public.security_events where action like 'lasar\\_%' order by id`;
    assert.ok(['lasar_status', 'lasar_command', 'lasar_decision', 'lasar_read'].every(a => rows.some(r => r.action === a)));
    for (const r of rows) {
      assert.equal(r.object_type, 'school_year');
      assert.ok(Object.keys(r.details).every(k => ['commandId', 'action', 'revision', 'version', 'unitId', 'schoolYear'].includes(k)), JSON.stringify(r.details));
      assert.ok(!JSON.stringify(r.details).includes('Syntetisk'));
    }
  });
}

/**
 * 05.1.1-07 (LASAR-03): paritetsmatris mellan SQL:s regler och summarize i lasar-model.ts. Varje rad jämför mängden
 * (multimängden) {kod, nivå} från SQL-kärnan lasar_rule_check med modellens; lagringsbara rader prövas också genom
 * lasar_rules(version_id) på en lagrad version. En avvikelse gör fallet rött.
 */
const PARITY_UNITS = { GR: 'B', GY: 'C', 'GR,GY': 'A' };
function parityMatrix() {
  const gr = proposeSchoolYear(YEAR, 'paritet', ['GR']), gy = proposeSchoolYear(YEAR, 'paritet', ['GY']), both = proposeSchoolYear(YEAR, 'paritet', ['GR', 'GY']);
  const withSchoolDays = (sy, types, target) => {
    const next = structuredClone(sy), lov = Object.keys(next.exceptions).sort();
    while (summarize(next, types).skoldagar < target && lov.length) delete next.exceptions[lov.pop()];
    for (let d = `${YEAR}-09-01`; summarize(next, types).skoldagar > target; d = addDays(d, 1))
      if (dayInfo(next, d).status === 'skoldag') next.exceptions[d] = { kind: 'lovdag', note: 'Syntetisk lovdag' };
    assert.equal(summarize(next, types).skoldagar, target);
    return next;
  };
  const withHolidays = target => {
    const next = { ...structuredClone(gr), ht: { start: gr.ht.start, end: `${YEAR}-12-21` }, vt: { start: `${YEAR + 1}-01-03`, end: gr.vt.end }, exceptions: {} };
    for (let d = `${YEAR}-09-06`; summarize(next, ['GR']).lovdagar < target; d = addDays(d, 7)) next.exceptions[d] = { kind: 'lovdag', note: 'Syntetisk lovdag' };
    assert.equal(summarize(next, ['GR']).lovdagar, target);
    return next;
  };
  const withStudyDays = n => {
    const next = structuredClone(gr);
    let d = `${YEAR}-09-07`;
    for (let i = 0; i < n; d = addDays(d, 8)) if (dayInfo(next, d).status === 'skoldag') { next.exceptions[d] = { kind: 'studiedag', note: 'Syntetisk studiedag' }; i += 1; }
    return next;
  };
  const noHostlov = { ...structuredClone(gr), exceptions: Object.fromEntries(Object.entries(gr.exceptions).filter(([, e]) => e.note !== 'Höstlov')) };
  const gy39 = sy => ({ ...structuredClone(sy), ht: { ...sy.ht, start: addDays(sy.ht.start, 7) } });
  let bare = `${YEAR}-09-15`; while (dayInfo(gr, bare).status !== 'skoldag') bare = addDays(bare, 1);
  return [
    { name: '177 skoldagar', types: ['GR'], sy: withSchoolDays(gr, ['GR'], 177), expect: ['school_days_min:error'] },
    { name: '178 skoldagar', types: ['GR'], sy: withSchoolDays(gr, ['GR'], 178), absent: ['school_days_min:error'] },
    { name: '11 lovdagar', types: ['GR'], sy: withHolidays(11), expect: ['holidays_min:error'] },
    { name: '12 lovdagar', types: ['GR'], sy: withHolidays(12), absent: ['holidays_min:error'] },
    { name: '5 studiedagar', types: ['GR'], sy: withStudyDays(5), absent: ['study_days_max:error'] },
    { name: '6 studiedagar', types: ['GR'], sy: withStudyDays(6), expect: ['study_days_max:error'] },
    { name: 'start i juli', types: ['GR', 'GY'], sy: { ...structuredClone(both), ht: { ...both.ht, start: `${YEAR}-07-30` } }, expect: ['term_start_august:error'] },
    { name: 'slut i juli', types: ['GR', 'GY'], sy: { ...structuredClone(both), vt: { ...both.vt, end: `${YEAR + 1}-07-03` } }, expect: ['term_end_june:error'] },
    { name: 'fel ordning', types: ['GR', 'GY'], sy: { ...structuredClone(both), ht: { ...both.ht, end: addDays(both.vt.start, 3) } }, expect: ['term_order:error'], stored: false },
    { name: 'enbart GY med 39 veckor (fel)', types: ['GY'], sy: gy39(gy), expect: ['gy_weeks:error'] },
    { name: 'GR+GY med 39 veckor (varning)', types: ['GR', 'GY'], sy: gy39(both), expect: ['gy_weeks:warning'], absent: ['gy_weeks:error'] },
    { name: 'terminskant på helgdag (varning)', types: ['GR'], sy: { ...structuredClone(gr), vt: { ...gr.vt, start: `${YEAR + 1}-01-06` } }, expect: ['term_edge_holiday:warning'] },
    { name: 'över 60 skoldagar i följd (varning)', types: ['GR'], sy: noHostlov, expect: ['long_run:warning'] },
    { name: 'studiedag utan anteckning (varning)', types: ['GR'], sy: { ...structuredClone(gr), exceptions: { ...gr.exceptions, [bare]: { kind: 'studiedag' } } }, expect: ['study_day_note:warning'] },
  ];
}
const pairsOf = list => list.map(i => `${i.code}:${i.level}`).sort();

async function parity(t, step, f) {
  const sentinel = Error('parity_rollback');
  const rolledBack = async fn => { let out; try { await t.savepoint(async u => { out = await fn(u); throw sentinel; }); } catch (e) { if (e !== sentinel) throw e; } return out; };
  for (const row of parityMatrix()) {
    await step(t, `paritet: ${row.name}`, async () => {
      const model = pairsOf(summarize(row.sy, row.types).issues);
      for (const p of row.expect ?? []) assert.ok(model.includes(p), `modellen saknar ${p}: ${model.join(', ')}`);
      for (const p of row.absent ?? []) assert.ok(!model.includes(p), `modellen har ${p}`);
      const terms = { ht: row.sy.ht, vt: row.sy.vt };
      const core = pairsOf((await t`select public.lasar_rule_check(${t.json(terms)}, ${t.json(row.sy.exceptions)}, ${row.types}::text[]) r`)[0].r);
      assert.deepEqual(core, model, 'SQL-kärnan');
      if (row.stored === false) return;
      const unit = f.schools[PARITY_UNITS[row.types.join(',')]];
      const stored = await rolledBack(async u => {
        const id = (await u`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,version)
          values(${f.id(2)},${unit},${YEAR},${row.sy.ht.start},${row.sy.ht.end},${row.sy.vt.start},${row.sy.vt.end},'utkast',1) returning id`)[0].id;
        for (const [day, e] of Object.entries(row.sy.exceptions))
          await u`insert into public.school_year_days(school_year_id,day,kind,note) values(${id},${day},${e.kind},${e.note ?? null})`;
        return (await u`select public.lasar_rules(${id}) r`)[0].r;
      });
      assert.deepEqual(pairsOf(stored), model, 'lagrad version');
    });
  }
  await step(t, 'paritet: SQL:s regelkoder står i LASAR_RULE_CODES och nivån är tillåten', async () => {
    for (const row of parityMatrix()) {
      const r = (await t`select public.lasar_rule_check(${t.json({ ht: row.sy.ht, vt: row.sy.vt })}, ${t.json(row.sy.exceptions)}, ${row.types}::text[]) r`)[0].r;
      for (const i of r) assert.ok(Object.hasOwn(LASAR_RULE_CODES, i.code) && LASAR_RULE_CODES[i.code].levels.includes(i.level), JSON.stringify(i));
    }
  });

  // Förslag och fastställande genom kommandona: fel hindrar, varningar följer inte med som hinder.
  const A = f.schools.A, env = (raw, name) => parseLasarEnvelope(raw, actorOf(f, name));
  const send = async (name, q) => { await f.actor(t, name); return parseLasarCommandReply(env(await lasarSend(t, q), name), q); };
  const decide = async (name, q) => { await f.actor(t, name); return parseLasarDecisionReply(env(await lasarSend(t, q), name), q); };
  const s = {};
  await step(t, 'förslaget nekas med alla felkoder (start i juli och sex studiedagar)', async () => {
    const r = await send('principalA', await createCommand(A, YEAR, f.schoolTypes.A));
    s.v = r.detail.calendar.versionId; s.rev = r.receipt.revision;
    let sy = lasarSchoolYear(r.detail), d = `${YEAR}-09-07`;
    const dates = [];
    while (dates.length < 6) { if (dayInfo(sy, d).status === 'skoldag') dates.push(d); d = addDays(d, 8); }
    s.study = dates;
    const r2 = await send('principalA', await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev,
      ops: [{ op: 'set_days', dates, kind: 'studiedag', note: 'Syntetisk studiedag' }, { op: 'set_term', term: 'ht', edge: 'start', date: `${YEAR}-07-30` }] }));
    s.rev = r2.receipt.revision; sy = lasarSchoolYear(r2.detail);
    const modelErrors = [...new Set(summarize(sy, f.schoolTypes.A).issues.filter(i => i.level === 'error').map(i => i.code))].sort();
    const e = await denied(t, async u => { await f.actor(u, 'principalA'); await lasarSend(u, lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev, action: 'submit', text: 'Syntetiskt förslag' })); }, '40001', 'lasar_rules_failed');
    assert.deepEqual([...JSON.parse(e.detail)].sort(), modelErrors);
    assert.ok(modelErrors.includes('term_start_august') && modelErrors.includes('study_days_max'));
  });
  await step(t, 'varningar hindrar inte förslaget (studiedag utan anteckning)', async () => {
    const r = await send('principalA', await resetCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev, schoolTypes: f.schoolTypes.A }));
    const sy = lasarSchoolYear(r.detail); let d = `${YEAR}-09-15`; while (dayInfo(sy, d).status !== 'skoldag') d = addDays(d, 1);
    const r2 = await send('principalA', await lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: r.receipt.revision, ops: [{ op: 'set_days', dates: [d], kind: 'studiedag' }] }));
    assert.deepEqual(pairsOf(summarize(lasarSchoolYear(r2.detail), f.schoolTypes.A).issues), ['study_day_note:warning']);
    const sub = await decide('principalA', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: r2.receipt.revision, action: 'submit', text: 'Syntetiskt förslag' }));
    assert.equal(sub.detail.calendar.status, 'forslag'); s.rev = sub.receipt.revision; s.submitted = sub;
  });
  await step(t, 'fastställandet nekas med regelkoderna när det skickade innehållet bryter mot förordningen', async () => {
    // Syntetiskt: ägaren lägger en sjätte studiedag i det skickade förslaget förbi låset (som en äldre rad eller ett fel).
    await t`set local session_replication_role=replica`;
    for (const d of s.study) await t`insert into public.school_year_days(school_year_id,day,kind,note) values(${s.v},${d},'studiedag','Syntetisk') on conflict do nothing`;
    await t`set local session_replication_role=origin`;
    const e = await denied(t, async u => { await f.actor(u, 'hm'); await lasarSend(u, lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev, action: 'approve', text: 'Syntetiskt beslut' })); }, '40001', 'lasar_rules_failed');
    const sy = lasarSchoolYear(s.submitted.detail);
    for (const d of s.study) sy.exceptions[d] ??= { kind: 'studiedag', note: 'Syntetisk' };
    const modelErrors = summarize(sy, f.schoolTypes.A).issues.filter(i => i.level === 'error').map(i => i.code);
    assert.ok(modelErrors.includes('study_days_max')); assert.deepEqual(JSON.parse(e.detail), modelErrors);
    assert.equal((await t`select status::text s from public.school_years where id=${s.v}`)[0].s, 'forslag');
  });
}

/**
 * 05.1.1-08 (LASAR-04, LASAR-01): skolans grupper och undervisning i läsningen, gruppkommandona och D-20. Grupperna kommer ur
 * school_classes, offerings och class_timplans med bara ID:n som nycklar; inga elevantal (A-18).
 */
async function groups(t, step, f) {
  const A = f.schools.A, types = f.schoolTypes.A, k = f.groups.classes, gr = f.offerings.gr;
  const env = (raw, name) => parseLasarEnvelope(raw, actorOf(f, name));
  const read = async (name, unitId = A, schoolYear = YEAR) => {
    await f.actor(t, name);
    const q = { target: school(unitId), schoolYear, versionId: null };
    return parseLasarReadReply(env(await lasarRead(t, q), name), q);
  };
  const send = async (name, q) => { await f.actor(t, name); return parseLasarCommandReply(env(await lasarSend(t, q), name), q); };
  const decide = async (name, q) => { await f.actor(t, name); return parseLasarDecisionReply(env(await lasarSend(t, q), name), q); };
  const deny = (name, q, code, hint) => denied(t, async u => { await f.actor(u, name); await lasarSend(u, q); }, code, hint);
  const s = {};
  const keep = r => { s.rev = r.receipt.revision; s.last = r; return r; };
  const cmd = (ops, rev = s.rev) => lasarCommand({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: rev, ops });
  const content = c => ({ terms: c.terms, exceptions: c.exceptions, groupDays: c.groupDays, shortWeeks: c.shortWeeks, frameVersionId: c.frameVersionId, version: c.version });
  const schoolDays = (sy, from, n) => { const out = []; for (let d = from; out.length < n; d = addDays(d, 1)) if (dayInfo(sy, d).status === 'skoldag') out.push(d); return out; };
  const nonSchool = (sy, from) => { let d = from; while (dayInfo(sy, d).status === 'skoldag') d = addDays(d, 1); return d; };
  const ak = c => arskursGroupId(gr, c), im = arskursGroupId(f.offerings.im, 'vecka'), gyAr1 = arskursGroupId(f.offerings.gy, 'ar1');
  const byKey = list => [...list].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const needHours = async (classId, year = YEAR) => {
    const c = (await t`select x.value c from jsonb_array_elements(public.tjanst_needs(${A},${year})) x where x.value->>'classId'=${classId}`)[0].c;
    return Math.round(c.needs.reduce((sum, n) => sum + (n.needHt ?? 0) + (n.needVt ?? 0), 0) / 60);
  };

  await step(t, 'grupper: årskurser per utbildning och kolumn och klasser ur klassregistret, bara med ID som nycklar', async () => {
    const r = await read('principalA');
    const expected = [
      ...['ak1', 'ak2', 'ak3'].map(c => ({ scope: 'arskurs', offeringId: gr, columnId: c, label: `Åk ${c.slice(2)}`, educationName: 'Syntetisk GR 1–3', kind: 'grundskola' })),
      { scope: 'arskurs', offeringId: f.offerings.im, columnId: 'vecka', label: 'Per vecka', educationName: 'Syntetiskt IM', kind: 'introduktionsprogram' },
      { scope: 'arskurs', offeringId: f.offerings.gy, columnId: 'ar1', label: 'År 1', educationName: 'Syntetiskt SA25', kind: 'gymnasium' },
      { scope: 'klass', classId: k.gy, offeringId: f.offerings.gy, columnId: null, label: 'SA27A', educationName: 'Syntetiskt SA25', kind: 'gymnasium' },
      { scope: 'klass', classId: k.ak1, offeringId: gr, columnId: 'ak1', label: 'SYN1A', educationName: 'Syntetisk GR 1–3', kind: 'grundskola' },
      { scope: 'klass', classId: k.unlinked, offeringId: gr, columnId: null, label: 'SYN2X', educationName: 'Syntetisk GR 1–3', kind: 'grundskola' },
      { scope: 'klass', classId: k.ak3, offeringId: gr, columnId: 'ak3', label: 'SYN3A', educationName: 'Syntetisk GR 1–3', kind: 'grundskola' },
      { scope: 'klass', classId: k.im, offeringId: f.offerings.im, columnId: 'vecka', label: 'SYNIM27', educationName: 'Syntetiskt IM', kind: 'introduktionsprogram' },
    ];
    assert.deepEqual(r.groups, expected);
    const built = groupsFromRefs(r.groups);
    assert.deepEqual(built.find(g => g.id === klassGroupId(k.ak1)).parentId, ak('ak1'));
    assert.equal(built.find(g => g.id === klassGroupId(k.im)).parentId, im);
    assert.ok(built.every(g => /^(arskurs:[0-9a-f-]{36}:(ar[1-3]|ak[1-9]|vecka)|klass:[0-9a-f-]{36})$/u.test(g.id)), 'bara stabila ID:n');
    assert.ok(!r.groups.some(g => g.classId === f.classes.group || g.classId === f.classes.other), 'klasser utanför läsåret saknas');
    assert.ok(!/pupil|elev/iu.test(JSON.stringify({ groups: r.groups, teaching: r.teaching })), 'inga elevuppgifter eller elevantal (A-18)');
    s.groups = r.groups;
  });
  await step(t, 'undervisning: fastställd timplan, version och timmar per klass; IM-klassen har veckoram (A-09, A-17)', async () => {
    const r = await read('admin');
    assert.deepEqual(r.teaching.imClassIds, [k.im]);
    const rows = [{ columnId: 'ak1', hours: 220 }, { columnId: 'ak2', hours: 240 }, { columnId: 'ak3', hours: 260 }];
    assert.deepEqual(r.teaching.classes, [
      { classId: k.ak1, name: 'SYN1A', offeringId: gr, columnId: 'ak1', timplanId: f.groups.grPlan, timplanVersion: 1, rows },
      { classId: k.ak3, name: 'SYN3A', offeringId: gr, columnId: 'ak3', timplanId: f.groups.grPlan, timplanVersion: 1, rows },
      { classId: k.im, name: 'SYNIM27', offeringId: f.offerings.im, columnId: 'vecka', timplanId: f.groups.imPlan, timplanVersion: 1, rows: [{ columnId: 'vecka', hours: 8 }] },
    ]);
    // Samma årstimmar som tjänstefördelningens behov för klassens årskurs.
    assert.equal(await needHours(k.ak1), 220); assert.equal(await needHours(k.ak3), 260);
  });
  await step(t, 'undervisning: gymnasieklassens timmar per år ur den fastställda timplanen stämmer med tjänstefördelningens behov', async () => {
    const g = await seedGy25Class(t, f, 'SYNBF1');
    const r = await read('principalA', A, g.year);
    const c = r.teaching.classes.find(x => x.classId === g.classId);
    assert.ok(c, 'klassen saknas'); assert.equal(c.columnId, 'ar1'); assert.deepEqual(c.rows.map(x => x.columnId), ['ar1', 'ar2', 'ar3']);
    assert.equal(c.rows[0].hours, await needHours(g.classId, g.year));
    assert.ok(r.groups.some(x => x.scope === 'klass' && x.classId === g.classId && x.columnId === 'ar1'));
  });
  await step(t, 'SS 12000: två klasser med samma namn och olika startår får olika referenser', async () => {
    const sentinel = Error('ss12000_rollback');
    try {
      await t.savepoint(async u => {
        const a = await gymClass(u, f, { offeringId: f.offerings.gy, name: 'SYNDUP', startYear: 2026 }), b = await gymClass(u, f, { offeringId: f.offerings.gy, name: 'SYNDUP', startYear: 2027 });
        await f.actor(u, 'principalA');
        const q = { target: school(A), schoolYear: YEAR, versionId: null };
        const r = parseLasarReadReply(env(await lasarRead(u, q), 'principalA'), q);
        const dup = r.groups.filter(g => g.label === 'SYNDUP');
        assert.deepEqual(dup.map(g => g.classId).sort(), [a, b].sort());
        assert.equal(new Set(groupsFromRefs(r.groups).map(g => g.id)).size, r.groups.length);
        throw sentinel;
      });
    } catch (e) { if (e !== sentinel) throw e; }
  });

  await step(t, 'gruppdagar: rektor sätter dagar för en årskurs och en klass; kalendern nycklas på grupp-ID och kontrollsumman stämmer', async () => {
    const created = keep(await send('principalA', await createCommand(A, YEAR, types)));
    s.v = created.detail.calendar.versionId;
    const sy = lasarSchoolYear(created.detail);
    s.days = schoolDays(sy, `${YEAR}-09-01`, 6);
    const r = keep(await send('principalA', await cmd([
      { op: 'set_group_days', groupId: ak('ak1'), dates: [s.days[0], s.days[1]], cause: 'friluftsdag' },
      { op: 'set_group_days', groupId: klassGroupId(k.ak1), dates: [s.days[2]], cause: 'annat', note: 'Syntetisk utflykt' },
    ])));
    const c = r.detail.calendar;
    assert.deepEqual(c.groupDays, { [ak('ak1')]: { [s.days[0]]: { cause: 'friluftsdag' }, [s.days[1]]: { cause: 'friluftsdag' } },
      [klassGroupId(k.ak1)]: { [s.days[2]]: { cause: 'annat', note: 'Syntetisk utflykt' } } });
    assert.equal(c.contentHash, await lasarContentHash(content(c)));
    const built = groupsFromRefs(r.detail.groups), summary = groupSummary(lasarSchoolYear(r.detail), built.find(g => g.id === klassGroupId(k.ak1)), built);
    assert.equal(summary.fewer, 3, 'klassen ärver årskursens två dagar och har en egen');
  });
  await step(t, 'korta veckor: åk 1 med särskilda skäl går; åk 3, en klass utan årskurs, IM och gymnasiet ger short_week_column', async () => {
    const r = keep(await send('principalA', await cmd([{ op: 'set_short_week', groupId: ak('ak1'), columnId: 'ak1', weekday: 4, reason: 'Syntetiska särskilda skäl' }])));
    assert.deepEqual(r.detail.calendar.shortWeeks, { [ak('ak1')]: { weekday: 4, reason: 'Syntetiska särskilda skäl', columnId: 'ak1' } });
    for (const [groupId, columnId] of [[ak('ak3'), 'ak3'], [klassGroupId(k.ak3), 'ak3'], [klassGroupId(k.unlinked), 'ak1'], [im, 'vecka'], [klassGroupId(k.im), 'vecka'], [gyAr1, 'ar1']]) {
      const e = await deny('principalA', await cmd([{ op: 'set_short_week', groupId, columnId, weekday: 0, reason: 'Syntetiska skäl' }]), '40001', 'lasar_rules_failed');
      assert.deepEqual(JSON.parse(e.detail), ['short_week_column'], groupId);
    }
    // Samma regel i modellen: setShortWeek nekar åk 3.
    const built = groupsFromRefs(r.detail.groups), sy = lasarSchoolYear(r.detail);
    sy.shortWeeks[ak('ak3')] = { weekday: 0, reason: 'Syntetiska skäl', columnId: 'ak3' };
    assert.ok(groupSummary(sy, built.find(g => g.id === ak('ak3')), built).issues.some(i => i.code === 'short_week_column'));
  });
  await step(t, 'gruppregler med samma koder som modellen: saknade särskilda skäl och orsak annat utan anteckning', async () => {
    const e1 = await deny('principalA', await cmd([{ op: 'set_short_week', groupId: ak('ak2'), columnId: 'ak2', weekday: 2, reason: '  ' }]), '40001', 'lasar_rules_failed');
    assert.deepEqual(JSON.parse(e1.detail), ['short_week_reason']);
    const e2 = await deny('principalA', await cmd([{ op: 'set_group_days', groupId: ak('ak2'), dates: [s.days[3]], cause: 'annat' }]), '40001', 'lasar_rules_failed');
    assert.deepEqual(JSON.parse(e2.detail), ['group_other_note']);
    await deny('principalA', await cmd([{ op: 'set_short_week', groupId: ak('ak1'), columnId: 'ak2', weekday: 2, reason: 'Syntetiska skäl' }]), '22023', 'lasar_invalid');
  });
  await step(t, 'gruppdagar bara på skolans skoldagar och bara för skolans grupper i läsåret', async () => {
    const sy = lasarSchoolYear(s.last.detail);
    const lov = Object.keys(sy.exceptions).sort()[0], weekend = nonSchool(sy, `${YEAR}-09-05`);
    for (const d of [lov, weekend, `${YEAR}-07-01`]) await deny('principalA', await cmd([{ op: 'set_group_days', groupId: ak('ak2'), dates: [d], cause: 'apl' }]), '22023', 'lasar_invalid');
    for (const groupId of [klassGroupId(f.classes.group), klassGroupId(randomUUID()), arskursGroupId(gr, 'ak7'), arskursGroupId(f.offerings.gy, 'ar2')])
      await deny('principalA', await cmd([{ op: 'set_group_days', groupId, dates: [s.days[4]], cause: 'apl' }]), '22023', 'lasar_invalid');
    await deny('principalA', await cmd([{ op: 'set_group_days', groupId: 'klass:SYN1A', dates: [s.days[4]], cause: 'apl' }]), '22023', 'lasar_invalid');
  });
  await step(t, 'mandat: skoladministratören sätter gruppdagar (D-18); rektor B och huvudmannen nekas', async () => {
    keep(await send('admin', await cmd([{ op: 'set_group_days', groupId: klassGroupId(k.unlinked), dates: [s.days[4]], cause: 'nationellt prov' }])));
    await deny('principalB', await cmd([{ op: 'set_group_days', groupId: klassGroupId(k.unlinked), dates: [s.days[5]], cause: 'apl' }]), '42501');
    await deny('hm', await cmd([{ op: 'clear_short_week', groupId: ak('ak1') }]), '42501');
  });
  await step(t, 'ta bort gruppdagar och kort vecka; det som inte finns nekas', async () => {
    let r = keep(await send('principalA', await cmd([{ op: 'clear_group_days', groupId: ak('ak1'), dates: [s.days[1]] }])));
    assert.deepEqual(Object.keys(r.detail.calendar.groupDays[ak('ak1')]), [s.days[0]]);
    await deny('principalA', await cmd([{ op: 'clear_group_days', groupId: ak('ak1'), dates: [s.days[5]] }]), '22023', 'lasar_invalid');
    r = keep(await send('principalA', await cmd([{ op: 'clear_short_week', groupId: ak('ak1') }])));
    assert.deepEqual(r.detail.calendar.shortWeeks, {});
    await deny('principalA', await cmd([{ op: 'clear_short_week', groupId: ak('ak1') }]), '22023', 'lasar_invalid');
    keep(await send('principalA', await cmd([{ op: 'set_short_week', groupId: klassGroupId(k.ak1), columnId: 'ak1', weekday: 4, reason: 'Syntetiska särskilda skäl' }])));
  });
  await step(t, 'D-20: en gruppdag för IM-klassen ändrar varken skoldagarna eller IM-behovet i tjänstefördelningen', async () => {
    keep(await send('principalA', await cmd([{ op: 'set_group_days', groupId: klassGroupId(k.im), dates: [s.days[0], s.days[5]], cause: 'apl' },
      { op: 'set_group_days', groupId: im, dates: [s.days[3]], cause: 'friluftsdag' }])));
    const sub = keep(await decide('principalA', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: s.rev, action: 'submit', text: 'Syntetiskt förslag' })));
    await deny('principalA', await cmd([{ op: 'clear_short_week', groupId: klassGroupId(k.ak1) }]), '40001', 'lasar_locked_status');
    const ok = keep(await decide('hm', lasarDecision({ unitId: A, schoolYear: YEAR, versionId: s.v, expectedRevision: sub.receipt.revision, action: 'approve', text: 'Syntetiskt beslut' })));
    const sy = lasarSchoolYear(ok.detail), sum = summarize(sy, types);
    assert.ok(Object.keys(ok.detail.calendar.groupDays[klassGroupId(k.im)]).length === 2);
    const weeks = (await t`select public.tjanst_school_weeks(${A},${YEAR}) w`)[0].w;
    assert.deepEqual(weeks, { htSchoolDays: sum.terms.ht.skoldagar, vtSchoolDays: sum.terms.vt.skoldagar });
    const imNeeds = (await t`select x.value c from jsonb_array_elements(public.tjanst_needs(${A},${YEAR})) x where x.value->>'classId'=${k.im}`)[0].c.needs;
    assert.deepEqual(imNeeds.map(n => [n.rowKey, n.needHt, n.needVt]).sort(), [['im-ma', 3 * 12 * sum.terms.ht.skoldagar, 3 * 12 * sum.terms.vt.skoldagar],
      ['im-sv', 5 * 12 * sum.terms.ht.skoldagar, 5 * 12 * sum.terms.vt.skoldagar]]);
    const [row] = await t`select content_hash from public.school_years where id=${s.v}`;
    assert.equal(row.content_hash, await lasarContentHash(content(ok.detail.calendar)));
    s.approved = ok;
  });
  await step(t, 'lasar_rules på den lagrade versionen ger samma koder som allIssues med grupperna (gruppdagar under 178 som varning)', async () => {
    const sy = lasarSchoolYear(s.approved.detail), built = groupsFromRefs(s.approved.detail.groups);
    const model = pairsOf(allIssues(sy, types, built));
    assert.ok(model.includes('group_days_min:warning'), model.join(', '));
    assert.deepEqual(pairsOf((await t`select public.lasar_rules(${s.v}) r`)[0].r), model);
  });
  await step(t, 'gruppkommandon loggas utan personuppgifter eller klassnamn', async () => {
    const rows = await t`select details from public.security_events where action='lasar_command' order by id`;
    assert.ok(rows.length > 0);
    for (const r of rows) assert.ok(!/SYN|SA27A|Syntetisk/u.test(JSON.stringify(r.details)), JSON.stringify(r.details));
  });
}

/**
 * 05.1.1-08 (LASAR-03): gruppreglernas paritet. SQL-kärnan lasar_group_rule_check jämförs med groupSummary i lasar-model.ts för
 * alla grupper ur groupsFromRefs, som multimängd {kod, nivå}. Fallen bygger på skolans grupper ur läsningen.
 */
async function groupParity(t, step, f) {
  await f.actor(t, 'principalA');
  const q = { target: school(f.schools.A), schoolYear: YEAR, versionId: null };
  const refs = parseLasarReadReply(parseLasarEnvelope(await lasarRead(t, q), actorOf(f, 'principalA')), q).groups;
  const built = groupsFromRefs(refs), k = f.groups.classes, gr = f.offerings.gr;
  const base = proposeSchoolYear(YEAR, f.schools.A, f.schoolTypes.A);
  const days = []; for (let d = `${YEAR}-09-01`; days.length < 60; d = addDays(d, 1)) if (dayInfo(base, d).status === 'skoldag') days.push(d);
  const ak = c => arskursGroupId(gr, c);
  const many = n => Object.fromEntries(days.slice(0, n).map(d => [d, { cause: 'apl' }]));
  const rows = [
    { name: 'inga gruppavvikelser', groupDays: {}, shortWeeks: {}, expect: [] },
    { name: 'kort vecka åk 1 med skäl (inget fel)', groupDays: {}, shortWeeks: { [ak('ak1')]: { weekday: 4, reason: 'Syntetiska skäl', columnId: 'ak1' } }, absent: ['short_week_column:error'] },
    { name: 'kort vecka åk 3 ger short_week_column, också för klassen som ärver', groupDays: {}, shortWeeks: { [ak('ak3')]: { weekday: 0, reason: 'Syntetiska skäl', columnId: 'ak3' } }, expect: ['short_week_column:error'] },
    { name: 'kort vecka utan skäl', groupDays: {}, shortWeeks: { [ak('ak2')]: { weekday: 1, reason: '', columnId: 'ak2' } }, expect: ['short_week_reason:error'] },
    { name: 'orsak annat utan anteckning, ärvd av klassen', groupDays: { [ak('ak1')]: { [days[0]]: { cause: 'annat' } } }, shortWeeks: {}, expect: ['group_other_note:error'] },
    { name: 'färre än 178 undervisningsdagar (varning)', groupDays: { [klassGroupId(k.unlinked)]: many(10) }, shortWeeks: {}, expect: ['group_days_min:warning'] },
    { name: 'klass utan årskursgrupp med kort vecka', groupDays: {}, shortWeeks: { [klassGroupId(k.gy)]: { weekday: 2, reason: 'Syntetiska skäl', columnId: 'ar1' } }, expect: ['short_week_column:error'] },
    { name: 'IM-klass med kort vecka', groupDays: {}, shortWeeks: { [klassGroupId(k.im)]: { weekday: 2, reason: 'Syntetiska skäl', columnId: 'vecka' } }, expect: ['short_week_column:error'] },
    { name: 'gruppdagar för en grupp som inte finns i läsåret räknas inte', groupDays: { [klassGroupId(f.classes.group)]: { [days[0]]: { cause: 'annat' } } }, shortWeeks: {}, expect: [] },
  ];
  for (const row of rows) {
    await step(t, `gruppparitet: ${row.name}`, async () => {
      const sy = { ...structuredClone(base), groupExceptions: row.groupDays, shortWeeks: row.shortWeeks };
      const model = pairsOf(built.flatMap(g => groupSummary(sy, g, built).issues));
      if (row.expect) for (const p of row.expect) assert.ok(model.includes(p), `modellen saknar ${p}: ${model.join(', ')}`);
      if (row.expect?.length === 0) assert.deepEqual(model, []);
      for (const p of row.absent ?? []) assert.ok(!model.includes(p), `modellen har ${p}`);
      const sql = (await t`select public.lasar_group_rule_check(${t.json({ ht: sy.ht, vt: sy.vt })}, ${t.json(sy.exceptions)}, ${t.json(refs)}, ${t.json(row.groupDays)}, ${t.json(row.shortWeeks)}) r`)[0].r;
      assert.deepEqual(pairsOf(sql), model, 'SQL-kärnan');
      for (const i of sql) assert.ok(Object.hasOwn(LASAR_RULE_CODES, i.code) && LASAR_RULE_CODES[i.code].levels.includes(i.level) && LASAR_RULE_CODES[i.code].scope === 'grupp', JSON.stringify(i));
    });
  }
}

async function schemaCopy(report) {
  const { targetPendingMigrations } = await import('./verify-tjanst-actual.mjs');
  const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
  const target = await targetPendingMigrations(), s = await createNamedTimplanSnapshot();
  try {
    assert.equal(s.provenance.sourceFingerprint, target.fingerprint);
    await s.db.begin(async t => { for (const file of target.pendingMigrations) await t.unsafe(readFileSync(resolve(root, file), 'utf8')); });
    report.pendingMigrations = target.pendingMigrations;
    return { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); } };
  } catch (e) { await s.cleanup(); throw e; }
}

export async function verifyLasar(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'lasar-sql', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', cases: [], startedAt: new Date().toISOString(),
    limitations: ['Own database and synthetic fixtures only; nothing installed in any connected database', 'No HTTP/OIDC/Worker; the real chain is plan 15',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs' : 'Schema-only copy of the protected local target with pending migrations',
      'Version 2 and the Pitfall 6 calendar are inserted directly by the owner (marked synthetic); group days go through lasar_command; reopen comes in a later plan',
      'Groups and teaching come from synthetic classes, offerings and timplans; no pupils and no pupil counts (A-18)',
      'SS 12000: the calendar has no object in the standard; unit_id is Organisation/Skolenhet; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  const step = caseRunner(report);
  let source;
  try {
    persist();
    staticChecks(report);
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb();
      source = { db: e.db, provenance: e.provenance, close: e.end };
    } else source = await schemaCopy(report);
    report.database = source.provenance; persist();
    const db = source.db;
    const f = await db.begin(createLasarFixture);
    for (const run of [structure, invariant, vectors]) {
      try { await db.begin(async tx => { await run(tx, step); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    }
    for (const run of [tracer, flow, parity, groups, groupParity]) {
      try { await db.begin(async tx => { await tx`set local statement_timeout='120s'`; await run(tx, step, f); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    }
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, stack: e.stack }; }
  finally {
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    report.passed = report.cases.filter(c => c.status === 'PASS').length;
    report.failed = report.cases.filter(c => c.status !== 'PASS').length;
    if (!report.failure && !report.cleanupFailure && report.failed === 0 && report.passed > 0) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.passed} läsårskalenderfall i SQL` : `FAIL: ${report.failed} av ${report.cases.length} fall${report.failure ? '; ' + report.failure.message : ''}`);
  for (const c of report.cases.filter(x => x.status !== 'PASS')) console.log(`  FAIL ${c.name}: ${c.code ?? ''} ${c.hint ?? ''} ${c.message ?? ''}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyLasar(rest[1], { ephemeral });
}
