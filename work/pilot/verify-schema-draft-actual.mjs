#!/usr/bin/env node
// Riktiga auth-/schema-API:er genom byggd workerd, egen Keycloak/GoTrue/PostgreSQL och Rust-motor.
// Inga målanslutningar, privata målmanifest, befintliga realmändringar eller browserautentisering tas emot.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSchemaActualRuntime, SCHEMA_ACTUAL_ISSUER } from './schema-draft-actual-runtime.mjs';
import { seedTjanstActual } from './tjanst-oidc-fixtures.mjs';
import { freshOidcCode } from './fresh-oidc-code.mjs';
import { defaultSchemaVillkor, SCHEMA_CONTRACT_VERSION } from '../../web/lib/schema-contract.ts';
import { parseSchemaDraftSave, verifySchemaDraftSaveReply, verifySchemaDraftReadReply, parseSchemaDraftStatusReply, schemaDraftHash } from '../../web/lib/schema-draft-contract.ts';
import { schemaDatumOriginal } from '../../web/lib/schema-datum.ts';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const { chromium } = require('@playwright/test'), OTP = require('otpauth');
const hash = value => createHash('sha256').update(value).digest('hex');
const ROLES = ['principalA', 'admin', 'principalB', 'hm', 'teacherGroup', 'principalAB'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function actor(tx, seed, role) {
  const a = seed.actors[role], [{ id: sessionId }] = await tx`select id from public.app_sessions where identity_id=${a.identityId} order by created_at limit 1`;
  for (const [key, value] of Object.entries({ identity_id: a.identityId, membership_id: a.membershipId, assignment_id: a.assignmentId,
    customer_id: seed.customerId, session_id: sessionId, correlation_id: randomUUID() })) await tx`select set_config(${'app.' + key},${value},true)`;
}
async function seedDates(db, seed) {
  return db.begin(async tx => {
    await actor(tx, seed, 'principalA');
    const [{ revision }] = await tx`select revision from public.timplans where id=${seed.grim.grPlan}`;
    const command = async q => (await tx`select public.phase51_grim_class_command(${tx.json(q)}) value`)[0].value;
    const created = await command({ action: 'create', commandId: randomUUID(), planId: seed.grim.grPlan, expectedPlanRevision: revision, name: 'SYNDATUM2' });
    await command({ action: 'link', commandId: randomUUID(), classId: created.id, planId: seed.grim.grPlan, expectedPlanRevision: revision, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null });
    const pupils = (await tx`select id from public.pupils where customer_id=${seed.customerId} order by id limit 2`).map(p => p.id); assert.equal(pupils.length, 2);
    // Enbart syntetisk startbild i den helt egna DB:n. Verksamhetskommandon under provet går sedan genom HTTP.
    await tx`set local session_replication_role=replica`;
    await tx`delete from public.pupil_class_memberships where pupil_id=any(${pupils}::uuid[])`;
    await tx`update public.pupil_placements set offering_id=${seed.grim.grOffering} where pupil_id=any(${pupils}::uuid[]) and unit_id=${seed.schools.A}`;
    const placements = await tx`select id,pupil_id from public.pupil_placements where pupil_id=any(${pupils}::uuid[]) and unit_id=${seed.schools.A}`;
    const insert = async (pupil, klass, from, to) => {
      const placement = placements.find(p => p.pupil_id === pupil); assert.ok(placement);
      await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
        values(${seed.customerId},${seed.organizerId},${pupil},${seed.schools.A},${klass},${placement.id},${from},${to})`;
    };
    await insert(pupils[0], seed.grim.classes.gr, `${seed.year}-08-17`, `${seed.year}-10-03`);
    await insert(pupils[0], created.id, `${seed.year}-10-04`, null); await insert(pupils[1], created.id, `${seed.year}-08-17`, null);
    await tx`set local session_replication_role=origin`;
    return { classA: seed.grim.classes.gr, classB: created.id, before: `${seed.year}-09-27`, after: `${seed.year}-10-04` };
  });
}
export async function createLogins(runtime, seed, roles = ROLES) {
  const users = {};
  for (const role of roles) {
    const username = `schema-${runtime.runId}-${role.toLowerCase()}`, password = randomBytes(20).toString('hex'), secret = new OTP.Secret({ size: 20 }).base32;
    const credentials = [{ type: 'password', value: password, temporary: false }];
    if (role !== 'principalAB') credentials.push({ type: 'otp', userLabel: 'Own schema test', secretData: JSON.stringify({ value: secret }),
      credentialData: JSON.stringify({ subType: 'totp', digits: 6, counter: 0, period: 30, algorithm: 'HmacSHA1', secretEncoding: 'BASE32' }) });
    await runtime.keycloak('/users', 'POST', { username, email: username + '@example.test', firstName: 'Syntetisk', lastName: role, enabled: true, emailVerified: true, credentials, requiredActions: [] });
    const found = await runtime.keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true'); assert.equal(found.length, 1);
    const a = seed.actors[role]; await runtime.db`update public.identities set issuer=${SCHEMA_ACTUAL_ISSUER},subject=${found[0].id},email=${username + '@example.test'} where id=${a.identityId}`;
    users[role] = { ...a, username, password, secret, subject: found[0].id };
  }
  runtime.privateUpdate({ users }); return users;
}
/** Endast transportadressen ändras. Alla sidor, koder, signaturer och token/JWKS-svar kommer från den egna riktiga Keycloak:n. */
export async function routeOwnIdp(context, idpURL) {
  context.__ownIdpRequests = 0;
  await context.route('http://host.docker.internal:8180/**', async route => {
    const source = new URL(route.request().url()); assert.ok(source.pathname.startsWith('/realms/skolplattform-test/') || source.pathname.startsWith('/resources/'));
    const target = new URL(source.pathname + source.search, idpURL), headers = { ...route.request().headers(), host: source.host };
    context.__ownIdpRequests++;
    const response = await route.fetch({ url: target.toString(), headers, maxRedirects: 0 }); await route.fulfill({ response });
  });
}
export async function login(runtime, browser, user, role, directory) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } }); await routeOwnIdp(context, runtime.idpURL);
  const page = await context.newPage(), callbacks = [];
  page.on('response', r => { const u = new URL(r.url()); if (u.origin === runtime.baseURL && u.pathname === '/api/auth/callback') callbacks.push(r.status()); });
  // En ny navigation krävs för transportreläet: Playwright routar bara första URL:n i en browser-redirectkedja.
  // Den riktiga Worker-endpointen sätter först PKCE/state-cookien i samma cookiejar; dess oförändrade Location följs sedan.
  const start = await page.request.get(runtime.baseURL + '/api/auth/login?till=%2Fapi%2Fhealth%2Fdb', { maxRedirects: 0 });
  assert.equal(start.status(), 302); await page.goto(start.headers().location); assert.ok(context.__ownIdpRequests > 0, 'Owned IdP transport was not reached');
  try { await page.locator('input[name="username"]').waitFor({ state: 'visible', timeout: 8000 }); }
  catch (error) {
    const u = new URL(page.url()); writeFileSync(path.join(directory, 'login-failure-page.json'), JSON.stringify({ role, origin: u.origin, pathname: u.pathname,
      redirectUri: u.searchParams.get('redirect_uri'), expectedRedirectUri: runtime.baseURL + '/api/auth/callback',
      title: await page.title(), text: (await page.locator('body').innerText()).slice(0, 1600) }, null, 2), { mode: 0o600 }); throw error;
  }
  await page.locator('input[name="username"]').fill(user.username); await page.locator('input[name="password"]').fill(user.password);
  await page.locator('input[type="submit"],button[type="submit"]').first().click();
  if (role !== 'principalAB') {
    const otp = page.locator('input[name="otp"]'); await otp.waitFor({ state: 'visible', timeout: 20000 });
    const token = await freshOidcCode({ lastCode: user.lastCode, generate: timestamp => new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTP.Secret.fromBase32(user.secret) }).generate({ timestamp }) });
    user.lastCode = token; await otp.fill(token); await page.locator('input[type="submit"],button[type="submit"]').first().click();
  }
  await page.waitForURL(u => u.origin === runtime.baseURL && u.pathname === '/api/health/db', { timeout: 30000 });
  let response = await page.request.get(runtime.baseURL + '/api/session'), view = await response.json(); assert.equal(response.status(), 200);
  assert.equal(view.identity.subject, user.subject);
  if (view.context?.assignmentId !== user.assignmentId) {
    response = await page.request.post(runtime.baseURL + '/api/context', { headers: { Origin: runtime.baseURL, 'X-Context-Epoch': String(view.epoch) }, data: { assignmentId: user.assignmentId } });
    assert.equal(response.status(), 200); view = await (await page.request.get(runtime.baseURL + '/api/session')).json();
  }
  assert.equal(view.context.assignmentId, user.assignmentId); assert.equal(view.context.valid, true); assert.equal(Boolean(view.mfa.proof), role !== 'principalAB');
  assert.deepEqual(callbacks, [302]);
  const cookie = (await context.cookies(runtime.baseURL)).find(c => c.name === 'sp_session'); assert.ok(cookie);
  const [session] = await runtime.db`select id,identity_id,assignment_id,proof_issuer,acr,amr,proof_client_id from public.app_sessions where token_hash=${Buffer.from(hash(cookie.value), 'hex')}`;
  assert.equal(session.identity_id, user.identityId); assert.equal(session.assignment_id, user.assignmentId); assert.equal(session.proof_issuer, SCHEMA_ACTUAL_ISSUER);
  await context.storageState({ path: path.join(directory, 'auth-' + role + '.json') });
  return { context, page, epoch: view.epoch, sessionId: session.id, proof: { role, callbacks: callbacks.length, mfa: Boolean(view.mfa.proof), acr: session.acr, amr: session.amr } };
}

export async function verifySchemaDraftActual({ out, holdSeconds = 0, runtimeFactory = createSchemaActualRuntime }) {
  out = path.resolve(out);
  assert.ok(out.startsWith('/private/tmp/') && out.endsWith('.json') && !existsSync(out)); assert.ok(holdSeconds === null || Number.isInteger(holdSeconds) && holdSeconds >= 0 && holdSeconds <= 3600);
  const directory = out.slice(0, -5) + '-evidence'; mkdirSync(directory, { mode: 0o700 });
  const report = { kind: 'schema-draft-actual-protected-api', status: 'FAIL', startedAt: new Date().toISOString(), checks: [],
    limits: ['Own initialized PostgreSQL/Keycloak/GoTrue/workerd/Rust only; no target state or browser auth', 'A transport relay preserves the locked local issuer while reaching the owned IdP',
      'Frozen working-tree sources, not an uncreated immutable candidate commit', 'Storage helpers are bootstrap facades; no Storage/municipal integration is claimed', 'Product UI acceptance is separate'] };
  const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const passed = name => { report.checks.push({ name, status: 'PASS' }); save(); console.log(JSON.stringify({ check: name, status: 'PASS' })); };
  let runtime, browser; const sessions = {};
  try {
    runtime = await runtimeFactory({ directory, onStage: stage => console.log(JSON.stringify({ stage })) });
    if (runtime.reportLimits) report.limits = runtime.reportLimits;
    const seed = await seedTjanstActual(runtime.db, { published: false, linkGrim: true }), dated = await seedDates(runtime.db, seed), users = await createLogins(runtime, seed);
    const clients = await runtime.keycloak('/clients?clientId=skolplattform-worker'); assert.equal(clients.length, 1);
    const configured = await runtime.keycloak('/clients/' + clients[0].id); assert.ok(configured.redirectUris.includes(runtime.baseURL + '/api/auth/callback'));
    report.runtime = await runtime.startWorker(); save();
    browser = await chromium.launch({ headless: true });
    for (const role of ROLES) { console.log(JSON.stringify({ stage: 'login', role })); sessions[role] = await login(runtime, browser, users[role], role, directory); }
    report.logins = Object.values(sessions).map(s => s.proof); passed('actual OIDC callbacks, signed claims, GoTrue registration, MFA and selected live school mandates');
    const scope = { contractVersion: 1, unitId: seed.schools.A, schoolYear: seed.year, period: 'ht' };
    const request = async (role, name, body, headers = {}) => {
      const s = sessions[role], route = name.startsWith('/') ? name : '/api/schema/utkast/' + name;
      const response = await s.page.request.post(runtime.baseURL + route, { headers: { Origin: runtime.baseURL, 'X-Context-Epoch': String(s.epoch), ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...headers }, data: body, timeout: 60000 });
      return { status: response.status(), body: await response.json(), correlation: response.headers()['x-correlation-id'] };
    };
    const empty = extra => parseSchemaDraftSave({ ...scope, commandId: randomUUID(), draftId: null, expectedRevision: 0, name: 'Syntetiskt serverutkast', basisVillkor: null,
      workingVillkor: defaultSchemaVillkor(), grundFingerprint: null, placements: [], locks: [], ...extra });
    const firstRead = await request('principalA', 'las', scope); assert.equal(firstRead.status, 200); assert.equal((await verifySchemaDraftReadReply(firstRead.body, scope)).draft, null);
    const absentInput = { ...scope, commandId: randomUUID(), draftId: null }, absent = await request('principalA', 'status', absentInput);
    assert.equal(parseSchemaDraftStatusReply(absent.body, absentInput).found, false); passed('empty read and explicit unknown command status use real protected APIs');
    for (const [role, value, headers, status] of [['principalB', scope, {}, 403], ['hm', scope, {}, 403], ['teacherGroup', scope, {}, 403], ['principalAB', scope, {}, 403],
      ['principalA', { ...scope, unitId: seed.schools.B }, {}, 403], ['principalA', scope, { Origin: 'https://other.example.test' }, 403]]) {
      const denied = await request(role, 'las', value, headers); assert.equal(denied.status, status, role + ': ' + JSON.stringify(denied.body));
    }
    const anonymous = await fetch(runtime.baseURL + '/api/schema/utkast/las', { method: 'POST', headers: { Origin: runtime.baseURL, 'Content-Type': 'application/json' }, body: JSON.stringify(scope) }); assert.equal(anonymous.status, 401);
    assert.equal((await runtime.db`select count(*)::int n from public.schema_drafts where customer_id=${seed.customerId}`)[0].n, 0); passed('wrong school, principal organizer, teacher, weak MFA, CSRF and anonymous requests are denied without a draft');
    const firstInput = empty(), first = await request('principalA', 'spara', firstInput);
    if (first.status !== 200) {
      report.failureProbes = [];
      for (const [route, input] of [['/api/tjanst/plan/lasa', { unitId: scope.unitId, schoolYear: scope.schoolYear }], ['/api/tjanst/personal/lasa', { unitId: scope.unitId }],
        ['/api/valbara-block/lasa', { unitId: scope.unitId, schoolYear: scope.schoolYear }], ['/api/undervisningsgrupper/lasa', { unitId: scope.unitId, schoolYear: scope.schoolYear }],
        ['/api/lasar/lasa', { target: { kind: 'school', unitId: scope.unitId }, schoolYear: scope.schoolYear, versionId: null }]]) {
        const result = await request('principalA', route, input); report.failureProbes.push({ route, status: result.status, code: result.body?.code ?? null });
      }
    }
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const one = await verifySchemaDraftSaveReply(first.body, firstInput); assert.equal(one.draft.revision, 1);
    const secondInput = parseSchemaDraftSave({ ...firstInput, commandId: randomUUID(), draftId: one.draft.id, expectedRevision: 1, workingVillkor: { ...firstInput.workingVillkor, breakMin: 15 } });
    const s = sessions.principalA; let committedReply;
    await s.context.route(runtime.baseURL + '/api/schema/utkast/spara', async route => { const response = await route.fetch(); assert.equal(response.status(), 200); committedReply = await response.json(); await route.abort('connectionreset'); }, { times: 1 });
    const received = await s.page.evaluate(async ({ input, epoch }) => { try { await fetch('/api/schema/utkast/spara', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Context-Epoch': String(epoch) }, body: JSON.stringify(input) }); return true; } catch { return false; } }, { input: secondInput, epoch: s.epoch });
    assert.equal(received, false); assert.ok(committedReply); const statusInput = { ...scope, commandId: secondInput.commandId, draftId: secondInput.draftId };
    const found = await request('principalA', 'status', statusInput), proof = parseSchemaDraftStatusReply(found.body, statusInput); assert.equal(proof.receipt.revision, 2); assert.equal(proof.receipt.requestHash, await schemaDraftHash(secondInput));
    const replay = await request('principalA', 'spara', secondInput); assert.equal(replay.status, 200); assert.equal((await verifySchemaDraftSaveReply(replay.body, secondInput)).receipt.replayed, true);
    assert.equal((await runtime.db`select count(*)::int n from public.schema_draft_revisions where customer_id=${seed.customerId}`)[0].n, 2);
    const changedReplay = await request('principalA', 'spara', { ...secondInput, name: 'Changed command' }); assert.equal(changedReplay.status, 409);
    passed('response aborted after actual commit recovers by status and exact replay without another revision');
    const proposal = await request('principalA', '/api/schema/forslag', { unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: secondInput.workingVillkor });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body)); const f = proposal.body; assert.equal(f.contractVersion, SCHEMA_CONTRACT_VERSION); assert.equal(f.time.source, 'kalender');
    const placed = f.lessons.filter(l => l.day !== null).map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })); assert.ok(placed.length > 1);
    const fullInput = parseSchemaDraftSave({ ...secondInput, commandId: randomUUID(), expectedRevision: 2, basisVillkor: f.villkor, workingVillkor: f.villkor,
      grundFingerprint: f.grundFingerprint, placements: placed.slice(0, -1), locks: placed.slice(0, 1) });
    const full = await request('principalA', 'spara', fullInput); assert.equal(full.status, 200, JSON.stringify(full.body)); let current = (await verifySchemaDraftSaveReply(full.body, fullInput)).draft;
    assert.ok(current.base.lessons.some(l => l.day === null)); assert.equal(current.locks.length, 1); assert.ok(current.source.calendarVersionId); assert.equal(current.source.lessonSources.length, current.base.lessons.length);
    const adminRead = await request('admin', 'las', scope); assert.equal(adminRead.status, 200); assert.equal((await verifySchemaDraftReadReply(adminRead.body, scope)).draft.stale, false);
    const adminInput = parseSchemaDraftSave({ ...fullInput, commandId: randomUUID(), expectedRevision: 3, workingVillkor: { ...fullInput.workingVillkor, breakMin: 20 } });
    const adminSave = await request('admin', 'spara', adminInput); assert.equal(adminSave.status, 200, JSON.stringify(adminSave.body)); current = (await verifySchemaDraftSaveReply(adminSave.body, adminInput)).draft;
    const stale = await request('principalA', 'spara', { ...fullInput, commandId: randomUUID(), expectedRevision: 3 }); assert.equal(stale.status, 409); assert.equal(current.revision, 4);
    passed('real Rust proposal, parked lessons and locks persist; administrator reopens/continues and stale CAS cannot overwrite');
    const lesson = current.base.lessons.find(l => l.day !== null && !current.locks.some(p => p.lesson === l.id)); assert.ok(lesson);
    const original = current.base.time.calendar.days.flatMap(d => { const o = schemaDatumOriginal(current.base, { lesson: lesson.id, originalDate: d.date }); return o ? [o] : []; })[0]; assert.ok(original);
    const changes = [{ lesson: lesson.id, originalDate: original.originalDate, date: original.date, startMin: original.lesson.startMin + 5, room: original.lesson.roomId, durationMin: original.length }];
    const datedInput = parseSchemaDraftSave({ ...adminInput, commandId: randomUUID(), expectedRevision: 4, basisVillkor: current.basisVillkor, workingVillkor: current.workingVillkor, datedOverrides: changes });
    const datedSave = await request('principalA', 'spara', datedInput); assert.equal(datedSave.status, 200, JSON.stringify(datedSave.body)); const datedDraft = (await verifySchemaDraftSaveReply(datedSave.body, datedInput)).draft;
    assert.deepEqual(datedDraft.placements, current.placements); assert.deepEqual(datedDraft.base.lessons, current.base.lessons); assert.deepEqual(datedDraft.datedOverrides, changes);
    const controlInput = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: current.basisVillkor,
      grundFingerprint: current.base.grundFingerprint, placements: current.placements, locks: { grundFingerprint: current.base.grundFingerprint, placements: current.locks }, datedOverrides: changes, dates: [dated.before, dated.after] };
    const control = await request('principalA', '/api/schema/datum', controlInput); assert.equal(control.status, 200, JSON.stringify(control.body));
    assert.ok(control.body.checkedDates.includes(dated.before) && control.body.checkedDates.includes(dated.after));
    const vtDate = current.base.time.calendar.days.find(d => d.term === 'vt' && d.schoolDay).date;
    const outside = await request('principalA', '/api/schema/datum', { ...controlInput, datedOverrides: [{ ...changes[0], date: vtDate }], dates: [] });
    assert.equal(outside.status, 400); assert.equal(outside.body.details.reason, 'schema_datum_date_invalid');
    const { datedOverrides: _dated, dates: _dates, ...weeklyControl } = controlInput;
    const large = ' '.repeat(65537) + JSON.stringify(weeklyControl), largeControl = await request('principalA', '/api/schema/kontroll', large);
    assert.equal(largeControl.status, 200, JSON.stringify(largeControl.body)); assert.equal(largeControl.body.grundFingerprint, current.base.grundFingerprint);
    report.largeSchemaRequestBytes = Buffer.byteLength(large);
    passed('term-only date control rejects the other term and schema control accepts valid JSON above the former 64 KiB limit');
    const motorRequests = readFileSync(runtime.motorRequestsFile ?? path.join(directory, 'motor-requests.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const a = `grupp-${current.base.resurser.klass.findIndex(c => c.ref === dated.classA) + 1}`, b = `grupp-${current.base.resurser.klass.findIndex(c => c.ref === dated.classB) + 1}`;
    const sizes = date => { const problem = motorRequests.findLast(p => p.id === 'datum-' + date); assert.ok(problem); const n = group => problem.groups.find(g => g.id === group).clusters.reduce((sum, id) => sum + problem.clusters.find(c => c.id === id).size, 0); return [n(a), n(b)]; };
    assert.deepEqual(sizes(dated.before), [1, 1]); assert.deepEqual(sizes(dated.after), [0, 2]);
    report.datedEvidence = { before: dated.before, after: dated.after, anonymousGroupSizesBefore: sizes(dated.before), anonymousGroupSizesAfter: sizes(dated.after), motorRequests: motorRequests.length };
    passed('dated save preserves the foundation and real date-specific Rust problems respect inclusive class-membership periods');
    await runtime.db`update public.app_sessions set revoked_at=clock_timestamp() where id=${sessions.admin.sessionId}`;
    const revoked = await request('admin', 'las', scope); assert.equal(revoked.status, 401);
    const audit = await runtime.db`select source,action,outcome,count(*)::int n from public.security_events where customer_id=${seed.customerId} and action like 'schema_%' group by source,action,outcome order by source,action,outcome`;
    assert.ok(audit.some(e => e.source === 'db' && e.action === 'schema_draft_saved' && e.outcome === 'ok')); assert.ok(audit.some(e => e.source === 'worker' && e.outcome === 'denied')); report.audit = audit;
    passed('live revocation denies reopening and both database/Worker audit events exist');
    report.status = 'PASS'; report.apiCompletedAt = new Date().toISOString(); report.ui = { state: 'not_executed', baseURL: runtime.baseURL, directory,
      syntheticStorageState: 'auth-principalA.json', note: 'Use routeOwnIdp for new OIDC navigations; existing owned app session is already verified.' }; save();
    writeFileSync(path.join(directory, 'ui-manifest.json'), JSON.stringify({ baseURL: runtime.baseURL, directory, storageState: path.join(directory, 'auth-principalA.json'),
      idpURL: runtime.idpURL, scope, syntheticOnly: true, releaseRevision: report.runtime.release?.revision ?? report.runtime.build.revision }, null, 2), { mode: 0o600 });
    if (holdSeconds !== 0) {
      console.log(JSON.stringify({ state: 'ready-for-ui', baseURL: runtime.baseURL, directory, holdSeconds }));
      let stopRequested = false; const signal = () => { stopRequested = true; }; process.once('SIGTERM', signal); process.once('SIGINT', signal);
      const deadline = holdSeconds === null ? Infinity : Date.now() + holdSeconds * 1000;
      try { while (!stopRequested && Date.now() < deadline && !existsSync(path.join(directory, 'ui-finished'))) await sleep(250); }
      finally { process.off('SIGTERM', signal); process.off('SIGINT', signal); }
    }
  } catch (error) { report.status = 'FAIL'; report.failure = { code: error.code ?? error.name, message: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gu, '[private-db-url]').slice(0, 1200) };
    writeFileSync(path.join(directory, 'failure-private.txt'), String(error.stack), { mode: 0o600 }); }
  finally {
    for (const session of Object.values(sessions)) await session.context.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (runtime) try { report.cleanup = await runtime.cleanup(); } catch (error) { report.status = 'FAIL'; report.cleanup = { cleanup: 'failed', code: error.code ?? error.name }; }
    for (const role of ROLES) rmSync(path.join(directory, 'auth-' + role + '.json'), { force: true });
    report.completedAt = new Date().toISOString(); save();
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup?.cleanup, report: out }));
  if (report.status !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Den äldre native-Mac-körvägen använder slumpade DB/API-portar som den oförändrade produktgrinden nekar.
  // Exporterna används av namespaceverktyget; skapa aldrig en till variantprofil för att få denna äldre CLI grön.
  console.error('Use prepare-schema-draft-core.mjs, prepare-schema-actual-linux.mjs and verify-schema-draft-namespace.mjs with an explicit PREPARED release.');
  process.exitCode = 2;
}
