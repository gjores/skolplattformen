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
    const reply = state.replies[fn];
    return [{ result: structuredClone(typeof reply === 'function' ? reply(values[0]) : reply) }];
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
  status: (await import('../../app/api/lasar/status/route.ts')).POST,
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
  for (const path of ['./lasar.ts', '../../app/api/lasar/lasa/route.ts', '../../app/api/lasar/kommando/route.ts', '../../app/api/lasar/beslut/route.ts', '../../app/api/lasar/status/route.ts', '../../app/lasar-planning-bar.tsx'])
    for (const word of words) assert.ok(!readFileSync(new URL(path, import.meta.url), 'utf8').includes(word), path);
});

// ---------------------------------------------------------------- 05.1.1-07

test('återställ förslaget: servern läser skolformerna och skickar serverberäknat innehåll', async () => {
  reset('rektor');
  const request = await lasarCommandRequest({ target, schoolYear: year, versionId: version, expectedRevision: 3, ops: [{ op: 'reset_to_proposal' }] });
  state.replies.lasar_read = wrap(read({ cal: calendar({ revision: 3 }), capabilities: caps({ canEdit: true, canSubmit: true, canComment: true }) }));
  state.replies.lasar_command = wrap({ receipt: { commandId: request.commandId, revision: 4, replayed: false }, detail: read({ cal: calendar({ revision: 4 }), capabilities: caps({ canEdit: true, canSubmit: true, canComment: true }) }) });
  const response = await post('kommando', request);
  assert.equal(response.status, 200);
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_read', 'lasar_command']);
  assert.deepEqual(state.calls[0].values, [{ target, schoolYear: year, versionId: version }]);
  const p = proposeSchoolYear(year, unit, ['GR', 'GY']);
  assert.deepEqual(state.calls[1].values, [{ ...JSON.parse(JSON.stringify(request)), proposal: { terms: { ht: p.ht, vt: p.vt }, exceptions: p.exceptions } }]);
});

test('en tom kommentar nekas med lasar_text_required innan SQL anropas', async () => {
  reset('rektor');
  const ops = [{ op: 'comment', text: '' }];
  const { lasarPayloadHash } = await import('../lasar-contract.ts');
  const body = { commandId: uid(70), target, schoolYear: year, versionId: version, expectedRevision: 1, ops, payloadHash: await lasarPayloadHash(ops) };
  const response = await post('kommando', body);
  assert.equal(response.status, 400); assert.deepEqual((await response.json()).details, { reason: 'lasar_text_required' }); assert.deepEqual(state.calls, []);
});

const statusRequest = (over = {}) => ({ commandId: uid(71), target, schoolYear: year, ...over });
test('status: utfallet för ett journalfört kommando-id, rutt, SQL-anrop och händelse', async () => {
  reset('rektor');
  state.replies.lasar_status = wrap({ state: 'completed', result: { receipt: { commandId: uid(71), revision: 2, replayed: true }, detail: read({ cal: calendar({ revision: 2 }), capabilities: caps({ canEdit: true, canSubmit: true, canComment: true }) }) } });
  const response = await post('status', statusRequest());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.state, 'completed'); assert.equal(body.result.receipt.replayed, true); assert.equal(body.result.detail.calendar.revision, 2);
  assert.match(state.calls[0].sql, /select public\.lasar_status\(\?\) as result/u);
  assert.deepEqual(state.calls[0].values, [statusRequest()]);
  assert.deepEqual(state.events.filter(e => e.outcome === 'ok').map(e => [e.action, e.objectType, e.objectId, e.details.unitId, e.details.schoolYear]),
    [['lasar_status', 'school_year', version, unit, year]]);
});

test('status: okänt kommando-id ger not_found; ett svar för ett annat kommando eller en annan revision ger 500', async () => {
  reset('huvudman');
  state.replies.lasar_status = wrap({ state: 'not_found', result: null });
  const none = await post('status', statusRequest());
  assert.equal(none.status, 200); assert.deepEqual(await none.json(), { state: 'not_found', result: null });
  for (const result of [{ receipt: { commandId: uid(72), revision: 2, replayed: true }, detail: read({ cal: calendar({ revision: 2 }) }) },
    { receipt: { commandId: uid(71), revision: 3, replayed: true }, detail: read({ cal: calendar({ revision: 2 }) }) },
    { receipt: { commandId: uid(71), revision: 2, replayed: true }, detail: { ...read({ cal: calendar({ revision: 2 }) }), schoolYear: year + 1 } }]) {
    reset('huvudman', { lasar_status: wrap({ state: 'completed', result }) });
    assert.equal((await post('status', statusRequest())).status, 500);
  }
  reset('huvudman', { lasar_status: wrap({ state: 'not_found', result: null }, { identityId: uid(90), assignmentId }) });
  assert.equal((await post('status', statusRequest())).status, 500);
});

test('status: strikt begäran, samma ursprung, ingen engångskod och bara kalenderns tre funktioner', async () => {
  reset('rektor');
  assert.equal((await post('status', statusRequest({ extra: 1 }))).status, 400);
  assert.equal((await post('status', { target, schoolYear: year })).status, 400);
  assert.equal((await post('status', statusRequest(), 'https://example.invalid')).status, 403);
  assert.deepEqual(state.calls, []);
  for (const fn of ['larare', 'kundadmin']) { reset(fn); assert.equal((await post('status', statusRequest())).status, 403); assert.deepEqual(state.calls, []); }
  const source = readFileSync(new URL('../../app/api/lasar/status/route.ts', import.meta.url), 'utf8');
  assert.match(source, /protectedRoute\(request, 'lasar_status', \{ mutating: false, audit: 'required', functions: \['huvudman', 'rektor', 'administrator'\] \}/u);
  assert.match(source, /requireSameOrigin\(request\)/u); assert.doesNotMatch(source, /mfa/u);
});

test('SQL godkänner men modellen hittar ett fel: 409 lasar_rules_failed utan delresultat (RESEARCH A8)', async () => {
  const decided = { status: 'faststalld', revision: 3, decidedOn: '2027-05-01' };
  for (const [fn, action, over] of [['huvudman', 'approve', decided], ['rektor', 'submit', { status: 'forslag', revision: 3 }]]) {
    reset(fn); state.mfa = true;
    const decision = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 2, action, text: 'Syntetisk text' });
    const bad = calendar({ ...over, terms: { ht: { start: '2027-08-16', end: '2027-12-17' }, vt: { start: '2028-01-10', end: '2028-07-03' } } });
    state.replies.lasar_command = wrap({ receipt: { commandId: decision.commandId, revision: 3, replayed: false }, detail: read({ cal: bad }) });
    const response = await post('beslut', decision);
    assert.equal(response.status, 409, action);
    const body = await response.json();
    assert.equal(body.details.reason, 'lasar_rules_failed'); assert.ok(body.details.rules.includes('term_end_june'), JSON.stringify(body.details));
    assert.equal(body.detail, undefined); assert.ok(!JSON.stringify(body).includes('Syntetisk skola'));
    assert.deepEqual(state.events.filter(e => e.outcome === 'ok'), []);
  }
  // Samma beslut med innehåll utan fel (bara varningar) går igenom.
  reset('huvudman'); state.mfa = true;
  const ok = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 2, action: 'approve', text: 'Syntetisk text' });
  state.replies.lasar_command = wrap({ receipt: { commandId: ok.commandId, revision: 3, replayed: false }, detail: read({ cal: calendar(decided) }) });
  assert.equal((await post('beslut', ok)).status, 200);
});

test('modellkontrollen tar med grupperna ur läsningen: en kort vecka för åk 3 ger 409 short_week_column (05.1.1-08)', async () => {
  const offeringId = uid(10), group = `arskurs:${offeringId}:ak3`;
  const groups = [{ scope: 'arskurs', offeringId, columnId: 'ak3', label: 'Åk 3', educationName: 'Syntetisk GR', kind: 'grundskola' }];
  reset('rektor'); state.mfa = true;
  const decision = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 2, action: 'submit', text: 'Syntetisk text' });
  const cal = calendar({ status: 'forslag', revision: 3, shortWeeks: { [group]: { weekday: 4, reason: 'Syntetiska skäl', columnId: 'ak3' } } });
  state.replies.lasar_command = wrap({ receipt: { commandId: decision.commandId, revision: 3, replayed: false }, detail: { ...read({ cal }), groups } });
  const response = await post('beslut', decision);
  assert.equal(response.status, 409);
  const body = await response.json();
  assert.equal(body.details.reason, 'lasar_rules_failed'); assert.deepEqual(body.details.rules, ['short_week_column']);
  assert.deepEqual(state.events.filter(e => e.outcome === 'ok'), []);
  // Samma kalender utan grupper i läsningen prövas bara på skolnivå och går igenom (gruppen finns inte för modellen).
  reset('rektor'); state.mfa = true;
  const ok = lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 2, action: 'submit', text: 'Syntetisk text' });
  state.replies.lasar_command = wrap({ receipt: { commandId: ok.commandId, revision: 3, replayed: false }, detail: read({ cal }) });
  assert.equal((await post('beslut', ok)).status, 200);
});

test('serveradaptern bygger inga grupper själv: grupperna kommer ur läsningen via groupsFromRefs', () => {
  const source = readFileSync(new URL('./lasar.ts', import.meta.url), 'utf8');
  assert.match(source, /groupsFromRefs\(detail\.groups\)/u);
  assert.doesNotMatch(source, /studentGroups|klass:\$\{|programPrefix/u);
});

// ---------------------------------------------------------------- 05.1.1-09

const request = (over = {}) => ({ id: uid(80), status: 'open', reason: 'Syntetisk orsak', answer: null, requestedAt: '2027-10-01T08:00:00.000Z', answeredAt: null, ...over });
const decided = (over = {}) => calendar({ status: 'faststalld', revision: 6, decidedOn: '2027-06-01', ...over });
const replyWith = (decision, { cal, changeRequest = null, capabilities = caps(), versions } = {}) => {
  const detail = { ...read({ cal, capabilities }), changeRequest };
  if (versions) detail.versions = versions;
  return wrap({ receipt: { commandId: decision.commandId, revision: cal.revision, replayed: false }, detail });
};
const ask = (action, text, over = {}) => lasarDecisionRequest({ target, schoolYear: year, versionId: version, expectedRevision: 5, action, text, ...over });

test('ändringsbegäran: rektor begär ändring på beslutsrutten med engångskod; svaret har en öppen begäran på samma version', async () => {
  reset('rektor');
  const decision = ask('request_change', 'Syntetisk orsak');
  state.replies.lasar_command = replyWith(decision, { cal: decided(), changeRequest: request(), capabilities: caps({ canWithdrawRequest: true, canComment: true }) });
  const noMfa = await post('beslut', decision);
  assert.equal(noMfa.status, 403); assert.deepEqual(state.calls, []);
  state.mfa = true;
  const ok = await post('beslut', decision);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.detail.changeRequest.status, 'open'); assert.equal(body.detail.calendar.versionId, version);
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_command']);
  assert.equal(state.events.filter(e => e.outcome === 'ok')[0].action, 'lasar_decision');
});

test('ändringsbegäran: begäran och avslag utan text nekas med lasar_text_required innan SQL anropas; återtagande kräver ingen text', async () => {
  for (const [fn, action] of [['rektor', 'request_change'], ['huvudman', 'decline_request'], ['huvudman', 'reopen']]) {
    reset(fn); state.mfa = true;
    const body = { ...ask(action, 'x'), text: '' };
    const response = await post('beslut', body);
    assert.equal(response.status, 400, action); assert.deepEqual((await response.json()).details, { reason: 'lasar_text_required' }); assert.deepEqual(state.calls, []);
  }
  reset('rektor'); state.mfa = true;
  const withdraw = ask('withdraw_request', '');
  state.replies.lasar_command = replyWith(withdraw, { cal: decided(), changeRequest: request({ status: 'withdrawn', answeredAt: '2027-10-02T08:00:00.000Z' }), capabilities: caps({ canRequestChange: true, canComment: true }) });
  assert.equal((await post('beslut', withdraw)).status, 200);
});

test('ändringsbegäran: huvudmannen avslår med motivering; svaret ska ha den avslagna begäran med samma motivering', async () => {
  reset('huvudman'); state.mfa = true;
  const decision = ask('decline_request', 'Syntetisk motivering');
  state.replies.lasar_command = replyWith(decision, { cal: decided(), changeRequest: request({ status: 'declined', answer: 'Syntetisk motivering', answeredAt: '2027-10-02T08:00:00.000Z' }), capabilities: caps({ canReopen: true, canComment: true }) });
  assert.equal((await post('beslut', decision)).status, 200);
  // Ett svar där begäran fortfarande är öppen, eller har en annan motivering, stämmer inte med beslutet: 500 utan innehåll.
  for (const changeRequest of [request(), request({ status: 'declined', answer: 'Annan motivering', answeredAt: '2027-10-02T08:00:00.000Z' }), null]) {
    reset('huvudman'); state.mfa = true;
    const again = ask('decline_request', 'Syntetisk motivering');
    state.replies.lasar_command = replyWith(again, { cal: decided(), changeRequest, capabilities: caps({ canReopen: true, canComment: true }) });
    const response = await post('beslut', again);
    assert.equal(response.status, 500, JSON.stringify(changeRequest)); assert.ok(!JSON.stringify(await response.json()).includes('Syntetisk'));
  }
});

test('ändringsbegäran: svaret efter begäran och återtagande ska bära beslutets status', async () => {
  for (const [action, text, changeRequest] of [['request_change', 'Syntetisk orsak', null], ['request_change', 'Syntetisk orsak', request({ status: 'withdrawn', answeredAt: '2027-10-02T08:00:00.000Z' })],
    ['withdraw_request', '', request()]]) {
    reset('rektor'); state.mfa = true;
    const decision = ask(action, text);
    state.replies.lasar_command = replyWith(decision, { cal: decided(), changeRequest, capabilities: caps({ canComment: true }) });
    assert.equal((await post('beslut', decision)).status, 500, JSON.stringify([action, changeRequest]));
  }
});

test('öppna för ändring: huvudmannen får en ny version som utkast; den tidigare versionen gäller fortsatt', async () => {
  const next = uid(6);
  const versions = [{ versionId: version, version: 1, status: 'faststalld', decidedOn: '2027-06-01', current: true },
    { versionId: next, version: 2, status: 'utkast', decidedOn: null, current: false }];
  reset('huvudman'); state.mfa = true;
  const decision = ask('reopen', 'Syntetiskt skäl');
  state.replies.lasar_command = replyWith(decision, { cal: calendar({ versionId: next, version: 2, revision: 1 }), changeRequest: request({ status: 'accepted', answer: 'Syntetiskt skäl', answeredAt: '2027-10-02T08:00:00.000Z' }),
    capabilities: caps({ canComment: true }), versions });
  const ok = await post('beslut', decision);
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.detail.calendar.versionId, next); assert.equal(body.detail.calendar.status, 'utkast');
  // Samma version, en fastställd version, en ny version utan den gällande eller en begäran som är öppen kvar ger 500.
  for (const [cal, list, changeRequest] of [
    [calendar({ revision: 1 }), [versions[0]], null],
    [calendar({ versionId: next, version: 2, revision: 1, status: 'faststalld', decidedOn: '2027-10-02' }), [{ ...versions[0], current: false }, { ...versions[1], status: 'faststalld', decidedOn: '2027-10-02', current: true }], null],
    [calendar({ versionId: next, version: 2, revision: 1 }), [{ ...versions[0], current: false }, versions[1]], null],
    [calendar({ versionId: next, version: 2, revision: 1 }), versions, request()],
  ]) {
    reset('huvudman'); state.mfa = true;
    const again = ask('reopen', 'Syntetiskt skäl');
    state.replies.lasar_command = replyWith(again, { cal, changeRequest, capabilities: caps({ canComment: true }), versions: list });
    assert.equal((await post('beslut', again)).status, 500, JSON.stringify(cal.status) + JSON.stringify(list.map(v => v.current)));
  }
});

test('låsta passerade dagar: SQL:s lasar_past_day når klienten som 409 med orsaken', async () => {
  reset('rektor'); state.sqlError = Object.assign(new Error('sql'), { code: '40001', hint: 'lasar_past_day' }); state.sqlErrorAt = 'lasar_command';
  const { lasarPayloadHash } = await import('../lasar-contract.ts');
  const ops = [{ op: 'set_days', dates: ['2027-09-01'], kind: 'lovdag' }];
  const response = await post('kommando', { commandId: uid(81), target, schoolYear: year, versionId: version, expectedRevision: 2, ops, payloadHash: await lasarPayloadHash(ops) });
  assert.equal(response.status, 409); assert.deepEqual((await response.json()).details, { reason: 'lasar_past_day' });
});

test('förmågor för ändringsflödet följer funktionen: skolan öppnar och avslår inte, huvudmannen begär och tar inte tillbaka', async () => {
  for (const over of [{ canReopen: true }, { canDecline: true }]) {
    reset('rektor', { lasar_read: wrap(read({ cal: decided(), capabilities: caps(over) })) });
    assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 500, JSON.stringify(over));
  }
  for (const over of [{ canRequestChange: true }, { canWithdrawRequest: true }]) {
    reset('huvudman', { lasar_read: wrap(read({ cal: decided(), capabilities: caps(over) })) });
    assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 500, JSON.stringify(over));
  }
  reset('rektor', { lasar_read: wrap({ ...read({ cal: decided(), capabilities: caps({ canRequestChange: true, canComment: true }) }), editableFrom: '2027-10-15' }) });
  const ok = await post('lasa', { target, schoolYear: year, versionId: null });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).editableFrom, '2027-10-15');
});

// 05.1.1-10: huvudmannens ram och arbetssättet. Målet ramen ({ kind: 'frame' }) går oförändrat till SQL; bara huvudmannen får
// ett svar för ramen, och rektor eller skoladministratör får det aldrig, även om SQL skulle svara (D-08, T-05.1.1-31).
const frameTarget = { kind: 'frame' };
const frameVersion = uid(7);
const frameProposal = () => proposeSchoolYear(year, 'ram', ['GR', 'GY']);
const frameCalendar = (over = {}) => { const p = frameProposal(); return calendar({ versionId: frameVersion, terms: { ht: p.ht, vt: p.vt }, exceptions: p.exceptions, ...over }); };
function frameRead({ cal = null, capabilities = caps({ canSetMode: true }), mode = 'ram' } = {}) {
  return { ...read({ cal, capabilities }), target: frameTarget, schoolName: 'Huvudmannens ram', mode };
}

test('ramen: huvudmannen läser ramens mål; målet går oförändrat till SQL och händelsen gäller ramen', async () => {
  reset('huvudman', { lasar_read: wrap(frameRead({ capabilities: caps({ canCreate: ['proposal'], canSetMode: true }) })) });
  const response = await post('lasa', { target: frameTarget, schoolYear: year, versionId: null });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.target, frameTarget); assert.equal(body.mode, 'ram');
  assert.deepEqual(state.calls[0].values, [{ target: frameTarget, schoolYear: year, versionId: null }]);
  const event = state.events.filter(e => e.outcome === 'ok')[0];
  assert.equal(event.action, 'lasar_read'); assert.equal(event.objectType, 'school_year_frame');
});

test('ramen: rektor och skoladministratör får aldrig ramens mål, varken när SQL nekar eller om SQL skulle svara', async () => {
  for (const fn of ['rektor', 'administrator']) {
    reset(fn, { lasar_read: wrap(frameRead({ capabilities: caps() })) });
    const response = await post('lasa', { target: frameTarget, schoolYear: year, versionId: null });
    assert.equal(response.status, 500, fn);
    assert.ok(!JSON.stringify(await response.json()).includes('Huvudmannens ram'));
    reset(fn); state.sqlError = Object.assign(new Error('sql'), { code: '42501' }); state.sqlErrorAt = 'lasar_read';
    const denied = await post('lasa', { target: frameTarget, schoolYear: year, versionId: null });
    assert.equal(denied.status, 403); assert.deepEqual((await denied.json()).details, { reason: 'lasar_forbidden' });
  }
  // En skolläsning med ram och arbetssätt är tillåten för rektor; förmågorna för ramen är det inte.
  reset('rektor', { lasar_read: wrap({ ...read({ capabilities: caps({ canCreate: ['frame'] }) }), mode: 'ram', frame: { current: null, latest: null, acknowledgedVersionId: null } }) });
  assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 200);
  reset('rektor', { lasar_read: wrap(read({ capabilities: caps({ canPublishFrame: true }) })) });
  assert.equal((await post('lasa', { target, schoolYear: year, versionId: null })).status, 500);
});

test('ramen: huvudmannen skapar ramutkast; servern läser huvudmannens skolformer och skickar serverberäknat förslag', async () => {
  reset('huvudman', { lasar_read: wrap(frameRead({ capabilities: caps({ canCreate: ['proposal'], canSetMode: true }) })) });
  const request = await lasarCommandRequest({ target: frameTarget, schoolYear: year, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'proposal' }] });
  state.replies.lasar_command = wrap({ receipt: { commandId: request.commandId, revision: 1, replayed: false },
    detail: frameRead({ cal: frameCalendar(), capabilities: caps({ canEdit: true, canPublishFrame: true, canSetMode: true }) }) });
  const response = await post('kommando', request);
  assert.equal(response.status, 200);
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_read', 'lasar_command']);
  assert.deepEqual(state.calls[0].values, [{ target: frameTarget, schoolYear: year, versionId: null }]);
  const p = frameProposal();
  assert.deepEqual(state.calls[1].values, [{ ...JSON.parse(JSON.stringify(request)), proposal: { terms: { ht: p.ht, vt: p.vt }, exceptions: p.exceptions } }]);
  assert.equal(state.events.filter(e => e.outcome === 'ok')[0].objectType, 'school_year_frame');
});

test('ramen: skolans start ur ramen och en ny ramversion skickar inget förslagsinnehåll', async () => {
  for (const [fn, t, reply] of [['rektor', target, read({ cal: calendar({ frameVersionId: frameVersion }), capabilities: caps({ canEdit: true, canSubmit: true }) })],
    ['huvudman', frameTarget, frameRead({ cal: frameCalendar({ version: 2 }), capabilities: caps({ canEdit: true, canPublishFrame: true, canSetMode: true }) })]]) {
    reset(fn);
    const request = await lasarCommandRequest({ target: t, schoolYear: year, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'frame' }] });
    state.replies.lasar_command = wrap({ receipt: { commandId: request.commandId, revision: 1, replayed: false }, detail: reply });
    const response = await post('kommando', request);
    assert.equal(response.status, 200, fn);
    assert.deepEqual(state.calls.map(c => c.fn), ['lasar_command']);
    assert.ok(!('proposal' in state.calls[0].values[0]));
  }
});

test('arbetssätt: förhandsvisningen går genom beslutsrutten med engångskod och ger skollistan', async () => {
  reset('huvudman');
  const decision = lasarDecisionRequest({ target: frameTarget, schoolYear: year, versionId: null, expectedRevision: null, action: 'preview_mode_change', text: '', mode: 'ram' });
  const preview = { contractVersion: 'lasar_sql_v1', schoolYear: year, mode: 'ram', affected: [{ unitId: unit, schoolName: 'Syntetisk skola A', status: 'utkast' }] };
  state.replies.lasar_command = wrap(preview);
  assert.equal((await post('beslut', decision)).status, 403);
  state.mfa = true;
  const ok = await post('beslut', decision);
  assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), preview);
  // Fel läsår, fel arbetssätt eller ett annat kuvert ger 500 utan innehåll.
  for (const bad of [{ ...preview, schoolYear: year + 1 }, { ...preview, mode: 'eget' }, { receipt: { commandId: decision.commandId, revision: 1, replayed: false }, detail: frameRead() }]) {
    reset('huvudman'); state.mfa = true; state.replies.lasar_command = wrap(bad);
    assert.equal((await post('beslut', decision)).status, 500, JSON.stringify(bad).slice(0, 80));
  }
});

test('arbetssätt: svaret efter set_mode ska bära det valda arbetssättet på ramens mål', async () => {
  for (const [mode, status] of [['ram', 200], ['eget', 500]]) {
    reset('huvudman'); state.mfa = true;
    const decision = lasarDecisionRequest({ target: frameTarget, schoolYear: year, versionId: null, expectedRevision: null, action: 'set_mode', text: '', mode: 'ram', confirmAffected: [unit] });
    state.replies.lasar_command = wrap({ receipt: { commandId: decision.commandId, revision: 1, replayed: false }, detail: frameRead({ mode }) });
    assert.equal((await post('beslut', decision)).status, status, mode);
  }
});

test('ge ut ramen: svaret ska visa samma version som utgiven, och modellen prövar ramens innehåll', async () => {
  const ask = () => lasarDecisionRequest({ target: frameTarget, schoolYear: year, versionId: frameVersion, expectedRevision: 3, action: 'publish_frame', text: '' });
  const published = frameCalendar({ status: 'faststalld', decidedOn: '2026-11-11', revision: 4 });
  // Sex studiedagar bryter mot högst fem (study_days_max): SQL har godkänt, men modellen nekar och inget delresultat lämnar servern.
  const { addDays, dayInfo } = await import('../lasar-model.ts'), sy = frameProposal(), study = { ...published.exceptions };
  for (let d = '2027-09-01', n = 0; n < 6; d = addDays(d, 1)) if (dayInfo(sy, d).status === 'skoldag') { study[d] = { kind: 'studiedag', note: 'Syntetisk' }; n += 1; }
  for (const [cal, status] of [[published, 200], [frameCalendar({ revision: 4 }), 500], [{ ...published, exceptions: study }, 409]]) {
    reset('huvudman'); state.mfa = true;
    const decision = ask();
    state.replies.lasar_command = wrap({ receipt: { commandId: decision.commandId, revision: 4, replayed: false }, detail: frameRead({ cal, capabilities: caps({ canCreate: [], canSetMode: true }) }) });
    const response = await post('beslut', decision);
    assert.equal(response.status, status, cal.status + Object.keys(cal.exceptions).length);
    if (status === 409) {
      const details = (await response.json()).details;
      assert.equal(details.reason, 'lasar_rules_failed'); assert.ok(details.rules.includes('study_days_max'), String(details.rules));
    }
  }
});

// 05.1.1-11 (D-04, T-05.1.1-35): Kopiera förra läsåret. Klienten skickar bara källan copy. Servern läser själv förra årets gällande
// fastställda version (eller senast utgivna ram) och målårets grupper, räknar kopian med copySchoolYear och skickar innehållet,
// källversionen och granskningsposterna till SQL, som prövar källan igen.
const { copySchoolYear } = await import('../lasar-copy.ts');
const { lasarSchoolYear } = await import('../lasar-contract.ts');
const previous = uid(8), previousOpen = uid(9);
const prevCalendar = (over = {}) => { const p = proposeSchoolYear(year - 1, unit, ['GR', 'GY']);
  return calendar({ versionId: previous, status: 'faststalld', decidedOn: '2026-06-01', revision: 3, terms: { ht: p.ht, vt: p.vt },
    exceptions: { ...p.exceptions, '2026-12-28': { kind: 'lovdag', note: 'Mellandag' } }, ...over }); };
const readFor = (reply, { prevFirst = null, prev = null }) => q => {
  if (q.schoolYear === year) return wrap(reply);
  if (q.schoolYear === year - 1 && q.versionId === null) return wrap(prevFirst ?? prev);
  if (q.schoolYear === year - 1 && q.versionId === previous) return wrap(prev);
  throw new Error('Unexpected synthetic read');
};
const withVersions = (r, versions) => ({ ...r, schoolYear: year - 1, versions });
const copyRequest = t => lasarCommandRequest({ target: t, schoolYear: year, versionId: null, expectedRevision: null, ops: [{ op: 'create', source: 'copy' }] });
function expectedCopy(prevRead, targetRead) {
  const { draft, review } = copySchoolYear(lasarSchoolYear(prevRead), year, []);
  assert.equal(targetRead.groups.length, 0);
  return { sourceVersionId: prevRead.calendar.versionId, terms: { ht: draft.ht, vt: draft.vt }, exceptions: draft.exceptions, groupDays: draft.groupExceptions, review };
}

test('kopiering: servern läser förra årets gällande version och målåret själv och skickar copySchoolYear-innehållet till lasar_command', async () => {
  reset('rektor');
  const targetRead = { ...read({ capabilities: caps({ canCreate: ['proposal', 'copy'] }) }), previousYearAvailable: true };
  const prevRead = withVersions(read({ cal: prevCalendar() }), [{ versionId: previous, version: 1, status: 'faststalld', decidedOn: '2026-06-01', current: true }]);
  state.replies.lasar_read = readFor(targetRead, { prev: prevRead });
  const request = await copyRequest(target);
  state.replies.lasar_command = created(request.commandId);
  const response = await post('kommando', request);
  assert.equal(response.status, 200);
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_read', 'lasar_read', 'lasar_command']);
  assert.deepEqual(state.calls.map(c => c.values[0].schoolYear).slice(0, 2), [year, year - 1]);
  const sent = state.calls[2].values[0], copy = expectedCopy(prevRead, targetRead);
  assert.deepEqual(sent, { ...JSON.parse(JSON.stringify(request)), copy: JSON.parse(JSON.stringify(copy)) });
  assert.ok(copy.review.some(i => i.reason === 'missing_week' && i.sourceDate === '2026-12-28'));
  assert.ok(copy.review.some(i => i.reason === 'easter'));
  assert.equal(sent.copy.exceptions['2027-12-27'], undefined);
});

test('kopiering: när förra året har en öppen version läser servern om den gällande versionen och kopierar den', async () => {
  reset('rektor');
  const targetRead = { ...read({ capabilities: caps({ canCreate: ['proposal', 'copy'] }) }), previousYearAvailable: true };
  const versions = [{ versionId: previous, version: 1, status: 'faststalld', decidedOn: '2026-06-01', current: true },
    { versionId: previousOpen, version: 2, status: 'utkast', decidedOn: null, current: false }];
  const open = withVersions(read({ cal: prevCalendar({ versionId: previousOpen, version: 2, status: 'utkast', decidedOn: null, exceptions: {} }) }), versions);
  const prevRead = withVersions(read({ cal: prevCalendar() }), versions);
  state.replies.lasar_read = readFor(targetRead, { prevFirst: open, prev: prevRead });
  const request = await copyRequest(target);
  state.replies.lasar_command = created(request.commandId);
  assert.equal((await post('kommando', request)).status, 200);
  assert.deepEqual(state.calls.map(c => [c.fn, c.values[0].schoolYear, c.values[0].versionId ?? null]),
    [['lasar_read', year, null], ['lasar_read', year - 1, null], ['lasar_read', year - 1, previous], ['lasar_command', year, null]]);
  assert.equal(state.calls[3].values[0].copy.sourceVersionId, previous);
  assert.deepEqual(state.calls[3].values[0].copy, JSON.parse(JSON.stringify(expectedCopy(prevRead, targetRead))));
});

test('kopiering utan gällande version förra året ger 409 lasar_not_found och inget lasar_command', async () => {
  reset('rektor');
  const targetRead = read({ capabilities: caps({ canCreate: ['proposal', 'copy'] }) });
  state.replies.lasar_read = readFor(targetRead, { prev: withVersions(read(), []) });
  const response = await post('kommando', await copyRequest(target));
  assert.equal(response.status, 409); assert.deepEqual((await response.json()).details, { reason: 'lasar_not_found' });
  assert.ok(!state.calls.some(c => c.fn === 'lasar_command'));
});

test('klienten kan inte skicka eget kopieinnehåll eller ange källversionen', async () => {
  reset('rektor');
  const request = await copyRequest(target);
  for (const extra of [{ copy: { sourceVersionId: previous } }, { sourceVersionId: previous }]) {
    const response = await post('kommando', { ...request, ...extra });
    assert.equal(response.status, 400);
  }
  assert.deepEqual(state.calls, []);
});

test('kopiering av ramen: huvudmannen kopierar förra årets utgivna ram; servern läser den utgivna versionen', async () => {
  reset('huvudman');
  const targetRead = { ...frameRead({ capabilities: caps({ canCreate: ['proposal', 'copy'], canSetMode: true }) }), previousYearAvailable: true };
  const prevRead = withVersions(frameRead({ cal: prevCalendar({ versionId: previous }) }), [{ versionId: previous, version: 1, status: 'faststalld', decidedOn: '2026-06-01', current: true }]);
  state.replies.lasar_read = readFor(targetRead, { prev: prevRead });
  const request = await copyRequest(frameTarget);
  state.replies.lasar_command = wrap({ receipt: { commandId: request.commandId, revision: 1, replayed: false },
    detail: frameRead({ cal: frameCalendar(), capabilities: caps({ canEdit: true, canPublishFrame: true, canSetMode: true }) }) });
  assert.equal((await post('kommando', request)).status, 200);
  assert.deepEqual(state.calls.map(c => c.fn), ['lasar_read', 'lasar_read', 'lasar_command']);
  assert.deepEqual(state.calls[1].values[0], { target: frameTarget, schoolYear: year - 1, versionId: null });
  assert.equal(state.calls[2].values[0].copy.sourceVersionId, previous);
  assert.deepEqual(state.calls[2].values[0].copy.groupDays, {});
});
