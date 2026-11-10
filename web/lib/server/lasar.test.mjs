import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Läsårskalenderns rutter och serveradapter (05.1.1-06). Faktiska rutter, authz och kontraktsparsers; databas,
// signerad session och transaktion är kontrollerade dubbletter (mönster tjanst.test.mjs). SQL provas i verify-lasar.mjs.
const uid = n => `51b10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = uid(1), assignmentId = uid(2), organizerId = uid(3), unit = uid(4), version = uid(5), year = 2027;
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const hash = c => `sha256:${c.repeat(64)}`;
let state;
const fixture = globalThis.__lasarServerTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer,
    OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-lasar-only' },
  session() { const future = new Date(Date.now() + 60000); return { session: { id, identityId: id, membershipId: id, assignmentId, customerId: id, expiresAt: future, absoluteExpiresAt: future, epoch: 1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const events = state.events.length;
    try {
      return await fn(fixture.tx, { sessionId: id, identityId: id, membershipId: id, assignmentId, customerId: id, organizerId, unitId: null, identity: { issuer, subject: 'synthetic' },
        correlationId: id, accessFunction: state.fn, epoch: 1, mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
          acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], authTime: new Date(Date.now() - 1000), checkedAt: new Date() } });
    } catch (error) { state.events.length = events; throw error; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.fn }];
    if (sql.includes('insert into public.security_events')) {
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] }); return [];
    }
    const fn = /public\.(lasar_[a-z_]+)\(/u.exec(sql)?.[1];
    state.calls.push({ fn, sql, values });
    if (state.sqlError && fn === state.sqlErrorAt) throw state.sqlError;
    if (!fn || !(fn in state.replies)) throw new Error('Unexpected synthetic query');
    return [{ result: structuredClone(state.replies[fn]) }];
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = 'export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__lasarServerTest.login(...a);export const withSessionContext=(...a)=>globalThis.__lasarServerTest.context(...a);';
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__lasarServerTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__lasarServerTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });

const { lasarCommandRequest, lasarDecisionRequest } = await import('../lasar-contract.ts');
const { proposeSchoolYear } = await import('../lasar-model.ts');
const routes = {
  lasa: (await import('../../app/api/lasar/lasa/route.ts')).POST,
  kommando: (await import('../../app/api/lasar/kommando/route.ts')).POST,
  beslut: (await import('../../app/api/lasar/beslut/route.ts')).POST,
};
function post(path, body, origin = 'http://localhost') {
  return routes[path](new Request(`http://localhost/api/lasar/${path}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Context-Epoch': '1' },
    body: typeof body === 'string' ? body : JSON.stringify(body) }));
}
const wrap = (result, actor = { identityId: id, assignmentId }) => ({ contractVersion: 'lasar_sql_v1', actor, result });
const target = { kind: 'school', unitId: unit };
const caps = (over = {}) => ({ canEdit: false, canSubmit: false, canWithdraw: false, canRequestChange: false, canWithdrawRequest: false, canReturn: false,
  canApprove: false, canReopen: false, canDecline: false, canComment: false, canCreate: [], canPublishFrame: false, canSetMode: false, ...over });
const calendar = (over = {}) => ({ versionId: version, version: 1, status: 'utkast', revision: 1,
  terms: { ht: { start: '2027-08-16', end: '2027-12-17' }, vt: { start: '2028-01-10', end: '2028-06-09' } }, exceptions: {}, groupDays: {}, shortWeeks: {},
  frameVersionId: null, contentHash: hash('c'), decidedOn: null, history: [], ...over });
function read({ cal = null, capabilities = caps() } = {}) {
  return { contractVersion: 'lasar_sql_v1', target, schoolYear: year, schoolName: 'Syntetisk skola A', schoolTypes: ['GR', 'GY'], mode: 'eget', modeLocked: false,
    versions: cal ? [{ versionId: cal.versionId, version: cal.version, status: cal.status, decidedOn: cal.decidedOn, current: cal.status === 'faststalld' }] : [],
    calendar: cal, capabilities, editableFrom: null, changeRequest: null, review: [], frame: null, groups: [], teaching: { classes: [], imClassIds: [] }, previousYearAvailable: false };
}
function reset(fn = 'rektor', replies = {}) {
  state = { fn, mfa: false, events: [], calls: [], sqlError: null, sqlErrorAt: null, replies: {
    lasar_read: wrap(read({ capabilities: caps({ canCreate: fn === 'huvudman' ? [] : ['proposal'] }) })), ...replies } };
}
const created = commandId => wrap({ receipt: { commandId, revision: 1, replayed: false }, detail: read({ cal: calendar(), capabilities: caps({ canEdit: true, canSubmit: true }) }) });
const createRequest = () => lasarCommandRequest({ target, schoolYear: year, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'proposal' }] });

test('spår: rektor skapar förslag; servern läser skolformerna och skickar serverberäknat innehåll till lasar_command', async () => {
  reset('rektor');
  const request = await createRequest();
  state.replies.lasar_command = created(request.commandId);
  const response = await post('kommando', request);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.receipt.revision, 1); assert.equal(body.detail.calendar.status, 'utkast');
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_read', 'lasar_command']);
  assert.deepEqual(state.calls[0].values, [{ target, schoolYear: year, versionId: null }]);
  const p = proposeSchoolYear(year, unit, ['GR', 'GY']);
  assert.deepEqual(state.calls[1].values, [{ ...JSON.parse(JSON.stringify(request)), proposal: { terms: { ht: p.ht, vt: p.vt }, exceptions: p.exceptions } }]);
  assert.deepEqual(state.events.filter(e => e.outcome === 'ok').map(e => [e.action, e.objectType, e.objectId, e.details.unitId, e.details.schoolYear]),
    [['lasar_command', 'school_year', version, unit, year]]);
});

test('klienten kan inte skicka eget förslagsinnehåll', async () => {
  reset('rektor');
  const request = await createRequest();
  const response = await post('kommando', { ...request, proposal: { terms: {}, exceptions: {} } });
  assert.equal(response.status, 400); assert.deepEqual(state.calls, []);
});

test('läsning: rutt, exakt SQL-anrop och händelse', async () => {
  reset('huvudman');
  const response = await post('lasa', { target, schoolYear: year, versionId: null });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).schoolName, 'Syntetisk skola A');
  assert.match(state.calls[0].sql, /select public\.lasar_read\(\?\) as result/u);
  assert.equal(state.events.filter(e => e.outcome === 'ok')[0].action, 'lasar_read');
});

test('aktör i SQL-kuvertet som inte är sessionens ger 500 utan innehåll', async () => {
  reset('rektor', { lasar_read: wrap(read(), { identityId: uid(90), assignmentId }) });
  const response = await post('lasa', { target, schoolYear: year, versionId: null });
  assert.equal(response.status, 500);
  const body = await response.json();
  assert.equal(body.code, 'audit_unavailable'); assert.equal(body.details, undefined);
  assert.ok(!JSON.stringify(body).includes('Syntetisk skola'));
});

test('förmågor som inte stämmer med sessionens funktion ger 500', async () => {
  reset('huvudman', { lasar_read: wrap(read({ capabilities: caps({ canCreate: ['proposal'] }) })) });
  assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 500);
  reset('rektor', { lasar_read: wrap(read({ cal: calendar({ status: 'forslag', revision: 2 }), capabilities: caps({ canApprove: true }) })) });
  assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 500);
});

test('vitlistade orsaker når klienten; okända orsaker och SQLSTATE läcker inte', async () => {
  const cases = [
    [{ code: '40001', hint: 'lasar_locked_status' }, 409, { reason: 'lasar_locked_status' }],
    [{ code: '40001', hint: 'lasar_rules_failed', detail: '["school_days_min"]' }, 409, { reason: 'lasar_rules_failed', rules: ['school_days_min'] }],
    [{ code: '40001', hint: 'lasar_rules_failed', detail: '["hemlig_regel"]' }, 409, { reason: 'lasar_rules_failed' }],
    [{ code: '22023', hint: 'lasar_text_required' }, 400, { reason: 'lasar_text_required' }],
    [{ code: '22023', hint: 'lasar_payload_hash' }, 400, undefined],
    [{ code: '42501', hint: null }, 403, { reason: 'lasar_forbidden' }],
    [{ code: '40001', hint: 'lasar_secret_detail', message: 'Syntetisk hemlighet' }, 500, undefined],
    [{ code: 'XX000', hint: 'lasar_locked_status', message: 'Syntetisk hemlighet' }, 500, undefined],
  ];
  for (const [error, status, details] of cases) {
    reset('rektor'); state.sqlError = Object.assign(new Error(error.message ?? 'sql'), error); state.sqlErrorAt = 'lasar_read';
    const response = await post('lasa', { target, schoolYear: year, versionId: null });
    assert.equal(response.status, status, JSON.stringify(error));
    const body = await response.json();
    assert.deepEqual(body.details, details, JSON.stringify(error));
    assert.ok(!JSON.stringify(body).includes('hemlig') && !JSON.stringify(body).includes('XX000') && !JSON.stringify(body).includes('secret'));
  }
});

test('beslut kräver engångskod; kommando gör det inte', async () => {
  reset('rektor');
  const decision = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 1, action: 'submit', text: 'Syntetiskt förslag' });
  state.replies.lasar_command = wrap({ receipt: { commandId: decision.commandId, revision: 2, replayed: false }, detail: read({ cal: calendar({ status: 'forslag', revision: 2 }) }) });
  const noMfa = await post('beslut', decision);
  assert.equal(noMfa.status, 403); assert.equal((await noMfa.json()).code, 'mfa_required'); assert.deepEqual(state.calls, []);
  state.mfa = true;
  const ok = await post('beslut', decision);
  assert.equal(ok.status, 200); assert.equal((await ok.json()).detail.calendar.status, 'forslag');
  assert.equal(state.events.filter(e => e.outcome === 'ok')[0].action, 'lasar_decision');
  const routeSource = name => readFileSync(new URL(`../../app/api/lasar/${name}/route.ts`, import.meta.url), 'utf8');
  assert.match(routeSource('beslut'), /mfa: true/u); assert.doesNotMatch(routeSource('kommando'), /mfa/u); assert.doesNotMatch(routeSource('lasa'), /mfa/u);
});

test('kommandorutten tar inte beslut och beslutsrutten tar inte kommandon', async () => {
  reset('rektor'); state.mfa = true;
  const decision = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 1, action: 'submit', text: 'Syntetiskt förslag' });
  assert.equal((await post('kommando', decision)).status, 400);
  assert.equal((await post('beslut', await createRequest())).status, 400);
  assert.deepEqual(state.calls, []);
});

test('rutterna öppnas bara för huvudman, rektor och skoladministratör', async () => {
  for (const fn of ['larare', 'kundadmin', 'granskare']) {
    reset(fn); state.mfa = true;
    const attempts = [{ path: 'lasa', body: { target, schoolYear: year, versionId: null } }, { path: 'kommando', body: await createRequest() },
      { path: 'beslut', body: lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 1, action: 'submit', text: 'Syntetiskt förslag' }) }];
    for (const attempt of attempts) {
      const response = await post(attempt.path, attempt.body);
      assert.equal(response.status, 403, fn + ' ' + attempt.path); assert.deepEqual(state.calls, []);
    }
  }
  for (const name of ['lasa', 'kommando', 'beslut'])
    assert.match(readFileSync(new URL(`../../app/api/lasar/${name}/route.ts`, import.meta.url), 'utf8'), /functions: \['huvudman', 'rektor', 'administrator'\]/u);
});

test('främmande ursprung nekas för kommandon och läsning', async () => {
  reset('rektor');
  assert.equal((await post('kommando', await createRequest(), 'https://example.invalid')).status, 403);
  assert.equal((await post('lasa', { target, schoolYear: year, versionId: null }, 'https://example.invalid')).status, 403);
  assert.deepEqual(state.calls, []);
});

test('inga demofunktioner i lasar-vägen', () => {
  const words = ['sign' + 'InDemo', 'bootstrap_' + 'demo_profile'];
  for (const path of ['./lasar.ts', '../../app/api/lasar/lasa/route.ts', '../../app/api/lasar/kommando/route.ts', '../../app/api/lasar/beslut/route.ts', '../../app/lasar-planning-bar.tsx'])
    for (const word of words) assert.ok(!readFileSync(new URL(path, import.meta.url), 'utf8').includes(word), path);
});
