#!/usr/bin/env node
// Egen syntetisk namespace, verklig produkt-UI/OIDC/Worker/DB/motor. Kör först efter uttryckligt körklart.
// node work/pilot/verify-schema-draft-ui.mjs --manifest /private/tmp/schema-draft-final-namespace-01-evidence/ui-manifest.json --release /private/tmp/schema-uat-release-20261116-fd3c3eda --run-owned-ui
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifySchemaUatRelease } from '../schema/prepare-uat-release.mjs';
import { routeOwnIdp } from './verify-schema-draft-actual.mjs';
import { loginSchemaNamespace } from './schema-draft-namespace-login.mjs';
import { parseSchemaDraftSave, parseSchemaDraftScope, schemaDraftHash, verifySchemaDraftReadReply, verifySchemaDraftSaveReply } from '../../web/lib/schema-draft-contract.ts';
import { villkorNyckel } from '../../web/lib/schema-contract.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(ROOT, 'web/package.json'));
const { chromium, expect } = require('@playwright/test');
const DIRECTORY = '/private/tmp/schema-draft-final-namespace-01-evidence', MANIFEST = DIRECTORY + '/ui-manifest.json';
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const sameScope = (a, b) => a.unitId === b.unitId && a.schoolYear === b.schoolYear && a.period === b.period;
const sorted = (items, key) => [...items].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
const counts = d => ({ lessons: d.base?.lessons.length ?? 0, placed: d.placements.length, parked: (d.base?.lessons.length ?? 0) - d.placements.length,
  locks: d.locks.length, dated: d.datedOverrides.length, activities: d.workingVillkor.aktiviteter?.length ?? 0, types: d.activityTypes.length });
function invariant(ok, code) { if (!ok) throw Object.assign(new Error(code), { code }); }
async function until(check, code, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await check(); if (result) return result; await sleep(150); }
  invariant(false, code);
}
export function readOwnedUiInput(manifestFile, release) {
  assert.equal(path.resolve(manifestFile), MANIFEST); assert.equal(realpathSync(manifestFile), MANIFEST);
  const m = json(MANIFEST); assert.equal(m.syntheticOnly, true); assert.equal(m.directory, DIRECTORY); assert.equal(realpathSync(DIRECTORY), DIRECTORY);
  assert.equal(m.storageState, DIRECTORY + '/auth-principalA.json'); assert.equal(realpathSync(m.storageState), m.storageState);
  for (const address of [m.baseURL, m.idpURL]) {
    const u = new URL(address); assert.equal(u.protocol, 'http:'); assert.equal(u.hostname, '127.0.0.1');
    assert.equal(u.username + u.password + u.search + u.hash, ''); assert.equal(u.pathname, '/');
    assert.ok(Number(u.port) >= 49152 && Number(u.port) <= 65535 && !['3012', '3013'].includes(u.port));
  }
  m.scope = parseSchemaDraftScope(m.scope); assert.equal(m.scope.schoolYear, 2027); assert.equal(m.scope.period, 'ht');
  release = realpathSync(path.resolve(release)); assert.ok(release.startsWith('/private/tmp/schema-uat-release-'));
  const prepared = verifySchemaUatRelease(release, { nodeModules: path.join(ROOT, 'web/node_modules') });
  assert.equal(prepared.source.revision, m.releaseRevision); assert.equal(m.apiSourceUnchanged, true); assert.equal(m.identicalMotorBytes, true);
  const manifestSha = hash(readFileSync(path.join(release, 'artifact.json')));
  assert.equal(m.releaseManifestSha256, manifestSha); assert.equal(m.releaseArtifactSha256, prepared.artifact.sha256);
  const loads = readFileSync(DIRECTORY + '/ui-builds.jsonl', 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const loaded = loads.at(-1); assert.equal(loaded.kind, 'schema-namespace-exact-ui-release'); assert.equal(loaded.status, 'ready');
  assert.equal(loaded.releaseRevision, m.releaseRevision); assert.equal(loaded.baseURL, m.baseURL); assert.equal(loaded.releaseManifestSha256, manifestSha);
  assert.equal(loaded.releaseArtifactSha256, prepared.artifact.sha256); assert.equal(loaded.apiSourceUnchanged, true); assert.equal(loaded.identicalMotorBytes, true);
  assert.equal(loaded.sqlUnchanged, true); assert.equal(loaded.noDbWrites, true); assert.equal(loaded.noAuthChanges, true);
  return { manifest: m, release, prepared, manifestSha };
}
async function preservationHash(d) {
  return schemaDraftHash({ placements: sorted(d.placements, p => p.lesson), locks: sorted(d.locks, p => p.lesson),
    dated: sorted(d.datedOverrides, p => `${p.lesson}:${p.originalDate}`), working: villkorNyckel(d.workingVillkor),
    basis: villkorNyckel(d.basisVillkor), intentional: d.intentional, activityTypes: d.activityTypes });
}
// Enbart observerade riktiga browseranrop. Alla råa dokument stannar i processminnet.
function observe(page, manifest) {
  const state = { reads: [], readPeriods: [], saves: [], generated: [], activities: [], diagnoses: [], failures: [], pending: new Set(), statusCounts: {} };
  page.on('response', response => {
    const u = new URL(response.url()); if (u.origin !== manifest.baseURL || !u.pathname.startsWith('/api/schema/')) return;
    const action = u.pathname.slice('/api/schema/'.length), status = response.status();
    state.statusCounts[action + ':' + status] = (state.statusCounts[action + ':' + status] ?? 0) + 1;
    const task = (async () => {
      if (!['utkast/las', 'utkast/spara', 'forslag', 'aktiviteter', 'diagnos'].includes(action)) return;
      const input = response.request().postDataJSON();
      if (action === 'utkast/las' && input.unitId === manifest.scope.unitId && input.schoolYear === manifest.scope.schoolYear) state.readPeriods.push({ period: input.period, status });
      if (!sameScope(input, manifest.scope)) return;
      if (status !== 200) { state.failures.push({ action, status }); return; }
      const raw = await response.json();
      if (action === 'utkast/las') state.reads.push((await verifySchemaDraftReadReply(raw, manifest.scope)).draft);
      else if (action === 'utkast/spara') state.saves.push(await verifySchemaDraftSaveReply(raw, parseSchemaDraftSave(input)));
      else if (action === 'forslag') state.generated.push(raw);
      else if (action === 'aktiviteter') state.activities.push(raw);
      else state.diagnoses.push(raw);
    })().catch(() => { state.failures.push({ action, status, code: 'response_verification_failed' }); }).finally(() => state.pending.delete(task));
    state.pending.add(task);
  });
  state.settle = () => Promise.all(state.pending);
  return state;
}
async function scopes(page, manifest) {
  const school = page.getByRole('combobox', { name: 'Planeringsskola', exact: true }); await expect(school).toBeEnabled(); await school.selectOption(manifest.scope.unitId);
  const year = page.getByRole('combobox', { name: 'Planeringsläsår', exact: true }); await expect(year).toBeEnabled(); await year.selectOption(String(manifest.scope.schoolYear));
  const period = page.getByRole('combobox', { name: 'Schemat gäller', exact: true }); await expect(period).toBeEnabled(); await period.selectOption(manifest.scope.period);
  await expect(school).toHaveValue(manifest.scope.unitId); await expect(year).toHaveValue(String(manifest.scope.schoolYear)); await expect(period).toHaveValue('ht');
}
async function readAfter(page, monitor, index) {
  const draft = await until(() => monitor.reads.length > index && monitor.reads.at(-1), 'verified_draft_read_missing');
  await expect(page.getByRole('region', { name: 'Sparat schemautkast', exact: true }).getByText('Sparat på servern', { exact: true })).toBeVisible();
  return draft;
}
async function savedAfter(page, monitor, index, predicate = () => true) {
  const reply = await until(() => monitor.saves.slice(index).find(s => predicate(s.draft)), 'verified_draft_receipt_missing', 90_000);
  await expect(page.getByRole('region', { name: 'Sparat schemautkast', exact: true }).getByText('Sparat på servern', { exact: true })).toBeVisible();
  await monitor.settle(); return reply.draft;
}
async function picture(page, report, filename) {
  const file = path.join(DIRECTORY, report.startedAt.replaceAll(':', '-') + '-' + filename);
  await page.screenshot({ path: file, fullPage: false }); chmodSync(file, 0o600); report.images.push(file);
}
async function freshPage(browser, manifest, width) {
  let context, page, renewed = false;
  if (Date.now() - statSync(manifest.storageState).mtimeMs >= 15 * 60_000) {
    ({ context, page } = await loginSchemaNamespace({ manifestFile: MANIFEST, browser, role: 'principalA' })); renewed = true;
  } else {
    context = await browser.newContext({ storageState: manifest.storageState, viewport: { width, height: 1000 }, locale: 'sv-SE', reducedMotion: 'reduce' });
    await routeOwnIdp(context, manifest.idpURL); page = await context.newPage();
  }
  await page.setViewportSize({ width, height: 1000 }); page.setDefaultTimeout(30_000); page.setDefaultNavigationTimeout(45_000);
  return { context, page, renewed };
}
async function preserve(browser, manifest, width, report) {
  report.stage = 'open_' + width;
  const session = await freshPage(browser, manifest, width), { page, context } = session, monitor = observe(page, manifest);
  try {
    await page.goto(manifest.baseURL + '/?vy=schema', { waitUntil: 'domcontentloaded' }); await scopes(page, manifest);
    const initial = await readAfter(page, monitor, 0), before = await preservationHash(initial), initialCounts = counts(initial);
    report.seed = { counts: initialCounts, workingBreakMin: initial.workingVillkor.breakMin, basisBreakMin: initial.basisVillkor?.breakMin ?? null,
      requiresRecalculation: initial.requiresRecalculation, contentHash: initial.contentHash };
    invariant(initialCounts.parked === 1 && initialCounts.locks === 1 && initialCounts.dated === 1, 'seed_scope_or_counts_changed');
    // API-seeden är serverkanoniserad till 20/20; bevara det kvitterade underlaget, inte ett antaget pending-tillstånd.
    invariant(initial.workingVillkor.breakMin === 20 && initial.basisVillkor?.breakMin === 20, 'seed_conditions_changed');
    report.checks.push({ check: 'verified_read', width, status: 'PASS', contentHash: initial.contentHash, counts: initialCounts });
    report.stage = 'rename_' + width;
    let name = `UI-prov ${width} ${randomUUID().slice(0, 8)}`; const saveIndex = monitor.saves.length;
    await page.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill(name);
    const saved = await savedAfter(page, monitor, saveIndex, d => d.name === name); invariant(await preservationHash(saved) === before, 'autosave_changed_schedule');
    report.checks.push({ check: 'ui_autosave_verified_receipt', width, status: 'PASS', contentHash: saved.contentHash, preservationHash: before });
    report.stage = 'reload_' + width;
    let readIndex = monitor.reads.length; await page.evaluate(() => localStorage.clear()); await page.reload({ waitUntil: 'domcontentloaded' }); await scopes(page, manifest);
    let reopened = await readAfter(page, monitor, readIndex); invariant(reopened.name === name && await preservationHash(reopened) === before, 'reload_lost_schedule');
    report.checks.push({ check: 'reload_after_clear_local_storage', width, status: 'PASS', contentHash: reopened.contentHash, preservationHash: before });
    report.stage = 'history_' + width;
    readIndex = monitor.reads.length; await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForURL(u => u.searchParams.get('vy') !== 'schema'); await page.goBack({ waitUntil: 'domcontentloaded' });
    const returnedPeriod = page.getByRole('combobox', { name: 'Schemat gäller', exact: true }); await expect(returnedPeriod).toBeEnabled();
    const activePeriod = await returnedPeriod.inputValue();
    report.history = { width, expectedPeriod: manifest.scope.period, activePeriod, readPeriods: monitor.readPeriods };
    if (activePeriod !== manifest.scope.period) { await picture(page, report, `actual-schema-history-period-${width}.png`); invariant(false, 'history_period_changed'); }
    reopened = await readAfter(page, monitor, readIndex); invariant(reopened.name === name && await preservationHash(reopened) === before, 'history_lost_schedule');
    report.checks.push({ check: 'start_then_browser_back', width, status: 'PASS', contentHash: reopened.contentHash, preservationHash: before });
    await expect(page.getByRole('combobox', { name: 'Planeringsskola', exact: true })).toHaveValue(manifest.scope.unitId);
    await expect(page.getByRole('combobox', { name: 'Planeringsläsår', exact: true })).toHaveValue('2027'); await expect(page.getByRole('combobox', { name: 'Schemat gäller', exact: true })).toHaveValue('ht');
    if (width === 1600) {
      report.stage = 'shared_window';
      await page.getByRole('button', { name: 'Fönster', exact: true }).click(); const ready = context.waitForEvent('page');
      await page.getByRole('menuitem', { name: 'Regelavvikelser', exact: true }).click(); const child = await ready;
      try {
        await child.waitForLoadState('domcontentloaded'); await expect(child.getByText('Live', { exact: true }).first()).toBeVisible();
        const childName = child.getByRole('textbox', { name: 'Namn på utkastet', exact: true }); await expect(childName).toHaveValue(name); await expect(childName).toBeDisabled();
        const index = monitor.saves.length; name += ' fönster'; await page.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill(name);
        reopened = await savedAfter(page, monitor, index, d => d.name === name); invariant(await preservationHash(reopened) === before, 'shared_window_changed_schedule');
        await expect(childName).toHaveValue(name); await expect(childName).toBeDisabled();
        report.checks.push({ check: 'real_shared_window_name', status: 'PASS', contentHash: reopened.contentHash, preservationHash: before });
      } finally { await child.close(); }
    }
    await picture(page, report, `actual-schema-reopened-${width}.png`);
    if (width === 1600) {
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      await page.getByRole('region', { name: 'Sparat schemautkast', exact: true }).scrollIntoViewIfNeeded(); await picture(page, report, 'actual-schema-text-200-1600.png');
      invariant(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'large_text_horizontal_overflow');
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    }
    report.profiles.push({ width, status: 'PASS', loginRenewed: session.renewed, counts: initialCounts, preservationHash: before,
      reopenedContentHash: reopened.contentHash, receiptVerified: true, reads: monitor.reads.length, saves: monitor.saves.length, statusCounts: monitor.statusCounts });
    return { context, page, monitor, draft: reopened };
  } catch (error) { await context.close(); throw error; }
}
async function activity(run, manifest, report) {
  report.stage = 'activity_type';
  const { page, monitor, draft } = run;
  if (!draft.activityTypes.length) {
    await page.getByRole('button', { name: 'Hantera typer', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Hantera aktivitetstyper', exact: true });
    await dialog.getByLabel('Typens namn', { exact: true }).fill('UI-prov återkommande aktivitet');
    const index = monitor.saves.length; await dialog.getByRole('button', { name: 'Lägg till typ', exact: true }).click();
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    await savedAfter(page, monitor, index, d => d.activityTypes.some(t => t.name === 'UI-prov återkommande aktivitet'));
  }
  report.stage = 'activity_conditions';
  const conditions = page.locator('details.schema-villkor'); if (await conditions.getAttribute('open') === null) await conditions.locator('summary').click();
  const length = conditions.getByRole('combobox', { name: 'Längsta pass', exact: true }), value = await length.inputValue();
  const choices = await length.locator('option').evaluateAll(os => os.map(o => o.value));
  const other = choices.find(v => Number(v) > Number(value)) ?? choices.find(v => v !== value); invariant(other, 'activity_recovery_option_missing'); await length.selectOption(other);
  report.stage = 'activity_form';
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click(); const form = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  const name = `UI-prov aktivitet ${randomUUID().slice(0, 8)}`; await form.getByLabel('Namn', { exact: true }).fill(name);
  const klass = form.getByRole('group', { name: 'Klasser', exact: true }).getByRole('checkbox').first();
  const teacher = form.getByRole('group', { name: 'Ansvariga', exact: true }).getByRole('checkbox').first();
  await expect(klass).toBeVisible(); await expect(teacher).toBeVisible(); await klass.check(); await teacher.check();
  const className = await klass.evaluate(el => el.closest('label').textContent.trim()), teacherName = await teacher.evaluate(el => el.closest('label').textContent.trim());
  invariant(className && teacherName, 'activity_dom_resources_missing');
  await form.getByLabel('Längd i minuter', { exact: true }).fill('20'); await form.getByRole('button', { name: 'Låt motorn placera', exact: true }).click();
  report.stage = 'activity_pending_submit'; await form.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  const recovery = form.getByRole('button', { name: /^(?:Lås upp \d+ pass och ta fram nytt förslag|Ta fram nytt förslag(?: ändå)? och behåll formuläret)/u }); await expect(recovery).toBeVisible();
  const generatedIndex = monitor.generated.length; let confirmed = 0;
  for (let attempt = 0; attempt < 2 && monitor.generated.length === generatedIndex; attempt++) {
    report.stage = 'activity_recovery';
    await recovery.click();
    const confirmation = page.getByRole('alertdialog', { name: 'Räkna om hela grundschemat?', exact: true });
    if (attempt === 0 && draft.datedOverrides.length) { report.stage = 'activity_confirm'; await expect(confirmation).toBeVisible(); await confirmation.getByRole('button', { name: 'Räkna om schemat', exact: true }).click(); confirmed++; }
    report.stage = 'activity_generation';
    await until(async () => monitor.generated.length > generatedIndex || await recovery.evaluateAll(els => els.some(el => !el.disabled && /ändå/u.test(el.textContent))), 'actual_generation_failed', 150_000);
  }
  invariant(monitor.generated.length > generatedIndex && monitor.generated.at(-1).lessons?.length > 0, 'actual_generation_missing');
  report.stage = 'activity_form_preserved';
  await expect(form.getByLabel('Namn', { exact: true })).toHaveValue(name); await expect(form.getByLabel(className, { exact: true })).toBeChecked(); await expect(form.getByLabel(teacherName, { exact: true })).toBeChecked();
  report.checks.push({ check: 'c7_generation_and_preserved_form', status: 'PASS', generatedResponses: monitor.generated.length - generatedIndex,
    startingLocks: draft.locks.length, startingDates: draft.datedOverrides.length, confirmedDateReplacement: confirmed });
  const saveIndex = monitor.saves.length, activityIndex = monitor.activities.length;
  report.stage = 'activity_resubmit';
  await form.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await until(() => monitor.activities.length > activityIndex || monitor.failures.some(f => f.action === 'aktiviteter'), 'actual_activity_response_missing', 90_000);
  invariant(monitor.activities.length > activityIndex, 'actual_activity_rejected'); await expect(form).toHaveCount(0);
  const saved = await savedAfter(page, monitor, saveIndex, d => d.workingVillkor.aktiviteter?.some(a => a.name === name));
  invariant(monitor.activities.length > activityIndex, 'actual_activity_response_missing');
  const own = saved.base.lessons.find(l => l.egenAktivitet?.id === saved.workingVillkor.aktiviteter.find(a => a.name === name)?.id);
  invariant(own && saved.placements.some(p => p.lesson === own.id), 'actual_activity_pass_not_placed');
  invariant(saved.locks.length === 0 && saved.datedOverrides.length === 0 && confirmed === (draft.datedOverrides.length ? 1 : 0), 'generation_replacement_not_explicit');
  await expect(page.getByRole('button', { name: `Ta bort aktiviteten ${name}`, exact: true })).toBeVisible();
  for (const width of [1280, 1600]) { await page.setViewportSize({ width, height: 1000 }); await page.getByRole('heading', { name: /Aktiviteter utanför/u }).scrollIntoViewIfNeeded(); await picture(page, report, `actual-schema-activity-${width}.png`); }
  report.stage = 'activity_reopen'; const readIndex = monitor.reads.length; await page.reload({ waitUntil: 'domcontentloaded' }); await scopes(page, manifest);
  const reopened = await readAfter(page, monitor, readIndex); invariant(await preservationHash(reopened) === await preservationHash(saved), 'activity_reload_lost_schedule');
  report.activity = { status: 'PASS', startingCounts: counts(draft), counts: counts(reopened), generated: monitor.generated.length - generatedIndex, activityResponses: monitor.activities.length - activityIndex,
    confirmedDateReplacement: confirmed, contentHash: reopened.contentHash, statusCounts: monitor.statusCounts };
}
export async function verifySchemaDraftUi({ manifestFile, release, priorReport = null }) {
  const input = readOwnedUiInput(manifestFile, release), manifest = input.manifest;
  const resultFile = DIRECTORY + '/ui-results-' + new Date().toISOString().replaceAll(':', '-') + '.json';
  invariant(!existsSync(resultFile), 'result_already_exists');
  const report = { kind: 'schema-draft-actual-ui', status: 'FAIL', syntheticOnly: true, startedAt: new Date().toISOString(),
    releaseRevision: manifest.releaseRevision, releaseManifestSha256: input.manifestSha, releaseArtifactSha256: input.prepared.artifact.sha256,
    profiles: [], checks: [], images: [], activity: null, limits: ['Only owned synthetic namespace; genuine product UI and real authenticated HTTP',
      'Owned IdP transport with ordinary OIDC session registration; no API/auth fixtures or direct application-data SQL writes', 'Date preservation verified; no separate date-edit scenario', 'Not user acceptance or a real school integration'] };
  const save = () => writeFileSync(resultFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 }); save();
  let browser, kept;
  try {
    browser = await chromium.launch({ headless: true });
    if (priorReport) {
      assert.equal(path.dirname(realpathSync(priorReport)), DIRECTORY); assert.match(path.basename(priorReport), /^ui-results-[0-9TZ.:-]+\.json$/u);
      const prior = json(priorReport); assert.equal(prior.kind, report.kind); assert.equal(prior.releaseRevision, report.releaseRevision);
      assert.equal(prior.releaseManifestSha256, report.releaseManifestSha256); assert.deepEqual(prior.profiles.map(p => [p.width, p.status]), [[1280, 'PASS'], [1600, 'PASS']]);
      assert.ok(prior.checks.some(c => c.check === 'real_shared_window_name' && c.status === 'PASS'));
      report.priorUiProofSha256 = hash(readFileSync(priorReport)); report.profiles = prior.profiles.map(p => ({ ...p, reusedFromPriorProof: true }));
      report.stage = 'open_activity_only'; const session = await freshPage(browser, manifest, 1600), monitor = observe(session.page, manifest);
      kept = { ...session, monitor }; await session.page.goto(manifest.baseURL + '/?vy=schema', { waitUntil: 'domcontentloaded' }); await scopes(session.page, manifest);
      kept.draft = await readAfter(session.page, monitor, 0); report.seed = { counts: counts(kept.draft), contentHash: kept.draft.contentHash };
    } else for (const width of [1280, 1600]) { if (kept) { await kept.context.close(); kept = null; } kept = await preserve(browser, manifest, width, report); save(); console.log(JSON.stringify({ stage: 'preserved', width, status: 'PASS' })); }
    await activity(kept, manifest, report); report.status = 'PASS';
  } catch (error) {
    report.failure = { code: /^[a-z][a-z0-9_]+$/u.test(error.code ?? '') ? error.code : error.name === 'AssertionError' ? 'ui_assertion_failed' : error.name === 'TimeoutError' ? 'ui_timeout' : 'ui_flow_failed' };
    if (kept) { report.observedFailures = kept.monitor.failures; report.statusCounts = kept.monitor.statusCounts; await picture(kept.page, report, 'actual-schema-failure.png').catch(() => {}); }
    // Inga fria feltexter, DOM-utdrag, URL-token, request bodies, sessioner eller credentials i rapporten.
  } finally {
    await kept?.context.close().catch(() => {}); await browser?.close().catch(() => {}); report.completedAt = new Date().toISOString(); save();
  }
  console.log(JSON.stringify({ status: report.status, profiles: report.profiles.length, activity: report.activity?.status ?? 'not_completed', report: resultFile }));
  if (report.status !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 5 || args.length === 7); assert.deepEqual([args[0], args[2], args[4]], ['--manifest', '--release', '--run-owned-ui']);
  if (args.length === 7) assert.equal(args[5], '--prior-report');
  await verifySchemaDraftUi({ manifestFile: args[1], release: args[3], priorReport: args[6] ?? null });
}
