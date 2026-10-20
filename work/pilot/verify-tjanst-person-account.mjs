#!/usr/bin/env node
// 05.1-07: personalläsningens kontouppgift (Personal: Kopplat till ett konto / Inget konto). Bara huvudmannens läsning får fältet
// account; rektors läsning per skola är byte för byte oförändrad (D-11). Egen databas, syntetiska fixturer; migrationen provas
// först med återrullning och installeras sedan bara i den egna databasen.
//   node work/pilot/verify-tjanst-person-account.mjs --out /private/tmp/tjanst-account-sql.json              (schemakopia av skyddat lokalt mål)
//   node work/pilot/verify-tjanst-person-account.mjs --out /tmp/tjanst-account-sql.json --ephemeral          (egen PostgreSQL byggd från migrationerna)
// Ingen HTTP/OIDC och inget installerat mål ändras.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { createTjanstFixture, grantSelf, personalRead, staffWithDuties, tjanstMigrations } from './tjanst-fixtures.mjs';
import { parsePersonalReadReply } from '../../web/lib/tjanst-contract.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OWN = 'supabase/migrations/20261020140000_tjanst_person_account.sql';
const PREREQUISITES = tjanstMigrations.slice(0, tjanstMigrations.indexOf(OWN));
const sourceFiles = [OWN, 'work/pilot/verify-tjanst-person-account.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
const sources = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const sql = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_tjanst_account_rollback');

async function functionDefs(db) {
  return (await db`select p.oid::regprocedure::text s,md5(pg_get_functiondef(p.oid)) d,coalesce(p.proacl::text,'') acl from pg_proc p
    where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`).map(r => [r.s, r.d, r.acl]);
}
function check(report, name, detail) { report.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
const withoutAccount = read => ({ ...read, people: read.people.map(({ account: _a, ...p }) => p) });

async function reads(tx, f) {
  await f.actor(tx, 'hm');
  const organizer = await personalRead(tx, {});
  await f.actor(tx, 'principalA');
  const unit = await personalRead(tx, { unitId: f.schools.A });
  return { organizer, unit };
}

async function matrix(db, report, f) {
  // Fixturerna skrivs och läses före och efter migrationen i samma transaktion, som sedan rullas tillbaka.
  await db.begin(async tx => {
    const bound = await staffWithDuties(tx, f, { familyName: 'Med Konto', duties: [{ unitId: f.schools.A, percent: 60, startsOn: '2026-07-01' }] });
    const free = await staffWithDuties(tx, f, { familyName: 'Utan Konto', duties: [{ unitId: f.schools.A, percent: 40, startsOn: '2026-07-01' }] });
    await grantSelf(tx, f, { unitIds: [f.schools.A], staffPersonId: bound.personId });
    const before = await reads(tx, f);
    assert.ok(before.organizer.people.every(p => !('account' in p)) && before.unit.people.every(p => !('account' in p)));
    const prior = await functionDefs(tx);
    await tx.unsafe(sql(OWN));
    const changed = (await functionDefs(tx)).filter(([s, d, acl]) => { const old = prior.find(p => p[0] === s); return !old || old[1] !== d || old[2] !== acl; });
    assert.deepEqual(changed.map(c => c[0]), ['tjanst_person_json(staff_people,uuid)']);
    assert.equal(changed[0][2], prior.find(p => p[0] === changed[0][0])[2], 'ACL unchanged');
    check(report, 'migrationen ersätter bara tjanst_person_json och behåller dess rättigheter');
    const after = await reads(tx, f);
    assert.deepEqual(after.unit, before.unit);
    const unit = parsePersonalReadReply(after.unit, { unitId: f.schools.A });
    assert.ok(unit.people.every(p => p.account === undefined));
    check(report, 'rektors läsning per skola är oförändrad och saknar kontouppgift (D-11)', { people: unit.people.length });
    assert.deepEqual(withoutAccount(after.organizer), before.organizer);
    const organizer = parsePersonalReadReply(after.organizer, {});
    assert.equal(organizer.people.find(p => p.id === bound.personId).account, true);
    assert.equal(organizer.people.find(p => p.id === free.personId).account, false);
    assert.ok(organizer.people.every(p => typeof p.account === 'boolean'));
    check(report, 'huvudmannens läsning: account=true med aktiv bindning, false utan; övriga fält oförändrade', { people: organizer.people.length });
    await tx`update public.staff_person_bindings set ended_at=bound_at where staff_person_id=${bound.personId}`;
    await f.actor(tx, 'hm');
    assert.equal(parsePersonalReadReply(await personalRead(tx, {}), {}).people.find(p => p.id === bound.personId).account, false);
    check(report, 'en avslutad bindning ger account=false');
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
}

export async function verifyTjanstPersonAccount(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-person-account-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    limitations: ['Own database and synthetic fixtures only; no installed target written', 'No HTTP/OIDC/browser claim; Worker grants come in plan 09',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target' : 'Schema-only copy of the protected local target',
      'SS 12000: the account flag is an internal access fact, not part of Person'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist();
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: tjanstMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end };
    } else {
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); } };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname='tjanst_person_json'`)[0].n, 0, 'Personnel migration already present');
    for (const p of PREREQUISITES) await db.begin(tx => tx.unsafe(sql(p)));
    report.prerequisites = PREREQUISITES;
    const f = await db.begin(createTjanstFixture);
    const baseline = { functions: await functionDefs(db), rows: await allPublicHashes(db) };
    try { await db.begin(async tx => { await tx.unsafe(sql(OWN)); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await functionDefs(db), baseline.functions); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'återrullning av migrationen återställer funktioner, ACL och alla rader');
    await matrix(db, report, f);
    assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'hela provet rullas tillbaka utan kvarvarande rader');
    await db.begin(tx => tx.unsafe(sql(OWN)));
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker'])
      assert.equal((await db`select has_function_privilege(${role},'public.tjanst_person_json(public.staff_people,uuid)','EXECUTE') v`)[0].v, false, role);
    check(report, 'installerad i den egna databasen; funktionen är stängd för klientroller och Worker');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} person account SQL checks` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstPersonAccount(rest[1], { ephemeral });
}
