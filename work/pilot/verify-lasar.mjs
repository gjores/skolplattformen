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
import { createLasarFixture, createCommand, lasarCommand, lasarDecision, lasarRead, lasarSend, lasarStatus, lasarMigrations, resetCommand, school } from './lasar-fixtures.mjs';
import { parseLasarCommandReply, parseLasarDecisionReply, parseLasarEnvelope, parseLasarReadReply, lasarSchoolYear } from '../../web/lib/lasar-contract.ts';
import { lasarContentHash } from '../../web/lib/lasar-content.ts';
import { addDays, dayInfo, proposeSchoolYear, setTerm, summarize } from '../../web/lib/lasar-model.ts';

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
  'guard_school_year_days', 'lasar_command', 'lasar_content_hash', 'lasar_create_proposal', 'lasar_current', 'lasar_detail', 'lasar_history',
  'lasar_lock_version', 'lasar_reset_proposal', 'lasar_rules', 'lasar_school_days', 'lasar_set_term', 'phase4_register_selection',
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
    for (const p of ['work/pilot/lasar-fixtures.mjs', 'work/pilot/verify-lasar.mjs']) for (const word of FORBIDDEN_DEMO) assert.ok(!file(p).includes(word), p);
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
    const key = `klass:${f.classes.group}`, gd = schoolDay(lasarSchoolYear(s.last.detail), `${YEAR}-09-06`);
    await t`insert into public.school_year_group_days(school_year_id,group_key,day,cause) values(${s.v},${key},${gd},'friluftsdag')`;
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
      'Version 2, the Pitfall 6 calendar and one group day are inserted directly by the owner (marked synthetic); reopen comes in a later plan',
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
    for (const run of [tracer, flow]) {
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
