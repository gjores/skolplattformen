#!/usr/bin/env node
// 05.1.1-10 (D-01, D-02, D-05, D-06, D-08, D-13, D-14, D-15): huvudmannens ram och arbetssättet per läsår, prövade i SQL.
//   node work/pilot/verify-lasar-frames.mjs --ephemeral --out /private/tmp/lasar-frames.json
// Egen PostgreSQL byggd från repots migrationer och syntetiska fixturer (createLasarFixture); inget installerat mål ändras.
// Ingen HTTP/OIDC och ingen Worker: engångskoden för beslut prövas i rutten (lasar.test.mjs), den faktiska kedjan i plan 15.
// Läsåret har börjat när app_today() >= 1 augusti läsårets startår (användarbeslut 2026-11-10, alternativ a); det prövas med
// app.fake_today per fall.
// SS 12000 (SIS OpenAPI 2.1.0, SS12000:2020): ramen och arbetssättet saknar objekt i standarden. Ramen nycklas på huvudmannens ID
// (organizers.id, Organisation med organisationType=Huvudman) och läsåret, aldrig på namn. Inget utbyte påstås.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createCommand, createLasarFixture, frameCommand, frameCreateCommand, frameDecision, frameTarget, lasarCommand, lasarDecision, lasarMigrations, lasarRead,
  lasarSend, lasarStatus, school,
} from './lasar-fixtures.mjs';
import { TJANST_MIGRATION_REGISTRY } from './tjanst-migration-state.mjs';
import { lasarSchoolYear, parseLasarCommandReply, parseLasarDecisionReply, parseLasarEnvelope, parseLasarModePreviewReply, parseLasarReadReply } from '../../web/lib/lasar-contract.ts';
import { lasarContentHash } from '../../web/lib/lasar-content.ts';
import { frameChanges, frameDeviation } from '../../web/lib/lasar-frame.ts';
import { addDays, dayInfo } from '../../web/lib/lasar-model.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const rollback = Error('expected_lasar_frames_rollback');
const YEAR = 2027;
const TYPES = ['GR', 'GY'];
export const FRAME_MIGRATION = 'supabase/migrations/20261112120000_lasar_frames.sql';
export const FRAME_TABLES = Object.freeze(['school_year_frame_days', 'school_year_frame_events', 'school_year_frame_settings', 'school_year_frames']);
/** Installerade på 3012 och låsta (05.1.1-TIDIGT-PROV.md). */
const FROZEN = Object.freeze({
  'supabase/migrations/20261111100000_lasar_versions.sql': '10961843a52192d38c962d0c9311d97538e9f8f4bba446868b02505ccb3f3f66',
  'supabase/migrations/20261111190000_lasar_worker_access.sql': '3b95e261bc48e8df8f8bbcdedbf9005050658ac6419c0e123208436e7216027c',
});
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
const weekday = d => new Date(`${d}T12:00:00Z`).getUTCDay();
/** Närmaste vardag efter d (helgdagar kring mitten av juni och december finns inte på de dagar provet använder). */
const nextWeekday = (d, n = 1) => { let x = d; for (let i = 0; i < n; i += 1) { x = addDays(x, 1); while ([0, 6].includes(weekday(x))) x = addDays(x, 1); } return x; };
const prevWeekday = d => { let x = addDays(d, -1); while ([0, 6].includes(weekday(x))) x = addDays(x, -1); return x; };
const schoolDay = (sy, from) => { let d = from; while (dayInfo(sy, d).status !== 'skoldag') d = addDays(d, 1); return d; };

function staticChecks(report) {
  const file = p => readFileSync(resolve(root, p), 'utf8');
  const sha = p => createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex');
  const record = (name, fn) => { try { fn(); report.cases.push({ name, status: 'PASS' }); } catch (e) { report.cases.push({ name, status: 'FAIL', message: String(e.message).slice(0, 500) }); } };
  // 05.1.1-11: kopieringens fil sorterar efter ramens fil, så ramens fil står inte längre sist.
  record('ramfilen finns, står direkt efter ändringsbegärans fil i lasarMigrations och i registret med samma SHA-256', () => {
    assert.ok(existsSync(resolve(root, FRAME_MIGRATION)));
    assert.equal(lasarMigrations[lasarMigrations.indexOf(FRAME_MIGRATION) - 1], 'supabase/migrations/20261112110000_lasar_change_requests.sql');
    assert.equal(TJANST_MIGRATION_REGISTRY.find(m => m.file === FRAME_MIGRATION)?.sha256, sha(FRAME_MIGRATION));
  });
  record('ramfilen ger inga rättigheter, lägger inte till enumvärden och stänger inte av triggrar', () => {
    const sql = file(FRAME_MIGRATION);
    assert.equal(sql.split('\n').filter(l => !l.trim().startsWith('--') && /\bgrant\b/iu.test(l)).length, 0);
    assert.equal((sql.match(/add value/giu) ?? []).length, 0);
    assert.ok(!/session_replication_role|disable\s+trigger/iu.test(sql));
  });
  record('de installerade kalenderfilerna är orörda (hash som i registret och på 3012)', () => {
    for (const [p, h] of Object.entries(FROZEN)) { assert.equal(sha(p), h, p); assert.equal(TJANST_MIGRATION_REGISTRY.find(m => m.file === p)?.sha256, h, p); }
  });
  record('inga demofunktioner i ramens prov', () => {
    for (const word of FORBIDDEN_DEMO) assert.ok(!file('work/pilot/verify-lasar-frames.mjs').includes(word));
  });
}

async function structure(t, step) {
  await step(t, 'ramtabellerna har tvingad RLS utan policyer och inga rättigheter för Worker eller klientroller', async u => {
    for (const table of FRAME_TABLES) {
      const [rls] = await u`select relrowsecurity r, relforcerowsecurity f from pg_class where oid=${'public.' + table}::regclass`;
      assert.ok(rls?.r && rls?.f, table);
      assert.equal((await u`select count(*)::int n from pg_policy where polrelid=${'public.' + table}::regclass`)[0].n, 0, table);
      for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
        assert.equal((await u`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') v`)[0].v, false, `${role}:${table}`);
    }
  });
  await step(t, 'school_years har frame_id och frame_ack_id med främmande nycklar till ramversionen hos samma huvudman och läsår', async u => {
    const fks = (await u`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.school_years'::regclass and contype='f' and pg_get_constraintdef(oid) like '%school_year_frames%' order by 1`).map(r => r.d);
    assert.deepEqual(fks, ['FOREIGN KEY (frame_ack_id, organizer_id, start_year) REFERENCES school_year_frames(id, organizer_id, start_year)',
      'FOREIGN KEY (frame_id, organizer_id, start_year) REFERENCES school_year_frames(id, organizer_id, start_year)']);
  });
  await step(t, 'en öppen ramversion per huvudman och läsår (partiellt unikt index) och unik versionsnyckel', async u => {
    const [idx] = await u`select indexdef d from pg_indexes where schemaname='public' and indexname='school_year_frames_one_open'`;
    assert.match(idx.d, /UNIQUE INDEX .*\(organizer_id, start_year\) WHERE \(status = 'utkast'::text\)/u);
    const cons = (await u`select pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.school_year_frames'::regclass and contype='u' order by 1`).map(r => r.d);
    assert.deepEqual(cons, ['UNIQUE (id, organizer_id, start_year)', 'UNIQUE (organizer_id, start_year, version)']);
  });
  // 05.1.1-11: överblicken (lasar_overview) har en egen grant-fil efter kopieringsfilen; ramen ger fortfarande ingen ny ingång.
  // 05.1.1-13: sammanfattningen (lasar_summary) har en egen grant-fil efter sammanfattningens fil.
  await step(t, 'Workern får bara execute på lasar_read, lasar_command, lasar_status, lasar_overview och lasar_summary (ramen ger ingen ny ingång)', async u => {
    const rows = await u`select p.oid::regprocedure::text s, has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') w,
      has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('service_role',p.oid,'EXECUTE') c
      from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'lasar\\_%' order by 1`;
    assert.deepEqual(rows.filter(r => r.w).map(r => r.s), ['lasar_command(jsonb)', 'lasar_overview(jsonb)', 'lasar_read(jsonb)', 'lasar_status(jsonb)', 'lasar_summary(jsonb)']);
    assert.deepEqual(rows.filter(r => r.c).map(r => r.s), []);
  });
}

async function invariant(t, step) {
  const readers = async u => [...new Set((await u`select p.proname n from pg_proc p where p.pronamespace='public'::regnamespace and p.prosrc ~ 'school_year_frame' order by 1`).map(r => r.n))];
  await step(t, 'invariant: bara lasar_*-funktioner läser ramtabellerna (tjänstefördelning och timplaner läser aldrig ramen)', async u => {
    const found = await readers(u);
    assert.ok(found.length >= 5, String(found));
    assert.deepEqual(found.filter(n => !n.startsWith('lasar_')), []);
    const tjanst = await u`select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname ~ '^(tjanst|phase5|timplan)' and p.prosrc ~ 'frame_id|school_year_frame'`;
    assert.equal(tjanst[0].n, 0);
  });
  await step(t, 'invariant: en ny läsare utanför lasar_* gör provet rött', async u => {
    await u.unsafe(`create function public.frame_probe_reader() returns integer language sql as 'select count(*)::integer from public.school_year_frames'`);
    assert.ok((await readers(u)).filter(n => !n.startsWith('lasar_')).includes('frame_probe_reader'));
  });
}

/** Hela kedjan i en transaktion som rullas tillbaka: arbetssätt, ramutkast, utgivning, skolans start, avvikelse och ny utgivning. */
async function frames(t, step, f) {
  const A = f.schools.A, B = f.schools.B;
  const env = (raw, name) => parseLasarEnvelope(raw, actorOf(f, name));
  const readSchool = async (name, unitId, versionId = null) => {
    await f.actor(t, name);
    const q = { target: school(unitId), schoolYear: YEAR, versionId };
    return parseLasarReadReply(env(await lasarRead(t, q), name), q);
  };
  const readFrame = async (name = 'hm', versionId = null) => {
    await f.actor(t, name);
    const q = { target: frameTarget(), schoolYear: YEAR, versionId };
    return parseLasarReadReply(env(await lasarRead(t, q), name), q);
  };
  const send = async (name, q) => { await f.actor(t, name); return parseLasarCommandReply(env(await lasarSend(t, q), name), q); };
  const decide = async (name, q) => { await f.actor(t, name); return parseLasarDecisionReply(env(await lasarSend(t, q), name), q); };
  const deny = (name, q, code, hint) => denied(t, async u => { await f.actor(u, name); await lasarSend(u, q); }, code, hint);
  const denyRead = (name, q, code, hint) => denied(t, async u => { await f.actor(u, name); await lasarRead(u, q); }, code, hint);
  const today = async d => { await t`select set_config('app.fake_today', ${d ?? ''}, true)`; };
  const preview = async mode => { await f.actor(t, 'hm'); return parseLasarModePreviewReply(env(await lasarSend(t, frameDecision({ schoolYear: YEAR, action: 'preview_mode_change', mode })), 'hm')); };
  const hashOf = async id => (await t`select public.lasar_content_hash(${id}) h`)[0].h;
  const rowsOf = async id => ({
    year: (await t`select ht_start::text, ht_end::text, vt_start::text, vt_end::text, status::text, revision, frame_id, frame_ack_id from public.school_years where id=${id}`)[0],
    days: [...await t`select day::text, kind::text, note from public.school_year_days where school_year_id=${id} order by day`],
  });
  const frameRow = async id => (await t`select status, version, revision, previous_id, published_on::text, message, content_hash from public.school_year_frames where id=${id}`)[0];
  const content = c => ({ terms: c.terms, exceptions: c.exceptions, groupDays: c.groupDays, shortWeeks: c.shortWeeks, frameVersionId: c.frameVersionId, version: c.version });
  const fcmd = (ops, versionId, rev) => frameCommand({ schoolYear: YEAR, versionId, expectedRevision: rev, ops });
  const scmd = (unitId, ops, versionId = null, rev = null) => lasarCommand({ unitId, schoolYear: YEAR, versionId, expectedRevision: rev, ops });
  const s = {};

  await step(t, 'utan inställning gäller eget förslag: skolan har ingen ram och kan skapa förslag', async () => {
    const r = await readSchool('principalA', A);
    assert.equal(r.mode, 'eget'); assert.equal(r.modeLocked, false); assert.equal(r.frame, null); assert.deepEqual(r.capabilities.canCreate, ['proposal', 'copy']);
    assert.equal((await t`select count(*)::int n from public.school_year_frame_settings where organizer_id=${f.id(2)}`)[0].n, 0);
  });
  await step(t, 'huvudmannen läser ramens mål: ingen ram, eget förslag, kan skapa ram och byta arbetssätt', async () => {
    const r = await readFrame();
    assert.deepEqual(r.target, { kind: 'frame' }); assert.equal(r.schoolName, 'Huvudmannens ram'); assert.equal(r.calendar, null); assert.deepEqual(r.versions, []);
    assert.equal(r.mode, 'eget'); assert.equal(r.modeLocked, false); assert.deepEqual(r.schoolTypes, TYPES);
    assert.deepEqual(r.capabilities.canCreate, ['proposal', 'copy']); assert.equal(r.capabilities.canSetMode, true); assert.equal(r.capabilities.canPublishFrame, false);
    assert.equal(r.capabilities.canSubmit || r.capabilities.canApprove || r.capabilities.canComment, false);
    assert.equal(r.frame, null); assert.deepEqual(r.groups, []);
  });
  await step(t, 'rektor och skoladministratör når inte ramens mål: läsning, ramkommando, förhandsvisning, byte och utgivning nekas (T-05.1.1-31)', async () => {
    const q = { target: frameTarget(), schoolYear: YEAR, versionId: null };
    for (const name of ['principalA', 'admin', 'principalAB']) await denyRead(name, q, '42501');
    await deny('principalA', await frameCreateCommand(YEAR, TYPES), '42501');
    await deny('admin', frameDecision({ schoolYear: YEAR, action: 'preview_mode_change', mode: 'ram' }), '42501');
    await deny('principalA', frameDecision({ schoolYear: YEAR, action: 'set_mode', mode: 'ram' }), '42501');
    await deny('principalB', frameDecision({ schoolYear: YEAR, action: 'publish_frame', versionId: f.id(99), expectedRevision: 1 }), '42501');
  });
  await step(t, 'ramens beslut på en skolas mål nekas', async () => {
    await deny('hm', { ...lasarDecision({ unitId: A, schoolYear: YEAR, versionId: null, expectedRevision: null, action: 'set_mode' }), mode: 'ram' }, '22023', 'lasar_invalid');
  });
  await step(t, 'rektor A påbörjar en kalender i eget förslag', async () => {
    s.a = await send('principalA', await createCommand(A, YEAR, f.schoolTypes.A));
    s.aId = s.a.detail.calendar.versionId; s.aHash = await hashOf(s.aId); s.aRows = await rowsOf(s.aId);
    assert.equal(s.a.detail.calendar.frameVersionId, null);
  });
  await step(t, 'förhandsvisningen listar skolor med påbörjade kalendrar och sparar inget (D-15)', async () => {
    const p = await preview('ram');
    assert.equal(p.mode, 'ram'); assert.equal(p.schoolYear, YEAR);
    assert.deepEqual(p.affected, [{ unitId: A, schoolName: 'Syntetisk skola A', status: 'utkast' }]);
    assert.equal((await t`select count(*)::int n from public.school_year_frame_settings`)[0].n, 0);
    assert.equal((await t`select count(*)::int n from public.lasar_commands where organizer_id=${f.id(2)} and action='preview_mode_change'`)[0].n, 0);
  });
  await step(t, 'byte med en annan skollista än den aktuella nekas och ändrar inget', async () => {
    for (const list of [[], [A, B], [B]]) await deny('hm', frameDecision({ schoolYear: YEAR, action: 'set_mode', mode: 'ram', confirmAffected: list }), '40001', 'lasar_revision_conflict');
    await deny('hm', frameDecision({ schoolYear: YEAR, action: 'preview_mode_change', mode: 'ram', confirmAffected: [A] }), '22023', 'lasar_invalid');
    assert.equal((await readFrame()).mode, 'eget');
  });
  await step(t, 'byte med den bekräftade listan sparar arbetssättet ram; den påbörjade kalendern är oförändrad (D-15, T-05.1.1-32)', async () => {
    const r = await decide('hm', frameDecision({ schoolYear: YEAR, action: 'set_mode', mode: 'ram', confirmAffected: [A] }));
    assert.equal(r.detail.mode, 'ram'); assert.deepEqual(r.detail.target, { kind: 'frame' });
    assert.equal(await hashOf(s.aId), s.aHash); assert.deepEqual(await rowsOf(s.aId), s.aRows);
    const a = await readSchool('principalA', A);
    assert.equal(a.mode, 'ram'); assert.equal(a.calendar.versionId, s.aId);
    assert.deepEqual(a.frame, { current: null, latest: null, acknowledgedVersionId: null });
    const [row] = await t`select mode, start_year, updated_by_assignment from public.school_year_frame_settings where organizer_id=${f.id(2)}`;
    assert.deepEqual({ ...row }, { mode: 'ram', start_year: YEAR, updated_by_assignment: f.roles.hm });
  });
  await step(t, 'en annan huvudman påverkas inte: ramen och arbetssättet nycklas på huvudmannens ID (SS 12000)', async () => {
    const r = await readFrame('foreignHm');
    assert.equal(r.mode, 'eget'); assert.deepEqual(r.versions, []);
    assert.equal((await t`select count(*)::int n from public.school_year_frame_settings where organizer_id=${f.id(4)}`)[0].n, 0);
  });
  await step(t, 'arbetssättet låses från 1 augusti läsårets startår och kan inte bytas (D-01, beslut a)', async () => {
    try {
      await today(`${YEAR}-07-31`);
      let r = await readFrame();
      assert.equal(r.modeLocked, false); assert.equal(r.capabilities.canSetMode, true);
      await today(`${YEAR}-08-01`);
      r = await readFrame();
      assert.equal(r.modeLocked, true); assert.equal(r.capabilities.canSetMode, false);
      assert.equal((await readSchool('principalA', A)).modeLocked, true);
      await deny('hm', frameDecision({ schoolYear: YEAR, action: 'preview_mode_change', mode: 'eget' }), '40001', 'lasar_mode_locked');
      await deny('hm', frameDecision({ schoolYear: YEAR, action: 'set_mode', mode: 'eget', confirmAffected: [A] }), '40001', 'lasar_mode_locked');
      assert.equal(r.mode, 'ram');
    } finally { await today(null).catch(() => undefined); }
  });
  await step(t, 'i arbetssättet ram utan utgiven ram kan rektor inte börja: förslag, ram och kopia nekas med lasar_frame_missing (D-14)', async () => {
    const r = await readSchool('principalB', B);
    assert.equal(r.mode, 'ram'); assert.deepEqual(r.capabilities.canCreate, []); assert.deepEqual(r.frame, { current: null, latest: null, acknowledgedVersionId: null });
    await deny('principalB', await createCommand(B, YEAR, ['GR']), '40001', 'lasar_frame_missing');
    await deny('principalB', await scmd(B, [{ op: 'create', source: 'frame' }]), '40001', 'lasar_frame_missing');
    await deny('principalB', await scmd(B, [{ op: 'create', source: 'copy' }]), '40001', 'lasar_frame_missing');
    assert.equal((await t`select count(*)::int n from public.school_years where unit_id=${B}`)[0].n, 0);
  });
  await step(t, 'huvudmannen skapar ramutkast ur helgdagar och vanliga lov (förslaget framräknat som i servern för huvudmannens skolformer)', async () => {
    const q = await frameCreateCommand(YEAR, TYPES);
    const r = await send('hm', q);
    const c = r.detail.calendar;
    assert.equal(c.status, 'utkast'); assert.equal(c.version, 1); assert.equal(c.revision, 1); assert.equal(c.frameVersionId, null);
    assert.deepEqual(c.terms, q.proposal.terms); assert.deepEqual(c.exceptions, q.proposal.exceptions);
    assert.deepEqual(c.groupDays, {}); assert.deepEqual(c.shortWeeks, {});
    assert.deepEqual(r.detail.versions.map(v => [v.version, v.status, v.current]), [[1, 'utkast', false]]);
    assert.equal(r.detail.capabilities.canEdit, true); assert.equal(r.detail.capabilities.canPublishFrame, true); assert.deepEqual(r.detail.capabilities.canCreate, []);
    assert.deepEqual([c.history[0].action, c.history[0].role, c.history[0].actorName], ['Ram skapad', 'huvudman', 'Syntetisk hm']);
    s.f1 = c.versionId; s.f1rev = c.revision; s.f1sy = lasarSchoolYear(r.detail); s.f1create = q;
  });
  await step(t, 'återspelning av ramens kommando ger samma svar; statusvägen ger utfallet bara för huvudmannen', async () => {
    const again = await send('hm', s.f1create);
    assert.equal(again.receipt.replayed, true);
    await f.actor(t, 'hm');
    const st = parseLasarEnvelope(await lasarStatus(t, { commandId: s.f1create.commandId, target: frameTarget(), schoolYear: YEAR }), actorOf(f, 'hm'));
    assert.equal(st.state, 'completed'); assert.equal(st.result.receipt.commandId, s.f1create.commandId); assert.equal(st.result.detail.calendar.versionId, s.f1);
    await denied(t, async u => { await f.actor(u, 'principalA'); await lasarStatus(u, { commandId: s.f1create.commandId, target: frameTarget(), schoolYear: YEAR }); }, '42501');
    const [row] = await t`select unit_id, school_year_id, frame_id from public.lasar_commands where command_id=${s.f1create.commandId}`;
    assert.deepEqual({ ...row }, { unit_id: null, school_year_id: null, frame_id: s.f1 });
  });
  await step(t, 'ett andra ramutkast nekas; ramen har inga gruppdagar, korta veckor eller kommentarer', async () => {
    await deny('hm', await frameCreateCommand(YEAR, TYPES), '40001', 'lasar_revision_conflict');
    const day = schoolDay(s.f1sy, `${YEAR}-09-06`);
    await deny('hm', await fcmd([{ op: 'set_group_days', groupId: `klass:${f.groups.classes.ak1}`, dates: [day], cause: 'friluftsdag' }], s.f1, s.f1rev), '22023', 'lasar_invalid');
    await deny('hm', await fcmd([{ op: 'comment', text: 'Syntetisk kommentar' }], s.f1, s.f1rev), '22023', 'lasar_invalid');
  });
  await step(t, 'huvudmannen ändrar dagar och terminer i ramutkastet; helgdagar och dagar utanför terminerna nekas', async () => {
    s.study = schoolDay(s.f1sy, `${YEAR}-10-11`);
    s.vtEnd1 = nextWeekday(s.f1sy.vt.end, 3);
    assert.equal(s.vtEnd1.slice(5, 7), '06');
    let r = await send('hm', await fcmd([{ op: 'set_days', dates: [s.study], kind: 'studiedag', note: 'Syntetisk gemensam studiedag' },
      { op: 'set_term', term: 'vt', edge: 'end', date: s.vtEnd1 }], s.f1, s.f1rev));
    r = await send('hm', await fcmd([{ op: 'set_notes', dates: [s.study], note: 'Syntetisk fortbildning för alla skolor' }], s.f1, r.receipt.revision));
    const c = r.detail.calendar;
    assert.equal(c.terms.vt.end, s.vtEnd1); assert.deepEqual(c.exceptions[s.study], { kind: 'studiedag', note: 'Syntetisk fortbildning för alla skolor' });
    assert.equal(c.revision, 3);
    await deny('hm', await fcmd([{ op: 'set_days', dates: [`${YEAR}-12-25`], kind: 'lovdag' }], s.f1, c.revision), '22023', 'lasar_invalid');
    await deny('hm', await fcmd([{ op: 'set_days', dates: [s.study], kind: 'lovdag' }], s.f1, 1), '40001', 'lasar_revision_conflict');
    s.f1rev = c.revision; s.f1sy = lasarSchoolYear(r.detail);
  });
  await step(t, 'rektor ser inte ramen före utgivning (T-05.1.1-34)', async () => {
    const r = await readSchool('principalB', B);
    assert.deepEqual(r.frame, { current: null, latest: null, acknowledgedVersionId: null }); assert.deepEqual(r.capabilities.canCreate, []);
    assert.ok(!JSON.stringify(r).includes(s.f1));
  });
  await step(t, 'huvudmannen ger ut ramen med ett meddelande: version 1 är utgiven med kontrollsumma och historikrad (D-13)', async () => {
    const r = await decide('hm', frameDecision({ schoolYear: YEAR, action: 'publish_frame', versionId: s.f1, expectedRevision: s.f1rev, text: 'Syntetiskt meddelande till rektorerna' }));
    const c = r.detail.calendar, todayIso = (await t`select public.app_today()::text d`)[0].d;
    assert.equal(c.status, 'faststalld'); assert.equal(c.decidedOn, todayIso); assert.equal(c.revision, s.f1rev + 1);
    assert.deepEqual(r.detail.versions.map(v => [v.version, v.status, v.current]), [[1, 'faststalld', true]]);
    assert.equal(r.detail.capabilities.canEdit, false); assert.equal(r.detail.capabilities.canPublishFrame, false); assert.deepEqual(r.detail.capabilities.canCreate, ['frame']);
    assert.deepEqual([c.history[0].action, c.history[0].comment], ['Ramen utgiven', 'Syntetiskt meddelande till rektorerna']);
    const row = await frameRow(s.f1);
    assert.deepEqual([row.status, row.published_on, row.message], ['utgiven', todayIso, 'Syntetiskt meddelande till rektorerna']);
    assert.equal(row.content_hash, await lasarContentHash({ ...content(c), frameVersionId: null })); assert.equal(c.contentHash, row.content_hash);
    s.f1pub = r.detail.calendar;
  });
  await step(t, 'en utgiven ramversion ändras inte, varken med kommando, nytt beslut eller direkt skrivning (D-13)', async () => {
    await deny('hm', await fcmd([{ op: 'set_days', dates: [s.study], kind: 'lovdag' }], s.f1, s.f1pub.revision), '40001', 'lasar_locked_status');
    await deny('hm', frameDecision({ schoolYear: YEAR, action: 'publish_frame', versionId: s.f1, expectedRevision: s.f1pub.revision }), '40001', 'lasar_locked_status');
    await denied(t, u => u`update public.school_year_frames set ht_end=ht_end where id=${s.f1}`, 'P0001');
    await denied(t, u => u`update public.school_year_frames set status='utkast', published_at=null, published_on=null, published_by_assignment=null, content_hash=null, message=null where id=${s.f1}`, 'P0001');
    await denied(t, u => u`delete from public.school_year_frames where id=${s.f1}`, 'P0001');
    await denied(t, u => u`delete from public.school_year_frame_days where frame_id=${s.f1}`, 'P0001');
    await denied(t, u => u`insert into public.school_year_frame_days(frame_id,day,kind) values(${s.f1},${schoolDay(s.f1sy, `${YEAR}-11-15`)},'lovdag')`, 'P0001');
    await denied(t, u => u`update public.school_year_frame_days set note='Syntetisk' where frame_id=${s.f1}`, 'P0001');
    await denied(t, u => u`delete from public.school_year_frame_events where frame_id=${s.f1}`, 'P0001');
  });
  await step(t, 'rektor ser den utgivna ramen och kan utgå från den eller kopiera; förslag och en kopia utan serverns innehåll nekas i arbetssättet ram (D-02)', async () => {
    const r = await readSchool('principalB', B);
    assert.deepEqual(r.capabilities.canCreate, ['frame', 'copy']);
    assert.equal(r.frame.current, null); assert.equal(r.frame.latest.versionId, s.f1); assert.equal(r.frame.latest.version, 1);
    assert.deepEqual(r.frame.latest.terms, s.f1pub.terms); assert.deepEqual(r.frame.latest.exceptions, s.f1pub.exceptions); assert.equal(r.frame.latest.publishedOn, s.f1pub.decidedOn);
    await deny('principalB', await createCommand(B, YEAR, ['GR']), '22023', 'lasar_invalid');
    await deny('principalB', await scmd(B, [{ op: 'create', source: 'copy' }]), '22023', 'lasar_invalid');
  });
  await step(t, 'rektor B utgår från ramen: utkastet har ramens terminer och dagar, och frame_id och kvitterad version är den utgivna', async () => {
    const r = await send('principalB', await scmd(B, [{ op: 'create', source: 'frame' }]));
    const c = r.detail.calendar;
    assert.equal(c.status, 'utkast'); assert.equal(c.version, 1); assert.equal(c.frameVersionId, s.f1);
    assert.deepEqual(c.terms, s.f1pub.terms); assert.deepEqual(c.exceptions, s.f1pub.exceptions);
    assert.equal(r.detail.frame.current.versionId, s.f1); assert.equal(r.detail.frame.latest.versionId, s.f1); assert.equal(r.detail.frame.acknowledgedVersionId, s.f1);
    assert.equal(c.history[0].action, 'Utgår från huvudmannens ram');
    assert.equal(c.contentHash, await lasarContentHash(content(c)));
    const row = await rowsOf(c.versionId);
    assert.deepEqual([row.year.frame_id, row.year.frame_ack_id], [s.f1, s.f1]);
    assert.deepEqual(frameDeviation(lasarSchoolYear(r.detail), r.detail.frame.current), []);
    s.b = c.versionId; s.brev = c.revision; s.bsy = lasarSchoolYear(r.detail);
    await deny('principalB', await scmd(B, [{ op: 'create', source: 'frame' }]), '40001', 'lasar_revision_conflict');
  });
  await step(t, 'rektor ändrar terminsdatum och dagar mot ramen; avvikelsen syns för rektor och för huvudmannen inför fastställande (D-06)', async () => {
    s.vtEndB = nextWeekday(s.f1pub.terms.vt.end);
    s.conflictDay = schoolDay(s.bsy, `${YEAR}-10-04`); s.ownDay = schoolDay(s.bsy, `${YEAR}-11-15`);
    const r = await send('principalB', await scmd(B, [{ op: 'set_term', term: 'vt', edge: 'end', date: s.vtEndB },
      { op: 'set_days', dates: [s.conflictDay], kind: 'studiedag', note: 'Syntetisk skolans studiedag' },
      { op: 'set_days', dates: [s.ownDay], kind: 'studiedag', note: 'Syntetisk egen studiedag' }], s.b, s.brev));
    s.brev = r.receipt.revision;
    const keys = sy => frameDeviation(sy, r.detail.frame.current).map(d => d.key);
    assert.deepEqual(keys(lasarSchoolYear(r.detail)), ['term:vt:end', `day:${s.conflictDay}`, `day:${s.ownDay}`]);
    const h = await readSchool('hm', B);
    assert.equal(h.mode, 'ram'); assert.deepEqual(h.frame, r.detail.frame);
    assert.deepEqual(frameDeviation(lasarSchoolYear(h), h.frame.current).find(d => d.key === 'term:vt:end'), { key: 'term:vt:end', school: s.vtEndB, frame: s.f1pub.terms.vt.end });
    assert.equal(h.capabilities.canEdit, false);
  });
  await step(t, 'huvudmannen gör en ny ramversion ur den utgivna; utkastet syns inte för rektor och ett andra utkast nekas (D-13)', async () => {
    const r = await send('hm', await fcmd([{ op: 'create', source: 'frame' }], null, null));
    const c = r.detail.calendar;
    assert.equal(c.version, 2); assert.equal(c.status, 'utkast'); assert.deepEqual(c.terms, s.f1pub.terms); assert.deepEqual(c.exceptions, s.f1pub.exceptions);
    assert.deepEqual(r.detail.versions.map(v => [v.version, v.status, v.current]), [[1, 'faststalld', true], [2, 'utkast', false]]);
    assert.equal(c.history[0].action, 'Ny ramversion');
    assert.equal((await frameRow(c.versionId)).previous_id, s.f1);
    s.f2 = c.versionId; s.f2rev = c.revision;
    assert.equal((await readSchool('principalB', B)).frame.latest.versionId, s.f1);
    await deny('hm', await fcmd([{ op: 'create', source: 'frame' }], null, null), '40001', 'lasar_revision_conflict');
  });
  await step(t, 'en ny utgivning ändrar inget i skolornas kalendrar: samma lasar_content_hash och samma rader före och efter (T-05.1.1-32, D-05)', async () => {
    s.applyDay = schoolDay(s.bsy, `${YEAR}-09-20`);
    s.htEnd2 = prevWeekday(s.f1pub.terms.ht.end);
    let r = await send('hm', await fcmd([{ op: 'set_days', dates: [s.applyDay], kind: 'lovdag', note: 'Syntetisk lovdag i ramen' },
      { op: 'set_days', dates: [s.conflictDay], kind: 'lovdag', note: 'Syntetisk lovdag i ramen' },
      { op: 'set_term', term: 'ht', edge: 'end', date: s.htEnd2 }], s.f2, s.f2rev));
    const before = { a: await hashOf(s.aId), b: await hashOf(s.b), aRows: await rowsOf(s.aId), bRows: await rowsOf(s.b) };
    assert.equal(before.a, s.aHash);
    r = await decide('hm', frameDecision({ schoolYear: YEAR, action: 'publish_frame', versionId: s.f2, expectedRevision: r.receipt.revision }));
    s.f2pub = r.detail.calendar;
    assert.equal(s.f2pub.status, 'faststalld');
    assert.deepEqual(r.detail.versions.map(v => [v.version, v.current]), [[1, false], [2, true]]);
    assert.deepEqual({ a: await hashOf(s.aId), b: await hashOf(s.b), aRows: await rowsOf(s.aId), bRows: await rowsOf(s.b) }, before);
  });
  await step(t, 'skolan får en markering: frame.latest är den nya versionen men frame.current och den kvitterade versionen är kvar (D-05)', async () => {
    const r = await readSchool('principalB', B);
    assert.equal(r.frame.current.versionId, s.f1); assert.equal(r.frame.latest.versionId, s.f2); assert.equal(r.frame.acknowledgedVersionId, s.f1);
    const ch = frameChanges(r.frame.current, r.frame.latest, lasarSchoolYear(r));
    assert.deepEqual(ch.apply.map(c => c.key), ['term:ht:end', `day:${s.applyDay}`]);
    assert.deepEqual(ch.conflicts.map(c => c.key), [`day:${s.conflictDay}`]);
    assert.deepEqual(ch.own.map(c => c.key), ['term:vt:end', `day:${s.ownDay}`]);
    const a = await readSchool('principalA', A);
    assert.equal(a.frame.current, null); assert.equal(a.frame.latest.versionId, s.f2); assert.equal(a.frame.acknowledgedVersionId, null);
  });
  await intake(t, step, f, { s, readSchool, send, decide, deny, today, hashOf, rowsOf, scmd });
}

/**
 * Uppgift 2 (05.1.1-10, D-05, D-10, D-12, D-15): intag och kvittering av ramens ändringar. Bas = skolans frame_id, deras = senast
 * utgivna ram, våra = skolans kalender. En nyckel tas in bara om ramen har ändrat den (deras ≠ bas) och skolan inte redan har
 * ramens värde; en konflikt (skolan har också ändrat) tas in bara när nyckeln anges. Varje fall körs i en sparpunkt som rullas
 * tillbaka, så att fallen utgår från samma läge.
 */
async function intake(t, step, f, { s, readSchool, send, decide, deny, today, hashOf, rowsOf, scmd }) {
  const A = f.schools.A, B = f.schools.B;
  const rolledBack = async fn => { const sentinel = Error('intake_rollback'); try { await t.savepoint(async u => { await fn(u); throw sentinel; }); } catch (e) { if (e !== sentinel) throw e; } };
  const take = (unitId, versionId, rev, accepted, frameVersionId = s.f2) => scmd(unitId, [{ op: 'take_frame_changes', frameVersionId, accepted }], versionId, rev);
  const keep = (unitId, versionId, rev, frameVersionId = s.f2) => scmd(unitId, [{ op: 'keep_school_calendar', frameVersionId }], versionId, rev);
  const key = d => `day:${d}`;
  const dec = (unitId, action, text, versionId, rev) => lasarDecision({ unitId, schoolYear: YEAR, versionId, expectedRevision: rev, action, text });

  await step(t, 'intag och kvittering mot en äldre ramversion nekas med lasar_frame_stale', async () => {
    await deny('principalB', await take(B, s.b, s.brev, [key(s.applyDay)], s.f1), '40001', 'lasar_frame_stale');
    await deny('principalB', await keep(B, s.b, s.brev, s.f1), '40001', 'lasar_frame_stale');
    await deny('principalB', await take(B, s.b, s.brev, [key(s.applyDay)], f.id(98)), '40001', 'lasar_frame_stale');
  });
  await step(t, 'en nyckel där bara skolan har ändrat eller där ramen inte har ändrats nekas med lasar_frame_stale; inget skrivs', async () => {
    const before = await rowsOf(s.b);
    for (const k of ['term:vt:end', key(s.ownDay), key(s.study), 'term:ht:start', key(`${YEAR}-10-12`)])
      await deny('principalB', await take(B, s.b, s.brev, [key(s.applyDay), k]), '40001', 'lasar_frame_stale');
    assert.deepEqual(await rowsOf(s.b), before);
  });
  await step(t, 'huvudmannen tar inte in ramen åt skolan (D-18, T-05.1.1-31)', async () => {
    await deny('hm', await take(B, s.b, s.brev, [key(s.applyDay)]), '42501');
    await deny('hm', await keep(B, s.b, s.brev), '42501');
  });
  await step(t, 'intag av ändringar som skolan inte har rört skriver ramens värden och flyttar frame_id och frame_ack_id; konflikten och skolans egna avvikelser ligger kvar (D-05)', async () => {
    await rolledBack(async () => {
      const r = await send('principalB', await take(B, s.b, s.brev, ['term:ht:end', key(s.applyDay)]));
      const c = r.detail.calendar;
      assert.equal(c.terms.ht.end, s.htEnd2); assert.equal(c.terms.vt.end, s.vtEndB);
      assert.deepEqual(c.exceptions[s.applyDay], { kind: 'lovdag', note: 'Syntetisk lovdag i ramen' });
      assert.deepEqual(c.exceptions[s.conflictDay], { kind: 'studiedag', note: 'Syntetisk skolans studiedag' });
      assert.deepEqual(c.exceptions[s.ownDay], { kind: 'studiedag', note: 'Syntetisk egen studiedag' });
      assert.equal(c.frameVersionId, s.f2);
      assert.deepEqual([r.detail.frame.current.versionId, r.detail.frame.latest.versionId, r.detail.frame.acknowledgedVersionId], [s.f2, s.f2, s.f2]);
      assert.deepEqual([c.history[0].action, c.history[0].comment], ['Ramens ändringar intagna', '2 ändringar från ramens version 2.']);
      const row = await rowsOf(s.b);
      assert.deepEqual([row.year.frame_id, row.year.frame_ack_id], [s.f2, s.f2]);
      assert.deepEqual(frameDeviation(lasarSchoolYear(r.detail), r.detail.frame.current).map(d => d.key), ['term:vt:end', key(s.conflictDay), key(s.ownDay)]);
      assert.equal(c.contentHash, await lasarContentHash({ terms: c.terms, exceptions: c.exceptions, groupDays: c.groupDays, shortWeeks: c.shortWeeks, frameVersionId: s.f2, version: 1 }));
    });
  });
  await step(t, 'en konflikt tas in bara när nyckeln anges uttryckligen', async () => {
    await rolledBack(async () => {
      const r = await send('principalB', await take(B, s.b, s.brev, [key(s.conflictDay)]));
      assert.deepEqual(r.detail.calendar.exceptions[s.conflictDay], { kind: 'lovdag', note: 'Syntetisk lovdag i ramen' });
      assert.equal(r.detail.calendar.exceptions[s.applyDay], undefined, 'den ej angivna ändringen tas inte in');
      assert.equal(r.detail.calendar.terms.ht.end, s.f1pub.terms.ht.end);
    });
  });
  await step(t, 'Behåll skolans kalender kvitterar ramversionen: bara frame_ack_id flyttas, dagarna och kontrollsumman är oförändrade', async () => {
    await rolledBack(async () => {
      const before = await rowsOf(s.b), hash = await hashOf(s.b);
      const r = await send('principalB', await keep(B, s.b, s.brev));
      const after = await rowsOf(s.b);
      assert.deepEqual(after.days, before.days);
      assert.deepEqual({ ...after.year, revision: 0, frame_ack_id: null }, { ...before.year, revision: 0, frame_ack_id: null });
      assert.deepEqual([after.year.frame_id, after.year.frame_ack_id], [s.f1, s.f2]);
      assert.equal(await hashOf(s.b), hash);
      assert.deepEqual([r.detail.frame.current.versionId, r.detail.frame.latest.versionId, r.detail.frame.acknowledgedVersionId], [s.f1, s.f2, s.f2]);
      assert.equal(r.detail.calendar.history[0].action, 'Skolans kalender behållen');
      await deny('principalB', await keep(B, s.b, r.receipt.revision), '40001', 'lasar_frame_stale');
    });
  });
  await step(t, 'en skola som började i eget förslag (ingen ramversion) tar in ramens värde bara uttryckligen och kan kvittera (D-15)', async () => {
    await rolledBack(async () => {
      const a = await readSchool('principalA', A);
      const same = Object.keys(s.f2pub.exceptions).find(d => JSON.stringify(a.calendar.exceptions[d]) === JSON.stringify(s.f2pub.exceptions[d]));
      assert.ok(same);
      await deny('principalA', await take(A, s.aId, a.calendar.revision, [key(same)]), '40001', 'lasar_frame_stale');
      const r = await send('principalA', await take(A, s.aId, a.calendar.revision, [key(s.applyDay)]));
      assert.deepEqual(r.detail.calendar.exceptions[s.applyDay], { kind: 'lovdag', note: 'Syntetisk lovdag i ramen' });
      assert.deepEqual([r.detail.frame.current.versionId, r.detail.frame.acknowledgedVersionId], [s.f2, s.f2]);
    });
    await rolledBack(async () => {
      const a = await readSchool('principalA', A);
      const r = await send('principalA', await keep(A, s.aId, a.calendar.revision));
      assert.deepEqual([r.detail.frame.current, r.detail.frame.acknowledgedVersionId], [null, s.f2]);
      assert.equal(await hashOf(s.aId), s.aHash);
    });
  });
  await step(t, 'en fastställd skolkalender får bara markering; intag kräver ny version, och i den nya versionen är passerade dagar låsta (D-10, D-12)', async () => {
    await rolledBack(async () => {
      try {
        const sub = await decide('principalB', dec(B, 'submit', 'Syntetiskt förslag', s.b, s.brev));
        const ok = await decide('hm', dec(B, 'approve', 'Syntetiskt beslut', s.b, sub.receipt.revision));
        const r = await readSchool('principalB', B);
        assert.equal(r.calendar.status, 'faststalld'); assert.equal(r.frame.latest.versionId, s.f2); assert.equal(r.frame.acknowledgedVersionId, s.f1);
        await deny('principalB', await take(B, s.b, ok.receipt.revision, [key(s.applyDay)]), '40001', 'lasar_locked_status');
        await deny('principalB', await keep(B, s.b, ok.receipt.revision), '40001', 'lasar_locked_status');
        await denied(t, u => u`update public.school_years set frame_ack_id=${s.f2} where id=${s.b}`, 'P0001');
        const req = await decide('principalB', dec(B, 'request_change', 'Syntetisk orsak: ramen har ändrats', s.b, ok.receipt.revision));
        const open = await decide('hm', dec(B, 'reopen', 'Syntetiskt skäl', s.b, req.receipt.revision));
        const v2 = open.detail.calendar.versionId;
        assert.deepEqual([open.detail.calendar.frameVersionId, open.detail.frame.current.versionId, open.detail.frame.acknowledgedVersionId], [s.f1, s.f1, s.f1]);
        await today(`${YEAR}-10-15`);
        const mid = await readSchool('principalB', B);
        assert.equal(mid.editableFrom, `${YEAR}-10-15`);
        assert.ok(s.applyDay < mid.editableFrom);
        await deny('principalB', await take(B, v2, mid.calendar.revision, [key(s.applyDay)]), '40001', 'lasar_past_day');
        const done = await send('principalB', await take(B, v2, mid.calendar.revision, ['term:ht:end']));
        assert.equal(done.detail.calendar.terms.ht.end, s.htEnd2); assert.equal(done.detail.calendar.frameVersionId, s.f2);
        assert.equal(done.detail.calendar.exceptions[s.applyDay], undefined);
      } finally { await today(null).catch(() => undefined); }
    });
  });
}

export async function verifyLasarFrames(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  assert.ok(ephemeral, 'REFUSED: ramens prov körs bara mot en egen PostgreSQL (--ephemeral)');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'lasar-frames-sql', status: 'FAIL', mode: 'ephemeral', cases: [], startedAt: new Date().toISOString(),
    limitations: ['Own database built from repository migrations with synthetic fixtures only; nothing installed in any connected database',
      'No HTTP/OIDC/Worker; MFA for decisions is enforced by the route (lasar.test.mjs); the real chain is plan 15',
      'The year-start lock and D-12 are proven with app.fake_today set per case',
      'Copying last year (create copy) is proven in verify-lasar.mjs (05.1.1-11); here only the refusals without a published frame or without server content',
      'SS 12000: frame and mode have no object in the standard; the frame is keyed on organizers.id; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  const step = caseRunner(report);
  let source;
  try {
    persist();
    staticChecks(report);
    const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
    const e = await createEphemeralMigratedDb();
    source = { db: e.db, close: e.end };
    report.database = e.provenance; persist();
    const db = source.db;
    const f = await db.begin(createLasarFixture);
    for (const run of [structure, invariant]) {
      try { await db.begin(async tx => { await run(tx, step); throw rollback; }); } catch (err) { if (err !== rollback) throw err; }
    }
    try { await db.begin(async tx => { await tx`set local statement_timeout='120s'`; await frames(tx, step, f); throw rollback; }); } catch (err) { if (err !== rollback) throw err; }
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, stack: e.stack }; }
  finally {
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    report.passed = report.cases.filter(c => c.status === 'PASS').length;
    report.failed = report.cases.filter(c => c.status !== 'PASS').length;
    if (!report.failure && !report.cleanupFailure && report.failed === 0 && report.passed > 0) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.passed} fall för ram och arbetssätt i SQL` : `FAIL: ${report.failed} av ${report.cases.length} fall${report.failure ? '; ' + report.failure.message : ''}`);
  for (const c of report.cases.filter(x => x.status !== 'PASS')) console.log(`  FAIL ${c.name}: ${c.code ?? ''} ${c.hint ?? ''} ${c.message ?? ''}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json --ephemeral');
  await verifyLasarFrames(rest[1], { ephemeral });
}
