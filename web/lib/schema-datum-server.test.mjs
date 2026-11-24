// Riktiga POST-/mandat-/MFA-/CSRF-/auditfunktioner. Session, databassvar och motor är uttryckliga stubbar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { parseSchemaDatumSvar } from './schema-datum.ts';
import { parseSchemaProvforslagSvar } from './schema-provforslag.ts';
import { SCHEMA_DRAFT_VERSION, schemaDraftHash } from './schema-draft-contract.ts';
import { buildSchemaUnderlag } from './schema-underlag.ts';
const id = n => `73111600-0000-4000-8000-${String(n).padStart(12, '0')}`, issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
let state;
const fake = globalThis.__schemaDatumServerTest = {
  env: { APP_MODE: 'protected', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'skolplattform-worker', MFA_MAX_AGE_SECONDS: '28800',
    DATABASE_URL: 'postgresql://127.0.0.1:56322/named_timplan_11111111111111111111111111111111', SUPABASE_URL: 'http://127.0.0.1:56331' },
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
    const before = { draft: structuredClone(state.draft), receipts: structuredClone(state.receipts), prov: structuredClone(state.prov), provRevision: state.provRevision,
      publication: structuredClone(state.publication) };
    state.inTransaction = true;
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.role, epoch: state.epoch ?? 1, scopeKind: 'school' }); }
    catch (error) { Object.assign(state, before); throw error; }
    finally { state.inTransaction = false; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails && values[8] === 'schema_dated_basis_read' && values[11] === 'ok') throw Error('synthetic-audit-failure');
      if (state.publicationAuditFails && values[8] === 'schema_publication_published' && values[11] === 'ok') throw Error('synthetic-publication-audit-failure');
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
    if (sql.includes('public.study_group_read')) {
      return [{ result: { contractVersion: 'study_group_sql_v1', actor: { identityId: id(4), assignmentId: id(6) }, result: {
        contractVersion: 'study_group_v1', unitId: id(1), schoolYear: 2026, groups: [state.publicationGroup], memberships: [], pupils: [], classes: [],
      } } }];
    }
    if (sql.includes('public.schema_publication')) {
      const input = values[0];
      if (input.unitId !== id(1)) throw Object.assign(Error('scope denied'), { code: '42501' });
      if (input.action === 'publish') {
        const { unitId, schoolYear, period, draftId, revision, contentHash } = input;
        state.publication = { unitId, schoolYear, period, draftId, revision, contentHash, id: id(120), publishedAt: '2026-11-20T12:00:00.000Z' };
        state.tracks = input.tracks;
      }
      return [{ result: { publication: state.publication ?? null } }];
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
    return state.prov ? { revision: state.provRevision, document: { granskad: false, bokningar: [state.prov] } } : null;
  },
  async saveProv(_tx, _ctx, input) {
    assert.equal(state.inTransaction, true);
    assert.equal(input.expectedRevision, state.provRevision);
    state.prov = input.document.bokningar[0];
    state.provRevision++;
    return { register: { revision: state.provRevision, document: input.document }, replayed: false };
  },
  async validate(problem, placements) {
    assert.equal(state.inTransaction, false, 'motorn får inte köras medan DB-transaktionen hålls');
    assert.ok(state.events.some(e => e.action === 'schema_dated_basis_read' && e.outcome === 'ok'));
    state.validations.push({ problem, placements });
    if (state.changeDuringDatedValidation && problem.id.startsWith('datum-')) state.sourceChanged = true;
    if (state.engineFailure) throw new SchemaEngineError('schema_engine_unreachable');
    return { violations: state.violation ? [{ code: 'room_clash', message: `${placements[0].lesson} krockar i provsalen.`, lessons: [placements[0].lesson], resources: ['sal-1'] }] : [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };
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
    export const readNationellaProvMedMotorhistorik=async()=>{throw new Error('Oväntad historikläsning utanför tömning');};
    export const sparaNationellaProv=(...a)=>globalThis.__schemaDatumServerTest.saveProv(...a);`;
  if (is('schemamotor.ts')) source = 'export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const validateSchema=(...a)=>globalThis.__schemaDatumServerTest.validate(...a);';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts'), { SchemaEngineError } = await import('./server/schemamotor.ts');
const { POST } = await import('../app/api/schema/datum/route.ts');
const { POST: provforslag } = await import('../app/api/schema/provforslag/route.ts');
const { POST: tillampa } = await import('../app/api/schema/provforslag/tillampa/route.ts');
const { POST: sparaUtkast } = await import('../app/api/schema/utkast/spara/route.ts');
const { POST: publicering } = await import('../app/api/schema/publicering/route.ts');
const reset = () => { state = { fixture: datumFixture(), role: 'rektor', reads: [], events: [], validations: [], draft: null, receipts: new Map(), provRevision: 1 }; };
const input = () => ({ ...state.fixture.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: state.fixture.f.grundFingerprint,
  placements: state.fixture.placements, datedOverrides: [state.fixture.change()], dates: [] });
const request = (body = input(), headers = {}) => new Request('http://localhost:5199/api/schema/datum', { method: 'POST', headers: { Origin: 'http://localhost:5199', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...headers }, body: JSON.stringify(body) });

async function savedPublicationDraft({ moveLesson = false } = {}) {
  reset();
  const { plan, basis, request: proposal } = state.fixture;
  plan.version = { id: id(71), status: 'published', versionNo: 1 };
  plan.classes.forEach((c, i) => {
    const key = i === 0 ? 'foundation:MATE:1:MATE1000X' : 'alternative:foundation:HIST:1:HIST1000X+MATE:1:MATE1000X';
    const sourceKey = `class_timplan:${c.classId}:2026:${key}`;
    c.link = { schoolform: 'gymnasium' };
    Object.assign(c.needs[0], { rowKey: key, sourceKey });
    Object.assign(plan.rows[i], { rowKey: key, sourceKey });
  });
  const g = plan.groups[0], groupId = g.groupId, sourceKey = `study_group:${groupId}:2026`;
  Object.assign(g, { sourceKind: 'study_group', sourceKey, subjectCode: 'MODY', levelCode: 'MODY1000X', language: 'fr' });
  Object.assign(plan.rows.at(-1), { sourceKind: 'study_group', sourceKey });
  state.publicationGroup = { id: groupId, unitId: id(1), schoolYear: 2026, name: 'Franska', startsOn: '2026-08-17', endsOn: '2027-06-11',
    course: { subjectCode: 'MODY', subjectVersion: 8, itemCode: 'MODY1000X', languageCode: 'fr', points: 100 },
    minutesHt: 900, minutesVt: 900, parallelSetId: id(41), classIds: g.classIds, origin: { kind: 'manual' }, revision: 1, active: true };
  const underlag = buildSchemaUnderlag(plan, proposal, basis);
  const placements = underlag.labels.lessons.map(l => ({ lesson: l.id, day: l.title === 'Franska' ? 1 : 0, startMin: 480, room: l.title === 'Matematik' ? 'sal-1' : 'sal-2' }));
  const frenchLesson = underlag.labels.lessons.find(lesson => lesson.title === 'Franska' && (lesson.term === null || lesson.term === 'ht'));
  const datedOverrides = moveLesson ? [state.fixture.change('2026-11-04', { lesson: frenchLesson.id })] : [];
  const { unitId, schoolYear, period, villkor } = proposal;
  const saved = await sparaUtkast(request({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: id(109), draftId: null, expectedRevision: 0,
    name: 'Syntetiskt schema för publicering', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint: underlag.grundFingerprint, placements,
    locks: [], intentional: [], datedOverrides, activityTypes: [] }));
  assert.equal(saved.status, 200, await saved.clone().text());
  const { id: draftId, revision, contentHash } = state.draft;
  return { action: 'publish', unitId, schoolYear, period, draftId, revision, contentHash, commandId: id(119) };
}

test('publicering använder bara aktuell sparad revision och exakta Gy25-källor och kan läsas om utan motorkontroll', async () => {
  const publication = await savedPublicationDraft();
  const { unitId, schoolYear, period } = publication, status = { action: 'status', unitId, schoolYear, period };
  assert.deepEqual(await (await publicering(request(status))).json(), { publication: null });
  state.role = 'administrator';
  assert.equal((await publicering(request(publication))).status, 403);
  state.role = 'rektor';
  assert.equal((await publicering(request(publication, { Origin: 'https://annan.example.test' }))).status, 403);
  assert.equal((await publicering(request({ ...publication, revision: publication.revision + 1 }))).status, 409);
  const published = await publicering(request(publication));
  assert.equal(published.status, 200, await published.clone().text());
  assert.equal((await published.json()).publication.draftId, publication.draftId);
  const ht = state.tracks.filter(track => track.term === 'ht');
  assert.deepEqual(ht.map(({ kind, subjectCode, subjectVersion, languageCode }) => ({ kind, subjectCode, subjectVersion, languageCode })), [
    { kind: 'class', subjectCode: 'MATE', subjectVersion: 1, languageCode: null },
    { kind: 'group', subjectCode: 'MODY', subjectVersion: 8, languageCode: 'fr' },
  ]);
  assert.equal(ht[0].days[0], '2026-08-17');
  assert.equal(ht[0].days.includes('2026-11-09'), false);
  assert.equal(ht[1].days[0], '2026-08-18');
  const validations = state.validations.length;
  state.engineFailure = true;
  assert.equal((await publicering(request(publication))).status, 200);
  state.role = 'administrator';
  assert.equal((await publicering(request(status))).status, 200);
  assert.equal((await publicering(request({ ...status, unitId: id(2) }))).status, 403);
  assert.equal(state.validations.length, validations);
});

test('publicering räknar ett flyttat pass på det nya datumet och tar bort det ursprungliga', async () => {
  const publication = await savedPublicationDraft({ moveLesson: true });
  const response = await publicering(request(publication));
  assert.equal(response.status, 200, await response.text());
  const track = state.tracks.find(track => track.languageCode === 'fr' && track.term === 'ht');
  assert.ok(track.days.includes('2026-11-04'));
  assert.equal(track.days.includes('2026-11-03'), false);
});

test('publicering rullas tillbaka vid auditfel och stoppas om källan ändras under daterad kontroll', async () => {
  const publication = await savedPublicationDraft();
  state.publicationAuditFails = true;
  assert.equal((await publicering(request(publication))).status, 500);
  assert.equal(state.publication, undefined);
  state.publicationAuditFails = false;
  state.changeDuringDatedValidation = true;
  const stale = await publicering(request(publication));
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).details.reason, 'schema_publication_draft_changed');
  assert.equal(state.publication, undefined);
});

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

async function applyFixture(retainActivity = false) {
  reset();
  const { plan } = state.fixture;
  state.prov = { id: id(101), datum: '2027-01-25', startMin: 480, slutMin: 540, namn: 'Syntetiskt läsprov', undervisning: `undervisning:${plan.classes[1].needs[0].sourceKey}`,
    mal: { slag: 'klass', ref: plan.classes[1].classId }, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: '2026-11-19' };
  const preview = { ...input(), datedOverrides: [] };
  const { unitId, schoolYear, period, grundFingerprint, villkor, placements } = preview;
  const definition = { id: id(105), name: 'Syntetisk friluftsdag', date: '2027-01-27', startMin: 540, endMin: 600,
    classRefs: [plan.classes[1].classId], credit: null, resourceLocks: { roomId: 'ingen', teacherRef: null } };
  const saved = await sparaUtkast(request({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: id(109), draftId: null, expectedRevision: 0,
    name: 'Syntetiskt utkast', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint, placements, locks: [],
    ...(retainActivity && { datedActivityDefinitions: [definition] }) }));
  assert.equal(saved.status, 200);
  const calculated = await provforslag(request(preview));
  assert.equal(calculated.status, 200);
  const { bokningar, bortfall, ersattningar } = parseSchemaProvforslagSvar(await calculated.json(), preview);
  assert.ok(bokningar[0].sal && bokningar[0].vakter.length);
  assert.ok(ersattningar.length && bortfall.every(b => b.kvarMin === 0));
  return { input: { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, commandId: id(108), expectedRevision: 1,
    provrevision: 1, resultHash: await schemaDraftHash({ bokningar, bortfall, ersattningar }) }, bokningar, ersattningar, definition };
}

test('prov och ersättningstid sparas med ett rektorskommando och svarar med samma kvittens vid omförsök', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-20T12:00:00.000Z') });
  const { input: command, bokningar, ersattningar, definition } = await applyFixture(true);
  const response = await tillampa(request(command));
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.revision, 2); assert.equal(body.provrevision, 2);
  assert.deepEqual(state.draft.document.datedOverrides, ersattningar);
  assert.deepEqual(state.draft.document.datedActivityDefinitions, [definition]);
  assert.equal(Object.hasOwn(state.draft.document, 'datedActivities'), false);
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
