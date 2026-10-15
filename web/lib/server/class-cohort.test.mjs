import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Only DB/session/environment adapters are synthetic. Routes, authorization,
// MFA assessment, parsers, audit minimization and HTTP responses are real.
const id = n => `55602000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sessionId = id(1), unitId = id(2), offeringId = id(3), commandId = id(4);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const readInput = { offeringId, unitId };
const createInput = { commandId, offeringId, unitId, expectedEducationRevision: 2,
  expectedSourceToken: 'a'.repeat(64), startsOn: '2027-08-17', names: ['SA27A', 'SA27B'] };
let state;
const fixture = globalThis.__classCohortRouteTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres',
    SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId,
    MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-cohort-only' },
  session() {
    if (state.noSession) return null;
    const future = new Date(Date.now() + 60000);
    return { session: { id: sessionId, identityId: id(5), membershipId: id(6), assignmentId: id(7), customerId: id(8),
      expiresAt: state.expired ? new Date(0) : future, absoluteExpiresAt: future,
      revokedAt: state.revoked ? new Date() : null, epoch: 1 } };
  },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    if (state.liveDenied) throw new Deny(state.liveDenied, 403);
    const events = state.events.length, mutations = state.mutations.length;
    try {
      return await fn(fixture.tx, { sessionId, identityId: id(5), membershipId: id(6), assignmentId: id(7), customerId: id(8),
        identity: { issuer, subject: 'synthetic-cohort' }, correlationId: id(9),
        accessFunction: state.liveFunction ?? state.fn, epoch: state.epoch,
        mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
          acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'],
          authTime: new Date(Date.now() - (state.oldMfa ? 86400000 : 1000)), checkedAt: new Date() } });
    } catch (error) {
      state.events.length = events; state.mutations.length = mutations;
      throw error;
    }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.fn }];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails) throw new Error('private audit failure');
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] });
      return [];
    }
    state.calls.push({ sql, values });
    if (state.sqlError) throw state.sqlError;
    if (sql.includes('phase5_class_cohort_command')) {
      state.mutations.push(structuredClone(values[0]));
      return state.rows ?? [{ result: state.reply }];
    }
    if (sql.includes('phase5_class_cohort_underlag')) return state.rows ?? [{ result: state.underlag }];
    if (sql.includes('phase5_class_cohort_status')) return state.rows ?? [{ result: state.status }];
    throw new Error('Unexpected synthetic query');
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = `export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__classCohortRouteTest.login(...a);export const withSessionContext=(...a)=>globalThis.__classCohortRouteTest.context(...a);`;
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__classCohortRouteTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__classCohortRouteTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./db.ts');
const { POST: read } = await import('../../app/api/klasser/organisation/underlag/route.ts');
const { POST: create } = await import('../../app/api/klasser/organisation/skapa/route.ts');
const { POST: status } = await import('../../app/api/klasser/organisation/status/route.ts');
const routes = [{ route: read, path: 'underlag', input: readInput },
  { route: create, path: 'skapa', input: createInput }, { route: status, path: 'status', input: createInput }];

function reset() {
  const classes = createInput.names.map((name, index) => ({ id: id(20 + index), name, cohortStartYear: 2027,
    startsOn: createInput.startsOn, endsOn: null, validitySource: 'education_start' }));
  const reply = { commandId, offeringId, unitId, startsOn: createInput.startsOn, classes, replayed: false };
  state = { fn: 'rektor', mfa: true, epoch: 1, events: [], calls: [], mutations: [], reply,
    underlag: { offeringId, unitId, educationName: 'Syntetisk utbildning', schoolName: 'Syntetisk skola', educationRevision: 2,
      sourceToken: createInput.expectedSourceToken, educationStartsOn: createInput.startsOn, firstSchoolYear: 2027,
      canManage: true, blockers: [], classes: [] },
    status: { commandId, offeringId, unitId, status: 'found', receipt: { ...reply, replayed: true } } };
}
function request(path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Context-Epoch': options.epoch ?? '1' };
  if (options.origin !== null) headers.Origin = options.origin ?? 'http://localhost';
  return new Request(`http://localhost/api/klasser/organisation/${path}`, {
    method: 'POST', headers, body: options.raw ?? JSON.stringify(body),
  });
}
async function rejected(route, path, input, expectedStatus, expectedCode, options) {
  const response = await route(request(path, input, options));
  assert.equal(response.status, expectedStatus);
  const body = await response.json();
  assert.equal(body.code, expectedCode);
  assert.ok(!JSON.stringify(body).includes('private'));
  assert.equal(state.mutations.length, 0);
  return body;
}

test('underlag is scoped exactly and requires audit for HM, principal and administrator without MFA', async () => {
  for (const fn of ['huvudman', 'rektor', 'administrator']) {
    reset(); state.fn = fn; state.mfa = false; state.underlag.canManage = fn !== 'huvudman';
    const response = await read(request('underlag', readInput));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), state.underlag);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(state.calls[0].values, [offeringId, unitId]);
    assert.deepEqual(state.events[0], { action: 'class_cohort_read', objectType: 'education', objectId: offeringId,
      outcome: 'ok', details: { unitId, accessFunction: fn } });
    assert.equal(state.mutations.length, 0);
  }
});

test('create forwards the exact reviewed batch once and audits only identifiers and count', async () => {
  for (const fn of ['rektor', 'administrator']) {
    reset(); state.fn = fn;
    const response = await create(request('skapa', createInput));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), state.reply);
    assert.equal(state.calls.length, 1); assert.match(state.calls[0].sql, /phase5_class_cohort_command/);
    assert.deepEqual(state.calls[0].values, [createInput]); assert.deepEqual(state.mutations, [createInput]);
    const { proof, ...details } = state.events[0].details;
    assert.deepEqual({ ...state.events[0], details }, { action: 'class_cohort_created', objectType: 'education_command', objectId: commandId,
      outcome: 'ok', details: { unitId, count: 2, accessFunction: fn } });
    assert.equal(proof.result, 'accepted'); assert.equal(proof.policyId, 'local-keycloak-admin');
    assert.ok(!JSON.stringify(state.events).includes('SA27A'));
    assert.ok(!JSON.stringify(state.events).includes(createInput.expectedSourceToken));
  }
});

test('status forwards the entire request and returns found or not_found without mutation or MFA requirement', async () => {
  for (const fn of ['rektor', 'administrator']) for (const found of [true, false]) {
    reset(); state.fn = fn; state.mfa = false; state.oldMfa = true;
    if (!found) state.status = { commandId, offeringId, unitId, status: 'not_found', receipt: null };
    const response = await status(request('status', createInput, { origin: null }));
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), state.status);
    assert.equal(state.calls.length, 1); assert.match(state.calls[0].sql, /phase5_class_cohort_status/);
    assert.deepEqual(state.calls[0].values, [createInput]); assert.equal(state.mutations.length, 0);
    assert.deepEqual(state.events[0], { action: 'class_cohort_status_read', objectType: 'education_command', objectId: commandId,
      outcome: 'ok', details: { unitId, accessFunction: fn } });
  }
});

test('write and receipt routes reject HM and other roles before domain SQL', async () => {
  for (const fn of ['huvudman', 'larare', 'kundadmin', 'support']) for (const [route, path] of [[create, 'skapa'], [status, 'status']]) {
    reset(); state.fn = fn; await rejected(route, path, createInput, 403, 'forbidden'); assert.equal(state.calls.length, 0);
  }
  reset(); state.fn = 'larare'; await rejected(read, 'underlag', readInput, 403, 'forbidden'); assert.equal(state.calls.length, 0);
});

test('create rejects missing or foreign origin and absent or stale MFA before domain SQL', async () => {
  for (const origin of [null, 'http://foreign']) {
    reset(); await rejected(create, 'skapa', createInput, 403, 'csrf', { origin }); assert.equal(state.calls.length, 0);
  }
  for (const patch of [{ mfa: false }, { oldMfa: true }]) {
    reset(); Object.assign(state, patch); await rejected(create, 'skapa', createInput, 403, 'mfa_required'); assert.equal(state.calls.length, 0);
  }
});

test('missing, expired and revoked sessions cannot reach any domain operation', async () => {
  for (const { route, path, input } of routes) for (const [key, code] of [['noSession', 'no_session'], ['expired', 'session_expired'], ['revoked', 'session_revoked']]) {
    reset(); state[key] = true; await rejected(route, path, input, 401, code); assert.equal(state.calls.length, 0);
  }
});

test('fresh transaction context overrides stale role hints and rejects assignment changes', async () => {
  for (const { route, path, input } of routes) {
    reset(); state.epoch = 2; await rejected(route, path, input, 409, 'context_changed'); assert.equal(state.calls.length, 0);
    reset(); state.liveDenied = 'assignment_ended'; await rejected(route, path, input, 403, 'assignment_ended'); assert.equal(state.calls.length, 0);
    reset(); await rejected(route, path, input, 409, 'context_changed', { epoch: 'invalid' }); assert.equal(state.calls.length, 0);
  }
  reset(); state.fn = 'rektor'; state.liveFunction = 'huvudman';
  await rejected(create, 'skapa', createInput, 403, 'forbidden'); assert.equal(state.calls.length, 0);
});

test('malformed JSON, extra authority fields and incomplete status are rejected before domain SQL', async () => {
  for (const { route, path, input } of routes) {
    for (const body of [null, [], { ...input, role: 'rektor' }, { ...input, unitId: 'not-an-id' }]) {
      reset(); await rejected(route, path, body, 400, 'bad_request'); assert.equal(state.calls.length, 0);
    }
    reset(); await rejected(route, path, input, 400, 'bad_request', { raw: '{' }); assert.equal(state.calls.length, 0);
  }
  reset(); await rejected(status, 'status', { commandId }, 400, 'bad_request'); assert.equal(state.calls.length, 0);
  reset(); await rejected(create, 'skapa', { ...createInput, names: ['SA27A', 'bad'] }, 400, 'bad_request'); assert.equal(state.calls.length, 0);
});

test('wrong-school SQL denials stay generic and preserve the supplied exact scope', async () => {
  for (const { route, path, input } of routes) {
    reset(); state.sqlError = { code: '42501', hint: 'class_name_year_conflict', message: 'private other school' };
    const other = { ...input, unitId: id(99) };
    await rejected(route, path, other, 403, 'forbidden');
    assert.deepEqual(state.calls[0].values, path === 'underlag' ? [offeringId, id(99)] : [other]);
    assert.equal(state.events.at(-1).details.code, 'forbidden');
  }
});

test('foreign actor or changed request receipt conflicts never return a receipt', async () => {
  for (const [route, path] of [[create, 'skapa'], [status, 'status']]) {
    reset(); state.sqlError = { code: '40001', message: 'private actor or request mismatch' };
    const body = await rejected(route, path, createInput, 409, 'conflict');
    assert.equal(body.receipt, undefined); assert.equal(body.classes, undefined);
  }
});

test('stale source and known SQL conflicts use safe audited messages only for 40001', async () => {
  for (const [hint, code] of [[undefined, 'conflict'], ['class_plan_not_ready', 'class_plan_not_ready'],
    ['class_name_year_conflict', 'class_name_year_conflict'], ['class_cohort_start_locked', 'class_cohort_start_locked'],
    ['class_cohort_source_invalid', 'class_plan_not_ready']]) {
    reset(); state.sqlError = { code: '40001', hint, message: 'private source' };
    await rejected(create, 'skapa', createInput, 409, code);
    assert.equal(state.events.at(-1).details.code, code); assert.equal(state.events.at(-1).details.path, '/api/klasser');
  }
  reset(); state.sqlError = { code: '42501', hint: 'class_plan_not_ready', message: 'private source' };
  await rejected(create, 'skapa', createInput, 403, 'forbidden');
});

test('mandatory success and denial audit failures close all routes and roll back synthetic commands', async () => {
  for (const { route, path, input } of routes) {
    reset(); state.auditFails = true;
    await rejected(route, path, input, 500, 'audit_unavailable'); assert.equal(state.events.length, 0);
    assert.equal(state.calls.length, 1);
    reset(); state.auditFails = true; state.sqlError = { code: '40001', hint: 'class_name_year_conflict' };
    await rejected(route, path, input, 500, 'audit_unavailable'); assert.equal(state.events.length, 0);
    reset(); state.sqlError = { code: '55000', message: 'private DB audit' };
    await rejected(route, path, input, 500, 'audit_unavailable');
  }
});

test('zero, multiple or malformed DB rows fail closed within the transaction', async () => {
  for (const { route, path, input } of routes) for (const rows of [[], [{}, {}], [null], [{}], [{ result: null }]]) {
    reset(); state.rows = rows; await rejected(route, path, input, 500, 'audit_unavailable');
    assert.equal(state.events.filter(event => event.outcome === 'ok').length, 0);
  }
});

test('unrelated scope, dates, duplicate IDs and incorrect status receipts fail closed', async () => {
  for (const [route, path, input, mutate] of [
    [read, 'underlag', readInput, () => { state.underlag.unitId = id(99); }],
    [read, 'underlag', readInput, () => { state.underlag.offeringId = id(99); }],
    [create, 'skapa', createInput, () => { state.reply.classes[1].id = state.reply.classes[0].id; }],
    [create, 'skapa', createInput, () => { state.reply.classes[0].startsOn = '2027-08-18'; }],
    [create, 'skapa', createInput, () => { state.reply.classes.reverse(); }],
    [status, 'status', createInput, () => { state.status.receipt.commandId = id(99); }],
    [status, 'status', createInput, () => { state.status.receipt.replayed = false; }],
    [status, 'status', createInput, () => { state.status.status = 'not_found'; }],
  ]) {
    reset(); mutate(); await rejected(route, path, input, 500, 'audit_unavailable');
    assert.equal(state.events.filter(event => event.outcome === 'ok').length, 0);
  }
});
