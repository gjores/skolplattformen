// Riktiga POST-/mandat-/MFA-/CSRF-/auditfunktioner. Session, databassvar och motor är uttryckliga stubbar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { parseSchemaDatumSvar } from './schema-datum.ts';
import { parseSchemaProvforslagSvar } from './schema-provforslag.ts';
import { parseSchemaNyttProvForslag, parseSchemaNyttProvSaveReply } from './schema-nytt-prov.ts';
import { SCHEMA_DRAFT_VERSION, schemaDraftHash } from './schema-draft-contract.ts';
const id = n => `73111600-0000-4000-8000-${String(n).padStart(12, '0')}`, issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
let state;
const fake = globalThis.__schemaDatumServerTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'skolplattform-worker', MFA_MAX_AGE_SECONDS: '28800' },
  session() {
    if (state.noSession) return null;
    const now = new Date(Date.now() - 1000), future = new Date(Date.now() + 60000);
    return { token: 'synthetic-session', session: { id: id(3), identityId: id(4), membershipId: id(5), assignmentId: id(6), customerId: id(7), issuer, subject: 'synthetic-person', epoch: 1,
      expiresAt: future, absoluteExpiresAt: future, revokedAt: state.revoked ? now : null, proofIssuer: issuer, proofClientId: 'skolplattform-worker', proofAudience: ['skolplattform-worker'],
      proofProfileId: 'local-keycloak-admin', proofProfileVersion: 1, acr: '2', amr: state.noMfa ? ['pwd'] : ['pwd', 'otp'], authTime: now, proofCheckedAt: now } };
  },
  login: async (_corr, fn) => fn(fake.tx),
  async live(ctx, fn, ErrorClass) {
    if (state.liveDeny) throw new ErrorClass('assignment_ended', 403);
    const before = { draft: structuredClone(state.draft), receipts: structuredClone(state.receipts), prov: structuredClone(state.prov), extraProvs: structuredClone(state.extraProvs), provRevision: state.provRevision };
    state.inTransaction = true;
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.role, epoch: state.epoch ?? 1, scopeKind: 'school' }); }
    catch (error) { Object.assign(state, before); throw error; }
    finally { state.inTransaction = false; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if ((state.auditFails && values[8] === 'schema_dated_basis_read' || values[8] === state.auditFailsAction) && values[11] === 'ok') throw Error('synthetic-audit-failure');
      state.events.push({ action: values[8], outcome: values[11] }); return [];
    }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
    if (sql.includes('pg_advisory_xact_lock')) return [];
    if (sql.includes('public.schema_read')) return [{ result: draftWire({ draft: state.draft }) }];
    if (sql.includes('public.schema_status')) {
      const saved = state.receipts.get(values[0].commandId);
      return [{ result: draftWire(saved ? { state: 'completed', ...saved } : { state: 'not_found', draft: null, receipt: null }) }];
    }
    if (sql.includes('public.schema_command')) {
      const input = values[0];
      if (state.rejectDraftCommit || input.expectedRevision !== (state.draft?.revision ?? 0)) throw Object.assign(Error('revision conflict'), { code: '40001' });
      const revision = input.expectedRevision + 1, savedAt = '2026-11-20T12:00:00.000Z';
      const draft = { id: state.draft?.id ?? id(110), name: input.name, revision, savedAt, contentHash: await schemaDraftHash(input.document),
        sourceHash: input.sourceHash, document: input.document };
      const receipt = { commandId: input.commandId, draftId: draft.id, revision, contentHash: draft.contentHash, requestHash: input.requestHash, savedAt, replayed: false };
      state.draft = draft; state.receipts.set(input.commandId, { draft, receipt });
      return [{ result: draftWire({ draft, receipt }) }];
    }
    if (sql.includes('public.schema_dated_basis')) {
      state.reads.push('dated');
      if (state.sqlDeny) throw Object.assign(Error('denied'), { code: '42501' });
      return [{ result: { contractVersion: 'schema_dated_basis_sql_v1', actor: { identityId: state.forgedActor ? id(99) : id(4), assignmentId: id(6) }, result: { ...state.fixture.datedBasis, complete: !state.incomplete } } }];
    }
    throw Error('Unexpected SQL in synthetic date route');
  },
  async read(_request, _tx, _ctx, input) {
    state.reads.push('plan');
    if (input.unitId !== id(1)) throw new Deny('forbidden', 403);
    const { plan, basis } = state.fixture;
    return { plan: state.sourceChanged ? { ...plan, schoolName: 'Ändrad källa', classes: plan.classes.map(c => ({ ...c, name: 'Ändrad klass' })) } : plan,
      basis: state.prov ? { ...basis, skolsalar: { nasta: 3, salar: ['Provsal A', 'Provsal B'].map((name, i) => ({ id: `sal-${i + 1}`, name, typ: 'Allmän sal', platser: 30, utrustning: [] })) } } : basis,
      sourceRefs: { calendarVersionId: id(70) },
      schoolDuties: state.role === 'rektor' ? plan.teachers.map(t => ({ ref: t.personId, name: t.displayName, startsOn: '2026-07-01', endsOn: null })) : [],
      event: { action: 'tjanst_plan_read', objectType: 'school', objectId: id(1), details: { unitId: id(1), schoolYear: 2026 } } };
  },
  prov(_tx, _ctx, unitId, schoolYear) {
    state.reads.push('prov');
    if (unitId !== id(1) || schoolYear !== 2026) throw new Deny('forbidden', 403);
    return state.prov ? { revision: state.provRevision, savedAt: '2026-11-20T12:00:00.000Z', document: { granskad: false, bokningar: [state.prov, ...state.extraProvs] } } : null;
  },
  async saveProv(_tx, _ctx, input) {
    assert.equal(state.inTransaction, true);
    assert.equal(input.expectedRevision, state.provRevision);
    [state.prov, ...state.extraProvs] = input.document.bokningar;
    state.provRevision++;
    return { register: { revision: state.provRevision, document: input.document }, replayed: false };
  },
  async solve(problem) {
    assert.equal(state.inTransaction, false);
    const known = new Set(problem.lessons.map(lesson => lesson.id));
    const placements = state.fixture.placements.filter(p => known.has(p.lesson));
    const unplaced = problem.lessons.filter(lesson => !placements.some(p => p.lesson === lesson.id)).map(lesson => lesson.id);
    return { status: unplaced.length ? 'time_limit' : 'complete', placements, unplaced, diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 1 };
  },
  async validate(problem, placements) {
    assert.equal(state.inTransaction, false, 'motorn får inte köras medan DB-transaktionen hålls');
    assert.ok(state.events.some(e => e.action === 'schema_dated_basis_read' && e.outcome === 'ok'));
    state.validations.push({ problem, placements });
    if (state.engineFailure) throw new SchemaEngineError('schema_engine_unreachable');
    state.competitor?.();
    const violation = state.violation || state.weeklyViolation && !problem.id.startsWith('datum-');
    return { violations: violation ? [{ code: 'room_clash', message: `${placements[0].lesson} krockar i provsalen.`, lessons: [placements[0].lesson], resources: ['sal-1'] }] : [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };
  },
};
const draftWire = result => ({ contractVersion: 'schema_draft_sql_v1', actor: { identityId: id(4), assignmentId: id(6) }, result });
fake.tx.json = x => x;
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  const is = file => url === new URL(file, server).href; let source;
  if (is('db.ts')) source = `export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}
    export const withLoginPhase=(...a)=>globalThis.__schemaDatumServerTest.login(...a);export const withSessionContext=(ctx,fn)=>globalThis.__schemaDatumServerTest.live(ctx,fn,Deny);`;
  if (is('session.ts')) source = 'export const readSession=async()=>globalThis.__schemaDatumServerTest.session();';
  if (is('env.ts')) source = 'export const serverEnv=()=>globalThis.__schemaDatumServerTest.env;';
  if (is('schema-read.ts')) source = `import { Deny } from './db.ts';
    export const readSchemaBasis=(...a)=>globalThis.__schemaDatumServerTest.read(...a);
    export async function schemaBegaran(req, parse){try{return parse(await req.json());}catch{throw new Deny('bad_request',400);}}`;
  if (is('nationella-prov.ts')) source = `export const readNationellaProv=(...a)=>globalThis.__schemaDatumServerTest.prov(...a);
    export const sparaNationellaProv=(...a)=>globalThis.__schemaDatumServerTest.saveProv(...a);`;
  if (is('schemamotor.ts')) source = 'export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const validateSchema=(...a)=>globalThis.__schemaDatumServerTest.validate(...a); export const solveSchema=(...a)=>globalThis.__schemaDatumServerTest.solve(...a);';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts'), { SchemaEngineError } = await import('./server/schemamotor.ts');
const { POST } = await import('../app/api/schema/datum/route.ts');
const { POST: provforslag } = await import('../app/api/schema/provforslag/route.ts');
const { POST: tillampa } = await import('../app/api/schema/provforslag/tillampa/route.ts');
const { POST: sparaUtkast } = await import('../app/api/schema/utkast/spara/route.ts');
const { POST: nyttForslag } = await import('../app/api/schema/forslag/route.ts');
const { POST: sparaNyttForslag } = await import('../app/api/schema/forslag/spara/route.ts');
const reset = () => { state = { fixture: datumFixture(), role: 'rektor', reads: [], events: [], validations: [], draft: null, receipts: new Map(), provRevision: 1, extraProvs: [] }; };
const input = () => ({ ...state.fixture.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: state.fixture.f.grundFingerprint,
  placements: state.fixture.placements, datedOverrides: [state.fixture.change()], dates: [] });
const request = (body = input(), headers = {}) => new Request('http://localhost:5199/api/schema/datum', { method: 'POST', headers: { Origin: 'http://localhost:5199', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(body) });

test('datumrutt stoppar session, live-mandat, roll, MFA, epoch och ursprung före käll-/motorläsning', async () => {
  for (const c of [{ change: { noSession: true }, status: 401 }, { change: { revoked: true }, status: 401 }, { change: { liveDeny: true }, status: 403 },
    { change: { role: 'larare' }, status: 403 }, { change: { noMfa: true }, status: 403 }, { change: { epoch: 2 }, status: 409 }, { change: {}, headers: { Origin: 'https://annan.example.test' }, status: 403 }]) {
    reset(); Object.assign(state, c.change); const response = await POST(request(input(), c.headers));
    assert.equal(response.status, c.status); assert.deepEqual(state.reads, []); assert.deepEqual(state.validations, []);
  }
});

test('riktig rutt kontrollerar samtliga original/mål efter audit utanför transaktion och lämnar exakt bundet kontrollsvar', async () => {
  reset(); state.violation = true; const q = input(), response = await POST(request(q)); assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store'); const body = parseSchemaDatumSvar(await response.json(), q);
  assert.deepEqual(body.checkedDates, ['2026-11-02', '2026-11-03']); assert.equal(state.validations.length, 1); assert.equal(body.total, 1);
  assert.ok(body.violations.every(v => v.lessons.every(id => id.startsWith('pass-')) && v.occurrences.every(id => /@2026-/u.test(id))));
  assert.ok(!JSON.stringify(state.validations).includes('73111600')); assert.equal(body.datedOverrides[0].originalDate, q.datedOverrides[0].originalDate);
});

test('fel original, stale grund, ofullständig deltagarläsning, falsk aktör och auditfel lämnar inga kontrollerade data', async () => {
  for (const c of [{ change: { sourceChanged: true }, status: 409 }, { change: { incomplete: true }, status: 409 }, { change: { forgedActor: true }, status: 500 },
    { change: { auditFails: true }, status: 500 }, { change: { sqlDeny: true }, status: 403 }, { change: {}, status: 400, mutate: q => { q.datedOverrides[0].originalDate = '2026-11-04'; } }]) {
    reset(); Object.assign(state, c.change); const q = input(); c.mutate?.(q); const response = await POST(request(q));
    assert.equal(response.status, c.status); const body = await response.json(); assert.equal(body.checkedDates, undefined); assert.deepEqual(state.validations, []);
  }
});

test('för stor eller främmande begäran nekas före deltagarläsning och motorfel visas utan falskt lyckat svar', async () => {
  reset(); const q = input(); let response = await POST(request({ ...q, pupils: [] })); assert.equal(response.status, 400); assert.deepEqual(state.reads, []);
  response = await POST(request(q, { 'Content-Length': String(8 * 1024 * 1024 + 1) })); assert.equal(response.status, 400); assert.deepEqual(state.reads, []);
  reset(); state.engineFailure = true; response = await POST(request()); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'schema_engine_unavailable');
});

test('provförslaget läser bara rätt skolårs provplan och svarar med separata prov- och bortfallsrader', async () => {
  reset();
  const { plan } = state.fixture;
  state.prov = { id: id(101), datum: '2027-01-25', startMin: 480, slutMin: 540, namn: 'Syntetiskt läsprov', undervisning: `undervisning:${plan.classes[1].needs[0].sourceKey}`,
    mal: { slag: 'klass', ref: plan.classes[1].classId }, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: '2026-11-19' };
  const q = { ...input(), datedOverrides: [] };
  const res = await provforslag(request(q));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  const reply = parseSchemaProvforslagSvar(await res.json(), q);
  assert.deepEqual(state.reads, ['prov', 'plan', 'dated']);
  assert.equal(reply.provrevision, 1);
  assert.equal(reply.bokningar[0].deltagare, 1);
  assert.equal(reply.bokningar[0].deltagarnamn, 'Provklass 2');
  assert.equal(reply.bokningar[0].vakter[0].name, 'Provlärare 2');
  assert.ok(reply.bortfall.some(row => row.title.includes('Historia') && row.bortfallMin > 0));
  assert.ok(!JSON.stringify(reply).includes(id(80)));
  assert.throws(() => parseSchemaProvforslagSvar({ ...reply, unitId: id(99) }, q));
  assert.throws(() => parseSchemaProvforslagSvar({ ...reply, bortfall: [{ ...reply.bortfall[0], kvarMin: -60 }] }, q));
});

test('provförslaget lämnar inget underlag utan mandat, och tom provplan läser inga elever', async () => {
  for (const scenario of [{ noSession: true, status: 401 }, { role: 'larare', status: 403 }, { noMfa: true, status: 403 }]) {
    reset(); Object.assign(state, scenario);
    assert.equal((await provforslag(request())).status, scenario.status);
    assert.deepEqual(state.reads, []);
  }
  reset();
  const q = { ...input(), datedOverrides: [] };
  assert.equal((await provforslag(request({ ...q, unitId: id(99) }))).status, 403);
  const response = await provforslag(request(q));
  assert.equal(response.status, 200);
  assert.deepEqual(parseSchemaProvforslagSvar(await response.json(), q).bokningar, []);
  assert.deepEqual(state.reads, ['prov', 'prov']);
  assert.equal(state.validations.length, 0);
});

function provbokning(override = {}) {
  const klass = state.fixture.plan.classes[1];
  return { id: id(101), datum: '2027-01-25', startMin: 480, slutMin: 540, namn: 'Syntetiskt läsprov', undervisning: `undervisning:${klass.needs[0].sourceKey}`,
    mal: { slag: 'klass', ref: klass.classId }, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: '2026-11-19', ...override };
}
async function applyFixture() {
  reset();
  state.prov = provbokning();
  const preview = { ...input(), datedOverrides: [] };
  const { unitId, schoolYear, period, grundFingerprint, villkor, placements } = preview;
  const saved = await sparaUtkast(request({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: id(109), draftId: null, expectedRevision: 0,
    name: 'Syntetiskt utkast', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint, placements, locks: [] }));
  assert.equal(saved.status, 200);
  const calculated = await provforslag(request(preview));
  assert.equal(calculated.status, 200);
  const { bokningar, bortfall, ersattningar } = parseSchemaProvforslagSvar(await calculated.json(), preview);
  assert.ok(bokningar[0].sal && bokningar[0].vakter.length);
  assert.ok(ersattningar.length && bortfall.every(b => b.kvarMin === 0));
  return { input: { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, commandId: id(108), expectedRevision: 1,
    provrevision: 1, resultHash: await schemaDraftHash({ bokningar, bortfall, ersattningar }) }, bokningar, ersattningar };
}

test('prov och ersättningstid sparas med ett rektorskommando och svarar med samma kvittens vid omförsök', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  const { input: command, bokningar, ersattningar } = await applyFixture();
  const response = await tillampa(request(command));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.revision, 2); assert.equal(body.provrevision, 2);
  assert.deepEqual(state.draft.document.datedOverrides, ersattningar);
  assert.equal(state.prov.salId, bokningar[0].sal.id); assert.deepEqual(state.prov.vakter, bokningar[0].vakter.map(v => v.ref));
  const repeat = await tillampa(request(command));
  assert.equal(repeat.status, 200); assert.deepEqual(await repeat.json(), body);
  assert.equal(state.draft.revision, 2); assert.equal(state.provRevision, 2);
});

test('tillämpning kräver rätt mandat och revision och rullar tillbaka provet om utkastet får konflikt', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  const { input: command } = await applyFixture();
  state.role = 'administrator';
  assert.equal((await tillampa(request(command))).status, 403);
  state.role = 'rektor';
  assert.equal((await tillampa(request({ ...command, expectedRevision: 2 }))).status, 409);
  assert.equal((await tillampa(request({ ...command, provrevision: 2 }))).status, 409);
  assert.equal((await tillampa(request({ ...command, resultHash: `sha256:${'a'.repeat(64)}` }))).status, 409);
  state.rejectDraftCommit = true;
  const out = await tillampa(request(command));
  assert.equal(out.status, 409);
  assert.equal((await out.json()).details.reason, 'schema_draft_conflict');
  assert.equal(state.draft.revision, 1); assert.equal(state.provRevision, 1);
  assert.deepEqual(state.draft.document.datedOverrides, []);
  assert.equal(state.prov.salId, null); assert.deepEqual(state.prov.vakter, []);
});

async function nyttProvkommando(commandId = id(107), period = 'lasar') {
  const requestInput = { ...state.fixture.request, period };
  const response = await nyttForslag(request({ ...requestInput, planeraProv: true }));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  const { forslag, provplanering } = parseSchemaNyttProvForslag(body, requestInput);
  assert.ok(provplanering);
  const { unitId, schoolYear, grundFingerprint, villkor, lessons } = forslag;
  const { draftId, expectedRevision, provrevision, resultHash, sourceHash } = provplanering;
  return { save: { contractVersion: SCHEMA_DRAFT_VERSION, commandId, unitId, schoolYear, period, draftId, expectedRevision,
    name: 'Syntetiskt utkast', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint,
    placements: lessons.map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })), locks: [], datedOverrides: [], intentional: [], activityTypes: [] },
  prov: { provrevision, resultHash, sourceHash } };
}

test('nytt schema med prov förhandsvisas skrivskyddat och sparar båda dokumenten för ett första utkast', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  reset(); state.prov = provbokning();
  const command = await nyttProvkommando();
  assert.equal(state.draft, null);
  assert.equal(state.provRevision, 1);
  assert.equal(state.prov.salId, null);
  const response = await sparaNyttForslag(request(command));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(parseSchemaNyttProvSaveReply(body, command).revision, 1);
  assert.ok(state.draft.document.datedOverrides.length);
  assert.deepEqual(state.draft.document.placements, command.save.placements);
  assert.equal(state.provRevision, 2);
  assert.equal(state.prov.salId, 'sal-2');
  assert.deepEqual(state.prov.vakter, [id(21)]);
  const validations = state.validations.length;
  const retry = await sparaNyttForslag(request(command));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), body);
  assert.equal(state.validations.length, validations);
  assert.equal(state.provRevision, 2);
  assert.equal((await sparaNyttForslag(request({ ...command, save: { ...command.save, name: 'Annat utkast' } }))).status, 409);
  assert.equal(state.draft.revision, 1);
});

test('samma resursval lämnar provrevisionen och bokningar utanför terminen orörda', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  reset();
  state.prov = provbokning({ salId: 'sal-2', vakter: [id(21)] });
  state.extraProvs = [provbokning({ id: id(102), datum: '2026-12-01' })];
  const before = structuredClone({ prov: state.prov, extraProvs: state.extraProvs });
  const command = await nyttProvkommando(id(107), 'vt');
  const response = await sparaNyttForslag(request(command));
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal(state.provRevision, 1);
  assert.deepEqual({ prov: state.prov, extraProvs: state.extraProvs }, before);
  assert.equal(state.draft.document.base.period, 'vt');
  assert.ok(state.draft.document.datedOverrides.length);
});

test('nya provschemat kräver rektor, aktuell källa och helt planerad veckogrund', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  reset(); state.prov = provbokning();
  const command = await nyttProvkommando();
  state.role = 'administrator';
  assert.equal((await sparaNyttForslag(request(command))).status, 403);
  state.role = 'rektor'; state.noMfa = true;
  assert.equal((await sparaNyttForslag(request(command))).status, 403);
  state.noMfa = false;
  assert.equal((await sparaNyttForslag(request(command, { Origin: 'https://annan.example.test' }))).status, 403);
  assert.equal((await sparaNyttForslag(request({ ...command, prov: { ...command.prov, resultHash: `sha256:${'a'.repeat(64)}` } }))).status, 409);
  const placements = command.save.placements.filter(p => p.day !== 1);
  const partial = await sparaNyttForslag(request({ ...command, save: { ...command.save, placements } }));
  assert.equal(partial.status, 409);
  assert.equal((await partial.json()).details.reason, 'schema_provforslag_unresolved');
  state.weeklyViolation = true;
  const invalid = await sparaNyttForslag(request(command));
  assert.equal(invalid.status, 409);
  assert.equal((await invalid.json()).details.reason, 'schema_nytt_prov_weekly');
  state.weeklyViolation = false;
  state.competitor = () => { state.sourceChanged = true; state.competitor = undefined; };
  const raced = await sparaNyttForslag(request(command));
  assert.equal(raced.status, 409);
  assert.ok(state.sourceChanged);
  assert.equal((await raced.json()).details.reason, 'schema_provforslag_changed');
  assert.equal(state.draft, null);
  assert.equal(state.provRevision, 1);
});

test('sparfel och obligatoriskt auditfel återställer både provplanen och det nya utkastet', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  reset(); state.prov = provbokning();
  const command = await nyttProvkommando();
  state.rejectDraftCommit = true;
  assert.equal((await sparaNyttForslag(request(command))).status, 409);
  assert.equal(state.draft, null);
  assert.equal(state.provRevision, 1);
  assert.equal(state.prov.salId, null);
  state.rejectDraftCommit = false;
  state.auditFailsAction = 'schema_nytt_prov_saved';
  assert.equal((await sparaNyttForslag(request(command))).status, 500);
  assert.equal(state.draft, null);
  assert.equal(state.receipts.size, 0);
  assert.equal(state.provRevision, 1);
  assert.equal(state.prov.salId, null);
});
