// Faktiska POST-funktioner och protectedRoute, med syntetisk session/SQL/motor.
// Det här är ett routeprov, inte ett verkligt OIDC-/Worker-/PostgreSQL-prov.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { defaultSchemaVillkor } from './schema-contract.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';
import { parseSchemaDraftSave, schemaDraftHash, verifySchemaDraftReadReply, verifySchemaDraftSaveReply, parseSchemaDraftStatusReply } from './schema-draft-contract.ts';
import { schemaDatumOriginal } from './schema-datum.ts';

const id = n => `83111600-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
const plan = { contractVersion: 1, unitId: id(1), schoolYear: 2026, schoolName: 'Syntetisk provskola', revision: 1, version: null, versions: [],
  teachers: [{ personId: id(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
  classes: [{ classId: id(10), name: 'Provklass', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey: 'source-1', rowKey: 'ma', label: 'Matematik', needHt: 2400, needVt: 2400, needBasis: 'terms' }] }],
  groups: [], rows: [{ id: id(40), lineageId: id(41), sourceKind: 'class_timplan', sourceKey: 'source-1', classId: id(10), rowKey: 'ma', personId: id(20), teacherHt: 2400, teacherVt: 2400,
    needHt: 2400, needVt: 2400, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }],
  specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: false } };
let state;
const event = action => ({ action, objectType: 'school', objectId: id(1), details: { unitId: id(1), schoolYear: 2026 } });
const wire = result => ({ contractVersion: 'schema_draft_sql_v1', actor: { identityId: state.wrongActor ? id(99) : id(4), assignmentId: id(6) }, result });
const fake = globalThis.__schemaDraftRoutesTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: 'skolplattform-worker', MFA_MAX_AGE_SECONDS: '28800' },
  session() {
    if (state.noSession) return null;
    const now = new Date(Date.now() - 1000), future = new Date(Date.now() + 60000);
    return { token: 'synthetic-session', session: { id: id(3), identityId: id(4), membershipId: id(5), assignmentId: id(6), customerId: id(7), issuer: ISSUER, subject: 'synthetic-person', epoch: 1,
      expiresAt: future, absoluteExpiresAt: future, revokedAt: state.revoked ? now : null, proofIssuer: ISSUER, proofClientId: 'skolplattform-worker', proofAudience: ['skolplattform-worker'],
      proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, acr: '2', amr: state.noMfa ? ['pwd'] : ['pwd', 'otp'], authTime: now, proofCheckedAt: now } };
  },
  async login(_corr, fn) { return fn(fake.tx); },
  async sessionContext(ctx, fn, ErrorClass) {
    if (state.liveDeny) throw new ErrorClass('assignment_ended', 403);
    const before = { events: structuredClone(state.events), draft: structuredClone(state.draft), commands: structuredClone(state.commands) };
    state.inTransaction = true;
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.liveRole ?? state.role, epoch: state.liveEpoch ?? 1, scopeKind: 'school' }); }
    catch (error) { Object.assign(state, before); throw error; }
    finally { state.inTransaction = false; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails && values[11] === 'ok' && (!state.auditAction || values[8] === state.auditAction)) throw new Error('synthetic-audit-unavailable');
      state.events.push({ action: values[8], outcome: values[11], details: values[12] }); return [];
    }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
    const q = values[0];
    if (sql.includes('public.schema_')) {
      state.sqlCalls.push(sql);
      if (q.unitId !== id(1)) throw Object.assign(new Error('synthetic-denied'), { code: '42501' });
    }
    if (sql.includes('public.schema_read')) {
      const draft = structuredClone(state.draft); if (draft && state.wrongHash) draft.contentHash = `sha256:${'f'.repeat(64)}`;
      return [{ result: wire({ draft }) }];
    }
    if (sql.includes('public.schema_dated_basis')) return [{ result: { contractVersion: 'schema_dated_basis_sql_v1', actor: { identityId: id(4), assignmentId: id(6) },
      result: { unitId: id(1), schoolYear: 2026, complete: true, placements: [], classMemberships: [], groups: [], memberships: [] } } }];
    if (sql.includes('public.schema_status')) {
      const completed = state.commands.get(q.commandId);
      const result = completed ? { state: 'completed', receipt: { ...completed.receipt, replayed: true }, draft: completed.draft } : { state: 'not_found', receipt: null, draft: null };
      if (state.wrongReceipt && result.receipt) result.receipt.commandId = id(99);
      return [{ result: wire(result) }];
    }
    if (sql.includes('public.schema_command')) {
      state.commandCalls++;
      if (state.draft && (q.draftId !== state.draft.id || q.expectedRevision !== state.draft.revision)) throw Object.assign(new Error('synthetic-conflict'), { code: '40001' });
      const draft = { id: state.draft?.id ?? id(50), name: q.name, revision: (state.draft?.revision ?? 0) + 1, savedAt: '2026-11-16T10:00:00.000Z',
        contentHash: await schemaDraftHash(q.document), sourceHash: q.sourceHash, document: q.document };
      const receipt = { commandId: q.commandId, draftId: draft.id, revision: draft.revision, requestHash: q.requestHash, contentHash: draft.contentHash, savedAt: draft.savedAt, replayed: false };
      state.draft = structuredClone(draft); state.commands.set(q.commandId, structuredClone({ draft, receipt }));
      return [{ result: wire({ draft, receipt }) }];
    }
    throw new Error('Unexpected synthetic SQL');
  },
  async planRead(_tx, input, ctx) {
    state.reads.push({ type: 'plan', input, role: ctx.accessFunction });
    if (input.unitId !== id(1)) throw new Deny('forbidden', 403);
    return { body: { ...plan, revision: state.planRevision, actions: ctx.accessFunction === 'rektor' ? ['publish'] : [],
      capabilities: { ...plan.capabilities, canPublish: ctx.accessFunction === 'rektor' } }, event: event('tjanst_plan_read') };
  },
  async personalRead() { state.reads.push({ type: 'personal' }); return { body: { people: [{ id: id(20), givenName: 'Provlärare', familyName: '', status: 'active',
    duties: [{ unitId: id(1), startsOn: '2026-07-01', endsOn: null }] }, ...(state.extraPersonal ? [{ id: id(21), givenName: 'Extra personal', familyName: '', status: 'active',
    duties: [{ unitId: id(1), startsOn: '2026-07-01', endsOn: null }] }] : [])] }, event: event('personal_read') }; },
  async elective() { return { body: { pupils: [{ id: id(30), name: 'Syntetisk provelev', classIds: [id(10)] }], placements: [] }, event: event('elective_blocks_read') }; },
  async study() { return { body: { pupils: [], memberships: [] }, event: event('study_groups_read') }; },
  async lasar() { return { body: { calendar: null, versions: [] }, event: event('lasar_read') }; },
  async validate(problem, placements) {
    assert.equal(state.inTransaction, false, 'motorn får inte hålla en DB-transaktion');
    assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'), 'planläsningens audit måste vara skriven');
    state.validations.push(structuredClone({ problem, placements }));
    if (state.revokeDuringValidation) state.liveDeny = true;
    if (state.changeSourceDuringValidation) state.planRevision++;
    if (state.engineFailure) throw new SchemaEngineError(state.engineFailure);
    return { violations: state.violation ? [{ code: 'teacher_clash', message: 'Syntetisk regelavvikelse.', lessons: [placements[0].lesson], resources: [] }] : [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };
  },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  let source; const is = name => url === new URL(name, server).href;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...args)=>globalThis.__schemaDraftRoutesTest.login(...args);
    export const withSessionContext=(ctx,fn)=>globalThis.__schemaDraftRoutesTest.sessionContext(ctx,fn,Deny);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__schemaDraftRoutesTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__schemaDraftRoutesTest.env;';
  if (is('tjanst.ts')) source = 'export const planRead=(...a)=>globalThis.__schemaDraftRoutesTest.planRead(...a);export const personalRead=(...a)=>globalThis.__schemaDraftRoutesTest.personalRead(...a);export const tjanstRequest=async()=>{throw Error("unused");};';
  if (is('elective-block.ts')) source = 'export const readElectiveBlocks=(...a)=>globalThis.__schemaDraftRoutesTest.elective(...a);';
  if (is('study-groups.ts')) source = 'export const readStudyGroups=(...a)=>globalThis.__schemaDraftRoutesTest.study(...a);';
  if (is('lasar.ts')) source = 'export const lasarRead=(...a)=>globalThis.__schemaDraftRoutesTest.lasar(...a);';
  if (is('schemamotor.ts')) source = 'export class SchemaEngineError extends Error { constructor(reason){super(reason);this.reason=reason;} } export const validateSchema=(...a)=>globalThis.__schemaDraftRoutesTest.validate(...a);';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts');
const { SchemaEngineError } = await import('./server/schemamotor.ts');
const routes = Object.fromEntries(await Promise.all(['las', 'spara', 'status'].map(async name => [name, (await import(`../app/api/schema/utkast/${name}/route.ts`)).POST])));
const reset = () => { state = { role: 'rektor', planRevision: 1, reads: [], events: [], validations: [], sqlCalls: [], commandCalls: 0, draft: null, commands: new Map() }; };
const scope = { contractVersion: 1, unitId: id(1), schoolYear: 2026, period: 'ht' };
const emptySave = extra => ({ ...scope, commandId: id(2), draftId: null, expectedRevision: 0, name: 'Schemautkast', basisVillkor: null, workingVillkor: defaultSchemaVillkor(),
  grundFingerprint: null, placements: [], locks: [], ...extra });
const statusInput = commandId => ({ ...scope, commandId: commandId ?? id(2), draftId: null });
function calculated(extra = {}) {
  const villkor = defaultSchemaVillkor(), basis = { members: { pupils: [{ id: id(30), classIds: [id(10)] }], memberships: [] }, time: defaultSchemaTime(), personer: [{ ref: id(20), name: 'Provlärare' }] };
  const u = buildSchemaUnderlag(plan, { ...scope, villkor }, basis);
  return { ...emptySave(), basisVillkor: villkor, grundFingerprint: u.grundFingerprint,
    placements: u.problem.lessons.map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: null })), ...extra };
}
const request = (name, value, headers = {}) => new Request(`http://localhost:3012/api/schema/utkast/${name}`, { method: 'POST', headers: {
  Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) });
const call = async (name, value, headers) => { const response = await routes[name](request(name, value, headers)); return { response, body: await response.json() }; };

test('utkastsrutterna prövar verkligt uppdrag, MFA, epoch och ursprung före data och motor', async () => {
  const cases = [{ change: { noSession: true }, code: 'no_session', status: 401 }, { change: { revoked: true }, code: 'session_revoked', status: 401 },
    { change: { liveDeny: true }, code: 'assignment_ended', status: 403 }, { change: { liveRole: 'larare' }, code: 'forbidden', status: 403 },
    { change: { noMfa: true }, code: 'mfa_required', status: 403 }, { change: { liveEpoch: 2 }, code: 'context_changed', status: 409 },
    { change: {}, headers: { Origin: 'https://annan.example.test' }, code: 'csrf', status: 403 }];
  for (const name of Object.keys(routes)) for (const c of cases) {
    reset(); Object.assign(state, c.change); const result = await call(name, name === 'spara' ? emptySave() : name === 'status' ? statusInput() : scope, c.headers);
    assert.equal(result.response.status, c.status, `${name}: ${c.code}`); assert.equal(result.body.code, c.code);
    assert.equal(state.sqlCalls.length + state.reads.length + state.validations.length, 0); assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
  }
});
test('utkastsrutterna stoppar klientens snapshot, elevdata, gammal version och överstor kropp', async () => {
  for (const extra of [{ base: {} }, { pupilNames: ['otillåtet'] }, { role: 'rektor' }, { contractVersion: 0 }]) {
    reset(); const result = await call('spara', emptySave(extra)); assert.equal(result.response.status, 400); assert.equal(state.reads.length + state.sqlCalls.length, 0);
  }
  reset(); const result = await call('spara', emptySave(), { 'Content-Length': '9000000' });
  assert.equal(result.response.status, 400); assert.equal(result.body.details.reason, 'schema_draft_too_large'); assert.equal(state.sqlCalls.length, 0);
  reset(); const denied = await call('las', { ...scope, unitId: id(99) }); assert.equal(denied.response.status, 403);
});
test('arbetsvillkor före första förslag sparas, hashverifieras och återöppnas utan motor', async () => {
  reset(); const input = parseSchemaDraftSave(emptySave({ workingVillkor: { ...defaultSchemaVillkor(), breakMin: 15 } }));
  const saved = await call('spara', input); assert.equal(saved.response.status, 200);
  const proof = await verifySchemaDraftSaveReply(saved.body, input); assert.equal(proof.draft.base, null); assert.equal(proof.draft.workingVillkor.breakMin, 15);
  const read = await call('las', scope); assert.equal(read.response.status, 200);
  const reopened = await verifySchemaDraftReadReply(read.body, scope); assert.equal(reopened.draft.contentHash, proof.draft.contentHash); assert.equal(reopened.draft.stale, false);
  assert.equal(state.validations.length, 0); assert.equal(state.commandCalls, 1); assert.ok(!JSON.stringify(read.body).includes(id(30)));
  state.role = 'administrator'; const admin = await call('las', scope); assert.equal(admin.response.status, 200); assert.equal(admin.body.draft.stale, false);
});
test('hela serverbyggda dokumentet kan hashbindas med verkliga bråkveckor i kalenderprojektionen', async () => {
  reset(); state.inTransaction = false; state.events.push({ action: 'tjanst_plan_read', outcome: 'ok' });
  const time = defaultSchemaTime(), weekdays = [18, 18, 18, 18, 17], first = Date.parse('2026-08-17T00:00:00Z');
  time.source = 'kalender'; time.version = 1; time.current = true;
  time.terms.ht = { span: { start: '2026-08-17', end: '2026-12-18' }, perWeekday: weekdays, classes: {},
    weeks: Array.from({ length: 18 }, (_, week) => ({ monday: new Date(first + week * 7 * 86400000).toISOString().slice(0, 10), label: `Vecka ${week + 1}`,
      perWeekday: weekdays.map(n => week < n ? 1 : 0), classes: {} })) };
  time.dates = Array.from({ length: 126 }, (_, day) => { const date = new Date(first + day * 86400000).toISOString().slice(0, 10), schoolDay = day % 7 < 5 && day !== 123;
    return { date, term: 'ht', schoolDay, reason: schoolDay ? null : day % 7 > 4 ? 'Helg' : 'Lovdag', classes: {} }; });
  const basis = { time, members: { pupils: [{ id: id(30), classIds: [id(10)] }], memberships: [] }, personer: [{ ref: id(20), name: 'Provlärare' }] };
  const input = calculated(); input.grundFingerprint = buildSchemaUnderlag(plan, { ...scope, villkor: input.basisVillkor }, basis).grundFingerprint;
  const { prepareSchemaDraft } = await import('./server/schema-draft.ts');
  const datedBasis = { unitId: id(1), schoolYear: 2026, complete: true,
    placements: [{ id: id(70), pupilId: id(30), startsOn: '2026-07-01', endsOn: null }],
    classMemberships: [{ placementId: id(70), pupilId: id(30), classId: id(10), startsOn: '2026-07-01', endsOn: null }], groups: [], memberships: [] };
  const read = { plan, basis, datedBasis, sourceRefs: { calendarVersionId: id(88) } }, document = await prepareSchemaDraft(read, parseSchemaDraftSave(input));
  assert.equal(document.base.time.weeks, 17.8); assert.ok(document.base.teachings[0].weeklyMin > 0);
  assert.ok(document.base.time.calendar.days.length > 100); assert.match(await schemaDraftHash(document), /^sha256:[0-9a-f]{64}$/u);
  assert.equal(await schemaDraftHash(document), await schemaDraftHash(JSON.parse(JSON.stringify(document))));
  const original = schemaDatumOriginal(document.base, { lesson: input.placements[0].lesson, originalDate: '2026-08-18' }); assert.ok(original);
  const datedOverrides = [{ lesson: original.lesson.id, originalDate: original.originalDate, date: '2026-08-19', startMin: 600, room: null, durationMin: original.length }];
  const changed = await prepareSchemaDraft(read, parseSchemaDraftSave({ ...input, datedOverrides }));
  assert.deepEqual(changed.datedOverrides, datedOverrides); assert.deepEqual(changed.placements, document.placements);
  assert.ok(state.validations.some(v => v.problem.id === 'datum-2026-08-18')); assert.ok(state.validations.some(v => v.problem.id === 'datum-2026-08-19'));
  await assert.rejects(() => prepareSchemaDraft({ ...read, datedBasis: { ...datedBasis, complete: false } }, parseSchemaDraftSave({ ...input, datedOverrides })), e => e.reason === 'schema_datum_participants_unavailable');
});
test('beräknade pass, viloyta, lås, källkopplingar och regelavvikelser bevaras', async () => {
  reset(); const input = calculated(); assert.ok(input.placements.length > 1); input.placements = input.placements.slice(0, 1); input.locks = [...input.placements]; state.violation = true;
  const saved = await call('spara', input); assert.equal(saved.response.status, 200, JSON.stringify({ body: saved.body, placements: input.placements, validations: state.validations.length }));
  const proof = await verifySchemaDraftSaveReply(saved.body, parseSchemaDraftSave(input)), d = proof.draft;
  assert.equal(d.base.lessons.filter(l => l.day === null).length, d.base.lessons.length - 1); assert.deepEqual(d.locks, input.locks); assert.equal(d.control.total, 1);
  assert.equal(d.source.lessonSources.length, d.base.lessons.length); assert.ok(d.source.lessonSources.every(s => s.ref === 'undervisning:source-1' && s.term === 'ht'));
  assert.deepEqual(d.source.lessonSources.map(s => s.ordinal), d.source.lessonSources.map((_, i) => i + 1));
  assert.equal(state.validations.length, 1); const sent = JSON.stringify(state.validations[0]);
  assert.ok(!sent.includes(id(30)) && !sent.includes(id(20)) && !sent.includes('source-1') && !sent.includes('Provlärare'));
  const reopened = await call('las', scope); assert.equal(reopened.response.status, 200); assert.equal((await verifySchemaDraftReadReply(reopened.body, scope)).draft.contentHash, d.contentHash);
});
test('ändrad grund sparar nya arbetsvillkor och den oförändrade gamla placeringsgrunden separat', async () => {
  reset(); const input = calculated({ workingVillkor: { ...defaultSchemaVillkor(), maxLessonMin: 40 } });
  const saved = await call('spara', input);
  assert.equal(saved.response.status, 200, JSON.stringify({ body: saved.body, placements: input.placements, validations: state.validations.length }));
  assert.equal(saved.body.draft.requiresRecalculation, true); assert.equal(saved.body.draft.basisVillkor.maxLessonMin, 80); assert.equal(saved.body.draft.workingVillkor.maxLessonMin, 40);
  assert.equal(saved.body.draft.base.grundFingerprint, input.grundFingerprint); assert.deepEqual(saved.body.draft.placements, input.placements);
});
test('samma kommando återspelar bundet kvitto och status; ändrad begäran får konflikt', async () => {
  reset(); const input = parseSchemaDraftSave(emptySave()), first = await call('spara', input), replay = await call('spara', input);
  assert.equal(replay.response.status, 200); assert.equal((await verifySchemaDraftSaveReply(replay.body, input)).receipt.replayed, true);
  assert.equal(replay.body.receipt.contentHash, first.body.receipt.contentHash); assert.equal(state.commandCalls, 1);
  const found = await call('status', statusInput()); assert.equal(parseSchemaDraftStatusReply(found.body, statusInput()).found, true);
  const unknown = await call('status', statusInput(id(90))); assert.equal(parseSchemaDraftStatusReply(unknown.body, statusInput(id(90))).found, false);
  const changed = await call('spara', { ...input, name: 'Annat namn' }); assert.equal(changed.response.status, 409); assert.equal(changed.body.details.reason, 'schema_draft_command_conflict');
});
test('källbyte, indraget mandat och auditfel mellan läsning och sparande ger ingen revision', async () => {
  for (const change of [{ changeSourceDuringValidation: true }, { revokeDuringValidation: true }, { auditFails: true, auditAction: 'schema_draft_saved' }]) {
    reset(); const input = calculated(); Object.assign(state, change); const result = await call('spara', input);
    assert.equal(result.response.status, change.changeSourceDuringValidation ? 409 : change.revokeDuringValidation ? 403 : 500);
    assert.equal(state.draft, null); assert.equal(state.commands.size, 0); assert.equal(state.validations.length, 1);
    if (!change.auditFails) assert.equal(state.commandCalls, 0);
  }
  reset(); const input = calculated(); state.auditFails = true; state.auditAction = 'tjanst_plan_read';
  const failed = await call('spara', input); assert.equal(failed.response.status, 500); assert.equal(failed.body.code, 'audit_unavailable'); assert.equal(state.validations.length, 0);
});
test('okänt pass, sal eller gammal grund ger ett kontrollerat fel före skrivning', async () => {
  for (const changed of [x => ({ ...x, grundFingerprint: 'a'.repeat(28) }), x => ({ ...x, placements: [{ ...x.placements[0], lesson: 'pass-99999' }] }),
    x => ({ ...x, placements: [{ ...x.placements[0], room: 'sal-99' }] })]) {
    reset(); const input = changed(calculated()), result = await call('spara', input);
    assert.equal(result.response.status, input.grundFingerprint === 'a'.repeat(28) ? 409 : 400); assert.equal(state.commandCalls, 0); assert.equal(state.validations.length, 0);
  }
});
test('fel aktör, dokumenthash eller statuskvitto lämnar inget utkast', async () => {
  reset(); await call('spara', emptySave()); state.wrongActor = true;
  let result = await call('las', scope); assert.equal(result.response.status, 500); assert.equal(result.body.code, 'audit_unavailable');
  state.wrongActor = false; state.wrongHash = true; result = await call('las', scope); assert.equal(result.response.status, 500);
  state.wrongHash = false; state.wrongReceipt = true; result = await call('status', statusInput()); assert.equal(result.response.status, 500);
  result = await call('spara', emptySave()); assert.equal(result.response.status, 500);
});
test('inaktuell källa märks vid återöppning utan att sparad revision eller placering ändras', async () => {
  reset(); const saved = await call('spara', calculated()); state.planRevision++;
  const read = await call('las', scope); assert.equal(read.response.status, 200); assert.equal(read.body.draft.stale, true);
  assert.equal(read.body.draft.revision, saved.body.draft.revision); assert.equal(read.body.draft.contentHash, saved.body.draft.contentHash); assert.equal(state.validations.length, 1);
});
test('oanvänd personal minimeras så rektorns vanliga utkast kan öppnas av administratören', async () => {
  reset(); state.extraPersonal = true;
  const basis = { members: { pupils: [{ id: id(30), classIds: [id(10)] }], memberships: [] }, time: defaultSchemaTime(), personer: [{ ref: id(20), name: 'Provlärare' }, { ref: id(21), name: 'Extra personal' }] };
  const input = calculated(); input.grundFingerprint = buildSchemaUnderlag(plan, { ...scope, villkor: input.basisVillkor }, basis).grundFingerprint;
  const saved = await call('spara', input); assert.equal(saved.response.status, 200); assert.ok(!JSON.stringify(saved.body).includes('Extra personal'));
  state.role = 'administrator';
  for (const name of ['las', 'spara']) { const result = await call(name, name === 'las' ? scope : input); assert.equal(result.response.status, 200); assert.ok(!JSON.stringify(result.body).includes('Extra personal')); }
});
test('faktiskt använda extra personalreferenser utvidgar inte administratörens läsmandat', async () => {
  reset(); state.extraPersonal = true;
  const basisVillkor = { ...defaultSchemaVillkor(), egna: [{ slag: 'larare', ref: id(21), typ: 'dag', maxMin: 480 }] };
  const basis = { members: { pupils: [{ id: id(30), classIds: [id(10)] }], memberships: [] }, time: defaultSchemaTime(), personer: [{ ref: id(20), name: 'Provlärare' }, { ref: id(21), name: 'Extra personal' }] };
  const input = calculated({ basisVillkor, workingVillkor: basisVillkor }); input.grundFingerprint = buildSchemaUnderlag(plan, { ...scope, villkor: basisVillkor }, basis).grundFingerprint;
  assert.equal((await call('spara', input)).response.status, 200); state.role = 'administrator';
  for (const name of ['las', 'spara']) { const result = await call(name, name === 'las' ? scope : input); assert.equal(result.response.status, 403); assert.ok(!JSON.stringify(result.body).includes('Extra personal')); }
});
