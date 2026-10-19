#!/usr/bin/env node
// 05.1-01 (D-21): GR/IM-klassernas skyddade klass–timplanskoppling. Egen databas, syntetiska fixturer,
// migrationen provas först med återrullning och installeras sedan bara i den egna databasen.
//   node work/pilot/verify-grim-class-timplans.mjs --out /private/tmp/grim-class-sql.json              (schemakopia av skyddat lokalt mål)
//   node work/pilot/verify-grim-class-timplans.mjs --out /tmp/grim-class-sql.json --ephemeral          (egen PostgreSQL byggd från migrationerna)
// Ingen HTTP/OIDC och inget installerat mål ändras.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { classFixture } from './verify-class-timplans.mjs';
import { vocationalFixture } from './vocational-plan-fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const grimMigrations = ['supabase/migrations/20261020100000_grim_class_timplan_link.sql', 'supabase/migrations/20261020100100_grim_class_worker_access.sql'];
const sourceFiles = [...grimMigrations, 'work/pilot/verify-grim-class-timplans.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
const sources = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const migrationSql = () => grimMigrations.map(p => readFileSync(resolve(root, p), 'utf8')).join('\n');
const rollback = Error('expected_grim_class_rollback');
const ENTRYPOINTS = ['phase51_grim_class_underlag(jsonb)', 'phase51_grim_class_command(jsonb)'];
const HELPERS = ['phase51_grim_uuid(jsonb)', 'phase51_grim_class_column(offerings,text)', 'phase51_grim_class_blockers(timplans,offerings)', 'phase51_grim_class_scope(uuid,boolean)',
  'phase51_grim_class_audit(uuid,text,jsonb)', 'phase51_grim_legacy_matches(school_classes,class_timplans)', 'validate_class_timplan()'];
const PRESERVED = ['phase5_class_command(jsonb)', 'phase5_class_underlag(uuid,integer)', 'phase5_class_scope(uuid,boolean)', 'phase5_class_legacy_matches(school_classes,class_timplans)',
  'phase5_timplan_scope(uuid,boolean)', 'phase5_class_audit(uuid,text,jsonb)'];

/** Public DDL/ACL fingerprint of the owned database: functions, tables, columns, constraints, indexes, triggers and policies. */
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
}
const grim = async (tx, q) => (await tx`select public.phase51_grim_class_command(${tx.json(q)}) value`)[0].value;
const underlag = async (tx, planId) => (await tx`select public.phase51_grim_class_underlag(${tx.json({ planId })}) value`)[0].value;
const link = (planId, classId, columnId, expectedPlanRevision, expectedLinkRevision = null, previousPlanId = null) =>
  ({ action: 'link', commandId: randomUUID(), classId, planId, expectedPlanRevision, columnId, expectedLinkRevision, previousPlanId });
const create = (planId, name, expectedPlanRevision) => ({ action: 'create', commandId: randomUUID(), planId, expectedPlanRevision, name });
const auditCount = async (tx, objectId, action) => (await tx`select count(*)::int n from public.security_events where object_id=${objectId} and action=${action}`)[0].n;

/** GR/IM fixture in its own synthetic customer: school A (30) and B (31), principal A/B, HM and administrator. */
async function seedGrim(tx) {
  const f = await classFixture(tx), { id, actor } = f;
  await actor('hm');
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
   (${id(400)},${id(2)},${id(30)},'grundskola','Syntetisk GR 7–9','Läsåret 2026/27',${[7, 8, 9]}::smallint[],2026),
   (${id(401)},${id(2)},${id(30)},'introduktionsprogram','Syntetiskt IM','Läsåret 2026/27',null,2026),
   (${id(402)},${id(2)},${id(31)},'grundskola','Syntetisk GR på B','Läsåret 2026/27',${[7, 8, 9]}::smallint[],2026),
   (${id(403)},${id(2)},${id(30)},'grundskola','Syntetisk GR utan läsår','Text',${[7, 8, 9]}::smallint[],null)`;
  const plan = (p, o, u, v) => tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${id(p)},${id(2)},${id(o)},${id(u)},${v},'Syntetisk GR/IM-plan')`;
  for (const [p, o, u] of [[410, 400, 30], [412, 401, 30], [413, 402, 31], [414, 403, 30]]) await plan(p, o, u, 1);
  await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${id(410)},'matematik',${[100, 100, 100]}::smallint[]),(${id(412)},'im-ma',${[3]}::smallint[])`;
  // Fixture-only status in the owned database: decision flow for GR/IM is outside this plan.
  await tx`set local session_replication_role=replica`;
  await tx`update public.timplans set status='faststalld',decided_on='2026-06-01' where id = any(${[410, 412, 413, 414].map(id)}::uuid[])`;
  await tx`set local session_replication_role=origin`;
  await plan(411, 400, 30, 2);
  // Legacy name rows (demo path); written as owner, through the unchanged legacy trigger branch.
  await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values
   (${id(30)},'8B',2026,${id(410)},'ak8'),(${id(30)},'9C',2026,${id(410)},'ak9'),(${id(30)},'7F',2026,${id(410)},'ak7')`;
  return f;
}

/** An approved Gy25 timetable with the current decision contract (same steps as verify-separate-apl-workflow.mjs). */
async function seedGy(tx) {
  const f = await classFixture(tx), { id, actor } = f, catalog = JSON.parse(readFileSync(resolve(root, 'web/lib/programplan-catalog.generated.json'), 'utf8'));
  const catalogId = (await tx`select catalog_id from public.point_plans where id=${id(50)}`)[0].catalog_id;
  const { reference, rows, terms } = vocationalFixture(catalog, 'BF25', catalogId);
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk Gy25-regression','Syntetisk framtida kull','BF25',${reference.orientationCode},${Number(reference.startedOn.slice(0, 4))})`;
  const programId = (await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) value`)[0].value.id;
  await actor('principal'); await tx`select public.phase5_write_programplan_terms(${programId},0,${tx.json(terms)})`;
  const decide = async (kind, planId, action) => { const d = (await tx`select public.phase5_plan_decision_basis(${kind},${planId}) value`)[0].value.result;
    await tx`select public.phase5_plan_decision_command(${tx.json({ kind, planId, commandId: randomUUID(), action, expectedRevision: d.revision, expectedDecisionRevision: d.decisionRevision, basisHash: d.basisHash, comment: 'Syntetisk kontroll', confirmedChecks: d.checks.map(c => c.id) })})`; };
  await decide('programplan', programId, 'submit'); await actor('hm'); await decide('programplan', programId, 'approve'); await actor('principal');
  const sourceRevision = (await tx`select revision from public.point_plans where id=${programId}`)[0].revision;
  const made = (await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${sourceRevision},0,${id(30)},null,null) value`)[0].value;
  let gym = (await tx`select public.phase5_gym_timplan_result(${made.reply.id}) value`)[0].value;
  // Vocational Gy25 needs at least 345 h annual APL (20 700 min) on one row, as in verify-separate-apl-workflow.mjs.
  const key = rows.find(r => !r.key.startsWith('block:') && !r.key.startsWith('meta:') && terms.find(t => t.rowKey === r.key).points[0] > 0).key;
  for (const r of rows) { const points = terms.find(t => t.rowKey === r.key).points;
    const row = { schoolMinutes: points.map(p => p > 0 ? p * 60 : null), annualAplMinutes: [0, 1, 2].map(i => points[i * 2] + points[i * 2 + 1] > 0 ? (r.key === key && i === 0 ? 20700 : 0) : null) };
    gym = (await tx`select public.phase5_timplan_time_command(${tx.json({ contractVersion: 'timplan_time_v2', action: 'save_row', commandId: randomUUID(), planId: gym.id, expectedRevision: gym.revision, rowKey: r.key, row })}) value`)[0].value.plan; }
  await decide('timplan', gym.id, 'submit'); await actor('hm'); await decide('timplan', gym.id, 'approve'); await actor('principal');
  const year = Number(reference.startedOn.slice(0, 4)) - (reference.startedOn.slice(5, 7) < '07' ? 1 : 0);
  return { ...f, planId: gym.id, year };
}
const masked = value => JSON.parse(JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu, '<uuid>'));
/** Same Gy25 sequence before and after the migration; outcomes are compared with IDs masked. */
async function gyOutcomes(db, gy) {
  const out = {};
  try {
    await db.begin(async tx => {
      const { actor, planId, year } = gy;
      const run = async (name, fn) => { try { out[name] = { ok: masked(await tx.savepoint(fn)) }; } catch (e) { out[name] = { code: e.code, hint: e.hint ?? null }; } };
      const cmd = (t, q) => t`select public.phase5_class_command(${t.json(q)}) value`.then(r => r[0].value);
      await actor('principal');
      const u = (await tx`select public.phase5_class_underlag(${planId},${year}) value`)[0].value;
      out.underlag = { canManage: u.canManage, blockers: u.blockers, startYear: u.plan.startYear === year };
      const c = { operation: 'create', commandId: randomUUID(), planId, expectedPlanRevision: u.plan.revision, name: 'SYN26REG', startYear: year };
      await run('create', t => cmd(t, c)); await run('create replay', t => cmd(t, c));
      await run('create duplicate', t => cmd(t, { ...c, commandId: randomUUID() }));
      const classId = (await tx`select id from public.school_classes where name='SYN26REG' and offering_id=${gy.id(46)}`)[0].id;
      const l = { operation: 'link', commandId: randomUUID(), classId, schoolYear: year, planId, expectedPlanRevision: u.plan.revision, columnId: 'ar1', expectedLinkRevision: null, previousPlanId: null };
      await run('link', t => cmd(t, l)); await run('link replay', t => cmd(t, l));
      await run('link stale revision', t => cmd(t, { ...l, commandId: randomUUID() }));
      await run('link wrong column', t => cmd(t, { ...l, commandId: randomUUID(), columnId: 'ar2', expectedLinkRevision: 0, previousPlanId: planId }));
      await run('relink same version', t => cmd(t, { ...l, commandId: randomUUID(), expectedLinkRevision: 0, previousPlanId: planId }));
      await run('identified insert through trigger with wrong column', t => t`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id,revision) values(${gy.id(30)},'SYN26REG',${year + 1},${planId},'ar3',${classId},0)`);
      await actor('hm'); await run('hm create', t => cmd(t, { ...c, commandId: randomUUID(), name: 'SYN26HM' }));
      throw rollback;
    });
  } catch (e) { if (e !== rollback) throw e; }
  return out;
}

async function grimMatrix(tx, report, f, gy) {
  const { id, actor } = f;
  // 1. Tracer: a GR class linked to ak7, revision 0, read back with the same class ID.
  await actor('principal');
  let u = await underlag(tx, id(410));
  assert.equal(u.canManage, true); assert.equal(u.schoolYear, 2026); assert.deepEqual(u.columns.map(c => c.id), ['ak7', 'ak8', 'ak9']);
  const c7 = create(id(410), '7A', u.plan.revision), made = await grim(tx, c7);
  assert.equal(made.replayed, false); assert.equal(made.startYear, 2026);
  const l7 = link(id(410), made.id, 'ak7', u.plan.revision), linked = await grim(tx, l7);
  assert.equal(linked.revision, 0); assert.equal(linked.adopted, false);
  u = await underlag(tx, id(410));
  const row = u.classes.find(c => c.id === made.id);
  assert.equal(row.link.columnId, 'ak7'); assert.equal(row.link.revision, 0); assert.equal(row.link.planId, id(410));
  check(report, 'GR-klass kopplad till ak7, revision 0, läst tillbaka med samma klass-ID');
  assert.equal(await auditCount(tx, made.id, 'grim_class_created'), 1); assert.equal(await auditCount(tx, made.id, 'grim_class_linked'), 1);
  check(report, 'skapa och koppla skriver exakt en audit-rad var i samma transaktion');

  // create
  assert.equal((await grim(tx, c7)).replayed, true); assert.equal((await grim(tx, c7)).id, made.id);
  check(report, 'samma commandId och samma begäran ger replayed med samma klass-ID');
  await deny(tx, report, 'ändrad begäran med samma commandId ger 40001 med konflikthint', t => grim(t, { ...c7, name: '7Z' }), ['40001'], 'grim_class_command_conflict');
  await deny(tx, report, 'dubblett av namn och läsår på skolan ger 22023', t => grim(t, create(id(410), '7A', u.plan.revision)), ['22023'], 'grim_class_duplicate');
  await deny(tx, report, 'namn som inte är versaler utan omgivande blanksteg ger 22023', t => grim(t, create(id(410), '7a', u.plan.revision)), ['22023']);
  await deny(tx, report, 'okänd nyckel i kommandot ger 22023', t => grim(t, { ...create(id(410), '7Q', u.plan.revision), schoolYear: 2026 }), ['22023']);
  await deny(tx, report, 'inaktuell planrevision ger 40001', t => grim(t, create(id(410), '7Q', u.plan.revision + 1)), ['40001'], 'grim_class_plan_revision');

  // link
  assert.equal((await grim(tx, l7)).replayed, true);
  check(report, 'koppling med samma commandId återspelas');
  const changed = await grim(tx, link(id(410), made.id, 'ak8', u.plan.revision, 0, id(410)));
  assert.equal(changed.revision, 1); assert.equal((await tx`select column_id,revision from public.class_timplans where class_id=${made.id}`)[0].revision, 1);
  check(report, 'ändrad kolumn kräver förväntad revision och ger revision 1');
  await deny(tx, report, 'inaktuell expectedLinkRevision ger 40001 och inget skrivs', t => grim(t, link(id(410), made.id, 'ak9', u.plan.revision, 0, id(410))), ['40001'], 'grim_class_link_revision');
  assert.equal((await tx`select column_id from public.class_timplans where class_id=${made.id}`)[0].column_id, 'ak8');
  await deny(tx, report, 'GR ak6 utanför offering.grades ger 22023', t => grim(t, link(id(410), made.id, 'ak6', u.plan.revision, 1, id(410))), ['22023']);
  await deny(tx, report, 'Gy-kolumn ar1 på GR ger 22023', t => grim(t, link(id(410), made.id, 'ar1', u.plan.revision, 1, id(410))), ['22023']);
  await deny(tx, report, 'expectedLinkRevision utan previousPlanId ger 22023', t => grim(t, link(id(410), made.id, 'ak9', u.plan.revision, 1, null)), ['22023']);

  // IM
  let im = await underlag(tx, id(412));
  assert.deepEqual(im.columns, [{ id: 'vecka', label: 'Per vecka' }]);
  const imClass = await grim(tx, create(id(412), 'IMA', im.plan.revision));
  await deny(tx, report, 'IM med annan kolumn än vecka ger 22023', t => grim(t, link(id(412), imClass.id, 'ak7', im.plan.revision)), ['22023']);
  assert.equal((await grim(tx, link(id(412), imClass.id, 'vecka', im.plan.revision))).revision, 0);
  im = await underlag(tx, id(412)); assert.equal(im.classes.find(c => c.id === imClass.id).link.columnId, 'vecka');
  check(report, 'IM-klass skapas och kopplas bara med kolumnen vecka');

  // Adoption of a legacy name row.
  const b8 = await grim(tx, create(id(410), '8B', u.plan.revision));
  u = await underlag(tx, id(410));
  const candidate = u.classes.find(c => c.id === b8.id);
  assert.equal(candidate.link, null); assert.equal(candidate.candidate.columnId, 'ak8'); assert.equal(candidate.candidate.revision, 0);
  const rowsBefore = (await tx`select count(*)::int n from public.class_timplans where unit_id=${id(30)}`)[0].n;
  const adopted = await grim(tx, link(id(410), b8.id, 'ak8', u.plan.revision, 0, id(410)));
  assert.equal(adopted.revision, 1); assert.equal(adopted.adopted, true); assert.equal(adopted.classId, b8.id);
  const stored = (await tx`select class_id,class_name,revision from public.class_timplans where unit_id=${id(30)} and class_name='8B' and start_year=2026`)[0];
  assert.equal(stored.class_id, b8.id); assert.equal(stored.revision, 1);
  assert.equal((await tx`select count(*)::int n from public.class_timplans where unit_id=${id(30)}`)[0].n, rowsBefore);
  check(report, 'namnrad blir identifierad bara genom rektors kommando och behåller klassens ID (revision 0→1)');
  assert.ok(u.legacyRows.some(r => r.className === '9C'));
  assert.equal((await tx`select count(*)::int n from public.class_timplans where class_name='9C' and class_id is not null`)[0].n, 0);
  check(report, 'namnrad utan kommando ger ingen identifierad rad och visas bara som namnrad');
  await deny(tx, report, 'två kandidatklasser för samma skola, namn och läsår kan inte uppstå', t => t`insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${id(1)},${id(2)},${id(30)},${id(401)},'8B',2026)`, ['23505']);
  const f7 = await grim(tx, create(id(412), '7F', im.plan.revision));
  im = await underlag(tx, id(412)); assert.equal(im.classes.find(c => c.id === f7.id).candidate, null);
  await deny(tx, report, 'namnrad från en annan utbildning adopteras inte', t => grim(t, link(id(412), f7.id, 'vecka', im.plan.revision, 0, id(410))), ['40001'], 'class_name_year_conflict');

  // Roles, schools, plans and customers.
  await actor('hm');
  const hmRead = await underlag(tx, id(410));
  assert.equal(hmRead.canManage, false); assert.ok(hmRead.classes.length >= 2);
  check(report, 'huvudman läser underlaget utan att kunna hantera');
  await deny(tx, report, 'huvudman skapar inte (42501)', t => grim(t, create(id(410), '7H', u.plan.revision)), ['42501']);
  await deny(tx, report, 'huvudman kopplar inte (42501)', t => grim(t, link(id(410), made.id, 'ak9', u.plan.revision, 1, id(410))), ['42501']);
  await actor('admin');
  const adminRead = await underlag(tx, id(410));
  assert.equal(adminRead.canManage, true);
  const adminClass = await grim(tx, create(id(410), '7S', adminRead.plan.revision));
  assert.equal((await grim(tx, link(id(410), adminClass.id, 'ak7', adminRead.plan.revision))).revision, 0);
  check(report, 'skoladministratör på skolan kan skapa och koppla');
  await actor('principal2');
  await deny(tx, report, 'rektor för annan skola läser inte (42501)', t => underlag(t, id(410)), ['42501']);
  await deny(tx, report, 'rektor för annan skola skapar inte (42501)', t => grim(t, create(id(410), '7H', u.plan.revision)), ['42501']);
  const bPlan = await underlag(tx, id(413)); assert.equal(bPlan.canManage, true);
  await deny(tx, report, 'klass från annan skola kan inte kopplas till skolans plan (42501)', t => grim(t, link(id(413), made.id, 'ak7', bPlan.plan.revision)), ['42501']);
  await actor('principal');
  const draft = await underlag(tx, id(411));
  assert.equal(draft.canManage, false); assert.ok(draft.blockers.some(b => b.includes('fastställd')));
  await deny(tx, report, 'ej fastställd plan nekas vid skrivning (42501)', t => grim(t, create(id(411), '7H', draft.plan.revision)), ['42501'], 'grim_class_plan_not_decided');
  const noYear = await underlag(tx, id(414));
  assert.equal(noYear.schoolYear, null); assert.equal(noYear.canManage, false); assert.ok(noYear.blockers.length > 0);
  await deny(tx, report, 'utbildning utan giltigt läsår blockerar skrivning (40001)', t => grim(t, create(id(414), '7H', noYear.plan.revision)), ['40001'], 'class_plan_not_ready');
  await gy.actor('principal');
  await deny(tx, report, 'fel kund nekas (42501)', t => underlag(t, id(410)), ['42501']);
  await deny(tx, report, 'Gy25-plan nekas i GR/IM-vägen (42501)', t => underlag(t, gy.planId), ['42501']);
  await actor('principal');
  await deny(tx, report, 'GR/IM-plan nekas fortfarande i Gy25-vägen (42501)', t => t`select public.phase5_class_underlag(${id(410)},2026)`, ['42501']);

  // Audit, direct writes and Worker role.
  await deny(tx, report, 'audit-fel ger 55000 utan kvitto eller skrivning', async t => {
    await t`alter table public.security_events add constraint grim_audit_fault check (action<>'grim_class_created') not valid`;
    await grim(t, create(id(410), '7K', u.plan.revision));
  }, ['55000']);
  assert.equal((await tx`select count(*)::int n from public.school_classes where name='7K'`)[0].n, 0);
  for (const role of ['authenticated', 'skolplattform_worker']) {
    await deny(tx, report, `direkt tabellskrivning av identifierad rad nekas för ${role}`, async t => {
      await t.unsafe(`set local role ${role}`);
      await t`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(${id(30)},'7A',2027,${id(410)},'ak7',${made.id})`;
    }, ['42501']);
  }
  await tx`set local role skolplattform_worker`;
  await actor('principal');
  const workerRead = await underlag(tx, id(410));
  const workerClass = await grim(tx, create(id(410), '7W', workerRead.plan.revision));
  assert.equal((await grim(tx, link(id(410), workerClass.id, 'ak7', workerRead.plan.revision))).revision, 0);
  await tx`reset role`;
  check(report, 'Worker-rollen kör underlag och kommando');
  for (const helper of HELPERS) assert.equal((await tx`select has_function_privilege('skolplattform_worker',${'public.' + helper},'EXECUTE') v`)[0].v, false, helper);
  for (const role of ['anon', 'authenticated', 'service_role']) for (const fn of [...ENTRYPOINTS, ...HELPERS])
    assert.equal((await tx`select has_function_privilege(${role},${'public.' + fn},'EXECUTE') v`)[0].v, false, role + fn);
  check(report, 'Worker kan bara köra underlag och kommando; hjälpfunktioner och klientroller är stängda');
}

export async function verifyGrimClassTimplans(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'grim-class-timplans-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    limitations: ['Own database and synthetic fixtures only; no installed target written', 'No HTTP/OIDC/browser claim',
      ephemeral ? 'Schema built from repository migrations on a private PostgreSQL instance with minimal Supabase stubs, not from an installed target' : 'Schema-only copy of the protected local target',
      'GR/IM plan status is set directly in the fixture; the GR/IM decision flow is not exercised here', 'SS 12000: class ↔ Group is intended compatibility, no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let source;
  try {
    report.sources = sources(); persist();
    if (ephemeral) {
      const { createEphemeralMigratedDb } = await import('./ephemeral-migrated-db.mjs');
      const e = await createEphemeralMigratedDb({ exclude: grimMigrations.map(p => basename(p)) });
      source = { db: e.db, provenance: e.provenance, close: e.end };
    } else {
      const { createNamedTimplanSnapshot } = await import('./named-timplan-snapshot.mjs');
      const s = await createNamedTimplanSnapshot();
      source = { db: s.db, provenance: s.provenance, close: async () => { report.cleanup = await s.cleanup(); } };
    }
    report.database = source.provenance; persist();
    const db = source.db;
    assert.equal((await db`select count(*)::int n from pg_proc where proname like 'phase51_grim%'`)[0].n, 0, 'GR/IM migration already present');
    // Each fixture defines session-temporary helpers with the same names; drop them between fixtures.
    const f = await db.begin(seedGrim); await db.unsafe('discard temp');
    const gy = await db.begin(seedGy); await db.unsafe('discard temp');
    const baseline = { fingerprint: await fingerprint(db), rows: await allPublicHashes(db), preserved: await functionDefs(db, PRESERVED) };
    const gyBefore = await gyOutcomes(db, gy);
    assert.equal(gyBefore.link.ok?.revision, 0, 'Gy25 baseline links'); assert.equal(gyBefore['hm create'].code, '42501');
    try { await db.begin(async tx => { await tx.unsafe(migrationSql()); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await fingerprint(db), baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'återrullning av migrationen återställer exakt schema, ACL och alla rader');
    const oldValidate = (await db`select pg_get_functiondef('public.validate_class_timplan()'::regprocedure) d`)[0].d;
    await db.begin(tx => tx.unsafe(migrationSql()));
    assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'installation i den egna databasen lämnar alla befintliga rader orörda');
    assert.deepEqual(await functionDefs(db, PRESERVED), baseline.preserved);
    check(report, 'Gy25-funktionerna och phase5_timplan_scope har oförändrad definition och ACL');
    const newValidate = (await db`select pg_get_functiondef('public.validate_class_timplan()'::regprocedure) d`)[0].d;
    const gyBranch = d => d.slice(d.indexOf("  p:=public.phase5_class_scope(new.timplan_id,true);"), d.indexOf(' else\n  if tg_op=\'UPDATE\' and old.class_id is not null'));
    assert.ok(gyBranch(oldValidate).length > 200); assert.equal(gyBranch(newValidate), gyBranch(oldValidate));
    const legacyBranch = d => d.slice(d.indexOf(" else\n  if tg_op='UPDATE' and old.class_id is not null"));
    assert.equal(legacyBranch(newValidate), legacyBranch(oldValidate));
    check(report, 'Gy25-grenen och namngrenen i validate_class_timplan är ordagrant oförändrade');
    const gyAfter = await gyOutcomes(db, gy);
    assert.deepEqual(gyAfter, gyBefore);
    check(report, 'Gy25-kopplingsfall ger samma resultat som före migrationen', { cases: gyBefore });
    const installed = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='60s'`; await grimMatrix(tx, report, f, gy); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), installed);
    check(report, 'hela GR/IM-provet rullas tillbaka utan kvarvarande rader');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { await source?.close(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status === 'PASS' ? `PASS: ${report.checks.length} GR/IM class link SQL checks` : `FAIL: ${report.failure?.message ?? report.sourceFailure?.message ?? report.cleanupFailure?.message}`);
  if (report.status !== 'PASS') process.exitCode = 1;
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ephemeral = args.includes('--ephemeral'), rest = args.filter(a => a !== '--ephemeral');
  assert.ok(rest.length === 2 && rest[0] === '--out', 'Use --out /private/tmp/<name>.json [--ephemeral]');
  await verifyGrimClassTimplans(rest[1], { ephemeral });
}
