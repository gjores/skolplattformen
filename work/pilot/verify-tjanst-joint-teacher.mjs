#!/usr/bin/env node
// 05.1-26 / D-28: samläsning med samma lärare för alla rader (eller bara vakanta). Endast ägd databas och syntetiska data.
// node work/pilot/verify-tjanst-joint-teacher.mjs --ephemeral --out /private/tmp/tjanst-joint-teacher.json
// Utan --ephemeral: schemakopia av skyddat lokalt mål, där bara registrerat saknat suffix installeras.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { schemaFingerprint } from './named-timplan-snapshot.mjs';
import { planRead, tjanstMigrations } from './tjanst-fixtures.mjs';
import { createTjanstYearFixture, capturePlanContext, yearCommand, yearCommandSend } from './tjanst-year-fixtures.mjs';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261026100000_tjanst_joint_single_teacher.sql';
const rollback = Error('expected_joint_teacher_rollback');
const sourceFiles = [...tjanstMigrations, OWN, 'work/pilot/verify-tjanst-joint-teacher.mjs', 'work/pilot/tjanst-year-fixtures.mjs', 'work/pilot/tjanst-fixtures.mjs',
  'work/pilot/tjanst-migration-state.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/named-timplan-snapshot.mjs', 'web/lib/tjanst-contract.ts', 'web/lib/tjanst-year-contract.ts'];
const sources = () => {
  const pending = [...sourceFiles], found = new Map(), ts = createRequire(resolve(ROOT, 'web/package.json'))('typescript');
  while (pending.length) {
    const path = pending.pop(); if (found.has(path)) continue;
    const bytes = readFileSync(resolve(ROOT, path)); found.set(path, createHash('sha256').update(bytes).digest('hex'));
    if (!/\.(?:mjs|ts)$/u.test(path)) continue;
    const parsed = ts.createSourceFile(path, bytes.toString('utf8'), ts.ScriptTarget.Latest, true), imports = [];
    const visit = node => {
      const specifier = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
      if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) imports.push(specifier.text);
      ts.forEachChild(node, visit);
    }; visit(parsed);
    for (const specifier of imports) {
      let target = resolve(ROOT, dirname(path), specifier); if (!existsSync(target)) target += '.ts';
      assert.ok(target.startsWith(ROOT) && existsSync(target), 'Unresolved local source ' + specifier + ' from ' + path);
      pending.push(relative(ROOT, target));
    }
  }
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
};
const check = (r, name, detail) => { r.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); };
async function denied(t, r, name, fn, code, hint) {
  let error; try { await t.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial'); assert.equal(error.code, code, error.message);
  if (hint) assert.equal(error.hint, hint, error.message);
  check(r, name, { code, ...(hint ? { hint } : {}) });
}
async function rolledBack(db, fn) {
  try { await db.begin(async t => { await t`set local lock_timeout='10s'`; await t`set local statement_timeout='120s'`; await fn(t); throw rollback; }); }
  catch (e) { if (e !== rollback) throw e; }
}
const functionMeta = async db => Object.fromEntries((await db`select p.oid::regprocedure::text signature,p.proname name,pg_get_functiondef(p.oid) definition,coalesce(p.proacl::text,'') acl,p.proowner::regrole::text owner,p.prosecdef definer,p.proconfig config
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`).map(r => [r.signature, r]));
const workerOpen = async db => (await db`select p.oid::regprocedure::text s from pg_proc p where p.pronamespace='public'::regnamespace
  and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') order by 1`).map(r => r.s);
const read = async s => parseYearPlanReadReply(await planRead(s.t, { unitId: s.unitId, schoolYear: s.schoolYear }), { unitId: s.unitId, schoolYear: s.schoolYear });
const codes = d => d.blockers.map(b => b.code);
async function send(s, action, payload, choice) {
  const captured = await capturePlanContext(s.t, { unitId: s.unitId, schoolYear: s.schoolYear, action, payload, ...(choice ? { choice } : {}) });
  return (await yearCommandSend(s.t, await yearCommand(captured))).result.detail;
}
const saveRow = (s, classId, personId) => send(s, 'save_row', { rowId: null, sourceKind: 'class_timplan', sourceKey: s.key('matematik', classId), personId,
  teacherHt: 600, teacherVt: 600, comment: '' }, personId ? 'manual' : 'unassigned');
const time = personId => ({ personId, ht: 700, vt: 700 });
const joint = (s, rowIds, teachers, jointId = null) => send(s, 'save_joint', { jointId, name: 'Syntetisk samläsning', rowIds, teachers });
async function setup(t, [first, second]) {
  const y = await createTjanstYearFixture(t), s = { ...y, t, p0: y.people[0].personId, p1: y.people[1].personId };
  const pick = x => x === 'p0' ? s.p0 : x === 'p1' ? s.p1 : null;
  await saveRow(s, y.f.classes.group, pick(first)); const d = await saveRow(s, y.f.classes.other, pick(second));
  s.rowIds = [y.f.classes.group, y.f.classes.other].map(classId => d.rows.find(r => r.classId === classId).id);
  return s;
}
const planState = async s => ({
  distribution: (await s.t`select to_jsonb(x) value from public.tjanst_distributions x where unit_id=${s.unitId} and school_year=${s.schoolYear}`)[0].value,
  joints: (await s.t`select count(*)::int n from public.tjanst_joint_groups g join public.tjanst_versions v on v.id=g.version_id join public.tjanst_distributions d on d.id=v.distribution_id where d.unit_id=${s.unitId}`)[0].n,
});

async function beforeCases(db, report) {
  await rolledBack(db, async t => {
    const s = await setup(t, ['p0', 'p1']);
    const d = await joint(s, s.rowIds, [time(s.p0), time(s.p1)]);
    assert.equal(d.joints[0].teachers.length, 2); assert.deepEqual(codes(d), []);
    check(report, 'före D-28: samläsning med två olika lärare godtas och saknar hinder (felet från användarprovet)');
  });
}
async function cases(db, report) {
  await rolledBack(db, async t => {
    const s = await setup(t, ['p0', 'p0']);
    const d = await joint(s, s.rowIds, [time(s.p0)]);
    assert.equal(d.joints.length, 1); assert.deepEqual(d.joints[0].teachers.map(x => x.personId), [s.p0]); assert.deepEqual(codes(d), []);
    check(report, 'samma lärare på alla rader godkänns och ger inget hinder');
    await denied(t, report, 'ändring av befintlig samläsning utan lärartid nekas när raderna har lärare', () => joint({ ...s, t }, s.rowIds, [], d.joints[0].id), '22023', 'tjanst_joint_teacher_mismatch');
  });
  await rolledBack(db, async t => {
    const s = await setup(t, ['p0', 'p1']), before = await planState(s);
    await denied(t, report, 'olika lärare med lärartid för båda nekas', () => joint({ ...s, t }, s.rowIds, [time(s.p0), time(s.p1)]), '22023', 'tjanst_joint_teacher_mismatch');
    await denied(t, report, 'olika lärare med lärartid för en av dem nekas', () => joint({ ...s, t }, s.rowIds, [time(s.p0)]), '22023', 'tjanst_joint_teacher_mismatch');
    assert.deepEqual(await planState(s), before); check(report, 'nekad samläsning lämnar revision och grupper oförändrade');
  });
  await rolledBack(db, async t => {
    const s = await setup(t, ['p0', null]);
    await denied(t, report, 'lärare och vakant i samma samläsning nekas', () => joint({ ...s, t }, s.rowIds, [time(s.p0)]), '22023', 'tjanst_joint_teacher_mismatch');
  });
  await rolledBack(db, async t => {
    const s = await setup(t, [null, null]);
    const d = await joint(s, s.rowIds, []); assert.equal(d.joints[0].teachers.length, 0); assert.deepEqual(codes(d), []);
    check(report, 'samläsning med bara vakanta rader godkänns utan lärartid');
    await denied(t, report, 'vakanta rader med lärartid nekas', () => joint({ ...s, t }, s.rowIds, [time(s.p0)], d.joints[0].id), '22023');
  });
  await rolledBack(db, async t => {
    const s = await setup(t, ['p0', 'p0']);
    let d = await joint(s, s.rowIds, [time(s.p0)]);
    const published = (await t`select count(*)::int n,md5(coalesce(string_agg(v.id::text||v.content_hash,'' order by v.id),'')) h from public.tjanst_versions v where v.status in ('published','superseded')`)[0];
    // Märkt syntetisk före-data: en äldre blandad grupp som skapades före D-28. Skrivs bara i ägd provtransaktion.
    await t`update public.tjanst_rows set staff_person_id=${s.p1} where id=${s.rowIds[1]}`;
    await t`insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes) values(${d.joints[0].id},${s.p1},700,700)`;
    d = await read(s);
    assert.ok(codes(d).includes('joint_mixed_teachers')); assert.equal(d.capabilities.canPublish, false); assert.ok(!d.actions.includes('publish'));
    assert.match(d.blockers.find(b => b.code === 'joint_mixed_teachers').message, /samma lärare/u);
    check(report, 'äldre blandad samläsning ger hindret joint_mixed_teachers och ingen publicering', { codes: codes(d) });
    await denied(t, report, 'publicering med blandad samläsning nekas', () => send({ ...s, t }, 'publish', {}), '40001', 'tjanst_publish_blocked');
    d = await send(s, 'dissolve_joint', { jointId: d.joints[0].id });
    assert.ok(!codes(d).includes('joint_mixed_teachers')); assert.equal(d.joints.length, 0);
    check(report, 'uttrycklig upplösning häver hindret; inget repareras automatiskt');
    const after = (await t`select count(*)::int n,md5(coalesce(string_agg(v.id::text||v.content_hash,'' order by v.id),'')) h from public.tjanst_versions v where v.status in ('published','superseded')`)[0];
    assert.deepEqual(after, published); check(report, 'publicerad historik är oförändrad');
  });
}

async function openDatabase(ephemeral, report) {
  const { classifyTjanstMigrations, assertTjanstSelfMandatesSchema, TJANST_MIGRATION_REGISTRY, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
  const { createEphemeralMigratedDb, migrationFiles } = await import('./ephemeral-migrated-db.mjs');
  const ownVersion = basename(OWN).slice(0, 14);
  const sourceHashes = Object.fromEntries(migrationFiles().filter(f => f.slice(0, 14) >= TJANST_PHASE_START)
    .map(f => ['supabase/migrations/' + f, createHash('sha256').update(readFileSync(resolve(ROOT, 'supabase/migrations', f))).digest('hex')]));
  classifyTjanstMigrations({ journal: TJANST_MIGRATION_REGISTRY.filter(m => m.version < ownVersion).map(m => m.version), sourceHashes });
  if (ephemeral) {
    const e = await createEphemeralMigratedDb({ exclude: migrationFiles().filter(f => f.slice(0, 14) >= ownVersion) });
    try { await assertTjanstSelfMandatesSchema(e.db, { installed: true }); } catch (error) { await e.end(); throw error; }
    report.baselineMode = 'ephemeral-before-joint-teacher'; report.pendingMigrations = [OWN];
    return { db: e.db, provenance: e.provenance, pending: [OWN], close: e.end };
  }
  const { targetPendingMigrations } = await import('./verify-tjanst-actual.mjs');
  const target = await targetPendingMigrations();
  const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
  const snapshot = await createNamedTimplanSnapshot();
  try {
    assert.equal(snapshot.provenance.sourceFingerprint, target.fingerprint, 'Målschemat ändrades mellan journalprövning och schemakopia');
    report.targetJournal = target.journal; report.baselineMode = target.baselineMode; report.pendingMigrations = target.pendingMigrations;
    const prior = target.pendingMigrations.filter(p => basename(p).slice(0, 14) < ownVersion);
    if (prior.length) await snapshot.db.begin(async t => { for (const p of prior) await t.unsafe(readFileSync(resolve(ROOT, p), 'utf8')); });
    report.appliedPrerequisites = prior;
    return { db: snapshot.db, provenance: snapshot.provenance, pending: target.pendingMigrations,
      close: async () => { report.snapshotCleanup = await snapshot.cleanup(); const after = await targetPendingMigrations();
        assert.equal(after.fingerprint, target.fingerprint); assert.deepEqual(after.journal, target.journal); report.targetUnchanged = true; } };
  } catch (error) { await snapshot.cleanup(); throw error; }
}

export async function verifyTjanstJointTeacher(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok(output.startsWith('/private/tmp/') && output.endsWith('.json'), 'Use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'Output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-joint-teacher', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(), migration: OWN,
    limitations: ['Syntetiska SQL-prov i ägd databas; ingen installerad målskrivning, HTTP/OIDC eller webbläsarbedömning',
      'Äldre blandad samläsning är uttryckligt skapad syntetisk före-data i ägd provtransaktion',
      'SS 12000:2024 utgåva 4 / OpenAPI 2.1.0: samläsning motsvarar undervisningsgrupp med en lärartilldelning; inget informationsutbyte verifierat'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist(); source = await openDatabase(ephemeral, report); report.database = source.provenance;
    const db = source.db;
    assert.ok(source.pending.includes(OWN), 'D-28-migrationen ska vara väntande i provdatabasen');
    const before = await allPublicHashes(db), meta = await functionMeta(db), fingerprint = await schemaFingerprint(db), open = await workerOpen(db);
    await beforeCases(db, report); assert.deepEqual(await allPublicHashes(db), before);
    await rolledBack(db, t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    assert.equal(await schemaFingerprint(db), fingerprint); assert.deepEqual(await allPublicHashes(db), before);
    check(report, 'migration med återrullning bevarar schema, ACL och samtliga rader');
    await db.begin(t => t.unsafe(readFileSync(resolve(ROOT, OWN), 'utf8')));
    assert.deepEqual(await allPublicHashes(db), before);
    const after = await functionMeta(db), replaced = ['tjanst_plan_save_joint', 'tjanst_plan_blockers'];
    assert.deepEqual(Object.keys(after).sort(), Object.keys(meta).sort());
    for (const [name, original] of Object.entries(meta)) {
      if (replaced.includes(original.name)) { assert.notEqual(after[name].definition, original.definition); assert.deepEqual({ ...after[name], definition: '' }, { ...original, definition: '' }); }
      else assert.deepEqual(after[name], original, name);
    }
    assert.deepEqual(await workerOpen(db), open); assert.equal(open.length, 13);
    check(report, 'bara save_joint och blockerare ersätts; ägare, ACL, SECURITY DEFINER, search_path och 13 öppna ingångar bevaras');
    const installed = await allPublicHashes(db); await cases(db, report); assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'alla syntetiska beteendeprov rullas tillbaka utan kvarvarande rader');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); report.cleanup = 'complete'; } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist(); closeSync(fd);
  }
  console.log(report.status + ': ' + (report.status === 'PASS' ? report.checks.length + ' samläsningskontroller' : report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message));
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstJointTeacher(rest[1], { ephemeral });
}
