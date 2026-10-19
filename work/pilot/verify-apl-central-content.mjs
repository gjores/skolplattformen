#!/usr/bin/env node
// Owned schema-only PostgreSQL with synthetic fixtures. Never installs into active data.
// Verifies APL-CENTRAL-CONTENT wave 2: catalog seed, selection contract, hash parity and copy.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, openSync, writeSync, ftruncateSync, fsyncSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNamedTimplanSnapshot, schemaFingerprint } from './named-timplan-snapshot.mjs';
import { allPublicHashes, privateOutput } from './verify-atomic-cohort-copy.mjs';
import { seedSeparateAplFixture } from './verify-separate-apl-workflow.mjs';
import { aplActor, aplDeny, aplSources } from './verify-apl-plan-commands.mjs';
import { aplCanonicalSerialize, aplHashCanonical } from '../../web/lib/apl-plan.ts';
import { syllabusRefFromRowKey } from '../../web/lib/syllabus-central.ts';
const { projectAplFrozenRead, commandAplPlan } = await import('../../web/lib/server/apl-plan.ts');
const { projectPlanDecision } = await import('../../web/lib/server/plan-decision.ts');
const root = fileURLToPath(new URL('../../', import.meta.url));
export const centralMigrations = ['supabase/migrations/20261019200000_apl_central_content.sql', 'supabase/migrations/20261019200100_apl_central_content_seed.sql'];
const sources = () => aplSources([...centralMigrations, 'work/pilot/verify-apl-central-content.mjs', 'web/lib/server/apl-plan.ts', 'web/lib/syllabus-central.ts', 'web/lib/syllabus-central.index.json']);
const index = JSON.parse(readFileSync(resolve(root, 'web/lib/syllabus-central.index.json'), 'utf8'));
const raw = async (tx, id) => (await tx`select public.phase5_gym_timplan_result(${id}) value`)[0].value;
const read = async (tx, id) => (await tx`select public.phase5_apl_plan_read(${id}) value`)[0].value;
const cmd = async (tx, q) => (await tx`select public.phase5_apl_plan_command(${tx.json(q)}) value`)[0].value;
const authority = (f, role) => ({ identityId: f.id({ principal: 11, hm: 10, admin: 13 }[role]), assignmentId: f.roles[role], organizerId: f.id(2), accessFunction: { principal: 'rektor', hm: 'huvudman', admin: 'administrator' }[role] });
const request = (detail, action, extra = {}) => ({ contractVersion: 'structured_v1', revisionScope: 'apl', expectedTimplanRevision: detail.timplanRevision, commandId: randomUUID(), planId: detail.planId, expectedRevision: detail.revision, action, ...extra });
const save = (detail, value) => request(detail, 'save', { plan: value, copyReviewResolutions: [] });
const ok = (r, name) => { r.checks.push({ name, ok: true }); console.log('PASS: ' + name); };
const rollback = Error('expected_central_content_rollback');
const migrationSql = () => centralMigrations.map(p => readFileSync(resolve(root, p), 'utf8')).join('\n');

function environment(workerDbUrl) {
  // Same synthetic, non-secret server settings as verify-separate-apl-workflow.mjs.
  const values = { APP_MODE: 'protected', DATABASE_URL: workerDbUrl, SUPABASE_URL: 'http://127.0.0.1:56331',
    OIDC_ISSUER: 'http://127.0.0.1:8180/realms/synthetic-apl', OIDC_CLIENT_ID: 'synthetic-apl', OIDC_CLIENT_SECRET: 'unused-synthetic-only',
    OIDC_REDIRECT_URI: 'http://127.0.0.1:3999/api/auth/callback', OIDC_POST_LOGOUT_REDIRECT_URI: 'http://127.0.0.1:3999/',
    SUPABASE_ANON_KEY: 'unused-synthetic-only', SESSION_SECRET: 'unused-synthetic-apl-proof-000000000000', MFA_ACR_VALUES: '2', MFA_MAX_AGE_SECONDS: '900',
    SESSION_IDLE_SECONDS: '1800', SESSION_ABSOLUTE_SECONDS: '28800' };
  const previous = Object.fromEntries(Object.keys(values).map(k => [k, process.env[k]])); Object.assign(process.env, values);
  return () => { for (const [k, v] of Object.entries(previous)) if (v === undefined) delete process.env[k]; else process.env[k] = v; };
}

async function verified(tx, f, role) {
  await aplActor(tx, f, role); const envelope = await read(tx, f.planId);
  await projectAplFrozenRead(envelope.result, envelope.basis, f.planId, authority(f, role)); return envelope.result;
}
async function decide(tx, f, role, action) {
  await aplActor(tx, f, role); const basis = (await tx`select public.phase5_plan_decision_basis('timplan',${f.planId}) value`)[0].value;
  const d = await projectPlanDecision(basis, { kind: 'timplan', planId: f.planId }, authority(f, role));
  const q = { kind: 'timplan', planId: f.planId, commandId: randomUUID(), action, expectedRevision: d.revision, expectedDecisionRevision: d.decisionRevision, basisHash: d.basisHash, comment: 'Syntetisk kontroll', confirmedChecks: d.checks.map(c => c.id) };
  return (await tx`select public.phase5_plan_decision_command(${tx.json(q)}) value`)[0].value;
}
function levelItems(rowKey) {
  const ref = syllabusRefFromRowKey(rowKey); assert.ok(ref, rowKey);
  const subject = JSON.parse(readFileSync(resolve(root, `web/lib/syllabus-central/${ref.subject}-${ref.version}.json`), 'utf8'));
  return subject.levels.find(l => l.code === ref.level).sections.flatMap(s => s.items.map(i => ({ itemKey: i.key, heading: s.heading, text: i.text })));
}
const withCentral = (value, rowKey, items, other) => { const next = structuredClone(value);
  next.periods[0].contents = next.periods[0].contents.map(c => c.rowKey !== rowKey ? c : { ...c, central: { catalogId: index.catalogId, items },
    ...(other === undefined ? {} : { otherContent: other }) }); return next; };

async function matrix(tx, r, f) {
  const items = levelItems(f.key); assert.ok(items.length >= 3, 'fixture level has central content');
  let d = await verified(tx, f, 'principal');
  let saved = await commandAplPlan(tx, save(d, f.value), authority(f, 'principal')); d = saved.body.detail;
  assert.deepEqual(Object.keys(d.plan.periods[0].contents[0]).sort(), ['description', 'rowKey']);
  ok(r, 'content without selections saves and reads in the exact previous shape');
  const plainHash = d.contentHash;

  const chosen = [items[2], items[0]], value = withCentral(f.value, f.key, chosen, 'Säkerhetsgenomgång med handledare.');
  saved = await commandAplPlan(tx, save(d, value), authority(f, 'principal')); d = saved.body.detail;
  const content = d.plan.periods[0].contents.find(c => c.rowKey === f.key);
  assert.deepEqual(content.central, { catalogId: index.catalogId, items: [items[0], items[2]] });
  assert.equal(content.otherContent, 'Säkerhetsgenomgång med handledare.');
  assert.notEqual(d.contentHash, plainHash);
  ok(r, 'selected points and other content save, read back in catalog order and enter the TypeScript-verified content hash');

  const sel = await tx`select catalog_id,subject_code,subject_version,level_code from public.apl_content_central_items where plan_id=${f.planId}`;
  const ref = syllabusRefFromRowKey(f.key);
  assert.equal(sel.length, 2); assert.ok(sel.every(s => s.catalog_id === index.catalogId && s.subject_code === ref.subject && s.subject_version === ref.version && s.level_code === ref.level));
  ok(r, 'selections persist with explicit catalog, subject code, subject version and level code');

  const bad = (label, changed, code = '22023') => aplDeny(tx, r.checks, label, t => cmd(t, save(d, changed)), [code]);
  await bad('altered point text is rejected', withCentral(f.value, f.key, [{ ...items[0], text: items[0].text + ' Tillägg.' }]));
  await bad('altered heading is rejected', withCentral(f.value, f.key, [{ ...items[0], heading: 'Påhittad rubrik' }]));
  await bad('point from another subject level is rejected', withCentral(f.value, f.key, [levelItems(f.key.startsWith('programmeSpecific:PEDG:') ? 'foundation:ENGE:1:ENGE1000X' : 'programmeSpecific:PEDG:1:PEDG1000X')[0]]));
  await bad('unknown point key is rejected', withCentral(f.value, f.key, [{ ...items[0], itemKey: 'f'.repeat(32) }]));
  await bad('unknown catalog is rejected', (() => { const v = withCentral(f.value, f.key, [items[0]]); v.periods[0].contents[0].central.catalogId = 'sha256:' + '0'.repeat(64); return v; })());
  await bad('duplicate point is rejected', withCentral(f.value, f.key, [items[0], items[0]]));
  await bad('empty selection is rejected', withCentral(f.value, f.key, []));
  await bad('empty other content is rejected', withCentral(f.value, f.key, [items[0]], ''));
  ok(r, 'server checks catalog membership, exact text and heading, uniqueness and non-empty fields');

  await aplDeny(tx, r.checks, 'direct selection insert outside command denied', t => t`insert into public.apl_content_central_items values(${f.planId},${d.plan.periods[0].id},${f.key},${index.catalogId},${ref.subject},${ref.version},${ref.level},${items[1].itemKey})`, ['42501']);
  await aplDeny(tx, r.checks, 'catalog text cannot be changed', t => t`update public.syllabus_central_items set text='Ändrad' where catalog_id=${index.catalogId} and item_key=${items[0].itemKey}`, ['42501']);
  await aplDeny(tx, r.checks, 'catalog rows cannot be deleted', t => t`delete from public.syllabus_central_items where catalog_id=${index.catalogId}`, ['42501']);
  ok(r, 'selections are written only through the protected command and the catalog is immutable');

  const confirmed = await commandAplPlan(tx, request(d, 'confirm', { expectedContentHash: d.contentHash, comment: 'Syntetisk rektorsbekräftelse' }), authority(f, 'principal'));
  d = confirmed.body.detail; const confirmedHash = d.contentHash;
  saved = await commandAplPlan(tx, save(d, withCentral(f.value, f.key, [items[0]], 'Säkerhetsgenomgång med handledare.')), authority(f, 'principal')); d = saved.body.detail;
  assert.notEqual(d.contentHash, confirmedHash); assert.equal(d.confirmations.at(-1).contentHash, confirmedHash);
  ok(r, 'changing selected points invalidates the rector confirmation hash while keeping history');

  saved = await commandAplPlan(tx, save(d, f.value), authority(f, 'principal')); d = saved.body.detail;
  assert.equal(d.contentHash, plainHash); assert.equal((await tx`select count(*)::int n from public.apl_content_central_items where plan_id=${f.planId}`)[0].n, 0);
  ok(r, 'removing selections deletes them and restores the exact earlier content hash');

  await tx`set local role skolplattform_worker`; d = await verified(tx, f, 'principal');
  saved = await commandAplPlan(tx, save(d, withCentral(f.value, f.key, chosen, 'Övrigt.')), authority(f, 'principal')); await tx`reset role`; d = saved.body.detail;
  ok(r, 'actual Worker role saves selections through the protected entrypoint');

  const gym = await raw(tx, f.planId), program = (await tx`select revision from public.point_plans where id=${f.programId}`)[0].revision;
  await aplActor(tx, f, 'principal');
  const made = (await tx`select public.phase5_create_gym_timplan(${randomUUID()},${f.programId},${program},0,${f.id(30)},${f.planId},${gym.revision}) value`)[0].value.reply;
  const copied = (await tx`select public.phase5_apl_plan_value(${made.id}) value`)[0].value;
  assert.deepEqual(copied.periods[0].contents.find(c => c.rowKey === f.key).central, { catalogId: index.catalogId, items: [items[0], items[2]] });
  assert.equal(copied.periods[0].contents.find(c => c.rowKey === f.key).otherContent, 'Övrigt.');
  ok(r, 'copy to a new timetable keeps selected points and other content for the same subject level');
  await tx`set constraints all immediate`;
}

export async function verifyAplCentralContent(out) {
  const fd = openSync(out, 'wx', 0o600), report = { kind: 'apl-central-content-private-schema-only', status: 'FAIL', checks: [], startedAt: new Date().toISOString(),
    limitations: ['Own schema-only PostgreSQL and synthetic fixtures; no live data writes', 'No HTTP/OIDC/browser claim', 'Catalog is Skolverket reference data; no SS 12000 exchange verified'] };
  const persist = () => { ftruncateSync(fd, 0); writeSync(fd, JSON.stringify(report, null, 2) + '\n', 0, 'utf8'); fsyncSync(fd); };
  let snapshot, restoreEnvironment;
  try {
    report.sources = sources(); snapshot = await createNamedTimplanSnapshot(); report.snapshot = snapshot.provenance; restoreEnvironment = await snapshot.withPrivateTarget(target => environment(target.workerDbUrl)); persist(); const db = snapshot.db;
    const f = await db.begin(seedSeparateAplFixture);
    await db.begin(async tx => { await decide(tx, f, 'principal', 'submit'); await decide(tx, f, 'hm', 'approve'); });
    report.baseline = { fingerprint: await schemaFingerprint(db), rows: await allPublicHashes(db) };
    try { await db.begin(async tx => { await tx.unsafe(migrationSql()); await tx`set constraints all immediate`; throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await schemaFingerprint(db), report.baseline.fingerprint); assert.deepEqual(await allPublicHashes(db), report.baseline.rows);
    ok(report, 'migration rollback restores exact schema, ACL and every original row');
    await db.begin(tx => tx.unsafe(migrationSql()));
    const installed = await allPublicHashes(db);
    for (const k of Object.keys(report.baseline.rows)) assert.deepEqual(installed[k], report.baseline.rows[k], k);
    ok(report, 'installation leaves every original table row untouched');
    const counts = (await db`select c.item_count,c.level_count,(select count(*)::int from public.syllabus_central_items i where i.catalog_id=c.catalog_id) items from public.syllabus_central_catalogs c`);
    assert.deepEqual([...counts], [{ item_count: 18051, level_count: 1113, items: 18051 }]);
    ok(report, 'seed installs exactly one catalog with 18 051 points');
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      for (const table of ['syllabus_central_catalogs', 'syllabus_central_items', 'apl_content_central_items'])
        assert.equal((await db`select has_table_privilege(${role},${'public.' + table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed, false, role + table);
      for (const signature of ['phase5_apl_insert_content(uuid,uuid,jsonb)', 'phase5_apl_content_valid(jsonb)', 'phase5_apl_content_hash_entry(jsonb)', 'phase5_apl_syllabus_ref(text)'])
        assert.equal((await db`select has_function_privilege(${role},${'public.' + signature},'EXECUTE') allowed`)[0].allowed, false, role + signature);
    }
    ok(report, 'new tables and helper functions remain private to the owner');
    const v = JSON.parse(readFileSync(resolve(root, 'supabase/tests/phase5_apl_hash_vectors.json'), 'utf8'));
    const [h] = await db`select public.phase5_apl_hash_payload(${db.json(v.gym)},${v.organizer},${db.json(v.apl)},${db.json(v.reviews)},${db.json(v.program)}) payload,
      public.phase5_apl_hash_value(${db.json(v.gym)},${v.organizer},${db.json(v.apl)},${db.json(v.reviews)},${db.json(v.program)}) hash`;
    assert.deepEqual(h.payload, v.expectedPayload); assert.equal(aplCanonicalSerialize(h.payload), v.expectedCanonical); assert.equal(h.hash, v.expectedHash); assert.equal(await aplHashCanonical(h.payload), h.hash);
    ok(report, 'frozen pre-extension hash vectors still match SQL exactly');
    const before = await allPublicHashes(db);
    try { await db.begin(async tx => { await matrix(tx, report, f); throw rollback; }); } catch (e) { if (e !== rollback) throw e; }
    assert.deepEqual(await allPublicHashes(db), before); ok(report, 'full selection matrix rolls back completely');
  } catch (e) { report.failure = { code: e.code ?? 'ASSERTION', hint: e.hint, message: e.message, where: e.where, stack: e.stack }; }
  finally {
    restoreEnvironment?.();
    try { report.finalSources = sources(); assert.deepEqual(report.finalSources, report.sources); } catch (e) { report.sourceFailure = { message: e.message }; }
    try { if (snapshot) report.cleanup = await snapshot.cleanup(); } catch (e) { report.cleanupFailure = { message: e.message }; }
    if (!report.failure && !report.sourceFailure && !report.cleanupFailure) report.status = 'PASS';
    report.finishedAt = new Date().toISOString(); persist();
  }
  console.log(report.status + ': ' + report.checks.length + ' APL central content SQL checks'); if (report.status !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyAplCentralContent(privateOutput(process.argv.slice(2)));
