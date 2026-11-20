// Actual protectedRoute handlers. Session and SQL are simulated; SP-02 and SP-06 exercise real storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import test from 'node:test';
import {
  parseStudyPlanCommand, parseStudyPlanCommandReply, parseStudyPlanReadReply, parseStudyPlanReadRequest,
  parseStudyPlanStatusReply, STUDY_PLAN_CONTRACT_VERSION,
} from './study-plan-contract.ts';

const id = n => `05300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [identityId, assignmentId, membershipId, sessionId, customerId, organizerId] = [1, 2, 3, 4, 5, 6].map(id);
const pupilId = id(12), unitId = id(13), placementId = id(14), offeringId = id(15), planId = id(17);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
const origin = 'http://localhost';
const on = '2026-11-20';
const token = `sha256:${'a'.repeat(64)}`;
const catalog = JSON.parse(await readFile(new URL('./programplan-catalog.generated.json', import.meta.url)));
const scope = { unitId, pupilId, placementId, contractVersion: STUDY_PLAN_CONTRACT_VERSION };
const { catalogId } = catalog;
const studyPath = { regime: 'national_gy25', programCode: 'SA25', orientationCode: 'SABEP', apprenticeship: null, specialVariantCode: null };
const source = { offeringId, placementStartsOn: '2026-08-17', placementEndsOn: null, catalogId, programVersion: 4, choices: [] };
const createBasis = () => ({
  path: { ...studyPath }, source: structuredClone(source), token, startedOn: '2026-08-17', offeringRevision: 0,
  programPlan: null, choices: [], calendar: [],
});
const baseContent = () => ({
  path: { ...studyPath, apprenticeship: false }, source: structuredClone(source),
  levels: [
    { id: id(18), kind: 'gy25_level', subjectCode: 'ENGE', subjectVersion: 1, itemCode: 'ENGE1000X',
      languageCode: null, label: 'Engelska, nivå 1', points: 100, attempts: [{
        id: id(19), plannedStart: { kind: 'term', schoolYear: 2028, term: 'HT' }, plannedEnd: { kind: 'term', schoolYear: 2028, term: 'VT' },
        actual: { certainty: 'recorded', start: null, end: null },
      }] },
    { id: id(20), kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: 'GYARSA25', languageCode: null,
      label: 'Gymnasiearbete', points: 100, attempts: [{ id: id(21), plannedStart: null, plannedEnd: null, actual: { certainty: 'recorded', start: null, end: null } }] },
  ],
  decisions: [], choices: [], sourceIssues: [], dialogue: null, compulsorySchoolSubjects: [],
  distanceTeaching: { kind: 'none', minutes: null },
});
const revision = (number, content = baseContent(), current = false, effectiveOn = '2026-11-14') => ({
  revision: number, planId, state: current ? 'current' : 'draft', effectiveOn: current ? effectiveOn : null,
  recordedAt: '2026-11-19T12:10:11.000000Z', content,
});
const metadata = ({ content: _content, ...rest }) => rest;
const currentRequest = (extra = {}) => ({ ...scope, view: 'current', on, ...extra });
const historyRequest = (extra = {}) => ({ ...scope, view: 'history', on, ...extra });
const statusRequest = (commandId = id(22)) => ({ ...scope, commandId });
const command = (action, payload, expectedRevision = 0, commandId = id(22)) => ({
  ...scope, expectedRevision, commandId, expectedSourceToken: token, action, payload,
});
const prepare = (distanceTeaching = { kind: 'applies', minutes: null }, expectedRevision = 0) =>
  command('prepare_draft', { dates: [], distanceTeaching, compulsorySchoolSubjects: [], apprenticeship: false }, expectedRevision);
const publish = (expectedRevision = 2) => command('make_current', { effectiveOn: '2026-11-14' }, expectedRevision, id(23));
const actual = () => command('record_actual', { levelId: id(18), attemptId: id(19),
  event: { kind: 'started', on: '2026-11-12', source: { kind: 'school_record', id: id(28) } } }, 3);
const decide = () => command('record_decision', { decision: {
  id: id(25), kind: 'reduced', reference: { kind: 'action_programme_decision', id: id(26) },
  decidedOn: '2026-11-18', effectiveOn: '2026-11-20', endsOn: null, scopePoints: 100,
  levelIds: [id(18)], replacementLevelIds: [],
} }, 3);
const wrap = (result, extra = {}) => ({
  contractVersion: 'individual_study_plan_sql_v1', actor: { identityId, assignmentId }, result, ...extra,
});
const readWrap = (result, basis = null, latest = null) => wrap(result, { basis, latest });
const currentReply = (request, { current = null, draft = null, basis = createBasis(), latest = draft ?? current,
  history = [current, draft].filter(Boolean).map(metadata), extra = {} } = {}) => readWrap({
  ...request, current, draft, latestRevision: latest?.revision ?? 0, history, canMakeCurrent: state.fn === 'rektor',
  sourceToken: basis.token, basisStatus: 'ready', basisIssues: [], availableLevels: [], calendar: basis.calendar, ...extra,
}, basis, latest);
const okReply = (input, snapshot) => wrap({ ...scope, commandId: input.commandId, status: 'saved',
  receipt: { commandId: input.commandId, action: input.action, snapshot } });
const deniedSql = code => Object.assign(new Error('Synthetic internal value must not leave SQL'), { code });

let state;
const fixture = globalThis.__studyPlanRouteTest = {
  get env() {
    return {
      APP_MODE: 'protected', DATABASE_URL: state.externalTarget ? 'postgres://synthetic@example.test:56322/postgres' : 'postgres://synthetic@127.0.0.1:56322/postgres',
      SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId,
      MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-study-plan-route-secret',
    };
  },
  session() {
    if (state.noSession) return null;
    const future = new Date(Date.now() + 60_000);
    return { session: { id: sessionId, identityId, membershipId, assignmentId, customerId, expiresAt: future, absoluteExpiresAt: future,
      revokedAt: null, epoch: 1 } };
  },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(hint, fn) {
    const eventCount = state.events.length, writeCount = state.writes.length;
    try {
      return await fn(fixture.tx, {
        sessionId, identityId, membershipId, assignmentId, customerId, organizerId, unitId,
        scopeKind: state.scopeKind, accessFunction: state.fn, identity: { issuer, subject: 'synthetic-route' },
        correlationId: hint.correlationId, epoch: 1, membershipStatus: 'active', assignmentValid: true,
        mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
          acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], authTime: new Date(Date.now() - 1000), checkedAt: new Date() },
      });
    } catch (error) {
      state.events.length = eventCount;
      state.writes.length = writeCount;
      throw error;
    }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.fn }];
    if (sql.includes('insert into public.security_events')) {
      if (state.failAudit && values[11] === 'ok') throw new Error('Synthetic Worker audit fault');
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] });
      return [];
    }
    const operation = /\bpublic\.individual_study_plan_(read|command|status)\(/u.exec(sql)?.[1];
    assert.ok(operation, 'test query must use protected study-plan RPC');
    state.calls.push({ operation, values });
    const handler = state.script[operation];
    assert.equal(typeof handler, 'function', `expected call to ${operation}`);
    const reply = handler(values[0]);
    if (operation === 'command' && reply?.result?.status === 'saved') state.writes.push(values[0]);
    return [{ result: structuredClone(reply) }];
  },
};
fixture.tx.json = value => value;
registerHooks({
  load(url, context, next) {
    const modules = {
      [new URL('./server/db.ts', import.meta.url).href]: `export class Deny extends Error {
        constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}
      } export const withLoginPhase=(...args)=>globalThis.__studyPlanRouteTest.login(...args);
      export const withSessionContext=(...args)=>globalThis.__studyPlanRouteTest.context(...args);`,
      [new URL('./server/session.ts', import.meta.url).href]: 'export const readSession=async()=>globalThis.__studyPlanRouteTest.session();',
      [new URL('./server/env.ts', import.meta.url).href]: 'export const serverEnv=()=>globalThis.__studyPlanRouteTest.env;',
    };
    return modules[url] ? { format: 'module', shortCircuit: true, source: modules[url] } : next(url, context);
  },
});
const { POST: read } = await import('../app/api/studieplaner/lasa/route.ts');
const { POST: write } = await import('../app/api/studieplaner/kommando/route.ts');
const { POST: status } = await import('../app/api/studieplaner/status/route.ts');

function reset(script = {}, options = {}) {
  state = { fn: 'rektor', scopeKind: 'school', mfa: true, script, failAudit: false, events: [], calls: [], writes: [], ...options };
}
function post(path, body, { requestOrigin = origin, epoch = '1' } = {}) {
  return new Request(`${origin}/api/studieplaner/${path}`, {
    method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', 'X-Context-Epoch': epoch, Origin: requestOrigin },
  });
}
const calls = () => state.calls.map(row => [row.operation, row.values[0]]);
const successes = () => state.events.filter(event => event.outcome === 'ok');
async function errorResponse(response, status, errorCode) {
  assert.equal(response.status, status);
  const json = await response.json();
  if (errorCode) assert.equal(json.code, errorCode);
  assert.equal(JSON.stringify(json).includes('Synthetic internal value'), false);
  assert.ok(!('current' in json || 'snapshot' in json || 'receipt' in json));
  return json;
}

test('studieplansläsning härleder nivåval från katalog och avgränsar svaret till placeringen', async () => {
  reset({ read: request => currentReply(request) }, { fn: 'administrator' });
  const request = currentRequest(), response = await read(post('lasa', request));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-context-epoch'), '1');
  const body = parseStudyPlanReadReply(await response.json(), parseStudyPlanReadRequest(request));
  assert.equal(body.current, null);
  assert.equal(body.canMakeCurrent, false);
  assert.ok(body.availableLevels.some(item => item.itemCode === 'SVEN1000X' && item.choiceIds.includes('svenska')));
  assert.ok(!body.availableLevels.some(item => item.itemCode === 'ENGE1000X'));
  assert.deepEqual(calls(), [['read', request]]);
  assert.equal(successes().length, 1);
  assert.equal(successes()[0].details.unitId, unitId);
  assert.ok(!('pupilId' in successes()[0].details || 'plan' in successes()[0].details));
});

test('källa som behöver kompletteras får en läsbar status utan nivåer från fel katalog', async () => {
  const basis = createBasis();
  basis.source.catalogId = null;
  basis.source.programVersion = null;
  reset({ read: request => currentReply(request, { basis, extra: { basisStatus: 'incomplete' } }) });
  const request = currentRequest(), response = await read(post('lasa', request));
  assert.equal(response.status, 200);
  const body = parseStudyPlanReadReply(await response.json(), parseStudyPlanReadRequest(request));
  assert.equal(body.basisStatus, 'incomplete');
  assert.deepEqual(body.availableLevels, []);
  assert.ok(body.basisIssues.some(item => item.field === 'path'));
});

test('historisk läsning visar begärd revision utan kataloginläsning', async () => {
  const old = revision(2, baseContent(), true), request = historyRequest({ revision: 2, on: '2027-03-01' });
  reset({ read: input => readWrap({ ...scope, view: input.view, on: input.on, version: old, history: [metadata(old)] }) });
  const response = await read(post('lasa', request));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await response.json()).version.content.levels[0].attempts[0].plannedEnd, { kind: 'term', schoolYear: 2028, term: 'VT' });
  assert.deepEqual(calls(), [['read', request]]);
  assert.equal(state.calls.length, 1);
});

test('administratör bereder utkast från elevens underlag och får kvitto för exakt revision', async () => {
  const input = prepare();
  reset({
    read: request => currentReply(request),
    command: ({ command: passed, content }) => {
      assert.deepEqual(passed, input);
      assert.deepEqual(content.source, source);
      assert.equal(content.path.programCode, 'SA25');
      assert.equal(content.path.apprenticeship, false);
      assert.ok(content.levels.some(level => level.kind === 'diploma_work'));
      assert.ok(content.levels.some(level => level.kind === 'gy25_level'));
      assert.deepEqual(content.distanceTeaching, input.payload.distanceTeaching);
      assert.deepEqual(content.decisions, []);
      return okReply(passed, revision(1, content));
    },
  }, { fn: 'administrator' });
  const response = await write(post('kommando', input));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = parseStudyPlanCommandReply(await response.json(), parseStudyPlanCommand(input));
  assert.equal(result.receipt.snapshot.revision, 1);
  assert.deepEqual(calls().map(([operation]) => operation), ['read', 'command']);
  assert.equal(state.writes.length, 1);
  assert.equal(successes().length, 1);
});

test('bekräftat elevval tas med med källrevision och skiljs från samma nivåkod i ett annat språk', async () => {
  const basis = createBasis(), confirmedId = id(58);
  const subject = catalog.subjects.find(item => item.code === 'MODY' && item.items.some(level => level.code === 'MODY1000X'));
  const level = subject.items.find(item => item.code === 'MODY1000X');
  const spanish = { subjectCode: subject.code, subjectVersion: subject.version, itemCode: level.code,
    languageCode: 'es', label: 'Spanska', points: level.points };
  basis.source.choices = [{ id: confirmedId, revision: 5 }];
  basis.choices = [{ id: confirmedId, revision: 5, kind: 'language', state: 'confirmed', levels: [spanish] }];
  reset({
    read: request => currentReply(request, { basis }),
    command: ({ command: input, content }) => okReply(input, revision(1, content)),
  }, { fn: 'administrator' });
  const request = currentRequest(), readResponse = await read(post('lasa', request));
  assert.equal(readResponse.status, 200);
  const projection = await readResponse.json();
  assert.ok(projection.availableLevels.some(item => item.itemCode === level.code && item.languageCode === 'de'));
  assert.ok(!projection.availableLevels.some(item => item.itemCode === level.code && item.languageCode === 'es'));
  const input = prepare(), response = await write(post('kommando', input));
  assert.equal(response.status, 200);
  const { content } = (await response.json()).receipt.snapshot;
  assert.deepEqual(content.source.choices, basis.source.choices);
  const spanishLevel = content.levels.find(item => item.itemCode === level.code);
  assert.equal(spanishLevel.languageCode, 'es');
  assert.ok(content.choices.some(choice => choice.id === `valplan:${confirmedId}` && choice.levelIds.includes(spanishLevel.id)));
});

test('gör gällande ger riktat besked före komplettering och bevarar terminsdatum efter godkännande', async () => {
  const initial = publish();
  reset({ command: body => wrap({ ...scope, status: 'incomplete', commandId: body.command.commandId,
    issues: [{ code: 'distance_teaching_incomplete', field: 'distanceTeaching' }] }) });
  const missing = await write(post('kommando', initial));
  assert.equal(missing.status, 200);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  const issue = parseStudyPlanCommandReply(await missing.json(), parseStudyPlanCommand(initial));
  assert.equal(issue.status, 'incomplete');
  assert.deepEqual(issue.issues, [{ code: 'distance_teaching_incomplete', field: 'distanceTeaching' }]);
  assert.equal(state.writes.length, 0);
  const revised = publish(4);
  const reviewed = { ...baseContent(), distanceTeaching: { kind: 'applies', minutes: 120 }, dialogue: { on: '2026-11-17', reviewedRevision: 3 } };
  reset({ command: ({ command: passed, content }) => {
    assert.equal(content, null);
    return okReply(passed, revision(5, reviewed, true));
  } });
  const response = await write(post('kommando', revised));
  assert.equal(response.status, 200);
  const result = parseStudyPlanCommandReply(await response.json(), parseStudyPlanCommand(revised));
  assert.equal(result.receipt.snapshot.effectiveOn, revised.payload.effectiveOn);
  assert.deepEqual(result.receipt.snapshot.content.levels[0].attempts[0].plannedStart, { kind: 'term', term: 'HT', schoolYear: 2028 });
  assert.equal(calls().length, 1);
});

test('Rektor registrerar beslutseffekt i skyddat kommando; endast beslutstypens nödvändiga uppgifter skickas', async () => {
  const input = decide();
  reset({ command: ({ command: passed, content }) => {
    assert.deepEqual(passed, input);
    assert.equal(content, null);
    return okReply(passed, revision(4, { ...baseContent(), decisions: [input.payload.decision] }));
  } });
  const response = await write(post('kommando', input));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).receipt.snapshot.content.decisions, [input.payload.decision]);
  assert.equal(successes().length, 1);
  assert.equal(JSON.stringify(successes()[0].details).includes(id(26)), false);
  assert.equal(JSON.stringify(successes()[0].details).includes('scopePoints'), false);
});

test('stark inloggning, levande roll och kontextversion kontrolleras före skyddad SQL på varje route', async () => {
  for (const [path, handler, input] of [
    ['lasa', read, currentRequest()], ['kommando', write, prepare()], ['status', status, statusRequest()],
  ]) {
    reset({}, { mfa: false });
    await errorResponse(await handler(post(path, input)), 403, 'mfa_required');
    assert.equal(calls().length, 0);
    reset({}, { noSession: true });
    await errorResponse(await handler(post(path, input)), 401, 'no_session');
    assert.equal(calls().length, 0);
    for (const fn of ['huvudman', 'larare', 'kundadmin', 'support']) {
      reset({}, { fn });
      await errorResponse(await handler(post(path, input)), 403, 'forbidden');
      assert.equal(calls().length, 0);
    }
    reset({}, { scopeKind: 'group' });
    await errorResponse(await handler(post(path, input)), 403, 'forbidden');
    assert.equal(calls().length, 0);
    reset({}, { externalTarget: true });
    await errorResponse(await handler(post(path, input)), 403, 'forbidden');
    assert.equal(calls().length, 0);
    reset();
    await errorResponse(await handler(post(path, input, { epoch: '2' })), 409, 'context_changed');
    assert.equal(calls().length, 0);
  }
  reset();
  await errorResponse(await write(post('kommando', prepare(), { requestOrigin: 'https://foreign.test' })), 403, 'csrf');
  assert.equal(calls().length, 0);
  for (const input of [publish(), decide()]) {
    reset({}, { fn: 'administrator' });
    await errorResponse(await write(post('kommando', input)), 403, 'forbidden');
    assert.equal(calls().length, 0);
  }
});

test('SQL avgränsar aktuell plan, historik, beslut och kvitto till levande skolplaceringsmandat', async () => {
  for (const [path, handler, input, operation] of [
    ['lasa', read, currentRequest({ unitId: id(50) }), 'read'],
    ['lasa', read, historyRequest({ placementId: id(51) }), 'read'],
    ['kommando', write, { ...decide(), unitId: id(50) }, 'command'],
    ['status', status, { ...statusRequest(), pupilId: id(52) }, 'status'],
  ]) {
    reset({ [operation]: () => { throw deniedSql('42501'); } });
    await errorResponse(await handler(post(path, input)), 403, 'forbidden');
    assert.equal(calls().length, 1);
    assert.equal(successes().length, 0);
  }
});

test('stängda och begränsade requestkontrakt avvisar aktör, fri text, ofullständig jämförelse och för stor kropp', async () => {
  for (const [path, handler, input] of [
    ['lasa', read, { ...currentRequest(), identityId: id(50) }],
    ['lasa', read, currentRequest({ view: 'impact', target: { kind: 'group_move', toGroupId: id(51) } })],
    ['lasa', read, currentRequest({ on: '2026-02-29' })],
    ['kommando', write, { ...prepare(), payload: { dates: [], note: 'Synthetic internal value' } }],
    ['kommando', write, '{'],
    ['status', status, { ...statusRequest(), placementId: '' }],
  ]) {
    reset();
    await errorResponse(await handler(post(path, input)), 400, 'bad_request');
    assert.equal(calls().length, 0);
  }
  reset();
  const oversized = { ...prepare(), payload: { dates: [], note: 'x'.repeat(512_001) } };
  const body = await errorResponse(await write(post('kommando', oversized)), 400, 'bad_request');
  assert.equal(body.details.reason, 'payload_too_large');
  assert.equal(calls().length, 0);
});

test('fel i RPC-aktör, version, scope eller jämförelseform lämnar ingen elevdata', async () => {
  const current = currentRequest(), history = historyRequest();
  const compare = currentRequest({ view: 'impact', target: { kind: 'group_move', membershipId: id(35), toGroupId: id(36) } });
  for (const [request, makeReply] of [
    [current, req => ({ ...currentReply(req), contractVersion: 'other' })],
    [current, req => ({ ...currentReply(req), actor: { identityId, assignmentId: id(40) } })],
    [current, req => ({ ...currentReply(req), actor: { identityId: id(40), assignmentId } })],
    [current, req => currentReply(req, { extra: { sourceToken: `sha256:${'b'.repeat(64)}` } })],
    [history, req => readWrap({ ...req, pupilId: id(41), history: [], version: null })],
    [compare, req => readWrap({ ...req, on: '2026-11-21', status: 'unavailable', impact: null })],
    [compare, req => readWrap({ ...req, target: { ...req.target, toGroupId: id(37) }, status: 'unavailable', impact: null })],
    [compare, req => readWrap({ ...req, roster: ['Synthetic internal value'], status: 'unavailable', impact: null })],
  ]) {
    reset({ read: makeReply });
    await errorResponse(await read(post('lasa', request)), 500, 'audit_unavailable');
    assert.equal(successes().length, 0);
  }
  reset({ read: req => readWrap({ ...req, status: 'unavailable', impact: null }) });
  const response = await read(post('lasa', compare));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ...compare, status: 'unavailable', impact: null });
  reset({ read: req => currentReply(req, { extra: { canMakeCurrent: true } }) }, { fn: 'administrator' });
  await errorResponse(await read(post('lasa', current)), 500, 'audit_unavailable');
  assert.equal(successes().length, 0);
});

test('återförsök får samma kommando och kvittots separata route är läsande', async () => {
  const input = actual();
  const content = baseContent();
  content.levels[0].attempts[0].actual.start = { on: input.payload.event.on, source: input.payload.event.source };
  const saved = okReply(input, revision(4, content));
  reset({ command: () => saved, status: req => wrap({ ...req, receipt: saved.result.receipt }) });
  const first = await write(post('kommando', input));
  const second = await write(post('kommando', input));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await first.json(), await second.json());
  const ref = statusRequest(input.commandId);
  const checked = await status(post('status', ref));
  assert.equal(checked.status, 200);
  assert.equal(checked.headers.get('cache-control'), 'no-store');
  assert.deepEqual(parseStudyPlanStatusReply(await checked.json(), ref).receipt, saved.result.receipt);
  assert.deepEqual(calls(), [['command', { command: input, content: null }], ['command', { command: input, content: null }], ['status', ref]]);
  reset({ status: req => wrap({ ...req, receipt: null }) });
  assert.deepEqual(await (await status(post('status', ref))).json(), { ...ref, receipt: null });
  reset({ status: req => wrap({ ...req, placementId: id(47), receipt: saved.result.receipt }) });
  await errorResponse(await status(post('status', ref)), 500, 'audit_unavailable');
  assert.equal(successes().length, 0);
});

test('omförsök att bereda ett redan sparat utkast återger kvittot efter att revisionen har ändrats', async () => {
  const input = prepare(), newest = revision(2), initial = revision(1);
  reset({
    read: request => currentReply(request, { draft: newest, history: [newest, initial].map(metadata) }),
    command: body => {
      assert.deepEqual(body, { command: input, content: null });
      return okReply(input, initial);
    },
  }, { fn: 'administrator' });
  const response = await write(post('kommando', input));
  assert.equal(response.status, 200);
  const body = parseStudyPlanCommandReply(await response.json(), input);
  assert.deepEqual(body.receipt.snapshot, initial);
});

test('katalog- och revisionskonflikter, förväxlat kvitto och auditfel ger inget sparbesked', async () => {
  const input = actual(), result = okReply(input, revision(4));
  for (const reason of ['revision', 'source', 'command']) {
    reset({ command: () => wrap({ ...scope, status: 'conflict', reason, latestRevision: 4, commandId: input.commandId }) });
    const response = await write(post('kommando', input));
    assert.equal(response.status, 200);
    assert.equal(parseStudyPlanCommandReply(await response.json(), input).reason, reason);
    assert.equal(state.writes.length, 0);
  }
  for (const reply of [
    { ...result, result: { ...result.result, unitId: id(47) } },
    { ...result, result: { ...result.result, placementId: id(46) } },
    { ...result, result: { ...result.result, receipt: { ...result.result.receipt, snapshot: revision(3) } } },
  ]) {
    reset({ command: () => reply });
    await errorResponse(await write(post('kommando', input)), 500, 'audit_unavailable');
    assert.equal(state.writes.length, 0);
  }
  reset({ command: () => result }, { failAudit: true });
  await errorResponse(await write(post('kommando', input)), 500, 'audit_unavailable');
  assert.equal(state.writes.length, 0);
  assert.equal(successes().length, 0);
  reset({ command: () => { throw deniedSql('55000'); } });
  await errorResponse(await write(post('kommando', input)), 500, 'audit_unavailable');
  assert.equal(state.writes.length, 0);
});
