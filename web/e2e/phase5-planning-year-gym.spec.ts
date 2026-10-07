// SOURCE-ONLY. Before any setup, root's actual release pipeline must validate real
// 39 C01–C08×2 and 40 L01–L18×2 Playwright JSON: exact source/build hashes, no skips,
// no retries, audit and whole15 cleanup attachments. There is no invented PASS schema.
// Actual command requires --max-failures=1; unknown DB completion stops the next fixture.
// Every held/failing browser answer follows route.fetch of the actual audited response.
import {expect,test,type APIResponse,type Page,type Request,type Response,type Route,type TestInfo} from '@playwright/test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createPlanningGymFixture} from '../../work/pilot/phase5-planning-year-gym-fixtures.mjs';
import {SEARCH_SOURCE_PATHS,SEARCH_API_CASES,validateHistoricalSources,historicalGitSource,validateSearchRollback,
 validateSearchApplied,validateSearchDependencies,searchCasesComplete,searchCleanupPreserved,searchTimingsComplete,verifySearchWorker} from '../../work/pilot/verify-planning-year-search-details.mjs';
import {planningSelection} from '../../work/pilot/verify-planning-year-api.mjs';
import {parsePlanningList,parsePlanningSetup,parsePlanningSelection,type PlanningSelection,type PlanningSetup} from '../lib/planning-year-contract.ts';
import {parseGymTimplan,parseGymTimplanRowReply,type GymTimplanHours} from '../lib/gym-timplan.ts';
import {parseProgramplanTermReply,type ProgramplanTermWrite} from '../lib/programplan-terms-contract.ts';
import {projectGymYear} from '../lib/planning-year-model.ts';
import {waitForHydration} from './helpers/keycloak.ts';

type Fixture=Awaited<ReturnType<typeof createPlanningGymFixture>>;
type Metadata=Awaited<ReturnType<Fixture['setup']>>;
type Cohort={offeringId:string;sourcePlanId:string;planId:string;unitId:string;query:string;startedOn:string;rowKey:string;pointTerms:number[]};
const root=fileURLToPath(new URL('../../',import.meta.url)),baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3061';
const SETUP='/api/planering/urval',LIST='/api/planering/lista',ROW='/api/timplaner/gym/rad',GYREAD='/api/timplaner/gym/lasa';
const TERMS='/api/programplaner/terminer',TERMSREAD=TERMS+'/lasa';
const runtime=['web/app/protected-home.tsx','web/app/planning-context.tsx','web/app/planning-context.css','web/lib/protected-plan-location.ts',
 'web/lib/planning-year-model.ts','web/app/context-switch.tsx','web/app/protected-programplan-flow.tsx','web/app/protected-programplan-lifecycle.tsx',
 'web/app/protected-plan-list.tsx','web/app/protected-plan-list.css','web/app/protected-planning-overview.tsx','web/app/protected-programplan-list.tsx',
 'web/app/protected-programplan-workspace.tsx','web/app/protected-programplan-board.tsx','web/app/protected-programplan.css',
 'web/app/protected-gym-timplan-workspace.tsx','web/app/protected-gym-timplan-hours.tsx','web/app/protected-gym-timplan.css'];
const tools=['work/pilot/phase5-planning-year-gym-fixtures.mjs','web/e2e/phase5-planning-year-gym.spec.ts',
 'work/pilot/phase5-planning-year-list-fixtures.mjs','web/e2e/phase5-planning-year-lists.spec.ts',
 'web/e2e/phase5-planning-year-context.spec.ts','web/playwright.phase5-planning-year.config.ts'];
let fixture:Fixture,metadata:Metadata,setup:PlanningSetup,setupComplete=false,nodeUnknown=false;
let checks:Promise<void>[]=[],dialogs:string[]=[];let browserActor:Fixture['principal'];const controlledReplies=new WeakSet<Request>();const pending=new Set<Request>(),releases:(()=>void)[]=[];
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

type BrowserActor = Fixture['principal'];
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
      if ([SETUP, LIST, ROW, GYREAD, TERMS, TERMSREAD].includes(url.pathname)) {
        stage = 'audit'; recordBrowserRoute(request, 'audit');
        const proof = audit(actual, url.pathname, request.method() === 'POST' ? request.postDataJSON() : undefined, captured);
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

const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const json=(file:string)=>JSON.parse(readFileSync(path.join(root,file),'utf8'));
const pathname=(r:{url:()=>string})=>new URL(r.url()).pathname;
const match=(route:string)=>(r:Response)=>pathname(r)===route&&r.request().method()==='POST';
const program=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const board=(page:Page)=>program(page).getByRole('region',{name:'Programplanen',exact:true});
const gym=(page:Page)=>page.getByTestId('protected-gym-timplan-workspace');
const bar=(page:Page)=>page.getByRole('region',{name:'Planeringsval',exact:true});
const gcell=(page:Page,r:Cohort,i:number)=>gym(page).locator(`input[data-row="${r.rowKey}"][data-term="${i}"]`);
const pcell=(page:Page,r:Cohort,i:number)=>board(page).locator(`input[data-row="${r.rowKey}"][data-term="${i}"]`);
function gate(){let readyResolve!:(v:APIResponse)=>void,releaseResolve!:()=>void;
 const ready=new Promise<APIResponse>(r=>{readyResolve=r;}),released=new Promise<void>(r=>{releaseResolve=r;});releases.push(releaseResolve);
 return {ready,released,readyResolve,release:releaseResolve};}
async function request(...args:Parameters<Fixture['request']>){return ownedNode('request',()=>fixture.request(...args));}
function audit(reply: Response | APIResponse, route: string, ownedCommand?: { planId: string }, captured: BrowserActor = 'request' in reply ? requestActor((reply as Response).request()) : { ...browserActor }): Promise<void> {
  return cachedAudit(reply, async () => {
    expect(reply.headers()['cache-control']).toMatch(/no-store/u); const corr = reply.headers()['x-correlation-id']; expect(corr).toBeTruthy();
    if (reply.status() !== 200) { expect((await ownedNode('readback', () => fixture.events(corr))).filter((e: { outcome: string }) => e.outcome === 'ok')).toEqual([]); return; }
    if (route === SETUP || route === LIST) { expect(await ownedNode('readback', () => fixture.pairedPlanning(corr, captured, route === SETUP ? 'planning_year_selection_read' : 'planning_year_list_read'))).toBe(true); return; }
    const command = ownedCommand ?? ('request' in reply ? (reply as Response).request().postDataJSON() : null);
    const id = command?.planId;
    const action = route === ROW ? 'gym_timplan_row_changed' : route === GYREAD ? 'gym_timplan_read' : route === TERMS ? 'programplan_terms_changed' : 'programplan_terms_read';
    expect(await ownedNode('readback', () => fixture.pairedGym(corr, captured, action, id, route === ROW || route === GYREAD ? 'timplan' : 'programplan'))).toBe(true);
  });
}

function selection(r:Cohort,view:PlanningSelection['view'],schoolYear=metadata.planningYear):PlanningSelection{
 return parsePlanningSelection(planningSelection(schoolYear,{view,unitId:fixture.unitId,query:r.query,status:'all',cohortRelation:'all',archive:'all'}));
}
function address(q:PlanningSelection){return '/?'+new URLSearchParams({vy:q.view==='programplan'?'programplaner':'timplaner',
 planeringslasar:String(q.schoolYear),planeringsskola:q.unitId??'all',planeringsform:'GY',planeringssok:q.query,
 planeringsstatus:'all',planeringskull:'all',planeringsarkiv:'all'});}
async function enter(page:Page,r:Cohort,view:PlanningSelection['view'],schoolYear=metadata.planningYear,actor=fixture.principal){
 browserActor=actor;const input=selection(r,view,schoolYear),wait=page.waitForResponse(match(LIST));
 await fixture.cookies(page.context(),actor,baseURL);await page.goto(address(input));await waitForHydration(page);
 const response=await wait;expect(response.status()).toBe(200);
 const list=parsePlanningList(await response.json(),response.request().postDataJSON(),setup);
 expect(await fixture.metadataMatches(list.rows)).toBe(true);expect(list.rows).toHaveLength(1);
 expect(list.rows[0].plan?.id).toBe(view==='programplan'?r.sourcePlanId:r.planId);
 const region=page.getByRole('region',{name:view==='programplan'?'Alla programplaner':'Alla timplaner',exact:true});
 await expect(region).toHaveAttribute('aria-busy','false');await region.getByRole('button',{name:/^Öppna /u}).click();
 await expect(view==='programplan'?board(page):gym(page).getByRole('region',{name:'Skolans undervisningstid',exact:true})).toBeVisible();return list.rows[0];
}
async function visualYear(page:Page,view:PlanningSelection['view'],relative:number|'all'){
 const w=view==='programplan'?board(page):gym(page);
 const selected=view==='programplan'&&relative!=='all'?w.locator('.ppb-year').nth(relative-1):w.getByRole('button',{name:relative==='all'?'Visa hela planen':`Åk ${relative}`,exact:true});
 await expect(selected).toHaveAttribute('aria-pressed','true');
 if(view==='programplan')await expect(w).toHaveAttribute('data-year',relative==='all'?'all':String(relative-1));
 await expect.poll(()=>new URL(page.url()).searchParams.get(relative==='all'?'planeringsallaar':'planeringsrelativar')).toBe(relative==='all'?'1':String(relative));
}
async function chooseProgramYear(page:Page,relative:number){
 const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches);
 await (mobile?board(page).getByRole('button',{name:`Åk ${relative}`,exact:true}):board(page).locator('.ppb-year').nth(relative-1)).click();
}
async function fullGym(page:Page,r:Cohort){await gym(page).getByRole('button',{name:'Visa hela planen',exact:true}).click();for(let i=0;i<6;i++)await expect(gcell(page,r,i)).toBeVisible();}
async function blockedGlobal(page:Page,oldURL:string,year:number){
 await bar(page).getByLabel('Planeringsläsår',{exact:true}).selectOption(String(year+1));await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(year));
 await bar(page).getByLabel('Planeringsskola',{exact:true}).selectOption('all');await expect(bar(page).getByLabel('Planeringsskola',{exact:true})).toHaveValue(fixture.unitId);
 await page.goBack();await expect(page.getByTestId('planning-navigation-notice')).toBeVisible();expect(page.url()).toBe(oldURL);
}
async function capture(page:Page,info:TestInfo,label:string){
 const geometry=await page.evaluate(()=>({document:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,viewport:innerWidth,
 controls:[...document.querySelectorAll('.gt-year-buttons button,.ppb-year-controls button,.ppb-year button')].map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height};}).filter(r=>r.w>0&&r.h>0),
 tables:[...document.querySelectorAll('.gt-table-scroll,.ppb-table-wrap')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,width:e.clientWidth,contain:getComputedStyle(e).contain};})}));
 expect(geometry.document).toBeLessThanOrEqual(geometry.client+1);expect(geometry.controls.filter(v=>v.w<44||v.h<44)).toEqual([]);
 geometry.tables.forEach(t=>{expect(t.left).toBeGreaterThanOrEqual(-1);expect(t.right).toBeLessThanOrEqual(geometry.viewport+1);});
 await info.attach(label+'-geometry.json',{body:JSON.stringify(geometry),contentType:'application/json'});
 const file=info.outputPath(label+'.png');await page.screenshot({path:file,fullPage:true});await info.attach(label+'.png',{path:file,contentType:'image/png'});
}

test.beforeAll(async({browserName},info)=>{
 expect(info.config.maxFailures).toBe(1);expect(info.config.workers).toBe(1);expect(info.project.retries).toBe(0);
 // External source-bound actual39/40 release is required before this command.
 const bundle=Object.fromEntries([['final38','phase5-38-api-final'],['performanceRollback','phase5-38-read-performance-rollback'],
 ['performanceFinal','phase5-38-read-performance-final'],['performanceApi','phase5-38-read-performance-api-final']].map(([k,f])=>[k,json(`work/pilot/results/${f}.json`)]));
 validateSearchDependencies(bundle);
 const rollback=json('work/pilot/results/phase5-40-search-details-rollback.json'),applied=json('work/pilot/results/phase5-40-search-details-apply.json'),final=json('work/pilot/results/phase5-40-search-details-final.json');
 const read=(file:string)=>readFileSync(path.join(root,file));validateSearchRollback(rollback,read);validateSearchApplied(applied,rollback,read);
 validateHistoricalSources(final,SEARCH_SOURCE_PATHS,historicalGitSource);expect(final.status).toBe('PASS');expect(final.complete).toBe(true);expect(final.mode).toBe('applied');
 expect(final.databaseRecoveryRequired).toBe(false);expect(final.fullApiStatus).toBe('PASS');expect(final.cleanupStatus).toBe('PASS');
 expect(searchCasesComplete(final.searchApi?.cases,SEARCH_API_CASES)).toBe(true);expect(searchTimingsComplete(final.searchApi?.samples)).toBe(true);expect(searchCleanupPreserved(final.cleanup)).toBe(true);
 SEARCH_SOURCE_PATHS.forEach(file=>expect(final.sourceHashes[file]).toBe(sha(read(file))));
 const proof=await verifySearchWorker(baseURL,bundle.performanceFinal),git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 expect(git(['status','--porcelain','--',...runtime,...tools])).toBe('');expect(git(['diff','--name-only',proof.buildRevision,'HEAD','--',...runtime])).toBe('');
 await info.attach('source-build-dependencies.json',{body:JSON.stringify({proof,browserName,sourceHashes:Object.fromEntries([...runtime,...tools].map(f=>[f,sha(read(f))])),
 externalActualPrerequisites:{contextCases:'C01–C08×2',listCases:'L01–L18×2',validatedBy:'root actual release pipeline; no intended-case PASS'},
 dependencyReports:{performance:sha(read('work/pilot/results/phase5-38-read-performance-final.json')),search:sha(read('work/pilot/results/phase5-40-search-details-final.json'))}}),contentType:'application/json'});
});
test.beforeEach(async({page})=>{
 if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');
 setupPending=false;nodePending=0;nodeUnknownStage=null;browserUnknown=false;completedActualRoutes=new WeakSet<Request>();
 fixture=undefined!;setupComplete=false;nodeUnknown=false;checks=[];dialogs=[];pending.clear();releases.length=0;

  browserActor = undefined!;
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
      if (browserActor) requestActors.set(request, { ...browserActor });
    }
  });
 page.on('response',r=>{pending.delete(r.request());if(!auditRequests.has(r.request())&&!controlledReplies.has(r.request())&&[SETUP,LIST,ROW,GYREAD,TERMS,TERMSREAD].includes(pathname(r))){const check=audit(r,pathname(r));void check.catch(()=>undefined);checks.push(check);}});
 page.on('dialog',async d=>{dialogs.push(d.type());await d.dismiss();});
  await installActualPassthrough(page);
 fixture=await ownedNode('creation',()=>createPlanningGymFixture());
 if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');
 browserActor=fixture.principal;setupPending=true;
 try{metadata=await ownedNode('setup',()=>fixture.setup(baseURL));}finally{setupPending=false;}
 if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');
 const reply=await request(baseURL,fixture.principal,SETUP);expect(reply.status).toBe(200);expect(await fixture.pairedPlanning(reply.correlationId,fixture.principal,'planning_year_selection_read')).toBe(true);
 setup=parsePlanningSetup(reply.body);setupComplete=true;
});
test.afterEach(async({page},info)=>{
 releases.splice(0).forEach(r=>r());
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
 if(!fixture&&!recoveryRequired&&nodePending===0&&!nodeUnknown&&!browserUnknown&&pending.size===0&&routesSettled&&pageClosed&&contextRoutesSettled&&routeJobsSettled&&contextClosed)return;
  const requireCompletion = async () => {
   if(recoveryRequired||!setupComplete||setupPending||nodePending>0||nodeUnknown||browserUnknown||pending.size>0||!routesSettled||!pageClosed||!contextRoutesSettled||!routeJobsSettled||!contextClosed){
    recoveryRequired=true;
    // No fresh DB snapshot while completion is unknown; original evidence stays owned.
    await info.attach('cleanup-deferred.json',{body:JSON.stringify({cleanupDeferred:true,databaseRecoveryRequired:true,
     setupComplete,setupPending,pendingNodeRequests:nodePending,unknownNodeRequest:nodeUnknown,nodeUnknownStage,
     unknownBrowserCompletion:browserUnknown,browserCompletionFailure, pendingRequests: pending.size,
        pendingRoutes: [...pending].map(request => browserRouteStates.get(request) ?? { ...routeMetadata(request), stage: 'seen' }),
        routesSettled, pageClosed, contextRoutesSettled, routeJobsSettled, routeJobsAtDrain, routeJobsRemaining: actualRouteJobs.size,
        prematureContextClose, contextClosed,
     ownedCustomerId:fixture?.customerId??null,ownedOrganizerId:fixture?.organizerId??null,foreignCustomerId:fixture?.foreignCustomerId??null,
     originalBusiness:fixture?.originalBusiness??null,fixtureExposed:!!fixture}),contentType:'application/json'});
    throw Error('OWNED_COMPLETION_UNKNOWN: root must verify owned completion before cleanup or another fixture');
   }
  };
  await requireCompletion();
 const outcomes=await Promise.allSettled(checks); await requireCompletion();
 try{const proof=await fixture.cleanup();await info.attach('cleanup.json',{body:JSON.stringify(proof),contentType:'application/json'});expect(searchCleanupPreserved(proof)).toBe(true);
 expect(Object.keys(proof.originalBusiness)).toHaveLength(15);expect(proof.finalBusiness).toEqual(proof.originalBusiness);expect(proof.gymYearRemaining.plans).toBe(0);
 }catch(error){await info.attach('cleanup-failure.json',{body:JSON.stringify({cleanupFailed:true,evidence:(error as {cleanupEvidence?:unknown}).cleanupEvidence??null}),contentType:'application/json'});throw error;}
 const failed=outcomes.find(o=>o.status==='rejected');if(failed?.status==='rejected')throw failed.reason;expect(dialogs).toEqual([]);
});

test('G01: tre verkliga kullar öppnar åk1/2/3 i både program och timplan',async({page},info)=>{
 for(const r of metadata.cohorts){const relative=metadata.planningYear-Number(r.startedOn.slice(0,4))+1;
  for(const view of ['programplan','timplan'] as const){const row=await enter(page,r,view);expect(row.relativeYear).toBe(relative);await visualYear(page,view,relative);
   const w=view==='programplan'?board(page):gym(page);await expect(w.locator(view==='programplan'?'.ppb-year-context':'.gt-year-context')).toContainText(`avser årskurs ${relative}`);
   await expect(w.locator('thead')).toContainText(`HT ${metadata.planningYear}`);await expect(w.locator('thead')).toContainText(`VT ${metadata.planningYear+1}`);
   await capture(page,info,`three-cohorts-${view}-${relative}`);
  }
 }
});
test('G02: program-åk2 sparar originalindex2 och hela sexvärdesdistributionen',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+1,before=await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId));
 await enter(page,r,'programplan',year);await visualYear(page,'programplan',2);
 const writes:ProgramplanTermWrite[]=[];page.on('request',q=>{if(pathname(q)===TERMS)writes.push(q.postDataJSON());});
 const response=page.waitForResponse(match(TERMS));await pcell(page,r,2).fill('14');await pcell(page,r,2).press('Enter');const reply=await response;expect(reply.status()).toBe(200);
 const saved=parseProgramplanTermReply(await reply.json());expect(writes).toHaveLength(1);expect(writes[0].planId).toBe(r.sourcePlanId);expect(writes[0].expectedRevision).toBe(before.revision);
 const expected=before.distribution.map(d=>d.rowKey===r.rowKey?{rowKey:d.rowKey,points:d.points.map((p,i)=>i===2?14:p)}:d);
 expect(writes[0].distribution).toEqual(expected);expect(saved.distribution).toEqual(expected);expect((await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId))).distribution).toEqual(expected);
 await expect(board(page)).toContainText('Allt sparat');await board(page).getByRole('button',{name:'Visa hela planen',exact:true}).click();
 for(let i=0;i<6;i++)await expect(pcell(page,r,i)).toHaveValue(String(i===2?14:r.pointTerms[i]));
 await board(page).getByRole('button',{name:'Visa planeringsårets del',exact:true}).click();await visualYear(page,'programplan',2);expect(writes).toHaveLength(1);
 await page.reload();await expect(board(page)).toBeVisible();await visualYear(page,'programplan',2);await expect(pcell(page,r,2)).toHaveValue('14');await capture(page,info,'program-index2-readback');
});
test('G03: GY-åk3 sparar index4 med fem dolda timvärden och frysta poäng kvar',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+2,before=await ownedNode('readback', () => fixture.readGym(r.planId)),state=await fixture.ownedState(r.planId);
 await enter(page,r,'timplan',year);await visualYear(page,'timplan',3);
 const waiting=page.waitForResponse(match(ROW));await gcell(page,r,4).fill('77');await gcell(page,r,4).press('Enter');const reply=await waiting;
 const command={planId:r.planId,expectedRevision:before.revision,rowKey:r.rowKey,hours:[11,22,33,44,77,66] as GymTimplanHours};
 expect(reply.status()).toBe(200);expect(reply.request().postDataJSON()).toEqual(command);parseGymTimplanRowReply(await reply.json(),command);
 await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat');const actual=await ownedNode('readback', () => fixture.readGym(r.planId));expect(actual.hours[r.rowKey]).toEqual(command.hours);expect(actual.source).toEqual(before.source);expect(actual.rows).toEqual(before.rows);
 const after=await fixture.ownedState(r.planId);expect(after.sourceHash).toBe(state.sourceHash);expect(after.classLinksHash).toBe(state.classLinksHash);
 await fullGym(page,r);for(let i=0;i<6;i++)await expect(gcell(page,r,i)).toHaveValue(String(command.hours[i]));await capture(page,info,'gym-index4-six-values');
});
test('G04: manuellt år och hela matrisen ändrar varken globalåret eller data',async({page},info)=>{
 const r=metadata.cohorts[1],state=await fixture.ownedState(r.planId);await enter(page,r,'timplan');await visualYear(page,'timplan',2);
 const writes:string[]=[];page.on('request',q=>{if([ROW,TERMS].includes(pathname(q)))writes.push(pathname(q));});
 await gym(page).getByRole('button',{name:'Åk 1',exact:true}).click();await visualYear(page,'timplan',1);await expect(gym(page).locator('.gt-year-context')).toContainText('en annan del');
 await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.planningYear));await page.reload();await visualYear(page,'timplan',1);
 await fullGym(page,r);await visualYear(page,'timplan','all');await page.reload();await visualYear(page,'timplan','all');
 await gym(page).getByRole('button',{name:'Visa planeringsårets del',exact:true}).click();await visualYear(page,'timplan',2);
 await page.goBack();const list=page.getByRole('region',{name:'Alla timplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');
 await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.planningYear));
 await list.getByRole('button',{name:/^Öppna /u}).click();await visualYear(page,'timplan',2);
 expect(writes).toEqual([]);expect(await fixture.ownedState(r.planId)).toEqual(state);await capture(page,info,'manual-whole-calendar-year');
});
test('G05: ändrad aktuell källstart kan inte ändra timplanens frysta årssnitt',async({page},info)=>{
 const r=metadata.cohorts[1],before=await ownedNode('readback', () => fixture.readGym(r.planId));await ownedNode('fixture-mutation', () => fixture.changeCurrentStart(r.planId));
 const state=await fixture.ownedState(r.planId);await enter(page,r,'timplan');await visualYear(page,'timplan',2);
 await expect(gym(page)).toContainText('Programplanen har ändrats');await expect(gym(page).locator('.gt-year-context')).toContainText(r.startedOn);
 const actual=await ownedNode('readback', () => fixture.readGym(r.planId));expect(actual.source).toEqual(before.source);expect(actual.hours).toEqual(before.hours);expect(actual.sourceChanged).toBe(true);
 await gym(page).getByRole('button',{name:/^Underlag: Programplan/u}).click();const dialog=page.getByRole('dialog',{name:'Sparat programunderlag',exact:true});
 await expect(dialog).toContainText(`HT ${Number(r.startedOn.slice(0,4))}`);await expect(dialog).toContainText(`VT ${Number(r.startedOn.slice(0,4))+3}`);
 await dialog.getByRole('button',{name:'Stäng underlaget',exact:true}).click();await capture(page,info,'frozen-start-current-changed');
 await gym(page).getByRole('button',{name:'Öppna programplan',exact:true}).click();await expect(board(page)).toBeVisible();await visualYear(page,'programplan','all');
 expect(new URL(page.url()).searchParams.get('programplan')).toBe(r.sourcePlanId);await expect(board(page).locator('.ppb-year-context')).toContainText(`${metadata.planningYear+5}-08-17`);
 await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.planningYear));expect(await fixture.ownedState(r.planId)).toEqual(state);
});
test('G06: klassbunden äldre timversion öppnas med samma frysta år trots nytt utkast',async({page},info)=>{
 const h=metadata.historyGym,r={...metadata.cohorts[2],offeringId:h.offeringId,sourcePlanId:h.sourcePlanId,planId:h.oldPlanId,query:h.query};
 const old=await fixture.timplanSnapshot(h.oldPlanId),newer=await fixture.timplanSnapshot(h.newPlanId),links=await fixture.classLinks();
 const row=await enter(page,r,'timplan');expect(row.application?.planId).toBe(h.oldPlanId);expect(row.underlag).toBe('class-bound');await visualYear(page,'timplan',1);
 expect(new URL(page.url()).searchParams.get('timplan')).toBe(h.oldPlanId);expect(new URL(page.url()).searchParams.get('timplansversion')).toBe('1');
 await expect(gym(page).locator('input.gt-term-input')).toHaveCount(0);expect(await fixture.timplanSnapshot(h.oldPlanId)).toEqual(old);expect(await fixture.timplanSnapshot(h.newPlanId)).toEqual(newer);expect(await fixture.classLinks()).toEqual(links);
 await page.reload();await visualYear(page,'timplan',1);expect(new URL(page.url()).searchParams.get('timplan')).toBe(h.oldPlanId);await capture(page,info,'bound-v1-new-v2');
});
test('G07: januari och april följer läsårsmodellen med konkret före-start-kontroll',async({page},info)=>{
 for(const r of await ownedNode('fixture-mutation', () => fixture.addSpringSources()))for(const view of ['programplan','timplan'] as const){
  await enter(page,r,view);await visualYear(page,view,1);const w=view==='programplan'?board(page):gym(page);
  await expect(w).toContainText(r.startedOn);await expect(w).toContainText(/före.*startdatum|före planversionens startdatum/u);
  await expect(w.locator('thead')).toContainText(`HT ${metadata.planningYear}`);await expect(w.locator('thead')).toContainText(`VT ${metadata.planningYear+1}`);
  const projection=projectGymYear(metadata.planningYear,{provenance:view==='programplan'?'program-version':'timplan-source',startedOn:r.startedOn,academicYear:null},r.pointTerms);
  expect(projection.termIndices).toEqual([0,1]);expect(projection.diagnostics).toContain('allocation-before-start');await capture(page,info,`spring-${view}-${r.startedOn}`);
 }
});
test('G08: år utanför kullens tre år visar hela sexmatrisen utan gissad åk1',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+5;for(const view of ['programplan','timplan'] as const){
  await enter(page,r,view,year);await visualYear(page,view,'all');const w=view==='programplan'?board(page):gym(page);
  await expect(w).toContainText('är okänd eller ligger utanför kullens tre år');for(let i=0;i<6;i++)await expect(view==='programplan'?pcell(page,r,i):gcell(page,r,i)).toBeVisible();
  await capture(page,info,`outside-three-years-${view}`);
 }
});
test('G09: huvudman läser rätt GY-år men får inga timskrivkontroller',async({page},info)=>{
 const r=metadata.cohorts[1],before=await fixture.ownedState(r.planId);const writes:string[]=[];page.on('request',q=>{if(pathname(q)===ROW)writes.push(q.url());});
 const actual=await ownedNode('readback', () => fixture.readGym(r.planId,fixture.hm));expect(actual.canPlan).toBe(false);await enter(page,r,'timplan',metadata.planningYear,fixture.hm);await visualYear(page,'timplan',2);
 await expect(gym(page).locator('input.gt-term-input')).toHaveCount(0);await gym(page).getByRole('button',{name:'Visa hela planen',exact:true}).click();
 expect(writes).toEqual([]);expect(await fixture.ownedState(r.planId)).toEqual(before);await capture(page,info,'hm-read-only-year');
});
test('G10: passerad programstart och arkiverad GY-plan behåller befintliga skrivlås',async({page},info)=>{
 const r=metadata.cohorts[0];await enter(page,r,'programplan');await expect(board(page)).toContainText('Elevkullen har börjat');await expect(board(page).locator('input[data-term]')).toHaveCount(0);
 await ownedNode('fixture-mutation', () => fixture.archive(r.planId));const before=await fixture.ownedState(r.planId);await enter(page,r,'timplan');await expect(gym(page)).toContainText('Utbildningen är arkiverad');await expect(gym(page).locator('input.gt-term-input')).toHaveCount(0);
 expect(await fixture.ownedState(r.planId)).toEqual(before);await capture(page,info,'started-archived-locks');
});
test('G11: held verklig timskrivning behåller år och köar ny inmatning med nästa CAS',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+1;await enter(page,r,'timplan',year);const before=await ownedNode('readback', () => fixture.readGym(r.planId)),held=gate(),writes:{expectedRevision:number;hours:GymTimplanHours}[]=[];
 await page.route('**'+ROW,async route=>{const command=route.request().postDataJSON();writes.push(command);const actual=await actualRouteFetch(route);expect(actual.status()).toBe(200);parseGymTimplanRowReply(await actual.json(),command);await audit(actual,ROW,command);
  if(writes.length===1){held.readyResolve(actual);await held.released;}await route.fulfill({response:actual});});
 await gcell(page,r,2).fill('70');await gcell(page,r,2).press('Enter');await held.ready;
 await expect(gym(page).getByRole('button',{name:'Åk 1',exact:true})).toBeDisabled();const oldURL=page.url();await blockedGlobal(page,oldURL,year);
 await gcell(page,r,2).fill('71');await gcell(page,r,2).press('Enter');expect(writes).toHaveLength(1);held.release();
 await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat');expect(writes).toHaveLength(2);expect(writes.map(w=>w.expectedRevision)).toEqual([before.revision,before.revision+1]);
 expect((await ownedNode('readback', () => fixture.readGym(r.planId))).hours[r.rowKey]).toEqual([11,22,71,44,55,66]);await visualYear(page,'timplan',2);await capture(page,info,'held-queue-context-block');
});
test('G12: verklig CAS409 ger jämförelse utan att ändra dolda timmar',async({page},info)=>{
 const r=metadata.cohorts[2];await enter(page,r,'timplan');const fresh=await ownedNode('fixture-mutation', () => fixture.writeHours(r.planId,[11,22,88,44,55,66]));const waiting=page.waitForResponse(match(ROW));
 await gcell(page,r,0).fill('72');await gcell(page,r,0).press('Enter');const conflict=await waiting;expect(conflict.status()).toBe(409);
 await expect(gym(page)).toContainText('Jämför sparade timmar');expect((await ownedNode('readback', () => fixture.readGym(r.planId))).hours[r.rowKey]).toEqual(fresh.hours[r.rowKey]);
 await gym(page).getByRole('button',{name:'Använd sparade värden',exact:true}).click();await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat');
 await fullGym(page,r);for(let i=0;i<6;i++)await expect(gcell(page,r,i)).toHaveValue(String(fresh.hours[r.rowKey][i]));await capture(page,info,'actual-cas-hidden-values');
});
test('G13: accepterat timsvar och readfail låser navigation tills faktisk återläsning',async({page},info)=>{
 const r=metadata.cohorts[2];await enter(page,r,'timplan');let writes=0;
 await page.route('**'+ROW,async route=>{writes++;const command=route.request().postDataJSON(),actual=await actualRouteFetch(route);expect(actual.status()).toBe(200);parseGymTimplanRowReply(await actual.json(),command);await audit(actual,ROW,command);controlledReplies.add(route.request());await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Kontrollerat transportfel efter faktiskt accepterad skrivning"}'});});
 await page.route('**'+GYREAD,async route=>{const actual=await actualRouteFetch(route);expect(actual.status()).toBe(200);parseGymTimplan(await actual.json(),r.planId);await audit(actual,GYREAD,route.request().postDataJSON());controlledReplies.add(route.request());await route.fulfill({status:503,contentType:'application/json',body:'{"error":"Kontrollerat transportfel efter faktisk återläsning"}'});});
 await gcell(page,r,0).fill('73');await gcell(page,r,0).press('Enter');await expect(gym(page)).toContainText('Sparstatus kunde inte läsas');const old=page.url();
 await expect(gym(page).getByRole('button',{name:'Använd sparade värden',exact:true})).toBeDisabled();await expect(gym(page).getByRole('button',{name:'Åk 2',exact:true})).toBeDisabled();await blockedGlobal(page,old,metadata.planningYear);
 expect((await ownedNode('readback', () => fixture.readGym(r.planId))).hours[r.rowKey][0]).toBe(73);expect(writes).toBe(1);await page.unroute('**'+GYREAD);
 await gym(page).getByRole('button',{name:'Läs aktuell timplan',exact:true}).click();await expect(gym(page).locator('.gt-save-state')).toHaveText('Allt sparat');expect(writes).toBe(1);
 await gym(page).getByRole('button',{name:'Åk 2',exact:true}).click();await visualYear(page,'timplan',2);await capture(page,info,'unknown-write-actual-recovery');
});
test('G14: program-blur före årsklick spärras genom faktiskt fullmatrisspar',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+1;await enter(page,r,'programplan',year);const before=await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId)),held=gate();let writes=0;
 await page.route('**'+TERMS,async route=>{writes++;const command=route.request().postDataJSON(),actual=await actualRouteFetch(route);expect(actual.status()).toBe(200);parseProgramplanTermReply(await actual.json());await audit(actual,TERMS,command);held.readyResolve(actual);await held.released;await route.fulfill({response:actual});});
 await pcell(page,r,2).fill('13');await chooseProgramYear(page,1);await held.ready;
 await expect(board(page)).toHaveAttribute('data-year','1');const oldURL=page.url();await blockedGlobal(page,oldURL,year);held.release();await expect(board(page)).toContainText('Allt sparat');
 expect(writes).toBe(1);const after=await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId));expect(after.distribution).toEqual(before.distribution.map(d=>d.rowKey===r.rowKey?{rowKey:d.rowKey,points:[5,10,13,20,23,27]}:d));
 await chooseProgramYear(page,1);await visualYear(page,'programplan',1);await board(page).getByRole('button',{name:'Visa planeringsårets del',exact:true}).click();await visualYear(page,'programplan',2);await capture(page,info,'program-blur-year-lock');
});
test('G15: aktiv nolltid och ofördelad cell förblir skilda över alla sex index',async({page},info)=>{
 const r=metadata.cohorts[2],expected:[number,null,number,number,number,number]=[0,null,33,44,55,66];await ownedNode('fixture-mutation', () => fixture.writeHours(r.planId,expected));const before=await fixture.ownedState(r.planId);
 await enter(page,r,'timplan');await fullGym(page,r);await expect(gcell(page,r,0)).toHaveValue('0');await expect(gcell(page,r,1)).toHaveValue('');
 await expect(gym(page).locator(`tr[data-row-key="${r.rowKey}"]`)).toContainText('1 kvar');await gym(page).getByRole('button',{name:'Visa bara ofördelade',exact:true}).click();await expect(gcell(page,r,0)).toBeVisible();
 expect((await ownedNode('readback', () => fixture.readGym(r.planId))).hours[r.rowKey]).toEqual(expected);expect(await fixture.ownedState(r.planId)).toEqual(before);
 const table=gym(page).getByRole('region',{name:'Skolans undervisningstid',exact:true});await table.focus();await expect(table).toBeFocused();await table.press('ArrowRight');await capture(page,info,'zero-unallocated-keyboard-scroll');
});
test('G16: programanalysens fokus är tillfälligt och återgång behåller planeringsåret',async({page},info)=>{
 const r=metadata.cohorts[2],year=metadata.planningYear+1,state=await fixture.ownedState(r.planId);await enter(page,r,'programplan',year);
 await program(page).getByRole('button',{name:/^Analys/u}).click();const analysis=program(page).getByRole('region',{name:'Analys av programplanen',exact:true});
 await analysis.getByRole('button',{name:'Flytta nivån →',exact:true}).first().click();await expect(board(page).locator('[data-analysis-target]')).toHaveCount(1);
 expect(new URL(page.url()).searchParams.get('planeringsrelativar')).toBe('2');await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(year));
 await board(page).getByRole('button',{name:'Visa planeringsårets del',exact:true}).click();await visualYear(page,'programplan',2);expect(await fixture.ownedState(r.planId)).toEqual(state);await capture(page,info,'analysis-focus-controlled-return');
});
test('G17: MFA-gränsen behåller programdraft och hela originalfördelningen',async({page},info)=>{
 const r=metadata.cohorts[2],before=await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId));await enter(page,r,'programplan',metadata.planningYear+1,fixture.noMfa);
 const wait=page.waitForResponse(match(TERMS));await pcell(page,r,2).fill('12');await pcell(page,r,2).press('Enter');expect((await wait).status()).toBe(403);
 await expect(board(page)).toContainText('engångskod');await expect(pcell(page,r,2)).toHaveValue('12');expect((await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId))).distribution).toEqual(before.distribution);await capture(page,info,'mfa-original-distribution');
});
test('G18: actual auditfel rullar tillbaka programskrivning med dolda index kvar',async({page},info)=>{
 const r=metadata.cohorts[2],before=await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId));await enter(page,r,'programplan',metadata.planningYear+1);await ownedNode('fixture-mutation', () => fixture.auditFailure('db','programplan_terms_changed'));
 try{const wait=page.waitForResponse(match(TERMS));await pcell(page,r,2).fill('11');await pcell(page,r,2).press('Enter');expect((await wait).status()).toBe(500);await expect(board(page)).toContainText('Kunde inte spara');await expect(pcell(page,r,2)).toHaveValue('11');}
 finally{await ownedNode('fixture-mutation', () => fixture.clearAuditFailure());}
 expect(await ownedNode('readback', () => fixture.readTerms(r.sourcePlanId))).toEqual(before);await capture(page,info,'audit-failure-original-six-indices');
});

// An unpinned legacy source has no canonical GY matrix; no positive read is fabricated.
test('G19: legacy-start är okänd och erbjuder explicit underlag utan gissad matris',async({page},info)=>{
 const r={...metadata.cohorts[2],offeringId:fixture.legacyOfferingId,sourcePlanId:fixture.legacyPlanId,query:'MISSING-BASIS-LEGACY'};
 const input=selection(r,'programplan'),wait=page.waitForResponse(match(LIST));browserActor=fixture.principal;
 await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto(address(input));await waitForHydration(page);const reply=await wait;expect(reply.status()).toBe(200);
 const list=parsePlanningList(await reply.json(),reply.request().postDataJSON(),setup);expect(list.rows).toHaveLength(1);expect(list.rows[0].relativeYear).toBeNull();expect(list.rows[0].source).toBeNull();
 const region=page.getByRole('region',{name:'Alla programplaner',exact:true});await expect(region).toHaveAttribute('aria-busy','false');await region.getByRole('button',{name:/^Öppna /u}).click();
 await expect(program(page).getByRole('region',{name:'Dina sparade fördjupningsval',exact:true})).toContainText('Äldre sparade val');
 await expect(board(page)).toHaveCount(0);await expect(program(page).locator('input[data-term]')).toHaveCount(0);await capture(page,info,'legacy-unknown-no-invented-matrix');
});
