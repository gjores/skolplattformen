// Riktiga POST-/mandat-/MFA-/CSRF-/auditfunktioner. Session, databassvar och motor är uttryckliga stubbar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { parseSchemaDatumSvar } from './schema-datum.ts';
import { parseSchemaProvforslagSvar } from './schema-provforslag.ts';
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
    state.inTransaction = true;
    try { return await fn(fake.tx, { ...ctx, accessFunction: state.role, epoch: state.epoch ?? 1, scopeKind: 'school' }); } finally { state.inTransaction = false; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails && values[8] === 'schema_dated_basis_read' && values[11] === 'ok') throw Error('synthetic-audit-failure');
      state.events.push({ action: values[8], outcome: values[11] }); return [];
    }
    if (sql.includes('select i.auth_user_id')) return [{ auth_user_id: id(4), function: state.role, organizer_id: id(8), unit_id: id(1) }];
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
      schoolDuties: state.role === 'rektor' ? plan.teachers.map(t => ({ ref: t.personId, name: t.displayName, startsOn: '2026-07-01', endsOn: null })) : [],
      event: { action: 'tjanst_plan_read', objectType: 'school', objectId: id(1), details: { unitId: id(1), schoolYear: 2026 } } };
  },
  prov(_tx, _ctx, unitId, schoolYear) {
    state.reads.push('prov');
    if (unitId !== id(1) || schoolYear !== 2026) throw new Deny('forbidden', 403);
    return state.prov ? { revision: 1, document: { granskad: false, bokningar: [state.prov] } } : null;
  },
  async validate(problem, placements) {
    assert.equal(state.inTransaction, false, 'motorn får inte köras medan DB-transaktionen hålls');
    assert.ok(state.events.some(e => e.action === 'schema_dated_basis_read' && e.outcome === 'ok'));
    state.validations.push({ problem, placements });
    if (state.engineFailure) throw new SchemaEngineError('schema_engine_unreachable');
    return { violations: state.violation ? [{ code: 'room_clash', message: `${placements[0].lesson} krockar i provsalen.`, lessons: [placements[0].lesson], resources: ['sal-1'] }] : [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };
  },
};
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
  if (is('nationella-prov.ts')) source = 'export const readNationellaProv=(...a)=>globalThis.__schemaDatumServerTest.prov(...a);';
  if (is('schemamotor.ts')) source = 'export class SchemaEngineError extends Error{constructor(reason){super(reason);this.reason=reason;}};export const validateSchema=(...a)=>globalThis.__schemaDatumServerTest.validate(...a);';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { Deny } = await import('./server/db.ts'), { SchemaEngineError } = await import('./server/schemamotor.ts');
const { POST } = await import('../app/api/schema/datum/route.ts');
const { POST: provforslag } = await import('../app/api/schema/provforslag/route.ts');
const reset = () => { state = { fixture: datumFixture(), role: 'rektor', reads: [], events: [], validations: [] }; };
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
