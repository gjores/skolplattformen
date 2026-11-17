// Simulerade POST-anrop genom riktiga routefunktioner, protectedRoute, MFA- och CSRF-kontroll.
// Session, SQL-läsare och motor är avsiktliga stubbar. Detta är inte ett Worker/OIDC/PostgreSQL-prov.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor } from './schema-contract.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';

const id = n => `73111500-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
const plan = { contractVersion: 1, unitId: id(1), schoolYear: 2026, schoolName: 'Syntetisk provskola', revision: 1, version: null, versions: [],
  teachers: [{ personId: id(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
  classes: [{ classId: id(10), name: 'Provklass', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey: 'source-1', rowKey: 'ma', label: 'Matematik', needHt: 2400, needVt: 2400, needBasis: 'terms' }] }],
  groups: [], rows: [{ id: id(40), lineageId: id(41), sourceKind: 'class_timplan', sourceKey: 'source-1', classId: id(10), rowKey: 'ma', personId: id(20), teacherHt: 2400, teacherVt: 2400,
    needHt: 2400, needVt: 2400, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }],
  specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: false } };
let state;
const event = action => ({ action, objectType: 'school', objectId: id(1), details: { unitId: id(1), schoolYear: 2026 } });
const pupils = () => state.seePupils ? [{ id: id(30), name: 'Syntetisk provelev', classIds: [id(10)] }] : [];
const fake = globalThis.__schemaSalarRoutesTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: 'skolplattform-worker', MFA_MAX_AGE_SECONDS: '28800' },
  session() {
    if (state.noSession) return null;
    const now = new Date(Date.now() - 1000), future = new Date(Date.now() + 60000);
    return { token: 'synthetic-session', session: { id: id(3), identityId: id(4), membershipId: id(5), assignmentId: id(6), customerId: id(7), issuer: ISSUER, subject: 'synthetic-person', epoch: 1,
      expiresAt: future, absoluteExpiresAt: future, revokedAt: state.revoked ? now : null, proofIssuer: ISSUER, proofClientId: 'skolplattform-worker', proofAudience: ['skolplattform-worker'],
      proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, acr: '2', amr: state.noMfa ? ['pwd'] : ['pwd', 'otp'], authTime: now, proofCheckedAt: now } };
  },
  async login(_corr, fn) { return fn(fake.tx); },
  async parseRequest(request, parse) { try { return await parse(await request.json()); } catch (error) { throw new Deny('bad_request', 400, error.reason ? { reason: error.reason } : undefined); } },
  async sessionContext(ctx, fn, ErrorClass) {
    if (state.liveDeny) throw new ErrorClass('assignment_ended', 403);
    const events = state.events.length;
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.liveRole ?? state.role, epoch: state.liveEpoch ?? 1, scopeKind: 'school' }); }
    catch (error) { state.events.length = events; throw error; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails && values[11] === 'ok' && (!state.auditAction || values[8] === state.auditAction)) throw new Error('synthetic-audit-unavailable');
      state.events.push({ action: values[8], outcome: values[11], details: values[12] }); return [];
    }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
    throw new Error('Unexpected synthetic SQL');
  },
  async planRead(_tx, input, ctx) {
    state.reads.push({ type: 'plan', input, role: ctx.accessFunction });
    if (input.unitId !== id(1)) throw new Deny('forbidden', 403);
    return { body: plan, event: event('tjanst_plan_read') };
  },
  async personalRead() {
    state.reads.push({ type: 'personal' });
    return { body: { people: [{ id: id(20), givenName: 'Provlärare', familyName: '', status: 'active', duties: [{ unitId: id(1), startsOn: '2026-07-01', endsOn: null }] }] }, event: event('personal_read') };
  },
  async elective() { state.reads.push({ type: 'elective' }); return { body: { pupils: pupils(), placements: [] }, event: event('elective_blocks_read') }; },
  async study() { state.reads.push({ type: 'study' }); return { body: { pupils: pupils(), memberships: [] }, event: event('study_groups_read') }; },
  async lasar() { state.reads.push({ type: 'lasar' }); return { body: { calendar: null, versions: [] }, event: event('lasar_read') }; },
  async validate(problem, placements) {
    assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'), 'motorn nåddes före lyckad audit');
    state.validations.push({ problem: structuredClone(problem), placements: structuredClone(placements) });
    if (state.engineFailure) throw new SchemaEngineError(state.engineFailure);
    if (state.realMotor) return state.realMotor(problem, placements);
    if (state.validationDelay) await new Promise(r => setTimeout(r, state.validationDelay));
    const selected = placements.find(p => p.lesson === state.lesson);
    const violations = state.teacherClash ? [{ code: 'teacher_clash', message: 'Lärare larare-1 har en annan lektion.', lessons: [state.lesson], resources: ['larare-1'] }]
      : selected?.room === 'sal-1' ? [{ code: 'room_clash', message: 'Sal sal-1 är upptagen av pass-2.', lessons: [state.lesson, 'pass-2'], resources: ['sal-1'] }] : [];
    return { violations, metrics: { studentGapMin: 0, teacherGapMin: 0, cost: 0 } };
  },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  let source;
  const is = name => url === new URL(name, server).href;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...args)=>globalThis.__schemaSalarRoutesTest.login(...args);
    export const withSessionContext=(ctx,fn)=>globalThis.__schemaSalarRoutesTest.sessionContext(ctx,fn,Deny);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__schemaSalarRoutesTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__schemaSalarRoutesTest.env;';
  if (is('tjanst.ts')) source = `export const planRead=(...a)=>globalThis.__schemaSalarRoutesTest.planRead(...a);export const personalRead=(...a)=>globalThis.__schemaSalarRoutesTest.personalRead(...a);
    export const tjanstRequest=(...a)=>globalThis.__schemaSalarRoutesTest.parseRequest(...a);
    export { parsePlanReadRequest } from '${new URL('./tjanst-contract.ts', import.meta.url).href}';`;
  if (is('elective-block.ts')) source = 'export const readElectiveBlocks=(...a)=>globalThis.__schemaSalarRoutesTest.elective(...a);';
  if (is('study-groups.ts')) source = 'export const readStudyGroups=(...a)=>globalThis.__schemaSalarRoutesTest.study(...a);';
  if (is('lasar.ts')) source = 'export const lasarRead=(...a)=>globalThis.__schemaSalarRoutesTest.lasar(...a);';
  if (is('skolsalar.ts')) source = 'export const readSkolsalar=async()=>globalThis.__schemaSkolsalar??null;export const skolsalarDokument=r=>r?.document??null;';
  if (is('schema-datum-read.ts')) source = 'export const readSchemaDatedBasis=(...a)=>globalThis.__schemaSalarRoutesTest.dated(...a);';
  if (is('schemamotor.ts')) source = `export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const solveSchema=async()=>{throw Error('Full solve must not be reached');};
    export const diagnoseSchema=async()=>{throw Error('Diagnosis must not be reached');};
    export const suggestSchema=async()=>{throw Error('Suggest must not be reached');};
    export const validateSchema=(...a)=>globalThis.__schemaSalarRoutesTest.validate(...a);export const positionsSchema=async()=>{throw Error('Motor must not be reached');};`;
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts');
const { SchemaEngineError } = await import('./server/schemamotor.ts');
const { POST } = await import('../app/api/schema/salar/route.ts');
const { schemaSalSok } = await import('./server/schema-salar.ts');
const { parseSchemaSalSvar } = await import('./schema-salar.ts');
const reset = () => { state = { role: 'rektor', seePupils: true, reads: [], events: [], validations: [] }; };
const basis = () => ({ members: { pupils: pupils().map(p => ({ id: p.id, classIds: p.classIds })), memberships: [] }, time: defaultSchemaTime(),
  ...(state.role === 'rektor' ? { personer: [{ ref: id(20), name: 'Provlärare' }] } : {}) });
const allowed = () => state.events.push({ action: 'tjanst_plan_read', outcome: 'ok' });
fake.dated = async () => { state.reads.push({ type: 'dated' }); return { body: state.datedBasis, event: event('schema_dated_basis_read') }; };
function body(villkor = { ...defaultSchemaVillkor(), salar: ['A101', 'A102', 'Laboratorium'], egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A101', 'A102'] }] }, selectedBasis = basis()) {
  const input = { unitId: id(1), schoolYear: 2026, period: 'ht', villkor }, underlag = buildSchemaUnderlag(plan, input, selectedBasis), lesson = underlag.problem.lessons[0].id;
  state.lesson = lesson;
  return { ...input, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint,
    placements: underlag.problem.lessons.slice(1).map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: l.rooms?.allowed[0] ?? null })),
    lesson, target: { day: 0, startMin: 480 }, datedTarget: null, datedOverrides: [] };
}
const request = (value, headers = {}) => new Request('http://localhost:3012/api/schema/salar', { method: 'POST',
  headers: { Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) });

test('salsökning kräver aktuell session, mandat, roll, kontextversion, MFA och samma ursprung före källor eller motor', async () => {
  const cases = [{ change: { noSession: true }, code: 'no_session', status: 401 }, { change: { revoked: true }, code: 'session_revoked', status: 401 },
    { change: { liveDeny: true }, code: 'assignment_ended', status: 403 }, { change: { liveRole: 'larare' }, code: 'forbidden', status: 403 },
    { change: { liveEpoch: 2 }, code: 'context_changed', status: 409 }, { change: { noMfa: true }, code: 'mfa_required', status: 403 },
    { change: {}, headers: { Origin: 'https://annan.example.test' }, code: 'csrf', status: 403 }];
  for (const c of cases) {
    reset(); const input = body(); Object.assign(state, c.change);
    const response = await POST(request(input, c.headers)); assert.equal(response.status, c.status); assert.equal((await response.json()).code, c.code);
    assert.equal(state.reads.length, 0); assert.equal(state.validations.length, 0); assert.ok(state.events.some(e => e.outcome === 'denied')); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
test('skolans mandat och obligatorisk audit kan inte kringgås med salssökningen', async () => {
  reset(); const denied = await POST(request({ ...body(), unitId: id(99) })); assert.equal(denied.status, 403); assert.equal(state.validations.length, 0);
  for (const action of ['tjanst_plan_read', 'elective_blocks_read']) {
    reset(); const input = body(); state.auditFails = true; state.auditAction = action;
    const response = await POST(request(input)); assert.equal(response.status, 500); assert.equal(state.validations.length, 0); assert.ok(!state.events.some(e => e.outcome === 'ok'));
  }
});
test('gammal version och klientens extra längd/salmodell nekas före data; ändrad salgrund kräver nytt förslag', async () => {
  for (const extra of [{ contractVersion: 7 }, { durationMin: 5 }, { rooms: [{ id: 'sal-99', name: 'Ny sal' }] }]) {
    reset(); const response = await POST(request({ ...body(), ...extra })); assert.equal(response.status, 400); assert.equal(state.reads.length, 0); assert.equal(state.validations.length, 0);
  }
  reset(); const input = body(); input.villkor.salar.push('Klientens extra sal');
  const response = await POST(request(input)); assert.equal(response.status, 409); assert.equal((await response.json()).code, 'schema_underlag_changed'); assert.equal(state.validations.length, 0);
});
test('endast befintliga tillåtna salar helkontrolleras; valet utför ingen flytt och andra pass bevaras', async () => {
  reset(); const input = body(), unchanged = structuredClone(input), response = await POST(request(input)), value = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(value.rooms.map(r => r.status), ['upptagen', 'ledig', 'otillaten']); assert.equal(value.checkedRooms, 2);
  assert.equal(state.validations.length, 2); assert.match(value.rooms[0].reasons[0].message, /A101/u); assert.ok(!value.rooms[0].reasons[0].message.includes('sal-1'));
  for (const call of state.validations) {
    assert.deepEqual(call.placements.filter(p => p.lesson !== input.lesson), input.placements);
    assert.equal(call.placements.filter(p => p.lesson === input.lesson).length, 1); assert.equal(call.placements.find(p => p.lesson === input.lesson).startMin, input.target.startMin);
    const sent = JSON.stringify(call.problem); for (const secret of [id(10), id(20), id(30), 'Provlärare', 'Provklass', 'Matematik', 'A101']) assert.ok(!sent.includes(secret));
  }
  const underlag = buildSchemaUnderlag(plan, input, basis()); assert.deepEqual(parseSchemaSalSvar(value, input, underlag.labels.rooms), value); assert.deepEqual(input, unchanged);
});
test('en annan konflikt i hela kandidaten får ingen sal att visas som ledig', async () => {
  reset(); state.teacherClash = true; const response = await POST(request(body())), value = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(value.rooms.map(r => r.status), ['hindrad', 'hindrad', 'otillaten']); assert.match(value.rooms[0].reasons[0].message, /Provlärare/u);
});
test('valt låst/okänt pass nekas och alla andra utkastslås följer hela kandidaten', async () => {
  for (const kind of ['selected', 'unknown', 'other']) {
    reset(); const input = body();
    if (kind === 'unknown') input.lesson = 'pass-999';
    else input.locks = { grundFingerprint: input.grundFingerprint, placements: [kind === 'selected' ? { lesson: input.lesson, day: 0, startMin: 480, room: 'sal-1' } : input.placements[0]] };
    const response = await POST(request(input));
    if (kind === 'other') { assert.equal(response.status, 200); assert.ok(state.validations.every(c => c.problem.lessons.find(l => l.id === input.placements[0].lesson).locked)); }
    else { assert.equal(response.status, 409); assert.equal(state.validations.length, 0); }
  }
});
test('pass utan salsvillkor får inga påhittade fria salar; skoladministratören använder sitt eget mandat', async () => {
  reset(); state.role = 'administrator'; const input = body({ ...defaultSchemaVillkor(), salar: ['A101', 'A102'], egna: [] });
  const response = await POST(request(input)), value = await response.json(); assert.equal(response.status, 200); assert.ok(value.rooms.every(r => r.status === 'otillaten'));
  assert.equal(state.validations.length, 0); assert.ok(!state.reads.some(r => r.type === 'personal'));
});
test('tidsgräns lämnar oprövade salar med tydlig status och aldrig som lediga', async () => {
  reset(); allowed(); const input = body(); state.validationDelay = 30;
  const result = await schemaSalSok({ plan, basis: basis() }, input, undefined, { timeMs: 10 });
  assert.equal(result.timedOut, true); assert.equal(result.checkedRooms, 0); assert.deepEqual(result.rooms.map(r => r.status), ['ej_kontrollerad', 'ej_kontrollerad', 'otillaten']);
  assert.equal(state.validations.length, 1);
});
test('datumkällans extra audit är obligatorisk före motor; en veckosökning läser aldrig datumdeltagare', async () => {
  reset(); const input = body(); input.datedTarget = { originalDate: '2026-11-09', date: '2026-11-16' }; state.auditFails = true; state.auditAction = 'schema_dated_basis_read';
  const response = await POST(request(input)); assert.equal(response.status, 500); assert.equal(state.validations.length, 0); assert.equal(state.reads.filter(r => r.type === 'dated').length, 1);
  reset(); await POST(request(body())); assert.equal(state.reads.filter(r => r.type === 'dated').length, 0);
});
test('datumkandidaten får faktisk tillfälleslängd och bevarar källans grund och andra undantag', async () => {
  reset(); allowed(); const selectedBasis = basis(); selectedBasis.time.source = 'kalender'; selectedBasis.time.terms.ht.span = { start: '2026-08-17', end: '2026-12-18' };
  selectedBasis.time.dates = ['2026-11-09', '2026-11-16'].map(date => ({ date, term: 'ht', schoolDay: true, reason: null, classes: {} }));
  const input = body(undefined, selectedBasis), underlag = buildSchemaUnderlag(plan, input, selectedBasis);
  input.placements = underlag.problem.lessons.map((l, i) => ({ lesson: l.id, day: 0, startMin: 480 + i * 120, room: 'sal-1' }));
  input.datedTarget = { originalDate: '2026-11-09', date: '2026-11-16' }; input.target.startMin = 780;
  const datedBasis = { unitId: id(1), schoolYear: 2026, complete: true, placements: [{ id: id(50), pupilId: id(30), startsOn: '2026-08-17', endsOn: null }],
    classMemberships: [{ placementId: id(50), pupilId: id(30), classId: id(10), startsOn: '2026-08-17', endsOn: null }], groups: [], memberships: [] };
  const original = structuredClone(input);
  const result = await schemaSalSok({ plan, basis: selectedBasis, datedBasis }, input, async (problem, placements) => {
    state.validations.push({ problem, placements }); return { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0, cost: 0 } };
  });
  assert.equal(result.datedTarget.date, '2026-11-16'); assert.equal(result.durationMin, underlag.problem.lessons[0].duration_min); assert.equal(result.checkedRooms, 2);
  assert.ok(result.rooms.slice(0, 2).every(r => r.status === 'ledig')); assert.equal(result.grundFingerprint, input.grundFingerprint); assert.deepEqual(input, original);
  assert.ok(state.validations.some(c => c.problem.id === 'datum-2026-11-16' && c.placements.some(p => p.startMin === 780)));
  assert.ok(state.validations.every(c => !JSON.stringify(c.problem).includes(id(30))));
});

test('salsökning prövas med riktig motor4: aktivitet och salmarginal hindrar A101 men tillåter A102 även för ett datummål', { skip: process.env.SCHEMA_SALAR_ENGINE !== '1' }, async () => {
  const { spawn } = await import('node:child_process'), { randomBytes } = await import('node:crypto'), { parseSchemaCheck } = await import('./schema-contract.ts');
  const port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`, token = randomBytes(24).toString('hex');
  const service = spawn(new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url).pathname, [], { env: { SCHEMAMOTOR_ADDR: `127.0.0.1:${port}`, SCHEMAMOTOR_TOKEN: token }, stdio: 'ignore' });
  let spawnError; service.on('error', error => { spawnError = error; });
  const validate = async (problem, placements) => {
    const response = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room === null ? [] : [p.room] })) }), signal: AbortSignal.timeout(5_000) });
    assert.equal(response.status, 200); return parseSchemaCheck(await response.json(), problem);
  };
  try {
    for (let i = 0; ; i++) {
      if (spawnError) throw spawnError;
      try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* egen tjänst startar */ }
      assert.ok(i < 40, 'den syntetiska motorn startade inte'); await new Promise(r => setTimeout(r, 50));
    }
    reset(); state.realMotor = validate;
    const activity = { id: 'aktivitet-1', typId: 'provtyp', typ: 'Möte', name: 'Bokad sal', classRefs: [], groupRefs: [], teacherRefs: [], rooms: ['A101'], durationMin: 20,
      veckor: { typ: 'alla' }, visibleFor: 'personal', margin: null, tid: { typ: 'fast', day: 0, startMin: 580 } };
    const villkor = { ...defaultSchemaVillkor(), lunch: null, breakMin: 0, sameDay: 'allow', salar: ['A101', 'A102', 'Laboratorium'], aktiviteter: [activity],
      egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A101', 'A102'] },
        { slag: 'pass', ref: 'pass-1', typ: 'marginal', beforeMin: 0, afterMin: 20, occupies: ['sal'], label: 'Ställtid', visibleFor: [], when: 'alltid' }] };
    const input = body(villkor), underlag = buildSchemaUnderlag(plan, input, basis()); input.target.startMin = 500;
    input.placements = underlag.problem.lessons.filter(l => l.id !== input.lesson).map((l, i) => ({ lesson: l.id, day: l.locked?.day ?? 1, startMin: l.locked?.start_min ?? 600 + i * 120, room: l.rooms?.allowed[0] ?? null }));
    const response = await POST(request(input)), result = await response.json(); assert.equal(response.status, 200, JSON.stringify(result));
    assert.deepEqual(result.rooms.map(r => r.status), ['upptagen', 'ledig', 'otillaten'], JSON.stringify(result.rooms)); assert.equal(result.marginAfterMin, 20);
    assert.match(result.rooms[0].reasons[0].message, /Bokad sal/u);
    // Det daterade målet använder samma serverhärledda längd och den faktiska dagens fasta aktivitet.
    const selectedBasis = basis(); selectedBasis.time.source = 'kalender'; selectedBasis.time.terms.ht.span = { start: '2026-08-17', end: '2026-12-18' };
    selectedBasis.time.dates = ['2026-11-09', '2026-11-16'].map(date => ({ date, term: 'ht', schoolDay: true, reason: null, classes: {} }));
    const datedInput = body(villkor, selectedBasis), datedUnderlag = buildSchemaUnderlag(plan, datedInput, selectedBasis);
    datedInput.placements = datedUnderlag.problem.lessons.map((l, i) => ({ lesson: l.id, day: l.locked?.day ?? (i === 0 ? 0 : 1), startMin: l.locked?.start_min ?? (i === 0 ? 480 : 600), room: l.rooms?.allowed[0] ?? null }));
    datedInput.target.startMin = 500; datedInput.datedTarget = { originalDate: '2026-11-09', date: '2026-11-09' };
    const datedBasis = { unitId: id(1), schoolYear: 2026, complete: true, placements: [{ id: id(50), pupilId: id(30), startsOn: '2026-08-17', endsOn: null }],
      classMemberships: [{ placementId: id(50), pupilId: id(30), classId: id(10), startsOn: '2026-08-17', endsOn: null }], groups: [], memberships: [] };
    const datedResult = await schemaSalSok({ plan, basis: selectedBasis, datedBasis }, datedInput, validate);
    assert.deepEqual(datedResult.rooms.map(r => r.status), ['upptagen', 'ledig', 'otillaten'], JSON.stringify(datedResult.rooms)); assert.equal(datedResult.marginAfterMin, 20);
  } finally { if (service.exitCode === null && !spawnError) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill('SIGTERM'); await exited; } }
});
