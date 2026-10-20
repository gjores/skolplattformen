import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Faktiska rutter, authz och kontraktsparsers; databas, signerad session och transaktion är kontrollerade
// dubbletter (mönster class-timplan.test.mjs). SQL-entrypoints från 05.1-03/06/08 provas separat i ägd schemakopia.
const uid = n => `51a40000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = uid(1), assignmentId = uid(2), organizerId = uid(3), unit = uid(4), year = 2026, person = uid(20);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const hash = c => `sha256:${c.repeat(64)}`;
let state;
const fixture = globalThis.__selfScopeTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-tjanst-only' },
  session() { const future = new Date(Date.now() + 60000); return { session: { id, identityId: id, membershipId: id, assignmentId, customerId: id, expiresAt: future, absoluteExpiresAt: future, epoch: 1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const events = state.events.length, mutations = state.mutations.length;
    try {
      return await fn(fixture.tx, { sessionId: id, identityId: id, membershipId: id, assignmentId, customerId: id, organizerId, unitId: null, identity: { issuer, subject: 'synthetic' },
        correlationId: id, accessFunction: state.fn, scopeKind: state.scope, epoch: 1, mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
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
    const fn = /public\.([a-z0-9_]+)\(/u.exec(sql)?.[1];
    if (!fn || !(fn in state.replies)) throw new Error('Unexpected synthetic query');
    if (fn.endsWith('_command')) state.mutations.push(values);
    return [{ result: structuredClone(state.replies[fn]) }];
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = 'export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__selfScopeTest.login(...a);export const withSessionContext=(...a)=>globalThis.__selfScopeTest.context(...a);';
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__selfScopeTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__selfScopeTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const api = fileURLToPath(new URL('../../app/api/', import.meta.url));
const route = async path => (await import(`../../app/api/${path}/route.ts`));
const publication = { versionId: uid(70), versionNo: 2, unitId: unit, schoolName: 'Syntetiska gymnasiet', schoolYear: year, publishedAt: '2026-08-20T08:00:00.000Z',
  contentHash: hash('c'), rows: [], specials: [], acknowledgedAt: null, comments: [] };
const selfView = { contractVersion: 'tjanst_v1', person: { id: person, displayName: 'Syntetisk Lärare' }, publications: [publication], capabilities: { canAck: true, canComment: true } };
function reset(scope = 'self', fn = 'larare') { state = { fn, scope, mfa: false, replies: { tjanst_self_read: selfView }, events: [], calls: [], mutations: [] }; }
const req = (path, method = 'POST', body = {}, query = '') => new Request(`http://localhost/api/${path}${query}`, { method,
  headers: { Origin: 'http://localhost', 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json', 'X-Context-Epoch': '1' }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
const routeFiles = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? routeFiles(p) : name === 'route.ts' ? [relative(api, p)] : []; });

test('self-sessionen når Min tjänst men nekas elevlistan', async () => {
  reset();
  const ok = await (await route('tjanst/egen/lasa')).POST(req('tjanst/egen/lasa'));
  assert.equal(ok.status, 200); assert.equal((await ok.json()).person.id, person);
  reset();
  const denied = await (await route('elever/lista')).POST(req('elever/lista', 'POST', { unitId: unit }));
  assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'forbidden'); assert.equal(state.calls.length, 0);
});
test('elevrutterna lista, urval och elev nekar self utan SQL-anrop', async () => {
  for (const [path, method, query] of [['elever/lista', 'POST', ''], ['elever/urval', 'GET', ''], ['elever/elev', 'GET', `?pupilId=${uid(30)}&schoolYear=2026`]]) {
    reset();
    const r = await (await route(path))[method](req(path, method, { unitId: unit }, query));
    assert.equal(r.status, 403, path); assert.equal(state.calls.length, 0, path);
  }
});
test('lärare med gruppmandat passerar spärren som förut och når elevregistrets SQL', async () => {
  for (const [path, method, query] of [['elever/urval', 'GET', ''], ['elever/elev', 'GET', `?pupilId=${uid(30)}&schoolYear=2026`]]) {
    reset('group');
    const r = await (await route(path))[method](req(path, method, {}, query));
    assert.ok(state.calls.length > 0, `${path}: group teacher reaches the pupil register (${r.status} ${await r.text()})`);
  }
});
test('andra scope än self påverkas inte av standardnekandet', async () => {
  for (const scope of ['school', 'group', null]) { reset(scope); assert.equal((await (await route('tjanst/egen/lasa')).POST(req('tjanst/egen/lasa'))).status, 200, String(scope)); }
});
test('planeringsrutterna (planningProtectedRoute) nekar self', async () => {
  for (const fn of ['rektor', 'larare']) { reset('self', fn); const r = await (await route('planering/lista')).POST(req('planering/lista', 'POST', {})); assert.equal(r.status, 403); assert.equal(state.calls.length, 0); }
});
test('selfAllowed finns bara på de tre egen-rutterna', () => {
  const allowed = routeFiles(api).filter(p => readFileSync(join(api, p), 'utf8').includes('selfAllowed')).sort();
  assert.deepEqual(allowed, ['tjanst/egen/kommando/route.ts', 'tjanst/egen/lasa/route.ts', 'tjanst/egen/status/route.ts']);
});
test('rutter utan protectedRoute ger ingen elev- eller klassdata (genomgång)', () => {
  const reviewed = {
    'auth/callback/route.ts': 'inloggning; skapar sessionen, ingen elev- eller klassdata',
    'auth/login/route.ts': 'startar inloggning, ingen data',
    'auth/logout/route.ts': 'avslutar sessionen',
    'context/route.ts': 'byter till ett av den egna identitetens uppdrag; svarar med uppdragets namn och scopeKind',
    'health/db/route.ts': 'teknisk hälsokontroll (roll och antal kunder), ingen elev- eller klassdata',
    'inbjudan/losen/route.ts': 'löser in en inbjudan till den egna identiteten',
    'planering/lista/route.ts': 'planningProtectedRoute → protectedRoute; self nekas (prov ovan)',
    'planering/oversikt/route.ts': 'planningProtectedRoute → protectedRoute; self nekas',
    'planering/urval/route.ts': 'planningProtectedRoute → protectedRoute; self nekas',
    'session/route.ts': 'den egna identitetens uppdrag och valt uppdrag',
    'skolenhet/route.ts': 'publikt uppslag i Skolverkets skolenhetsregister',
  };
  const unprotected = routeFiles(api).filter(p => !readFileSync(join(api, p), 'utf8').includes('protectedRoute(')).sort();
  assert.deepEqual(unprotected, Object.keys(reviewed).sort());
  for (const p of unprotected) assert.doesNotMatch(readFileSync(join(api, p), 'utf8'), /pupil|elev_|phase4_list|school_classes/u, p);
});
