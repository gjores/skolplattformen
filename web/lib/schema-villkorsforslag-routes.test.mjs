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
const fake = globalThis.__schemaVillkorsRoutesTest = {
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
    if (state.realMotor) return state.realMotor.validate(problem, placements);
    const selectedPlaced = placements.some(p => p.lesson === state.lesson);
    if (selectedPlaced && state.validationDelay) await new Promise(r => setTimeout(r, state.validationDelay));
    return { violations: state.invalidValidation || state.invalidCandidateValidation && selectedPlaced ? [{ code: 'teacher_clash', message: 'Syntetisk krock.', lessons: [state.lesson], resources: [] }] : [],
      metrics: { studentGapMin: 0, teacherGapMin: 0, cost: selectedPlaced ? 1 : 0 } };
  },
  async suggest(problem, placements, input) {
    state.suggests.push({ problem: structuredClone(problem), placements: structuredClone(placements), input: structuredClone(input) });
    if (state.realMotor) return state.realMotor.suggest(problem, placements, input);
    if (state.emptySuggestions) return { depth: input.depth, timedOut: !!state.motorTimedOut, elapsedMs: 1, suggestions: [] };
    const to = { lesson: input.lesson, day: 0, startMin: 480, room: problem.lessons.find(l => l.id === input.lesson).rooms?.allowed[0] ?? null };
    const after = [...placements, to];
    if (state.breakLock) after[0] = { ...after[0], startMin: after[0].startMin + 10 };
    const changes = [{ lesson: input.lesson, from: null, to }];
    if (state.breakLock) changes.push({ lesson: after[0].lesson, from: placements[0], to: after[0] });
    return { depth: input.depth, timedOut: false, elapsedMs: 1, suggestions: [{ placements: after, changes,
      metricsBefore: { studentGapMin: 0, teacherGapMin: 0, cost: 0 }, metricsAfter: { studentGapMin: state.misreportedMetrics ? 999 : 0, teacherGapMin: 0, cost: 1 }, cost: 1 }] };
  },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  let source;
  const is = name => url === new URL(name, server).href;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...args)=>globalThis.__schemaVillkorsRoutesTest.login(...args);
    export const withSessionContext=(ctx,fn)=>globalThis.__schemaVillkorsRoutesTest.sessionContext(ctx,fn,Deny);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__schemaVillkorsRoutesTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__schemaVillkorsRoutesTest.env;';
  if (is('tjanst.ts')) source = `export const planRead=(...a)=>globalThis.__schemaVillkorsRoutesTest.planRead(...a);export const personalRead=(...a)=>globalThis.__schemaVillkorsRoutesTest.personalRead(...a);
    export const tjanstRequest=(...a)=>globalThis.__schemaVillkorsRoutesTest.parseRequest(...a);
    export { parsePlanReadRequest } from '${new URL('./tjanst-contract.ts', import.meta.url).href}';`;
  if (is('elective-block.ts')) source = 'export const readElectiveBlocks=(...a)=>globalThis.__schemaVillkorsRoutesTest.elective(...a);';
  if (is('study-groups.ts')) source = 'export const readStudyGroups=(...a)=>globalThis.__schemaVillkorsRoutesTest.study(...a);';
  if (is('lasar.ts')) source = 'export const lasarRead=(...a)=>globalThis.__schemaVillkorsRoutesTest.lasar(...a);';
  if (is('schemamotor.ts')) source = `export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const solveSchema=async()=>{throw Error('Full solve must not be reached');};
    export const diagnoseSchema=async()=>{throw Error('Diagnosis must not be reached');};
    export const suggestSchema=(...a)=>globalThis.__schemaVillkorsRoutesTest.suggest(...a);
    export const validateSchema=(...a)=>globalThis.__schemaVillkorsRoutesTest.validate(...a);export const positionsSchema=async()=>{throw Error('Motor must not be reached');};`;
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts');
const { SchemaEngineError } = await import('./server/schemamotor.ts');
const { POST } = await import('../app/api/schema/villkorsforslag/route.ts');
const { schemaVillkorsforslag } = await import('./server/schema-villkorsforslag.ts');
const { parseSchemaVillkorsforslag, tillampaSchemaVillkorsandring } = await import('./schema-villkorsforslag.ts');
const reset = () => { state = { role: 'rektor', seePupils: true, reads: [], events: [], validations: [], suggests: [] }; };
const basis = () => ({ members: { pupils: pupils().map(p => ({ id: p.id, classIds: p.classIds })), memberships: [] }, time: defaultSchemaTime(),
  ...(state.role === 'rektor' ? { personer: [{ ref: id(20), name: 'Provlärare' }] } : {}) });
const margin = () => ({ slag: 'larare', ref: id(20), typ: 'marginal', beforeMin: 10, afterMin: 0, occupies: ['larare'], label: 'Förberedelse', visibleFor: ['larare'], when: 'alltid' });
function body(villkor = { ...defaultSchemaVillkor(), egna: [margin()] }, selectedPlan = plan, selectedBasis = basis()) {
  const input = { unitId: id(1), schoolYear: 2026, period: 'ht', villkor }, underlag = buildSchemaUnderlag(selectedPlan, input, selectedBasis);
  const lesson = underlag.problem.lessons[0].id;
  state.lesson = lesson;
  const placements = underlag.problem.lessons.slice(1).map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: l.rooms?.allowed[0] ?? null }));
  return { ...input, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, placements, lesson, depth: 1 };
}
const request = (value, headers = {}) => new Request('http://localhost:3012/api/schema/villkorsforslag', { method: 'POST',
  headers: { Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) });
const allowed = () => state.events.push({ action: 'tjanst_plan_read', outcome: 'ok' });
const motorCalls = () => state.validations.length + state.suggests.length;

test('villkorsförslag stoppar session, återkallelse, aktuellt mandat/roll/epoch, MFA och korsursprung före källor och motor', async () => {
  const cases = [{ change: { noSession: true }, code: 'no_session', status: 401 }, { change: { revoked: true }, code: 'session_revoked', status: 401 },
    { change: { liveDeny: true }, code: 'assignment_ended', status: 403 }, { change: { liveRole: 'larare' }, code: 'forbidden', status: 403 },
    { change: { liveEpoch: 2 }, code: 'context_changed', status: 409 }, { change: { noMfa: true }, code: 'mfa_required', status: 403 },
    { change: {}, headers: { Origin: 'https://annan.example.test' }, code: 'csrf', status: 403 }];
  for (const c of cases) {
    reset(); const input = body(); Object.assign(state, c.change);
    const response = await POST(request(input, c.headers));
    assert.equal(response.status, c.status); assert.equal((await response.json()).code, c.code);
    assert.equal(state.reads.length, 0); assert.equal(motorCalls(), 0); assert.ok(state.events.some(e => e.outcome === 'denied'));
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('den begärda skolan måste omfattas av mandatet och obligatorisk audit lyckas före beräkning', async () => {
  reset(); const input = { ...body(), unitId: id(99) }, denied = await POST(request(input));
  assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'forbidden'); assert.equal(motorCalls(), 0);
  for (const auditAction of ['tjanst_plan_read', 'elective_blocks_read']) {
    reset(); const input = body(); state.auditFails = true; state.auditAction = auditAction;
    const response = await POST(request(input)); assert.equal(response.status, 500); assert.equal(motorCalls(), 0);
    assert.ok(!state.events.some(e => e.outcome === 'ok')); assert.ok(!(await response.text()).includes('Provlärare'));
  }
});

test('gammal kontraktsversion och klientangivet motorproblem nekas innan källäsning', async () => {
  for (const extra of [{ contractVersion: 7 }, { problem: { teachers: [] } }]) {
    reset(); const response = await POST(request({ ...body(), ...extra }));
    assert.equal(response.status, 400); assert.equal(state.reads.length, 0); assert.equal(motorCalls(), 0);
    const value = await response.json(); assert.equal(value.code, 'bad_request'); if (extra.contractVersion) assert.equal(value.details.reason, 'schema_contract_version');
  }
});

test('servern återskapar grunden och tillåter bara befintligt parkerat olåst pass', async () => {
  for (const kind of ['grund', 'unknown', 'locked']) {
    reset(); const input = body();
    if (kind === 'grund') input.grundFingerprint = 'a'.repeat(28);
    if (kind === 'unknown') input.lesson = 'pass-999';
    if (kind === 'locked') input.locks = { grundFingerprint: input.grundFingerprint, placements: [{ lesson: input.lesson, day: 1, startMin: 480, room: null }] };
    const response = await POST(request(input)), value = await response.json();
    assert.equal(response.status, 409); assert.equal(value.details.reason, kind === 'grund' ? 'schema_underlag_changed' : kind === 'unknown' ? 'schema_villkorsforslag_not_parked' : 'schema_placement_locked_lesson');
    assert.equal(motorCalls(), 0);
  }
});

test('en serverhärledd egen regel ger exakt ändring och en ny helkontroll; inga källidentiteter skickas till motorn', async () => {
  reset(); const input = body(), unchanged = structuredClone(input), response = await POST(request(input)), value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.suggestions.length, 1); assert.equal(value.testedCandidates, 1);
  assert.equal(value.suggestions[0].change.resource.name, 'Provlärare'); assert.deepEqual(value.suggestions[0].change.before, margin());
  assert.equal(value.suggestions[0].change.after, null); assert.equal(value.suggestions[0].kontroll.total, 0);
  assert.equal(state.suggests.length, 1); assert.equal(state.validations.length, 3);
  const u = buildSchemaUnderlag(plan, input, basis());
  assert.deepEqual(parseSchemaVillkorsforslag(value, input, u.problem.lessons.map(l => l.id), u.problem.links), value);
  const next = tillampaSchemaVillkorsandring(input.villkor, value.suggestions[0].change); assert.equal(next.egna.length, 0); assert.deepEqual(input, unchanged);
  const sent = JSON.stringify([...state.validations.map(c => c.problem), ...state.suggests.map(c => c.problem)]);
  for (const secret of [id(10), id(20), id(30), 'Provlärare', 'Provklass', 'Matematik', 'source-1']) assert.ok(!sent.includes(secret), secret);
});

test('skoladministratören använder sitt eget mandat utan extra personalläsning', async () => {
  reset(); state.role = 'administrator'; const response = await POST(request(body()));
  assert.equal(response.status, 200); assert.ok(state.reads.some(r => r.type === 'plan' && r.role === 'administrator')); assert.ok(!state.reads.some(r => r.type === 'personal'));
});

test('ett regelbrott i baseline, felaktig ny kandidat och fabricerade mått lämnar inga alternativ', async () => {
  for (const flag of ['invalidValidation', 'invalidCandidateValidation', 'misreportedMetrics']) {
    reset(); const input = body(); state[flag] = true;
    const response = await POST(request(input)), value = await response.json();
    assert.equal(response.status, flag === 'invalidValidation' ? 409 : 503);
    assert.equal(value.details.reason, flag === 'invalidValidation' ? 'schema_placement_invalid_baseline' : 'schema_engine_bad_reply');
    assert.ok(!Object.hasOwn(value, 'suggestions'));
  }
});

test('befintliga lås följer med sandlådan och ett brutet lås ger inget giltigt alternativ', async () => {
  reset(); const input = body(); input.locks = { grundFingerprint: input.grundFingerprint, placements: [input.placements[0]] };
  const response = await POST(request(input)); assert.equal(response.status, 200);
  assert.ok(state.suggests[0].problem.lessons.find(l => l.id === input.placements[0].lesson).locked);
  reset(); const broken = body(); broken.locks = { grundFingerprint: broken.grundFingerprint, placements: [broken.placements[0]] }; state.breakLock = true;
  const rejected = await POST(request(broken)); assert.equal(rejected.status, 400); assert.ok(!(await rejected.json()).suggestions);
});

test('källkrav, globala villkor och irrelevanta eller verkningslösa egna rader ger inga sökta uppluckringar', async () => {
  reset(); const villkor = { ...defaultSchemaVillkor(), lunch: null, breakMin: 0, sameDay: 'forbid', egna: [
    { slag: 'amne', ref: 'Okänt ämne', typ: 'sparrad', days: [0], startMin: 480, endMin: 600 },
    { slag: 'larare', ref: id(20), typ: 'dag', maxMin: 300 }, { slag: 'amne', ref: 'Matematik', typ: 'antal', count: 2 }] };
  const response = await POST(request(body(villkor))), value = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(value.suggestions, []); assert.equal(value.testedCandidates, 0); assert.equal(state.suggests.length, 0);
  assert.match(value.explanation, /begränsade sökning/u); assert.ok(!value.explanation.includes('omöjligt'));
});

test('högst tolv relevanta egna rader söks även om fler finns; tidsgräns ger en tydlig begränsning', async () => {
  reset(); state.emptySuggestions = true; state.motorTimedOut = true;
  const villkor = { ...defaultSchemaVillkor(), egna: Array.from({ length: 20 }, (_, i) => ({ slag: 'larare', ref: id(20), typ: 'sparrad', days: [i % 5], startMin: 480 + Math.floor(i / 5) * 120, endMin: 490 + Math.floor(i / 5) * 120 })) };
  const response = await POST(request(body(villkor))), value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.testedCandidates, 12); assert.equal(state.suggests.length, 12); assert.equal(value.timedOut, true);
  assert.match(value.explanation, /tolv/u); assert.match(value.explanation, /Tidsgränsen/u); assert.deepEqual(value.suggestions, []);
});

test('om den oberoende helkontrollen inte hinner klart lämnas ingen kandidat ut', async () => {
  reset(); allowed(); const input = body(); state.validationDelay = 30;
  const result = await schemaVillkorsforslag(plan, input, basis(), undefined, { timeMs: 15 });
  assert.equal(result.timedOut, true); assert.deepEqual(result.suggestions, []); assert.match(result.explanation, /färdigkontrollerade/u);
});

test('en regel som ändrar det verkliga passmönstret redovisas som krav på omberäkning, också med bevarade lås', async () => {
  reset(); allowed();
  const selectedPlan = structuredClone(plan); selectedPlan.classes[0].needs[0].needHt = 3240; selectedPlan.rows[0].needHt = 3240; selectedPlan.rows[0].teacherHt = 3240;
  const selectedBasis = basis(); selectedBasis.time.terms.ht.perWeekday = [17, 18, 18, 18, 18]; selectedBasis.time.terms.ht.weeks.at(-1).perWeekday[0] = 0;
  const villkor = { ...defaultSchemaVillkor(), egna: [{ slag: 'klass', ref: id(10), typ: 'sparrad', days: [0], startMin: 480, endMin: 990 }] };
  const input = body(villkor, selectedPlan, selectedBasis); input.locks = { grundFingerprint: input.grundFingerprint, placements: [input.placements[0]] };
  const result = await schemaVillkorsforslag(selectedPlan, input, selectedBasis);
  assert.equal(result.newGrundCandidates, 1); assert.equal(result.testedCandidates, 0); assert.deepEqual(result.suggestions, []);
  assert.match(result.explanation, /passen räknas om/u); assert.equal(state.suggests.length, 0);
});

test('högst tre separata, helt prövade alternativ lämnas till granskning', async () => {
  reset(); const villkor = { ...defaultSchemaVillkor(), egna: Array.from({ length: 5 }, (_, i) => ({ slag: 'larare', ref: id(20), typ: 'sparrad', days: [i], startMin: 480, endMin: 490 })) };
  const response = await POST(request(body(villkor))), value = await response.json();
  assert.equal(response.status, 200); assert.equal(value.suggestions.length, 3); assert.equal(value.testedCandidates, 3); assert.equal(state.suggests.length, 3);
  assert.deepEqual(value.suggestions.map(s => s.change.ruleIndex), [0, 1, 2]);
});

test('egen salregel namnges från serverns befintliga sal och egna fönster utökas i en enda rad', async () => {
  for (const typ of ['sparrad', 'tillaten']) {
    reset(); const villkor = { ...defaultSchemaVillkor(), salar: ['Provsal'], egna: [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['Provsal'] },
      { slag: 'sal', ref: 'Provsal', typ, days: [0], startMin: 480, endMin: 540 }] };
    const response = await POST(request(body(villkor))), value = await response.json();
    assert.equal(response.status, 200); assert.equal(value.suggestions.length, 1); assert.equal(value.suggestions[0].change.resource.name, 'Provsal');
    assert.equal(value.suggestions[0].change.ruleIndex, 1);
    if (typ === 'tillaten') assert.deepEqual(value.suggestions[0].change.after.days, [0, 1, 2, 3, 4]); else assert.equal(value.suggestions[0].change.after, null);
  }
});

test('en använd ansvarig efter oanvänd extrapersonal hittas utan indexkoppling till resursväljaren', async () => {
  reset(); allowed(); const selectedBasis = basis(); selectedBasis.personer.push({ ref: id(21), name: 'Oanvänd personal' }, { ref: id(22), name: 'Ansvarig personal' });
  const aktivitet = { id: 'aktivitet-1', typId: 'provtyp', typ: 'Möte', name: 'Personalmöte', classRefs: [], groupRefs: [], teacherRefs: [id(22)], rooms: [], durationMin: 20,
    veckor: { typ: 'alla' }, visibleFor: 'personal', margin: null, tid: { typ: 'motor', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 990 } };
  const villkor = { ...defaultSchemaVillkor(), aktiviteter: [aktivitet], egna: [{ ...margin(), ref: id(22) }] };
  const input = body(villkor, plan, selectedBasis), underlag = buildSchemaUnderlag(plan, input, selectedBasis);
  input.lesson = underlag.labels.lessons.find(l => l.egenAktivitet)?.id; state.lesson = input.lesson;
  input.placements = underlag.problem.lessons.filter(l => l.id !== input.lesson).map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: null }));
  const result = await schemaVillkorsforslag(plan, input, selectedBasis);
  assert.equal(result.suggestions.length, 1); assert.equal(result.suggestions[0].change.resource.name, 'Ansvarig personal'); assert.equal(result.testedCandidates, 1);
});

test('C12 prövas även genom separat verklig motor4 över HTTP med syntetiska spärrar, tillåtna tider och marginaler', { skip: process.env.SCHEMA_VILLKORSFORSLAG_ENGINE !== '1' }, async () => {
  const { spawn } = await import('node:child_process'), { randomBytes } = await import('node:crypto');
  const { parseSchemaCheck } = await import('./schema-contract.ts'), { parseSchemaMotorPlacering } = await import('./schema-placering.ts');
  const port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`, token = randomBytes(24).toString('hex');
  const service = spawn(new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url).pathname, [], {
    env: { SCHEMAMOTOR_ADDR: `127.0.0.1:${port}`, SCHEMAMOTOR_TOKEN: token }, stdio: 'ignore' });
  let spawnError; service.on('error', error => { spawnError = error; });
  const call = async (path, value) => {
    const response = await fetch(`${url}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value), signal: AbortSignal.timeout(7_000) });
    assert.equal(response.status, 200); return response.json();
  };
  const engineAt = placements => placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room === null ? [] : [p.room] }));
  const realMotor = { validate: async (problem, placements) => parseSchemaCheck(await call('/v1/validate', { problem, placements: engineAt(placements) }), problem),
    suggest: async (problem, placements, val) => parseSchemaMotorPlacering(await call('/v1/suggest', { problem, placements: engineAt(placements), ...val }), problem, { ...val, placements }) };
  try {
    for (let i = 0; ; i++) {
      if (spawnError) throw spawnError;
      try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* egen tjänst startar */ }
      assert.ok(i < 40, 'den separata syntetiska motorn startade inte'); await new Promise(r => setTimeout(r, 50));
    }
    for (const typ of ['sparrad', 'tillaten', 'marginal']) {
      reset(); state.realMotor = realMotor;
      const rule = typ === 'marginal' ? { ...margin(), beforeMin: 60, afterMin: 60 } : { slag: 'larare', ref: id(20), typ,
        days: typ === 'sparrad' ? [0, 1, 2, 3, 4] : [0], startMin: 480, endMin: typ === 'sparrad' ? 600 : 485 };
      const villkor = { ...defaultSchemaVillkor(), days: Array.from({ length: 5 }, () => ({ startMin: 480, endMin: 600 })), lunch: null, breakMin: 0, sameDay: 'allow', egna: [rule] };
      const input = body(villkor); input.placements = [];
      const original = buildSchemaUnderlag(plan, input, basis()), noPlacement = await realMotor.suggest(original.problem, [], { lesson: input.lesson, mode: 'lesson', depth: 1, target: null });
      assert.deepEqual(noPlacement.suggestions, [], `${typ}: originalet skulle vara spärrat`);
      const response = await POST(request(input)), value = await response.json();
      assert.equal(response.status, 200, JSON.stringify(value)); assert.equal(value.suggestions.length, 1, `${typ}: inget prövat alternativ`);
      const option = value.suggestions[0], next = tillampaSchemaVillkorsandring(input.villkor, option.change), candidate = buildSchemaUnderlag(plan, { ...input, villkor: next }, basis());
      assert.equal(candidate.grundFingerprint, original.grundFingerprint); assert.equal(option.kontroll.total, 0);
      assert.deepEqual((await realMotor.validate(candidate.problem, option.placement.placements)).violations, []);
      assert.equal(option.placement.placements.find(p => p.lesson === input.lesson)?.day !== undefined, true);
    }
  } finally {
    if (service.exitCode === null && !spawnError) { const exited = new Promise(resolve => service.once('exit', resolve)); service.kill('SIGTERM'); await exited; }
  }
});

test('motorfel behåller skyddad generisk felväg och ingen automatisk tillämpning sker', async () => {
  reset(); const input = body(), before = structuredClone(input); state.engineFailure = 'schema_engine_unconfigured';
  const response = await POST(request(input)); assert.equal(response.status, 503); assert.equal((await response.json()).details.reason, 'schema_engine_unconfigured');
  assert.deepEqual(input, before); assert.equal(state.suggests.length, 0);
});
