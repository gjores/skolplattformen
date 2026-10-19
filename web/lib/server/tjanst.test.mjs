import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Faktiska rutter, authz och kontraktsparsers; databas, signerad session och transaktion är kontrollerade
// dubbletter (mönster class-timplan.test.mjs). SQL-entrypoints från 05.1-03/06/08 provas separat i ägd schemakopia.
const uid = n => `51a40000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = uid(1), assignmentId = uid(2), organizerId = uid(3), unit = uid(4), year = 2026, classId = uid(10), person = uid(20);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const hash = c => `sha256:${c.repeat(64)}`;
let state;
const fixture = globalThis.__tjanstServerTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-tjanst-only' },
  session() { const future = new Date(Date.now() + 60000); return { session: { id, identityId: id, membershipId: id, assignmentId, customerId: id, expiresAt: future, absoluteExpiresAt: future, epoch: 1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const events = state.events.length, mutations = state.mutations.length;
    try {
      return await fn(fixture.tx, { sessionId: id, identityId: id, membershipId: id, assignmentId, customerId: id, organizerId, unitId: null, identity: { issuer, subject: 'synthetic' },
        correlationId: id, accessFunction: state.fn, epoch: 1, mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
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
  if (url === new URL('./db.ts', import.meta.url).href) source = 'export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__tjanstServerTest.login(...a);export const withSessionContext=(...a)=>globalThis.__tjanstServerTest.context(...a);';
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__tjanstServerTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__tjanstServerTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });

const { createPlanCommand, planCommandRef } = await import('../tjanst-contract.ts');
const routes = {
  'plan/lasa': (await import('../../app/api/tjanst/plan/lasa/route.ts')).POST,
  'plan/kommando': (await import('../../app/api/tjanst/plan/kommando/route.ts')).POST,
  'plan/status': (await import('../../app/api/tjanst/plan/status/route.ts')).POST,
};
function post(path, body, origin = 'http://localhost') {
  return routes[path](new Request(`http://localhost/api/tjanst/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Context-Epoch': '1' },
    body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const wrap = (result, actor = { identityId: id, assignmentId }) => ({ contractVersion: 'tjanst_sql_v1', actor, result });

// Syntetisk Gy25-klass med identifierad koppling och en behovsrad.
const rowKey = 'programmeSpecific:BYGG:1:BYGG1000X', sourceKey = `class_timplan:${classId}:${year}:${rowKey}`;
const version = (extra = {}) => ({ id: uid(50), versionNo: 1, status: 'draft', contentHash: hash('c'), basedOnVersionId: null, publishedByName: null, publishedAt: null, ...extra });
const row = (extra = {}) => ({ id: uid(30), lineageId: uid(31), sourceKind: 'class_timplan', sourceKey, classId, rowKey, personId: person, teacherHt: 3000, teacherVt: 2400,
  needHt: 3000, needVt: 3000, needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const planRead = (extra = {}) => ({ contractVersion: 'tjanst_v1', unitId: unit, schoolName: 'Syntetiska gymnasiet', schoolYear: year, revision: 4,
  version: version(), versions: [version()], teachers: [{ personId: person, displayName: 'Syntetisk Lärare', draft: false, shareHere: 60 }],
  classes: [{ classId, name: 'BA26A', link: { linkRevision: 0, timplanId: uid(11), seriesId: uid(12), seriesName: 'Bygg 2026', timplanVersion: 1, column: 'ar1', schoolform: 'gymnasium' },
    needs: [{ sourceKind: 'class_timplan', sourceKey, rowKey, label: 'Bygg och anläggning 1', needHt: 3000, needVt: 3000, needBasis: 'terms' }] }],
  rows: [row()], specials: [], joints: [], actions: ['save_row', 'publish'], blockers: [], capabilities: { canEdit: true, canPublish: true, canReadHistory: true }, ...extra });
const organizerView = () => planRead({ actions: [], capabilities: { canEdit: false, canPublish: false, canReadHistory: true } });
const saveRow = () => createPlanCommand({ commandId: uid(40), unitId: unit, schoolYear: year, action: 'save_row', expectedRevision: 3,
  payload: { rowId: null, sourceKind: 'class_timplan', sourceKey, personId: person, teacherHt: 3000, teacherVt: 2400, comment: '' } });
const planReceipt = (extra = {}) => ({ commandId: uid(40), action: 'save_row', versionId: uid(50), revision: 4, contentHash: hash('c'), replayed: false, changed: true, ...extra });

function reset(fn = 'rektor') {
  state = { fn, mfa: false, events: [], calls: [], mutations: [], sqlError: null, auditFails: false, replies: {
    tjanst_plan_read: planRead(),
    tjanst_plan_command: wrap({ receipt: planReceipt(), detail: planRead() }),
    tjanst_plan_status: wrap({ state: 'completed', result: { receipt: planReceipt(), detail: planRead() } }),
  } };
}
const okEvents = () => state.events.filter(e => e.outcome === 'ok');

test('spår: rektor sparar en Gy25-rad genom rutt, adapter och exakt SQL-anrop', async () => {
  reset('rektor');
  const command = await saveRow();
  const response = await post('plan/kommando', command);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.receipt.revision, 4);
  assert.equal(body.detail.rows[0].teacherVt, 2400);
  assert.equal(state.calls.length, 1);
  assert.match(state.calls[0].sql, /select public\.tjanst_plan_command\(\?\) as result/u);
  assert.deepEqual(state.calls[0].values, [JSON.parse(JSON.stringify(command))]);
  assert.equal(state.events.length, 1);
  assert.deepEqual(state.events[0], { action: 'tjanst_plan_command', objectType: 'tjanst_version', objectId: uid(50), outcome: 'ok',
    details: { unitId: unit, schoolYear: year, accessFunction: 'rektor' } });
});

test('spår: raden läses tillbaka med kontrollerat svar', async () => {
  reset('rektor');
  const response = await post('plan/lasa', { unitId: unit, schoolYear: year });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.rows[0].sourceKey, sourceKey);
  assert.equal(body.rows[0].needHt, 3000);
  assert.match(state.calls[0].sql, /select public\.tjanst_plan_read\(\?\) as result/u);
  assert.deepEqual(state.calls[0].values, [{ unitId: unit, schoolYear: year }]);
  assert.equal(okEvents()[0].action, 'tjanst_plan_read');
});

test('huvudman läser fördelningen men får 403 på kommando utan SQL-anrop', async () => {
  reset('huvudman'); state.replies.tjanst_plan_read = organizerView();
  assert.equal((await post('plan/lasa', { unitId: unit, schoolYear: year })).status, 200);
  reset('huvudman');
  const response = await post('plan/kommando', await saveRow());
  assert.equal(response.status, 403);
  assert.equal(state.calls.length, 0);
  assert.equal(okEvents().length, 0);
  // Ett läsvar som ger huvudmannen redigering eller publicering lämnar aldrig servern.
  reset('huvudman');
  const leaked = await post('plan/lasa', { unitId: unit, schoolYear: year });
  assert.equal(leaked.status, 500);
  assert.equal((await leaked.json()).code, 'audit_unavailable');
});

test('administratör sparar men ett läsvar som ger administratören publicering avvisas', async () => {
  reset('administrator');
  state.replies.tjanst_plan_command = wrap({ receipt: planReceipt(), detail: planRead({ actions: ['save_row'], capabilities: { canEdit: true, canPublish: false, canReadHistory: true } }) });
  assert.equal((await post('plan/kommando', await saveRow())).status, 200);
  reset('administrator');
  assert.equal((await post('plan/kommando', await saveRow())).status, 500);
});

test('40001 med tjanst_revision_conflict ger 409 med reason och utan SQL-detaljer', async () => {
  reset('rektor'); state.sqlError = { code: '40001', hint: 'tjanst_revision_conflict', message: 'private detail', detail: 'private row' };
  const response = await post('plan/kommando', await saveRow());
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.code, 'conflict'); assert.equal(body.details.reason, 'tjanst_revision_conflict');
  assert.ok(!JSON.stringify(body).includes('private'));
  assert.equal(state.mutations.length, 0);
});

test('kommando med action publish ger 400 utan SQL-anrop', async () => {
  reset('rektor'); state.mfa = true;
  const publish = await createPlanCommand({ commandId: uid(40), unitId: unit, schoolYear: year, action: 'publish', expectedRevision: 3, expectedContentHash: hash('c'), payload: {} });
  const response = await post('plan/kommando', publish);
  assert.equal(response.status, 400);
  assert.equal(state.calls.length, 0);
});

test('kommando: fel payloadHash, okänd nyckel och för stor begäran ger 400 utan SQL-anrop', async () => {
  reset('rektor');
  const command = await saveRow();
  const tampered = { ...command, payload: { ...command.payload, teacherHt: 3060 } };
  const r1 = await post('plan/kommando', tampered);
  assert.equal(r1.status, 400); assert.equal((await r1.json()).details.reason, 'tjanst_payload_hash');
  assert.equal((await post('plan/kommando', { ...command, workingHours: 1600 })).status, 400);
  const large = await post('plan/kommando', JSON.stringify({ ...command, payload: { ...command.payload, comment: 'x'.repeat(70000) } }));
  assert.equal(large.status, 400); assert.equal((await large.json()).details.reason, 'payload_too_large');
  assert.equal(state.calls.length, 0);
});

test('plan/status: eget kommando läses med kvitto; fel familj ger 400', async () => {
  reset('rektor');
  const ref = planCommandRef(await saveRow());
  const response = await post('plan/status', { command: ref });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result.receipt.commandId, uid(40));
  assert.match(state.calls[0].sql, /select public\.tjanst_plan_status\(\?\) as result/u);
  assert.equal(okEvents()[0].action, 'tjanst_plan_status_read');
  reset('rektor');
  const selfRef = { family: 'self', commandId: uid(40), action: 'ack', target: { unitId: null, schoolYear: null, versionId: uid(70), personId: null } };
  assert.equal((await post('plan/status', { command: selfRef })).status, 400);
  assert.equal(state.calls.length, 0);
});

test('läsrutter kräver samma ursprung', async () => {
  reset('rektor');
  assert.equal((await post('plan/lasa', { unitId: unit, schoolYear: year }, 'http://foreign')).status, 403);
  assert.equal(state.calls.length, 0);
});
