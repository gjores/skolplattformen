// SOURCE-ONLY preparation. Actual execution requires applied performance/SEARCH and 05-39.
// Actual command requires --max-failures=1: unknown completion stops every next worker/fixture until root recovery.
// 05-39 has no sealed release-proof schema yet. Root's actual release harness must validate the
// exact committed 39 source hashes and C01–C08 in both projects (8 named/16 project cases),
// zero skips/retries and
// actual audit/full-row cleanup evidence before releasing 40; intended case lists are no PASS proof.
// All positive data and controlled late responses come from route.fetch/owned actual APIs.
import { expect, test, type APIResponse, type Locator, type Page, type Request, type Response, type Route, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPlanningListFixture } from '../../work/pilot/phase5-planning-year-list-fixtures.mjs';
import { SEARCH_SOURCE_PATHS, SEARCH_API_CASES, validateHistoricalSources, historicalGitSource,
  validateSearchRollback, validateSearchApplied, validateSearchDependencies, searchCasesComplete, searchCleanupPreserved, searchTimingsComplete,
  verifySearchWorker } from '../../work/pilot/verify-planning-year-search-details.mjs';
import { planningSelection } from '../../work/pilot/verify-planning-year-api.mjs';
import { parsePlanningList, parsePlanningOverview, parsePlanningSetup, parsePlanningSelection, planningAnnualMetrics,
  type PlanningList, type PlanningOverview, type PlanningSelection, type PlanningSetup } from '../lib/planning-year-contract.ts';
import { parseProgramplan, parseProgramplanCloneReply } from '../lib/programplan-contract.ts';
import { parseProgramplanWorkspace } from '../lib/programplan-workspace-contract.ts';
import { parseProgramplanSelection, parseProgramplanEducationCreate, parseProgramplanEducationCreated, parseProgramplanEducationStatus } from '../lib/programplan-education-contract.ts';
import { parseGymTimplan } from '../lib/gym-timplan.ts';
import { waitForHydration } from './helpers/keycloak.ts';

type Fixture = Awaited<ReturnType<typeof createPlanningListFixture>>;
type Session = Fixture['hm'];
type Metadata = Awaited<ReturnType<Fixture['setup']>>;
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseURL = process.env.PHASE5_BASE_URL ?? 'http://127.0.0.1:3061';
const LIST = '/api/planering/lista', OVERVIEW = '/api/planering/oversikt', SETUP = '/api/planering/urval';
const listRuntime = ['web/app/protected-plan-list.tsx', 'web/app/protected-plan-list.css', 'web/app/protected-planning-overview.tsx',
  'web/app/protected-programplan-list.tsx', 'web/app/protected-programplan-workspace.tsx', 'web/app/protected-programplan-flow.tsx',
  'web/app/protected-programplan-board.tsx', 'web/app/protected-programplan.css', 'web/app/protected-gym-timplan-hours.tsx', 'web/app/protected-gym-timplan.css', 'web/app/protected-gym-timplan-workspace.tsx',
  'web/app/protected-home.tsx', 'web/app/planning-context.tsx', 'web/app/planning-context.css', 'web/lib/protected-plan-location.ts'];
const listTools = ['work/pilot/phase5-planning-year-list-fixtures.mjs', 'web/e2e/phase5-planning-year-lists.spec.ts', 'web/playwright.phase5-planning-year.config.ts'];
let fixture: Fixture, metadata: Metadata, setup: PlanningSetup, session: Session, setupComplete = false, nodeUnknown = false;
const releases: (() => void)[] = [], pending = new Set<Request>();
let auditChecks: Promise<void>[] = [], dialogs: string[] = [];
type NodeStage = 'creation' | 'setup' | 'request' | 'fixture-mutation' | 'readback';
let setupPending = false, nodePending = 0, nodeUnknownStage: NodeStage | null = null;
let browserUnknown = false, recoveryRequired = false, completedActualRoutes = new WeakSet<Request>();
async function ownedNode<T>(stage: NodeStage, operation: () => Promise<T>): Promise<T> {
  if (recoveryRequired || nodeUnknown) throw Error('OWNED_RECOVERY_REQUIRED');
  nodePending++;
  try { return await operation(); }
  catch { nodeUnknown = true; nodeUnknownStage ??= stage; throw Error('OWNED_NODE_COMPLETION_UNKNOWN'); }
  finally { nodePending--; }
}

type BrowserActor = Session;
type BrowserCompletionStage = 'scope' | 'fetch' | 'body' | 'audit' | 'fulfill';
type BrowserRouteStage = 'seen' | 'fetch' | 'body' | 'audit' | 'complete';
type SafeBrowserRoute = { pathname: string; method: 'GET' | 'POST' | 'OTHER'; stage: BrowserRouteStage };
const actualRouteJobs = new Set<Promise<APIResponse>>(), browserRouteStates = new Map<Request, SafeBrowserRoute>();
let activeBrowserContext: ReturnType<Page['context']> | null = null, contextCloseAllowed = false, prematureContextClose = false;
let requestActors = new WeakMap<Request, BrowserActor>(), auditReplies = new WeakMap<object, Promise<void>>(), auditRequests = new WeakMap<Request, Promise<void>>();
let browserCompletionFailure: { pathname: string; method: 'GET' | 'POST' | 'OTHER'; stage: BrowserCompletionStage } | null = null;
function routeMetadata(request: Request): Pick<SafeBrowserRoute, 'pathname' | 'method'> {
  const pathname = new URL(request.url()).pathname, method = request.method();
  return { pathname: /^\/api\/[a-z]+(?:\/[a-z]+)*$/u.test(pathname) ? pathname : '/api/unknown',
    method: method === 'GET' || method === 'POST' ? method : 'OTHER' };
}
function recordBrowserRoute(request: Request, stage: BrowserRouteStage) {
  browserRouteStates.set(request, { ...routeMetadata(request), stage });
}
function recordBrowserCompletionFailure(request: Request, stage: BrowserCompletionStage) {
  browserUnknown = true;
  browserCompletionFailure ??= { ...routeMetadata(request), stage };
}
function requestActor(request: Request): BrowserActor {
  const captured = requestActors.get(request);
  if (!captured) throw Error('OWNED_ACTOR_SCOPE');
  return captured;
}
function cachedAudit(reply: Response | APIResponse, verify: () => Promise<void>): Promise<void> {
  const request = 'request' in reply ? (reply as Response).request() : null;
  const existing = auditReplies.get(reply) ?? (request ? auditRequests.get(request) : undefined);
  if (existing) return existing;
  const proof = Promise.resolve().then(verify);
  auditReplies.set(reply, proof); if (request) auditRequests.set(request, proof);
  return proof;
}
async function actualRouteFetch(route: Route, validate?: (actual: APIResponse) => Promise<void>): Promise<APIResponse> {
  const request = route.request();
  // Capture before transport; a later assignment switch cannot change this audit's actor.
  const captured = requestActors.get(request);
  const job = Promise.resolve().then(async () => {
    let stage: BrowserCompletionStage = 'scope';
    try {
      const url = new URL(request.url());
      if (url.origin !== new URL(baseURL).origin || !url.pathname.startsWith('/api/') || !captured) throw Error('OWNED_ROUTE_SCOPE');
      stage = 'fetch'; recordBrowserRoute(request, 'fetch');
      const actual = await route.fetch();
      stage = 'body'; recordBrowserRoute(request, 'body'); await actual.body();
      if (validate) await validate(actual);
      if ([SETUP, LIST, OVERVIEW].includes(url.pathname)) {
        stage = 'audit'; recordBrowserRoute(request, 'audit');
        const proof = actualAudit(actual, url.pathname, captured);
        auditRequests.set(request, proof); await proof;
      }
      recordBrowserRoute(request, 'complete'); completedActualRoutes.add(request); pending.delete(request);
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
      if (!completedActualRoutes.has(request)) {
        recordBrowserCompletionFailure(request, 'fulfill'); throw Error('OWNED_ROUTE_COMPLETION_UNKNOWN');
      }
    }
  });
}
async function clearControlledRoutes(page: Page) {
  await page.unrouteAll({ behavior: 'wait' });
}

const region = (page: Page, view: PlanningSelection['view'] = 'programplan') => page.getByRole('region', { name: view === 'programplan' ? 'Alla programplaner' : 'Alla timplaner', exact: true });
const bar = (page: Page) => page.getByRole('region', { name: 'Planeringsval', exact: true });
const search = (page: Page) => page.getByLabel('Sök utbildning', { exact: true });
const pathname = (r: { url(): string }) => new URL(r.url()).pathname;
const q = (patch: Partial<PlanningSelection> = {}): PlanningSelection => parsePlanningSelection(planningSelection(metadata.planningYear,
  { view: 'programplan', unitId: fixture.unitId, query: metadata.pageQuery, status: 'utkast', ...patch }));
async function ownedRequest(...args: Parameters<Fixture['request']>) {
  return ownedNode('request', () => fixture.request(...args));
}
const json = (p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function hold() { const ready = deferred<APIResponse>(), release = deferred<void>(); releases.push(() => release.resolve()); return { ready, release }; }
function url(selection: PlanningSelection, overview = false) {
  const params = new URLSearchParams({ vy: selection.view === 'programplan' ? 'programplaner' : 'timplaner',
    planeringslasar: String(selection.schoolYear), planeringsskola: selection.unitId ?? 'all', planeringsform: selection.schoolform,
    planeringssok: selection.query, planeringsstatus: selection.status, planeringskull: selection.cohortRelation, planeringsarkiv: selection.archive,
    planeringssort: selection.sort, planeringsriktning: selection.direction, planeringssida: String(selection.page) });
  if (selection.grade !== null) params.set('planeringsarskurs', String(selection.grade));
  if (selection.selectionRevision !== null) params.set('planeringsrevision', selection.selectionRevision);
  if (overview) params.set('planeringsoversikt', '1');
  return `/?${params}`;
}
function actualAudit(reply: Response | APIResponse, route: string, captured: BrowserActor = 'request' in reply ? requestActor((reply as Response).request()) : { ...session }): Promise<void> {
  return cachedAudit(reply, async () => {
    const corr = reply.headers()['x-correlation-id']; expect(corr).toBeTruthy();
    expect(reply.headers()['cache-control']).toBe('no-store');
    if (reply.status() === 200) expect(await ownedNode('readback', () => fixture.pairedPlanning(corr, captured,
      route === SETUP ? 'planning_year_selection_read' : route === LIST ? 'planning_year_list_read' : 'planning_year_overview_read'))).toBe(true);
    else expect((await ownedNode('readback', () => fixture.events(corr))).filter((event: { outcome: string }) => event.outcome === 'ok')).toEqual([]);
  });
}

async function parsed(reply: Response, selection?: PlanningSelection): Promise<PlanningList> {
  expect(reply.status()).toBe(200); await actualAudit(reply, LIST);
  const request = selection ?? reply.request().postDataJSON() as PlanningSelection;
  const result = parsePlanningList(await reply.json(), request, setup);
  expect(await fixture.metadataMatches(result.rows)).toBe(true); return result;
}
async function ownedOverview(selection: PlanningSelection): Promise<PlanningOverview> {
  const reply = await ownedRequest(baseURL, session, OVERVIEW, { ...selection, page: 1, selectionRevision: null });
  expect(reply.status).toBe(200); expect(await fixture.pairedPlanning(reply.correlationId, session, 'planning_year_overview_read')).toBe(true);
  const result = parsePlanningOverview(reply.body, { ...selection, page: 1, selectionRevision: null }, setup);
  expect(await fixture.metadataMatches(result.rows)).toBe(true); return result;
}
function nextList(page: Page, matches: (input: PlanningSelection) => boolean) {
  return page.waitForResponse(reply => pathname(reply) === LIST && matches(reply.request().postDataJSON()));
}
async function enter(page: Page, selection: PlanningSelection, overview = false) {
  const waiting = overview ? page.waitForResponse(reply => pathname(reply) === OVERVIEW) : nextList(page, input => input.query === selection.query && input.unitId === selection.unitId);
  await fixture.cookies(page.context(), session, baseURL); await page.goto(url(selection, overview)); await waitForHydration(page);
  await expect(bar(page)).toHaveAttribute('aria-busy', 'false');
  const reply = await waiting;
  if (overview) {
    expect(reply.status()).toBe(200); await actualAudit(reply, OVERVIEW);
    const data = parsePlanningOverview(await reply.json(), reply.request().postDataJSON(), setup);
    expect(await fixture.metadataMatches(data.rows)).toBe(true);
    await expect(page.getByRole('region', { name: 'Läsårsöverblick', exact: true })).toHaveAttribute('aria-busy', 'false');
    return data;
  }
  const data = await parsed(reply); await rowsMatch(page, data, selection.view); return data;
}
async function rowsMatch(page: Page, data: PlanningList, view: PlanningSelection['view'] = 'programplan') {
  const table = region(page, view); await expect(table).toHaveAttribute('aria-busy', 'false');
  await expect(table.locator('tbody tr')).toHaveCount(data.rows.length);
  await expect(table.locator('.plan-list-count')).toContainText(`${data.count} planeringsrader`);
  for (let n = 0; n < data.rows.length; n++) {
    const row = table.locator('tbody tr').nth(n), value = data.rows[n];
    await expect(row.getByRole('rowheader')).toContainText(value.educationName);
    await expect(row).toContainText(value.schoolName);
    await expect(row).toContainText(value.plan ? `Version ${value.plan.version}` : 'Plan saknas');
  }
}
function rowAt(page: Page, data: PlanningList, offeringId: string, unitId = fixture.unitId, planId?: string): Locator {
  const n = data.rows.findIndex(row => row.offeringId === offeringId && row.unitId === unitId && (!planId || row.plan?.id === planId));
  expect(n, 'Verklig rad för exakt utbildning/skola/plan ska finnas.').toBeGreaterThanOrEqual(0);
  return region(page, data.selection.view).locator('tbody tr').nth(n);
}
async function find(page: Page, query: string): Promise<PlanningList> {
  const waiting = nextList(page, input => input.query === query && input.page === 1);
  await search(page).fill(query); const data = await parsed(await waiting); await rowsMatch(page, data, data.selection.view); return data;
}
async function prepareChosenEducation(page: Page, unitId: string, name: string) {
  const flow = page.getByRole('region', { name: 'Program, inriktning och fördjupning', exact: true });
  await expect(flow).toHaveAttribute('aria-busy', 'false'); await expect(flow.getByLabel('Skola', { exact: true })).toHaveValue(unitId);
  await flow.getByRole('button', { name: 'Ny utbildning', exact: true }).click();
  const catalog = flow.getByLabel('Välj underlag', { exact: true });
  if (!await catalog.isVisible()) await flow.locator('.pp-flow-source summary').click();
  await catalog.selectOption(fixture.catalogId); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('1. Program', { exact: true }).selectOption('SA25:4'); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('2. Inriktning', { exact: true }).selectOption('SABEP');
  const form = flow.getByRole('region', { name: 'Ny utbildning och programfördjupning', exact: true });
  await form.getByLabel('Utbildningens namn', { exact: true }).fill(name);
  await form.getByLabel('Elevkull', { exact: true }).fill('Syntetisk framtida listkull');
  await form.getByLabel('Utbildningens exakta startdatum', { exact: true }).fill(metadata.shared.basisStartedOn);
  await form.getByRole('searchbox', { name: 'Lägg till ämne eller nivå', exact: true }).fill('ANIM1000X');
  await form.locator('button[data-level-code="ANIM1000X"]').click();
  await form.getByRole('button', { name: 'Granska utkast', exact: true }).click();
  return form;
}
async function createChosenEducation(page: Page, unitId: string, name: string) {
  const form = await prepareChosenEducation(page, unitId, name);
  const createdResponse = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/utbildning/skapa');
  const parentResponse = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/underlag');
  await form.getByRole('button', { name: 'Spara utbildning och utkast', exact: true }).click();
  const reply = await createdResponse; expect(reply.status()).toBe(200);
  const command = parseProgramplanEducationCreate(reply.request().postDataJSON()); expect(command.unitId).toBe(unitId);
  const created = parseProgramplanEducationCreated(await reply.json(), command);
  expect(created.education.unitId).toBe(unitId); expect(created.plan.unitId).toBe(unitId);
  expect(await fixture.paired(reply.headers()['x-correlation-id'], session, 'programplan_education_created', created.education.id, 'education')).toBe(true);
  const parent = await parentResponse; expect(parent.status()).toBe(200);
  const workspace = parseProgramplanWorkspace(await parent.json(), parent.request().postDataJSON());
  expect(workspace.education.id).toBe(created.education.id);
  expect(workspace.lifecycle.units.some(unit => unit.id === unitId && unit.inMandate)).toBe(true);
  expect(await fixture.paired(parent.headers()['x-correlation-id'], session, 'programplan_workspace_read', created.education.id, 'education')).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get('programplan')).toBe(created.plan.id);
  expect(new URL(page.url()).searchParams.get('programplanskola')).toBe(unitId);
  expect(new URL(page.url()).searchParams.get('programplansversion')).toBe('1');
  await expect(page.getByTestId('protected-programplan-workspace')).toContainText(`Vald skola: ${created.education.schoolName}`);
  expect(await fixture.plans(created.education.id)).toHaveLength(1);
  const reread = page.waitForResponse(response => pathname(response) === '/api/programplaner/lasa' && response.request().postDataJSON().planId === created.plan.id);
  await page.reload(); const refreshed = await reread; expect(refreshed.status()).toBe(200);
  const plan = parseProgramplan(await refreshed.json()); expect(plan.id).toBe(created.plan.id); expect(plan.version).toBe(1); expect(plan.unitId).toBe(unitId);
  expect(await fixture.paired(refreshed.headers()['x-correlation-id'], session, 'programplan_read', plan.id)).toBe(true);
  await expect(page.getByTestId('protected-programplan-workspace')).toContainText(name);
  return created;
}
async function capture(page: Page, info: TestInfo, name: string) {
  const geometry = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
    controls: [...document.querySelectorAll('.plan-list button,.plan-list input,.plan-list select,.planning-context button,.planning-context select')]
      .map(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; }).filter(r => r.width > 0 && r.height > 0),
    tables: [...document.querySelectorAll('.plan-list-scroll')].map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, scroll: el.scrollWidth }; }) }));
  expect(geometry.document).toBeLessThanOrEqual(geometry.client + 1);
  expect(geometry.controls.filter(value => value.height < 44 || value.width < 44)).toEqual([]);
  geometry.tables.forEach(value => { expect(value.left).toBeGreaterThanOrEqual(-1); expect(value.right).toBeLessThanOrEqual(geometry.viewport + 1); });
  await info.attach(`${name}-geometry.json`, { body: JSON.stringify(geometry), contentType: 'application/json' });
  const screenshot = info.outputPath(`${name}.png`); await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach(`${name}.png`, { path: screenshot, contentType: 'image/png' });
}

test.beforeAll(async ({ browserName }, info) => {
  // Missing/unapplied dependencies fail before creating any synthetic DB rows.
  expect(info.config.maxFailures, 'Actual seriell körning måste stoppa vid första FAIL.').toBe(1);
  expect(info.config.workers, 'Actual körning får bara använda en worker.').toBe(1);
  expect(info.project.retries, 'Actual projekt får inte försöka om ett misslyckat fall.').toBe(0);
  const bundle = Object.fromEntries([['final38', 'phase5-38-api-final'], ['performanceRollback', 'phase5-38-read-performance-rollback'],
    ['performanceFinal', 'phase5-38-read-performance-final'], ['performanceApi', 'phase5-38-read-performance-api-final']]
    .map(([key, file]) => [key, json(`work/pilot/results/${file}.json`)]));
  validateSearchDependencies(bundle);
  const rollback = json('work/pilot/results/phase5-40-search-details-rollback.json'), applied = json('work/pilot/results/phase5-40-search-details-apply.json'), final = json('work/pilot/results/phase5-40-search-details-final.json');
  const read = (file: string) => readFileSync(path.join(root, file));
  validateSearchRollback(rollback, read); validateSearchApplied(applied, rollback, read);
  validateHistoricalSources(final, SEARCH_SOURCE_PATHS, historicalGitSource);
  expect(final.status).toBe('PASS'); expect(final.complete).toBe(true); expect(final.mode).toBe('applied');
  expect(final.databaseRecoveryRequired).toBe(false); expect(final.fullApiStatus).toBe('PASS'); expect(final.cleanupStatus).toBe('PASS');
  expect(searchCasesComplete(final.searchApi?.cases, SEARCH_API_CASES)).toBe(true);
  expect(searchTimingsComplete(final.searchApi?.samples)).toBe(true); expect(searchCleanupPreserved(final.cleanup)).toBe(true);
  for (const file of SEARCH_SOURCE_PATHS) expect(final.sourceHashes[file]).toBe(sha(read(file)));
  const proof = await verifySearchWorker(baseURL, bundle.performanceFinal);
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  expect(git(['status', '--porcelain', '--', ...listRuntime, ...listTools])).toBe('');
  expect(git(['diff', '--name-only', proof.buildRevision, 'HEAD', '--', ...listRuntime])).toBe('');
  const sourceHashes = Object.fromEntries([...listRuntime, ...listTools].map(file => [file, sha(read(file))]));
  await info.attach('source-build-dependencies.json', { body: JSON.stringify({ proof, browserName, sourceHashes,
    dependencyReports: { performance: sha(read('work/pilot/results/phase5-38-read-performance-final.json')), search: sha(read('work/pilot/results/phase5-40-search-details-final.json')) } }), contentType: 'application/json' });
});
test.beforeEach(async ({ page }) => {
  if (recoveryRequired) throw Error('OWNED_RECOVERY_REQUIRED');
  setupPending = false; nodePending = 0; nodeUnknownStage = null; browserUnknown = false; completedActualRoutes = new WeakSet<Request>();
  fixture = undefined!; metadata = undefined!; setupComplete = false; nodeUnknown = false; releases.length = 0; pending.clear(); auditChecks = []; dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.type()); await dialog.dismiss(); });

  session = undefined!;
  browserCompletionFailure = null; actualRouteJobs.clear(); browserRouteStates.clear();
  requestActors = new WeakMap<Request, BrowserActor>(); auditReplies = new WeakMap<object, Promise<void>>(); auditRequests = new WeakMap<Request, Promise<void>>();
  activeBrowserContext = null; contextCloseAllowed = false; prematureContextClose = false;
  const context = page.context();
  if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL) || page.isClosed() || context.pages().length !== 1
    || context.pages()[0] !== page || !context.browser()?.isConnected()) throw Error('OWNED_BROWSER_SCOPE');
  activeBrowserContext = context;
  context.once('close', () => { if (!contextCloseAllowed) { prematureContextClose = true; browserUnknown = true; } });
  page.on('request', request => {
    if (pathname(request).startsWith('/api/') && !completedActualRoutes.has(request)) {
      pending.add(request); if (!browserRouteStates.has(request)) recordBrowserRoute(request, 'seen');
      if (session) requestActors.set(request, { ...session });
    }
  });
  page.on('response', reply => {
    pending.delete(reply.request());
    if (!auditRequests.has(reply.request()) && [LIST, OVERVIEW, SETUP].includes(pathname(reply))) { const check = actualAudit(reply, pathname(reply)); void check.catch(() => undefined); auditChecks.push(check); }
  });
  await installActualPassthrough(page);
  fixture = await ownedNode('creation', () => createPlanningListFixture());
  if (recoveryRequired) throw Error('OWNED_RECOVERY_REQUIRED');
  setupPending = true;
  try { metadata = await ownedNode('setup', () => fixture.setup(baseURL)); }
  finally { setupPending = false; }
  if (recoveryRequired) throw Error('OWNED_RECOVERY_REQUIRED');
  session = fixture.hm;
  // The list wrapper dispatches this GET-only route without a request body.
  const reply = await ownedRequest(baseURL, session, SETUP); expect(reply.status).toBe(200);
  expect('noStore' in reply && reply.noStore).toBe(true);
  expect(await fixture.pairedPlanning(reply.correlationId, session, 'planning_year_selection_read')).toBe(true); setup = parsePlanningSetup(reply.body); setupComplete = true;
});
test.afterEach(async ({ page }, info) => {
  releases.splice(0).forEach(release => release());

  let routesSettled = false, pageClosed = false, contextRoutesSettled = false, routeJobsSettled = false, contextClosed = false;
  const context = page.context();
  if (context !== activeBrowserContext || context.pages().some(candidate => candidate !== page)) browserUnknown = true;
  try { await page.unrouteAll({ behavior: 'wait' }); routesSettled = true; } catch { browserUnknown = true; }
  try { await page.close(); pageClosed = true; } catch { browserUnknown = true; }
  try { await context.unrouteAll({ behavior: 'wait' }); contextRoutesSettled = true; } catch { browserUnknown = true; }
  const routeJobsAtDrain = actualRouteJobs.size;
  await Promise.allSettled(actualRouteJobs); routeJobsSettled = actualRouteJobs.size === 0;
  if (prematureContextClose) browserUnknown = true;
  contextCloseAllowed = true;
  try { await context.close(); contextClosed = true; } catch { browserUnknown = true; }
  if (!fixture && !recoveryRequired && nodePending === 0 && !nodeUnknown && !browserUnknown && pending.size === 0 && routesSettled && pageClosed && contextRoutesSettled && routeJobsSettled && contextClosed) return;
  const requireCompletion = async () => {
    if (recoveryRequired || !setupComplete || setupPending || nodePending > 0 || nodeUnknown || browserUnknown || pending.size > 0 || !routesSettled || !pageClosed || !contextRoutesSettled || !routeJobsSettled || !contextClosed) {
      recoveryRequired = true;
      // Reuse the pre-setup original hashes; unknown completion forbids new DB snapshots.
      await info.attach('cleanup-deferred.json', { body: JSON.stringify({ cleanupDeferred: true, databaseRecoveryRequired: true,
        setupComplete, setupPending, pendingNodeRequests: nodePending, unknownNodeRequest: nodeUnknown, nodeUnknownStage,
        unknownBrowserCompletion: browserUnknown, browserCompletionFailure, pendingRequests: pending.size,
        pendingRoutes: [...pending].map(request => browserRouteStates.get(request) ?? { ...routeMetadata(request), stage: 'seen' }),
        routesSettled, pageClosed, contextRoutesSettled, routeJobsSettled, routeJobsAtDrain, routeJobsRemaining: actualRouteJobs.size,
        prematureContextClose, contextClosed,
        ownedCustomerId: fixture?.customerId ?? null, ownedOrganizerId: fixture?.organizerId ?? null, foreignCustomerId: fixture?.foreignCustomerId ?? null,
        originalBusiness: fixture?.originalBusiness ?? null, fixtureExposed: !!fixture }), contentType: 'application/json' });
      throw Error('OWNED_COMPLETION_UNKNOWN: root must verify owned completion before cleanup or another fixture');
    }
  };
  await requireCompletion();
  // Context closure prevents another response from adding an audit read to this set.
  const auditResults = await Promise.allSettled(auditChecks); await requireCompletion();
  try {
    const cleanup = await fixture.cleanup(); await info.attach('cleanup.json', { body: JSON.stringify(cleanup), contentType: 'application/json' });
    expect(searchCleanupPreserved(cleanup)).toBe(true); expect(Object.keys(cleanup.originalBusiness)).toHaveLength(15);
    expect(cleanup.finalBusiness).toEqual(cleanup.originalBusiness);
  } catch (error) {
    await info.attach('cleanup-failure.json', { body: JSON.stringify({ cleanupFailed: true, evidence: (error as { cleanupEvidence?: unknown }).cleanupEvidence ?? null }), contentType: 'application/json' }); throw error;
  }
  const failedAudit = auditResults.find(result => result.status === 'rejected');
  if (failedAudit?.status === 'rejected') throw failedAudit.reason;
  expect(dialogs).toEqual([]);
});

test('L01: verkliga50+2 sidor, unik senare rad, serverordning och tangentbordsrullning', async ({ page }, info) => {
  const selections: PlanningSelection[] = [];
  page.on('request', r => { if (pathname(r) === LIST) selections.push(r.postDataJSON()); });
  const first = await enter(page, q()) as PlanningList; expect(first.count).toBe(52); expect(first.rows).toHaveLength(50);
  expect(first.rows.some(row => row.offeringId === metadata.pageOfferingIds[51])).toBe(false);
  const waiting = nextList(page, input => input.page === 2);
  await region(page).getByRole('button', { name: 'Nästa sida', exact: true }).click(); const second = await parsed(await waiting);
  expect(second.selection.selectionRevision).toBe(first.selectionRevision); expect(second.rows).toHaveLength(2);
  expect(new Set([...first.rows, ...second.rows].map(row => row.offeringId)).size).toBe(52);
  expect(second.rows.some(row => row.offeringId === metadata.pageOfferingIds[51])).toBe(true); await rowsMatch(page, second);
  expect(selections.map(value => value.page)).toEqual([1, 2]);
  const scroller = region(page).getByRole('region', { name: 'Planeringstabell, kan rullas i sidled', exact: true });
  await scroller.focus(); await expect(scroller).toBeFocused();
  const dimensions = await scroller.evaluate(el => ({ max: el.scrollWidth - el.clientWidth, left: el.scrollLeft }));
  await page.keyboard.press('ArrowRight');
  if (dimensions.max > 0) await expect.poll(() => scroller.evaluate(el => el.scrollLeft)).toBeGreaterThan(dimensions.left);
  await capture(page, info, 'program-pages-keyboard');
});

test('L02: lokal kod och %, underscore, apostrof samt gemener hittar senare rad', async ({ page }, info) => {
  await enter(page, q());
  for (const query of [metadata.lastCode, '%', '_', "O'Hara", metadata.lastCode.toLowerCase()]) {
    const data = await find(page, query); expect(data.count).toBe(1); expect(data.rows[0].offeringId).toBe(metadata.pageOfferingIds[51]);
    await expect(rowAt(page, data, metadata.pageOfferingIds[51])).toContainText(metadata.lastCode);
  }
  await capture(page, info, 'literal-later-code');
});

test('L03: verkliga program/inriktningskoder och katalogbenämningar söker hela samlingen', async ({ page }, info) => {
  await enter(page, q());
  for (const [query, field] of [['EK25', 'programCode'], ['EKEKI', 'orientationCode'], [metadata.programNames[1], 'programName'], [metadata.orientationNames[1], 'orientationName']] as const) {
    const data = await find(page, query); expect(data.count).toBeGreaterThan(0);
    expect(data.rows.some(row => row.offeringId === metadata.variantOfferingIds[1])).toBe(true);
    expect(data.rows.every(row => row.searchDetails?.[field] === query)).toBe(true);
  }
  await capture(page, info, 'pinned-program-search');
});

test('L04: kombinerade årsfilter, omvänd sort, tomresultat och Rensa filter', async ({ page }, info) => {
  const initial = q({ grade: 1, cohortRelation: 'new', archive: 'active' }); const data = await enter(page, initial) as PlanningList;
  expect(data.count).toBeGreaterThan(0); expect(data.rows.every(row => row.relativeYear === 1 && row.relation === 'new' && !row.archived && row.plan?.status === 'utkast')).toBe(true);
  const sorted = nextList(page, input => input.sort === 'name' && input.direction === 'desc');
  await region(page).getByRole('columnheader', { name: /^Utbildning/ }).getByRole('button').click(); const reverse = await parsed(await sorted);
  expect(reverse.rows.map(row => row.offeringId)).toEqual([...data.rows].reverse().map(row => row.offeringId)); await rowsMatch(page, reverse);
  await expect(region(page).getByRole('columnheader', { name: /^Utbildning/ })).toHaveAttribute('aria-sort', 'descending');
  const empty = await find(page, 'SYN-NO-RESULT-5540'); expect(empty.count).toBe(0);
  await expect(region(page)).toContainText('Inget underlag matchar valen.');
  const cleared = nextList(page, input => input.query === '' && input.status === 'all' && input.cohortRelation === 'relevant' && input.archive === 'active' && input.grade === null);
  await region(page).getByRole('button', { name: 'Rensa filter', exact: true }).click(); const fresh = await parsed(await cleared); await rowsMatch(page, fresh);
  await expect(search(page)).toHaveValue(''); await expect(page.getByRole('combobox', { name: 'Planstatus', exact: true })).toHaveValue('all');
  await expect(page.getByRole('combobox', { name: 'Årskurs', exact: true })).toHaveValue('');
  await capture(page, info, 'combined-empty-clear');
});

test('L05: två skolor öppnar varsin faktisk timplan och samma frysta källa', async ({ page }, info) => {
  const input = q({ view: 'timplan', unitId: null, query: metadata.sharedQuery, status: 'all' });
  const beforeSource = await fixture.snapshot(metadata.shared.planId), beforeFirst = await fixture.timplanSnapshot(metadata.shared.firstTimplanId), beforeSecond = await fixture.timplanSnapshot(metadata.shared.secondTimplanId);
  let data = await enter(page, input) as PlanningList; expect(data.rows).toHaveLength(2);
  expect(new Set(data.rows.map(row => row.source?.planId))).toEqual(new Set([metadata.shared.planId]));
  for (const [unitId, planId] of [[fixture.unitId, metadata.shared.firstTimplanId], [fixture.secondUnitId, metadata.shared.secondTimplanId]]) {
    const row = data.rows.find(value => value.unitId === unitId)!; expect(row.plan?.id).toBe(planId);
    await expect(rowAt(page, data, metadata.shared.offeringId, unitId, planId)).toContainText(`Bygger på programplan · version ${row.source!.version}`);
    const waiting = page.waitForResponse(reply => pathname(reply) === '/api/timplaner/gym/lasa' && reply.request().postDataJSON().planId === planId);
    await rowAt(page, data, metadata.shared.offeringId, unitId, planId).getByRole('button', { name: /^Öppna / }).click();
    const reply = await waiting; expect(reply.status()).toBe(200); const plan = parseGymTimplan(await reply.json(), planId);
    expect(plan.id).toBe(planId); expect(plan.unitId).toBe(unitId); expect(plan.source.planId).toBe(metadata.shared.planId);
    expect(await fixture.pairedGym(reply.headers()['x-correlation-id'], session, 'gym_timplan_read', planId)).toBe(true);
    expect(new URL(page.url()).searchParams.get('timplan')).toBe(planId);
    await expect(page.getByTestId('protected-gym-timplan-workspace')).toContainText(plan.schoolName);
    const returned = nextList(page, value => value.view === 'timplan' && value.query === input.query);
    await page.goBack(); data = await parsed(await returned); await rowsMatch(page, data, 'timplan');
  }
  expect(await fixture.snapshot(metadata.shared.planId)).toEqual(beforeSource);
  expect(await fixture.timplanSnapshot(metadata.shared.firstTimplanId)).toEqual(beforeFirst); expect(await fixture.timplanSnapshot(metadata.shared.secondTimplanId)).toEqual(beforeSecond);
  await capture(page, info, 'two-schools-source-versus-plan');
});

test('L06: saknad timplan erbjuder faktiskt versionsval utan att skapa data', async ({ page }, info) => {
  const input = q({ view: 'timplan', query: metadata.missingTimplan.query, status: 'all' }), before = await fixture.businessHashes();
  const writes: string[] = []; page.on('request', r => { if (/\/api\/(?:timplaner\/gym\/skapa|programplaner\/(?:skapa|klona|utbildning\/skapa))$/u.test(pathname(r))) writes.push(pathname(r)); });
  const data = await enter(page, input) as PlanningList; expect(data.rows).toHaveLength(1); expect(data.rows[0].plan).toBeNull(); expect(data.rows[0].source).toBeNull();
  await expect(rowAt(page, data, metadata.pageOfferingIds[51])).toContainText('Programplan som underlag saknas');
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/underlag' && reply.request().postDataJSON().offeringId === metadata.pageOfferingIds[51]);
  await rowAt(page, data, metadata.pageOfferingIds[51]).getByRole('button', { name: /^Öppna / }).click();
  const reply = await waiting; expect(reply.status()).toBe(200); const workspace = await reply.json();
  expect(workspace.versions.some((value: { id: string }) => value.id === metadata.pagePlanIds[51])).toBe(true);
  await expect(page.getByTestId('protected-gym-timplan-workspace')).toContainText('Välj en uttrycklig sparad programversion');
  const sourceRead = page.waitForResponse(response => pathname(response) === '/api/timplaner/gym/underlag' && response.request().postDataJSON().sourcePlanId === metadata.missingTimplan.programPlanId);
  await page.getByRole('region', { name: 'Välj programplanens underlag', exact: true }).getByRole('button', { name: `Välj programunderlag, version 1, ${data.rows[0].educationName}`, exact: true }).click();
  const selected = await sourceRead; expect(selected.status()).toBe(200);
  expect((await selected.json()).source.planId).toBe(metadata.missingTimplan.programPlanId);
  expect(await fixture.pairedGym(selected.headers()['x-correlation-id'], session, 'gym_timplan_basis_read', metadata.missingTimplan.programPlanId, 'programplan')).toBe(true);
  await expect(page.getByTestId('protected-gym-timplan-workspace')).toContainText(data.rows[0].educationName);
  await expect.poll(() => new URL(page.url()).searchParams.get('programunderlag')).toBe(metadata.missingTimplan.programPlanId);
  expect(writes).toEqual([]); expect(await fixture.businessHashes()).toEqual(before); await capture(page, info, 'missing-timplan-explicit-source');
});

test('L07: saknad programplan visas utan fabricerad källa eller implicit skapande', async ({ page }, info) => {
  const before = await fixture.businessHashes(), input = q({ query: 'Syntetisk saknad sökram', status: 'all' });
  const data = await enter(page, input) as PlanningList; expect(data.rows).toHaveLength(1); expect(data.rows[0].offeringId).toBe(metadata.missingOfferingId);
  expect(data.rows[0].plan).toBeNull(); expect(data.rows[0].source).toBeNull(); expect(data.rows[0].searchDetails?.programName).toBeNull();
  await expect(rowAt(page, data, metadata.missingOfferingId)).toContainText('Plan saknas');
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/underlag' && reply.request().postDataJSON().offeringId === metadata.missingOfferingId);
  await rowAt(page, data, metadata.missingOfferingId).getByRole('button', { name: /^Öppna / }).click();
  const reply = await waiting; expect(reply.status()).toBe(200); expect((await reply.json()).versionCount).toBe(0);
  expect(await fixture.businessHashes()).toEqual(before); await capture(page, info, 'missing-programplan');
});

test('L08: faktisk409 efter egen kodändring återläser sida1 med samma filter', async ({ page }, info) => {
  const initial = q({ sort: 'school' }); const first = await enter(page, initial) as PlanningList; await ownedNode('fixture-mutation', () => fixture.changeLocalCode());
  const conflict = page.waitForResponse(reply => pathname(reply) === LIST && reply.status() === 409);
  const restarted = nextList(page, input => input.page === 1 && input.selectionRevision === null && input.query === initial.query);
  await region(page).getByRole('button', { name: 'Nästa sida', exact: true }).click(); const rejected = await conflict;
  await actualAudit(rejected, LIST); expect((await rejected.json()).code).toBe('conflict');
  const fresh = await parsed(await restarted); expect(fresh.selectionRevision).not.toBe(first.selectionRevision);
  expect(fresh.selection).toEqual(initial); await rowsMatch(page, fresh); await expect(search(page)).toHaveValue(initial.query);
  expect(new URL(page.url()).searchParams.get('planeringssida')).toBe('1'); await capture(page, info, 'stale-page-restarts');
});

test('L09: fördröjt faktiskt söksvar kan inte ersätta den senare sökningen', async ({ page }, info) => {
  const held = hold(); let intercepted = false;
  await page.route(`**${LIST}`, async route => {
    const input = route.request().postDataJSON() as PlanningSelection;
    if (intercepted || input.query !== metadata.pageQuery) { await route.fallback(); return; } intercepted = true;
    const reply = await actualRouteFetch(route); expect(reply.status()).toBe(200); await actualAudit(reply, LIST); pending.delete(route.request()); held.ready.resolve(reply);
    await held.release.promise; try { await route.fulfill({ response: reply }); } catch { /* Old request was cancelled after actual DB completion. */ }
  });
  await fixture.cookies(page.context(), session, baseURL); const opening = page.goto(url(q())); await held.ready.promise; await opening; await waitForHydration(page);
  const later = await find(page, metadata.lastCode); expect(later.count).toBe(1); held.release.resolve(); await clearControlledRoutes(page);
  await rowsMatch(page, later); await expect(search(page)).toHaveValue(metadata.lastCode); await capture(page, info, 'late-search-discarded');
});

test('L10: fördröjt faktiskt skolsvar och främmande URL kan inte ge gamla skolrader', async ({ page }, info) => {
  const held = hold(); let intercepted = false;
  await page.route(`**${LIST}`, async route => {
    const input = route.request().postDataJSON() as PlanningSelection;
    if (intercepted || input.unitId !== fixture.unitId) { await route.fallback(); return; } intercepted = true;
    const reply = await actualRouteFetch(route); expect(reply.status()).toBe(200); await actualAudit(reply, LIST); pending.delete(route.request()); held.ready.resolve(reply);
    await held.release.promise; try { await route.fulfill({ response: reply }); } catch { /* Aborted old scope stays absent. */ }
  });
  await fixture.cookies(page.context(), session, baseURL); const opening = page.goto(url(q())); await held.ready.promise; await opening; await waitForHydration(page);
  const waiting = nextList(page, input => input.unitId === fixture.secondUnitId);
  await bar(page).getByLabel('Planeringsskola', { exact: true }).selectOption(fixture.secondUnitId); const data = await parsed(await waiting);
  expect(data.rows).toHaveLength(1); expect(data.rows[0].unitId).toBe(fixture.secondUnitId);
  held.release.resolve(); await clearControlledRoutes(page); await rowsMatch(page, data);
  const denied = await ownedRequest(baseURL, session, LIST, q({ unitId: metadata.foreignUnitId })); expect(denied.status).toBe(403);
  expect((await fixture.events(denied.correlationId)).filter((event: { outcome: string }) => event.outcome === 'ok')).toEqual([]);
  const fresh = nextList(page, input => input.unitId !== metadata.foreignUnitId);
  await page.goto(url(q({ unitId: metadata.foreignUnitId }))); const normalized = await parsed(await fresh);
  expect(normalized.rows.every(row => row.customerId === fixture.customerId && row.unitId !== metadata.foreignUnitId)).toBe(true);
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).not.toHaveValue(metadata.foreignUnitId); await capture(page, info, 'scope-race-foreign-excluded');
});

test('L11: verklig årsöverblick räknar52 samt gemensamma poäng separat från skolans timmar', async ({ page }, info) => {
  const full = await enter(page, q(), true) as PlanningOverview; expect(full.count).toBe(52);
  const overview = page.getByRole('region', { name: 'Läsårsöverblick', exact: true }); await expect(overview).toContainText('52 planeringsrader i hela urvalet');
  await expect(overview).toContainText('Programramens poäng för året'); await expect(overview).not.toContainText('Planerade ramtimmar för året');
  const waiting = nextList(page, input => input.query === metadata.pageQuery);
  await overview.getByRole('button', { name: 'Visa och öppna planerna', exact: true }).click(); const list = await parsed(await waiting); expect(list.rows).toEqual(full.rows.slice(0, 50));
  await rowsMatch(page, list); expect(new URL(page.url()).searchParams.has('planeringsoversikt')).toBe(false);
  const two = q({ view: 'timplan', unitId: null, query: metadata.sharedQuery, status: 'all' }); const shared = await enter(page, two, true) as PlanningOverview;
  expect(shared.rows).toHaveLength(2); const annual = shared.rows.map(row => planningAnnualMetrics(row, shared.selection.schoolYear));
  expect(shared.totals.points).toEqual(annual[0].points); expect(shared.totals.annualHours?.known).toBe(annual.reduce((sum, value) => sum + (value.hours?.known ?? 0), 0));
  await expect(overview).toContainText('Planerade ramtimmar för året'); await capture(page, info, 'full-overview-deduplicated-points');
});

test('L12: GR-bunden äldre version och IM-okänd veckotid förblir tydliga i årsöverblicken', async ({ page }, info) => {
  const gr = q({ view: 'timplan', schoolform: 'grundskola', unitId: metadata.gr.unitId, query: 'Syntetisk årsplaneringsgrundskola', status: 'all' });
  const bound = await enter(page, gr, true) as PlanningOverview; expect(bound.rows.some(row => row.plan?.id === metadata.gr.oldPlanId && row.application?.columnId === 'ak8')).toBe(true);
  expect(bound.rows.some(row => row.plan?.id === metadata.gr.newPlanId)).toBe(false);
  await expect(page.getByRole('region', { name: 'Läsårsöverblick', exact: true })).toContainText('Okänt');
  const im = q({ view: 'timplan', schoolform: 'introduktionsprogram', query: 'Syntetisk årsplaneringsintroduktion', status: 'all' });
  const weekly = await enter(page, im, true) as PlanningOverview; expect(weekly.rows).toHaveLength(1); expect(weekly.totals.weeklyHours?.complete).toBe(false);
  const overview = page.getByRole('region', { name: 'Läsårsöverblick', exact: true }); await expect(overview).toContainText('Planerade timmar per vecka');
  await expect(overview).not.toContainText('Planerade ramtimmar för året'); await capture(page, info, 'gr-binding-im-unknown');
});

test('L13: äldre faktisk programversion öppnas trots nyare utkast och filter består vid Back', async ({ page }, info) => {
  await ownedNode('fixture-mutation', () => fixture.sealOwnedPlan(fixture.planId));
  const oldReply = await ownedRequest(baseURL, session, '/api/programplaner/lasa', { planId: fixture.planId }); expect(oldReply.status).toBe(200);
  const old = parseProgramplan(oldReply.body); expect(old.status).toBe('faststalld');
  const cloned = await ownedRequest(baseURL, session, '/api/programplaner/klona', { sourcePlanId: old.id, expectedSourceRevision: old.revision, expectedLatestVersion: old.version, explicitLegacyBasis: null });
  expect(cloned.status).toBe(200); const newer = parseProgramplanCloneReply(cloned.body); expect(newer.version).toBe(old.version + 1);
  expect(await fixture.paired(cloned.correlationId, session, 'programplan_draft_cloned', newer.id)).toBe(true);
  const own = await ownedOverview(q({ query: '', status: 'all' })), target = own.rows.find(row => row.plan?.id === old.id)!;
  expect(target).toBeTruthy(); const input = q({ query: target.educationName, status: 'all', sort: 'version' });
  const data = await enter(page, input) as PlanningList; expect(data.rows.some(row => row.plan?.id === newer.id)).toBe(true);
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/lasa' && reply.request().postDataJSON().planId === old.id);
  await rowAt(page, data, old.offeringId, fixture.unitId, old.id).getByRole('button', { name: /^Öppna / }).click();
  const reply = await waiting; expect(reply.status()).toBe(200); expect(parseProgramplan(await reply.json()).id).toBe(old.id);
  expect(await fixture.paired(reply.headers()['x-correlation-id'], session, 'programplan_read', old.id)).toBe(true);
  expect(new URL(page.url()).searchParams.get('programplan')).toBe(old.id);
  const returned = nextList(page, value => value.query === input.query && value.sort === input.sort); await page.goBack();
  const again = await parsed(await returned); expect(again.selection).toEqual(input); await rowsMatch(page, again); await capture(page, info, 'older-version-return');
});

test('L14: Ny programplan och Kopiera behåller faktisk behörighet utan påhittat startdatum', async ({ page }, info) => {
  const before = await fixture.businessHashes(), choices = '/api/programplaner/val', workspace = page.getByTestId('protected-programplan-workspace');
  const pendingPermission = hold(); let permissionReads = 0;
  async function actualPermission(route: Route) {
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200);
    expect(parseProgramplanSelection(await actual.json(), route.request().postDataJSON()).canCreateEducation).toBe(true);
    expect(actual.headers()['cache-control']).toBe('no-store');
    expect(await ownedNode('readback', () => fixture.pairedGym(actual.headers()['x-correlation-id'], session, 'programplan_selection_read', null, 'education_collection'))).toBe(true);
    return actual;
  }
  await page.route('**'+choices, async route => {
    const actual = await actualPermission(route); permissionReads++; pendingPermission.ready.resolve(actual);
    await pendingPermission.release.promise; await route.fulfill({ response: actual });
  });
  const data = await enter(page, q()) as PlanningList, row = data.rows[0]; await pendingPermission.ready.promise;
  const open = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/lasa' && reply.request().postDataJSON().planId === row.plan!.id);
  await rowAt(page, data, row.offeringId).getByRole('button', { name: /^Öppna / }).click(); expect((await open).status()).toBe(200);
  await expect(workspace.getByRole('heading', { name: row.educationName, exact: true })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toHaveCount(0);
  pendingPermission.release.resolve(); await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toBeEnabled(); expect(permissionReads).toBe(1);
  await page.unroute('**'+choices);
  const copy = page.getByRole('region', { name: 'Kopiera till ny utbildning', exact: true });
  await workspace.getByRole('button', { name: 'Kopiera', exact: true }).click(); await expect(copy).toBeVisible();
  await expect(copy.getByLabel('Utbildningens exakta startdatum', { exact: true })).toHaveValue(''); await copy.getByRole('button', { name: 'Avbryt', exact: true }).click();
  const exactURL = page.url(), reloadedPermission = page.waitForResponse(reply => pathname(reply) === choices);
  await page.reload(); expect((await reloadedPermission).status()).toBe(200); await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toBeEnabled();
  expect(new URL(page.url()).searchParams.get('programplan')).toBe(row.plan!.id); expect(new URL(page.url()).searchParams.get('programplansversion')).toBe(String(row.plan!.version));
  const directPermission = page.waitForResponse(reply => pathname(reply) === choices);
  await page.evaluate(address => window.location.replace(address), exactURL); expect((await directPermission).status()).toBe(200);
  await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toBeEnabled();
  const actualFailure = async (route: Route) => {
    await actualPermission(route); await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) });
  };
  await page.route('**'+choices, actualFailure); await page.reload();
  const retry = workspace.getByRole('button', { name: 'Läs skapanderätt igen', exact: true }); await expect(retry).toBeEnabled();
  await expect(workspace.getByRole('heading', { name: row.educationName, exact: true })).toBeVisible(); await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toHaveCount(0);
  await page.unroute('**'+choices); const retried = page.waitForResponse(reply => pathname(reply) === choices); await retry.click(); expect((await retried).status()).toBe(200);
  await expect(workspace.getByRole('button', { name: 'Kopiera', exact: true })).toBeEnabled(); expect(new URL(page.url()).searchParams.get('programplan')).toBe(row.plan!.id);
  const returned = nextList(page, value => value.query === metadata.pageQuery); await page.goBack(); await parsed(await returned);
  await page.getByRole('button', { name: 'Ny programplan', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ny programplan', exact: true })).toBeVisible();
  expect(await fixture.businessHashes()).toEqual(before); await capture(page, info, 'create-copy-regression');
  // Only the owned session expires; the next real permission read must clear the workspace.
  await page.route('**'+choices, actualFailure); await page.reload(); await expect(retry).toBeEnabled(); await page.unroute('**'+choices);
  await ownedNode('fixture-mutation', () => fixture.expire(session)); const denied = page.waitForResponse(reply => pathname(reply) === choices);
  await retry.click(); const actualDenied = await denied; expect(actualDenied.status()).toBe(401); expect((await actualDenied.json()).code).toBe('session_expired');
  expect((await ownedNode('readback', () => fixture.events(actualDenied.headers()['x-correlation-id']))).filter((event: { outcome: string }) => event.outcome === 'ok')).toEqual([]);
  await expect(workspace).toHaveCount(0); await expect(bar(page)).toHaveCount(0);
  expect(await fixture.businessHashes()).toEqual(before);
  await info.attach('copy-permission-recovery.json', { body: JSON.stringify({ heldActualPermission: true, exactPlanId: row.plan!.id, version: row.plan!.version,
    listUnmountSurvived: true, reloadAndDirectLink: true, actualRetry: true, expiredPermissionCleared: true }), contentType: 'application/json' });
});

test('L15: delad radB återgår till alla skolor och Ny programplan använder uttryckligt A-val', async ({ page }, info) => {
  const before = await fixture.businessHashes();
  const input = q({ unitId: null, query: metadata.sharedQuery, status: 'all' });
  const data = await enter(page, input) as PlanningList; expect(data.rows).toHaveLength(2);
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/lasa' && reply.request().postDataJSON().planId === metadata.shared.planId);
  await rowAt(page, data, metadata.shared.offeringId, fixture.secondUnitId, metadata.shared.planId).getByRole('button', { name: /^Öppna / }).click();
  const reply = await waiting; expect(parseProgramplan(await reply.json()).id).toBe(metadata.shared.planId);
  expect(await fixture.paired(reply.headers()['x-correlation-id'], session, 'programplan_read', metadata.shared.planId)).toBe(true);
  const schoolB = setup.units.find(unit => unit.unitId === fixture.secondUnitId)!;
  await expect(page.getByTestId('protected-programplan-workspace')).toContainText(`Vald skola: ${schoolB.schoolName}`);
  expect(new URL(page.url()).searchParams.get('programplanskola')).toBe(fixture.secondUnitId);
  const returned = nextList(page, value => value.query === input.query && value.unitId === null);
  await page.getByRole('button', { name: 'Alla programplaner', exact: true }).click(); await rowsMatch(page, await parsed(await returned));
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).toHaveValue('all');
  await page.getByRole('button', { name: 'Ny programplan', exact: true }).click();
  const flow = page.getByRole('region', { name: 'Program, inriktning och fördjupning', exact: true });
  await expect(flow).toHaveAttribute('aria-busy', 'false'); await expect(flow.getByLabel('Skola', { exact: true })).toHaveValue('');
  const selection = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/val' && reply.request().postDataJSON().unitId === fixture.unitId);
  await flow.getByLabel('Skola', { exact: true }).selectOption(fixture.unitId);
  const selected = await selection; expect(selected.status()).toBe(200); const parsedSelection = parseProgramplanSelection(await selected.json(), selected.request().postDataJSON());
  expect(parsedSelection.selection.unitId).toBe(fixture.unitId); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await expect(flow.getByLabel('Skola', { exact: true })).toHaveValue(fixture.unitId);
  expect(new URL(page.url()).searchParams.has('programplanskola')).toBe(false);
  expect(await fixture.businessHashes()).toEqual(before);
  const source = await fixture.snapshot(metadata.shared.planId);
  const created = await createChosenEducation(page, fixture.unitId, 'Syntetisk listskapning A');
  expect(created.plan.id).not.toBe(metadata.shared.planId); expect(await fixture.snapshot(metadata.shared.planId)).toEqual(source);
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).toHaveValue('all');
  await capture(page, info, 'return-all-create-school-a');
});

test('L16: globalt A och manuellt Flow-valB öppnar gemensam programram för B', async ({ page }, info) => {
  const before = await fixture.businessHashes(); const data = await enter(page, q({ query: metadata.sharedQuery, status: 'all' })) as PlanningList;
  const education = data.rows.find(row => row.offeringId === metadata.shared.offeringId)!;
  expect(education.unitId).toBe(fixture.unitId);
  await page.getByRole('button', { name: 'Ny programplan', exact: true }).click();
  const flow = page.getByRole('region', { name: 'Program, inriktning och fördjupning', exact: true });
  await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('Skola', { exact: true }).selectOption(fixture.secondUnitId); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByRole('button', { name: 'Befintlig utbildning', exact: true }).click();
  await flow.getByLabel('1. Program', { exact: true }).selectOption('SA25:4'); await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('2. Inriktning', { exact: true }).selectOption('SABEP');
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/underlag' && reply.request().postDataJSON().offeringId === metadata.shared.offeringId);
  await flow.getByRole('region', { name: 'Välj utbildning och elevkull', exact: true }).getByRole('button', { name: /^Öppna utbildning / }).filter({ hasText: education.educationName }).click();
  const reply = await waiting; expect(reply.status()).toBe(200); const workspace = parseProgramplanWorkspace(await reply.json(), reply.request().postDataJSON());
  expect(workspace.lifecycle.units.some(unit => unit.id === fixture.secondUnitId && unit.inMandate)).toBe(true);
  expect(await fixture.paired(reply.headers()['x-correlation-id'], session, 'programplan_workspace_read', metadata.shared.offeringId, 'education')).toBe(true);
  const schoolB = setup.units.find(unit => unit.unitId === fixture.secondUnitId)!;
  await expect(page.getByTestId('protected-programplan-workspace')).toContainText(`Vald skola: ${schoolB.schoolName}`);
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).toHaveValue(fixture.secondUnitId);
  expect(new URL(page.url()).searchParams.get('programplanskola')).toBe(fixture.secondUnitId);
  expect(await fixture.businessHashes()).toEqual(before); await capture(page, info, 'manual-flow-school-b');
});

test('L17: äldre kanonisk klassbunden GY-version öppnas trots faktiskt nyare utkast', async ({ page }, info) => {
  const history = metadata.historyGym, before = await fixture.businessHashes();
  const original = await fixture.timplanSnapshot(history.oldPlanId), newer = await fixture.timplanSnapshot(history.newPlanId), source = await fixture.snapshot(history.sourcePlanId), links = await fixture.classLinks();
  const input = q({ view: 'timplan', unitId: history.unitId, schoolYear: history.schoolYear, query: history.query, status: 'all' });
  const data = await enter(page, input) as PlanningList; expect(data.count).toBe(1);
  const row = data.rows[0]; expect(row.plan?.id).toBe(history.oldPlanId); expect(row.plan?.version).toBe(1);
  expect(row.source?.planId).toBe(history.sourcePlanId); expect(row.application?.planId).toBe(history.oldPlanId);
  expect(row.underlag).toBe('class-bound'); expect(row.classes.map(value => value.id)).toEqual([history.classId]);
  expect(newer.plan.status).toBe('utkast'); expect(newer.plan.version).toBe(2);
  const waiting = page.waitForResponse(reply => pathname(reply) === '/api/timplaner/gym/lasa' && reply.request().postDataJSON().planId === history.oldPlanId);
  await rowAt(page, data, history.offeringId, history.unitId, history.oldPlanId).getByRole('button', { name: /^Öppna / }).click();
  const reply = await waiting; expect(reply.status()).toBe(200); const actual = parseGymTimplan(await reply.json(), history.oldPlanId);
  expect(actual.version).toBe(1); expect(actual.status).toBe('faststalld'); expect(actual.source.planId).toBe(history.sourcePlanId);
  expect(await fixture.pairedGym(reply.headers()['x-correlation-id'], session, 'gym_timplan_read', history.oldPlanId)).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get('timplan')).toBe(history.oldPlanId);
  expect(new URL(page.url()).searchParams.get('timplansversion')).toBe('1');
  const reload = page.waitForResponse(response => pathname(response) === '/api/timplaner/gym/lasa' && response.request().postDataJSON().planId === history.oldPlanId);
  await page.reload(); const refreshed = await reload; expect(parseGymTimplan(await refreshed.json(), history.oldPlanId).version).toBe(1);
  expect(await fixture.pairedGym(refreshed.headers()['x-correlation-id'], session, 'gym_timplan_read', history.oldPlanId)).toBe(true);
  await expect(page.getByTestId('protected-gym-timplan-workspace')).toContainText('Fastställd');
  expect(await fixture.timplanSnapshot(history.oldPlanId)).toEqual(original); expect(await fixture.timplanSnapshot(history.newPlanId)).toEqual(newer);
  expect(await fixture.snapshot(history.sourcePlanId)).toEqual(source); expect(await fixture.classLinks()).toEqual(links);
  expect(await fixture.businessHashes()).toEqual(before); await capture(page, info, 'bound-older-gym-version');
});

test('L18: skapadB får URL först efter faktisk parent-återläsning; okänt kvitto behåller spärr', async ({ page }, info) => {
  await enter(page, q()); await page.getByRole('button', { name: 'Ny programplan', exact: true }).click();
  const flow = page.getByRole('region', { name: 'Program, inriktning och fördjupning', exact: true });
  await expect(flow).toHaveAttribute('aria-busy', 'false');
  await flow.getByLabel('Skola', { exact: true }).selectOption(fixture.secondUnitId); await expect(flow).toHaveAttribute('aria-busy', 'false');
  const name = 'Syntetisk listskapning B', form = await prepareChosenEducation(page, fixture.secondUnitId, name);
  const held = hold(); let reads = 0, statusReads = 0, commandId = '';
  await page.route('**/api/programplaner/utbildning/status', async route => {
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); statusReads++;
    const status = parseProgramplanEducationStatus(await actual.json(), route.request().postDataJSON());
    expect(status.commandId).toBe(commandId); expect(status.status).toBe('created');
    expect(await fixture.paired(actual.headers()['x-correlation-id'], session, 'programplan_education_status_read', commandId, 'education_command')).toBe(true);
    pending.delete(route.request()); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) });
  });
  await page.route('**/api/programplaner/underlag', async route => {
    const actual = await actualRouteFetch(route); expect(actual.status()).toBe(200); reads++;
    const workspace = parseProgramplanWorkspace(await actual.json(), route.request().postDataJSON()); expect(workspace.education.name).toBe(name);
    expect(workspace.lifecycle.units.some(unit => unit.id === fixture.secondUnitId && unit.inMandate)).toBe(true);
    expect(await fixture.paired(actual.headers()['x-correlation-id'], session, 'programplan_workspace_read', workspace.education.id, 'education')).toBe(true);
    pending.delete(route.request()); held.ready.resolve(actual); await held.release.promise;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'transport_failed' }) });
  });
  const oldURL = page.url(), creation = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/utbildning/skapa');
  await form.getByRole('button', { name: 'Spara utbildning och utkast', exact: true }).click();
  const written = await creation; expect(written.status()).toBe(200);
  const command = parseProgramplanEducationCreate(written.request().postDataJSON()); commandId = command.commandId; expect(command.unitId).toBe(fixture.secondUnitId);
  const created = parseProgramplanEducationCreated(await written.json(), command);
  expect(await fixture.paired(written.headers()['x-correlation-id'], session, 'programplan_education_created', created.education.id, 'education')).toBe(true);
  await held.ready.promise; expect(page.url()).toBe(oldURL);
  await bar(page).getByLabel('Planeringsläsår', { exact: true }).selectOption(String(metadata.planningYear + 1));
  await expect(bar(page).getByLabel('Planeringsläsår', { exact: true })).toHaveValue(String(metadata.planningYear)); expect(page.url()).toBe(oldURL);
  held.release.resolve(); await expect(flow).toContainText('Sparandet kan inte avgöras ännu.'); await clearControlledRoutes(page);
  const recovery = page.getByTestId('protected-programplan-workspace').getByRole('button', { name: 'Läs aktuell sparstatus', exact: true });
  await expect(recovery).toBeEnabled(); expect(page.url()).toBe(oldURL);
  await bar(page).getByLabel('Planeringsskola', { exact: true }).selectOption(fixture.secondUnitId);
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).toHaveValue(fixture.unitId); expect(page.url()).toBe(oldURL);
  const parent = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/underlag' && reply.request().postDataJSON().offeringId === created.education.id);
  await recovery.click(); const known = await parent; expect(known.status()).toBe(200);
  expect(parseProgramplanWorkspace(await known.json(), known.request().postDataJSON()).education.id).toBe(created.education.id);
  expect(await fixture.paired(known.headers()['x-correlation-id'], session, 'programplan_workspace_read', created.education.id, 'education')).toBe(true);
  await expect.poll(() => new URL(page.url()).searchParams.get('programplan')).toBe(created.plan.id);
  expect(new URL(page.url()).searchParams.get('programplansversion')).toBe('1'); expect(new URL(page.url()).searchParams.get('programplanskola')).toBe(fixture.secondUnitId);
  await expect(bar(page).getByLabel('Planeringsskola', { exact: true })).toHaveValue(fixture.secondUnitId);
  const reread = page.waitForResponse(reply => pathname(reply) === '/api/programplaner/lasa' && reply.request().postDataJSON().planId === created.plan.id);
  await page.reload(); const final = await reread; expect(parseProgramplan(await final.json()).id).toBe(created.plan.id);
  expect(await fixture.paired(final.headers()['x-correlation-id'], session, 'programplan_read', created.plan.id)).toBe(true);
  expect(reads).toBe(1); expect(statusReads).toBe(1); expect(await fixture.plans(created.education.id)).toHaveLength(1);
  await expect(page.getByTestId('protected-programplan-workspace')).toContainText(name); await capture(page, info, 'created-b-readback-url-recovery');
});
