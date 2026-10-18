import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { defaultProgramplanChoiceBlocks } from '../programplan-choice-blocks.ts';
import { programFrame } from '../programplan-table.ts';
import { programplanLevelRanks, programplanTermRows, suggestProgramplanTerms } from '../programplan-terms.ts';
import { aplContentHash, parseAplReadRequest, projectAplPlan } from '../apl-plan.ts';

// Actual authz/routes/catalogue/domain parsers; database, signed-session lookup and
// transaction storage are controlled doubles. Real SQL/ACL coverage is a separate runner.
const uid = n => `5a140000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const id = uid(1), organizerId = uid(2), unitId = uid(3), offeringId = uid(4), planId = uid(5), assignmentId = uid(6);
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test', clientId = 'skolplattform-worker';
const artifact = JSON.parse(await readFile(new URL('../programplan-catalog.generated.json', import.meta.url), 'utf8'));
const program = artifact.programs.find(p => p.code === 'BF25'), orientationCode = program.orientations[0].code;
const choiceBlocks = defaultProgramplanChoiceBlocks(program, orientationCode);
choiceBlocks.push({ id: 'fordj', name: 'Programfördjupning', kind: 'specialization', points: programFrame(program, orientationCode).specializationRoom });
const reference = { catalogId: artifact.catalogId, programRef: { code: program.code, version: program.version }, orientationCode,
  startedOn: '2027-08-01', specializationRefs: [], choiceBlocks };
const termRows = programplanTermRows(program, reference), distribution = suggestProgramplanTerms(termRows, [], programplanLevelRanks(program));
const key = distribution.find(r => !r.rowKey.startsWith('block:') && !r.rowKey.startsWith('meta:') && r.points[0] > 0).rowKey;
const rawSource = () => ({ planId: uid(7), offeringId, version: 1, revision: 3, status: 'faststalld', catalogId: artifact.catalogId,
  basisReference: structuredClone(reference), distribution: structuredClone(distribution), rows: termRows.map(r => ({ key: r.key, points: r.points })),
  educationRevision: 2, education: { name: 'Syntetisk BF', cohort: '2027', programCode: program.code, orientationCode }, archived: false });
const rawGym = () => {
  const { catalogId: _id, ...catalog } = structuredClone(artifact);
  return { id: planId, offeringId, unitId, schoolName: 'Syntetisk skola', version: 1, revision: 7, status: 'utkast', source: rawSource(), catalog,
    currentSource: { planId: uid(7), version: 1, revision: 3, status: 'faststalld' }, currentSourceBasis: rawSource(),
    hours: Object.fromEntries(distribution.map(r => [r.rowKey, r.points.map(p => p > 0 ? 400 : null)])), canPlan: true, archived: false,
    series: { id: uid(8), name: 'Syntetisk fördelning', revision: 0 }, nameAtCreation: 'Syntetisk fördelning' };
};
const aplPlan = () => ({ contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'complete', periods: [{
  id: uid(9), name: 'APL höst', startsOn: '2027-08-02', endsOn: '2027-11-14', schoolYear: 2027,
  extent: { basis: 'whole_weeks', weeks: 15, reviewed: true, reviewNote: 'Syntetiskt granskat veckounderlag.' },
  contents: [{ rowKey: key, description: 'Syntetiskt arbetsmoment' }], allocations: [{ rowKey: key, termIndex: 0, gutMinutes: 20700 }],
}] });
const authority = fn => ({ identityId: id, assignmentId, organizerId, accessFunction: fn });
let state;
const fixture = globalThis.__aplServerTest = {
  env: { APP_MODE: 'protected', DATABASE_URL: 'postgres://synthetic@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321',
    OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-apl-only' },
  session() { const future = new Date(Date.now() + 60000); return { session: { id, identityId: id, membershipId: id, assignmentId,
    customerId: id, expiresAt: future, absoluteExpiresAt: future, epoch: 1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    if (state.liveError) throw state.liveError;
    const events = state.events.length, mutations = state.mutations.length;
    try { return await fn(fixture.tx, { ...authority(state.fn), sessionId: id, membershipId: id, customerId: id, unitId: state.contextUnit,
      identity: { issuer, subject: 'synthetic', authUserId: null }, correlationId: id, epoch: 1,
      mfa: { issuer, clientId, audience: [clientId], profileId: 'local-keycloak-admin', profileVersion: 1,
        acr: state.mfa ? '2' : '1', amr: state.mfa ? ['pwd', 'otp'] : ['pwd'], authTime: new Date(Date.now() - 1000), checkedAt: new Date() } });
    } catch (error) { state.events.length = events; state.mutations.length = mutations; throw error; }
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{ function: state.hintFn ?? state.fn, organizer_id: organizerId, unit_id: unitId }];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails) throw new Error('synthetic private audit failure');
      state.events.push({ action: values[8], objectType: values[9], objectId: values[10], outcome: values[11], details: values[12] }); return [];
    }
    state.calls.push({ sql, values }); if (state.sqlError) throw state.sqlError;
    if (sql.includes('phase5_timplan_time_command')) { state.mutations.push(values[0]); return [{ result: state.timeReply }]; }
    if (sql.includes('phase5_timplan_time_status')) return [{ result: state.timeStatus }];
    if (sql.includes('phase5_read_gym_timplan')) return [{ result: state.read.basis.gymTimplan }];
    if (sql.includes('phase5_apl_plan_read')) return [{ result: state.read }];
    if (sql.includes('phase5_apl_plan_status')) return [{ result: state.status }];
    if (sql.includes('phase5_apl_plan_command')) { state.mutations.push(values[0]); return [{ result: state.command }]; }
    throw new Error('Unexpected synthetic query');
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url === new URL('./db.ts', import.meta.url).href) source = `export class Deny extends Error { constructor(code,status=403,details) { super(code);this.code=code;this.status=status;this.details=details; } }
    export const withLoginPhase=(...a)=>globalThis.__aplServerTest.login(...a);export const withSessionContext=(...a)=>globalThis.__aplServerTest.context(...a);`;
  if (url === new URL('./session.ts', import.meta.url).href) source = 'export const readSession=async()=>globalThis.__aplServerTest.session();';
  if (url === new URL('./env.ts', import.meta.url).href) source = 'export const serverEnv=()=>globalThis.__aplServerTest.env;';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { POST: read } = await import('../../app/api/timplaner/gym/apl/lasa/route.ts');
const { POST: command } = await import('../../app/api/timplaner/gym/apl/kommando/route.ts');
const { POST: status } = await import('../../app/api/timplaner/gym/apl/status/route.ts');
const { projectGymTimplan } = await import('./gym-timplan.ts');
const { APL_REQUEST_BYTES, aplRequest, projectAplFrozenRead } = await import('./apl-plan.ts');
const { Deny } = await import('./db.ts');
const envelope = (basis, result) => ({ contractVersion: 'apl_sql_v1', basis, result });
async function contextFor(basis) {
  const { body: plan } = await projectGymTimplan(basis.gymTimplan, planId);
  return { organizerId: basis.organizerId, plan, copyReview: basis.copyReview, program: { code: program.code, version: program.version,
    category: program.category, startDate: program.startDate, endDate: program.endDate, canceledDate: program.canceledDate, sourceSupported: true } };
}
async function makeDetail(basis, plan, confirmations = []) {
  const context = await contextFor(basis), editable = !context.plan.archived && ['utkast', 'atersand'].includes(context.plan.status);
  return { contractVersion: 'structured_v1', planId, revision: context.plan.revision, organizerId, program: context.program, plan,
    copyReview: basis.copyReview, contentHash: await aplContentHash(context, plan), confirmations,
    capabilities: { canSave: editable && state.fn !== 'huvudman', canConfirm: editable && state.fn === 'rektor' } };
}
async function reset(fn = 'rektor') {
  state = { fn, mfa: true, contextUnit: null, events: [], calls: [], mutations: [] };
  const basis = { organizerId, gymTimplan: rawGym(), copyReview: [] }; basis.gymTimplan.canPlan = fn !== 'huvudman';
  state.read = envelope(basis, await makeDetail(basis, aplPlan()));
  state.status = envelope(null, { state: 'not_found', result: null });
}
const saveInput = () => ({ contractVersion: 'structured_v1', action: 'save', commandId: uid(20), planId, expectedRevision: 7,
  plan: aplPlan(), copyReviewResolutions: [] });
async function prepare(input = saveInput(), changed = true) {
  const basis = structuredClone(state.read.basis); basis.gymTimplan.revision = input.expectedRevision + (changed ? 1 : 0);
  const detail = await makeDetail(basis, input.action === 'save' ? input.plan : state.read.result.plan);
  const confirmationId = input.action === 'confirm' ? uid(21) : null;
  if (confirmationId) detail.confirmations.push({ id: confirmationId, planId, unitId, actorId: id, assignmentId,
    actorName: 'Syntetisk rektor', at: '2026-10-16T12:00:00.000Z', revision: detail.revision, contentHash: detail.contentHash, comment: input.comment });
  state.command = envelope(basis, { receipt: { contractVersion: 'structured_v1', commandId: input.commandId, planId,
    action: input.action, revision: detail.revision, changed, replayed: false, contentHash: detail.contentHash, confirmationId }, detail });
  return input;
}
const confirmInput = () => ({ contractVersion: 'structured_v1', action: 'confirm', commandId: uid(22), planId, expectedRevision: 7,
  expectedContentHash: state.read.result.contentHash, comment: 'Syntetiskt rektorsbeslut.' });
function request(path, body, options = {}) {
  return new Request(`http://localhost/api/timplaner/gym/apl/${path}`, { method: 'POST', headers: {
    Origin: options.origin ?? 'http://localhost', 'Content-Type': 'application/json', 'X-Context-Epoch': '1', ...options.headers },
    body: options.raw ?? JSON.stringify(body), ...(options.duplex ? { duplex: 'half' } : {}) });
}
const noCommit = () => { assert.equal(state.mutations.length, 0); assert.equal(state.events.some(e => e.outcome === 'ok'), false); };

test('yrkeskull 2028 läses med SQLs ej stödda källprofil och förfalskat stöd avvisas', async () => {
  await reset();
  const basis = state.read.basis;
  basis.gymTimplan.source.basisReference.startedOn = '2028-08-15';
  basis.gymTimplan.currentSourceBasis.basisReference.startedOn = '2028-08-15';
  const context = await contextFor(basis); context.program.sourceSupported = false;
  state.read.result = await makeDetail(basis, aplPlan());
  state.read.result.program.sourceSupported = false;
  state.read.result.contentHash = await aplContentHash(context, state.read.result.plan);
  assert.equal((await read(request('lasa', { planId }))).status, 200);
  assert.equal(projectAplPlan(context, state.read.result.plan).readyForConfirmation, false);
  context.program.sourceSupported = true; state.read.result.program.sourceSupported = true;
  state.read.result.contentHash = await aplContentHash(context, state.read.result.plan);
  assert.equal((await read(request('lasa', { planId }))).status, 500);
});

test('three planning roles read verified APL without MFA; multi-school context is not reduced to one unit hint', async () => {
  for (const fn of ['huvudman', 'rektor', 'administrator']) {
    await reset(fn); state.mfa = false; state.contextUnit = uid(99);
    const response = await read(request('lasa', { planId })); assert.equal(response.status, 200);
    const body = await response.json(); assert.deepEqual(body, state.read.result);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('x-context-epoch'), '1');
    assert.equal('basis' in body, false); assert.equal('catalog' in body, false); assert.equal(state.calls.length, 1);
    assert.deepEqual(state.events, [{ action: 'apl_plan_read', objectType: 'timplan', objectId: planId, outcome: 'ok', details: { accessFunction: fn } }]);
  }
});
test('legacy is explicit null; historical approved plans are readable with no edit capabilities', async () => {
  await reset(); state.read.result = await makeDetail(state.read.basis, null);
  assert.equal((await read(request('lasa', { planId }))).status, 200);
  await reset(); Object.assign(state.read.basis.gymTimplan, { status: 'faststalld', canPlan: false });
  state.read.result = await makeDetail(state.read.basis, aplPlan());
  assert.equal((await read(request('lasa', { planId }))).status, 200);
  assert.deepEqual(state.read.result.capabilities, { canSave: false, canConfirm: false });
});
test('save and no-op accept exact frozen receipts for rector and administrator with one minimal Worker audit', async () => {
  for (const fn of ['rektor', 'administrator']) for (const changed of [true, false]) {
    await reset(fn); const input = await prepare(saveInput(), changed);
    const response = await command(request('kommando', input)); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state.command.result); assert.equal(state.mutations.length, 1); assert.equal(state.events.length, 1);
    assert.equal(state.events[0].action, 'apl_plan_command'); assert.ok(!JSON.stringify(state.events).includes('arbetsmoment'));
  }
});
test('only actual rector may confirm; complete independent APL projection is required', async () => {
  await reset(); assert.equal(projectAplPlan(await contextFor(state.read.basis), aplPlan()).readyForConfirmation, true);
  const input = await prepare(confirmInput()); assert.equal((await command(request('kommando', input))).status, 200);
  for (const fn of ['huvudman', 'administrator']) {
    await reset(fn); assert.equal((await command(request('kommando', confirmInput()))).status, 403); assert.equal(state.calls.length, 0);
  }
  await reset(); state.read.result.plan.classification = 'unreviewed';
  state.read.result.contentHash = await aplContentHash(await contextFor(state.read.basis), state.read.result.plan);
  const incomplete = await prepare(confirmInput()); assert.equal((await command(request('kommando', incomplete))).status, 500); noCommit();
});
test('fresh context, role, MFA, origin and epoch are checked before the APL operation', async () => {
  for (const patch of [{ fn: 'larare' }, { fn: 'huvudman' }, { mfa: false }, { hintFn: 'rektor', fn: 'larare' }]) {
    await reset(); Object.assign(state, patch); assert.equal((await command(request('kommando', saveInput()))).status, 403); assert.equal(state.calls.length, 0); noCommit();
  }
  for (const [route, path, body] of [[read, 'lasa', { planId }], [status, 'status', { command: saveInput() }], [command, 'kommando', saveInput()]]) {
    await reset(); assert.equal((await route(request(path, body, { origin: 'https://foreign.invalid' }))).status, 403); assert.equal(state.calls.length, 0);
    await reset(); assert.equal((await route(request(path, body, { headers: { 'X-Context-Epoch': '0' } }))).status, 409); assert.equal(state.calls.length, 0);
    await reset(); state.liveError = new Deny('assignment_ended', 403);
    assert.equal((await route(request(path, body))).status, 403); assert.equal(state.calls.length, 0);
  }
});
test('malformed, downgraded and actor-bearing requests are rejected before SQL', async () => {
  for (const mutate of [q => delete q.contractVersion, q => q.contractVersion = 'legacy', q => q.actorId = id,
    q => q.plan.periods[0].allocations[0].gutMinutes = 1.5, q => q.plan.periods[0].actorId = id,
    q => q.copyReviewResolutions = [{ id: uid(30), note: '' }]]) {
    await reset(); const input = saveInput(); mutate(input);
    assert.equal((await command(request('kommando', input))).status, 400); assert.equal(state.calls.length, 0); noCommit();
  }
  await reset(); assert.equal((await read(request('lasa', {}, { raw: '{' }))).status, 400); assert.equal(state.calls.length, 0);
});
test('missing fields, changed contracts, catalogues, identities and capabilities fail closed', async () => {
  const cases = [r => delete r.contractVersion, r => r.contractVersion = 'legacy', r => delete r.result.plan,
    r => delete r.basis.gymTimplan.series, r => r.basis.gymTimplan.catalog.programs[0].name = 'Forged catalogue',
    r => r.basis.gymTimplan.source.rows[0].points++, r => r.result.planId = uid(90), r => r.result.organizerId = uid(90),
    r => r.result.contentHash = `sha256:${'a'.repeat(64)}`, r => r.result.capabilities.canConfirm = false,
    r => r.basis.gymTimplan.canPlan = false, r => r.result.program.sourceSupported = false,
    r => r.result.capabilities.canApprove = true, r => r.basis = null];
  for (const mutate of cases) {
    await reset(); mutate(state.read); const response = await read(request('lasa', { planId }));
    assert.equal(response.status, 500); assert.equal((await response.json()).code, 'audit_unavailable'); noCommit();
  }
  await reset('huvudman'); state.read.result.capabilities.canSave = true;
  assert.equal((await read(request('lasa', { planId }))).status, 500); noCommit();
  await reset(); await assert.rejects(projectAplFrozenRead(state.read.result, state.read.basis, planId, { ...authority('rektor'), organizerId: uid(99) }));
});
test('matching forged save/request hashes cannot bypass independent minute, row or term validation', async () => {
  for (const mutate of [q => q.plan.periods[0].allocations[0].gutMinutes = 30000,
    q => { q.plan.periods[0].contents[0].rowKey = 'foundation:ZZ:1:ZZ'; q.plan.periods[0].allocations[0].rowKey = 'foundation:ZZ:1:ZZ'; },
    q => { const inactive = distribution.find(r => r.rowKey === key).points.findIndex(p => p === 0); assert.ok(inactive >= 0); q.plan.periods[0].allocations[0].termIndex = inactive; }]) {
    await reset(); const input = saveInput(); mutate(input); await prepare(input);
    assert.equal((await command(request('kommando', input))).status, 500); noCommit();
  }
});
test('wrong period, request identity, revision or receipt hash rolls back a returned SQL mutation', async () => {
  for (const mutate of [r => r.result.detail.plan.periods[0].id = uid(99), r => r.result.receipt.commandId = uid(99),
    r => r.result.receipt.revision++, r => r.result.receipt.contentHash = `sha256:${'f'.repeat(64)}`,
    r => r.result.receipt.replayed = 'yes', r => r.contractVersion = 'structured_v1']) {
    await reset(); const input = await prepare(); mutate(state.command);
    assert.equal((await command(request('kommando', input))).status, 500); assert.equal(state.calls.length, 1); noCommit();
  }
});
test('an internally consistent but noneditable frozen snapshot cannot represent an APL command receipt', async () => {
  for (const action of ['save', 'confirm']) for (const replayed of [false, true]) {
    await reset(); const input = await prepare(action === 'save' ? saveInput() : confirmInput());
    Object.assign(state.command.basis.gymTimplan, { status: 'faststalld', canPlan: false });
    state.command.result.detail.capabilities = { canSave: false, canConfirm: false };
    state.command.result.receipt.replayed = replayed;
    // Status is excluded from content hash: this read snapshot is itself valid.
    await projectAplFrozenRead(state.command.result.detail, state.command.basis, planId, authority('rektor'));
    assert.equal((await command(request('kommando', input))).status, 500); noCommit();
    state.status = envelope(state.command.basis, { state: 'completed', result: state.command.result });
    state.command.result.receipt.replayed = true;
    assert.equal((await status(request('status', { command: input }))).status, 500); noCommit();
  }
});
test('new rector events bind both identity and assignment, while historic confirmations may belong to another rector', async () => {
  for (const field of ['actorId', 'assignmentId', 'unitId']) {
    await reset(); const input = await prepare(confirmInput()); state.command.result.detail.confirmations[0][field] = uid(99);
    assert.equal((await command(request('kommando', input))).status, 500); noCommit();
  }
  await reset(); await prepare(confirmInput());
  const prior = structuredClone(state.command.result.detail.confirmations[0]); prior.actorId = uid(99); prior.assignmentId = uid(98); prior.revision = 6;
  state.read.result.confirmations = [prior]; assert.equal((await read(request('lasa', { planId }))).status, 200);
});
test('copy-review resolution actor is independently verified even with a matching saved note and hash', async () => {
  await reset(); const input = saveInput(); input.copyReviewResolutions = [{ id: uid(30), note: 'Syntetisk manuell granskning.' }];
  state.read.basis.copyReview = [{ id: uid(30), sourcePlanId: uid(31), sourceVersion: 1, sourcePeriodId: uid(32), sourcePeriodName: 'Tidigare APL',
    reason: 'missing_row', contents: [{ rowKey: key, description: 'Tidigare arbetsmoment' }], allocations: [],
    resolution: { actorId: uid(99), assignmentId, at: '2026-10-16T12:00:00.000Z', note: input.copyReviewResolutions[0].note } }];
  await prepare(input); assert.equal((await command(request('kommando', input))).status, 500); noCommit();
});
test('status/replay use the immutable snapshot without MFA or reading/writing the latest plan', async () => {
  await reset(); const input = await prepare(); state.command.result.receipt.replayed = true;
  const frozen = structuredClone(state.command.result);
  state.status = envelope(state.command.basis, { state: 'completed', result: frozen }); state.mfa = false;
  state.read.basis.gymTimplan.revision = 99; state.read.result.plan.periods[0].name = 'Senare ändring';
  const response = await status(request('status', { command: input })); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { state: 'completed', result: frozen }); assert.equal(state.calls.length, 1);
  assert.ok(state.calls[0].sql.includes('phase5_apl_plan_status')); assert.equal(state.mutations.length, 0);
  state.mfa = true; assert.equal((await command(request('kommando', input))).status, 200);
  assert.deepEqual(state.command.result, frozen);
});
test('not-found status is explicit and cannot carry a basis; completed receipts cannot omit one or alter the request', async () => {
  await reset(); assert.equal((await status(request('status', { command: saveInput() }))).status, 200);
  state.status.basis = state.read.basis; assert.equal((await status(request('status', { command: saveInput() }))).status, 500);
  for (const mutate of [r => r.basis = null, r => r.result.result.receipt.replayed = false, r => r.result.result.receipt.commandId = uid(99)]) {
    await reset(); const input = await prepare(); state.command.result.receipt.replayed = true;
    state.status = envelope(state.command.basis, { state: 'completed', result: state.command.result }); mutate(state.status);
    assert.equal((await status(request('status', { command: input }))).status, 500); noCommit();
  }
});
test('command status uses the same role boundary even when no receipt exists', async () => {
  for (const fn of ['huvudman', 'larare']) {
    await reset(fn); assert.equal((await status(request('status', { command: saveInput() }))).status, 403); assert.equal(state.calls.length, 0);
  }
  await reset('administrator'); state.mfa = false;
  assert.equal((await status(request('status', { command: saveInput() }))).status, 200);
  state.calls = [];
  assert.equal((await status(request('status', { command: confirmInput() }))).status, 403); assert.equal(state.calls.length, 0);
});
test('SQL denials are minimized and known reason hints are allowlisted', async () => {
  for (const [code, hint, expectedStatus, expectedCode, reason] of [
    ['40001', 'apl_revision_conflict', 409, 'conflict', 'apl_revision_conflict'],
    ['40001', 'apl_confirmation_blocked', 409, 'plan_decision_blocked', 'apl_confirmation_blocked'],
    ['22023', 'allocation_exceeds_total', 400, 'bad_request', 'allocation_exceeds_total'],
    ['42501', 'private school detail', 403, 'forbidden'], ['40001', 'private hint', 409, 'conflict'],
    ['55000', 'private audit', 500, 'audit_unavailable'], ['08006', 'private connection', 503, 'db_unreachable']]) {
    await reset(); state.sqlError = { code, hint, message: 'private SQL', detail: 'private rows' };
    const response = await command(request('kommando', saveInput())); assert.equal(response.status, expectedStatus);
    const body = await response.json(); assert.equal(body.code, expectedCode); assert.equal(body.details?.reason, reason);
    assert.equal(JSON.stringify(body).includes('private'), false); noCommit();
  }
});
test('missing Worker audit rolls back save and confirmation, and read/status disclose no content', async () => {
  for (const action of ['save', 'confirm']) {
    await reset(); const input = await prepare(action === 'save' ? saveInput() : confirmInput()); state.auditFails = true;
    assert.equal((await command(request('kommando', input))).status, 500); noCommit();
  }
  for (const [route, path, input] of [[read, 'lasa', { planId }], [status, 'status', { command: saveInput() }]]) {
    await reset(); state.auditFails = true; const response = await route(request(path, input)); assert.equal(response.status, 500);
    assert.equal((await response.json()).code, 'audit_unavailable'); noCommit();
  }
});
test('2 MiB is an actual streamed-byte boundary, including dishonest or absent Content-Length', async () => {
  const small = JSON.stringify({ planId }), atLimit = small + ' '.repeat(APL_REQUEST_BYTES - new TextEncoder().encode(small).length);
  assert.deepEqual(await aplRequest(request('lasa', null, { raw: atLimit }), parseAplReadRequest), { planId });
  for (const declared of [undefined, '1']) {
    await reset(); let index = 0, cancelled = false;
    const chunk = new Uint8Array(400000).fill(32), stream = new ReadableStream({ pull(controller) {
      if (index++ < 7) controller.enqueue(chunk); else controller.close();
    }, cancel() { cancelled = true; } });
    const response = await read(request('lasa', null, { raw: stream, duplex: true, headers: declared ? { 'Content-Length': declared } : {} }));
    assert.equal(response.status, 400); assert.equal((await response.json()).details.reason, 'payload_too_large');
    assert.equal(cancelled, true); assert.equal(state.calls.length, 0); noCommit();
  }
  await reset(); const response = await command(request('kommando', saveInput(), { headers: { 'Content-Length': String(APL_REQUEST_BYTES + 1) } }));
  assert.equal(response.status, 400); assert.equal(state.calls.length, 0); noCommit();
});


const { POST: timeWrite } = await import('../../app/api/timplaner/gym/tidsrad/route.ts');
const { POST: timeStatus } = await import('../../app/api/timplaner/gym/tidsstatus/route.ts');
const { POST: legacyTimeWrite } = await import('../../app/api/timplaner/gym/rad/route.ts');
async function annualFixture() {
  await reset(); const gym=state.read.basis.gymTimplan;
  gym.timeModel='school_terms_annual_apl_v2';gym.timeCopyReview=[];
  gym.timeRows=Object.fromEntries(distribution.map(r=>[r.rowKey,{schoolMinutes:r.points.map(p=>p>0?24000:null),annualAplMinutes:[0,1,2].map(y=>r.points[y*2]>0||r.points[y*2+1]>0?0:null)}]));
  gym.timeRows[key].schoolMinutes[0]=0;gym.timeRows[key].annualAplMinutes[0]=20700;delete gym.hours;
  state.read.result=await makeDetail(state.read.basis,aplPlan());
  const q={contractVersion:'timplan_time_v2',commandId:uid(55),planId,expectedRevision:7,action:'save_row',rowKey:key,row:structuredClone(gym.timeRows[key])};
  q.row.schoolMinutes[0]=30;
  const result=structuredClone(gym);result.revision=8;result.timeRows[key]=structuredClone(q.row);
  state.timeReply={contractVersion:'timplan_time_sql_v2',plan:result,receipt:{commandId:q.commandId,planId,action:q.action,revision:8,changed:true,replayed:false}};
  return q;
}
test('V2 APL frozen basis counts school plus annual once; zero school still permits budgeted periods',async()=>{
 await annualFixture();const ctx=await contextFor(state.read.basis), projection=projectAplPlan(ctx,aplPlan());
 assert.equal(projection.readyForConfirmation,true);assert.equal((await read(request('lasa',{planId}))).status,200);
 const total=projection.totalMinutes;state.read.basis.gymTimplan.timeRows[key].annualAplMinutes[0]++;
 state.read.result=await makeDetail(state.read.basis,aplPlan());const changed=projectAplPlan(await contextFor(state.read.basis),aplPlan());
 assert.equal(changed.totalMinutes,total+1);assert.equal(changed.readyForConfirmation,false);assert.ok(changed.issues.some(i=>i.code==='annual_apl_unallocated'));
});
test('V2 row protected route validates exact frozen result, status replay, scope and rollback',async()=>{
 let q=await annualFixture();let response=await timeWrite(request('../tidsrad',q));assert.equal(response.status,200);const body=await response.json();assert.equal(body.plan.timeRows[key].schoolMinutes[0],30);assert.equal('hours' in body.plan,false);
 q=await annualFixture();state.timeReply.receipt.replayed=true;state.timeStatus={state:'completed',result:state.timeReply};response=await timeStatus(request('../tidsstatus',{command:q}));assert.equal(response.status,200);assert.equal((await response.json()).result.receipt.replayed,true);
 for(const patch of [{fn:'huvudman'},{mfa:false}]){q=await annualFixture();Object.assign(state,patch);assert.equal((await timeWrite(request('../tidsrad',q))).status,403);assert.equal(state.mutations.length,0);}
 q=await annualFixture();assert.equal((await timeWrite(request('../tidsrad',{...q,actorId:id}))).status,400);assert.equal(state.calls.length,0);
 for(const mutate of [()=>state.timeReply.plan.timeRows[key].schoolMinutes[0]++,()=>state.timeReply.plan.hours={},()=>state.timeReply.receipt.revision++,()=>state.auditFails=true]){q=await annualFixture();mutate();assert.equal((await timeWrite(request('../tidsrad',q))).status,500);noCommit();}
});
test('legacy write route rejects V2 before old SQL mutation and school-only APL forgery fails',async()=>{
 await annualFixture();assert.equal((await legacyTimeWrite(request('../rad',{planId,expectedRevision:7,rowKey:key,hours:[0,null,null,null,null,null]}))).status,400);assert.equal(state.mutations.length,0);
 await annualFixture();state.read.basis.gymTimplan.timeRows[key].annualAplMinutes[0]=1;
 await assert.rejects(projectAplFrozenRead(state.read.result,state.read.basis,planId,authority('rektor')));
});

async function separateFixture(fn = 'rektor', action = 'save') {
  await reset(fn);
  const basis = state.read.basis; basis.aplRevision = 17;
  Object.assign(basis.gymTimplan, { status: 'faststalld', revision: 10, canPlan: false });
  const detail = await makeDetail(basis, aplPlan());
  Object.assign(detail, { revisionScope: 'apl', timplanRevision: 10, revision: 17, reviews: [],
    capabilities: { canSave: fn !== 'huvudman', canConfirm: fn === 'rektor', canReview: fn === 'huvudman' } });
  const rector = { id: uid(31), planId, unitId, actorId: id, assignmentId, actorName: 'Syntetisk rektor',
    at: '2026-10-18T10:00:00.000Z', revision: 17, contentHash: detail.contentHash, comment: 'Granskad förläggning.' };
  detail.confirmations = [rector]; state.read.result = detail;
  const q = { ...(action === 'save' ? saveInput() : confirmInput()), action, revisionScope: 'apl', expectedTimplanRevision: 10, expectedRevision: 17 };
  const result = structuredClone(detail); result.revision++;
  const reviewId = action === 'review' ? uid(32) : null;
  if (reviewId) result.reviews.push({ ...rector, id: reviewId, revision: 18, actorName: 'Syntetisk huvudman',
    timplanRevision: 10, rectorConfirmationId: rector.id, comment: q.comment });
  state.command = envelope({ ...structuredClone(basis), aplRevision: 18 }, { receipt: { contractVersion: 'structured_v1',
    commandId: q.commandId, planId, action, revision: 18, changed: true, replayed: false, contentHash: result.contentHash,
    confirmationId: null, reviewId }, detail: result });
  return q;
}
test('approved timetable is read-only while separate APL is editable and uses an independent revision', async () => {
  const q = await separateFixture();
  assert.equal((await read(request('lasa', { planId }))).status, 200);
  const response = await command(request('kommando', q)); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.detail.revision, 18); assert.equal(body.detail.timplanRevision, 10);
  assert.equal(state.command.basis.gymTimplan.revision, 10);
});
test('separate organizer review is protected by role, MFA and exact confirmation binding', async () => {
  let q = await separateFixture('huvudman', 'review');
  assert.equal((await command(request('kommando', q))).status, 200);
  q = await separateFixture('huvudman', 'review'); state.mfa = false;
  assert.equal((await command(request('kommando', q))).status, 403); noCommit();
  for (const fn of ['rektor', 'administrator']) {
    q = await separateFixture(fn, 'review'); assert.equal((await command(request('kommando', q))).status, 403); noCommit();
  }
  q = await separateFixture('huvudman', 'review'); state.command.result.detail.reviews[0].rectorConfirmationId = uid(99);
  assert.equal((await command(request('kommando', q))).status, 500); noCommit();
});
test('separate APL reply cannot substitute a different timetable revision or independent counter', async () => {
  for (const mutate of [s => s.command.basis.aplRevision++, s => s.command.basis.gymTimplan.revision++,
    s => s.command.result.detail.timplanRevision++, s => s.command.result.detail.capabilities.canSave = false]) {
    const q = await separateFixture(); mutate(state); assert.equal((await command(request('kommando', q))).status, 500); noCommit();
  }
});
