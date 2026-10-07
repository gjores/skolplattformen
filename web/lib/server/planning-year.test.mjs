import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Adapter/route doubles only: real mandate, SQL and audit-pair proof belongs to the Worker harness.
const id = n => `55403800-0000-4000-8000-${String(n).padStart(12, '0')}`;
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
const revision = `sha256:${'a'.repeat(64)}`;
const selection = changes => ({ schoolYear: 2027, unitId: null, view: 'timplan', schoolform: 'gymnasium', query: '', status: 'all',
  cohortRelation: 'all', archive: 'active', grade: null, sort: 'name', direction: 'asc', page: 1, selectionRevision: null, ...changes });
const setup = () => ({ customerId: id(1), serverDate: '2026-10-07', currentYear: 2026, minimumYear: 2000, maximumYear: 2100,
  units: [{ unitId: id(2), schoolName: 'Syntetisk skola', canRead: { programplan: true, gymnasium: true, grundskola: true, introduktionsprogram: true } }] });
const row = () => ({ customerId: id(1), unitId: id(2), offeringId: id(4), schoolName: 'Syntetisk skola', educationName: 'Syntetisk utbildning', cohort: 'Fritext 2099',
  schoolform: 'gymnasium', plan: { id: id(5), version: 2, revision: 7, status: 'utkast' }, source: { planId: id(6), offeringId: id(4), version: 1, revision: 3 },
  start: { provenance: 'timplan-source', startedOn: '2026-08-15', academicYear: 2026, legacyYear: 2026 }, relativeYear: 2, relation: 'continuing',
  underlag: 'planning', archived: false, columnMap: null, application: null, classes: [],
  cells: [{ rowKey: 'foundation:REL:1:REL1000X', points: 200, pointTerms: [0, 0, 60, 40, 50, 50], hourValues: [null, null, 45, 35, 40, 40] }], diagnostics: [] });
const measure = known => ({ value: known, known, complete: true });
let state;
const fixture = globalThis.__planningYearAdapterTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321',
    OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-adapter-only' },
  session() {
    if (state.noSession) return null;
    const future = new Date(Date.now() + 60000);
    return { session: { id: id(1), identityId: id(1), membershipId: id(1), assignmentId: id(1), customerId: id(1), expiresAt: future, absoluteExpiresAt: future, epoch: 1 } };
  },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const events = state.events.length;
    try {
      return await fn(fixture.tx, { sessionId: id(1), identityId: id(1), membershipId: id(1), assignmentId: id(1), customerId: id(1),
        identity: { issuer, subject: 'synthetic' }, correlationId: id(1), accessFunction: state.fn, epoch: 1,
        mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1, acr: '1', amr: ['pwd'],
          authTime: new Date(Date.now() - 1000), checkedAt: new Date() } });
    } catch (error) { state.events.length = events; throw error; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.fn }];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFailure === values[8] && values[11] === 'ok') throw new Error('private audit failure');
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] });
      return [];
    }
    state.calls.push({ sql, values });
    if (state.sqlFailure && (!state.sqlFailureAt || sql.includes(state.sqlFailureAt))) throw state.sqlFailure;
    if (state.cardinality !== undefined) return Array.from({ length: state.cardinality }, () => ({ result: state.setup }));
    return [{ result: sql.includes('phase5_planning_year_selection') ? state.setup : state.result }];
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = `export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__planningYearAdapterTest.login(...a);export const withSessionContext=(...a)=>globalThis.__planningYearAdapterTest.context(...a);`;
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__planningYearAdapterTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__planningYearAdapterTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { GET: urval } = await import('../../app/api/planering/urval/route.ts');
const { POST: lista } = await import('../../app/api/planering/lista/route.ts');
const { POST: oversikt } = await import('../../app/api/planering/oversikt/route.ts');
const routes = { urval, lista, oversikt };
const actions = { urval: 'planning_year_selection_read', lista: 'planning_year_list_read', oversikt: 'planning_year_overview_read' };
function reset(name = 'lista', input = selection()) {
  state = { fn: 'rektor', setup: setup(), calls: [], events: [], result: { selection: input, selectionRevision: revision, count: 1, rows: [row()] } };
  if (name === 'lista') state.result.pageSize = 50;
  if (name === 'oversikt') state.result.totals = { points: measure(100), annualHours: measure(80), weeklyHours: measure(0), classCount: measure(0), hasForecast: false };
}
function request(name, input = selection(), changes = {}) {
  return new Request(`http://localhost/api/planering/${name}`, name === 'urval'
    ? { headers: { 'X-Context-Epoch': '1' }, ...changes }
    : { method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json', 'X-Context-Epoch': '1' }, body: JSON.stringify(input), ...changes });
}
async function denied(name, status, req = request(name), code) {
  const response = await routes[name](req), body = await response.json();
  assert.equal(response.status, status);
  if (code) assert.equal(body.code, code);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('X-Correlation-Id'));
  assert.equal('rows' in body || 'units' in body || 'totals' in body, false);
  assert.equal(JSON.stringify(body).includes('private'), false);
  assert.equal(state.events.filter(event => event.outcome === 'ok').length, 0);
  return body;
}
for (const name of Object.keys(routes)) {
  test(`${name}: befintliga planroller läser med required-audit, inga elev- eller MFA-fält`, async () => {
    for (const fn of ['huvudman', 'rektor', 'administrator']) {
      reset(name); state.fn = fn;
      const response = await routes[name](request(name)), body = await response.json();
      assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store'); assert.equal(response.headers.get('X-Context-Epoch'), '1');
      assert.equal(state.calls.length, name === 'urval' ? 1 : 2);
      assert.deepEqual(state.events.map(event => event.action), name === 'urval' ? [actions.urval] : [actions.urval, actions[name]]);
      for (const event of state.events) {
        assert.equal(event.objectType, 'planning_year_collection'); assert.equal(event.objectId, null); assert.deepEqual(event.details, { accessFunction: fn });
      }
      if (name === 'urval') assert.deepEqual(body, setup());
      else { assert.deepEqual(body, state.result); assert.deepEqual(state.calls[1].values, [selection()]); }
    }
  });
  test(`${name}: saknad session, fel funktion och falsk epok stoppar före RPC`, async () => {
    reset(name); state.noSession = true; await denied(name, 401, undefined, 'no_session'); assert.equal(state.calls.length, 0);
    for (const fn of ['larare', 'support', 'it', 'kundadmin', 'elevhalsa', 'granskare']) {
      reset(name); state.fn = fn; await denied(name, 403); assert.equal(state.calls.length, 0);
    }
    for (const epoch of ['2', 'private']) {
      reset(name); const req = request(name); req.headers.set('X-Context-Epoch', epoch); await denied(name, 409, req, 'context_changed'); assert.equal(state.calls.length, 0);
    }
  });
  test(`${name}: SQL-status minimeras och auditfel ger 503 utan läsdata`, async () => {
    for (const [code, status] of [['42501', 403], ['22023', 400], ['40001', 409], ['55000', 503]]) {
      reset(name); state.sqlFailure = { code, message: 'private SQL', hint: 'private' }; const body = await denied(name, status);
      if (code === '40001') assert.deepEqual(body.details, { reloadSelection: true });
    }
    for (const action of new Set([actions.urval, actions[name]])) {
      reset(name); state.auditFailure = action; await denied(name, 503, undefined, 'audit_unavailable');
    }
  });
  test(`${name}: fel rått setup, kund eller resultat stoppar projektionen och rullar tillbaka audit`, async () => {
    for (const mutate of [s => s.setup.private = 'private', s => s.setup.customerId = id(99), s => s.setup.currentYear = 2099, s => s.cardinality = 0, s => s.cardinality = 2]) {
      reset(name); mutate(state); await denied(name, 503, undefined, 'audit_unavailable');
    }
    if (name !== 'urval') for (const mutate of [s => s.result.private = 'private', s => s.result.rows[0].source.offeringId = id(99),
      s => s.result.rows[0].relativeYear = 1, s => s.result.rows[0].cells.push(structuredClone(s.result.rows[0].cells[0])),
      s => s.result.rows[0].unitId = id(99), s => s.result.selection.schoolYear = 2099]) {
      reset(name); mutate(state); await denied(name, 503, undefined, 'audit_unavailable');
    }
  });
}
for (const name of ['lista', 'oversikt']) {
  test(`${name}: same-origin och strikt JSON-kontrakt före all skyddad läsning`, async () => {
    for (const origin of ['https://foreign.test', 'null']) {
      reset(name); const req = request(name); req.headers.set('Origin', origin); await denied(name, 403, req, 'csrf'); assert.equal(state.calls.length, 0);
    }
    reset(name); const cross = request(name); cross.headers.set('Sec-Fetch-Site', 'cross-site'); await denied(name, 403, cross, 'csrf');
    for (const input of [{ ...selection(), customerId: id(1) }, { ...selection(), source: row().source }, selection({ schoolYear: '2027' }),
      selection({ query: ' otrimma ' }), selection({ page: 2 }), selection({ view: 'programplan', schoolform: 'grundskola' }), null]) {
      reset(name); await denied(name, 400, request(name, input), 'bad_request'); assert.equal(state.calls.length, 0);
    }
    for (const contentType of ['text/plain', 'application/javascript', '']) {
      reset(name); const req = request(name); req.headers.set('Content-Type', contentType); await denied(name, 400, req, 'bad_request'); assert.equal(state.calls.length, 0);
    }
    reset(name); await denied(name, 400, request(name, undefined, { body: '{' }), 'bad_request'); assert.equal(state.calls.length, 0);
  });
  test(`${name}: sent RPC-fel behåller inte setupets Worker-event`, async () => {
    reset(name); state.sqlFailureAt = name === 'lista' ? 'planning_year_list' : 'planning_year_overview'; state.sqlFailure = { code: '42501' };
    await denied(name, 403); assert.equal(state.calls.length, 2);
  });
}
test('översikt tillåter bara första sidan; GET ignorerar inga urvalsparametrar', async () => {
  reset('oversikt'); await denied('oversikt', 400, request('oversikt', selection({ page: 2, selectionRevision: revision })), 'bad_request'); assert.equal(state.calls.length, 0);
  reset('urval'); await denied('urval', 400, new Request('http://localhost/api/planering/urval?schoolYear=2099'), 'bad_request'); assert.equal(state.calls.length, 0);
});
test('gymadmin får aldrig använda en förfalskad GR/IM-projektion; verklig SQL ansvarar för 403', async () => {
  for (const form of ['grundskola', 'introduktionsprogram']) {
    const input = selection({ schoolform: form }); reset('lista', input); state.fn = 'administrator';
    state.setup.units[0].canRead.grundskola = false; state.setup.units[0].canRead.introduktionsprogram = false;
    state.sqlFailureAt = 'planning_year_list'; state.sqlFailure = { code: '42501' }; await denied('lista', 403, request('lista', input));
    assert.deepEqual(state.calls[1].values, [input]);
  }
});
test('saknad plan och saknad fryst källa är explicita läsbara luckor utan fabricerade celler', async () => {
  for (const missingPlan of [true, false]) {
    reset('lista');
    const missing = state.result.rows[0];
    missing.source = null; missing.cells = [];
    missing.diagnostics = [missingPlan ? 'missing-plan' : 'missing-source', 'missing-hours', 'missing-points'];
    if (missingPlan) { missing.plan = null; missing.underlag = 'missing'; }
    const response = await lista(request('lista')), body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(body.rows[0], missing); assert.equal(state.events.length, 2);
    assert.deepEqual(body.rows[0].cells, []); assert.equal(body.rows[0].source, null);
  }
});
test('tomt urval återanvänder serverns scope och skapar inte planeringsunderlag', async () => {
  for (const name of ['lista', 'oversikt']) {
    reset(name); state.setup.units = []; state.result.rows = []; state.result.count = 0;
    if (name === 'oversikt') state.result.totals = { points: measure(0), annualHours: measure(0), weeklyHours: measure(0), classCount: measure(0), hasForecast: false };
    const response = await routes[name](request(name)), body = await response.json();
    assert.equal(response.status, 200); assert.deepEqual(body.rows, []); assert.equal(body.count, 0); assert.equal(state.calls.length, 2);
  }
});
