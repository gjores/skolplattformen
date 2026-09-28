// 04-25: regressionsprov för nekandevägens livscykel. Den riktiga db.ts, authz.ts,
// events.ts och routerna körs; bara postgres-klienten, session.ts och env.ts ersätts.
// Provet registrerar klienternas livscykel (skapad, begin, commit/rollback, end),
// nekandeloggen och när begärandekroppen har lästs till slut, i förhållande till svaret.
//
// Fastställd orsak (04-25): ett nekande som svarade innan kroppen var läst gjorde att
// den lokala Workern inte kunde återanvända anslutningen. Wranglers proxy tappade då
// nästa anrop ("Network connection lost") och wrangler avslutades. Egenskapen som
// rättningen återställer är att kroppen är färdigläst (och kastad) före svaret.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const id = '25000000-0000-4000-8000-000000000001';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
const MARKER = 'Syntetiskt-kroppsinnehall-0425';

let state;
const h = globalThis.__denyPath = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://test@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-test-only-secret', SESSION_IDLE_SECONDS: '900' },
  log: (event) => state.log.push(event),
  session() {
    if (!state.session) return null;
    const future = new Date(Date.now() + 60_000);
    return { token: 't', session: { id, identityId: id, issuer, subject: 'synthetic', membershipId: id, customerId: id, assignmentId: id, epoch: 1, acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], authTime: new Date(Date.now() - 1000), proofIssuer: issuer, proofClientId: clientId, proofAudience: [clientId], proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, proofCheckedAt: new Date(Date.now() - 500), expiresAt: future, absoluteExpiresAt: future, revokedAt: null } };
  },
  query(client, sql, values) {
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails) throw new Error('private audit details');
      state.log.push({ ev: 'audit', client, action: values[8], outcome: values[11], details: JSON.stringify(values[12]) });
      return [];
    }
    if (sql.includes('set_config') && !sql.includes('from')) return [{}];
    if (sql.includes('select i.auth_user_id, a.function')) return [{ auth_user_id: null, function: state.fn, organizer_id: id, unit_id: id }];
    if (sql.includes('from public.app_sessions s')) {
      const future = new Date(Date.now() + 60_000);
      return [{ id, identity_id: id, issuer, subject: 'synthetic', auth_user_id: null, membership_id: id, assignment_id: id, expires_at: future, absolute_expires_at: future, revoked_at: null, last_seen_at: new Date(), context_epoch: 1, acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], auth_time: new Date(Date.now() - 1000), proof_issuer: issuer, proof_client_id: clientId, proof_audience: [clientId], proof_profile_id: 'local-keycloak-admin', proof_profile_version: 1, proof_checked_at: new Date(Date.now() - 500) }];
    }
    if (sql.includes('from public.memberships m')) return [{ id, customer_id: id, status: 'active', closed_at: null }];
    if (sql.includes('phase3_lock_customer')) return [{}];
    if (sql.includes('from public.access_assignments a')) return [{ id, membership_id: id, customer_id: id, organizer_id: id, unit_id: id, function: state.fn, assignment_valid: true, valid_from: '2026-01-01', valid_to: null, ended_at: null }];
    throw new Error('unexpected test query');
  },
};

const postgresMock = `export default function postgres(_url, opts) {
  const h = globalThis.__denyPath;
  const client = (h.clients = (h.clients ?? 0) + 1);
  h.log({ ev: 'create', client, max: opts?.max });
  let ended = false;
  const run = async (strings, ...values) => { if (ended) throw new Error('client ended'); return h.query(client, strings.join('?'), values); };
  const sql = Object.assign(run, {
    json: (v) => v,
    async begin(fn) {
      if (ended) throw new Error('client ended');
      h.log({ ev: 'begin', client });
      const tx = Object.assign(async (s, ...v) => run(s, ...v), { json: (v) => v });
      try { const result = await fn(tx); h.log({ ev: 'commit', client }); return result; }
      catch (error) { h.log({ ev: 'rollback', client }); throw error; }
    },
    async end(options) { ended = true; h.log({ ev: 'end', client, timeout: options?.timeout }); },
  });
  return sql;
}`;

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'postgres') return { url: 'mock:postgres', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    let source;
    if (url === 'mock:postgres') source = postgresMock;
    if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__denyPath.session(); export const tokenHash=async()=>new Uint8Array(32);';
    if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__denyPath.env; export const isHttps=()=>false;';
    if (url === new URL('./db.ts', import.meta.url).href) {
      // Den riktiga db.ts körs. Endast Deny-konstruktorns parameteregenskaper skrivs om,
      // eftersom Nodes typstrippning inte stöder dem.
      const loaded = next(url, context);
      const original = String(loaded.source);
      const rewritten = original.replace(
        /constructor\(\s*public code: ErrorCode,\s*public status: [^,]+,\s*public details\?: Record<string, unknown>,\s*\)\s*\{\s*super\(code\);\s*\}/u,
        'code: ErrorCode; status: number; details?: Record<string, unknown>;\n  constructor(code: ErrorCode, status: 400 | 401 | 403 | 404 | 409 | 503, details?: Record<string, unknown>) { super(code); this.code = code; this.status = status; this.details = details; }',
      );
      if (rewritten === original) throw new Error('Deny-konstruktorn i db.ts har ändrats; uppdatera provets omskrivning');
      return { ...loaded, source: rewritten, shortCircuit: true };
    }
    return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
  },
});

const { POST: reveal } = await import('../../app/api/elever/personnummer/route.ts');
const { POST: exportRoute } = await import('../../app/api/elever/export/route.ts');
const { POST: context } = await import('../../app/api/context/route.ts');

function reset(overrides = {}) {
  h.clients = 0;
  state = { fn: 'rektor', mfa: true, session: true, auditFails: false, log: [], ...overrides };
}

/** Kropp som strömmas i delar och registrerar när den är färdigläst. */
function body(chunks = 3, size = 64) {
  let sent = 0;
  const chunk = new TextEncoder().encode(`${MARKER}-`.padEnd(size, 'x'));
  return new ReadableStream({
    pull(controller) {
      if (sent < chunks) { sent += 1; state.log.push({ ev: 'body-read', n: sent }); controller.enqueue(chunk); return; }
      state.log.push({ ev: 'body-end' });
      controller.close();
    },
    cancel() { state.log.push({ ev: 'body-cancel', read: sent }); },
  });
}

function request(path, stream = body()) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', Cookie: 'sp_session=t' },
    body: stream,
    duplex: 'half',
  });
}

async function respond(handler, req) {
  const response = await handler(req);
  state.log.push({ ev: 'response' });
  const text = await response.text();
  return { response, text, json: JSON.parse(text) };
}

const at = (predicate) => state.log.findIndex(predicate);
const events = (ev) => state.log.filter((e) => e.ev === ev);

function assertLifecycle() {
  const created = events('create').map((e) => e.client);
  assert.ok(created.length >= 1, 'minst en klient');
  for (const client of created) {
    const end = at((e) => e.ev === 'end' && e.client === client);
    assert.ok(end >= 0, `klient ${client} stängs`);
    assert.ok(end < at((e) => e.ev === 'response'), `klient ${client} stängs före svaret`);
    const next = at((e) => e.ev === 'create' && e.client === client + 1);
    if (next >= 0) assert.ok(end < next, `klient ${client} är stängd innan klient ${client + 1} skapas`);
  }
}

test('nekad protectedRoute: kroppen är färdigläst och nekandet committat före svaret med kod och korrelation', async () => {
  reset({ fn: 'rektor' });
  const { response, text, json } = await respond(reveal, request('/api/elever/personnummer'));
  assert.equal(response.status, 403);
  assert.equal(json.code, 'forbidden');
  assert.ok(response.headers.get('x-correlation-id'));
  assert.equal(response.headers.get('x-correlation-id'), json.correlationId);
  assert.equal(text.includes(MARKER), false);
  assertLifecycle();
  // Sessionskontextens transaktion rullas tillbaka och stängs innan nekandeloggen öppnar en ny klient.
  const rollback = state.log.find((e) => e.ev === 'rollback');
  assert.ok(rollback, 'sessionskontexten rullas tillbaka');
  const audit = state.log.find((e) => e.ev === 'audit');
  assert.equal(audit.outcome, 'denied');
  assert.equal(audit.action, 'pupil_personal_number_read');
  assert.ok(audit.client > rollback.client, 'nekandeloggen skrivs i en ny klient efter återrullningen');
  assert.ok(at((e) => e.ev === 'end' && e.client === rollback.client) < at((e) => e.ev === 'create' && e.client === audit.client));
  assert.ok(at((e) => e.ev === 'commit' && e.client === audit.client) < at((e) => e.ev === 'response'), 'nekandet committas före svaret');
  assert.equal(audit.details.includes(MARKER), false, 'kroppens innehåll hamnar aldrig i loggen');
  // Rättningen (04-25): den olästa kroppen är läst till slut före svaret.
  assert.ok(at((e) => e.ev === 'body-end') >= 0, 'kroppen läses till slut');
  assert.ok(at((e) => e.ev === 'body-end') < at((e) => e.ev === 'response'), 'kroppen är färdigläst före svaret');
});

test('nekande utan MFA före handlern läser också kroppen till slut före svaret', async () => {
  reset({ fn: 'administrator', mfa: false });
  const { response, json } = await respond(reveal, request('/api/elever/personnummer'));
  assert.equal(response.status, 403);
  assert.equal(json.code, 'mfa_required');
  assert.ok(response.headers.get('x-correlation-id'));
  assertLifecycle();
  assert.equal(events('audit').at(-1).outcome, 'denied');
  assert.ok(at((e) => e.ev === 'body-end') >= 0 && at((e) => e.ev === 'body-end') < at((e) => e.ev === 'response'));
});

test('loggfel ger 500 audit_unavailable med kod och korrelation, utan data, och kroppen är läst före svaret', async () => {
  reset({ fn: 'rektor', auditFails: true });
  const { response, text, json } = await respond(exportRoute, request('/api/elever/export'));
  assert.equal(response.status, 500);
  assert.deepEqual(Object.keys(json).sort(), ['code', 'correlationId']);
  assert.equal(json.code, 'audit_unavailable');
  assert.equal(response.headers.get('x-correlation-id'), json.correlationId);
  assert.equal(text.includes('private audit details'), false);
  assert.equal(text.includes(MARKER), false);
  assert.equal(events('audit').length, 0);
  assertLifecycle();
  assert.ok(at((e) => e.ev === 'body-end') >= 0 && at((e) => e.ev === 'body-end') < at((e) => e.ev === 'response'));
});

test('nekande utanför protectedRoute (context utan session) läser kroppen till slut före svaret', async () => {
  reset({ session: false });
  const { response, json } = await respond(context, request('/api/context'));
  assert.equal(response.status, 401);
  assert.equal(json.code, 'no_session');
  assert.ok(response.headers.get('x-correlation-id'));
  assert.equal(events('audit').at(-1)?.outcome, 'denied');
  assertLifecycle();
  assert.ok(at((e) => e.ev === 'body-end') >= 0 && at((e) => e.ev === 'body-end') < at((e) => e.ev === 'response'));
});

test('en stor oläst kropp buffras inte: läsningen avbryts vid gränsen och nekandet besvaras ändå', async () => {
  reset({ fn: 'rektor' });
  // 2 MiB i delar om 64 KiB, över gränsen på 1 MiB.
  const { response, json } = await respond(reveal, request('/api/elever/personnummer', body(32, 64 * 1024)));
  assert.equal(response.status, 403);
  assert.equal(json.code, 'forbidden');
  assert.equal(events('audit').at(-1).outcome, 'denied');
  const cancel = state.log.find((e) => e.ev === 'body-cancel');
  assert.ok(cancel, 'läsningen avbryts');
  assert.ok(cancel.read <= 18, `högst gränsen plus en del läses (${cancel.read} delar)`);
  assert.equal(at((e) => e.ev === 'body-end'), -1);
});
