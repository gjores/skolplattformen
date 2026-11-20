// Simulerade POST-anrop genom riktiga routefunktioner, protectedRoute, MFA- och CSRF-kontroll.
// Session, SQL-läsare och motor är avsiktliga stubbar. Detta är inte ett Worker/OIDC/PostgreSQL-prov.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor } from './schema-contract.ts';
import { laggTillSal, sattSalbehov, tomtSalbehov } from './schema-salregister.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';
import { parseSchemaFortsatt } from './schema-fortsatt.ts';
import { parseSchemaNyttProvForslag } from './schema-nytt-prov.ts';
import { NATIONELLA_PROV_VERSION } from './nationella-prov.ts';

const id = n => `73111500-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ISSUER = 'http://host.docker.internal:8180/realms/skolplattform-test';
const plan = { contractVersion: 1, unitId: id(1), schoolYear: 2026, schoolName: 'Syntetisk provskola', revision: 1, version: null, versions: [],
  teachers: [{ personId: id(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
  classes: [{ classId: id(10), name: 'Provklass', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey: 'source-1', rowKey: 'ma', label: 'Matematik', needHt: 1200, needVt: 1200, needBasis: 'terms' }] }],
  groups: [], rows: [{ id: id(40), lineageId: id(41), sourceKind: 'class_timplan', sourceKey: 'source-1', classId: id(10), rowKey: 'ma', personId: id(20), teacherHt: 1200, teacherVt: 1200,
    needHt: 1200, needVt: 1200, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }],
  specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: false } };
let state;
const event = action => ({ action, objectType: 'school', objectId: id(1), details: { unitId: id(1), schoolYear: 2026 } });
const pupils = () => state.seePupils ? [{ id: id(30), name: 'Syntetisk provelev', classIds: [id(10)] }] : [];
const fake = globalThis.__schemaRoutesTest = {
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
    const actor = { identityId: id(4), assignmentId: id(6) };
    if (sql.includes('public.nationella_prov_read')) {
      state.reads.push({ type: 'prov', input: values[0] });
      return [{ result: { actor, contractVersion: NATIONELLA_PROV_VERSION, result: { register: state.provRegister ?? null } } }];
    }
    if (sql.includes('public.schema_read')) return [{ result: { actor, contractVersion: 'schema_draft_sql_v1', result: { draft: null } } }];
    if (sql.includes('public.schema_dated_basis')) {
      state.reads.push({ type: 'dated' });
      return [{ result: { actor, contractVersion: 'schema_dated_basis_sql_v1', result: {
        unitId: id(1), schoolYear: 2026, complete: true, placements: [{ id: id(60), pupilId: id(30), startsOn: '2026-07-01', endsOn: null }],
        classMemberships: [{ placementId: id(60), pupilId: id(30), classId: id(10), startsOn: '2026-07-01', endsOn: null }], groups: [], memberships: [],
      } } }];
    }
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
  async lasar() { state.reads.push({ type: 'lasar' }); return { body: state.calendar ?? { calendar: null, versions: [] }, event: event('lasar_read') }; },
  async solve(problem, timeMs, seed) {
    assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'), 'motorn nåddes före lyckad audit');
    if (state.provRegister) assert.ok(state.reads.some(r => r.type === 'prov'), 'provplanen ska läsas före den första motorkörningen');
    state.solves.push(structuredClone(problem));
    state.solveTimes = [...state.solveTimes ?? [], timeMs];
    state.solveSeeds = [...state.solveSeeds ?? [], seed];
    if (state.engineFailure) throw new SchemaEngineError(state.engineFailure);
    return { status: 'complete', placements: problem.lessons.map((l, i) => ({ lesson: l.id, day: l.locked?.day ?? 1, startMin: l.locked?.start_min ?? 600 + i * 120, room: l.rooms?.allowed[0] ?? null })), unplaced: [], diagnoses: [],
      metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 };
  },
  async positions(problem, placements, lesson) {
    if (!state.positions) throw Error('Motor must not be reached');
    state.positionCalls = [...state.positionCalls ?? [], { problem: structuredClone(problem), placements: structuredClone(placements), lesson }];
    return { lesson, positions: state.positions.map(p => ({ ...p, room: null, state: 'fri', costDelta: 0, reasons: [] })) };
  },
  async diagnose(problem) { state.diagnoses.push(structuredClone(problem)); return []; },
  async suggest(problem, placements, input) {
    assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'), 'förslagsmotorn nåddes före lyckad audit');
    state.suggests.push({ problem: structuredClone(problem), placements: structuredClone(placements), mode: input.mode, lesson: input.lesson, depth: input.depth });
    if (state.engineFailure) throw new SchemaEngineError(state.engineFailure);
    const own = placements.find(p => p.lesson === input.lesson), to = { lesson: input.lesson, day: input.target?.day ?? own?.day ?? 1, startMin: input.target?.startMin ?? (own?.startMin ?? 480) + 10, room: input.target?.room ?? own?.room ?? null };
    const after = [...placements.filter(p => p.lesson !== input.lesson), to];
    return { depth: input.depth, timedOut: false, elapsedMs: 1, suggestions: [{ placements: after, changes: [{ lesson: input.lesson, from: own ?? null, to }],
      metricsBefore: { studentGapMin: 0, teacherGapMin: 0, cost: 0 }, metricsAfter: { studentGapMin: state.misreportedMetrics ? 999 : 0, teacherGapMin: 0, cost: 1 }, cost: 1 }] };
  },
  async validate(problem, placements) { state.validations.push({ problem: structuredClone(problem), placements: structuredClone(placements) }); return {
    violations: state.invalidValidation || state.invalidCandidateValidation && state.suggests.length ? [{ code: 'teacher_clash', message: 'Syntetisk regelavvikelse.', lessons: [placements[0].lesson], resources: [] }] : [],
    metrics: { studentGapMin: 0, teacherGapMin: 0, cost: state.suggests.length ? 1 : 0 } }; },
};
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  let source;
  const is = name => url === new URL(name, server).href;
  if (is('db.ts')) source = `export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} }
    export const withLoginPhase=(...args)=>globalThis.__schemaRoutesTest.login(...args);
    export const withSessionContext=(ctx,fn)=>globalThis.__schemaRoutesTest.sessionContext(ctx,fn,Deny);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__schemaRoutesTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__schemaRoutesTest.env;';
  if (is('tjanst.ts')) source = `export const planRead=(...a)=>globalThis.__schemaRoutesTest.planRead(...a);export const personalRead=(...a)=>globalThis.__schemaRoutesTest.personalRead(...a);
    export const tjanstRequest=(...a)=>globalThis.__schemaRoutesTest.parseRequest(...a);
    export { parsePlanReadRequest } from '${new URL('./tjanst-contract.ts', import.meta.url).href}';`;
  if (is('elective-block.ts')) source = 'export const readElectiveBlocks=(...a)=>globalThis.__schemaRoutesTest.elective(...a);';
  if (is('study-groups.ts')) source = 'export const readStudyGroups=(...a)=>globalThis.__schemaRoutesTest.study(...a);';
  if (is('lasar.ts')) source = 'export const lasarRead=(...a)=>globalThis.__schemaRoutesTest.lasar(...a);';
  if (is('skolsalar.ts')) source = 'export const readSkolsalar=async()=>globalThis.__schemaSkolsalar??null;export const skolsalarDokument=r=>r?.document??null;';
  if (is('schemamotor.ts')) source = `export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const solveSchema=(...a)=>globalThis.__schemaRoutesTest.solve(...a);
    export const freshSchemaSolveSeed=()=>globalThis.__schemaRoutesTest.freshSeed();
    export const diagnoseSchema=(...a)=>globalThis.__schemaRoutesTest.diagnose(...a);
    export const suggestSchema=(...a)=>globalThis.__schemaRoutesTest.suggest(...a);
    export const validateSchema=(...a)=>globalThis.__schemaRoutesTest.validate(...a);export const positionsSchema=(...a)=>globalThis.__schemaRoutesTest.positions(...a);`;
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts');
const { SchemaEngineError } = await import('./server/schemamotor.ts');
const routes = Object.fromEntries(await Promise.all(['forslag', 'fortsatt', 'kontroll', 'lagen', 'folj', 'samling', 'aktiviteter', 'diagnos', 'fonster', 'placering', 'underlag'].map(async name => [name, (await import(`../app/api/schema/${name}/route.ts`)).POST])));
fake.freshSeed = () => { state.seedCount = (state.seedCount ?? 0) + 1; return 123_000 + state.seedCount; };
const reset = () => { state = { role: 'rektor', seePupils: true, reads: [], events: [], solves: [], validations: [], diagnoses: [], suggests: [] }; };
const scope = villkor => ({ unitId: id(1), schoolYear: 2026, period: 'ht', villkor: villkor ?? defaultSchemaVillkor() });
const basis = () => ({ members: { pupils: pupils().map(p => ({ id: p.id, classIds: p.classIds })), memberships: [] }, time: defaultSchemaTime(),
  ...(state.role === 'rektor' ? { personer: [{ ref: id(20), name: 'Provlärare' }] } : {}) });
function body(name, villkor = defaultSchemaVillkor()) {
  const input = scope(villkor), u = buildSchemaUnderlag(plan, input, basis());
  const placements = u.problem.lessons.filter(l => !l.id.startsWith('pass-9')).map((l, i) => ({ lesson: l.id, day: 1, startMin: 600 + i * 120, room: null }));
  if (name === 'forslag' || name === 'diagnos' || name === 'underlag') return input;
  if (name === 'fonster') return { unitId: input.unitId, schoolYear: input.schoolYear };
  const request = { ...input, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: u.grundFingerprint, placements };
  if (name === 'placering') return { ...request, mode: 'lesson', lesson: u.problem.lessons[0].id, target: null, depth: 1 };
  if (name === 'lagen' || name === 'folj') return { ...request, lesson: u.problem.lessons[0].id, pupilId: null };
  return name === 'aktiviteter' ? { ...request, previousVillkor: villkor } : request;
}
const request = (name, value, headers = {}) => new Request(`http://localhost:3012/api/schema/${name}`, { method: 'POST', headers: { Origin: 'http://localhost:3012', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(value) });
const own = extra => ({ id: 'aktivitet-1', typId: 'provtyp', typ: 'Mentorstid', name: 'Syntetisk mentorstid', classRefs: [id(10)], groupRefs: [], teacherRefs: [id(20)], rooms: [], durationMin: 20,
  veckor: { typ: 'alla' }, visibleFor: 'alla', margin: null, tid: { typ: 'fast', day: 0, startMin: 480 }, ...extra });

test('alla schemarutter stoppar saknad/återkallad session, inaktuellt mandat, fel roll, MFA och korsursprung före data/motor', async () => {
  const cases = [{ change: { noSession: true }, code: 'no_session', status: 401 }, { change: { revoked: true }, code: 'session_revoked', status: 401 },
    { change: { liveDeny: true }, code: 'assignment_ended', status: 403 }, { change: { liveRole: 'larare' }, code: 'forbidden', status: 403 },
    { change: { liveEpoch: 2 }, code: 'context_changed', status: 409 }, { change: { noMfa: true }, code: 'mfa_required', status: 403 },
    { change: {}, headers: { Origin: 'https://annan.example.test' }, code: 'csrf', status: 403 }];
  for (const [name, POST] of Object.entries(routes)) for (const c of cases) {
    reset(); const value = body(name); Object.assign(state, c.change);
    const res = await POST(request(name, value, c.headers));
    assert.equal(res.status, c.status, `${name}: ${c.code}`); assert.equal((await res.json()).code, c.code);
    assert.equal(state.reads.length, 0); assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0);
    assert.ok(state.events.some(e => e.outcome === 'denied')); assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});

test('samlingsvyn använder aktuell skolavgränsning och lämnar inga data när källan nekar', async () => {
  reset(); const value = { ...body('samling'), unitId: id(99) };
  const res = await routes.samling(request('samling', value));
  assert.equal(res.status, 403); assert.equal((await res.json()).code, 'forbidden');
  assert.deepEqual(state.reads.map(r => r.type), ['plan']); assert.equal(state.reads[0].input.unitId, id(99));
});

test('obligatorisk audit måste lyckas innan samlings- eller aktivitetsdata och motoranrop lämnas', async () => {
  for (const name of ['samling', 'aktiviteter', 'placering', 'fortsatt']) {
    reset(); const value = body(name); state.auditFails = true; state.auditAction = 'tjanst_plan_read';
    const res = await routes[name](request(name, value));
    assert.equal(res.status, 500); assert.equal((await res.json()).code, 'audit_unavailable');
    assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0); assert.ok(!state.events.some(e => e.outcome === 'ok'));
    // Även en tidigare extra källäsningshändelse måste stoppa utfallet. Den befintliga felvägen ger generellt bad_request/500.
    reset(); const earlier = body(name); state.auditFails = true; state.auditAction = 'elective_blocks_read';
    const failedRead = await routes[name](request(name, earlier));
    assert.equal(failedRead.status, 500); assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0);
    assert.ok(!(await failedRead.text()).includes('Syntetisk provelev'));
  }
});

test('samlingsvyn ger elever bara från behörigt lästa källor och sänder aldrig elevens interna ID', async () => {
  reset(); let res = await routes.samling(request('samling', body('samling'))), data = await res.json();
  assert.equal(res.status, 200); assert.ok(data.resources.some(r => r.slag === 'elev' && r.name === 'Syntetisk provelev'));
  assert.ok(!JSON.stringify(data).includes(id(30))); assert.ok(state.events.filter(e => e.outcome === 'ok').length >= 4);
  reset(); state.seePupils = false; res = await routes.samling(request('samling', body('samling'))); data = await res.json();
  assert.equal(res.status, 200); assert.ok(!data.resources.some(r => r.slag === 'elev')); assert.ok(!JSON.stringify(data).includes('Syntetisk provelev'));
});

test('personalens separata läsmandat utvidgas inte för administratören', async () => {
  reset(); state.role = 'administrator'; const res = await routes.samling(request('samling', body('samling')));
  assert.equal(res.status, 200); assert.ok(!state.reads.some(r => r.type === 'personal'));
});

test('främmande aktivitetsresurs ger kontrollerat 400 på alla beräknings- och läsrutter', async () => {
  for (const [name, POST] of Object.entries(routes).filter(([name]) => name !== 'fonster')) {
    reset(); const value = body(name), villkor = { ...value.villkor, aktiviteter: [own({ teacherRefs: [id(999)] })] };
    const res = await POST(request(name, { ...value, villkor }));
    assert.equal(res.status, 400, name); assert.equal((await res.json()).code, 'bad_request');
    assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0);
  }
});

test('gammalt kontrakt stoppas före källäsning och gammal grund stoppas före motorn', async () => {
  for (const name of ['samling', 'aktiviteter', 'placering', 'fortsatt']) {
    reset(); let res = await routes[name](request(name, { ...body(name), contractVersion: SCHEMA_CONTRACT_VERSION - 1 }));
    assert.equal(res.status, 400); assert.equal((await res.json()).details.reason, 'schema_contract_version'); assert.equal(state.reads.length, 0);
    reset(); res = await routes[name](request(name, { ...body(name), grundFingerprint: 'a'.repeat(28) }));
    assert.equal(res.status, 409); assert.equal((await res.json()).code, 'schema_underlag_changed'); assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0);
  }
});

test('fast aktivitet låses på servern, bevarar undervisningens placering och ger ingen timplanetid', async () => {
  reset(); const value = body('aktiviteter'), previous = value.villkor;
  const before = await routes.forslag(request('forslag', scope())), prior = await before.json(); state.solves = []; state.validations = [];
  const res = await routes.aktiviteter(request('aktiviteter', { ...value, previousVillkor: previous, villkor: { ...previous, aktiviteter: [own()] } }));
  assert.equal(res.status, 200); const data = await res.json(), added = data.forslag.lessons.find(l => l.egenAktivitet);
  assert.equal(state.solves.length, 0); assert.deepEqual([added.day, added.startMin], [0, 480]);
  assert.deepEqual(data.forslag.teachings, prior.teachings);
  assert.deepEqual(data.forslag.lessons.filter(l => !l.egenAktivitet).map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })), value.placements);
  const locked = state.validations[0].problem.lessons.find(l => l.id === added.id); assert.deepEqual(locked.locked, { day: 0, start_min: 480 });
  const invalid = { ...value, villkor: data.forslag.villkor, grundFingerprint: data.forslag.grundFingerprint, placements: [...value.placements, { lesson: added.id, day: 1, startMin: 480, room: null }] };
  state.validations = []; const denied = await routes.kontroll(request('kontroll', invalid));
  assert.equal(denied.status, 400); assert.equal(state.validations.length, 0);
});

test('en ny motorplacerad aktivitet lämnar tidigare parkerad undervisning och antalet olagda pass oförändrade', async () => {
  reset(); const value = body('aktiviteter'), previous = value.villkor;
  const a = own({ tid: { typ: 'motor', days: [1, 2, 3], startMin: 840, endMin: 990 }, durationMin: 60 });
  const res = await routes.aktiviteter(request('aktiviteter', { ...value, placements: [], previousVillkor: previous, villkor: { ...previous, aktiviteter: [a] } }));
  assert.equal(res.status, 200); const data = await res.json();
  assert.ok(data.forslag.metrics.unplaced > 0);
  assert.ok(data.forslag.lessons.filter(l => !l.egenAktivitet).every(l => l.day === null && l.startMin === null));
  assert.equal(data.forslag.metrics.unplaced, data.forslag.lessons.filter(l => !l.egenAktivitet).length);
  assert.ok(data.forslag.lessons.some(l => l.egenAktivitet && l.day !== null));
});


test('fördiagnos och fönster prövar skolmandat och obligatorisk audit före data och motor', async () => {
  for (const name of ['diagnos', 'fonster', 'placering']) {
    reset(); const denied = await routes[name](request(name, { ...body(name), unitId: id(99) }));
    assert.equal(denied.status, 403, name); assert.deepEqual(state.reads.map(r => r.type), ['plan']); assert.equal(state.diagnoses.length, 0);
    reset(); const input = body(name); state.auditFails = true; state.auditAction = 'tjanst_plan_read';
    const failed = await routes[name](request(name, input));
    assert.equal(failed.status, 500, name); assert.equal(state.diagnoses.length, 0); assert.ok(!(await failed.text()).includes('Provlärare'));
  }
});

test('fönster ger bara kontrollerat skolurval och sessionsavgränsning; ingen överförd roll eller elevlista', async () => {
  reset(); const response = await routes.fonster(request('fonster', body('fonster')));
  assert.equal(response.status, 200); const data = await response.json();
  assert.deepEqual(data, { unitId: id(1), schoolYear: 2026, scopeKey: `1:${id(7)}:${id(6)}` });
  assert.deepEqual(state.reads.map(r => r.type), ['plan']); assert.equal(state.diagnoses.length + state.solves.length, 0);
  reset(); const bad = await routes.fonster(request('fonster', { ...body('fonster'), scopeKey: 'påhittat-mandat', role: 'rektor' }));
  assert.equal(bad.status, 400); assert.equal(state.reads.length, 0);
});

test('underlaget före första förslaget läses efter auditen utan något motoranrop och utan lagda pass', async () => {
  reset(); const input = body('underlag'), response = await routes.underlag(request('underlag', input));
  assert.equal(response.status, 200); const data = await response.json();
  const { parseSchemaUnderlagslasning } = await import('./schema-underlagslasning.ts');
  const forslag = parseSchemaUnderlagslasning(data, input);
  assert.equal(data.beraknat, false); assert.ok(forslag.lessons.length > 0); assert.ok(forslag.lessons.every(l => l.day === null && l.roomId === null));
  assert.ok(forslag.resurser.klass.length > 0); assert.ok(forslag.fordelning.length > 0);
  assert.equal(state.solves.length + state.validations.length + state.diagnoses.length + state.suggests.length, 0);
  assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'));
  // Ett beräknat förslag godtas aldrig som underlagsläsning.
  assert.throws(() => parseSchemaUnderlagslasning({ ...data, beraknat: true }, input));
  assert.throws(() => parseSchemaUnderlagslasning({ ...data, forslag: { ...data.forslag, lessons: data.forslag.lessons.map((l, i) => i ? l : { ...l, day: 0, startMin: 480 }) } }, input));
});

test('fördiagnos anropar motorn efter auditen med anonymt underlag och utan sökning', async () => {
  reset(); const response = await routes.diagnos(request('diagnos', body('diagnos')));
  assert.equal(response.status, 200); const data = await response.json();
  assert.equal(data.version, SCHEMA_CONTRACT_VERSION); assert.ok(Array.isArray(data.findings));
  assert.equal(state.diagnoses.length, 1); assert.equal(state.solves.length, 0);
  const sent = JSON.stringify(state.diagnoses[0]);
  assert.ok(!sent.includes('Syntetisk') && !sent.includes(id(30)) && !sent.includes(id(20)));
  assert.ok(state.events.some(e => e.action === 'tjanst_plan_read' && e.outcome === 'ok'));
});

test('placeringsrutten bygger själv underlaget efter audit och kontrollerar hela kandidaten före svar', async () => {
  reset(); const input = body('placering'), response = await routes.placering(request('placering', input));
  assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.contractVersion, SCHEMA_CONTRACT_VERSION); assert.equal(result.grundFingerprint, input.grundFingerprint);
  assert.equal(result.suggestions.length, 1); assert.equal(state.suggests.length, 1); assert.equal(state.validations.length, 2);
  assert.deepEqual(state.validations[0].placements, input.placements);
  assert.deepEqual(state.validations[1].placements, result.suggestions[0].placements);
  assert.deepEqual(state.validations[1].problem.reference.map(p => [p.lesson, p.day, p.start_min]), input.placements.map(p => [p.lesson, p.day, p.startMin]));
  const sent = JSON.stringify(state.suggests[0]);
  assert.ok(!sent.includes('Syntetisk') && !sent.includes(id(30)) && !sent.includes(id(20)));
  assert.equal(state.solves.length, 0);
});

test('låst målpass, främmande pass och klientangivet motorproblem når aldrig placeringsmotorn', async () => {
  reset(); const input = body('placering'), locked = input.placements.find(p => p.lesson === input.lesson);
  const response = await routes.placering(request('placering', { ...input, locks: { grundFingerprint: input.grundFingerprint, placements: [locked] } }));
  assert.equal(response.status, 409); assert.equal((await response.json()).details.reason, 'schema_placement_locked_lesson'); assert.equal(state.suggests.length, 0);
  for (const change of [{ lesson: 'pass-99999' }, { problem: { lessons: [] } }]) {
    reset(); const bad = await routes.placering(request('placering', { ...body('placering'), ...change }));
    assert.equal(bad.status, 400); assert.equal(state.suggests.length, 0);
  }
});

test('placeringsförslag med ett regelbrott lämnas aldrig ut och fel ändrar inga underlag', async () => {
  reset(); state.invalidCandidateValidation = true;
  const response = await routes.placering(request('placering', body('placering')));
  assert.equal(response.status, 503); const data = await response.json();
  assert.equal(data.details.reason, 'schema_engine_bad_reply'); assert.ok(!Object.hasOwn(data, 'suggestions'));
  assert.equal(state.suggests.length, 1); assert.equal(state.validations.length, 2); assert.equal(state.solves.length, 0);
});

test('hård baslinje och otillgänglig motor får skilda placeringsbesked utan råa diagnosdata', async () => {
  for (const [reason, status] of [['schema_placement_invalid_baseline', 409], ['schema_engine_unreachable', 503]]) {
    reset(); state.engineFailure = reason;
    const response = await routes.placering(request('placering', body('placering'))), data = await response.json();
    assert.equal(response.status, status); assert.equal(data.details.reason, reason); assert.ok(!Object.hasOwn(data, 'suggestions'));
    assert.ok(!JSON.stringify(data).includes('Provlärare')); assert.equal(state.validations.length, 1);
  }
});

test('placeringsrutten nekar påhittad förbättring i måtten efter oberoende före/efter-kontroll', async () => {
  reset(); state.misreportedMetrics = true;
  const response = await routes.placering(request('placering', body('placering'))), data = await response.json();
  assert.equal(response.status, 503); assert.equal(data.details.reason, 'schema_engine_bad_reply');
  assert.equal(state.validations.length, 2); assert.ok(!Object.hasOwn(data, 'suggestions'));
});

test('hård baslinje stoppas redan av appruttens oberoende kontroll före sökning', async () => {
  reset(); state.invalidValidation = true;
  const response = await routes.placering(request('placering', body('placering'))), data = await response.json();
  assert.equal(response.status, 409); assert.equal(data.details.reason, 'schema_placement_invalid_baseline');
  assert.equal(state.validations.length, 1); assert.equal(state.suggests.length, 0);
});

test('fördiagnos och förslag visar en omöjlig lektionsfördelning utan att anropa motorn', async()=>{
  for(const name of ['diagnos','forslag']){
    reset();const villkor={...defaultSchemaVillkor(),egna:[{slag:'klass',ref:id(10),typ:'antal',count:10}]};
    const response=await routes[name](request(name,scope(villkor))),result=await response.json();
    assert.equal(response.status,400);assert.equal(result.code,'schema_fordelning_invalid');assert.ok(result.details.issues.length>0);assert.match(result.details.issues.join(' '),/lektion|pass/i);
    assert.equal(state.solves.length+state.diagnoses.length,0);
  }
});

// 05.2-SM-UXF-43: med salregister fyller kontrollen ingen sal, pass utan sal upptar ingen sal hos motorn, och lägena behåller passets sal bara där den är ledig.
// Två matematikpass i veckan: behovet dubblas under provet och återställs efteråt.
function dubbelt(fn) {
  const fore = structuredClone({ needs: plan.classes[0].needs, rows: plan.rows });
  for (const x of [...plan.classes[0].needs, ...plan.rows]) { x.needHt *= 2; x.needVt *= 2; if ('teacherHt' in x) { x.teacherHt *= 2; x.teacherVt *= 2; } }
  return Promise.resolve(fn()).finally(() => { plan.classes[0].needs = fore.needs; plan.rows = fore.rows; });
}
function medSalregister() {
  let v = defaultSchemaVillkor();
  for (const name of ['A101', 'A102']) v = laggTillSal(v, { name, typ: 'Allmän sal', platser: 30, utrustning: [] });
  return sattSalbehov(v, 'amne', 'Matematik', tomtSalbehov('allman'));
}
test('med salregister: kontrollen fyller ingen sal och motorn får passen utan sal utan salkrav', () => dubbelt(async () => {
  reset(); const v = medSalregister(), value = body('kontroll', v);
  assert.ok(value.placements.length >= 2 && value.placements.every(p => p.room === null));
  const res = await routes.kontroll(request('kontroll', value));
  assert.equal(res.status, 200); const svar = await res.json();
  assert.deepEqual(svar.rooms, {}, 'ingen sal fylls i');
  const sent = state.validations.at(-1);
  assert.ok(sent.placements.every(p => p.room === null));
  // Underlaget har salkrav; validateSchema i server/schemamotor.ts tar bort det för pass utan sal (prövat i schema-utan-sal.test.mjs).
  assert.ok(sent.problem.lessons.filter(l => value.placements.some(p => p.lesson === l.id)).every(l => l.rooms?.allowed.length === 2));
  // Utan register fylls första lediga tillåtna sal i som förut.
  reset(); const utan = defaultSchemaVillkor(); utan.salar = ['A101']; utan.egna = [{ slag: 'amne', ref: 'Matematik', typ: 'sal', rooms: ['A101'] }];
  const gammal = body('kontroll', utan), r2 = await routes.kontroll(request('kontroll', gammal));
  assert.equal(r2.status, 200); const s2 = await r2.json();
  assert.ok(Object.values(s2.rooms).length > 0 && Object.values(s2.rooms).every(r => r === 'sal-1'), 'äldre utkast fyller i sal');
}));

function bokatProv(datum = '2026-12-01') {
  state.provRegister = { revision: 4, savedAt: '2026-10-18T10:00:00.000Z', document: { granskad: true, bokningar: [{
    id: id(71), namn: 'Syntetiskt nationellt prov', undervisning: 'undervisning:source-1', mal: { slag: 'klass', ref: id(10) }, datum,
    tidsval: 'fast', startMin: 540, slutMin: 600, salId: null, vakter: [], kontrolleradDatum: '2026-10-18',
  }] } };
}

function kalenderForProv() {
  state.calendar = { target: { kind: 'school', unitId: id(1) }, schoolYear: 2026, groups: [], versions: [{ versionId: id(70), current: true }],
    calendar: { versionId: id(70), version: 1, status: 'faststalld', revision: 1,
      terms: { ht: { start: '2026-08-17', end: '2026-12-18' }, vt: { start: '2027-01-11', end: '2027-06-11' } },
      exceptions: {}, groupDays: {}, shortWeeks: {}, frameVersionId: null, contentHash: 'synthetic', decidedOn: '2026-03-18', history: [] } };
}

test('första beräkningen läser provplan, deltagare och kalender innan motorn och levererar en samlad plan utan att skriva', async () => {
  reset(); bokatProv(); kalenderForProv();
  const villkor = medSalregister(), input = scope(villkor);
  globalThis.__schemaSkolsalar = { document: { nasta: 3, salar: villkor.salregister.salar } };
  try {
    const res = await routes.forslag(request('forslag', { ...input, planeraProv: true }));
    assert.equal(res.status, 200);
    const { forslag, provplanering } = parseSchemaNyttProvForslag(await res.json(), input);
    assert.equal(forslag.metrics.unplaced, 0);
    assert.deepEqual([provplanering.draftId, provplanering.expectedRevision, provplanering.provrevision, provplanering.bookings], [null, 0, 4, 1]);
    assert.ok(state.reads.findIndex(r => r.type === 'prov') < state.reads.findIndex(r => r.type === 'dated'));
    assert.ok(state.validations.some(x => x.problem.id === 'datum-2026-12-01'));
    assert.equal(state.provRegister.document.bokningar[0].salId, null);
  } finally { delete globalThis.__schemaSkolsalar; }
});

test('första förslaget kan lämnas som förut när termen saknar prov och stoppar oklart provunderlag före motorn', async () => {
  const input = scope();
  reset(); bokatProv('2027-05-12'); kalenderForProv();
  const anotherTerm = await routes.forslag(request('forslag', { ...input, planeraProv: true }));
  assert.equal(anotherTerm.status, 200);
  assert.equal(parseSchemaNyttProvForslag(await anotherTerm.json(), input).provplanering, undefined);
  assert.equal(state.reads.some(r => r.type === 'dated'), false);
  reset(); bokatProv();
  const missingCalendar = await routes.forslag(request('forslag', { ...input, planeraProv: true }));
  assert.equal(missingCalendar.status, 409);
  assert.equal((await missingCalendar.json()).details.reason, 'schema_nytt_prov_calendar');
  assert.equal(state.solves.length, 0);
  reset(); bokatProv(); kalenderForProv(); state.role = 'administrator';
  const roleLimited = await routes.forslag(request('forslag', { ...input, planeraProv: true }));
  assert.equal(roleLimited.status, 403);
  assert.equal((await roleLimited.json()).details.reason, 'schema_nytt_prov_rektor');
  assert.equal(state.reads.some(r => r.type === 'personal'), false);
  assert.equal(state.solves.length, 0);
});
test('med salregister: lägena prövar tiden utan sal och behåller passets egen sal bara där den är ledig', () => dubbelt(async () => {
  reset(); const v = medSalregister(), value = body('lagen', v);
  const [forsta, andra] = value.placements;
  value.placements = value.placements.map(p => p.lesson === forsta.lesson ? { ...p, day: 0, startMin: 480, room: 'sal-1' } : p.lesson === andra.lesson ? { ...p, day: 1, startMin: 600, room: 'sal-1' } : p);
  value.lesson = forsta.lesson;
  state.positions = [{ day: 1, startMin: 600 }, { day: 1, startMin: 900 }];
  const res = await routes.lagen(request('lagen', value));
  assert.equal(res.status, 200); const svar = await res.json();
  const call = state.positionCalls.at(-1);
  assert.equal(call.lesson, forsta.lesson);
  assert.equal(call.placements.find(p => p.lesson === forsta.lesson).room, null, 'passet prövas utan sal');
  assert.equal(call.problem.lessons.find(l => l.id === forsta.lesson).rooms, undefined, 'motorn får passet utan salkrav');
  assert.deepEqual(svar.positions.map(p => [p.startMin, p.room]), [[600, null], [900, 'sal-1']], 'upptagen vid 10:00, ledig vid 15:00');
}));

test('första förslag och fortsatt beräkning skickar vald räknetid; äldre klient utan tid får 30 sekunder', async () => {
  for (const name of ['forslag', 'fortsatt']) for (const time of [undefined, 10_000, 30_000, 60_000]) {
    reset(); const value = { ...body(name), ...(time === undefined ? {} : { solveTimeMs: time }) };
    const res = await routes[name](request(name, value));
    assert.equal(res.status, 200, `${name}: ${time}`); assert.deepEqual(state.solveTimes, [time ?? 30_000]);
    assert.deepEqual(state.solveSeeds, [name === 'fortsatt' ? 123_001 : undefined]);
    if (name === 'fortsatt') parseSchemaFortsatt(await res.json(), value);
  }
});

test('varje fortsättning får nytt serverfrö även från oförändrad referens; klienten får inte välja frö', async () => {
  reset(); const input = body('fortsatt');
  for (let i = 0; i < 2; i++) assert.equal((await routes.fortsatt(request('fortsatt', input))).status, 200);
  assert.deepEqual(state.solveSeeds, [123_001, 123_002]);
  assert.deepEqual(state.solves[0].reference, state.solves[1].reference);
  for (const name of ['fortsatt', 'forslag']) {
    reset(); assert.equal((await routes[name](request(name, { ...body(name), seed: 7 }))).status, 400);
    assert.equal(state.solves.length + state.reads.length, 0);
  }
});

test('fortsättning utgår från de handgjorda placeringarna, bevarar lås och lämnar före/efter utan skrivning', async () => {
  reset(); const value = { ...body('fortsatt'), solveTimeMs: 60_000 };
  value.placements[0] = { ...value.placements[0], day: 2, startMin: 755 };
  value.locks = { grundFingerprint: value.grundFingerprint, placements: [value.placements[0]] };
  const before = structuredClone(value), res = await routes.fortsatt(request('fortsatt', value));
  assert.equal(res.status, 200); const result = parseSchemaFortsatt(await res.json(), value);
  assert.deepEqual(value, before, 'kommandot ändras inte'); assert.equal(state.validations.length, 2);
  assert.deepEqual(state.solves[0].reference, value.placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })));
  assert.deepEqual(state.solves[0].lessons[0].locked, { day: 2, start_min: 755 });
  assert.equal(result.forslag.lessons.find(l => l.id === value.placements[0].lesson).startMin, 755);
  assert.equal(result.before.metrics.placed, value.placements.length); assert.equal(result.after.metrics.placed, result.forslag.metrics.placed);
  assert.ok(state.events.every(e => !e.action.includes('save')), 'ingen sparhändelse');
});

test('fortsättning med salregister väljer inte sal åt redan lagda eller olagda pass utan sal', () => dubbelt(async () => {
  reset(); const value = { ...body('fortsatt', medSalregister()), solveTimeMs: 30_000 };
  value.placements = value.placements.slice(0, 1);
  const res = await routes.fortsatt(request('fortsatt', value));
  assert.equal(res.status, 200); const result = parseSchemaFortsatt(await res.json(), value);
  assert.ok(state.solves[0].lessons.every(l => !l.rooms));
  assert.ok(result.forslag.lessons.every(l => l.roomId === null));
  assert.ok(result.forslag.lessons.some(l => l.roomIds.length > 0), 'salbehoven finns kvar i granskningsförslaget');
}));

test('fortsättning stoppar felaktiga referenser, dubbla pass, saknat lås och ogiltig budget före motorn', async () => {
  const mutations = [
    r => { r.placements[0].lesson = 'pass-888888'; },
    r => { r.placements.push({ ...r.placements[0] }); },
    r => { r.locks = { grundFingerprint: r.grundFingerprint, placements: [{ ...r.placements[0] }] }; r.placements.shift(); },
    r => { r.solveTimeMs = 120_000; }, r => { r.solveTimeMs = '60000'; }, r => { r.extra = true; },
  ];
  for (const mutate of mutations) {
    reset(); const value = body('fortsatt'); mutate(value);
    const res = await routes.fortsatt(request('fortsatt', value));
    assert.equal(res.status, 400); assert.equal(state.solves.length + state.validations.length, 0);
  }
});

test('fortsättning nekar annan skola och redovisar motorfel utan kandidat eller insända personuppgifter', async () => {
  reset(); let res = await routes.fortsatt(request('fortsatt', { ...body('fortsatt'), unitId: id(999) }));
  assert.equal(res.status, 403); assert.equal(state.solves.length + state.validations.length, 0);
  for (const reason of ['schema_engine_busy', 'schema_engine_unreachable', 'schema_engine_bad_reply']) {
    reset(); const value = body('fortsatt'); state.engineFailure = reason;
    res = await routes.fortsatt(request('fortsatt', value)); const result = await res.json();
    assert.equal(res.status, 503); assert.equal(result.details.reason, reason);
    assert.ok(!Object.hasOwn(result, 'forslag')); assert.ok(!JSON.stringify(result).includes('Provlärare'));
  }
});
