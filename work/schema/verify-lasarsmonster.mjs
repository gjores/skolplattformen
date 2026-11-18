#!/usr/bin/env node
// Egen fryst v4/v5-kedja. Kör aldrig målkonfiguration, mål-DB eller en befintlig användares auth.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifySchemaUatRelease } from './prepare-uat-release.mjs';
import { createSchemaActualRuntime } from '../pilot/schema-draft-actual-runtime.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const { chromium } = require('@playwright/test'), postgres = require('postgres');
const digest = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => JSON.parse(readFileSync(file, 'utf8'));
// Samma ägda kärna som prepare-schema-draft-core, men bevara ett sanerat initdb/pg_ctl-fel i just denna verifieringsrapport.
if (process.argv[2] === '--owned-core-helper') {
  const output = path.resolve(process.argv[3]); assert.equal(process.argv.length, 4);
  assert.match(output, /^\/private\/tmp\/schema-draft-actual-y[a-f0-9]{8,12}\.json$/u);
  const directory = output.slice(0, -5) + '-evidence'; assert.equal(existsSync(directory), false); mkdirSync(directory, { mode: 0o700 });
  const report = { kind: 'schema-actual-core-only', status: 'INITIALIZING', noApiVerificationClaimed: true };
  const save = () => writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 }); save();
  let runtime;
  try {
    runtime = await createSchemaActualRuntime({ directory, onStage: stage => console.log(JSON.stringify({ stage })) });
    runtime.privateUpdate({ status: 'core-ready' }); report.status = 'CORE_READY'; report.runtime = runtime.provenance;
    writeFileSync(path.join(directory, 'core-provenance.json'), JSON.stringify(runtime.provenance, null, 2), { mode: 0o600 }); save();
    while (!existsSync(path.join(directory, 'ui-finished'))) await sleep(250);
  } catch (error) {
    const clean = value => String(value ?? '').replace(/postgres(?:ql)?:\/\/\S+/gu, '[private-db-url]').slice(-1800);
    report.status = 'FAIL'; report.failure = { code: error.code ?? error.name, status: error.status, message: clean(error.message), stderr: clean(error.stderr) }; process.exitCode = 1;
  } finally {
    if (runtime) report.cleanup = await runtime.cleanup();
    else if (existsSync(path.join(directory, 'runtime-private.json'))) report.cleanup = { cleanup: read(path.join(directory, 'runtime-private.json')).cleanup };
    save();
  }
  process.exit(process.exitCode ?? 0);
}
const args = process.argv.slice(2);
assert.equal(args.length, 8); assert.deepEqual([args[0], args[2], args[4], args[6]], ['--release', '--expected-manifest-sha256', '--linux-cache', '--out']);
const release = path.resolve(args[1]), linuxCache = path.resolve(args[5]), out = path.resolve(args[7]);
assert.match(args[3], /^[a-f0-9]{64}$/u); assert.match(out, /^\/private\/tmp\/schema-year-actual-[a-z0-9-]+\.json$/u);
assert.ok(linuxCache.startsWith('/private/tmp/') && linuxCache.endsWith('/linux-runtime')); assert.equal(existsSync(out), false);
assert.equal(digest(readFileSync(path.join(release, 'artifact.json'))), args[3], 'The explicit frozen manifest changed');
// Ingen runtime skapas förrän den exakta nya kandidaten och beroendena är kontrollerade.
const manifest = verifySchemaUatRelease(release, { nodeModules: path.join(root, 'web/node_modules') });
assert.equal(manifest.contracts.app, 8); assert.equal(manifest.contracts.motor, 5);
execFileSync('git', ['diff', '--quiet', manifest.source.revision, '--', 'web/app/api', 'web/lib'], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
for (const name of ['schema-contract.ts', 'schema-draft-contract.ts', 'schema-datum.ts', 'schema-underlag.ts', 'schema-lasarsmonster.ts']) {
  assert.equal(digest(readFileSync(path.join(root, 'web/lib', name))), digest(readFileSync(path.join(release, 'source/web/lib', name))), 'Harness contracts differ from frozen source');
}
const domain = await import(pathToFileURL(path.join(release, 'source/web/lib/schema-contract.ts')));
const drafts = await import(pathToFileURL(path.join(release, 'source/web/lib/schema-draft-contract.ts')));
const dates = await import(pathToFileURL(path.join(release, 'source/web/lib/schema-datum.ts')));
const underlag = await import(pathToFileURL(path.join(release, 'source/web/lib/schema-underlag.ts')));
const runId = randomUUID(), suffix = runId.replaceAll('-', ''), directory = out.slice(0, -5) + '-evidence';
mkdirSync(directory, { mode: 0o700 });
// PostgreSQLs Unixsocket har en plattformsgräns på omkring103byte. Håll kärnans katalognamn kort.
const coreOut = `/private/tmp/schema-draft-actual-y${suffix.slice(0, 8)}.json`, coreDir = coreOut.slice(0, -5) + '-evidence';
const apiOut = `/private/tmp/schema-draft-final-namespace-lasarsmonster-${suffix}.json`, apiDir = apiOut.slice(0, -5) + '-evidence';
const report = { kind: 'schema-lasarsmonster-owned-actual', status: 'RUNNING', syntheticOnly: true, startedAt: new Date().toISOString(),
  releaseRevision: manifest.source.revision, releaseManifestSha256: args[3], releaseArtifactSha256: manifest.artifact.sha256, checks: [],
  limits: ['Only fresh owned PostgreSQL/Keycloak/GoTrue/Linux-workerd and exact frozen Rust motor', 'No target or existing user browser auth',
    'Legacy is produced by the explicitly unmarked compatible builder; this is not a historical production document', 'No product UI acceptance or municipality integration is claimed'] };
const save = () => writeFileSync(out, JSON.stringify(report, null, 2), { mode: 0o600 }); save();
const passed = name => { report.checks.push({ name, status: 'PASS' }); save(); console.log(JSON.stringify({ check: name, status: 'PASS' })); };
const children = [];
function start(script, arguments_, name) {
  const fd = openSync(path.join(directory, name + '.log'), 'wx', 0o600);
  const child = spawn(process.execPath, [path.join(root, script), ...arguments_], { cwd: root, env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' }, stdio: ['ignore', fd, fd] });
  child.once('exit', () => closeSync(fd)); children.push({ child, name }); return child;
}
async function waitReport(file, child, predicate, seconds = 900) {
  for (let i = 0; i < seconds * 4; i++) {
    if (existsSync(file)) { const value = read(file); if (predicate(value)) return value; }
    if (child.exitCode !== null || child.signalCode) throw new Error('Owned ' + path.basename(file) + ' exited before required proof');
    await sleep(250);
  }
  throw new Error('Owned proof deadline exceeded: ' + path.basename(file));
}
async function waitExit(child, seconds = 120) {
  if (!child) return;
  for (let i = 0; i < seconds * 4; i++) { if (child.exitCode !== null || child.signalCode) return; await sleep(250); }
  throw new Error('Owned child has not completed orderly cleanup');
}
let coreChild, namespaceChild, browser, context;
try {
  console.log(JSON.stringify({ stage: 'starting-fresh-owned-core' }));
  coreChild = start('work/schema/verify-lasarsmonster.mjs', ['--owned-core-helper', coreOut], 'core');
  await waitReport(coreOut, coreChild, value => value.status === 'CORE_READY');
  // Endast offentliga redan integritetskontrollerade verktyg kopieras, aldrig en gammal runtime/journal/authfil.
  const linux = path.join(coreDir, 'linux-runtime'); mkdirSync(linux, { mode: 0o700 });
  // Relativa ELF-bibliotekslänkar måste förbli relativa när katalogen monteras i Linux.
  for (const name of ['integrity.json', 'node.tar.xz', 'workerd.tgz', 'esbuild.tgz', 'libatomic1_12.2.0-14+deb12u1_arm64.deb', 'node', 'node_modules', 'libatomic']) cpSync(path.join(linuxCache, name), path.join(linux, name), { recursive: true, verbatimSymlinks: true });
  console.log(JSON.stringify({ stage: 'starting-exact-namespace-api-baseline' }));
  namespaceChild = start('work/pilot/verify-schema-draft-namespace.mjs', ['--runtime', path.join(coreDir, 'runtime-private.json'), '--release', release, '--linux', linux, '--out', apiOut, '--hold-until-ui-finished'], 'namespace');
  const baseline = await waitReport(apiOut, namespaceChild, value => value.status === 'PASS' && value.checks.length === 8);
  report.baseline = { checks: 8, sourceRevision: baseline.runtime.release.revision, report: apiOut };
  passed('existing eight protected API cases pass on the new exact candidate');
  const uiFile = path.join(apiDir, 'ui-manifest.json');
  for (let i = 0; i < 80 && !existsSync(uiFile); i++) await sleep(50);
  const ui = read(uiFile), namespace = read(path.join(apiDir, 'namespace-private.json')), settings = read(path.join(apiDir, 'worker-config/worker-private.json'));
  const motorURL = `http://127.0.0.1:${namespace.ports.motor}`;
  const engine = async (route, data) => {
    const response = await fetch(motorURL + '/v1/' + route, { method: 'POST', headers: { Authorization: 'Bearer ' + settings.bindings.SCHEMAMOTOR_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  };
  for (const version of [4, 5]) {
    const rows = ['ht', 'vt'].map((period, i) => ({ period, ...(version === 5 ? { budget: 'arsbudget-1' } : {}), weekday_days: [i ? 19 : 17], min_min: version === 5 ? 720 : (i ? 380 : 340), max_min: version === 5 ? 720 : (i ? 380 : 340) }));
    const problem = { version, id: 'annual-version-' + version, time: { step_min: 5, start_grid_min: 5, days: [{ start_min: 480, end_min: 600 }] }, periods: [{ id: 'ht' }, { id: 'vt' }],
      teachers: [{ id: 'larare-1' }, { id: 'larare-2' }], clusters: [{ id: 'kluster-1', size: 2 }], groups: [{ id: 'grupp-1', clusters: ['kluster-1'] }],
      activities: [{ id: 'behov-1', time: rows }], lessons: ['ht', 'vt'].map((period, i) => ({ id: 'pass-' + (i + 1), activity: 'behov-1', duration_min: 20, teachers: ['larare-' + (i + 1)], groups: ['grupp-1'], periods: [period] })),
      rules: { break_min: 0, lunch: null, same_day: 'allow' }, weights: { late_after_min: null } };
    const placements = problem.lessons.map(l => ({ lesson: l.id, day: 0, start_min: 480, rooms: [] }));
    for (const [route, data] of [['solve?time_ms=100', problem], ['validate', { problem, placements }], ['diagnose', problem],
      ['positions', { problem, placements, lesson: 'pass-1' }], ['suggest', { problem, placements, mode: 'lesson', lesson: 'pass-1', target: null, depth: 1 }]]) {
      const result = await engine(route, data); assert.equal(result.status, 200, 'Real motor endpoint: ' + route); assert.equal(result.body.version, version);
      if (route === 'validate') assert.deepEqual(result.body.violations, []);
    }
  }
  passed('real motor HTTP solve validate diagnose positions suggest preserve both v4 and v5 response versions');
  const uid = n => `75a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, classId = uid(10), blockId = uid(50);
  const options = [31, 32].map(n => ({ sourceKind: 'teaching_group', sourceKey: 'teaching_group:' + uid(n), rowKey: 'group:' + uid(n), label: 'Syntetiskt blockalternativ',
    groupId: uid(n), name: 'Syntetiskt blockalternativ', language: null, groupRevision: 1, classIds: [classId], sourceRefs: [], stale: false, blockId, optionId: uid(n + 50), subjectCode: 'X', levelCode: '1', needHt: 600, needVt: 600, needBasis: 'terms' }));
  const blockPlan = { contractVersion: 1, unitId: uid(1), schoolName: 'Syntetisk blockskola', schoolYear: 2026, revision: 1,
    version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
    teachers: [20, 21].map(n => ({ personId: uid(n), displayName: 'Syntetisk blocklärare', draft: false, shareHere: 100 })),
    classes: [{ classId, name: 'Syntetisk blockklass', link: null, aplMinutes: null, needs: [] }], groups: options, specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true },
    rows: options.map((g, i) => ({ id: uid(40 + i), lineageId: uid(60 + i), sourceKind: 'teaching_group', sourceKey: g.sourceKey, classId: null, rowKey: g.rowKey,
      personId: uid(20 + i), teacherHt: 600, teacherVt: i ? 0 : 600, needHt: 600, needVt: 600, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' })) };
  const blockRequest = { unitId: blockPlan.unitId, schoolYear: blockPlan.schoolYear, period: 'lasar', villkor: { ...domain.defaultSchemaVillkor(), lunch: null, breakMin: 0 } };
  const block = underlag.buildSchemaUnderlag(blockPlan, blockRequest, { members: null, time: underlag.defaultSchemaTime() });
  assert.equal(block.problem.version, 5); assert.ok(block.problem.lessons.filter(l => l.periods?.includes('ht')).some(l => l.teachers.includes('larare-2')));
  assert.ok(block.problem.lessons.filter(l => l.periods?.includes('vt')).every(l => !l.teachers.includes('larare-2')));
  assert.ok(!JSON.stringify(block.problem).includes('75a10000') && !JSON.stringify(block.problem).includes('Syntetisk'));
  const blockSolved = await engine('solve?time_ms=500', block.problem); assert.equal(blockSolved.status, 200); assert.equal(blockSolved.body.status, 'complete');
  const blockChecked = await engine('validate', { problem: block.problem, placements: blockSolved.body.placements }); assert.equal(blockChecked.status, 200); assert.deepEqual(blockChecked.body.violations, []);
  passed('frozen TS reserved-block basis retains actually staffed term teachers and sends only anonymous annual budget to real motor5');
  const roomOnly = { version: 5, id: 'owned-room-only', time: { step_min: 5, start_grid_min: 5, days: [{ start_min: 480, end_min: 600 }] },
    rooms: [{ id: 'sal-1' }], activities: [{ id: 'egen-1' }], lessons: [{ id: 'pass-1', activity: 'egen-1', duration_min: 20, teachers: [], groups: [], rooms: { count: 1, allowed: ['sal-1'] } }],
    rules: { break_min: 0, lunch: null, same_day: 'allow' }, weights: { late_after_min: null } };
  const roomSolved = await engine('solve?time_ms=100', roomOnly); assert.equal(roomSolved.status, 200); assert.equal(roomSolved.body.status, 'complete');
  const roomChecked = await engine('validate', { problem: roomOnly, placements: roomSolved.body.placements }); assert.equal(roomChecked.status, 200); assert.deepEqual(roomChecked.body.violations, []);
  const noActors = structuredClone(roomOnly); delete noActors.lessons[0].rooms;
  const noActorsChecked = await engine('validate', { problem: noActors, placements: [{ lesson: 'pass-1', day: 0, start_min: 480, rooms: [] }] });
  // Validate rapporterar domänfel som avvikelser i ett lyckat kontrollsvar; ogiltiga JSON-kuvert ger400.
  assert.equal(noActorsChecked.status, 200); assert.ok(noActorsChecked.body.violations.some(v => v.code === 'bad_problem'));
  passed('real motor5 accepts a valid room-only activity and still rejects an activity with no participants or room');
  browser = await chromium.launch({ headless: true });
  // Baslinjen skapade och verifierade denna egna session nyss. Ingen användares browserauth importeras.
  assert.equal(ui.syntheticOnly, true); assert.equal(ui.directory, apiDir); assert.equal(ui.releaseRevision, manifest.source.revision);
  assert.equal(ui.storageState, path.join(apiDir, 'auth-principalA.json'));
  context = await browser.newContext({ storageState: ui.storageState });
  const page = await context.newPage(), liveSession = await page.request.get(ui.baseURL + '/api/session');
  assert.equal(liveSession.status(), 200, 'Fresh owned session must remain live'); const view = await liveSession.json();
  assert.equal(view.identity.subject, namespace.users.principalA.subject); assert.equal(view.context.assignmentId, namespace.users.principalA.assignmentId);
  assert.equal(view.context.valid, true); assert.ok(view.mfa.proof); assert.ok(Number.isSafeInteger(view.epoch));
  const session = { page, epoch: view.epoch };
  passed('fresh own principal session from actual OIDC baseline still has live selected mandate and MFA');
  const scope = { ...ui.scope, period: 'lasar' }, request = async (route, input) => {
    const response = await session.page.request.post(ui.baseURL + (route.startsWith('/') ? route : '/api/schema/utkast/' + route), { headers: { Origin: ui.baseURL, 'X-Context-Epoch': String(session.epoch) }, data: input, timeout: 60000 });
    return { status: response.status(), body: await response.json() };
  };
  const legacyVillkor = domain.defaultSchemaVillkor(); delete legacyVillkor.timeBasis;
  const proposal = await request('/api/schema/forslag', { unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: legacyVillkor });
  assert.equal(proposal.status, 200); const legacy = proposal.body; assert.equal(legacy.contractVersion, 8); assert.equal(Object.hasOwn(legacy.villkor, 'timeBasis'), false);
  const at = legacy.lessons.filter(l => l.day !== null).map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })); assert.ok(at.length > 3);
  const lesson = legacy.lessons.find(l => at.some(p => p.lesson === l.id) && l.id !== at[0].lesson && l.id !== at.at(-1).lesson);
  const occurrence = legacy.time.calendar.days.flatMap(d => { const o = dates.schemaDatumOriginal(legacy, { lesson: lesson.id, originalDate: d.date }); return o ? [o] : []; })[0]; assert.ok(occurrence);
  const datedOverrides = [{ lesson: lesson.id, originalDate: occurrence.originalDate, date: occurrence.date, startMin: lesson.startMin, room: lesson.roomId, durationMin: occurrence.length }];
  const passRule = { slag: 'pass', ref: at[0].lesson, typ: 'marginal', beforeMin: 5, afterMin: 0, occupies: ['elever'], label: 'Syntetisk marginal', visibleFor: ['elever'], when: 'alltid' };
  const firstInput = drafts.parseSchemaDraftSave({ ...scope, commandId: randomUUID(), draftId: null, expectedRevision: 0, name: 'Syntetiskt äldre termutkast',
    basisVillkor: legacy.villkor, workingVillkor: { ...legacy.villkor, egna: [...legacy.villkor.egna, passRule] }, grundFingerprint: legacy.grundFingerprint,
    placements: at.slice(0, -1), locks: at.slice(0, 1), intentional: [], datedOverrides, activityTypes: [] });
  const first = await request('spara', firstInput); assert.equal(first.status, 200); const saved = (await drafts.verifySchemaDraftSaveReply(first.body, firstInput)).draft;
  const opened = await request('las', scope); assert.equal(opened.status, 200); assert.equal((await drafts.verifySchemaDraftReadReply(opened.body, scope)).draft.contentHash, saved.contentHash);
  assert.equal(Object.hasOwn(saved.basisVillkor, 'timeBasis'), false); assert.equal(Object.hasOwn(saved.base.villkor, 'timeBasis'), false);
  passed('unmarked synthetic legacy bas8 doc1 saves and reopens with verified canonical hash locks pass-rule and dated occurrence');
  const pendingInput = drafts.parseSchemaDraftSave({ ...firstInput, commandId: randomUUID(), draftId: saved.id, expectedRevision: saved.revision,
    basisVillkor: saved.basisVillkor, workingVillkor: { ...saved.workingVillkor, timeBasis: 'lasar' } });
  const pendingResponse = await request('spara', pendingInput); assert.equal(pendingResponse.status, 200);
  const pending = (await drafts.verifySchemaDraftSaveReply(pendingResponse.body, pendingInput)).draft;
  assert.equal(pending.requiresRecalculation, true); assert.deepEqual(pending.base, saved.base); assert.deepEqual(pending.locks, saved.locks); assert.deepEqual(pending.datedOverrides, saved.datedOverrides);
  assert.deepEqual(pending.workingVillkor.egna, saved.workingVillkor.egna);
  const foundInput = { ...scope, commandId: pendingInput.commandId, draftId: saved.id }, found = await request('status', foundInput);
  assert.equal(drafts.parseSchemaDraftStatusReply(found.body, foundInput).receipt.revision, pending.revision);
  const replay = await request('spara', pendingInput); assert.equal((await drafts.verifySchemaDraftSaveReply(replay.body, pendingInput)).receipt.replayed, true);
  const stale = await request('spara', { ...pendingInput, commandId: randomUUID(), name: 'Must not overwrite' }); assert.equal(stale.status, 409);
  passed('annual working marker over legacy foundation persists without remapping; status replay and stale CAS preserve the exact old base');
  const annualVillkor = { ...pending.workingVillkor, egna: pending.workingVillkor.egna.filter(r => r.slag !== 'pass') };
  const annualResponse = await request('/api/schema/forslag', { unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: annualVillkor }); assert.equal(annualResponse.status, 200);
  const annual = annualResponse.body; assert.equal(annual.villkor.timeBasis, 'lasar'); assert.notEqual(annual.grundFingerprint, saved.base.grundFingerprint);
  const annualAt = annual.lessons.filter(l => l.day !== null).map(l => ({ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId })); assert.ok(annualAt.length > 0);
  const annualInput = drafts.parseSchemaDraftSave({ ...pendingInput, commandId: randomUUID(), expectedRevision: pending.revision,
    basisVillkor: annual.villkor, workingVillkor: annual.villkor, grundFingerprint: annual.grundFingerprint, placements: annualAt, locks: [], datedOverrides: [] });
  const annualSaved = await request('spara', annualInput); assert.equal(annualSaved.status, 200); const current = (await drafts.verifySchemaDraftSaveReply(annualSaved.body, annualInput)).draft;
  assert.equal(current.requiresRecalculation, false); assert.equal(current.base.villkor.timeBasis, 'lasar'); assert.equal(current.documentVersion, 1);
  const finalRead = await request('las', scope); assert.equal((await drafts.verifySchemaDraftReadReply(finalRead.body, scope)).draft.contentHash, current.contentHash);
  const selected = current.base.lessons.filter(l => l.term === null && l.day !== null && !l.egenAktivitet).flatMap(lesson => {
    const original = current.base.time.calendar.days.filter(d => d.term === 'ht').flatMap(d => { const o = dates.schemaDatumOriginal(current.base, { lesson: lesson.id, originalDate: d.date }); return o && o.length >= current.base.villkor.minLessonMin + 5 ? [o] : []; })[0];
    return original ? [{ lesson, original }] : [];
  })[0]; assert.ok(selected);
  const { lesson: shared, original } = selected;
  const target = current.base.time.calendar.days.find(d => d.term === 'vt' && d.schoolDay && shared.classIds.every(id => d.classes[id]?.schoolDay ?? d.schoolDay)); assert.ok(target);
  const move = { lesson: shared.id, originalDate: original.originalDate, date: target.date, startMin: shared.startMin, room: shared.roomId, durationMin: original.length };
  const dateInput = { contractVersion: 8, unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: current.basisVillkor,
    grundFingerprint: current.base.grundFingerprint, placements: current.placements, datedOverrides: [move], dates: [] };
  const moved = await request('/api/schema/datum', dateInput); assert.equal(moved.status, 200); const dateReply = dates.parseSchemaDatumSvar(moved.body, dateInput);
  assert.equal(dateReply.timeChanges.reduce((sum, row) => sum + row.deltaMin, 0), 0);
  assert.ok(dateReply.checkedDates.includes(original.originalDate) && dateReply.checkedDates.includes(target.date));
  const tampered = await request('/api/schema/datum', { ...dateInput, datedOverrides: [{ ...move, durationMin: original.length - 5 }] });
  assert.equal(tampered.status, 400); assert.equal(tampered.body.details.reason, 'schema_datum_duration_changed');
  // En ny beräknad kortning av ORIGINALTILLFÄLLET får inte göra ett gammalt undantag giltigt. Ingen ny längdeditor införs.
  const shorterOriginal = structuredClone(current.base), originalTerm = original.term, cut = shared.durationMin - original.length + 5;
  shorterOriginal.trims = shorterOriginal.trims.filter(t => t.lesson !== shared.id || t.term !== originalTerm);
  shorterOriginal.trims.push({ lesson: shared.id, term: originalTerm, fixedMin: 0, extraCount: 1, extraMin: cut, occasions: [{ date: original.originalDate, minutes: cut }] });
  assert.equal(dates.schemaDatumOriginal(shorterOriginal, move).length, original.length - 5);
  assert.throws(() => dates.kontrolleraSchemaDatum(shorterOriginal, [move]), error => error.reason === 'schema_datum_duration_changed');
  passed('actual annual date transfer has zero year delta; changed original length is denied and frozen-model stale trim invalidates the old exception');
  const core = read(path.join(coreDir, 'runtime-private.json')), db = postgres({ path: path.join(core.pg, `.s.PGSQL.${core.ports.postgres}`), database: core.database, username: 'postgres', prepare: false });
  try { const history = await db`select revision,content_hash from public.schema_draft_revisions where draft_id=${saved.id} order by revision`;
    assert.equal(history.length, 3); assert.equal(history[0].content_hash, saved.contentHash); assert.equal(history[1].content_hash, pending.contentHash);
    report.history = history.map(row => ({ revision: row.revision, contentHash: row.content_hash }));
  } finally { await db.end(); }
  passed('new annual doc1 saves and reopens while prior legacy and pending revisions remain immutable');
  // Skolans salregister (05.2-SM-UXF-23) genom den riktiga Workern och RPC:erna, sist så att tidigare fall prövas utan register.
  const roomScope = { contractVersion: 1, unitId: scope.unitId }, rooms = (route, input) => request('/api/schema/salregister/' + route, input);
  const noRooms = await rooms('las', roomScope); assert.equal(noRooms.status, 200); assert.equal(noRooms.body.register, null);
  const roomDocument = { nasta: 3, salar: [{ id: 'sal-1', name: 'Syntetisk sal A', typ: 'Allmän sal', platser: 30, utrustning: [] },
    { id: 'sal-2', name: 'Syntetiskt labb', typ: 'Laborationssal', platser: null, utrustning: ['Dragskåp'] }] };
  const roomSave = { ...roomScope, commandId: randomUUID(), expectedRevision: 0, document: roomDocument };
  const savedRooms = await rooms('spara', roomSave); assert.equal(savedRooms.status, 200); assert.equal(savedRooms.body.register.revision, 1);
  assert.deepEqual(savedRooms.body.register.document, roomDocument); assert.equal(savedRooms.body.replayed, false);
  const replayedRooms = await rooms('spara', roomSave); assert.equal(replayedRooms.status, 200); assert.equal(replayedRooms.body.replayed, true);
  assert.equal((await rooms('spara', { ...roomSave, commandId: randomUUID() })).status, 409);
  assert.equal((await rooms('spara', { ...roomSave, commandId: randomUUID(), expectedRevision: 1, document: { nasta: 2, salar: [] } })).status, 400);
  const reopenedRooms = await rooms('las', roomScope); assert.deepEqual(reopenedRooms.body.register.document, roomDocument);
  const roomVillkor = domain.defaultSchemaVillkor(), withRooms = await request('/api/schema/forslag', { unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period, villkor: roomVillkor });
  assert.equal(withRooms.status, 200); assert.equal(withRooms.body.villkor.salregister.kalla, 'skola');
  assert.deepEqual(withRooms.body.villkor.salregister.salar, roomDocument.salar); assert.deepEqual(withRooms.body.rooms.map(r => r.name), ['Syntetisk sal A', 'Syntetiskt labb']);
  const roomDb = postgres({ path: path.join(core.pg, `.s.PGSQL.${core.ports.postgres}`), database: core.database, username: 'postgres', prepare: false });
  try { const audits = await roomDb`select action,count(*)::int n from public.security_events where action in ('school_rooms_read','school_rooms_saved') group by action order by action`;
    assert.deepEqual(audits.map(a => a.action), ['school_rooms_read', 'school_rooms_saved']); report.schoolRooms = { audits: audits.map(a => ({ action: a.action, rows: a.n })) };
  } finally { await roomDb.end(); }
  passed('school room register saves, replays and rejects stale or shrinking documents through the actual Worker and RPCs, is audited and reaches the schedule basis');
  report.status = 'PASS'; report.apiCompletedAt = new Date().toISOString(); save();
} catch (error) {
  report.status = 'FAIL'; report.failure = { code: error.code ?? error.name, message: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gu, '[private-db-url]').slice(0, 700) }; save();
} finally {
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  try {
    if (existsSync(apiDir)) writeFileSync(path.join(apiDir, 'ui-finished'), 'Own year API cases completed; no UI hold requested\n', { mode: 0o600 });
    await waitExit(namespaceChild);
    if (existsSync(coreDir)) writeFileSync(path.join(coreDir, 'ui-finished'), 'Namespace stopped; stop only owned core\n', { mode: 0o600 });
    await waitExit(coreChild);
    const coreFile = path.join(coreDir, 'runtime-private.json'), namespaceFile = path.join(apiDir, 'namespace-private.json');
    for (const file of [coreFile, namespaceFile]) if (existsSync(file)) { const journal = read(file); assert.equal(journal.cleanup, 'complete'); delete journal.users; delete journal.secrets;
      writeFileSync(file, JSON.stringify(journal, null, 2), { mode: 0o600 }); }
    if (existsSync(coreFile)) assert.equal(existsSync(read(coreFile).pg), false);
    if (existsSync(namespaceFile)) assert.equal(existsSync(path.join(apiDir, 'worker-config')), false);
    for (const name of ['principalA', 'admin', 'principalB', 'hm', 'teacherGroup', 'principalAB']) rmSync(path.join(apiDir, 'auth-' + name + '.json'), { force: true });
    report.cleanup = { status: 'PASS', namespace: existsSync(namespaceFile) ? 'complete' : 'not_created', ownCore: existsSync(coreFile) ? 'complete' : 'not_created', credentialsRemoved: true, targetTouched: false };
    if (existsSync(apiOut)) report.baseline = { ...report.baseline, finalReportSha256: digest(readFileSync(apiOut)) };
  } catch (error) { report.status = 'FAIL'; report.cleanup = { status: 'FAILED', reason: error.code ?? error.name, ownedProcesses: children.filter(x => x.child.exitCode === null).map(x => ({ name: x.name, pid: x.child.pid })) }; }
  report.completedAt = new Date().toISOString(); save();
}
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup?.status, report: out }));
if (report.status !== 'PASS') process.exitCode = 1;
