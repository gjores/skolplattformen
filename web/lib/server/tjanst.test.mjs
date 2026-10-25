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
  payload: { rowId: null, sourceKind: 'class_timplan', sourceKey, personId: person, teacherHt: 3000, teacherVt: 2400, comment: '', planningContext: { baseVersionId: uid(50), expectedBasisHash: hash('a'),
    choice: { kind: 'manual', personId: person, expectedPersonBasisHash: hash('b') } } } });
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
  const publish = await createPlanCommand({ commandId: uid(40), unitId: unit, schoolYear: year, action: 'publish', expectedRevision: 3, expectedContentHash: hash('c'), payload: { mutationContext: { baseVersionId: uid(50), expectedBasisHash: hash('a') } } });
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

// Uppgift 2: publicering, personal, egen väg och bemanning med MFA enligt D-23.
Object.assign(routes, {
  'plan/publicera': (await import('../../app/api/tjanst/plan/publicera/route.ts')).POST,
  'personal/lasa': (await import('../../app/api/tjanst/personal/lasa/route.ts')).POST,
  'personal/kommando': (await import('../../app/api/tjanst/personal/kommando/route.ts')).POST,
  'personal/status': (await import('../../app/api/tjanst/personal/status/route.ts')).POST,
  'egen/lasa': (await import('../../app/api/tjanst/egen/lasa/route.ts')).POST,
  'egen/kommando': (await import('../../app/api/tjanst/egen/kommando/route.ts')).POST,
  'egen/status': (await import('../../app/api/tjanst/egen/status/route.ts')).POST,
  'bemanning/lasa': (await import('../../app/api/tjanst/bemanning/lasa/route.ts')).POST,
});
const { personalCommandRef, selfCommandRef } = await import('../tjanst-contract.ts');

const published = version({ status: 'published', publishedByName: 'Syntetisk Rektor', publishedAt: '2026-08-20T08:00:00.000Z' });
const publishCommand = () => createPlanCommand({ commandId: uid(41), unitId: unit, schoolYear: year, action: 'publish', expectedRevision: 4, expectedContentHash: hash('c'), payload: { mutationContext: { baseVersionId: uid(50), expectedBasisHash: hash('a') } } });
const publishReply = () => wrap({ receipt: planReceipt({ commandId: uid(41), action: 'publish', revision: 5 }),
  detail: planRead({ revision: 5, version: published, versions: [published], actions: ['save_row', 'bulk'], capabilities: { canEdit: true, canPublish: false, canReadHistory: true } }) });

const draftPerson = { id: uid(21), givenName: 'Syntetisk', familyName: 'Utkast', externalId: null, externalIdSource: null, status: 'draft', proposedForUnitId: unit,
  draftNote: '', revision: 1, employments: [], duties: [] };
const unitPersonal = (extra = {}) => ({ contractVersion: 'tjanst_v1', scope: 'unit', unitId: unit, people: [draftPerson], actions: ['create_draft_teacher'], blockers: [],
  capabilities: { canManage: false, canCreateDraft: true }, ...extra });
const organizerPersonal = () => ({ contractVersion: 'tjanst_v1', scope: 'organizer', unitId: null, people: [{ ...draftPerson, account: false }],
  actions: ['create_person', 'update_person', 'save_employment', 'save_duties'], blockers: [], capabilities: { canManage: true, canCreateDraft: false } });
const draftTeacher = { commandId: uid(42), action: 'create_draft_teacher', expectedRevision: 0, payload: { unitId: unit, givenName: 'Syntetisk', familyName: 'Utkast', draftNote: '' } };
const createPerson = { commandId: uid(43), action: 'create_person', expectedRevision: 0, payload: { givenName: 'Syntetisk', familyName: 'Person', externalId: null, externalIdSource: null } };
const personalReceipt = (command, personId = uid(21)) => ({ commandId: command.commandId, action: command.action, personId, revision: 1, replayed: false });

const secret = 'Hemlig syntetisk kommentarstext om min tjänst';
const publication = (extra = {}) => ({ versionId: uid(70), versionNo: 1, unitId: unit, schoolName: 'Syntetiska gymnasiet', schoolYear: year,
  publishedAt: '2026-08-20T08:00:00.000Z', contentHash: hash('c'), rows: [{ id: uid(30), className: 'BA26A', rowKey, label: 'Bygg 1', ht: 3000, vt: 2400, joint: null }],
  specials: [], acknowledgedAt: null, comments: [], ...extra });
const selfView = (pubs = [publication()]) => ({ contractVersion: 'tjanst_v1', person: { id: person, displayName: 'Syntetisk Lärare' }, publications: pubs, capabilities: { canAck: true, canComment: true } });
const comment = { commandId: uid(44), versionId: uid(70), action: 'comment', body: secret };
const commentReply = () => wrap({ receipt: { commandId: uid(44), action: 'comment', versionId: uid(70), feedbackId: uid(71), replayed: false },
  detail: selfView([publication({ comments: [{ id: uid(71), body: secret, at: '2026-08-21T08:00:00.000Z' }] })]) });
const staffing = () => ({ contractVersion: 'tjanst_v1', schoolYear: year, units: [{ unitId: unit, schoolName: 'Syntetiska gymnasiet',
  published: { versionId: uid(70), versionNo: 1, publishedAt: '2026-08-20T08:00:00.000Z' },
  sums: { teaching: { ht: 3000, vt: 2400 }, special: { ht: 0, vt: 0 }, vacant: { ht: 0, vt: 0 }, unallocated: { ht: 0, vt: 600 }, unlinkedClasses: 0 } }], vacancies: [] });

function reset2(fn) {
  reset(fn);
  Object.assign(state.replies, {
    tjanst_personal_read: fn === 'rektor' ? unitPersonal() : organizerPersonal(),
    tjanst_personal_command: wrap({ receipt: personalReceipt(fn === 'rektor' ? draftTeacher : createPerson), detail: fn === 'rektor' ? unitPersonal() : organizerPersonal() }),
    tjanst_personal_status: wrap({ state: 'not_found', result: null }),
    tjanst_self_read: selfView(),
    tjanst_self_command: commentReply(),
    tjanst_self_status: wrap({ state: 'not_found', result: null }),
    tjanst_staffing_read: staffing(),
  });
}

test('publicera utan MFA ger 403 mfa_required; administratör och huvudman ger 403', async () => {
  reset2('rektor'); state.replies.tjanst_plan_command = publishReply();
  const noMfa = await post('plan/publicera', await publishCommand());
  assert.equal(noMfa.status, 403); assert.equal((await noMfa.json()).code, 'mfa_required');
  assert.equal(state.calls.length, 0);
  for (const fn of ['administrator', 'huvudman']) {
    reset2(fn); state.mfa = true; state.replies.tjanst_plan_command = publishReply();
    const response = await post('plan/publicera', await publishCommand());
    assert.equal(response.status, 403); assert.equal((await response.json()).code, 'forbidden');
    assert.equal(state.calls.length, 0);
  }
  // Rektor med engångskod publicerar via samma SQL-entrypoint som kommando.
  reset2('rektor'); state.mfa = true; state.replies.tjanst_plan_command = publishReply();
  const command = await publishCommand();
  const ok = await post('plan/publicera', command);
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).detail.version.status, 'published');
  assert.match(state.calls[0].sql, /select public\.tjanst_plan_command\(\?\) as result/u);
  assert.deepEqual(state.calls[0].values, [JSON.parse(JSON.stringify(command))]);
  assert.deepEqual(okEvents().map(e => [e.action, e.objectId]), [['tjanst_plan_published', uid(50)]]);
  // publicera tar bara publish.
  reset2('rektor'); state.mfa = true;
  assert.equal((await post('plan/publicera', await saveRow())).status, 400);
  assert.equal(state.calls.length, 0);
});

test('personal/kommando: huvudman utan MFA ger mfa_required; rektor create_draft_teacher utan MFA godkänns; rektor annan action ger 403 utan SQL', async () => {
  reset2('huvudman');
  const noMfa = await post('personal/kommando', createPerson);
  assert.equal(noMfa.status, 403); assert.equal((await noMfa.json()).code, 'mfa_required');
  assert.equal(state.calls.length, 0);
  reset2('huvudman'); state.mfa = true;
  const hm = await post('personal/kommando', createPerson);
  assert.equal(hm.status, 200);
  assert.match(state.calls[0].sql, /select public\.tjanst_personal_command\(\?\) as result/u);
  assert.deepEqual(state.calls[0].values, [createPerson]);
  reset2('rektor');
  const draft = await post('personal/kommando', draftTeacher);
  assert.equal(draft.status, 200);
  assert.equal((await draft.json()).receipt.action, 'create_draft_teacher');
  assert.deepEqual(okEvents().map(e => [e.action, e.objectId, e.details.unitId]), [['tjanst_personal_command', uid(21), unit]]);
  reset2('rektor'); state.mfa = true;
  const other = await post('personal/kommando', createPerson);
  assert.equal(other.status, 403); assert.equal((await other.json()).code, 'forbidden');
  assert.equal(state.calls.length, 0);
  for (const fn of ['administrator', 'larare']) { reset2(fn); state.mfa = true; assert.equal((await post('personal/kommando', draftTeacher)).status, 403); assert.equal(state.calls.length, 0); }
});

test('personal/lasa och status: rektor kräver skola och får aldrig huvudmannens vy', async () => {
  reset2('rektor');
  assert.equal((await post('personal/lasa', { unitId: unit })).status, 200);
  reset2('rektor');
  assert.equal((await post('personal/lasa', {})).status, 400);
  assert.equal(state.calls.length, 0);
  reset2('rektor'); state.replies.tjanst_personal_read = unitPersonal({ capabilities: { canManage: false, canCreateDraft: true }, actions: ['create_draft_teacher', 'save_duties'] });
  assert.equal((await post('personal/lasa', { unitId: unit })).status, 500);
  reset2('huvudman');
  assert.equal((await post('personal/lasa', {})).status, 200);
  reset2('rektor');
  assert.equal((await post('personal/status', { command: personalCommandRef(draftTeacher) })).status, 200);
  reset2('rektor');
  assert.equal((await post('personal/status', { command: personalCommandRef(createPerson) })).status, 403);
  assert.equal(state.calls.length, 0);
});

test('egen/lasa, kommando och status: bara larare, ingen MFA; nyckeln personId ger 400', async () => {
  reset2('larare');
  const read = await post('egen/lasa', {});
  assert.equal(read.status, 200);
  assert.deepEqual(state.calls[0].values, [{}]);
  reset2('larare');
  assert.equal((await post('egen/kommando', comment)).status, 200);
  assert.deepEqual(state.calls[0].values, [comment]);
  reset2('larare');
  assert.equal((await post('egen/status', { command: selfCommandRef(comment) })).status, 200);
  for (const [path, body] of [['egen/lasa', { personId: person }], ['egen/kommando', { ...comment, personId: person }],
    ['egen/status', { command: selfCommandRef(comment), personId: person }],
    ['egen/status', { command: { ...selfCommandRef(comment), target: { ...selfCommandRef(comment).target, personId: person } } }]]) {
    reset2('larare');
    const response = await post(path, body);
    assert.equal(response.status, 400, path);
    assert.equal(state.calls.length, 0, path);
  }
  for (const fn of ['rektor', 'huvudman', 'administrator']) {
    reset2(fn); state.mfa = true;
    assert.equal((await post('egen/lasa', {})).status, 403);
    assert.equal((await post('egen/kommando', comment)).status, 403);
    assert.equal(state.calls.length, 0);
  }
});

test('bemanning/lasa: bara huvudman', async () => {
  reset2('huvudman');
  const response = await post('bemanning/lasa', { schoolYear: year });
  assert.equal(response.status, 200);
  assert.match(state.calls[0].sql, /select public\.tjanst_staffing_read\(\?\) as result/u);
  assert.deepEqual(okEvents().map(e => [e.action, e.details.schoolYear]), [['tjanst_staffing_read', year]]);
  for (const fn of ['rektor', 'administrator', 'larare']) {
    reset2(fn); state.mfa = true;
    assert.equal((await post('bemanning/lasa', { schoolYear: year })).status, 403);
    assert.equal(state.calls.length, 0);
  }
});

test('55000 ger AuditUnavailable; svar med annan aktör än sessionen ger AuditUnavailable; okänd hint ger 500 utan innehåll', async () => {
  reset2('rektor'); state.sqlError = { code: '55000', message: 'private audit' };
  const audit = await post('plan/kommando', await saveRow());
  assert.equal(audit.status, 500); assert.equal((await audit.json()).code, 'audit_unavailable');
  for (const actor of [{ identityId: uid(99), assignmentId }, { identityId: id, assignmentId: uid(98) }]) {
    reset2('rektor'); state.replies.tjanst_plan_command = wrap({ receipt: planReceipt(), detail: planRead() }, actor);
    const foreign = await post('plan/kommando', await saveRow());
    assert.equal(foreign.status, 500);
    const body = await foreign.json();
    assert.equal(body.code, 'audit_unavailable'); assert.equal(body.detail, undefined); assert.equal(okEvents().length, 0);
  }
  reset2('larare'); state.replies.tjanst_self_command = { ...commentReply(), actor: { identityId: uid(99), assignmentId } };
  assert.equal((await post('egen/kommando', comment)).status, 500);
  for (const [code, hint] of [['40001', 'tjanst_private_scope'], ['22023', 'private_reason'], ['XX000', undefined]]) {
    reset2('rektor'); state.sqlError = { code, hint, message: 'private message', detail: 'private detail' };
    const response = await post('plan/kommando', await saveRow());
    assert.equal(response.status, 500);
    const text = await response.text();
    assert.ok(!text.includes('private') && !text.includes('tjanst_private_scope'));
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['code', 'correlationId']);
  }
  // Vitlistad 22023-hint når klienten som reason.
  reset2('larare'); state.sqlError = { code: '22023', hint: 'tjanst_comment_too_long', message: 'private' };
  const long = await post('egen/kommando', comment);
  assert.equal(long.status, 400); assert.equal((await long.json()).details.reason, 'tjanst_comment_too_long');
  // D-28 (05.1-26): samläsning med olika lärare når klienten som egen orsak.
  reset2('larare'); state.sqlError = { code: '22023', hint: 'tjanst_joint_teacher_mismatch', message: 'private' };
  const mixed = await post('egen/kommando', comment);
  assert.equal(mixed.status, 400); assert.equal((await mixed.json()).details.reason, 'tjanst_joint_teacher_mismatch');
});

test('security_events-detaljer för comment innehåller ingen kommentarstext', async () => {
  reset2('larare');
  const response = await post('egen/kommando', comment);
  assert.equal(response.status, 200);
  assert.equal(okEvents().length, 1);
  assert.deepEqual(okEvents()[0], { action: 'tjanst_self_command', objectType: 'tjanst_version', objectId: uid(70), outcome: 'ok', details: { accessFunction: 'larare' } });
  assert.ok(!JSON.stringify(state.events).includes('Hemlig'));
  // Även nekade och felande försök loggas utan text.
  reset2('larare'); state.sqlError = { code: '22023', hint: 'tjanst_comment_too_long', message: secret };
  await post('egen/kommando', comment);
  reset2('larare');
  await post('egen/kommando', { ...comment, body: `${secret} ${'x'.repeat(2001)}` });
  assert.ok(!JSON.stringify(state.events).includes('Hemlig'));
});

test('alla tolv tjanst-rutter finns', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(new URL('../../app/api/tjanst/', import.meta.url), { recursive: true })).filter(f => f.endsWith('route.ts'));
  assert.equal(files.length, 12);
});
