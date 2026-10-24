import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Faktiska routes/authz/adapters/decoders; session, DB och rollback är syntetiska dubbletter.
// SQL-hash/mandat/race bevisas separat i18. Dessa tester bevisar HTTP-gränsen och att inga underlag fylls i på servern.
const uid = n => `51a90000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = uid(1), assignmentId = uid(2), organizerId = uid(3), unit = uid(4), year = 2026, classId = uid(10), person = uid(20);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const hash = c => `sha256:${c.repeat(64)}`;
let state;
const fixture = globalThis.__tjanstYearServerTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-tjanst-only' },
  session() { const future = new Date(Date.now() + 60000); return { session: { id, identityId: id, membershipId: id, assignmentId, customerId: id, expiresAt: future, absoluteExpiresAt: future, epoch: 1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    if (state.contextError) throw new fixture.Deny(state.contextError, 403);
    const events = state.events.length, mutations = state.mutations.length;
    try {
      return await fn(fixture.tx, { sessionId: id, identityId: id, membershipId: id, assignmentId, customerId: id, organizerId, unitId: null, identity: { issuer, subject: 'synthetic' },
        correlationId: id, accessFunction: state.fn, scopeKind: state.scopeKind, epoch: 1, mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
          acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], authTime: new Date(Date.now() - 1000), checkedAt: new Date() } });
    } catch (error) { state.events.length = events; state.mutations.length = mutations; throw error; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.fn }];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails) throw new Error('private audit failure');
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] }); return [];
    }
    state.calls.push({ sql, values }); if (state.sqlError) throw state.sqlError;
    const fn = /public\.(tjanst_[a-z_]+)\(/u.exec(sql)?.[1];
    if (!fn || !(fn in state.replies)) throw new Error('Unexpected synthetic query');
    if (fn.endsWith('_command')) state.mutations.push(values);
    return [{ result: structuredClone(state.replies[fn]) }];
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = 'export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__tjanstYearServerTest.login(...a);export const withSessionContext=(...a)=>globalThis.__tjanstYearServerTest.context(...a);';
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__tjanstYearServerTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__tjanstYearServerTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });

const { Deny } = await import('./db.ts'); fixture.Deny = Deny;
const { createPlanCommand, planCommandRef } = await import('../tjanst-contract.ts');
const routes = Object.fromEntries(await Promise.all(['forhandsvisa', 'kommando', 'status', 'lasa'].map(async name => [name, (await import(`../../app/api/tjanst/plan/${name}/route.ts`)).POST])));
const wrap = (result, actor = { identityId: id, assignmentId }) => ({ contractVersion: 'tjanst_sql_v1', actor, result });
const sourceKey = `class_timplan:${classId}:${year}:subject:SVEN1000X`;
const BASIS = hash('a'), PERSON = hash('b'), EVIDENCE = hash('c');
const manual = { kind: 'manual', personId: person, expectedPersonBasisHash: PERSON };
const mutationContext = { baseVersionId: uid(50), expectedBasisHash: BASIS };
const planningContext = { ...mutationContext, choice: manual };
const rowPayload = { rowId: null, sourceKind: 'class_timplan', sourceKey, personId: person, teacherHt: 60, teacherVt: 0, comment: '', planningContext };
const command = (action = 'save_row', payload = rowPayload) => createPlanCommand({ commandId: uid(40), unitId: unit, schoolYear: year, action, expectedRevision: 3, payload });
const candidate = (n = 20) => ({ personId: uid(n), displayName: 'Syntetisk lärare', draft: false, shareHere: 60, duties: [
  { dutyId: uid(n + 1000), startsOn: '2026-07-01', endsOn: '2027-06-30', percent: 60 }], personBasisHash: PERSON, qualificationStatus: 'unknown' });
const previewBase = { contractVersion: 'tjanst_year_v1', unitId: unit, schoolYear: year, currentRevision: 3, baseVersionId: uid(50), basisHash: BASIS };
const catalog = () => ({ ...previewBase, mode: 'catalog', candidates: [candidate()], totalCandidates: 1 });
const rowRequest = { unitId: unit, schoolYear: year, mode: 'row', sourceKey, rowId: null };
const rowSupport = (recommendationStatus = 'empty') => ({ ...previewBase, mode: 'row', sourceKey, rowId: null,
  need: { sourceKind: 'class_timplan', sourceKey, classId, className: 'A', rowKey: 'subject:SVEN1000X', label: 'Svenska', needHt: null, needVt: 0, needBasis: 'terms' },
  currentRow: null, candidates: [candidate()], totalCandidates: 1, recommendationStatus, suggestions: [] });
const version = (extra = {}) => ({ id: uid(50), versionNo: 1, status: 'draft', basedOnVersionId: null, contentHash: hash('d'), publishedByName: null, publishedAt: null, ...extra });
const detail = (extra = {}) => ({ contractVersion: 'tjanst_v1', unitId: unit, schoolName: 'Syntetisk skola', schoolYear: year, revision: 4,
  version: version(), versions: [version()], teachers: [], rows: [], specials: [], joints: [], classes: [], actions: ['save_row', 'move', 'bulk', 'remove_teacher'],
  capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, blockers: [], ...extra });
const receipt = (q, extra = {}) => ({ commandId: q.commandId, action: q.action, versionId: uid(50), revision: q.expectedRevision + 1, contentHash: hash('d'), replayed: false, changed: true, ...extra });
const commandResult = q => ({ receipt: receipt(q), detail: detail() });
function reset(fn = 'rektor') { state = { fn, scopeKind: 'unit', contextError: null, mfa: false, events: [], calls: [], mutations: [], sqlError: null, auditFails: false,
  replies: { tjanst_year_preview: catalog(), tjanst_plan_status: wrap({ state: 'not_found', result: null }), tjanst_plan_read: detail() } }; }
function post(route, value, headers = {}) { return routes[route](new Request(`http://localhost/api/tjanst/plan/${route}`, { method: 'POST',
  headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) })); }
const oks = () => state.events.filter(e => e.outcome === 'ok');

test('catalog and row support use one audited SQL read for rektor/admin, with minimal details', async () => {
  for (const fn of ['rektor', 'administrator']) for (const mode of ['catalog', 'row']) {
    reset(fn); state.replies.tjanst_year_preview = mode === 'row' ? rowSupport() : catalog();
    const q = mode === 'row' ? rowRequest : { unitId: unit, schoolYear: year, mode };
    const response = await post('forhandsvisa', q); assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, mode);
    assert.equal(state.calls.length, 1); assert.match(state.calls[0].sql, /public\.tjanst_year_preview\(\?\)/u);
    assert.deepEqual(state.calls[0].values, [q]); assert.equal(state.mutations.length, 0);
    assert.deepEqual(oks()[0].details, { unitId: unit, schoolYear: year, mode, count: 1, accessFunction: fn });
    assert.equal(oks()[0].action, 'tjanst_year_preview_read');
    assert.ok(!JSON.stringify(state.events).includes('Syntetisk lärare'));
  }
});

test('catalog is not truncated to the batch limit and has no broad personal data', async () => {
  reset(); const candidates = Array.from({ length: 101 }, (_, n) => candidate(n + 100));
  state.replies.tjanst_year_preview = { ...catalog(), candidates, totalCandidates: 101 };
  const response = await post('forhandsvisa', { unitId: unit, schoolYear: year, mode: 'catalog' });
  assert.equal(response.status, 200); assert.equal((await response.json()).candidates.length, 101);
  reset(); state.replies.tjanst_year_preview = { ...catalog(), candidates: [{ ...candidate(), employments: [] }] };
  assert.equal((await post('forhandsvisa', { unitId: unit, schoolYear: year, mode: 'catalog' })).status, 500);
});

test('empty and unavailable recommendation sources remain distinct; manual/vacancy writes need no preview call', async () => {
  for (const status of ['empty', 'unavailable']) {
    reset(); state.replies.tjanst_year_preview = rowSupport(status);
    const response = await post('forhandsvisa', rowRequest); assert.equal(response.status, 200);
    assert.equal((await response.json()).recommendationStatus, status);
    for (const choice of [manual, { kind: 'unassigned', personId: null }]) {
      reset(); const q = await command('save_row', { ...rowPayload, personId: choice.personId, planningContext: { ...mutationContext, choice } });
      state.replies.tjanst_plan_command = wrap(commandResult(q));
      assert.equal((await post('kommando', q)).status, 200);
      assert.equal(state.calls.length, 1); assert.match(state.calls[0].sql, /public\.tjanst_plan_command/u);
      assert.deepEqual(state.calls[0].values, [q]);
    }
  }
});

test('HM/teacher/self scope, foreign origin, stale context and ended mandate cannot read preview', async () => {
  const q = { unitId: unit, schoolYear: year, mode: 'catalog' };
  for (const fn of ['huvudman', 'larare']) { reset(fn); assert.equal((await post('forhandsvisa', q)).status, 403); assert.equal(state.calls.length, 0); }
  reset(); state.scopeKind = 'self'; assert.equal((await post('forhandsvisa', q)).status, 403); assert.equal(state.calls.length, 0);
  reset(); assert.equal((await post('forhandsvisa', q, { Origin: 'http://foreign' })).status, 403); assert.equal(state.calls.length, 0);
  reset(); assert.equal((await post('forhandsvisa', q, { 'X-Context-Epoch': '2' })).status, 409); assert.equal(state.calls.length, 0);
  reset(); state.contextError = 'assignment_ended'; assert.equal((await post('forhandsvisa', q)).status, 403); assert.equal(state.calls.length, 0);
  reset(); state.sqlError = { code: '42501', message: 'foreign school' };
  assert.equal((await post('forhandsvisa', { ...q, unitId: uid(99) })).status, 403); assert.equal(oks().length, 0);
});

test('missing context and false person choice are rejected before SQL; old HTTP writes never replay', async () => {
  const q = await command();
  const { planningContext: _, ...legacy } = q.payload;
  for (const bad of [{ ...q, payload: legacy }, { ...q, action: 'create_draft', payload: { basedOnVersionId: null } },
    { ...q, payload: { ...q.payload, personId: uid(99) } }, { ...q, payload: { ...q.payload, planningContext: { ...planningContext, baseVersionId: 'fake' } } }]) {
    reset(); state.replies.tjanst_plan_command = wrap(commandResult(q));
    assert.equal((await post('kommando', bad)).status, 400); assert.equal(state.calls.length, 0);
  }
  reset(); const missing = await post('kommando', { ...q, payload: legacy });
  assert.equal((await missing.json()).details.reason, 'tjanst_context_required');
});

test('source/person/evidence changes map to409 and exact frozen values are forwarded without refresh or downgrade', async () => {
  for (const reason of ['tjanst_stale_basis', 'tjanst_stale_person', 'tjanst_stale_evidence']) {
    reset(); const choice = { ...manual, kind: 'suggestion', suggestionId: 'historical:unknown', expectedEvidenceHash: EVIDENCE };
    const q = await command('save_row', { ...rowPayload, planningContext: { ...mutationContext, choice } });
    state.sqlError = { code: '40001', hint: reason, message: 'private evidence' };
    const response = await post('kommando', q); assert.equal(response.status, 409);
    const body = await response.json(); assert.equal(body.details.reason, reason); assert.ok(!JSON.stringify(body).includes('private'));
    assert.equal(state.calls.length, 1); assert.deepEqual(state.calls[0].values, [q]); assert.equal(state.mutations.length, 0);
  }
});

test('malformed core/evidence/candidate replies are errors, never unavailable recommendation fallbacks', async () => {
  for (const patch of [{ unitId: uid(99) }, { schoolYear: 2027 }, { rowId: uid(99) }, { basisHash: 'invalid' },
    { candidates: [{ ...candidate(), qualificationStatus: 'qualified' }] }, { recommendationStatus: 'ready', suggestions: [] },
    { recommendationStatus: 'unavailable', errorDetails: 'private' }]) {
    reset(); state.replies.tjanst_year_preview = { ...rowSupport(), ...patch };
    const response = await post('forhandsvisa', rowRequest); assert.equal(response.status, 500);
    assert.equal((await response.json()).code, 'audit_unavailable'); assert.equal(oks().length, 0);
  }
});

test('streamed bytes enforce64KiB with absent/dishonest Content-Length and reject invalid UTF8', async () => {
  for (const declared of [undefined, '1']) {
    reset(); const bytes = new TextEncoder().encode(JSON.stringify({ text: 'å'.repeat(40000) }));
    let offset = 0;
    const body = new ReadableStream({ pull(controller) { if (offset >= bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + 1024)); offset += 1024; } });
    const headers = { Origin: 'http://localhost', 'X-Context-Epoch': '1', ...(declared ? { 'Content-Length': declared } : {}) };
    const request = new Request('http://localhost/api/tjanst/plan/forhandsvisa', { method: 'POST', headers, body, duplex: 'half' });
    const response = await routes.forhandsvisa(request); assert.equal(response.status, 400);
    assert.equal((await response.json()).details.reason, 'payload_too_large'); assert.equal(state.calls.length, 0);
  }
  reset(); const response = await routes.forhandsvisa(new Request('http://localhost/api/tjanst/plan/forhandsvisa', { method: 'POST', headers: { Origin: 'http://localhost' }, body: new Uint8Array([0xc3, 0x28]) }));
  assert.equal(response.status, 400); assert.equal(state.calls.length, 0);
});

test('batch preview preserves explicit100 items and rejects101 before SQL', async () => {
  const items = Array.from({ length: 100 }, (_, n) => ({ itemKey: `i${n}`, kind: 'special', choice: manual,
    payload: { specialId: null, kind: 'annat', label: `Uppdrag ${n}`, classId: null, personId: person, ht: 1, vt: 0, comment: '' } }));
  const batch = { action: 'bulk', baseVersionId: uid(50), items };
  const q = { unitId: unit, schoolYear: year, mode: 'batch', batch };
  reset(); state.replies.tjanst_year_preview = { ...previewBase, mode: 'batch', action: 'bulk', previewHash: hash('e'), selectedCount: 100, writeObjectCount: 100,
    items: items.map(i => ({ itemKey: i.itemKey, kind: 'special', id: null, sourceKey: null, classId: null, jointGroupId: null, before: null, after: { personId: person, ht: 1, vt: 0 } })), jointTotals: [], blockers: [] };
  assert.equal((await post('forhandsvisa', q)).status, 200); assert.equal(oks()[0].details.count, 100);
  reset(); assert.equal((await post('forhandsvisa', { ...q, batch: { ...batch, items: [...items, { ...items[0], itemKey: 'extra' }] } })).status, 400);
  assert.equal(state.calls.length, 0);
});

test('audit failure rolls back both read events and synthetic command mutation without returning data', async () => {
  const q = await command();
  for (const [route, input] of [['forhandsvisa', rowRequest], ['kommando', q]]) {
    reset(); state.auditFails = true; state.replies.tjanst_year_preview = rowSupport(); state.replies.tjanst_plan_command = wrap(commandResult(q));
    const response = await post(route, input); assert.equal(response.status, 500); assert.equal((await response.json()).code, 'audit_unavailable');
    assert.equal(state.mutations.length, 0); assert.equal(oks().length, 0);
  }
  reset(); state.sqlError = { code: '55000', message: 'core audit failed' };
  assert.equal((await post('forhandsvisa', rowRequest)).status, 500);
});

test('remove_teacher is an explicit catalogue-bound command and not_empty/not_found are safe400 reasons', async () => {
  const q = await command('remove_teacher', { personId: person, mutationContext });
  reset(); state.replies.tjanst_plan_command = wrap(commandResult(q));
  assert.equal((await post('kommando', q)).status, 200); assert.deepEqual(state.calls[0].values, [q]);
  for (const reason of ['tjanst_teacher_not_empty', 'tjanst_teacher_not_found']) {
    reset(); state.sqlError = { code: '22023', hint: reason, message: 'private person' };
    const response = await post('kommando', q); assert.equal(response.status, 400);
    const body = await response.json(); assert.equal(body.details.reason, reason); assert.ok(!JSON.stringify(body).includes('private'));
  }
});

test('status recovers legacy create/save and modern move/bulk/removal by minimal ref with fresh authority', async () => {
  for (const action of ['create_draft', 'save_row', 'move', 'bulk', 'remove_teacher']) {
    reset(); const ref = { family: 'plan', commandId: uid(40), action, target: { unitId: unit, schoolYear: year, versionId: null, personId: null } };
    state.replies.tjanst_plan_status = wrap({ state: 'completed', result: { receipt: receipt({ ...ref, expectedRevision: 3 }), detail: detail() } });
    const response = await post('status', { command: ref }); assert.equal(response.status, 200);
    assert.equal((await response.json()).result.receipt.action, action);
    assert.deepEqual(state.calls[0].values, [{ command: ref }]);
    reset(); state.contextError = 'assignment_ended'; assert.equal((await post('status', { command: ref })).status, 403); assert.equal(state.calls.length, 0);
    reset(); state.sqlError = { code: '42501' }; assert.equal((await post('status', { command: ref })).status, 403); assert.equal(oks().length, 0);
  }
});

test('status rejects wrong actor/action/detail target and plan target cannot carry person/version', async () => {
  const q = await command(), ref = planCommandRef(q), result = commandResult(q);
  for (const bad of [wrap(result, { identityId: uid(99), assignmentId }), wrap({ state: 'completed', result: { ...result, receipt: { ...result.receipt, action: 'bulk' } } }),
    wrap({ state: 'completed', result: { ...result, detail: detail({ unitId: uid(99) }) } })]) {
    reset(); state.replies.tjanst_plan_status = bad; assert.equal((await post('status', { command: ref })).status, 500); assert.equal(oks().length, 0);
  }
  for (const target of [{ ...ref.target, versionId: uid(50) }, { ...ref.target, personId: person }]) {
    reset(); assert.equal((await post('status', { command: { ...ref, target } })).status, 400); assert.equal(state.calls.length, 0);
  }
});

test('ready suggestions stay exact explicit evidence and can be saved by admin without personal/lasa', async () => {
  reset('administrator');
  const evidence = { reason: 'previous_same_class_row', unitId: unit, schoolYear: 2025, versionId: uid(52), rowId: uid(53), personId: person,
    classId, rowKey: 'subject:SVEN1000X', sourceKey: `class_timplan:${classId}:2025:subject:SVEN1000X` };
  const suggestion = { suggestionId: 'historical:1', personId: person, evidenceHash: EVIDENCE, reasons: ['previous_same_class_row'], references: [evidence] };
  state.replies.tjanst_year_preview = { ...rowSupport('ready'), suggestions: [suggestion] };
  const support = await post('forhandsvisa', rowRequest); assert.equal(support.status, 200);
  assert.deepEqual((await support.json()).suggestions[0], suggestion);
  const choice = { ...manual, kind: 'suggestion', suggestionId: suggestion.suggestionId, expectedEvidenceHash: EVIDENCE };
  const q = await command('save_row', { ...rowPayload, planningContext: { ...mutationContext, choice } });
  state.replies.tjanst_plan_command = wrap(commandResult(q));
  assert.equal((await post('kommando', q)).status, 200);
  assert.equal(state.calls.length, 2); assert.deepEqual(state.calls[1].values, [q]);
  assert.ok(state.calls.every(c => !c.sql.includes('personal')));
});

test('move and bulk commands use the same command/status route with their captured previewhash', async () => {
  const move = { action: 'move', baseVersionId: uid(50), expectedPreviewHash: hash('e'),
    items: [{ itemKey: 'move-a', kind: 'row', id: uid(30), fromPersonId: uid(21), choice: manual }] };
  const bulk = { action: 'bulk', baseVersionId: uid(50), expectedPreviewHash: hash('e'),
    items: [{ itemKey: 'bulk-a', kind: 'row', payload: rowPayload }] };
  for (const payload of [move, bulk]) {
    reset(); const q = await command(payload.action, payload); state.replies.tjanst_plan_command = wrap(commandResult(q));
    assert.equal((await post('kommando', q)).status, 200); assert.deepEqual(state.calls[0].values, [q]);
    state.replies.tjanst_plan_status = wrap({ state: 'completed', result: { ...commandResult(q), receipt: receipt(q, { replayed: true }) } });
    assert.equal((await post('status', { command: planCommandRef(q) })).status, 200);
    reset(); state.sqlError = { code: '40001', hint: 'tjanst_stale_basis' };
    assert.equal((await post('kommando', q)).status, 409); assert.deepEqual(state.calls[0].values, [q]);
  }
});

test('first edit after publication is a normal contextual command with a base-bound internal draft result', async () => {
  reset(); const q = await command(), next = version({ id: uid(51), versionNo: 2, basedOnVersionId: uid(50) });
  state.replies.tjanst_plan_command = wrap({ receipt: receipt(q, { versionId: next.id }), detail: detail({ version: next, versions: [next] }) });
  assert.equal((await post('kommando', q)).status, 200); assert.equal(state.calls.length, 1);
  assert.deepEqual(state.calls[0].values, [q]);
  reset(); state.replies.tjanst_plan_command = wrap({ receipt: receipt(q, { versionId: next.id }),
    detail: detail({ version: { ...next, basedOnVersionId: uid(99) }, versions: [next] }) });
  assert.equal((await post('kommando', q)).status, 500); assert.equal(state.mutations.length, 0); assert.equal(oks().length, 0);
});
