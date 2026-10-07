// Positiva svar kommer från en byggd skyddad Worker och en ägd syntetisk DB-fixtur.
// Alla fördröjningar/transportfel injiceras efter route.fetch mot den verkliga API-vägen.
import { expect, test, type APIResponse, type Page, type Request, type Route, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPlanningYearFixture, verifyPlanningYearBrowserTarget } from '../../work/pilot/phase5-planning-year-fixtures.mjs';
import { schoolYearLabel, selectionToQuery, type Selection } from '../lib/pupil-register-model.ts';
import type { GymTimplan } from '../lib/gym-timplan.ts';
import { waitForHydration } from './helpers/keycloak.ts';

type Fixture = Awaited<ReturnType<typeof createPlanningYearFixture>>;
type Session = Fixture['principal'];
type Metadata = Awaited<ReturnType<Fixture['setup']>>;
let fixture: Fixture, metadata: Metadata;
let setupComplete = false, setupPending = false, nodePending = 0, nodeUnknown = false;
let nodeUnknownStage: 'creation' | 'setup' | 'readback' | 'session' | null = null, browserUnknown = false, recoveryRequired = false;
const pendingRequests = new Set<Request>();
let completedActualRoutes = new WeakSet<Request>();
type BrowserCompletionStage = 'scope' | 'fetch' | 'body' | 'fulfill';
type BrowserRouteStage = 'seen' | 'fetch' | 'body' | 'complete';
type SafeBrowserRoute = { pathname: string; method: 'GET' | 'POST' | 'OTHER'; stage: BrowserRouteStage };
const actualRouteJobs = new Set<Promise<APIResponse>>(), browserRouteStates = new Map<Request, SafeBrowserRoute>();
let activeBrowserContext: ReturnType<Page['context']> | null = null, contextCloseAllowed = false, prematureContextClose = false;
function routeMetadata(request: Request): Pick<SafeBrowserRoute, 'pathname' | 'method'> {
  const pathname = new URL(request.url()).pathname, method = request.method();
  return { pathname: /^\/api\/[a-z]+(?:\/[a-z]+)*$/u.test(pathname) ? pathname : '/api/unknown',
    method: method === 'GET' || method === 'POST' ? method : 'OTHER' };
}
function recordBrowserRoute(request: Request, stage: BrowserRouteStage) {
  browserRouteStates.set(request, { ...routeMetadata(request), stage });
}
let browserCompletionFailure: { pathname: string; method: 'GET' | 'POST' | 'OTHER'; stage: BrowserCompletionStage } | null = null;
function recordBrowserCompletionFailure(request: Request, stage: BrowserCompletionStage) {
  browserUnknown = true;
  // Only static API route names leave the test. Never record queries, error text or payloads.
  browserCompletionFailure ??= { ...routeMetadata(request), stage };
}
/** Internal setup calls are awaited serially by the original fixture. A rejection
 * cannot prove that its last owned transaction finished; keep that uncertainty sticky. */
async function ownedNode<T>(stage: 'creation' | 'setup' | 'readback' | 'session', operation: () => Promise<T>): Promise<T> {
  if (recoveryRequired || nodeUnknown) throw Error('OWNED_RECOVERY_REQUIRED');
  nodePending++;
  try { return await operation(); }
  catch { nodeUnknown = true; nodeUnknownStage ??= stage; throw Error('OWNED_NODE_COMPLETION_UNKNOWN'); }
  finally { nodePending--; }
}
/** A real route.fetch response proves server completion even when the test later
 * withholds/aborts the browser response. Failed fetches never clear pending work. */
async function actualRouteFetch(route: Route): Promise<APIResponse> {
  const request = route.request();
  // Register before the microtask starts transport, independently of Playwright's route wait.
  const job = Promise.resolve().then(async () => {
    let stage: BrowserCompletionStage = 'scope';
    try {
      const url = new URL(request.url());
      if (url.origin !== new URL(baseURL).origin || !url.pathname.startsWith('/api/')) throw Error('OWNED_ROUTE_SCOPE');
      stage = 'fetch'; recordBrowserRoute(request, 'fetch');
      const actual = await route.fetch();
      stage = 'body'; recordBrowserRoute(request, 'body'); await actual.body();
      recordBrowserRoute(request, 'complete'); completedActualRoutes.add(request); pendingRequests.delete(request);
      return actual;
    } catch { recordBrowserCompletionFailure(request, stage); throw Error('OWNED_ROUTE_COMPLETION_UNKNOWN'); }
  });
  actualRouteJobs.add(job);
  try { return await job; } finally { actualRouteJobs.delete(job); }
}
async function installActualPassthrough(page: Page) {
  await page.context().route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== new URL(baseURL).origin || !url.pathname.startsWith('/api/')) { await route.fallback(); return; }
    const actual = await actualRouteFetch(route);
    try { await route.fulfill({ response: actual }); }
    catch {
      // A cancelled browser read is safe only after its complete real server response.
      if (!completedActualRoutes.has(request)) {
        recordBrowserCompletionFailure(request, 'fulfill'); throw Error('OWNED_ROUTE_COMPLETION_UNKNOWN');
      }
    }
  });
}
async function clearControlledRoutes(page: Page) {
  // Context passthrough stays installed while page-specific overrides are removed.
  await page.unrouteAll({ behavior: 'wait' });
}
const baseURL = process.env.PHASE5_BASE_URL ?? 'http://127.0.0.1:3061';
const SETUP = '/api/planering/urval', ROW = '/api/timplaner/gym/rad', GYM_READ = '/api/timplaner/gym/lasa';
const PROGRAM_READ = '/api/programplaner/lasa', SPECIALIZATION = '/api/programplaner/fordjupning';
const root = fileURLToPath(new URL('../../', import.meta.url));
const contextRuntime = ['web/app/planning-context.tsx', 'web/app/planning-context.css', 'web/app/context-switch.tsx',
  'web/app/protected-programplan-flow.tsx', 'web/app/protected-programplan-lifecycle.tsx',
  'web/app/school-year-picker.tsx', 'web/app/pupil-register-workspace.tsx'];
const contextTools = ['web/e2e/phase5-planning-year-context.spec.ts', 'web/playwright.phase5-planning-year.config.ts'];
const releasePending: (() => void)[] = [];
let unexpectedDialogs: string[] = [];
const bar = (page: Page) => page.getByRole('region', { name: 'Planeringsval', exact: true });
const year = (page: Page) => bar(page).getByLabel('Planeringsläsår', { exact: true });
const school = (page: Page) => bar(page).getByLabel('Planeringsskola', { exact: true });
const program = (page: Page) => page.getByTestId('protected-programplan-workspace');
const gym = (page: Page) => page.getByTestId('protected-gym-timplan-workspace');
const board = (page: Page) => program(page).getByRole('region', { name: 'Programplanen', exact: true });
const gymTable = (page: Page) => gym(page).getByRole('region', { name: 'Skolans undervisningstid', exact: true });
const responseFor = (pathname: string) => (response: { url: () => string }) => new URL(response.url()).pathname === pathname;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function held() {
  const ready = deferred<APIResponse>(), release = deferred<void>();
  releasePending.push(() => release.resolve());
  return { ready, release };
}
async function navigate(page: Page, name: 'Programplaner' | 'Timplaner' | 'Elever', blocked = false) {
  await waitForHydration(page);
  if (await page.evaluate(() => matchMedia('(max-width: 767px)').matches)) {
    const sidebar = page.locator('[data-mobile="true"]');
    if (!await sidebar.isVisible()) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name, exact: true }).click();
    if (blocked) { if (await sidebar.isVisible()) await page.keyboard.press('Escape'); }
    else await expect(sidebar).not.toBeVisible();
  } else {
    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    if (await sidebar.getAttribute('data-state') === 'collapsed') await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
    await page.getByRole('button', { name, exact: true }).click();
  }
}
function planningQuery(view: 'programplaner' | 'timplaner', unitId: string, target?: { offeringId?: string; planId: string }) {
  const q = new URLSearchParams({ vy: view, planeringslasar: String(metadata.planningYear), planeringsskola: unitId });
  if (target) {
    q.set(view === 'programplaner' ? 'programplan' : 'timplan', target.planId);
    if (target.offeringId) q.set('utbildning', target.offeringId);
  }
  return `/?${q}`;
}
async function enter(page: Page, session: Session, url: string) {
  await fixture.cookies(page.context(), session, baseURL);
  await page.goto(url);
  await waitForHydration(page);
  await expect(page.getByRole('button', { name: 'Logga ut', exact: true })).toBeVisible();
}
async function readyPlanning(page: Page, wantedYear = metadata.planningYear, unitId = fixture.unitId) {
  await expect(bar(page)).toHaveAttribute('aria-busy', 'false');
  await expect(year(page)).toHaveValue(String(wantedYear));
  await expect(school(page)).toHaveValue(unitId);
}
async function readGym(planId: string, session: Session): Promise<GymTimplan> {
  const reply = await ownedNode('readback', () => fixture.request(baseURL, session, GYM_READ, { planId }));
  expect(reply.status).toBe(200);
  expect(await fixture.pairedGym(reply.correlationId, session, 'gym_timplan_read', planId)).toBe(true);
  return reply.body as GymTimplan;
}
async function capture(page: Page, info: TestInfo, label: string) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth, controls: [...document.querySelectorAll('.planning-context button,.planning-context select')]
      .map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }).filter(r => r.width > 0 && r.height > 0) }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.controls.filter(r => r.height < 44)).toEqual([]);
  await info.attach(`${label}-geometry.json`, { body: JSON.stringify(geometry), contentType: 'application/json' });
  const screenshot = info.outputPath(`${label}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach(`${label}.png`, { path: screenshot, contentType: 'image/png' });
}
async function blockAttempts(page: Page, oldURL: string, oldYear: number, oldSchool: string) {
  await year(page).selectOption(String(oldYear + 1));
  await expect(year(page)).toHaveValue(String(oldYear));
  await school(page).selectOption('all');
  await expect(school(page)).toHaveValue(oldSchool);
  await navigate(page, 'Programplaner', true);
  await expect(page.getByTestId('planning-navigation-notice')).toBeVisible();
  expect(page.url()).toBe(oldURL);
  await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Logga ut', exact: true })).toBeVisible();
  expect(page.url()).toBe(oldURL);
}

test.beforeAll(async ({ browserName }, info) => {
  expect(info.config.maxFailures, 'Actual körning måste stoppa vid första FAIL.').toBe(1);
  expect(info.config.workers, 'Ägda DB-fixturer måste köras seriellt.').toBe(1);
  expect(info.project.retries, 'Misslyckade fall får inte köras om automatiskt.').toBe(0);
  const proof = await verifyPlanningYearBrowserTarget(baseURL);
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  expect(git(['status', '--porcelain', '--', ...contextRuntime, ...contextTools])).toBe('');
  expect(git(['diff', '--name-only', proof.buildRevision, 'HEAD', '--', ...contextRuntime])).toBe('');
  const sourceHashes = Object.fromEntries([...contextRuntime, ...contextTools].map(file => [file,
    createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex')]));
  await info.attach('source-build.json', { body: JSON.stringify({ ...proof, browserName, sourceHashes }), contentType: 'application/json' });
});
test.beforeEach(async ({ page }) => {
  // Never replace the owned recovery metadata with another fixture after unknown completion.
  if (recoveryRequired) throw Error('OWNED_RECOVERY_REQUIRED');
  fixture = undefined!; metadata = undefined!; releasePending.length = 0; unexpectedDialogs = [];
  setupComplete = false; setupPending = false; nodePending = 0; nodeUnknown = false; nodeUnknownStage = null; browserUnknown = false;
  pendingRequests.clear(); completedActualRoutes = new WeakSet<Request>(); browserCompletionFailure = null;
  actualRouteJobs.clear(); browserRouteStates.clear(); activeBrowserContext = null; contextCloseAllowed = false; prematureContextClose = false;
  const context = page.context();
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL) || page.isClosed() || context.pages().length !== 1
    || context.pages()[0] !== page || !context.browser()?.isConnected()) throw Error('OWNED_BROWSER_SCOPE');
  activeBrowserContext = context;
  context.once('close', () => { if (!contextCloseAllowed) { prematureContextClose = true; browserUnknown = true; } });
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !completedActualRoutes.has(request)) {
      pendingRequests.add(request); if (!browserRouteStates.has(request)) recordBrowserRoute(request, 'seen');
    }
  });
  // No response means no completion proof. In particular, requestfailed does not
  // clear a pending API request unless an actual route.fetch already completed it.
  page.on('response', response => { pendingRequests.delete(response.request()); });
  page.on('dialog', async dialog => { unexpectedDialogs.push(dialog.type()); await dialog.dismiss(); });
  await installActualPassthrough(page);
  fixture = await ownedNode('creation', () => createPlanningYearFixture());
  if (recoveryRequired) throw Error('OWNED_RECOVERY_REQUIRED');
  setupPending = true;
  try { metadata = await ownedNode('setup', () => fixture.setup(baseURL)); setupComplete = true; }
  finally { setupPending = false; }
});
test.afterEach(async ({ page }, info) => {
  releasePending.splice(0).forEach(release => release());
  let routesSettled = false, pageClosed = false, contextRoutesSettled = false, routeJobsSettled = false, contextClosed = false;
  const context = page.context();
  if (context !== activeBrowserContext || context.pages().some(candidate => candidate !== page)) browserUnknown = true;
  try { await page.unrouteAll({ behavior: 'wait' }); routesSettled = true; }
  catch { browserUnknown = true; }
  // Stop UI producers first. Its context.request remains alive for started route.fetch/body jobs.
  try { await page.close(); pageClosed = page.isClosed(); }
  catch { browserUnknown = true; }
  try { await context.unrouteAll({ behavior: 'wait' }); contextRoutesSettled = true; }
  catch { browserUnknown = true; }
  const routeJobsAtDrain = actualRouteJobs.size;
  await Promise.allSettled(actualRouteJobs); routeJobsSettled = actualRouteJobs.size === 0;
  if (prematureContextClose) browserUnknown = true;
  // Only after the route/body jobs settle may the shared request context be disposed.
  contextCloseAllowed = true;
  try { await context.close(); contextClosed = true; }
  catch { browserUnknown = true; }
  if (!fixture && !recoveryRequired && nodePending === 0 && !nodeUnknown && !browserUnknown && pendingRequests.size === 0 && routesSettled && pageClosed && contextRoutesSettled && routeJobsSettled && contextClosed) return;
  if (recoveryRequired || !setupComplete || setupPending || nodePending > 0 || nodeUnknown || browserUnknown || pendingRequests.size > 0 || !routesSettled || !pageClosed || !contextRoutesSettled || !routeJobsSettled || !contextClosed) {
    recoveryRequired = true;
    // Original hashes were captured before setup. No new DB snapshot is taken
    // while completion is unknown; audit and identity anchors remain untouched.
    await info.attach('cleanup-deferred.json', { body: JSON.stringify({ cleanupDeferred: true, databaseRecoveryRequired: true,
      setupComplete, setupPending, pendingNodeRequests: nodePending, unknownNodeRequest: nodeUnknown, nodeUnknownStage,
      unknownBrowserCompletion: browserUnknown, browserCompletionFailure, pendingRequests: pendingRequests.size,
      pendingRoutes: [...pendingRequests].map(request => browserRouteStates.get(request) ?? { ...routeMetadata(request), stage: 'seen' }),
      routesSettled, pageClosed, contextRoutesSettled, routeJobsSettled, routeJobsAtDrain, routeJobsRemaining: actualRouteJobs.size,
      prematureContextClose, contextClosed,
      ownedCustomerId: fixture?.customerId ?? null, ownedOrganizerId: fixture?.organizerId ?? null, foreignCustomerId: fixture?.foreignCustomerId ?? null,
      originalBusiness: fixture?.originalBusiness ?? null, fixtureExposed: !!fixture }), contentType: 'application/json' });
    throw Error('OWNED_COMPLETION_UNKNOWN: root must verify owned completion before cleanup or another fixture');
  }
  try {
    const cleanup = await fixture.cleanup();
    await info.attach('cleanup.json', { body: JSON.stringify(cleanup), contentType: 'application/json' });
    expect(cleanup.originalBusinessPreserved).toBe(true);
    expect(cleanup.originalAuditPreserved).toBe(true);
    expect(cleanup.identityAnchorsPreserved).toBe(true);
    expect(cleanup.retainedAuditPreserved).toBe(true);
    expect(cleanup.retainedIdentityAnchorsPreserved).toBe(true);
    expect(Object.keys(cleanup.originalBusiness)).toHaveLength(15);
    expect(cleanup.finalBusiness).toEqual(cleanup.originalBusiness);
  } catch (error) {
    const evidence = error as { cleanupEvidence?: unknown };
    await info.attach('cleanup-failure.json', { body: JSON.stringify({ cleanupFailed: true, evidence: evidence.cleanupEvidence ?? null }), contentType: 'application/json' });
    throw error;
  }
  await info.attach('dialog-types.json', { body: JSON.stringify(unexpectedDialogs), contentType: 'application/json' });
  expect(unexpectedDialogs, 'Blockerad navigation ska neka före den generella bortkastningsfrågan.').toEqual([]);
});

test('C01: registeråret och två filter återkommer medan planeringsår/skola följer program och timplan', async ({ page }, info) => {
  const setupResponse = page.waitForResponse(responseFor('/api/elever/urval'));
  await enter(page, fixture.principal, '/?vy=elever');
  const registerSetupResponse = await setupResponse; expect(registerSetupResponse.status()).toBe(200);
  const setup = await registerSetupResponse.json();
  await expect(page.locator('#lasar')).toHaveValue(String(setup.currentSchoolYear));
  const registerYear = setup.currentSchoolYear - 1;
  expect(setup.schoolYears).toContain(registerYear);
  await page.locator('#lasar').selectOption(String(registerYear));
  const selected: Selection = { schoolYear: registerYear, unitId: fixture.unitId, classId: null,
    educationId: metadata.shared.offeringId, grade: null, status: 'framtida', page: 1 };
  const actualList = page.waitForResponse(response => responseFor('/api/elever/lista')(response) &&
    JSON.stringify(response.request().postDataJSON()?.selection) === JSON.stringify(selected));
  await page.goto(`/${selectionToQuery(selected)}`);
  const listResponse = await actualList; expect(listResponse.status()).toBe(200);
  expect(listResponse.request().postDataJSON().selection).toEqual(selected);
  await expect(page.getByRole('heading', { name: `Elever läsåret ${schoolYearLabel(registerYear)}`, exact: true })).toBeVisible();
  await navigate(page, 'Programplaner');
  await year(page).selectOption(String(metadata.planningYear));
  await school(page).selectOption('all');
  await readyPlanning(page, metadata.planningYear, 'all');
  await navigate(page, 'Timplaner'); await readyPlanning(page, metadata.planningYear, 'all');
  await navigate(page, 'Elever');
  await expect(page.locator('#lasar')).toHaveValue(String(registerYear));
  const returned = new URL(page.url()).searchParams;
  expect(returned.get('utbildning')).toBe(selected.educationId); expect(returned.get('status')).toBe('framtida');
  expect(returned.has('planeringslasar')).toBe(false); expect(returned.has('planeringsskola')).toBe(false);
  await navigate(page, 'Programplaner'); await readyPlanning(page, metadata.planningYear, 'all');
  await page.reload(); await readyPlanning(page, metadata.planningYear, 'all');
  await capture(page, info, 'independent-register-planning-years');
});

test('C02: huvudman utan elevscope använder skolår, Back/reload och normaliserad främmande URL', async ({ page }, info) => {
  const pupilRequests: string[] = [];
  page.on('request', request => { const pathname = new URL(request.url()).pathname; if (pathname.startsWith('/api/elever/')) pupilRequests.push(pathname); });
  await enter(page, fixture.hm, planningQuery('programplaner', fixture.secondUnitId));
  await readyPlanning(page, metadata.planningYear, fixture.secondUnitId);
  await expect(page.getByRole('button', { name: 'Elever', exact: true })).toHaveCount(0);
  await year(page).selectOption(String(metadata.planningYear + 1)); await readyPlanning(page, metadata.planningYear + 1, fixture.secondUnitId);
  await school(page).selectOption(fixture.unitId); await readyPlanning(page, metadata.planningYear + 1, fixture.unitId);
  await page.goBack(); await readyPlanning(page, metadata.planningYear + 1, fixture.secondUnitId);
  await page.goBack(); await readyPlanning(page, metadata.planningYear, fixture.secondUnitId);
  await page.reload(); await readyPlanning(page, metadata.planningYear, fixture.secondUnitId);
  await navigate(page, 'Timplaner'); await readyPlanning(page, metadata.planningYear, fixture.secondUnitId);
  expect(pupilRequests).toEqual([]);
  await capture(page, info, 'hm-planning-without-register');
  const read = page.waitForResponse(responseFor(SETUP));
  await page.goto(`/?vy=programplaner&planeringslasar=2027&planeringslasar=2028&planeringsskola=${metadata.foreignUnitId}`);
  const actual = await read; expect(actual.status()).toBe(200); const scope = await actual.json();
  await expect(year(page)).toHaveValue(String(scope.currentYear));
  const units = scope.units.filter((u: { canRead: { programplan: boolean } }) => u.canRead.programplan).map((u: { unitId: string }) => u.unitId);
  expect(units).toContain(await school(page).inputValue()); expect(units).not.toContain(metadata.foreignUnitId);
  expect(new URL(page.url()).searchParams.getAll('planeringslasar')).toHaveLength(1);
  expect(await fixture.pairedPlanning(actual.headers()['x-correlation-id'], fixture.hm, 'planning_year_selection_read')).toBe(true);
});

test('C03: faktiskt gammalt setup-svar kan inte återföra skolor efter uppdragsbyte', async ({ page }, info) => {
  const hold = held(); let first = true, discarded = false;
  await page.route(`**${SETUP}`, async route => {
    if (!first) { await route.fallback(); return; } first = false;
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); hold.ready.resolve(actual);
    await hold.release.promise;
    try { await route.fulfill({ response: actual }); }
    catch { discarded = true; }
  });
  await fixture.cookies(page.context(), fixture.hm, baseURL);
  const opening = page.goto(planningQuery('programplaner', fixture.secondUnitId));
  const oldResponse = await hold.ready.promise; await opening; await waitForHydration(page);
  expect(await fixture.pairedPlanning(oldResponse.headers()['x-correlation-id'], fixture.hm, 'planning_year_selection_read')).toBe(true);
  const changed = page.waitForResponse(responseFor('/api/context'));
  const newSetup = page.waitForResponse(responseFor(SETUP));
  await page.locator('#uppdrag').selectOption(fixture.partialHm.assignmentId);
  const changedResponse = await changed; expect(changedResponse.status()).toBe(200); const context = await changedResponse.json();
  // Ett uppdragsbyte rensar området och återgår till uppdragets startsida.
  await expect(page.locator('#uppdrag')).toHaveValue(fixture.partialHm.assignmentId);
  await expect(page.locator('#uppdrag')).toBeEnabled();
  await navigate(page, 'Programplaner');
  const latest = await newSetup; expect(latest.status()).toBe(200); const actualScope = await latest.json();
  expect(actualScope.units.map((u: { unitId: string }) => u.unitId)).toEqual([fixture.unitId]);
  await expect(school(page)).toHaveValue(fixture.unitId);
  hold.release.resolve(); await clearControlledRoutes(page);
  await expect(school(page).locator('option')).toHaveCount(2);
  await expect(school(page).locator(`option[value="${fixture.secondUnitId}"]`)).toHaveCount(0);
  const activeSession = { ...fixture.hm, assignmentId: fixture.partialHm.assignmentId, epoch: context.epoch };
  expect(await fixture.pairedPlanning(latest.headers()['x-correlation-id'], activeSession, 'planning_year_selection_read')).toBe(true);
  await info.attach('late-setup.json', { body: JSON.stringify({ actualOldRead: true, actualNewRead: true, discarded, scopeCount: actualScope.units.length }), contentType: 'application/json' });
  await capture(page, info, 'new-assignment-excludes-old-schools');
});

test('C04: verklig pågående timskrivning spärrar år/skola/vy/Back/uppdrag/utloggning tills kvittens', async ({ page }, info) => {
  const session = fixture.principalB, planId = metadata.shared.secondTimplanId;
  await enter(page, session, planningQuery('timplaner', fixture.secondUnitId, { planId }));
  await readyPlanning(page, metadata.planningYear, fixture.secondUnitId); await expect(gymTable(page)).toBeVisible();
  await gym(page).getByRole('button', { name: 'Öppna programplan', exact: true }).click();
  await expect(board(page)).toContainText('Allt sparat');
  await program(page).getByRole('button', { name: 'Timplan', exact: true }).click(); await expect(gymTable(page)).toBeVisible();
  const relative = gym(page).getByLabel('Visa årskurs');
  await relative.selectOption('1');
  await expect.poll(() => new URL(page.url()).searchParams.get('planeringsrelativar')).toBe('2');
  await page.reload(); await expect(gymTable(page)).toBeVisible(); await expect(relative).toHaveValue('1');
  await relative.selectOption('all');
  await expect.poll(() => new URL(page.url()).searchParams.get('planeringsallaar')).toBe('1');
  const before = await readGym(planId, session), sourceBefore = await fixture.snapshot(metadata.shared.planId);
  const otherBefore = await fixture.timplanSnapshot(metadata.shared.firstTimplanId);
  const input = gymTable(page).locator('input[data-term="0"]').first(), rowKey = await input.getAttribute('data-row');
  if (!rowKey) throw Error('Ägd aktiv timrad saknas.');
  const expected = [...before.hours[rowKey]]; expected[0] = (expected[0] ?? 0) + 7;
  const hold = held(); let writes = 0;
  await page.route(`**${ROW}`, async route => { writes++; const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(await fixture.pairedGym(actual.headers()['x-correlation-id'], session, 'gym_timplan_row_changed', planId)).toBe(true);
    hold.ready.resolve(actual); await hold.release.promise; await route.fulfill({ response: actual }); });
  const oldURL = page.url(); await input.fill(String(expected[0]));
  // Samma klick lämnar raden och försöker byta år: blur måste registrera spärr före navigation.
  await bar(page).getByRole('button', { name: 'Nästa planeringsläsår', exact: true }).click();
  await hold.ready.promise; await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await blockAttempts(page, oldURL, metadata.planningYear, fixture.secondUnitId);
  await page.locator('#uppdrag').selectOption(fixture.second.assignmentId);
  await expect(page.locator('#uppdrag')).toHaveValue(session.assignmentId);
  await page.goBack(); await expect(page).toHaveURL(oldURL); await expect(gymTable(page)).toBeVisible();
  await expect(input).toHaveValue(String(expected[0]));
  await expect(gym(page).locator('.gt-save-state')).toHaveText('Sparar…'); expect(writes).toBe(1);
  hold.release.resolve(); await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat');
  expect(writes).toBe(1); expect((await readGym(planId, session)).hours[rowKey]).toEqual(expected);
  expect(await fixture.snapshot(metadata.shared.planId)).toEqual(sourceBefore);
  expect(await fixture.timplanSnapshot(metadata.shared.firstTimplanId)).toEqual(otherBefore);
  await info.attach('actual-held-write.json', { body: JSON.stringify({ writes, confirmedReadback: true, sourceUnchanged: true, otherSchoolUnchanged: true }), contentType: 'application/json' });
  await year(page).selectOption(String(metadata.planningYear + 1)); await readyPlanning(page, metadata.planningYear + 1, fixture.secondUnitId);
  await capture(page, info, 'write-confirmed-navigation-restored');
});

test('C05: accepterad timrad med transportfel och misslyckad återläsning kräver faktisk sparstatus', async ({ page }, info) => {
  const session = fixture.principal, planId = metadata.shared.firstTimplanId;
  await enter(page, session, planningQuery('timplaner', fixture.unitId, { planId })); await expect(gymTable(page)).toBeVisible();
  const before = await readGym(planId, session), input = gymTable(page).locator('input[data-term="0"]').first();
  const rowKey = await input.getAttribute('data-row'); if (!rowKey) throw Error('Ägd aktiv timrad saknas.');
  const expected = [...before.hours[rowKey]]; expected[0] = (expected[0] ?? 0) + 9; let writes = 0, auditedReads = 0;
  await page.route(`**${ROW}`, async route => { writes++; const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(await fixture.pairedGym(actual.headers()['x-correlation-id'], session, 'gym_timplan_row_changed', planId)).toBe(true); await route.abort('failed'); });
  await page.route(`**${GYM_READ}`, async route => { const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); auditedReads++;
    expect(await fixture.pairedGym(actual.headers()['x-correlation-id'], session, 'gym_timplan_read', planId)).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) }); });
  const oldURL = page.url(); await input.fill(String(expected[0])); await input.press('Enter');
  await expect(gymTable(page).getByText('Sparstatus kunde inte läsas. Dina värden finns kvar. Läs aktuell timplan innan du sparar igen.')).toBeVisible();
  await expect(gymTable(page).getByRole('button', { name: 'Använd sparade värden', exact: true })).toBeDisabled();
  await blockAttempts(page, oldURL, metadata.planningYear, fixture.unitId);
  expect((await readGym(planId, session)).hours[rowKey]).toEqual(expected);
  await clearControlledRoutes(page);
  await gymTable(page).getByRole('button', { name: 'Läs aktuell timplan', exact: true }).click();
  await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat'); expect(writes).toBe(1); expect(auditedReads).toBeGreaterThan(0);
  await year(page).selectOption(String(metadata.planningYear + 1)); await readyPlanning(page, metadata.planningYear + 1, fixture.unitId);
  await info.attach('unknown-write-recovery.json', { body: JSON.stringify({ writes, auditedReads, confirmedAfterTransportFailure: true }), contentType: 'application/json' });
  await capture(page, info, 'unknown-write-recovered');
});

test('C06: okänd fördjupningsskrivning och parent-läsfel behåller spärr efter child-unmount', async ({ page }, info) => {
  const session = fixture.principal, planId = fixture.planId;
  await enter(page, session, planningQuery('programplaner', fixture.unitId, { planId, offeringId: fixture.offeringId }));
  await expect(board(page)).toContainText('Allt sparat'); let writes = 0, readFailures = 0;
  await page.route(`**${SPECIALIZATION}`, async route => { writes++; const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(await fixture.paired(actual.headers()['x-correlation-id'], session, 'programplan_specialization_changed', planId)).toBe(true); await route.abort('failed'); });
  await page.route(`**${PROGRAM_READ}`, async route => { const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); readFailures++;
    expect(await fixture.paired(actual.headers()['x-correlation-id'], session, 'programplan_read', planId)).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) }); });
  await board(page).getByRole('searchbox', { name: 'Lägg till ämne eller nivå', exact: true }).fill('ANIM1000X');
  await board(page).locator('button[data-level-code="ANIM1000X"]').click();
  await expect(board(page)).toContainText('Sparstatus kunde inte läsas. Läs om planen innan du försöker igen.');
  const oldURL = page.url(); await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await page.route('**/api/programplaner/underlag', async route => { const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); readFailures++;
    expect(await fixture.paired(actual.headers()['x-correlation-id'], session, 'programplan_workspace_read', fixture.offeringId, 'education')).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) }); });
  await board(page).getByRole('button', { name: 'Läs om planen', exact: true }).click();
  await expect(board(page)).toHaveCount(0); await expect(program(page).getByRole('button', { name: 'Läs aktuell sparstatus', exact: true })).toBeEnabled();
  await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await navigate(page, 'Timplaner', true); expect(page.url()).toBe(oldURL);
  await clearControlledRoutes(page);
  await program(page).getByRole('button', { name: 'Läs aktuell sparstatus', exact: true }).click();
  await expect(board(page)).toContainText('Allt sparat'); await expect(board(page)).toContainText('ANIM1000X');
  expect(writes).toBe(1); expect(readFailures).toBeGreaterThanOrEqual(2);
  const current = await fixture.snapshot(planId); expect(current.specialization).toContain('ANIM1000X');
  await year(page).selectOption(String(metadata.planningYear + 1)); await readyPlanning(page, metadata.planningYear + 1, fixture.unitId);
  await info.attach('parent-recovery.json', { body: JSON.stringify({ writes, readFailures, actualReloadConfirmed: true, childUnmountDidNotConfirmWrite: true }), contentType: 'application/json' });
  await capture(page, info, 'parent-recovery-confirmed');
});


test('C07: aktivt skapande och okänt kvitto spärrar navigation fram till faktisk parent-återläsning', async ({ page }, info) => {
  await enter(page, fixture.hm, planningQuery('programplaner', fixture.unitId)); await readyPlanning(page);
  await program(page).getByRole('button', { name: 'Ny programplan', exact: true }).click();
  const flow = program(page).getByRole('region', { name: 'Program, inriktning och fördjupning', exact: true });
  await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('Skola', { exact: true }).selectOption(fixture.unitId);
  await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByRole('button', { name: 'Ny utbildning', exact: true }).click();
  const catalog = flow.getByLabel('Välj underlag', { exact: true });
  const details = flow.locator('.pp-flow-source');
  if (!await catalog.isVisible()) await details.locator('summary').click();
  await catalog.selectOption(fixture.catalogId); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('1. Program', { exact: true }).selectOption('SA25:4');
  await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('2. Inriktning', { exact: true }).selectOption('SABEP');
  const form = flow.getByRole('region', { name: 'Ny utbildning och programfördjupning', exact: true });
  const name = 'Syntetisk kontextskapning';
  await form.getByLabel('Utbildningens namn', { exact: true }).fill(name);
  await form.getByLabel('Elevkull', { exact: true }).fill('Syntetisk framtida kull');
  await form.getByLabel('Utbildningens exakta startdatum', { exact: true }).fill(metadata.shared.basisStartedOn);
  await form.getByRole('searchbox', { name: 'Lägg till ämne eller nivå', exact: true }).fill('ANIM1000X');
  await form.locator('button[data-level-code="ANIM1000X"]').click();
  await form.getByRole('button', { name: 'Granska utkast', exact: true }).click();
  const hold = held(); let writes = 0, statusReads = 0, planId = '', offeringId = '', commandId = '';
  await page.route('**/api/programplaner/utbildning/status', async route => {
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); statusReads++;
    expect(await fixture.paired(actual.headers()['x-correlation-id'], fixture.hm, 'programplan_education_status_read', commandId, 'education_command')).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) });
  });
  await page.route('**/api/programplaner/utbildning/skapa', async route => {
    writes++; commandId = route.request().postDataJSON().commandId;
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); const body = await actual.json();
    planId = body.plan.id; offeringId = body.education.id;
    expect(await fixture.paired(actual.headers()['x-correlation-id'], fixture.hm, 'programplan_education_created', offeringId, 'education')).toBe(true);
    hold.ready.resolve(actual); await hold.release.promise; await route.abort('failed');
  });
  const oldURL = page.url(); await form.getByRole('button', { name: 'Spara utbildning och utkast', exact: true }).click();
  await hold.ready.promise;
  await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await navigate(page, 'Timplaner', true); expect(page.url()).toBe(oldURL);
  hold.release.resolve(); await expect(flow).toContainText('Sparandet kan inte avgöras ännu.');
  await expect(form.getByRole('button', { name: 'Avbryt', exact: true })).toBeDisabled();
  await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await page.unroute('**/api/programplaner/utbildning/status');
  await page.route('**/api/programplaner/underlag', async route => {
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(await fixture.paired(actual.headers()['x-correlation-id'], fixture.hm, 'programplan_workspace_read', offeringId, 'education')).toBe(true);
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) });
  });
  await form.getByRole('button', { name: 'Läs sparstatus', exact: true }).click();
  await expect(program(page).getByRole('button', { name: 'Läs aktuell sparstatus', exact: true })).toBeEnabled();
  await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await navigate(page, 'Timplaner', true); expect(page.url()).toBe(oldURL);
  await clearControlledRoutes(page);
  await program(page).getByRole('button', { name: 'Läs aktuell sparstatus', exact: true }).click();
  await expect(board(page)).toContainText('Allt sparat'); await expect(program(page).getByRole('heading', { name, exact: true })).toBeVisible();
  expect(writes).toBe(1); expect(statusReads).toBe(1); expect(await fixture.plans(offeringId)).toHaveLength(1);
  expect((await fixture.snapshot(planId)).offering_id).toBe(offeringId);
  await year(page).selectOption(String(metadata.planningYear + 1)); await readyPlanning(page, metadata.planningYear + 1);
  await info.attach('create-recovery.json', { body: JSON.stringify({ writes, statusReads, exactlyOnePlan: true, actualParentReadConfirmed: true }), contentType: 'application/json' });
  await capture(page, info, 'created-plan-recovery');
});

test('C08: faktisk sessionsutgång rensar även en blockerad skrivning och gammalt planeringsurval', async ({ page }, info) => {
  const session = fixture.principal, planId = metadata.shared.firstTimplanId;
  await enter(page, session, planningQuery('timplaner', fixture.unitId, { planId })); await expect(gymTable(page)).toBeVisible();
  const hold = held(); let writes = 0;
  await page.route(`**${ROW}`, async route => {
    writes++; const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(await fixture.pairedGym(actual.headers()['x-correlation-id'], session, 'gym_timplan_row_changed', planId)).toBe(true);
    hold.ready.resolve(actual); await hold.release.promise; await route.abort('failed');
  });
  const input = gymTable(page).locator('input[data-term="0"]').first();
  await input.fill('37'); await input.press('Enter'); await hold.ready.promise;
  await year(page).selectOption(String(metadata.planningYear + 1)); await expect(year(page)).toHaveValue(String(metadata.planningYear));
  await ownedNode('session', () => fixture.expire(session));
  const denied = page.waitForResponse(responseFor(GYM_READ)); hold.release.resolve();
  const expired = await denied; expect(expired.status()).toBe(401); expect((await expired.json()).code).toBe('session_expired');
  await expect(gym(page)).toHaveCount(0); await expect(bar(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Logga ut', exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has('planeringslasar')).toBe(false);
  const renewed = await ownedNode('session', () => fixture.newPrincipal()); await fixture.cookies(page.context(), renewed, baseURL);
  const setup = page.waitForResponse(responseFor(SETUP)); await page.goto('/?vy=programplaner');
  const current = await setup; expect(current.status()).toBe(200); const available = await current.json();
  expect(await fixture.pairedPlanning(current.headers()['x-correlation-id'], renewed, 'planning_year_selection_read')).toBe(true);
  await readyPlanning(page, available.currentYear, fixture.unitId);
  await expect(gym(page)).toHaveCount(0); expect(writes).toBe(1);
  await info.attach('expired-session.json', { body: JSON.stringify({ writes, actualExpiredRead: true, oldSelectionCleared: true, renewedScopeRead: true }), contentType: 'application/json' });
  await capture(page, info, 'fresh-session-current-year');
});
