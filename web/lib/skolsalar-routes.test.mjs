// 05.2-SM-UXF-23: rutterna för skolans salregister genom riktiga routefunktioner, protectedRoute, MFA- och CSRF-kontroll.
// Session och SQL är avsiktliga stubbar; SQL-funktionernas egna regler prövas i work/pilot/verify-school-rooms.mjs. Inte ett Worker/OIDC/PostgreSQL-prov.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const id = n => `73111500-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
let state;
const sal = (n, name) => ({ id: `sal-${n}`, name, typ: 'Allmän sal', platser: 30, utrustning: [] });
const register = (revision, document) => ({ revision, contentHash: `sha256:${'b'.repeat(64)}`, savedAt: '2026-11-17T22:00:00.000Z', document });
const envelope = result => ({ contractVersion: 'school_rooms_sql_v1', actor: { identityId: id(4), assignmentId: id(6) }, result });
const fake = globalThis.__skolsalarRoutesTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: 'skolplattform-worker', MFA_MAX_AGE_SECONDS: '28800' },
  session() {
    if (state.noSession) return null;
    const now = new Date(Date.now() - 1000), future = new Date(Date.now() + 60000);
    return { token: 'synthetic-session', session: { id: id(3), identityId: id(4), membershipId: id(5), assignmentId: id(6), customerId: id(7), issuer: ISSUER, subject: 'synthetic-person', epoch: 1,
      expiresAt: future, absoluteExpiresAt: future, revokedAt: null, proofIssuer: ISSUER, proofClientId: 'skolplattform-worker', proofAudience: ['skolplattform-worker'],
      proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, acr: '2', amr: state.noMfa ? ['pwd'] : ['pwd', 'otp'], authTime: now, proofCheckedAt: now } };
  },
  async login(_corr, fn) { return fn(fake.tx); },
  async parseRequest(request, parse) { return parse(await request.json()); },
  async sessionContext(ctx, fn) { return fn(fake.tx, { ...ctx, accessFunction: state.role, epoch: 1, scopeKind: 'school' }); },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) { state.events.push({ action: values[8], outcome: values[11] }); return []; }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
    if (sql.includes('school_rooms_read')) { state.sql.push({ fn: 'read', input: values[0] }); return [{ result: envelope({ register: state.stored }) }]; }
    if (sql.includes('school_rooms_save')) {
      state.sql.push({ fn: 'save', input: values[0] });
      if (state.sqlError) throw Object.assign(new Error('synthetic'), state.sqlError);
      return [{ result: envelope({ register: state.reply ?? register(values[0].expectedRevision + 1, values[0].document), replayed: false }) }];
    }
    throw new Error('Unexpected synthetic SQL');
  },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  let source;
  const is = name => url === new URL(name, server).href;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...args)=>globalThis.__skolsalarRoutesTest.login(...args);
    export const withSessionContext=(ctx,fn)=>globalThis.__skolsalarRoutesTest.sessionContext(ctx,fn);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__skolsalarRoutesTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__skolsalarRoutesTest.env;';
  if (is('tjanst.ts')) source = 'export const tjanstRequest=(...a)=>globalThis.__skolsalarRoutesTest.parseRequest(...a);';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const las = (await import('../app/api/schema/salregister/las/route.ts')).POST, spara = (await import('../app/api/schema/salregister/spara/route.ts')).POST;
const reset = extra => { state = { role: 'rektor', events: [], sql: [], stored: null, ...extra }; };
const request = (name, value, headers = {}) => new Request(`http://localhost:3012/api/schema/salregister/${name}`, { method: 'POST',
  headers: { Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) });
const scope = { contractVersion: 1, unitId: id(1) };
const doc = { nasta: 3, salar: [sal(1, 'A101'), sal(2, 'A102')] };

test('huvudman, rektor och administratör läser skolans register; tomt register är null', async () => {
  for (const role of ['huvudman', 'rektor', 'administrator']) {
    reset({ role }); const res = await las(request('las', scope));
    assert.equal(res.status, 200, role); assert.deepEqual(await res.json(), { ...scope, register: null });
    assert.deepEqual(state.sql.map(x => x.fn), ['read']); assert.ok(state.events.some(e => e.action === 'school_rooms_read' && e.outcome === 'ok'));
  }
  reset({ stored: register(2, doc) }); const res = await las(request('las', scope));
  assert.deepEqual((await res.json()).register.document, doc);
});

test('lärare, saknad MFA, korsursprung och saknad session stoppas före SQL', async () => {
  for (const [change, headers, status] of [[{ role: 'larare' }, {}, 403], [{ noMfa: true }, {}, 403], [{}, { Origin: 'https://annan.example.test' }, 403], [{ noSession: true }, {}, 401]]) {
    for (const [route, name, body] of [[las, 'las', scope], [spara, 'spara', { ...scope, commandId: id(50), expectedRevision: 0, document: doc }]]) {
      reset(change); const res = await route(request(name, body, headers));
      assert.equal(res.status, status, JSON.stringify([name, change])); assert.equal(state.sql.length, 0);
    }
  }
});

test('sparning skickar exakt det tolkade dokumentet och returnerar kvittot', async () => {
  reset(); const body = { ...scope, commandId: id(50), expectedRevision: 1, document: doc };
  const res = await spara(request('spara', body));
  assert.equal(res.status, 200); const svar = await res.json();
  assert.equal(svar.register.revision, 2); assert.equal(svar.replayed, false); assert.deepEqual(svar.register.document, doc);
  assert.deepEqual(state.sql[0].input, body);
  assert.ok(state.events.some(e => e.action === 'school_rooms_saved' && e.outcome === 'ok'));
});

test('ogiltigt dokument nekas före SQL; konflikt och fel kvitto blir kontrollerade fel', async () => {
  for (const document of [{ nasta: 2, salar: [sal(2, 'A')] }, { nasta: 3, salar: [sal(1, 'A'), sal(2, 'a')] }, { ...doc, arv: [] }]) {
    reset(); const res = await spara(request('spara', { ...scope, commandId: id(50), expectedRevision: 0, document }));
    assert.equal(res.status, 400); assert.equal((await res.json()).details?.reason, 'school_rooms_invalid'); assert.equal(state.sql.length, 0);
  }
  reset({ sqlError: { code: '40001', hint: 'school_rooms_conflict' } });
  const konflikt = await spara(request('spara', { ...scope, commandId: id(50), expectedRevision: 0, document: doc }));
  assert.equal(konflikt.status, 409); assert.equal((await konflikt.json()).details.reason, 'school_rooms_conflict');
  reset({ reply: register(1, { nasta: 3, salar: [sal(1, 'Annan')] }) });
  const fel = await spara(request('spara', { ...scope, commandId: id(50), expectedRevision: 0, document: doc }));
  assert.ok(fel.status >= 500, 'ett kvitto med annat innehåll än det skickade godtas inte');
});
