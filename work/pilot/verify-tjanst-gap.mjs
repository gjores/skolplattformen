#!/usr/bin/env node
// 05.1-11 (gap): Egen tjänst på flera skolor (CR-01) och samläsningens regler (WR-02) i migrationen 20261021120000.
// Före-läget skapas med de gamla (installerade) funktionerna och committas i den ägda databasen. Därefter repeteras
// migrationen med återrullning, installeras i den ägda databasen och fallen prövas i transaktioner som rullas tillbaka.
//   node work/pilot/verify-tjanst-gap.mjs --out /private/tmp/tjanst-gap-sql.json              (schemakopia av skyddat lokalt mål, etapp 1 installerad)
//   node work/pilot/verify-tjanst-gap.mjs --out /private/tmp/tjanst-gap-sql.json --ephemeral  (egen PostgreSQL byggd från migrationerna utom rättelsen)
// Bara syntetiska data. Inget installerat mål skrivs; målets journal läses bara läsande. Ingen HTTP/OIDC.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { createTjanstFixture, grantSelf, planCommand, planRead, planSend, seedGrimNeeds, selfRead, selfSend, staffWithDuties,
  tjanstEtapp1Migrations, tjanstGapMigrations } from './tjanst-fixtures.mjs';
import { WORKER_ENTRYPOINTS } from './apply-tjanst.mjs';
import { parsePlanCommandReply, parsePlanReadReply, parseSelfCommandReply, parseSelfReadReply } from '../../web/lib/tjanst-contract.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [GAP] = tjanstGapMigrations;
const sourceFiles = [GAP, 'work/pilot/verify-tjanst-gap.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
const sources = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const sql = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_tjanst_gap_rollback');
const Y = 2026;
const ROLES = ['anon', 'authenticated', 'service_role', 'skolplattform_worker'];
const LINK_COLUMNS = ['access_assignment_id', 'binding_id', 'customer_id', 'organizer_id', 'linked_by_assignment_id', 'linked_at'];
/** Funktioner som migrationen ersätter (create or replace); ägare och rättigheter ska vara oförändrade. */
const REPLACED = ['phase51_bind_self_person(access_assignments,uuid,uuid,uuid,uuid[])', 'tjanst_self_command(jsonb)',
  'tjanst_self_person(access_assignments)', 'tjanst_self_projection(access_assignments)'];
const ADDED = ['tjanst_self_mandates_guard()', 'tjanst_self_unit_ids(access_assignments)'];
const short = s => s.replace(/^public\./u, '').replaceAll('public.', '').replaceAll(', ', ',');

async function fingerprint(db) {
  const parts = await Promise.all([
    db`select p.oid::regprocedure::text s,md5(pg_get_functiondef(p.oid)) d,coalesce(p.proacl::text,'') acl,p.proowner::regrole::text owner from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`,
    db`select c.relname,c.relkind,coalesce(c.relacl::text,'') acl,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace='public'::regnamespace order by 1`,
    db`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) t,a.attnotnull from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped order by 1,2`,
    db`select conrelid::regclass::text r,conname,pg_get_constraintdef(oid) d from pg_constraint where connamespace='public'::regnamespace order by 1,2`,
    db`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by 1,2`,
    db`select tgrelid::regclass::text r,tgname,pg_get_triggerdef(oid) d from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace) order by 1,2`,
    db`select * from pg_policies where schemaname='public' order by tablename,policyname`]);
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}
const functionMeta = async db => Object.fromEntries((await db`select p.oid::regprocedure::text s,md5(pg_get_functiondef(p.oid)) d,coalesce(p.proacl::text,'') acl,p.proowner::regrole::text owner
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'`).map(r => [short(r.s), { d: r.d, acl: r.acl, owner: r.owner }]));

function check(report, name, detail) { report.checks.push({ name, ok: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
async function deny(tx, report, name, fn, codes, hint) {
  let error;
  try { await tx.savepoint(fn); } catch (e) { error = e; }
  assert.ok(error, name + ': expected denial');
  assert.ok(codes.includes(error.code), `${name}: got ${error.code} ${error.hint ?? ''} ${error.message}`);
  if (hint !== undefined) assert.equal(error.hint, hint, name + ': hint');
  check(report, name, { code: error.code, ...(error.hint ? { hint: error.hint } : {}) });
  return error;
}
const send = async (t, q) => parsePlanCommandReply((await planSend(t, q)).result, q);
const read = async (t, unitId) => parsePlanReadReply(await planRead(t, { unitId, schoolYear: Y }), { unitId, schoolYear: Y });
const self = async t => parseSelfReadReply(await selfRead(t));
const command = async (t, q) => { const envelope = await selfSend(t, q); assert.equal(envelope.contractVersion, 'tjanst_sql_v1'); return parseSelfCommandReply(envelope.result, q); };
const units = own => [...new Set(own.publications.map(p => p.unitId))].sort();
const sessionOn = async (t, f, name, assignmentId) => { f.roles[name] = assignmentId; await f.sessionFor(t, name); await f.actor(t, name); };
const revoke = async (t, f, by, id) => { await f.actor(t, by); await t`select public.phase3_revoke_mandate(${id})`; };
const needOf = (detail, classId, rowKey) => detail.classes.find(c => c.classId === classId).needs.find(n => n.rowKey === rowKey);

/** GR-behov på en annan skola än A: utbildning, fastställd timplan (status satt i fixturen), kalender och en klass kopplad till ak8. */
async function seedUnitNeeds(t, f, { unit, principal, name }) {
  await f.actor(t, 'hm');
  const offering = randomUUID(), plan = randomUUID(), classId = randomUUID();
  await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values(${offering},${f.id(2)},${unit},'grundskola',${'Syntetisk GR ' + name},'Läsåret 2026/27',${[7, 8, 9]}::smallint[],2026)`;
  await t`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${plan},${f.id(2)},${offering},${unit},1,'Syntetisk GR')`;
  await t`insert into public.timplan_cells(timplan_id,row_id,hours) values(${plan},'matematik',${[100, 90, 80]}::smallint[]),(${plan},'engelska',${[60, 60, 60]}::smallint[])`;
  await t`set local session_replication_role=replica`;
  await t`update public.timplans set status='faststalld',decided_on='2026-06-01' where id=${plan}`;
  await t`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${classId},${f.id(1)},${f.id(2)},${unit},${offering},${name},2026)`;
  const sy = (await t`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on) values(${f.id(2)},${unit},2026,'2026-08-17','2026-12-22','2027-01-11','2027-06-11','faststalld','2026-05-01') returning id`)[0].id;
  await t`insert into public.school_year_days(school_year_id,day,kind) values(${sy},'2026-10-30','lovdag')`;
  await t`set local session_replication_role=origin`;
  await f.actor(t, principal);
  await t`select public.phase51_grim_class_command(${t.json({ action: 'link', commandId: randomUUID(), classId, planId: plan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null })})`;
  return { plan, classId, offering };
}

/** Rektor publicerar en ny version på skolan med de angivna raderna (ett kvarvarande utkast kasseras först). */
async function publishRows(t, f, principal, unit, rows) {
  await f.actor(t, principal);
  let d = await read(t, unit);
  if (d.version?.status === 'draft') { await send(t, await planCommand(unit, Y, 'discard_draft', d.revision, {})); d = await read(t, unit); }
  let r = await send(t, await planCommand(unit, Y, 'create_draft', d.revision, { basedOnVersionId: d.version?.status === 'published' ? d.version.id : null }));
  for (const { classId, rowKey, personId, ht = 1800, vt = 1800 } of rows)
    r = await send(t, await planCommand(unit, Y, 'save_row', r.detail.revision, { rowId: null, sourceKind: 'class_timplan', sourceKey: needOf(r.detail, classId, rowKey).sourceKey,
      personId, teacherHt: ht, teacherVt: vt, comment: '' }));
  r = await send(t, await planCommand(unit, Y, 'publish', r.detail.revision, {}, { expectedContentHash: r.detail.version.contentHash }));
  return r.detail.version;
}

/** Före-läget med de installerade (gamla) funktionerna. Committas i den ägda databasen. */
async function beforeState(tx, report, f) {
  const { A, B, C } = f.schools;
  const duty = (unitId, percent) => ({ unitId, percent, startsOn: '2026-07-01' });
  const p1 = await staffWithDuties(tx, f, { familyName: 'Ettan', duties: [duty(A, 60), duty(B, 40)] });
  const p2 = await staffWithDuties(tx, f, { familyName: 'Tvåan', duties: [duty(A, 40), duty(B, 30), duty(C, 30)] });
  const p3 = await staffWithDuties(tx, f, { familyName: 'Trean', duties: [duty(A, 50)] });
  const p4 = await staffWithDuties(tx, f, { familyName: 'Fyran', duties: [duty(A, 50)] });
  const g = await seedGrimNeeds(tx, f);
  await f.actor(tx, 'principalA');
  await tx`select public.phase51_grim_class_command(${tx.json({ action: 'link', commandId: randomUUID(), classId: f.classes.other, planId: g.grPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null })})`;
  const nb = await seedUnitNeeds(tx, f, { unit: B, principal: 'principalB', name: 'SYNB8' });
  // Rektor C: kontot principalAB får ett rektorsmandat för skola C (fixturen har ingen egen rektor för C).
  await f.assign(tx, 'principalAB', 'hm', { function: 'rektor', scopeKind: 'school', unitIds: [C] });
  const nc = await seedUnitNeeds(tx, f, { unit: C, principal: 'principalAB', name: 'SYNC8' });

  // CR-01: rektor A och rektor B ger samma konto (teacherSelf) Egen tjänst för samma person P1, var sin skola.
  const mandateA = await grantSelf(tx, f, { by: 'principalA', unitIds: [A], staffPersonId: p1.personId });
  const vA = await publishRows(tx, f, 'principalA', A, [{ classId: f.classes.group, rowKey: 'engelska', personId: p1.personId }]);
  const mandateB = await grantSelf(tx, f, { by: 'principalB', unitIds: [B], staffPersonId: p1.personId });
  const vB = await publishRows(tx, f, 'principalB', B, [{ classId: nb.classId, rowKey: 'engelska', personId: p1.personId }]);
  await sessionOn(tx, f, 'teacherSelf', mandateB);
  const onB = units(await self(tx));
  await sessionOn(tx, f, 'teacherSelf', mandateA);
  const onA = units(await self(tx));
  const valid = (await tx`select public.phase3_mandate_is_valid(${mandateA}) v`)[0].v;
  const bindings = await tx`select access_assignment_id,ended_at is not null ended from public.staff_person_bindings where staff_person_id=${p1.personId} order by bound_at`;
  assert.deepEqual(onB, [B]); assert.deepEqual(onA, [B]); assert.equal(valid, true);
  assert.deepEqual(bindings.map(b => [b.access_assignment_id, b.ended]), [[mandateA, true], [mandateB, false]]);
  check(report, 'före-läget visar CR-01: med de gamla funktionerna saknar publikationslistan skola A både med session på mandat A och på mandat B, fast mandat A gäller',
    { sessionOnB: onB.map(u => u === B ? 'B' : u), sessionOnA: onA.map(u => u === B ? 'B' : u), mandateAValid: valid });

  // Ett mandat vars bindning avslutades av ett annat par (samma konto, annan person) ska inte kopplas om.
  const m3 = await grantSelf(tx, f, { teacher: 'teacherGroup', by: 'principalA', unitIds: [A], staffPersonId: p3.personId });
  await revoke(tx, f, 'principalA', m3);
  const m4 = await grantSelf(tx, f, { teacher: 'teacherGroup', by: 'principalA', unitIds: [A], staffPersonId: p4.personId });
  return { p1: p1.personId, p2: p2.personId, p3: p3.personId, p4: p4.personId, g, nb, nc, mandateA, mandateB, m3, m4, vA: vA.id, vB: vB.id };
}

/** Kontroller av tabell, ifyllnad och rättigheter efter installationen. */
async function installedChecks(db, report, f, s, before) {
  const columns = (await db`select a.attname from pg_attribute a where a.attrelid='public.tjanst_self_mandates'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`).map(x => x.attname);
  assert.deepEqual(columns, LINK_COLUMNS);
  const [rls] = await db`select relrowsecurity r,relforcerowsecurity f from pg_class where oid='public.tjanst_self_mandates'::regclass`;
  assert.ok(rls.r && rls.f);
  for (const role of ROLES) assert.equal((await db`select has_table_privilege(${role},'public.tjanst_self_mandates','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') v`)[0].v, false, role);
  check(report, 'tjanst_self_mandates: exakt kolumnlista, tvingad RLS och inga klient- eller Worker-rättigheter', { columns });

  const selfMandates = (await db`select id from public.access_assignments where scope_kind='self' order by id`).map(r => r.id);
  const links = await db`select l.access_assignment_id,l.binding_id,own.id own_id,own.ended_at is not null own_ended,
     b.ended_at is null active,b.membership_id=m.membership_id and b.organizer_id=m.organizer_id and b.customer_id=m.customer_id same_account
    from public.tjanst_self_mandates l join public.access_assignments m on m.id=l.access_assignment_id
    join public.staff_person_bindings b on b.id=l.binding_id join public.staff_person_bindings own on own.access_assignment_id=l.access_assignment_id`;
  assert.deepEqual(links.map(l => l.access_assignment_id).sort(), selfMandates);
  assert.equal(new Set(links.map(l => l.access_assignment_id)).size, links.length);
  const byMandate = Object.fromEntries(links.map(l => [l.access_assignment_id, l]));
  const activeP1 = (await db`select id from public.staff_person_bindings where staff_person_id=${s.p1} and ended_at is null`)[0].id;
  assert.equal(byMandate[s.mandateA].binding_id, activeP1); assert.equal(byMandate[s.mandateA].own_ended, true);
  assert.equal(byMandate[s.mandateB].binding_id, activeP1);
  assert.equal(byMandate[s.m3].binding_id, byMandate[s.m3].own_id); assert.equal(byMandate[s.m3].active, false);
  const repaired = links.filter(l => l.binding_id !== l.own_id).length;
  assert.equal(repaired, 1);
  report.repairedLinks = repaired;
  check(report, 'reparation: varje self-mandat har exakt en kopplingsrad, mandat A pekar på parets aktiva bindning och ett mandat vars bindning avslutades av ett annat par kopplas inte om',
    { selfMandates: selfMandates.length, links: links.length, repaired });
  assert.ok(links.every(l => l.same_account));
  check(report, 'varje kopplingsrads bindning har samma medlemskap, kund och huvudman som mandatet', { links: links.length });

  const after = await functionMeta(db);
  const changed = Object.keys(before).filter(k => after[k] && after[k].d !== before[k].d).sort();
  assert.deepEqual(changed, [...REPLACED].sort());
  for (const k of REPLACED) assert.deepEqual([after[k].acl, after[k].owner], [before[k].acl, before[k].owner], k);
  assert.deepEqual(Object.keys(before).filter(k => !after[k]), []);
  const added = Object.keys(after).filter(k => !before[k]).sort();
  assert.deepEqual(added, [...ADDED].sort());
  for (const role of ROLES) for (const fn of added) assert.equal((await db`select has_function_privilege(${role},${'public.' + fn}::regprocedure,'EXECUTE') v`)[0].v, false, role + fn);
  const open = (await db`select p.oid::regprocedure::text s from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%')
    and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE')`).map(r => short(r.s)).sort();
  assert.deepEqual(open, [...WORKER_ENTRYPOINTS].sort());
  for (const role of ['anon', 'authenticated', 'service_role'])
    assert.equal((await db`select count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and (p.proname like 'tjanst\\_%' or p.proname like 'phase51\\_%') and has_function_privilege(${role},p.oid,'EXECUTE')`)[0].n, 0, role);
  check(report, `de ${REPLACED.length} ersatta funktionerna har samma ägare och rättigheter, nya funktioner är stängda och exakt tolv Worker-entrypoints är öppna`,
    { replaced: REPLACED, added, workerEntrypoints: open.length });
}

/** CR-01 för P1: båda skolorna i båda sessionerna, och kvittens på A och B. */
async function cr01(tx, report, f, s) {
  const { A, B } = f.schools;
  await sessionOn(tx, f, 'teacherSelf', s.mandateA);
  const viaA = await self(tx);
  await sessionOn(tx, f, 'teacherSelf', s.mandateB);
  const viaB = await self(tx);
  assert.deepEqual(units(viaA), [A, B].sort()); assert.deepEqual(units(viaB), [A, B].sort());
  assert.deepEqual(viaA, viaB);
  assert.deepEqual(viaA.publications.map(p => p.versionId).sort(), [s.vA, s.vB].sort());
  check(report, 'P1 ser skola A och B med session på mandat A och på mandat B', { publications: viaA.publications.length });

  // Kvittens på A med session på mandat B, och på B med session på mandat A.
  const ackA = { commandId: randomUUID(), versionId: s.vA, action: 'ack' };
  const doneA = await command(tx, ackA);
  assert.equal((await selfSend(tx, ackA)).result.receipt.replayed, true);
  await sessionOn(tx, f, 'teacherSelf', s.mandateA);
  const ackB = { commandId: randomUUID(), versionId: s.vB, action: 'ack' };
  const doneB = await command(tx, ackB);
  assert.equal((await selfSend(tx, ackB)).result.receipt.replayed, true);
  assert.equal((await command(tx, { ...ackA, commandId: randomUUID() })).receipt.feedbackId, doneA.receipt.feedbackId);
  const acks = await tx`select version_id,count(*)::int n from public.tjanst_feedback where kind='ack' and staff_person_id=${s.p1} group by version_id order by version_id`;
  assert.deepEqual(acks.map(a => [a.version_id, a.n]), [[s.vA, 1], [s.vB, 1]].sort((x, y) => x[0] < y[0] ? -1 : 1));
  const own = await self(tx);
  assert.ok(own.publications.every(p => p.acknowledgedAt));
  assert.notEqual(doneA.receipt.feedbackId, doneB.receipt.feedbackId);
  check(report, 'kvittens på A och på B: en ack-rad per version oavsett session, och samma commandId ger replayed');
}

export async function verifyTjanstGap(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-gap-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    migration: GAP,
    limitations: ['Own database and synthetic fixtures only; no installed target written; the target journal is read read-only',
      ephemeral ? 'Schema built from repository migrations (all except the gap migration) on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target'
        : 'Schema-only copy of the protected local target, where stage 1 (seven 05.1 migrations) is installed',
      'Before-state created with the installed (old) functions; repaired-link count refers to that synthetic before-state',
      'GR/IM plan status and calendars are set directly in the fixture', 'No HTTP/OIDC/browser claim; installation comes in 05.1-13',
      'SS 12000: Person/Duty/Activity mapping is intended compatibility, no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist();
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: tjanstGapMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end };
    } else {
      const versions = tjanstEtapp1Migrations.map(p => basename(p).slice(0, 14)), gapVersions = tjanstGapMigrations.map(p => basename(p).slice(0, 14));
      const { assertTarget } = await import('./verify-target.mjs');
      const { createRequire } = await import('node:module');
      const target = await assertTarget('protected');
      const live = createRequire(new URL('../../web/package.json', import.meta.url))('postgres')(target.dbUrl, { max: 1, prepare: false, onnotice: () => {} });
      try {
        await live.begin('read only', async t => {
          const journal = (await t`select version from supabase_migrations.schema_migrations where version>='20261020000000' order by version`).map(r => r.version);
          assert.deepEqual(journal, versions, 'Target journal must hold exactly the seven stage 1 versions and not the gap version');
          assert.ok(gapVersions.every(v => !journal.includes(v)));
          report.targetJournal = { stage1: journal, gapInstalled: false };
        });
      } finally { await live.end({ timeout: 5 }); }
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); } };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname='tjanst_self_command'`)[0].n, 1, 'Stage 1 must be installed');
    assert.equal((await db`select to_regclass('public.tjanst_self_mandates') r`)[0].r, null, 'Gap migration already present');
    check(report, ephemeral ? 'tillfällig databas har etapp 1 men inte rättelsen' : 'målets journal har exakt de sju etapp 1-versionerna, och schemakopian har tjanst_self_command men inte tjanst_self_mandates',
      report.targetJournal);
    const f = await db.begin(createTjanstFixture);
    const s = await db.begin(tx => beforeState(tx, report, f));
    persist();
    const baseline = { fingerprint: await fingerprint(db), rows: await allPublicHashes(db), functions: await functionMeta(db) };
    try { await db.begin(async tx => { await tx.unsafe(sql(GAP)); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await fingerprint(db), baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'repetition med återrullning återställer exakt schema, ACL och alla rader', { fingerprint: baseline.fingerprint });
    await db.begin(tx => tx.unsafe(sql(GAP)));
    const installedRows = await allPublicHashes(db);
    for (const [table, value] of Object.entries(baseline.rows)) assert.deepEqual(installedRows[table], value, table);
    check(report, 'installation i den ägda databasen lämnar alla befintliga rader orörda (person-, klass- och rad-ID oförändrade)', { tables: Object.keys(baseline.rows).length });
    await installedChecks(db, report, f, s, baseline.functions);
    const installed = await allPublicHashes(db);
    for (const step of [cr01]) {
      try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='120s'`; await step(tx, report, f, s); throw rollback; }); }
      catch (e) { if (e !== rollback) throw e; }
    }
    assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'alla fall rullas tillbaka utan kvarvarande rader');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} gap SQL checks (CR-01, WR-02)` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyTjanstGap(rest[1], { ephemeral });
}
