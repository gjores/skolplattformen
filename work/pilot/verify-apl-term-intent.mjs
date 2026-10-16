#!/usr/bin/env node
// Term intent delta only, in an owned post-APL schema-only database. Never active DDL.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, openSync, closeSync, ftruncateSync, writeSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { aplUxFixture } from './apl-ux-fixtures.mjs';
import { aplSources, aplActor, aplRace, aplDeny, aplRead, aplCommand, aplStatus,
  aplPreparedDraft, aplSave, aplDraftFromApproved } from './verify-apl-plan-commands.mjs';
import { aplDecisionRequest, aplDecisionCommand, aplDecisionBasis } from './verify-apl-plan-decisions.mjs';
import { aplCanonicalSerialize, aplContentHashPayload, projectAplPlan } from '../../web/lib/apl-plan.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const termMigration = 'supabase/migrations/20261016130000_apl_term_intent.sql';
const sourcePaths = [termMigration, 'work/pilot/verify-apl-term-intent.mjs', 'work/pilot/apl-ux-fixtures.mjs',
  'work/pilot/verify-apl-plan-decisions.mjs', 'supabase/migrations/20261016121000_apl_plan_decisions.sql',
  'supabase/migrations/20261016122000_apl_worker_access.sql'];
const sources = () => aplSources(sourcePaths);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const rollback = Error('expected_term_intent_rollback');
const ok = (report, name) => { report.checks.push({ name, ok: true }); console.log('PASS: ' + name); };
// The new column is excluded only for original-row preservation; all original columns and timestamps stay bound.
async function originalRows(db, structure) {
  const result = {};
  for (const table of structure.tables.filter(t => t.relkind === 'r')) {
    const names = structure.columns.filter(c => c.relname === table.relname).map(c => c.attname);
    const projection = names.map(quote).join(',');
    result[table.relname] = (await db.unsafe(`select count(*)::integer count, md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from (select ${projection} from public.${quote(table.relname)}) t`))[0];
  }
  return result;
}
async function stage(db, originalStructure) {
  const structure = await schemaFingerprint(db, true);
  return { fingerprint: digest(structure), structure, rows: await originalRows(db, originalStructure ?? structure) };
}
async function parity(tx, verified) {
  const { basis } = verified.envelope, { detail, context } = verified;
  const [{ bytes }] = await tx`select public.phase5_apl_canonical(public.phase5_apl_hash_payload(${tx.json(basis.gymTimplan)},${basis.organizerId},${tx.json(detail.plan)},${tx.json(basis.copyReview)},${tx.json(detail.program)})) bytes`;
  assert.equal(bytes, aplCanonicalSerialize(aplContentHashPayload(context, detail.plan)));
}
const emptyPeriod = index => ({ id: randomUUID(), name: '', startsOn: null, endsOn: null, schoolYear: null,
  plannedTermIndex: index, extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' }, contents: [], allocations: [] });
async function seed(tx) {
  const f = await aplUxFixture(tx), draft = await aplPreparedDraft(tx, f, 'Syntetisk äldre APL');
  const save = aplSave(draft), saved = await aplCommand(tx, save);
  const confirm = { contractVersion: 'structured_v1', action: 'confirm', commandId: randomUUID(), planId: draft.planId,
    expectedRevision: saved.detail.revision, expectedContentHash: saved.detail.contentHash, comment: 'Granskad syntetisk äldre period.' };
  const confirmed = await aplCommand(tx, confirm);
  const submit = await aplDecisionRequest(tx, draft.planId, 'submit');
  const submitted = await aplDecisionCommand(tx, submit);
  await aplActor(tx, f, 'hm'); const approve = await aplDecisionRequest(tx, draft.planId, 'approve');
  const approved = await aplDecisionCommand(tx, approve);
  await aplActor(tx, f, 'principal'); const read = await aplRead(tx, draft.planId);
  assert.equal((await aplDecisionBasis(tx, draft.planId)).result.apl.ready, true);
  return { f, draft, save, saved, confirm, confirmed, submit, submitted, approve, approved, read };
}
async function matrix(tx, report, old) {
  const { f } = old; await aplActor(tx, f, 'principal');
  assert.deepEqual((await aplRead(tx, old.draft.planId)).envelope, old.read.envelope);
  assert.equal((await aplDecisionBasis(tx, old.draft.planId)).result.apl.ready, true);
  for (const [q, previous] of [[old.save, old.saved], [old.confirm, old.confirmed]]) {
    const replay = await aplCommand(tx, q), expected = structuredClone(previous.envelope);
    expected.result.receipt.replayed = true; assert.deepEqual(replay.envelope, expected);
    assert.deepEqual((await aplStatus(tx, q)).envelope.result.result, expected.result);
  }
  for (const [q, previous, actor] of [[old.submit, old.submitted, 'principal'], [old.approve, old.approved, 'hm']]) {
    await aplActor(tx, f, actor); const replay = await aplDecisionCommand(tx, q, { replayed: true });
    assert.deepEqual(replay, { ...previous, replayed: true });
  }
  ok(report, 'pre-delta read/contentHash/current confirmation and exact save/confirm/decision receipt replay preserved');
  await aplActor(tx, f, 'principal');
  const draft = await aplPreparedDraft(tx, f, 'Syntetisk terminsavsikt');
  const value = { contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'unreviewed', periods: [emptyPeriod(3)] };
  let saved = await aplCommand(tx, aplSave(draft, draft.plan.revision, value));
  assert.deepEqual(saved.detail.plan, value); await parity(tx, saved);
  assert.equal(projectAplPlan(saved.context, saved.detail.plan).readyForConfirmation, false);
  let current = await aplRead(tx, draft.planId); assert.deepEqual(current.detail.plan, value);
  const stored = (await tx`select planned_term_index,starts_on,ends_on,school_year,name from public.apl_plan_periods where plan_id=${draft.planId}`)[0];
  assert.deepEqual(stored, { planned_term_index: 3, starts_on: null, ends_on: null, school_year: null, name: '' });
  ok(report, 'term-only unnamed draft persists without dates, school year, contents or allocations; TS/SQL canonical bytes agree');
  for (const started of [String(f.year + 1) + '-01-15']) {
    const projected = structuredClone(saved);
    projected.context.plan.source.startedOn = started;
    projected.envelope.basis.gymTimplan.source.basisReference.startedOn = started;
    await parity(tx, projected);
    assert.equal(projected.detail.plan.periods[0].plannedTermIndex, 3);
    assert.equal(projectAplPlan(projected.context, projected.detail.plan).readyForConfirmation, false);
  }
  ok(report, 'spring-start projection retains explicit term index; SQL/TS canonical parity without invented dates');
  for (let index = 0; index <= 5; index++) {
    const indexed = structuredClone(value); indexed.periods[0].plannedTermIndex = index;
    assert.deepEqual((await tx`select public.phase5_apl_plan_parse(${tx.json(indexed)}) value`)[0].value, indexed);
  }
  ok(report, 'all six explicit term indices accepted by actual SQL parser');
  const noop = await aplCommand(tx, aplSave(draft, current.detail.revision, value));
  assert.equal(noop.envelope.result.receipt.changed, false); assert.equal(noop.detail.revision, current.detail.revision);
  const changed = structuredClone(value); changed.periods[0].plannedTermIndex = 4;
  saved = await aplCommand(tx, aplSave(draft, current.detail.revision, changed));
  assert.notEqual(saved.detail.contentHash, current.detail.contentHash); assert.equal(saved.detail.revision, current.detail.revision + 1);
  await parity(tx, saved); current = saved;
  ok(report, 'no-op stays unchanged; changed term updates hash and revision');
  await aplDeny(tx, report.checks, 'term intent alone cannot receive rector confirmation', t => aplCommand(t, {
    ...old.confirm, commandId: randomUUID(), planId: draft.planId, expectedRevision: current.detail.revision, expectedContentHash: current.detail.contentHash }), ['40001']);
  for (const index of [null, -1, 6, 0.5, '2', true]) {
    const bad = structuredClone(changed); bad.periods[0].plannedTermIndex = index;
    await aplDeny(tx, report.checks, 'invalid term index ' + String(index), t => t`select public.phase5_apl_plan_command(${t.json({ ...aplSave(draft, current.detail.revision, changed), plan: bad })})`, ['22023']);
  }
  await aplDeny(tx, report.checks, 'stale revision cannot replace term intent', t => aplCommand(t, aplSave(draft, current.detail.revision - 1, value)), ['40001']);
  for (const actor of ['hm', 'principal2']) {
    await aplActor(tx, f, actor);
    await aplDeny(tx, report.checks, actor + ' cannot write another school term intent', t => aplCommand(t, aplSave(draft, current.detail.revision, value)), ['42501']);
  }
  await aplActor(tx, f, 'principal');
  await tx.unsafe(`create function pg_temp.fail_apl_ux_audit() returns trigger language plpgsql as $$begin if new.customer_id='${f.id(1)}' and new.action like 'apl_%' then raise exception 'synthetic audit failure';end if;return new;end$$;
    create trigger fail_apl_ux_audit before insert on public.security_events for each row execute function pg_temp.fail_apl_ux_audit();`);
  await aplDeny(tx, report.checks, 'mandatory audit failure after term write rolls back rows, revision and receipt', t => aplCommand(t, aplSave(draft, current.detail.revision, value)), ['55000']);
  await tx`drop trigger fail_apl_ux_audit on public.security_events`;
  const copied = await aplDraftFromApproved(tx, { ...f, planId: draft.planId }, 'Syntetisk kopierad terminsavsikt');
  const copiedRead = await aplRead(tx, copied.reply.id);
  assert.equal(copiedRead.detail.plan.periods[0].plannedTermIndex, 4);
  assert.notEqual(copiedRead.detail.plan.periods[0].id, changed.periods[0].id);
  assert.deepEqual(copiedRead.detail.confirmations, []); assert.equal(copiedRead.detail.plan.periods[0].startsOn, null);
  await parity(tx, copiedRead);
  const sourceRevision = (await tx`select revision from public.point_plans where id=${f.programId}`)[0].revision;
  const next = (await tx`select public.phase5_create_gym_timplan(${randomUUID()},${f.programId},${sourceRevision},0,${f.id(30)},${draft.planId},${current.detail.revision}) result`)[0].result;
  const nextRead = await aplRead(tx, next.reply.id);
  assert.equal(nextRead.detail.plan.periods[0].plannedTermIndex, 4); assert.deepEqual(nextRead.detail.confirmations, []);
  assert.notEqual(nextRead.detail.plan.periods[0].id, changed.periods[0].id); await parity(tx, nextRead);
  ok(report, 'named copy and new version preserve term intent with new period IDs and no inherited confirmation');
  // Existing date-derived term allocation remains independent of coarse intent.
  const multi = structuredClone(old.draft.value); multi.periods[0].id = randomUUID(); multi.periods[0].plannedTermIndex = 5;
  multi.periods[0].endsOn = String(f.year + 1) + '-03-01';
  const springRow = copiedRead.context.plan.rows.find(r => r.rowKind === 'fixed' && !r.key.startsWith('meta:') && r.pointTerms[1] > 0 && copiedRead.context.plan.hours[r.key][1] >= 1);
  assert.ok(springRow, 'fixture has actual spring-term teaching');
  if (!multi.periods[0].contents.some(c => c.rowKey === springRow.key)) multi.periods[0].contents.push({ rowKey: springRow.key, description: 'Syntetiskt vårinnehåll' });
  multi.periods[0].allocations[0].gutMinutes -= 60;
  multi.periods[0].allocations.push({ rowKey: springRow.key, termIndex: 1, gutMinutes: 60 });
  multi.periods.push(emptyPeriod(0));
  const multiSaved = await aplCommand(tx, aplSave({ ...draft, planId: copied.reply.id }, copiedRead.detail.revision, multi));
  assert.equal(multiSaved.detail.plan.periods.length, 2);
  const savedDated = multiSaved.detail.plan.periods.find(p => p.id === multi.periods[0].id);
  assert.equal(savedDated.plannedTermIndex, 5); assert.equal(savedDated.endsOn, multi.periods[0].endsOn);
  assert.deepEqual(savedDated.allocations, multi.periods[0].allocations.slice().sort((a,b) => a.rowKey.localeCompare(b.rowKey) || a.termIndex-b.termIndex));
  await parity(tx, multiSaved); ok(report, 'multiple periods and a date interval spanning autumn/spring preserve both term allocations without new restrictions');
  const completeValue = { ...multi, periods: [multi.periods[0]] };
  const complete = await aplCommand(tx, aplSave({ ...draft, planId: copied.reply.id }, multiSaved.detail.revision, completeValue));
  assert.equal(projectAplPlan(complete.context, complete.detail.plan).readyForConfirmation, true);
  const confirmed = await aplCommand(tx, { ...old.confirm, commandId: randomUUID(), planId: copied.reply.id,
    expectedRevision: complete.detail.revision, expectedContentHash: complete.detail.contentHash });
  assert.equal((await aplDecisionBasis(tx, copied.reply.id)).result.apl.ready, true);
  completeValue.periods[0].plannedTermIndex = 4;
  const afterTermChange = await aplCommand(tx, aplSave({ ...draft, planId: copied.reply.id }, confirmed.detail.revision, completeValue));
  assert.notEqual(afterTermChange.detail.contentHash, confirmed.detail.contentHash);
  assert.equal((await aplDecisionBasis(tx, copied.reply.id)).result.apl.ready, false);
  assert.deepEqual(afterTermChange.detail.confirmations, confirmed.detail.confirmations);
  ok(report, 'explicit term change makes prior rector confirmation stale while preserving its complete immutable event');
}
export async function verifyAplTermIntent(out) {
  const fd = openSync(out, 'wx', 0o600), report = { kind: 'apl-term-intent-private-schema-only', schemaVersion: 1,
    status: 'FAIL', startedAt: new Date().toISOString(), checks: [], races: [],
    limitations: ['Actual SQL with synthetic app mandates; HTTP/OIDC/browser verified separately', 'Active database data and runtime are not modified; only schema is read'] };
  const save = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  save(); let snapshot;
  try {
    report.sources = sources(); report.migrations = { [termMigration]: report.sources[termMigration] };
    snapshot = await createNamedTimplanSnapshot(); report.snapshot = snapshot.provenance; save();
    const db = snapshot.db; assert.match((await db`select current_database() name`)[0].name, /^named_timplan_[0-9a-f]{32}$/u);
    assert.equal((await db`select count(*)::integer n from information_schema.columns where table_schema='public' and table_name='apl_plan_periods' and column_name='planned_term_index'`)[0].n, 0);
    const old = await db.begin(async tx => { const value = await seed(tx); await tx`set constraints all immediate`; return value; });
    report.baseline = await stage(db); save();
    try { await db.begin(async tx => {
      await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='60s'`;
      await tx.unsafe(readFileSync(resolve(root, termMigration), 'utf8'));
      assert.deepEqual(await originalRows(tx, report.baseline.structure), report.baseline.rows);
      throw rollback;
    }); } catch (error) { if (error !== rollback) throw error; }
    const restored = await stage(db);
    assert.deepEqual(restored, report.baseline);
    report.migrationRollbackRestored = true; report.rollback = { restored: true, ...restored };
    ok(report, 'delta DDL rollback restores exact original schema, ACL, columns and rows before isolated installation');
    await db.begin(async tx => { await tx`set local lock_timeout='10s'`; await tx`set local statement_timeout='60s'`; await tx.unsafe(readFileSync(resolve(root, termMigration), 'utf8')); });
    report.installed = await stage(db, report.baseline.structure);
    assert.deepEqual(report.installed.rows, report.baseline.rows);
    assert.deepEqual(report.installed.structure.functions.map(({ definition, ...rest }) => rest), report.baseline.structure.functions.map(({ definition, ...rest }) => rest));
    assert.deepEqual(report.installed.structure.tables, report.baseline.structure.tables);
    report.originalRowsPreserved = true;
    report.originalPreservation = { tables: Object.keys(report.baseline.rows).length,
      exactPreservedRows: Object.values(report.baseline.rows).reduce((sum, value) => sum + value.count, 0), preserved: true }; ok(report, 'delta preserves every original column, row, timestamp, receipt and ACL without backfill'); save();
    const beforeMatrix = await allPublicHashes(db);
    try { await db.begin(async tx => { await tx`set local statement_timeout='120s'`; await matrix(tx, report, old); throw rollback; }); }
    catch (error) { if (error !== rollback) throw error; }
    assert.deepEqual(await allPublicHashes(db), beforeMatrix); report.rollbackRestored = true; save();
    const read = await db.begin(async tx => { await aplActor(tx, old.f, 'principal'); return aplRead(tx, old.f.planId); });
    const q = { contractVersion: 'structured_v1', action: 'save', commandId: randomUUID(), planId: old.f.planId,
      expectedRevision: read.detail.revision, copyReviewResolutions: [], plan: { contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'unreviewed', periods: [emptyPeriod(2)] } };
    const other = structuredClone(q); other.commandId = randomUUID(); other.plan.periods[0].plannedTermIndex = 3;
    const race = await aplRace(snapshot, report, old.f, 'overlapping term intent saves', 'principal', t => aplCommand(t, q), 'admin', t => aplCommand(t, other));
    assert.equal(race.right.ok, false); assert.equal(race.right.error.code, '40001');
    await db.begin(async tx => { await aplActor(tx, old.f, 'principal'); const current = await aplRead(tx, q.planId);
      assert.deepEqual(current.detail.plan, q.plan); assert.equal(current.detail.revision, q.expectedRevision + 1);
      assert.equal((await aplStatus(tx, other)).envelope.result.state, 'not_found'); await parity(tx, current); });
    report.concurrencyComplete = true; ok(report, 'observed two-writer lock overlap keeps winning intent and rejects stale writer without receipt');
    report.final = { fingerprint: await schemaFingerprint(db), structure: await schemaFingerprint(db, true) };
    assert.equal(report.final.fingerprint, report.installed.fingerprint);
  } catch (error) { report.failure = { name: error.name, code: error.code, message: error.message, hint: error.hint, where: error.where, position: error.position, stack: error.stack }; }
  finally {
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (error) { report.sourceFailure = { message: error.message }; }
    try { if (snapshot) report.cleanup = await snapshot.cleanup(); } catch (error) { report.cleanupFailure = { message: error.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure && report.originalRowsPreserved && report.rollbackRestored && report.concurrencyComplete) report.status = 'PASS';
    report.completedAt = new Date().toISOString(); save(); closeSync(fd);
  }
  console.log(`${report.status}: ${report.checks.length} term intent checks; private report ${out}`); return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = privateOutput(process.argv.slice(2)); if ((await verifyAplTermIntent(out)).status !== 'PASS') process.exitCode = 1;
}
