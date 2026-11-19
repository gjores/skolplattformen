// Faktiska POST- och behörighetsfunktioner med syntetisk session, katalog och SQL-transaktion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const id = n => `83111900-0000-4000-8000-${String(n).padStart(12, '0')}`;
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const client = 'skolplattform-worker';
const scope = { contractVersion: 'nationella_prov_v1', unitId: id(1), schoolYear: 2027 };
const booking = { id: id(15), namn: 'Engelska', undervisning: 'undervisning:eng', mal: { slag: 'klass', ref: id(12) },
  datum: '2027-11-30', startMin: 540, slutMin: 600, tidsval: 'fast', salId: null, vakter: [id(13), id(14)], kontrolleradDatum: '2026-11-19' };
const input = (commandId, expectedRevision, bokningar = [booking], granskad = false) =>
  ({ ...scope, commandId: id(commandId), expectedRevision, document: { granskad, bokningar } });
const validCatalog = { gallerGymnasiet: true, deltagare: [{ ...booking.mal, name: 'Klass A', undervisningar: [{ ref: booking.undervisning, title: 'Engelska' }] }],
  salar: [], vakter: booking.vakter.map(ref => ({ ref, name: 'Provvakt' })), skoldagar: [booking.datum] };
const newState = () => ({ role: 'rektor', register: null, history: new Map(), catalog: validCatalog, source: [], catalogCalls: 0, sqlCalls: 0, events: [] });
let state = newState();

const fake = globalThis.__nationellaProvRouteTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: client, MFA_MAX_AGE_SECONDS: '28800' },
  session() {
    if (state.noSession) return null;
    const now = new Date(Date.now() - 1000), future = new Date(Date.now() + 60000);
    return { session: { id: id(3), identityId: id(4), membershipId: id(5), assignmentId: id(6), customerId: id(7), issuer, subject: 'synthetic-person', epoch: 1,
      expiresAt: future, absoluteExpiresAt: future, revokedAt: null, proofIssuer: issuer, proofClientId: client, proofAudience: [client],
      proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, acr: '2', amr: state.noMfa ? ['pwd'] : ['pwd', 'otp'], authTime: now, proofCheckedAt: now } };
  },
  login: (_corr, fn) => fn(fake.tx),
  async transaction(ctx, fn) {
    const before = structuredClone({ register: state.register, history: state.history, events: state.events });
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.liveRole ?? state.role, epoch: state.liveEpoch ?? 1, scopeKind: 'school' }); }
    catch (error) { Object.assign(state, before); throw error; }
  },
  catalog() { state.catalogCalls++; return state.catalog; },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails && values[11] === 'ok') throw new Error('synthetic audit unavailable');
      state.events.push({ action: values[8], outcome: values[11] });
      return [];
    }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
    state.sqlCalls++;
    if (sql.includes('pg_advisory_xact_lock_shared')) return [];
    if (sql.includes('from public.nationella_prov_kataloger')) {
      if (values[0] !== scope.schoolYear) return [];
      return state.source.filter(r => values[1] === null || r.revision === values[1]).slice(0, 1);
    }
    const q = values[0];
    const wire = result => [{ result: { contractVersion: scope.contractVersion,
      actor: { identityId: state.wrongActor ? id(99) : id(4), assignmentId: id(6) }, result } }];
    if (q.unitId !== scope.unitId) throw Object.assign(new Error('synthetic school denial'), { code: '42501' });
    if (sql.includes('public.nationella_prov_read')) return wire({ register: state.register });
    assert.ok(sql.includes('public.nationella_prov_save'));
    if (state.history.has(q.commandId)) return wire({ register: state.history.get(q.commandId), replayed: true });
    if (q.expectedRevision !== (state.register?.revision ?? 0)) throw Object.assign(new Error('synthetic revision conflict'), { code: '40001' });
    state.register = { revision: q.expectedRevision + 1, document: q.document, savedAt: '2026-11-19T10:00:00.000Z' };
    state.history.set(q.commandId, state.register);
    return wire({ register: state.register, replayed: false });
  },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  const is = file => url === new URL(file, server).href;
  let source;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...a)=>globalThis.__nationellaProvRouteTest.login(...a);
    export const withSessionContext=(...a)=>globalThis.__nationellaProvRouteTest.transaction(...a);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__nationellaProvRouteTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__nationellaProvRouteTest.env;';
  if (is('nationella-prov-underlag.ts')) source = 'export const readNationellaProvUnderlag=async()=>globalThis.__nationellaProvRouteTest.catalog();';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const routes = { lasa: (await import('../app/api/lasar/nationella-prov/lasa/route.ts')).POST,
  spara: (await import('../app/api/lasar/nationella-prov/spara/route.ts')).POST };
const call = async (name, value, headers = {}) => {
  const response = await routes[name](new Request(`http://localhost:3012/api/lasar/nationella-prov/${name}`, {
    method: 'POST', headers: { Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value),
  }));
  return { response, body: await response.json() };
};

test('provvägarna prövar ursprung, MFA, aktuell roll och epok före dataåtkomst', async () => {
  const cases = [[{ noSession: true }, {}, 401, 'no_session'], [{ noMfa: true }, {}, 403, 'mfa_required'],
    [{ liveRole: 'larare' }, {}, 403, 'forbidden'], [{ liveRole: 'huvudman' }, {}, 403, 'forbidden'],
    [{ liveEpoch: 2 }, {}, 409, 'context_changed'], [{}, { Origin: 'https://annanskola.example.test' }, 403, 'csrf']];
  for (const name of Object.keys(routes)) for (const [changes, headers, status, code] of cases) {
    state = { ...newState(), ...changes };
    const r = await call(name, name === 'spara' ? input(20, 0) : scope, headers);
    assert.equal(r.response.status, status);
    assert.equal(r.body.code, code);
    assert.equal(r.response.headers.get('Cache-Control'), 'no-store');
    assert.equal(state.catalogCalls + state.sqlCalls, 0);
  }
});

test('skolans katalog hör till läsningen och kan blockera nytt innehåll utan att förlora en tidigare revision', async () => {
  state = newState();
  assert.deepEqual((await call('lasa', scope)).body, { ...scope, register: null, underlag: { ...validCatalog, provkatalog: null } });
  const first = input(20, 0);
  assert.equal((await call('spara', first)).body.register.revision, 1);
  assert.equal((await call('spara', input(23, 0))).body.details.reason, 'nationella_prov_conflict');
  state.catalog = { ...validCatalog, deltagare: [] };
  const changed = input(21, 1, [{ ...booking, namn: 'Engelska, delprov A' }]);
  assert.equal((await call('spara', changed)).body.details.reason, 'nationella_prov_underlag_changed');
  assert.equal(state.register.revision, 1);
  assert.equal(state.history.has(changed.commandId), false);
  const beforeReplay = state.catalogCalls;
  assert.equal((await call('spara', first)).body.replayed, true);
  assert.equal(state.catalogCalls, beforeReplay);
  state.catalog = validCatalog;
  assert.equal((await call('spara', changed)).body.register.revision, 2);
  state.auditFails = true;
  assert.equal((await call('spara', input(25, 2))).body.code, 'audit_unavailable');
  assert.equal(state.register.revision, 2);
  state.auditFails = false;
  state.wrongActor = true;
  assert.equal((await call('lasa', scope)).body.code, 'audit_unavailable');
});

test('administratören kan behålla och rensa tidigare provvakter men behöver giltiga nya val', async () => {
  state = newState();
  assert.equal((await call('spara', input(20, 0))).response.status, 200);
  state.role = 'administrator';
  state.catalog = { ...validCatalog, vakter: [] };
  assert.equal((await call('spara', input(21, 1, [{ ...booking, vakter: [id(13)] }], true))).body.register.revision, 2);
  assert.equal((await call('spara', input(22, 2))).body.details.reason, 'nationella_prov_underlag_changed');
  assert.equal((await call('spara', input(23, 2, [{ ...booking, datum: '2027-12-01', vakter: [id(13)] }]))).response.status, 409);
  assert.equal((await call('spara', input(24, 2, [{ ...booking, vakter: [] }]))).body.register.revision, 3);
});

test('skolan sparar provets katalogrevision och behöver läsa om vid inaktuell eller felaktig koppling', async () => {
  state = newState();
  const niva = { amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' };
  const alternativ = { ref: 'undervisning:annan', title: 'Engelska nivå 2', nivaer: [{ ...niva, niva: 'ENGE2000X' }] };
  state.catalog = { ...validCatalog, skoldagar: [booking.datum, '2027-12-01'], deltagare: [
    { ...validCatalog.deltagare[0], undervisningar: [{ ...validCatalog.deltagare[0].undervisningar[0], nivaer: [niva] }, alternativ] },
  ] };
  const prov = { id: 'engelska1-b-ht', namn: 'Engelska nivå 1', nivaer: [niva], tid: { typ: 'fast', datum: booking.datum } };
  const version = { revision: 1, kontrolleradDatum: '2026-11-19', prov: [prov] };
  state.source = [version];
  const mapped = { ...booking, kallprov: { id: prov.id, revision: 1 } };
  assert.deepEqual((await call('lasa', scope)).body.underlag.provkatalog, version);
  const wrong = await call('spara', input(33, 0, [{ ...mapped, undervisning: alternativ.ref }]));
  assert.equal(wrong.body.details.reason, 'nationella_prov_katalog_mapping_invalid');
  assert.equal(state.register, null);
  const first = await call('spara', input(34, 0, [mapped]));
  assert.deepEqual(first.body.register.document.bokningar[0].kallprov, mapped.kallprov);
  state.source.unshift({ ...version, revision: 2, prov: [{ ...prov, tid: { typ: 'fast', datum: '2027-12-01' } }] });
  const outdated = await call('spara', input(35, 1, [{ ...mapped, datum: '2027-12-01' }]));
  assert.equal(outdated.response.status, 409);
  assert.equal(state.register.revision, 1);
  const fresh = { ...mapped, id: id(16), datum: '2027-12-01', kallprov: { ...mapped.kallprov, revision: 2 } };
  const editedResources = { ...mapped, vakter: [] };
  const second = await call('spara', input(36, 1, [editedResources, fresh]));
  assert.equal(second.body.register.revision, 2);
  assert.deepEqual(second.body.register.document.bokningar.map(b => b.kallprov.revision), [1, 2]);
});

test('bara gymnasiets prov går att planera och källkontrollen kan inte dateras framåt', async () => {
  state = newState();
  const framtida = { ...booking, kontrolleradDatum: '2101-01-01' };
  assert.equal((await call('spara', input(30, 0, [framtida]))).response.status, 400);
  assert.equal(state.sqlCalls, 0);
  state.catalog = { gallerGymnasiet: false, deltagare: [], salar: [], vakter: [], skoldagar: null };
  assert.equal((await call('lasa', scope)).body.underlag.gallerGymnasiet, false);
  assert.equal((await call('spara', input(31, 0))).response.status, 403);
  assert.equal((await call('spara', input(32, 0, [], true))).response.status, 403);
  assert.equal(state.register, null);
});
