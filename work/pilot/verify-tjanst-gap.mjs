#!/usr/bin/env node
// 05.1-11 (gap): Egen tjänst på flera skolor (CR-01) och samläsningens regler (WR-02) i migrationen 20261021120000.
// Före-läget skapas med de gamla (installerade) funktionerna och committas i den ägda databasen. Därefter repeteras
// migrationen med återrullning, installeras i den ägda databasen och fallen prövas i transaktioner som rullas tillbaka.
//   node work/pilot/verify-tjanst-gap.mjs --out /private/tmp/tjanst-gap-sql.json              (schemakopia; etapp 1, gap eller uttryckligt registrerat suffix)
// Historiska före-/reparationsfall körs alltid separat i en egen tillfällig databas.
// Efterlägets beteenden körs på installerat schema, utan nedgradering eller omtillämpad gapmigration.
//   node work/pilot/verify-tjanst-gap.mjs --out /private/tmp/tjanst-gap-sql.json --ephemeral  (egen PostgreSQL byggd från migrationerna utom rättelsen)
// Bara syntetiska data. Inget installerat mål skrivs; målets journal läses bara läsande. Ingen HTTP/OIDC.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, fsyncSync, ftruncateSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allPublicHashes } from './verify-atomic-cohort-copy.mjs';
import { createTjanstFixture, grantSelf, personalRead, planCommand, planRead, planSend, seedGrimNeeds, selfRead, selfSend, staffWithDuties,
  tjanstEtapp1Migrations, tjanstGapMigrations } from './tjanst-fixtures.mjs';
import { WORKER_ENTRYPOINTS } from './apply-tjanst.mjs';
import { targetPendingMigrations, workerGrants } from './verify-tjanst-actual.mjs';
import { assertTjanstSelfMandatesSchema, TJANST_MIGRATION_REGISTRY, TJANST_BASELINE_LENGTH } from './tjanst-migration-state.mjs';
import { createEphemeralMigratedDb, migrationFiles } from './ephemeral-migrated-db.mjs';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { parsePlanCommandReply, parsePlanReadReply, parseSelfCommandReply, parseSelfReadReply } from '../../web/lib/tjanst-contract.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [GAP] = tjanstGapMigrations;
const sourceFiles = [...TJANST_MIGRATION_REGISTRY.map(m => m.file), 'work/pilot/tjanst-migration-state.mjs', 'work/pilot/verify-tjanst-actual.mjs', 'work/pilot/named-timplan-snapshot.mjs', 'work/pilot/verify-tjanst-gap.mjs', 'work/pilot/tjanst-fixtures.mjs', 'work/pilot/ephemeral-migrated-db.mjs', 'work/pilot/ephemeral-supabase-stubs.sql'];
const sources = () => Object.fromEntries(sourceFiles.map(p => [p, createHash('sha256').update(readFileSync(resolve(root, p))).digest('hex')]));
const sql = p => readFileSync(resolve(root, p), 'utf8');
const rollback = Error('expected_tjanst_gap_rollback');
const Y = 2026;
const ROLES = ['anon', 'authenticated', 'service_role', 'skolplattform_worker'];
const LINK_COLUMNS = ['access_assignment_id', 'binding_id', 'customer_id', 'organizer_id', 'linked_by_assignment_id', 'linked_at'];
/** Funktioner som migrationen ersätter (create or replace); ägare och rättigheter ska vara oförändrade. */
const REPLACED = ['phase51_bind_self_person(access_assignments,uuid,uuid,uuid,uuid[])', 'tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)',
  'tjanst_plan_save_row(access_assignments,tjanst_distributions,jsonb)', 'tjanst_self_command(jsonb)',
  'tjanst_self_person(access_assignments)', 'tjanst_self_projection(access_assignments)'];
const JOINT_INVALID = 'En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.';
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

function check(report, name, detail) { report.checks.push({ name, ok: true, baseline: report.activeBaseline, ...(detail === undefined ? {} : { detail }) }); console.log('PASS: ' + name); }
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
const selection = (f, extra = {}) => ({ schoolYear: Y, unitId: f.schools.A, classId: null, educationId: null, grade: null, status: null, page: 1, ...extra });
const card = (pupilId, extra = {}) => ({ pupilId, schoolYear: Y, caseId: null, ...extra });
/** De nio elevfunktionerna (samma anrop som verify-tjanst-personal.mjs). */
const PUPIL_CALLS = {
  'phase4_validate_selection(jsonb)': (t, f) => t`select public.phase4_validate_selection(${t.json(selection(f))}) value`,
  'phase4_list_pupils(jsonb)': (t, f) => t`select public.phase4_list_pupils(${t.json({ selection: selection(f), search: '', caseId: null })}) value`,
  'phase4_register_selection()': t => t`select public.phase4_register_selection() value`,
  'phase3_probe_scope()': t => t`select public.phase3_probe_scope() value`,
  'phase4_card_row(jsonb)': (t, f) => t`select to_jsonb(r) value from public.phase4_card_row(${t.json(card(f.pupils.inGroup))}) r`,
  'phase4_pupil_card(jsonb)': (t, f) => t`select public.phase4_pupil_card(${t.json(card(f.pupils.inGroup))}) value`,
  'phase4_pupil_history(jsonb)': (t, f) => t`select public.phase4_pupil_history(${t.json(card(f.pupils.inGroup, { page: 1 }))}) value`,
  'phase4_export_pupils(jsonb,boolean)': (t, f) => t`select public.phase4_export_pupils(${t.json({ mode: 'ids', ids: [f.pupils.inGroup], schoolYear: Y, caseId: null, fields: ['id', 'displayName'], protectedIds: [], includePersonalNumber: false })},true) value`,
  'phase4_reveal_personal_number(jsonb)': (t, f) => t`select public.phase4_reveal_personal_number(${t.json(card(f.pupils.inGroup))}) value`,
};
const codes = d => d.blockers.map(b => b.code);

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
async function beforeState(tx, report, f, afterMode = false) {
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
  if (afterMode) {
    assert.deepEqual(onB, [A, B].sort()); assert.deepEqual(onA, [A, B].sort()); assert.equal(valid, true);
    assert.deepEqual(bindings.map(b => [b.access_assignment_id, b.ended]), [[mandateA, false]]);
    check(report, 'efterlägets fixtur: två skolmandat behåller samma aktiva personbindning och båda skolorna');
  } else {
  assert.deepEqual(onB, [B]); assert.deepEqual(onA, [B]); assert.equal(valid, true);
  assert.deepEqual(bindings.map(b => [b.access_assignment_id, b.ended]), [[mandateA, true], [mandateB, false]]);
  check(report, 'före-läget visar CR-01: med de gamla funktionerna saknar publikationslistan skola A både med session på mandat A och på mandat B, fast mandat A gäller',
    { sessionOnB: onB.map(u => u === B ? 'B' : u), sessionOnA: onA.map(u => u === B ? 'B' : u), mandateAValid: valid });

  }

  // Ett mandat vars bindning avslutades av ett annat par (samma konto, annan person) ska inte kopplas om.
  const m3 = await grantSelf(tx, f, { teacher: 'teacherGroup', by: 'principalA', unitIds: [A], staffPersonId: p3.personId });
  await revoke(tx, f, 'principalA', m3);
  const m4 = await grantSelf(tx, f, { teacher: 'teacherGroup', by: 'principalA', unitIds: [A], staffPersonId: p4.personId });
  // WR-02: utkast på A med två ogiltiga samläsningar, skapade med de gamla funktionerna (save_joint följer regeln, save_row bryter den).
  await f.actor(tx, 'principalA');
  let r = await send(tx, await planCommand(A, Y, 'create_draft', (await read(tx, A)).revision, { basedOnVersionId: vA.id }));
  const A7 = f.classes.group, B7 = f.classes.other, IM = g.imClass;
  const addRow = async (classId, rowKey, personId, ht, vt) => {
    const need = needOf(r.detail, classId, rowKey);
    r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, { rowId: null, sourceKind: 'class_timplan', sourceKey: need.sourceKey, personId, teacherHt: ht, teacherVt: vt, comment: '' }));
    return r.detail.rows.find(x => x.sourceKey === need.sourceKey && x.personId === personId).id;
  };
  const j1a = await addRow(A7, 'matematik', p1.personId, 1350, 1350), j1b = await addRow(B7, 'matematik', p1.personId, 1350, 1350);
  const j2a = await addRow(B7, 'engelska', p2.personId, 600, 600), j2b = await addRow(IM, 'im-sv', p1.personId, 600, 600);
  r = await send(tx, await planCommand(A, Y, 'save_joint', r.detail.revision, { jointId: null, name: 'Matematik 7A+7B', rowIds: [j1a, j1b], teachers: [{ personId: p1.personId, ht: 1350, vt: 1350 }] }));
  r = await send(tx, await planCommand(A, Y, 'save_joint', r.detail.revision, { jointId: null, name: 'Engelska 7B+IM', rowIds: [j2a, j2b],
    teachers: [{ personId: p1.personId, ht: 600, vt: 600 }, { personId: p2.personId, ht: 600, vt: 600 }] }));
  // Gamla save_row: raden j1b flyttas till 7A (gruppen hamnar i en enda klass), och j2a byter lärare (P2 får lärartid utan rad).
  if (afterMode) {
    // Märkt syntetisk äldre dataskada i egen kopia: funktionerna är fortfarande efterlägets.
    const key = needOf(r.detail, A7, 'biologi').sourceKey;
    const [{ need }] = await tx`select public.tjanst_need(${A},${Y},${key}) need`;
    const link = need.link;
    await tx`update public.tjanst_rows set source_key=${need.sourceKey},class_id=${need.classId},
      link_revision=${link.linkRevision},timplan_id=${link.timplanId},series_id=${link.seriesId},timplan_version=${link.timplanVersion},
      timplan_row_key=${need.rowKey},link_column=${link.column},need_label=${need.label},need_ht_minutes=${need.needHt},
      need_vt_minutes=${need.needVt},need_basis=${need.needBasis} where id=${j1b}`;
    await tx`update public.tjanst_rows set staff_person_id=${p1.personId} where id=${j2a}`;
  } else {
  r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, { rowId: j1b, sourceKind: 'class_timplan', sourceKey: needOf(r.detail, A7, 'biologi').sourceKey, personId: p1.personId, teacherHt: 1350, teacherVt: 1350, comment: '' }));
  r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, { rowId: j2a, sourceKind: 'class_timplan', sourceKey: needOf(r.detail, B7, 'engelska').sourceKey, personId: p1.personId, teacherHt: 600, teacherVt: 600, comment: '' }));
  }
  const old = await read(tx, A);
  const g1 = old.joints.find(j => j.name === 'Matematik 7A+7B').id, g2 = old.joints.find(j => j.name === 'Engelska 7B+IM').id;
  const classesOf = id => new Set(old.rows.filter(x => x.jointGroupId === id).map(x => x.sourceKey.split(':')[1])).size;
  assert.equal(classesOf(g1), 1); assert.ok(!old.rows.some(x => x.jointGroupId === g2 && x.personId === p2.personId));
  assert.ok(old.joints.find(j => j.id === g2).teachers.some(t => t.personId === p2.personId));
  if (afterMode) {
    assert.ok(codes(old).includes('joint_invalid')); assert.equal(old.capabilities.canPublish, false);
    check(report, 'efterlägets fixtur: märkt direkt dataändring återskapar äldre ogiltig samläsning utan att skriva om funktioner');
  } else {
  assert.ok(!codes(old).includes('joint_invalid')); assert.equal(old.capabilities.canPublish, true);
  check(report, 'före-läget visar WR-02: med de gamla funktionerna har en grupp rader i en enda klass och en annan lärartid för en lärare utan rad, utan blockerare (canPublish true)',
    { blockers: codes(old), canPublish: old.capabilities.canPublish });
  }
  const draftA = { j1a, j1b, j2a, j2b, g1, g2 };
  return { p1: p1.personId, p2: p2.personId, p3: p3.personId, p4: p4.personId, g, nb, nc, mandateA, mandateB, m3, m4, vA: vA.id, vB: vB.id, draftA };
}

/** Kontroller av tabell, ifyllnad och rättigheter efter installationen. */
async function installedChecks(db, report, f, s) {
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
}

/** Ägare och rättigheter för ersatta funktioner, nya funktioner stängda och Worker-entrypoints (efter fallen, så att beteendefallen prövas först). */
async function functionChecks(db, report, before) {
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

/** tjanst_self_mandates är oföränderlig: update, delete och truncate nekas med 42501. */
async function guards(tx, report, f, s) {
  await deny(tx, report, 'tjanst_self_mandates: update ger 42501', t => t`update public.tjanst_self_mandates set linked_at=clock_timestamp() where access_assignment_id=${s.mandateA}`, ['42501']);
  await deny(tx, report, 'tjanst_self_mandates: delete ger 42501', t => t`delete from public.tjanst_self_mandates where access_assignment_id=${s.mandateA}`, ['42501']);
  await deny(tx, report, 'tjanst_self_mandates: truncate ger 42501', t => t`truncate public.tjanst_self_mandates`, ['42501']);
}

/** CR-01, nytt flöde för P2: två rektorer, återkallelse, skola utan mandat, tredje konto och elevspärren. */
async function selfFlow(tx, report, f, s) {
  const { A, B, C } = f.schools;
  const row = (classId, personId) => [{ classId, rowKey: 'matematik', personId, ht: 600, vt: 600 }];
  const vA2 = await publishRows(tx, f, 'principalA', A, row(f.classes.group, s.p2));
  const vB2 = await publishRows(tx, f, 'principalB', B, row(s.nb.classId, s.p2));
  const vC = await publishRows(tx, f, 'principalAB', C, row(s.nc.classId, s.p2));
  const a2 = await grantSelf(tx, f, { teacher: 'teacherSelf2', by: 'principalA', unitIds: [A], staffPersonId: s.p2 });
  const b2 = await grantSelf(tx, f, { teacher: 'teacherSelf2', by: 'principalB', unitIds: [B], staffPersonId: s.p2 });
  const bindings = await tx`select id,membership_id,ended_at from public.staff_person_bindings where staff_person_id=${s.p2}`;
  assert.equal(bindings.length, 1); assert.equal(bindings[0].ended_at, null); assert.equal(bindings[0].membership_id, f.membership('teacherSelf2'));
  const binding = bindings[0].id;
  assert.deepEqual((await tx`select access_assignment_id from public.tjanst_self_mandates where binding_id=${binding}`).map(x => x.access_assignment_id).sort(), [a2, b2].sort());
  const bound = await tx`select details from public.security_events where action='tjanst_person_bound' and object_type='staff_person_binding' and object_id=${binding} order by id`;
  assert.deepEqual(bound.map(e => e.details), [a2, b2].map(assignmentId => ({ personId: s.p2, membershipId: f.membership('teacherSelf2'), assignmentId })));
  assert.equal((await tx`select count(*)::int n from public.security_events where action='tjanst_binding_ended' and details->>'personId'=${s.p2}`)[0].n, 0);
  await f.actor(tx, 'teacherSelf2');
  const both = await self(tx);
  assert.deepEqual(units(both), [A, B].sort()); assert.deepEqual(both.publications.map(p => p.versionId).sort(), [vA2.id, vB2.id].sort());
  check(report, 'nytt flöde: rektor A och rektor B ger P2:s konto Egen tjänst; en aktiv bindning, två kopplingsrader, två tjanst_person_bound och ingen tjanst_binding_ended; P2 ser A och B',
    { bindings: 1, links: 2, bound: bound.length });
  assert.ok(!units(both).includes(C));
  await deny(tx, report, 'skola C har en publicerad rad för P2 men inget mandat: den syns inte och kvittens ger 42501', t => selfSend(t, { commandId: randomUUID(), versionId: vC.id, action: 'ack' }), ['42501']);

  // Bindningens första mandat (A) återkallat, mandat B gäller: ett tredje konto nekas ändå (alla kopplade mandat räknas).
  await tx.savepoint(async t => {
    await revoke(t, f, 'principalA', a2);
    await deny(t, report, 'tredje konto nekas med 42501 när bindningens första mandat är återkallat men ett annat kopplat mandat gäller',
      u => grantSelf(u, f, { teacher: 'teacherSelf3', by: 'principalA', unitIds: [A], staffPersonId: s.p2 }), ['42501']);
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });

  await revoke(tx, f, 'principalB', b2);
  await sessionOn(tx, f, 'teacherSelf2', a2);
  const onlyA = await self(tx);
  assert.deepEqual(units(onlyA), [A]);
  await deny(tx, report, 'rektor B återkallar mandat B: P2 ser bara A, och kvittens på B:s version ger 42501', t => selfSend(t, { commandId: randomUUID(), versionId: vB2.id, action: 'ack' }), ['42501']);
  await deny(tx, report, 'tredje konto för P2 nekas med 42501 så länge ett kopplat mandat gäller',
    t => grantSelf(t, f, { teacher: 'teacherSelf3', by: 'principalA', unitIds: [A], staffPersonId: s.p2 }), ['42501']);
  await revoke(tx, f, 'principalA', a2);
  await f.assign(tx, 'teacherSelf2', 'principalA', { function: 'larare', scopeKind: 'group', unitIds: [A], groups: [{ id: f.classes.group, kind: 'teaching' }] });
  await f.actor(tx, 'teacherSelf2');
  await deny(tx, report, 'båda mandaten återkallade: egen läsning nekas med 42501, också via kontots gruppmandat', t => selfRead(t), ['42501']);

  const a3 = await grantSelf(tx, f, { teacher: 'teacherSelf3', by: 'principalA', unitIds: [A], staffPersonId: s.p2 });
  const after = await tx`select id,membership_id,ended_at from public.staff_person_bindings where staff_person_id=${s.p2} order by bound_at,id`;
  assert.equal(after.length, 2); assert.ok(after.find(b => b.id === binding).ended_at);
  const fresh = after.find(b => b.id !== binding);
  assert.equal(fresh.ended_at, null); assert.equal(fresh.membership_id, f.membership('teacherSelf3'));
  assert.equal((await tx`select count(*)::int n from public.security_events where action='tjanst_binding_ended' and object_id=${binding}`)[0].n, 1);
  assert.deepEqual((await tx`select access_assignment_id from public.tjanst_self_mandates where binding_id=${fresh.id}`).map(x => x.access_assignment_id), [a3]);
  await f.actor(tx, 'teacherSelf3');
  assert.deepEqual(units(await self(tx)), [A]);
  check(report, 'när alla kopplade mandat är återkallade avslutas bindningen med tjanst_binding_ended, och det tredje kontots bindning skapas');

  // Elevspärren och övriga familjer för self-sessionen.
  for (const [name, call] of Object.entries(PUPIL_CALLS)) await deny(tx, report, `self nekas i ${name} (42501)`, t => call(t, f), ['42501']);
  await deny(tx, report, 'self når inte personalläsningen (42501)', t => personalRead(t, { unitId: A }), ['42501']);
  await deny(tx, report, 'self når inte planläsningen (42501)', t => planRead(t, { unitId: A, schoolYear: Y }), ['42501']);
}

/** WR-02 och regressionsprov av blockerarna. */
async function jointRules(tx, report, f, s) {
  const { A, B, C } = f.schools, { j1a, j2a, j2b, g1, g2 } = s.draftA;
  await f.actor(tx, 'principalA');
  let d = await read(tx, A);
  const base = d.rows.find(x => x.id === j2a);
  const payload = extra => ({ rowId: j2a, sourceKind: 'class_timplan', sourceKey: base.sourceKey, personId: base.personId, teacherHt: base.teacherHt, teacherVt: base.teacherVt, comment: base.comment, ...extra });
  const state = async () => ({
    row: (await tx`select to_jsonb(r) v from public.tjanst_rows r where id=${j2a}`)[0].v,
    members: (await tx`select row_id from public.tjanst_joint_members where group_id=${g2} order by row_id`).map(x => x.row_id),
    time: await tx`select staff_person_id,ht_minutes,vt_minutes from public.tjanst_joint_teacher_time where group_id=${g2} order by staff_person_id`,
    revision: (await tx`select revision from public.tjanst_distributions where unit_id=${A} and school_year=${Y}`)[0].revision });
  const before = await state();
  await deny(tx, report, 'WR-02: save_row på samläst rad med ändrad personId ger 22023 tjanst_joint_already',
    async t => send(t, await planCommand(A, Y, 'save_row', d.revision, payload({ personId: s.p2 }))), ['22023'], 'tjanst_joint_already');
  await deny(tx, report, 'WR-02: save_row på samläst rad med ändrad sourceKey ger 22023 tjanst_joint_already',
    async t => send(t, await planCommand(A, Y, 'save_row', d.revision, payload({ sourceKey: needOf(d, f.classes.other, 'matematik').sourceKey }))), ['22023'], 'tjanst_joint_already');
  await deny(tx, report, 'WR-02: save_row på samläst rad med personId null ger 22023 tjanst_joint_already',
    async t => send(t, await planCommand(A, Y, 'save_row', d.revision, payload({ personId: null }))), ['22023'], 'tjanst_joint_already');
  assert.deepEqual(await state(), before);
  check(report, 'WR-02: nekad save_row lämnar raden, gruppen och revisionen oförändrade');
  let r = await send(tx, await planCommand(A, Y, 'save_row', d.revision, payload({ teacherHt: 700, teacherVt: 500, comment: 'Syntetisk ändring' })));
  const saved = r.detail.rows.find(x => x.id === j2a);
  assert.deepEqual([saved.teacherHt, saved.teacherVt, saved.comment, saved.jointGroupId, saved.personId], [700, 500, 'Syntetisk ändring', g2, base.personId]);
  check(report, 'WR-02: ändrad teacherHt, teacherVt och comment på samläst rad sparas som förut');

  d = r.detail;
  assert.ok(codes(d).includes('joint_invalid')); assert.equal(d.blockers.find(b => b.code === 'joint_invalid').message, JOINT_INVALID);
  assert.equal(d.capabilities.canPublish, false); assert.ok(!d.actions.includes('publish'));
  await deny(tx, report, 'ogiltig samläsning från före rättelsen ger joint_invalid, canPublish false och publish 40001 tjanst_publish_blocked',
    async t => send(t, await planCommand(A, Y, 'publish', d.revision, {}, { expectedContentHash: d.version.contentHash })), ['40001'], 'tjanst_publish_blocked');
  const dissolve = async (t, rev, jointId) => send(t, await planCommand(A, Y, 'dissolve_joint', rev, { jointId }));
  for (const [kept, gone] of [[g1, g2], [g2, g1]]) await tx.savepoint(async t => {
    const x = await dissolve(t, d.revision, gone);
    assert.ok(codes(x.detail).includes('joint_invalid'), 'kvar: ' + kept);
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'joint_invalid ges för varje regel för sig: grupp med rader i en enda klass, respektive lärartid för en lärare utan rad i gruppen');
  await tx.savepoint(async t => {
    let x = await dissolve(t, d.revision, g1); x = await dissolve(t, x.detail.revision, g2);
    assert.ok(!codes(x.detail).includes('joint_invalid')); assert.equal(x.detail.capabilities.canPublish, true);
    x = await send(t, await planCommand(A, Y, 'publish', x.detail.revision, {}, { expectedContentHash: x.detail.version.contentHash }));
    assert.equal(x.detail.version.status, 'published');
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'efter Lös upp samläsningen (dissolve_joint) försvinner joint_invalid och publiceringen går igenom');
  r = await dissolve(tx, d.revision, g1);
  r = await send(tx, await planCommand(A, Y, 'save_joint', r.detail.revision, { jointId: g2, name: 'Engelska 7B+IM', rowIds: [j2a, j2b], teachers: [{ personId: s.p1, ht: 600, vt: 600 }] }));
  assert.deepEqual(codes(r.detail), []); assert.equal(r.detail.capabilities.canPublish, true);
  // Regression: en rad utan samläsning kan byta lärare.
  const plain = r.detail.rows.find(x => x.jointGroupId === null && x.personId === s.p1 && x.sourceKey === needOf(r.detail, f.classes.group, 'engelska').sourceKey);
  r = await send(tx, await planCommand(A, Y, 'save_row', r.detail.revision, { rowId: plain.id, sourceKind: 'class_timplan', sourceKey: plain.sourceKey, personId: s.p2, teacherHt: plain.teacherHt, teacherVt: plain.teacherVt, comment: '' }));
  assert.equal(r.detail.rows.find(x => x.id === plain.id).personId, s.p2);
  check(report, 'regression: save_row på en rad utan samläsning kan byta lärare');
  r = await send(tx, await planCommand(A, Y, 'publish', r.detail.revision, {}, { expectedContentHash: r.detail.version.contentHash }));
  assert.equal(r.detail.version.status, 'published'); void j1a;
  check(report, 'efter rättad save_joint försvinner joint_invalid och publiceringen går igenom');

  // Regression: empty_draft (C), stale_rows och person_not_at_school (B) uppstår som förut.
  await f.actor(tx, 'principalAB');
  const empty = await send(tx, await planCommand(C, Y, 'create_draft', (await read(tx, C)).revision, { basedOnVersionId: null }));
  assert.deepEqual(codes(empty.detail), ['empty_draft']);
  await f.actor(tx, 'principalB');
  let b = await read(tx, B);
  b = (await send(tx, await planCommand(B, Y, 'create_draft', b.revision, { basedOnVersionId: b.version.id }))).detail;
  assert.deepEqual(codes(b), []);
  await tx.savepoint(async t => {
    await t`set local session_replication_role=replica`;
    await t`update public.class_timplans set revision=revision+1 where class_id=${s.nb.classId} and start_year=${Y}`;
    await t`set local session_replication_role=origin`;
    assert.deepEqual(codes(await read(t, B)), ['stale_rows']);
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  await tx.savepoint(async t => {
    await t`set local session_replication_role=replica`;
    await t`delete from public.staff_school_duties where staff_person_id=${s.p1} and unit_id=${B}`;
    await t`set local session_replication_role=origin`;
    assert.deepEqual(codes(await read(t, B)), ['person_not_at_school']);
    throw rollback;
  }).catch(e => { if (e !== rollback) throw e; });
  check(report, 'regression: empty_draft, stale_rows och person_not_at_school uppstår som förut');
}

/** Alla namngivna beteendefall körs med återställda roller och full återrullning. */
async function behaviorChecks(db, report, f, s) {
  const installed = await allPublicHashes(db), schema = await fingerprint(db);
  for (const step of [cr01, guards, selfFlow, jointRules]) {
    const roles = { ...f.roles };
    try { await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='120s'`; await step(tx, report, f, s); throw rollback; }); }
    catch (e) { if (e !== rollback) throw e; }
    finally { Object.assign(f.roles, roles); }
  }
  assert.deepEqual(await allPublicHashes(db), installed); assert.equal(await fingerprint(db), schema);
  check(report, 'alla fall rullas tillbaka utan kvarvarande rader');
}

/** Historiska reparationsfall har en uttrycklig etapp 1-bas, aldrig en nedgraderad mål-/schemakopia. */
async function beforeRepairChecks(report) {
  const exclude = migrationFiles().filter(f => f.slice(0, 14) > tjanstEtapp1Migrations.at(-1).split('/').at(-1).slice(0, 14));
  const e = await createEphemeralMigratedDb({ exclude });
  report.beforeDatabase = e.provenance; report.activeBaseline = 'ephemeral-etapp1-before-repair';
  try {
    const db = e.db;
    await assertTjanstSelfMandatesSchema(db, { installed: false });
    check(report, 'tillfällig databas har etapp 1 men inte rättelsen');
    const f = await db.begin(createTjanstFixture), s = await db.begin(tx => beforeState(tx, report, f));
    const baseline = { fingerprint: await fingerprint(db), rows: await allPublicHashes(db), functions: await functionMeta(db) };
    try { await db.begin(async tx => { await tx.unsafe(sql(GAP)); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await fingerprint(db), baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), baseline.rows);
    check(report, 'repetition med återrullning återställer exakt schema, ACL och alla rader', { fingerprint: baseline.fingerprint });
    await db.begin(tx => tx.unsafe(sql(GAP)));
    const installedRows = await allPublicHashes(db);
    for (const [table, value] of Object.entries(baseline.rows)) assert.deepEqual(installedRows[table], value, table);
    check(report, 'installation i den ägda databasen lämnar alla befintliga rader orörda (person-, klass- och rad-ID oförändrade)', { tables: Object.keys(baseline.rows).length });
    await assertTjanstSelfMandatesSchema(db, { installed: true });
    await installedChecks(db, report, f, s);
    await behaviorChecks(db, report, f, s);
    await functionChecks(db, report, baseline.functions);
  } finally { await e.end(); report.beforeCleanup = 'complete'; }
}

export async function verifyTjanstGap(out, { ephemeral = false } = {}) {
  const output = resolve(out);
  assert.ok((output.startsWith('/private/tmp/') || output.startsWith('/tmp/')) && output.endsWith('.json'), 'REFUSED: use --out /private/tmp/<name>.json');
  assert.ok(!existsSync(output), 'REFUSED: output exists; choose a new private path');
  const fd = openSync(output, 'wx', 0o600);
  const report = { kind: 'tjanst-gap-owned-database', status: 'FAIL', mode: ephemeral ? 'ephemeral' : 'schema-snapshot', checks: [], startedAt: new Date().toISOString(),
    migration: GAP,
    limitations: ['Own databases and synthetic fixtures only; no installed target written; target journal/schema read in read-only transactions',
      'Historical before/repair cases use a separate ephemeral PostgreSQL at stage 1 with minimal Supabase stubs',
      'Schema-copy after cases use current functions; marked direct fixture mutations represent older invalid joint data without downgrading functions',
      'GR/IM plan status and calendars are set directly in fixtures; no HTTP/OIDC/browser claim',
      'SS 12000:2024 / OpenAPI 2.1.0: unchanged internal Person/Duty/Activity mapping; no exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let snapshot;
  try {
    report.sources = sources(); persist();
    // Even ephemeral mode refuses changed/unknown repository suffixes.
    const { classifyTjanstMigrations, TJANST_PHASE_START } = await import('./tjanst-migration-state.mjs');
    classifyTjanstMigrations({ journal: tjanstEtapp1Migrations.map(p => basename(p).slice(0, 14)), sourceHashes:
      Object.fromEntries(migrationFiles().filter(f => f.slice(0, 14) >= TJANST_PHASE_START).map(f => {
        const p = 'supabase/migrations/' + f; return [p, createHash('sha256').update(sql(p)).digest('hex')]; })) });
    const target = ephemeral ? null : await targetPendingMigrations();
    report.baselineMode = target?.baselineMode ?? 'ephemeral-etapp1';
    report.pendingMigrations = target?.pendingMigrations ?? [GAP];
    report.targetJournal = target?.journal; persist();
    await beforeRepairChecks(report); persist();
    if (!ephemeral) {
      snapshot = await createNamedTimplanSnapshot(); report.database = snapshot.provenance;
      assert.equal(snapshot.provenance.sourceFingerprint, target.fingerprint, 'Målets schema ändrades mellan journal och kopiering');
      const db = snapshot.db;
      report.activeBaseline = 'schema-copy:' + target.baselineMode;
      report.baselineFingerprint = await schemaFingerprint(db);
      await assertTjanstSelfMandatesSchema(db, { installed: target.installed.length > TJANST_BASELINE_LENGTH });
      await db.begin(async tx => { for (const p of target.pendingMigrations) await tx.unsafe(sql(p)); await tx`set constraints all immediate`; });
      report.installedFingerprint = await schemaFingerprint(db);
      if (!target.pendingMigrations.length) assert.equal(report.installedFingerprint, report.baselineFingerprint, 'Efterläget får inte skrivas om');
      await assertTjanstSelfMandatesSchema(db, { installed: true });
      report.grants = await workerGrants(db);
      assert.deepEqual(report.grants.workerExecute, [...WORKER_ENTRYPOINTS].sort());
      assert.deepEqual(report.grants.clientRoleExecute, []); assert.deepEqual(report.grants.tablePrivileges, []); assert.deepEqual(report.grants.publicTablePrivileges, []);
      check(report, 'schemakopian har väntat self-mandatsschema och ACL; endast verifierat väntande suffix har tillämpats', { baselineMode: target.baselineMode, pendingMigrations: target.pendingMigrations });
      const f = await db.begin(createTjanstFixture), s = await db.begin(tx => beforeState(tx, report, f, true));
      await behaviorChecks(db, report, f, s);
      report.finalFingerprint = await schemaFingerprint(db); assert.equal(report.finalFingerprint, report.installedFingerprint);
      const after = await targetPendingMigrations(); assert.equal(after.fingerprint, target.fingerprint); assert.deepEqual(after.journal, target.journal);
      report.targetUnchanged = { schema: true, journal: true, targetConnections: 'read only' };
      check(report, 'målets schema och journal är oförändrade efter schema-copy-proven');
    }
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { if (snapshot) report.cleanup = await snapshot.cleanup(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    delete report.activeBaseline;
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
