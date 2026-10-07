// SOURCE-ONLY 05-42. Actual C16/L36/G38 Playwright reports are mandatory before setup.
// One worker, maxFailures1, retries0. Historical GR grade positions never prove an annual map.
// Held/failing replies always follow the complete actual audited Worker answer.
import {expect,test,type Page,type Response,type APIResponse,type Request,type Route,type TestInfo} from '@playwright/test';
import {readFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createPlanningOtherFixture} from '../../work/pilot/phase5-planning-year-other-fixtures.mjs';
import {verifySearchWorker,validateSearchDependencies,validateSearchRollback,validateSearchApplied,validateHistoricalSources,
 historicalGitSource,SEARCH_SOURCE_PATHS,SEARCH_API_CASES,searchCasesComplete,searchCleanupPreserved,searchTimingsComplete} from '../../work/pilot/verify-planning-year-search-details.mjs';
import {planningSelection,planningCleanupPreserved} from '../../work/pilot/verify-planning-year-api.mjs';
import {PLANNING_TABLES} from '../../work/pilot/apply-planning-year-migration.mjs';
import {parsePlanningSetup,parsePlanningSelection,parsePlanningList,parsePlanningOverview,planningAnnualMetrics,type PlanningSelection,type PlanningSetup} from '../lib/planning-year-contract.ts';
import {parseProtectedTimplan,parseTimplanCellReply,parseTimplanList} from '../lib/protected-timplan.ts';
import {waitForHydration} from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createPlanningOtherFixture>>;
type Metadata=Awaited<ReturnType<Fixture['setup']>>;
type Record=Metadata['grRecords'][number];
type Attachment={name:string;path?:string;body?:string};
type ActualResult={status:string;retry:number;attachments:Attachment[]};
type ActualCase={projectName:string;results:ActualResult[]};
type ActualSuite={suites?:ActualSuite[];specs?:{title:string;tests:ActualCase[]}[]};
const root=fileURLToPath(new URL('../../',import.meta.url)),baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3061';
const SETUP='/api/planering/urval',LIST='/api/planering/lista',OVERVIEW='/api/planering/oversikt',READ='/api/timplaner/lasa',CELL='/api/timplaner/cell',LEGACYLIST='/api/timplaner/lista';
const runtime=['web/app/protected-home.tsx','web/app/protected-timplan-workspace.tsx','web/app/protected-timplan.css','web/app/planning-context.tsx','web/app/planning-context.css',
 'web/lib/protected-plan-location.ts','web/lib/protected-timplan.ts','web/lib/planning-year-contract.ts','web/lib/planning-year-model.ts','web/app/protected-plan-list.tsx','web/app/protected-plan-list.css','web/app/protected-planning-overview.tsx'];
const tools=['work/pilot/phase5-planning-year-other-fixtures.mjs','web/e2e/phase5-planning-year-other.spec.ts',
 'work/pilot/phase5-planning-year-gym-fixtures.mjs','web/e2e/phase5-planning-year-gym.spec.ts','work/pilot/phase5-planning-year-list-fixtures.mjs',
 'web/e2e/phase5-planning-year-lists.spec.ts','web/e2e/phase5-planning-year-context.spec.ts','web/playwright.phase5-planning-year.config.ts'];
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex'),read=(file:string)=>readFileSync(path.join(root,file));
const json=(file:string)=>JSON.parse(read(file).toString());
const pathname=(r:{url:()=>string})=>new URL(r.url()).pathname;
const matches=(route:string)=>(r:Response)=>pathname(r)===route&&r.request().method()==='POST';
const workspace=(page:Page)=>page.getByTestId('protected-timplan-workspace');
const bar=(page:Page)=>page.getByRole('region',{name:'Planeringsval',exact:true});
const list=(page:Page)=>page.getByRole('region',{name:'Alla timplaner',exact:true});
let fixture:Fixture,metadata:Metadata,setup:PlanningSetup,actor:Fixture['principal'],setupComplete=false,nodeUnknown=false,recoveryRequired=false;
type NodeStage='creation'|'setup'|'request'|'fixture-mutation'|'readback';
let setupPending=false,nodePending=0,nodeUnknownStage:NodeStage|null=null,browserUnknown=false;
let audits:Promise<void>[]=[],dialogs:string[]=[];const pending=new Set<Request>(),controlled=new WeakSet<Request>(),actualDone=new WeakSet<Request>(),releases:(()=>void)[]=[];
// These operator pins name root-reviewed phase trees; no revision is trusted from a report alone.
const releaseInventories={
 C:{runtime:["web/app/planning-context.tsx","web/app/planning-context.css","web/app/context-switch.tsx","web/app/protected-programplan-flow.tsx","web/app/protected-programplan-lifecycle.tsx","web/app/school-year-picker.tsx","web/app/pupil-register-workspace.tsx"],tools:["web/e2e/phase5-planning-year-context.spec.ts","web/playwright.phase5-planning-year.config.ts"],spec:'web/e2e/phase5-planning-year-context.spec.ts',specSha:'aa6fc4a80b9d7c4458f1c2a7a7d61607c223f3e3ec48cd5dc7d41b0ef02cde11',approvedEnv:'PHASE5_CONTEXT_APPROVED_SOURCE_REVISION',attachment:'source-build.json'},
 L:{runtime:["web/app/protected-plan-list.tsx","web/app/protected-plan-list.css","web/app/protected-planning-overview.tsx","web/app/protected-programplan-list.tsx","web/app/protected-programplan-workspace.tsx","web/app/protected-programplan-flow.tsx","web/app/protected-programplan-board.tsx","web/app/protected-programplan.css","web/app/protected-gym-timplan-hours.tsx","web/app/protected-gym-timplan.css","web/app/protected-gym-timplan-workspace.tsx","web/app/protected-home.tsx","web/app/planning-context.tsx","web/app/planning-context.css","web/lib/protected-plan-location.ts"],tools:["work/pilot/phase5-planning-year-list-fixtures.mjs","web/e2e/phase5-planning-year-lists.spec.ts","web/playwright.phase5-planning-year.config.ts"],spec:'web/e2e/phase5-planning-year-lists.spec.ts',specSha:'b3fe77c521e871181d627bf5749165481cf61eaa8c4e85e81ee258eb6522d4f5',approvedEnv:'PHASE5_LIST_APPROVED_SOURCE_REVISION',attachment:'source-build-dependencies.json'},
 G:{runtime:["web/app/protected-home.tsx","web/app/planning-context.tsx","web/app/planning-context.css","web/lib/protected-plan-location.ts","web/lib/planning-year-model.ts","web/app/context-switch.tsx","web/app/protected-programplan-flow.tsx","web/app/protected-programplan-lifecycle.tsx","web/app/protected-plan-list.tsx","web/app/protected-plan-list.css","web/app/protected-planning-overview.tsx","web/app/protected-programplan-list.tsx","web/app/protected-programplan-workspace.tsx","web/app/protected-programplan-board.tsx","web/app/protected-programplan.css","web/app/protected-gym-timplan-workspace.tsx","web/app/protected-gym-timplan-hours.tsx","web/app/protected-gym-timplan.css"],tools:["work/pilot/phase5-planning-year-gym-fixtures.mjs","web/e2e/phase5-planning-year-gym.spec.ts","work/pilot/phase5-planning-year-list-fixtures.mjs","web/e2e/phase5-planning-year-lists.spec.ts","web/e2e/phase5-planning-year-context.spec.ts","web/playwright.phase5-planning-year.config.ts"],spec:'web/e2e/phase5-planning-year-gym.spec.ts',specSha:'b7a734c700a677c6b56e8958e637368f13e99edfa0fe092edecd83639c709d7d',approvedEnv:'PHASE5_GYM_APPROVED_SOURCE_REVISION',attachment:'source-build-dependencies.json'}
} as const;
const commonToolClosure=["work/pilot/phase5-planning-year-fixtures.mjs","work/pilot/phase5-gym-timplan-fixtures.mjs","work/pilot/phase5-programplan-browser-fixtures.mjs","work/pilot/verify-target.mjs","work/pilot/verify-programplan-locks.mjs","work/pilot/prepare-programplan-user-trial.mjs","work/pilot/apply-planning-year-migration.mjs","work/pilot/apply-gym-timplan-migration.mjs","work/pilot/verify-programplan-api.mjs","work/pilot/verify-planning-year-api.mjs","work/pilot/apply-planning-year-grants.mjs","supabase/tests/phase5_programplan_drafts.test.sql","supabase/migrations/20261006120000_phase5_planning_year_reads.sql","supabase/migrations/20261006121000_phase5_worker_planning_year_reads.sql","web/e2e/helpers/keycloak.ts","web/playwright.phase5-planning-year.config.ts","web/scripts/run-mode.mjs","web/scripts/preview-worker.mjs","web/scripts/preview-worker-modules.mjs","web/package.json","web/package-lock.json"] as const;
const buildRoots=['web/app','web/lib','web/components','web/hooks','web/public','web/package.json','web/package-lock.json','web/vite.config.ts','web/tsconfig.json'];
const gitBytes=(revision:string,file:string)=>execFileSync('git',['show',`${revision}:${file}`],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:32*1024*1024});
function historicalManifest(revision:string,paths:readonly string[]){
 const entries=execFileSync('git',['ls-tree','-r','-z',revision,'--',...paths],{cwd:root,stdio:['ignore','pipe','ignore'],maxBuffer:8*1024*1024}).toString().split('\0').filter(Boolean);
 return entries.map(entry=>{const match=/^(100644|100755) blob [a-f0-9]{40}\t(.+)$/u.exec(entry);if(!match)throw Error('EXTERNAL_TREE_NONREGULAR');return match[2];}).sort();
}
function historicalBuildClosure(source:string,build:string){
 const keep=(file:string)=>!file.includes('/e2e/')&&!/\.test\.[^/]+$/u.test(file),before=historicalManifest(source,buildRoots).filter(keep),after=historicalManifest(build,buildRoots).filter(keep);
 expect(before.length).toBeGreaterThan(0);expect(after).toEqual(before);
 return hash(Buffer.from(JSON.stringify(before.map(file=>{const bytes=gitBytes(source,file);expect(hash(gitBytes(build,file))).toBe(hash(bytes));return [file,hash(bytes)];}))));
}
type ExternalCleanup={originalBusiness:{[table:string]:{count:number;sha256:string}};finalBusiness:{[table:string]:{count:number;sha256:string}};originalAuditHash:string;finalAuditHash:string;originalIdentityHash:string;finalIdentityHash:string;listRemaining?:{classes:number;bindings:number;versions:number};gymYearRemaining?:{plans:number}};
function externalCleanup(value:ExternalCleanup,prefix:keyof typeof releaseInventories){
 expect(planningCleanupPreserved(value)).toBe(true);
 for(const field of ['originalBusiness','finalBusiness'] as const){
  expect(Object.keys(value[field]).sort()).toEqual([...PLANNING_TABLES].sort());
  for(const row of Object.values(value[field]) as {count:number;sha256:string}[]){expect(Object.keys(row).sort()).toEqual(['count','sha256']);expect(Number.isSafeInteger(row.count)&&row.count>=0).toBe(true);expect(row.sha256).toMatch(/^[a-f0-9]{64}$/u);}
 }
 expect(value.finalBusiness).toEqual(value.originalBusiness);
 for(const [before,after]of [['originalAuditHash','finalAuditHash'],['originalIdentityHash','finalIdentityHash']] as const){expect(value[before]).toMatch(/^[a-f0-9]{64}$/u);expect(value[after]).toBe(value[before]);}
 if(prefix!=='C')expect(value.listRemaining).toEqual({classes:0,bindings:0,versions:0});
 if(prefix==='G')expect(value.gymYearRemaining).toEqual({plans:0});
}
function safeAttachment(a:Attachment){
 if(a.path){const p=realpathSync(path.resolve(root,a.path));if(!p.startsWith(path.join(root,'web/test-results')+path.sep)&&!p.startsWith(path.join(root,'work/pilot/results')+path.sep))throw Error('EXTERNAL_ATTACHMENT_SCOPE');return JSON.parse(readFileSync(p,'utf8'));}
 if(typeof a.body==='string')return JSON.parse(Buffer.from(a.body,'base64').toString());
 throw Error('EXTERNAL_ATTACHMENT_MISSING');
}
function validateActualRelease(file:string|undefined,prefix:keyof typeof releaseInventories,count:number){
 const inventory=releaseInventories[prefix],approved=process.env[inventory.approvedEnv];
 if(!approved||!/^[a-f0-9]{40}$/u.test(approved))throw Error('APPROVED_PHASE_SOURCE_REQUIRED');
 if(!file)throw Error('ACTUAL_RELEASE_REQUIRED');const full=realpathSync(path.resolve(root,file));
 if(!full.startsWith(path.join(root,'web/test-results')+path.sep)&&!full.startsWith(path.join(root,'work/pilot/results')+path.sep))throw Error('ACTUAL_RELEASE_SCOPE');
 const bytes=readFileSync(full),report=JSON.parse(bytes.toString());
 expect(report.errors).toEqual([]);expect(report.stats.unexpected).toBe(0);expect(report.stats.skipped).toBe(0);expect(report.stats.flaky).toBe(0);
 expect(report.config.workers).toBe(1);expect(report.config.maxFailures).toBe(1);report.config.projects.forEach((p:{retries:number})=>expect(p.retries).toBe(0));
 const found:{title:string;entry:ActualCase}[]=[];
 const walk=(suite:ActualSuite)=>{suite.specs?.forEach(s=>{if(new RegExp(`^${prefix}\\d{2}:`,'u').test(s.title))s.tests.forEach(entry=>found.push({title:s.title,entry}));});suite.suites?.forEach(walk);};report.suites.forEach(walk);
 expect(found).toHaveLength(count*2);const projects=['planning-year-desktop','planning-year-phone'],pairs=new Set<string>(),proofs=new Map<string,{sourceRevision:string;buildRevision:string;sourceHashes:unknown;runtimeClosureSha256:string;toolClosureSha256:string}>();
 for(const {title,entry}of found){
  const n=Number(title.slice(1,3));expect(n).toBeGreaterThanOrEqual(1);expect(n).toBeLessThanOrEqual(count);expect(projects).toContain(entry.projectName);
  const pair=`${entry.projectName}:${n}`;expect(pairs.has(pair)).toBe(false);pairs.add(pair);expect(entry.results).toHaveLength(1);
  const result=entry.results[0];expect(result.status).toBe('passed');expect(result.retry).toBe(0);
  expect(result.attachments.some(a=>/cleanup-(?:deferred|failure)/u.test(a.name))).toBe(false);
  const cleanups=result.attachments.filter(a=>a.name==='cleanup.json');expect(cleanups).toHaveLength(1);externalCleanup(safeAttachment(cleanups[0]),prefix);
  const attachments=result.attachments.filter(a=>a.name==='source-build.json'||a.name==='source-build-dependencies.json');
  for(const a of attachments){
   expect(a.name).toBe(inventory.attachment);expect(proofs.has(entry.projectName)).toBe(false);
   const evidence=safeAttachment(a),proof=evidence.proof??evidence;expect(proof.sourceRevision).toBe(approved);expect(proof.buildRevision).toMatch(/^[a-f0-9]{40}$/u);
   const paths=[...inventory.runtime,...inventory.tools];expect(Object.keys(evidence.sourceHashes).sort()).toEqual([...paths].sort());
   for(const file of paths){expect(evidence.sourceHashes[file]).toMatch(/^[a-f0-9]{64}$/u);expect(evidence.sourceHashes[file]).toBe(hash(gitBytes(approved,file)));}
   expect(evidence.sourceHashes[inventory.spec]).toBe(inventory.specSha);
   for(const file of inventory.runtime)expect(hash(gitBytes(proof.buildRevision,file))).toBe(hash(gitBytes(approved,file)));
   const closure=[...new Set([...commonToolClosure,...inventory.tools,...(prefix==='C'?[]:['work/pilot/phase5-planning-year-search-fixtures.mjs','work/pilot/phase5-planning-year-list-fixtures.mjs',...SEARCH_SOURCE_PATHS]),
    ...(prefix==='G'?['work/pilot/phase5-planning-year-gym-fixtures.mjs',releaseInventories.C.spec,releaseInventories.L.spec]:[])])].sort();
   expect(historicalManifest(approved,closure)).toEqual(closure);
   const toolClosureSha256=hash(Buffer.from(JSON.stringify(closure.map(file=>[file,hash(gitBytes(approved,file))]))));
   // Extra predecessor specs belong to this approved phase tree; only each
   // direct report's own guarded spec uses its phase-specific fixed pin.
   if(prefix!=='C')expect(evidence.dependencyReports).toEqual({performance:hash(read('work/pilot/results/phase5-38-read-performance-final.json')),search:hash(read('work/pilot/results/phase5-40-search-details-final.json'))});
   proofs.set(entry.projectName,{sourceRevision:approved,buildRevision:proof.buildRevision,sourceHashes:evidence.sourceHashes,runtimeClosureSha256:historicalBuildClosure(approved,proof.buildRevision),toolClosureSha256});
  }
 }
 for(const project of projects)for(let n=1;n<=count;n++)expect(pairs.has(`${project}:${n}`)).toBe(true);
 expect([...proofs.keys()].sort()).toEqual([...projects].sort());const own=proofs.get(projects[0])!;expect(proofs.get(projects[1])).toEqual(own);
 return {reportSha256:hash(bytes),cases:found.length,approvedSourceRevision:approved,workerBuildRevision:own.buildRevision,runtimeClosureSha256:own.runtimeClosureSha256,toolClosureSha256:own.toolClosureSha256};
}
async function ownedNode<T>(stage:NodeStage,operation:()=>Promise<T>):Promise<T>{
 if(recoveryRequired||nodeUnknown)throw Error('OWNED_RECOVERY_REQUIRED');nodePending++;
 try{return await operation();}catch{nodeUnknown=true;nodeUnknownStage??=stage;throw Error('OWNED_NODE_COMPLETION_UNKNOWN');}finally{nodePending--;}
}
async function nodeRequest(...args:Parameters<Fixture['request']>){return ownedNode('request',()=>fixture.request(...args));}
async function audit(reply:Response|APIResponse,route:string,command?:{planId:string}){
 expect(reply.headers()['cache-control']).toBe('no-store');const corr=reply.headers()['x-correlation-id'];expect(corr).toBeTruthy();
 if(reply.status()!==200){expect((await ownedNode('readback',()=>fixture.events(corr))).filter((e:{outcome:string})=>e.outcome==='ok')).toEqual([]);return;}
 if([SETUP,LIST,OVERVIEW].includes(route)){expect(await ownedNode('readback',()=>fixture.pairedPlanning(corr,actor,route===SETUP?'planning_year_selection_read':route===LIST?'planning_year_list_read':'planning_year_overview_read'))).toBe(true);return;}
 if(route===LEGACYLIST){const input=(reply as Response).request().postDataJSON();parseTimplanList(await reply.json(),input.page);expect(await ownedNode('readback',()=>fixture.pairedGym(corr,actor,'timplan_list_read',null,'timplan_collection'))).toBe(true);return;}
 const input=command??(reply as Response).request().postDataJSON();expect(await ownedNode('readback',()=>fixture.pairedGym(corr,actor,route===CELL?'timplan_cell_changed':'timplan_read',input.planId))).toBe(true);
}
function selection(kind:Record['kind'],query:string,unitId:string|null,year=metadata.otherYear,patch:Partial<PlanningSelection>={}):PlanningSelection{
 return parsePlanningSelection(planningSelection(year,{view:'timplan',schoolform:kind,unitId,query,status:'all',cohortRelation:'all',archive:'all',...patch}));
}
function address(q:PlanningSelection){return '/?'+new URLSearchParams({vy:'timplaner',planeringslasar:String(q.schoolYear),planeringsskola:q.unitId??'all',planeringsform:q.schoolform,
 planeringssok:q.query,planeringsstatus:q.status,planeringskull:q.cohortRelation,planeringsarkiv:q.archive,planeringssida:String(q.page),planeringssort:q.sort,planeringsriktning:q.direction,
 ...(q.selectionRevision?{planeringsrevision:q.selectionRevision}:{})});}
async function enter(page:Page,q:PlanningSelection,session=fixture.principal){
 actor=session;await fixture.cookies(page.context(),session,baseURL);const waiting=page.waitForResponse(matches(LIST));await page.goto(address(q));await waitForHydration(page);
 const response=await waiting;expect(response.status()).toBe(200);const data=parsePlanningList(await response.json(),response.request().postDataJSON(),setup);
 expect(await ownedNode('readback',()=>fixture.metadataMatches(data.rows))).toBe(true);await expect(list(page)).toHaveAttribute('aria-busy','false');return data;
}
async function openBound(page:Page,r:Record,year=metadata.otherYear,session=fixture.principal){
 const data=await enter(page,selection(r.kind,r.query,r.unitId,year),session);expect(data.rows).toHaveLength(1);expect(data.rows[0].plan?.id).toBe(r.planId);
 await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page).getByTestId('other-year-binding')).toBeVisible();return data.rows[0];
}
async function currentMatrix(page:Page,r:Record,year=metadata.otherYear){
 await enter(page,selection('grundskola',r.query,r.unitId,year));await workspace(page).getByRole('button',{name:'Välj aktuell utkastmatris',exact:true}).click();await expect(workspace(page)).toHaveAttribute('aria-busy','false');
 const target=workspace(page).getByRole('button',{name:new RegExp(`^Öppna aktuell utkastmatris, ${r.name}, .*version 2$`,'u')});
 for(let n=0;n<10&&await target.count()===0;n++){
  const next=workspace(page).getByRole('navigation',{name:'Utkastmatrisernas sidor',exact:true}).getByRole('button',{name:'Nästa',exact:true});
  await expect(next).toBeEnabled();const waiting=page.waitForResponse(matches('/api/timplaner/lista'));await next.click();expect((await waiting).status()).toBe(200);await expect(workspace(page)).toHaveAttribute('aria-busy','false');
 }
 await expect(target).toHaveCount(1);await target.click();await expect(workspace(page).getByTestId('other-current-matrix')).toBeVisible();
 await expect(workspace(page)).toHaveAttribute('data-plan-id',r.currentPlanId);
}
async function edit(page:Page,oldValue=555,newValue=777){
 await workspace(page).getByRole('button',{name:`Ändra Matematik, Åk 8, ${oldValue} timmar`,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Ändra undervisningstid',exact:true});await dialog.getByLabel('Timmar',{exact:true}).fill(String(newValue));return dialog;
}
async function blocked(page:Page,url:string){
 await bar(page).getByLabel('Planeringsläsår',{exact:true}).selectOption(String(metadata.otherYear+1));await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.otherYear));
 await bar(page).getByLabel('Planeringsskola',{exact:true}).selectOption('all');await expect(bar(page).getByLabel('Planeringsskola',{exact:true})).toHaveValue(fixture.nonGymUnitId);
 await page.goBack();await expect(page.getByTestId('planning-navigation-notice')).toBeVisible();expect(page.url()).toBe(url);
}
function hold(){let resolve!:(r:APIResponse)=>void,release!:()=>void;const ready=new Promise<APIResponse>(r=>{resolve=r;}),released=new Promise<void>(r=>{release=r;});releases.push(release);return {ready,released,resolve,release};}
async function completeActual(route:Route){
 const request=route.request();controlled.add(request);let actual:APIResponse,body:unknown;
 try{actual=await route.fetch();body=await actual.json();}catch{browserUnknown=true;throw Error('OWNED_ROUTE_COMPLETION_UNKNOWN');}
 const input=request.postDataJSON();expect(actual.status()).toBe(200);
 if(pathname(request)===READ)parseProtectedTimplan(body,input.planId);
 else if(pathname(request)===CELL)parseTimplanCellReply(body,{...input,columnCount:input.planId===metadata.grRecords[0].currentPlanId?3:1});
 await audit(actual,pathname(request),input);actualDone.add(request);pending.delete(request);return actual;
}
async function capture(page:Page,info:TestInfo,label:string){
 const geometry=await page.evaluate(()=>({document:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,viewport:innerWidth,
 tables:[...document.querySelectorAll('.pt-matrix-scroll,.plan-list-scroll')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,scroll:e.scrollWidth,width:e.clientWidth};})}));
 expect(geometry.document).toBeLessThanOrEqual(geometry.client+1);geometry.tables.forEach(t=>{expect(t.left).toBeGreaterThanOrEqual(-1);expect(t.right).toBeLessThanOrEqual(geometry.viewport+1);});
 await info.attach(label+'-geometry.json',{body:JSON.stringify(geometry),contentType:'application/json'});const file=info.outputPath(label+'.png');await page.screenshot({path:file,fullPage:true});await info.attach(label+'.png',{path:file,contentType:'image/png'});
}

test.beforeAll(async({browserName},info)=>{
 expect(info.config.maxFailures).toBe(1);expect(info.config.workers).toBe(1);expect(info.project.retries).toBe(0);
 const actualPrerequisites={context:validateActualRelease(process.env.PHASE5_CONTEXT_ACTUAL_REPORT,'C',8),lists:validateActualRelease(process.env.PHASE5_LIST_ACTUAL_REPORT,'L',18),gym:validateActualRelease(process.env.PHASE5_GYM_ACTUAL_REPORT,'G',19)};
 const bundle=Object.fromEntries([['final38','phase5-38-api-final'],['performanceRollback','phase5-38-read-performance-rollback'],['performanceFinal','phase5-38-read-performance-final'],['performanceApi','phase5-38-read-performance-api-final']].map(([k,f])=>[k,json(`work/pilot/results/${f}.json`)]));
 validateSearchDependencies(bundle);const rollback=json('work/pilot/results/phase5-40-search-details-rollback.json'),applied=json('work/pilot/results/phase5-40-search-details-apply.json'),final=json('work/pilot/results/phase5-40-search-details-final.json');
 validateSearchRollback(rollback,read);validateSearchApplied(applied,rollback,read);validateHistoricalSources(final,SEARCH_SOURCE_PATHS,historicalGitSource);
 expect(final.status).toBe('PASS');expect(final.complete).toBe(true);expect(final.mode).toBe('applied');expect(final.databaseRecoveryRequired).toBe(false);expect(final.fullApiStatus).toBe('PASS');expect(final.cleanupStatus).toBe('PASS');
 expect(searchCasesComplete(final.searchApi?.cases,SEARCH_API_CASES)).toBe(true);expect(searchTimingsComplete(final.searchApi?.samples)).toBe(true);expect(searchCleanupPreserved(final.cleanup)).toBe(true);
 SEARCH_SOURCE_PATHS.forEach(file=>expect(final.sourceHashes[file]).toBe(hash(read(file))));
 const proof=await verifySearchWorker(baseURL,bundle.performanceFinal),git=(args:string[])=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 expect(git(['status','--porcelain','--',...runtime,...tools])).toBe('');expect(git(['diff','--name-only',proof.buildRevision,'HEAD','--',...runtime])).toBe('');
 await info.attach('source-build-dependencies.json',{body:JSON.stringify({proof,browserName,actualPrerequisites,sourceHashes:Object.fromEntries([...runtime,...tools].map(f=>[f,hash(read(f))]))}),contentType:'application/json'});
});
test.beforeEach(async({page})=>{
 if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');fixture=undefined!;setupComplete=false;setupPending=false;nodePending=0;nodeUnknown=false;nodeUnknownStage=null;browserUnknown=false;audits=[];dialogs=[];pending.clear();releases.length=0;
 page.on('request',r=>{if(pathname(r).startsWith('/api/'))pending.add(r);});
 page.on('requestfailed',r=>{if(actualDone.has(r))pending.delete(r);});
 page.on('response',r=>{pending.delete(r.request());if(!controlled.has(r.request())&&[SETUP,LIST,OVERVIEW,READ,CELL,LEGACYLIST].includes(pathname(r))){const promise=audit(r,pathname(r));void promise.catch(()=>undefined);audits.push(promise);}});
 page.on('dialog',async d=>{dialogs.push(d.type());await d.dismiss();});
 fixture=await ownedNode('creation',()=>createPlanningOtherFixture());if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');
 actor=fixture.principal;setupPending=true;try{metadata=await ownedNode('setup',()=>fixture.setup(baseURL));}finally{setupPending=false;}
 if(recoveryRequired)throw Error('OWNED_RECOVERY_REQUIRED');
 const reply=await nodeRequest(baseURL,actor,SETUP);expect(reply.status).toBe(200);expect(await ownedNode('readback',()=>fixture.pairedPlanning(reply.correlationId,actor,'planning_year_selection_read'))).toBe(true);setup=parsePlanningSetup(reply.body);setupComplete=true;
});
test.afterEach(async({page},info)=>{
 releases.splice(0).forEach(r=>r());let routesSettled=false,contextClosed=false;
 try{await page.unrouteAll({behavior:'wait'});routesSettled=true;}catch{browserUnknown=true;}
 try{await page.context().close();contextClosed=true;}catch{browserUnknown=true;}
 if(!fixture&&!recoveryRequired&&nodePending===0&&!nodeUnknown&&!browserUnknown&&pending.size===0&&routesSettled&&contextClosed)return;
 const requireCompletion=async()=>{
  if(recoveryRequired||!setupComplete||setupPending||nodePending>0||nodeUnknown||browserUnknown||pending.size>0||!routesSettled||!contextClosed){
   recoveryRequired=true;
   await info.attach('cleanup-deferred.json',{body:JSON.stringify({cleanupDeferred:true,databaseRecoveryRequired:true,
    setupComplete,setupPending,pendingNodeRequests:nodePending,unknownNodeRequest:nodeUnknown,nodeUnknownStage,
    unknownBrowserCompletion:browserUnknown,pendingRequests:pending.size,routesSettled,contextClosed,
    ownedCustomerId:fixture?.customerId??null,ownedOrganizerId:fixture?.organizerId??null,foreignCustomerId:fixture?.foreignCustomerId??null,
    originalBusiness:fixture?.originalBusiness??null,fixtureExposed:!!fixture}),contentType:'application/json'});
   throw Error('OWNED_COMPLETION_UNKNOWN: root must verify owned completion before cleanup or another fixture');
  }
 };
 await requireCompletion();
 // Whole context closure freezes the existing audit set. Recheck after settling;
 // an audit's rejected owned read can establish new unknown completion.
 const outcomes=await Promise.allSettled(audits);await requireCompletion();
 try{const proof=await fixture.cleanup();await info.attach('cleanup.json',{body:JSON.stringify(proof),contentType:'application/json'});expect(searchCleanupPreserved(proof)).toBe(true);
  expect(Object.keys(proof.originalBusiness)).toHaveLength(15);expect(proof.finalBusiness).toEqual(proof.originalBusiness);expect(proof.otherYearRemaining).toEqual({plans:0,offerings:0,classes:0});
 }catch(error){recoveryRequired=true;await info.attach('cleanup-failure.json',{body:JSON.stringify({cleanupFailed:true,evidence:(error as {cleanupEvidence?:unknown}).cleanupEvidence??null}),contentType:'application/json'});throw error;}
 const failed=outcomes.find(r=>r.status==='rejected');if(failed?.status==='rejected')throw failed.reason;expect(dialogs).toEqual([]);
});

test('O01: GR åk8 binder två verkliga klasser till exakt fastställd v1 trots nyare v2',async({page},info)=>{
 const r=metadata.grRecords[0],row=await openBound(page,r);expect(row.application).toEqual({schoolYear:metadata.otherYear,planId:r.planId,version:1,columnId:'ak8'});
 expect(new Set(row.classes.map(c=>c.id))).toEqual(new Set(r.classIds));expect(row.classes.every(c=>c.unitId===r.unitId&&c.offeringId===r.offeringId)).toBe(true);
 expect(row.columnMap).toEqual({kind:'unknown'});expect(row.diagnostics).toContain('missing-class');expect(planningAnnualMetrics(row,metadata.otherYear).hours.value).toBeNull();
 await expect(workspace(page).getByTestId('other-column-map-unknown')).toBeVisible();await expect(workspace(page).locator('thead')).toContainText('Lagrad kolumn 2');
 await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);await capture(page,info,'gr-bound-v1-unknown');
});
test('O02: nytt år ger verklig åk9-bindning med samma v1 och aldrig klassens startår',async({page})=>{
 const r=metadata.grRecords[0];await openBound(page,r);const wait=page.waitForResponse(matches(LIST));await bar(page).getByLabel('Planeringsläsår',{exact:true}).selectOption(String(metadata.otherYear+1));
 const reply=await wait,data=parsePlanningList(await reply.json(),reply.request().postDataJSON(),setup);expect(data.rows).toHaveLength(1);expect(data.rows[0].application?.columnId).toBe('ak9');expect(data.rows[0].plan?.id).toBe(r.planId);
 await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page).getByTestId('other-year-binding')).toContainText('9');await expect(workspace(page).getByTestId('other-column-map-unknown')).toBeVisible();
});
test('O03: year+1 utan bindning visar konkret lucka utan automatisk progression',async({page})=>{
 const r=metadata.grRecords[1],state=await ownedNode('readback',()=>fixture.ownedState(r.planId)),data=await enter(page,selection('grundskola',r.query,r.unitId,metadata.otherYear+1));
 expect(data.rows).toHaveLength(1);expect(data.rows[0].application).toBeNull();expect(data.rows[0].diagnostics).toContain('missing-binding');expect(planningAnnualMetrics(data.rows[0],metadata.otherYear).hours.value).toBeNull();
 await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page)).toContainText(/sakna|bindning/iu);await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);expect(await ownedNode('readback',()=>fixture.ownedState(r.planId))).toEqual(state);
});
test('O04: historisk grade-reorder behåller råa positioner och okänd karta',async({page},info)=>{
 const r=metadata.grRecords[0],before=await ownedNode('readback',()=>fixture.ownedState(r.planId));await ownedNode('fixture-mutation',()=>fixture.reorderGrades(r.planId));const row=await openBound(page,r);
 expect(row.application?.columnId).toBe('ak8');expect(row.columnMap).toEqual({kind:'unknown'});await expect(workspace(page).locator('thead')).toContainText('Lagrad kolumn 1');
 await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);expect(await ownedNode('readback',()=>fixture.ownedState(r.planId))).toEqual(before);await capture(page,info,'historical-position-reorder');
});
test('O05: aktuell explicit utkastmatris sparar index1 med övriga kolumner och fryst v1 kvar',async({page},info)=>{
 const r=metadata.grRecords[0],frozen=await ownedNode('readback',()=>fixture.ownedState(r.planId)),links=await ownedNode('readback',()=>fixture.ownedState(r.currentPlanId));await currentMatrix(page,r);
 await workspace(page).getByLabel('Visa årskurs',{exact:true}).selectOption('1');await expect(workspace(page).locator('thead')).toContainText('Åk 8');await expect(workspace(page).locator('thead')).not.toContainText('Åk 7');
 const before=await ownedNode('readback',()=>fixture.readOther(r.currentPlanId)),dialog=await edit(page),wait=page.waitForResponse(matches(CELL));await dialog.getByRole('button',{name:'Spara ändring',exact:true}).click();const reply=await wait;
 const command={planId:r.currentPlanId,expectedRevision:before.revision,rowId:'matematik',columnIndex:1,hours:777};expect(reply.status()).toBe(200);expect(reply.request().postDataJSON()).toEqual(command);parseTimplanCellReply(await reply.json(),{...command,columnCount:3});
 expect((await ownedNode('readback',()=>fixture.readOther(r.currentPlanId))).cells.matematik).toEqual([444,777,666]);expect(await ownedNode('readback',()=>fixture.ownedState(r.planId))).toEqual(frozen);expect((await ownedNode('readback',()=>fixture.ownedState(r.currentPlanId))).classLinksHash).toBe(links.classLinksHash);
 await workspace(page).getByLabel('Visa årskurs',{exact:true}).selectOption('all');await expect(workspace(page).locator('thead')).toContainText('Åk 7');await expect(workspace(page).locator('thead')).toContainText('Åk 9');
 await expect(workspace(page).getByTestId('other-current-matrix')).toBeVisible();await capture(page,info,'current-explicit-index1');
});
test('O06: URL Back reload återvaliderar historisk version och kan inte uppfinna current-mode',async({page})=>{
 const r=metadata.grRecords[0];await openBound(page,r);const url=page.url();expect(new URL(url).searchParams.get('ovrigtimplan')).toBe(r.planId);await page.reload();await expect(workspace(page).getByTestId('other-year-binding')).toBeVisible();
 await page.goBack();await expect(list(page)).toHaveAttribute('aria-busy','false');await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page).getByTestId('other-year-binding')).toBeVisible();
 await page.goto(url.replace(r.planId,r.currentPlanId));await expect(workspace(page).getByTestId('other-current-matrix')).toHaveCount(0);await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
});
test('O07: explicit aktuell matris blir inte falsk historisk årsdel efter reload',async({page})=>{
 const r=metadata.grRecords[0];await currentMatrix(page,r,metadata.otherYear+1);await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.otherYear+1));await page.reload();await expect(workspace(page).getByTestId('other-current-matrix')).toHaveCount(0);await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
});
test('O08: GR52 pagineras 50+2 och lokal kod efter första sidan söks på servern',async({page},info)=>{
 const q=selection('grundskola',metadata.grQuery,fixture.nonGymUnitId),data=await enter(page,q);expect(data.count).toBe(52);expect(data.rows).toHaveLength(50);
 const waiting=page.waitForResponse(matches(LIST));await list(page).getByRole('button',{name:'Nästa sida',exact:true}).click();const reply=await waiting,next=parsePlanningList(await reply.json(),reply.request().postDataJSON(),setup);
 expect(next.count).toBe(52);expect(next.rows).toHaveLength(2);expect(next.rows.some(r=>r.offeringId===metadata.grRecords[51].offeringId)).toBe(true);
 const search=page.waitForResponse(r=>matches(LIST)(r)&&r.request().postDataJSON().query===metadata.grLastCode);await list(page).getByLabel('Sök utbildning',{exact:true}).fill(metadata.grLastCode);
 const found=await search,parsed=parsePlanningList(await found.json(),found.request().postDataJSON(),setup);expect(parsed.count).toBe(1);expect(parsed.rows[0].offeringId).toBe(metadata.grRecords[51].offeringId);await capture(page,info,'gr-page2-server-search');
 const all=await enter(page,selection('grundskola',metadata.grQuery,null,metadata.otherYear,{sort:'school',direction:'desc'}));expect(all.count).toBe(53);expect(all.rows.some(r=>r.unitId===metadata.otherSchool.unitId)).toBe(true);
});
test('O09: IM52 sidor sök sort och tomresultat har fortsatt veckotid',async({page},info)=>{
 const q=selection('introduktionsprogram',metadata.imQuery,fixture.unitId),first=await enter(page,q);expect(first.count).toBe(52);expect(first.rows).toHaveLength(50);expect(first.rows.every(r=>planningAnnualMetrics(r,metadata.otherYear).measure==='hours-per-week'&&planningAnnualMetrics(r,metadata.otherYear).hours.value===14)).toBe(true);
 const wait=page.waitForResponse(matches(LIST));await list(page).getByRole('button',{name:'Nästa sida',exact:true}).click();const reply=await wait;expect(parsePlanningList(await reply.json(),reply.request().postDataJSON(),setup).rows).toHaveLength(2);
 const found=await enter(page,selection('introduktionsprogram',metadata.imLastCode,fixture.unitId,q.schoolYear,{sort:'version',direction:'desc'}));expect(found.count).toBe(1);expect(found.rows[0].offeringId).toBe(metadata.imRecords[51].offeringId);
 const empty=await enter(page,selection('introduktionsprogram','INGET OWNED UNDERLAG',fixture.unitId));expect(empty.count).toBe(0);await capture(page,info,'im-weekly-empty');
});
test('O10: IM sju verkliga tvåtimmarsrader är 14 per vecka utan årsprogressering',async({page},info)=>{
 const r=metadata.imRecords[0],state=await ownedNode('readback',()=>fixture.ownedState(r.planId)),data=await enter(page,selection(r.kind,r.query,r.unitId));expect(planningAnnualMetrics(data.rows[0],metadata.otherYear).measure).toBe('hours-per-week');expect(planningAnnualMetrics(data.rows[0],metadata.otherYear).hours.value).toBe(14);expect(data.rows[0].relativeYear).toBeNull();
 await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page)).toContainText('Timmar per vecka');expect((await ownedNode('readback',()=>fixture.readOther(r.planId))).cells).toEqual(Object.fromEntries(['im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor'].map(id=>[id,[2]])));
 await expect(workspace(page).getByRole('button',{name:/^Åk /u})).toHaveCount(0);expect(await ownedNode('readback',()=>fixture.ownedState(r.planId))).toEqual(state);await capture(page,info,'im-fourteen-weekly');
});
test('O11: mentorNULL visas saknat och äldre fullread400 kan inte bli noll',async({page})=>{
 const q=selection('introduktionsprogram','Syntetisk årsplaneringsintroduktion',fixture.unitId),data=await enter(page,q);expect(data.rows).toHaveLength(1);expect(planningAnnualMetrics(data.rows[0],metadata.otherYear).hours.value).toBeNull();
 const waiting=page.waitForResponse(matches(READ));await list(page).getByRole('button',{name:/^Öppna /u}).click();const reply=await waiting;expect(reply.status()).toBe(400);await expect(workspace(page)).toContainText(/sakna|underlag/iu);
 await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);await expect(list(page)).toHaveAttribute('aria-busy','false');await expect(workspace(page).getByRole('button',{name:'Försök igen',exact:true})).toBeVisible();
});
test('O12: huvudman läser årsbindning och veckoplan men saknar cellmandat',async({page})=>{
 const r=metadata.grRecords[0];await openBound(page,r,metadata.otherYear,fixture.hm);await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
 const im=metadata.imRecords[0];await enter(page,selection(im.kind,im.query,im.unitId),fixture.hm);await list(page).getByRole('button',{name:/^Öppna /u}).click();await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
 const before=await ownedNode('readback',()=>fixture.readOther(r.currentPlanId,fixture.hm)),reply=await nodeRequest(baseURL,fixture.hm,CELL,{planId:r.currentPlanId,expectedRevision:before.revision,rowId:'matematik',columnIndex:1,hours:777});expect(reply.status).toBe(403);expect((await ownedNode('readback',()=>fixture.events(reply.correlationId))).filter((e:{outcome:string})=>e.outcome==='ok')).toEqual([]);
});
test('O13: administratörens direkta GRläsning nekas faktiskt utan payload',async()=>{
 const r=metadata.grRecords[0],before=await ownedNode('readback',()=>fixture.ownedState(r.planId)),reply=await nodeRequest(baseURL,fixture.admin,READ,{planId:r.planId});expect(reply.status).toBe(403);expect(reply.body).not.toHaveProperty('cells');expect((await ownedNode('readback',()=>fixture.events(reply.correlationId))).filter((e:{outcome:string})=>e.outcome==='ok')).toEqual([]);expect(await ownedNode('readback',()=>fixture.ownedState(r.planId))).toEqual(before);
});
test('O14: skolbyte och manipulerat target kan inte läsa annan rektors version',async({page})=>{
 const r=metadata.grRecords[0];await openBound(page,r);const before=await ownedNode('readback',()=>fixture.ownedState(metadata.otherSchool.planId)),reply=await nodeRequest(baseURL,fixture.principal,READ,{planId:metadata.otherSchool.planId});expect(reply.status).toBe(403);expect(reply.body).not.toHaveProperty('cells');
 actor=fixture.principalB;await fixture.cookies(page.context(),actor,baseURL);await page.goto(address(selection('grundskola',r.query,metadata.otherSchool.unitId))+'&ovrigtimplan='+r.planId+'&timplansform=grundskola'+'&timplansskola='+r.unitId);
 await expect(workspace(page).getByTestId('other-year-binding')).toHaveCount(0);expect(await ownedNode('readback',()=>fixture.ownedState(metadata.otherSchool.planId))).toEqual(before);
});
test('O15: held actual cellwrite spärrar år skola och Back till komplett readback',async({page})=>{
 const r=metadata.grRecords[0];await currentMatrix(page,r);const gate=hold();await page.route('**'+CELL,async route=>{const actual=await completeActual(route);gate.resolve(actual);await gate.released;await route.fulfill({response:actual});});
 const dialog=await edit(page);await dialog.getByRole('button',{name:'Spara ändring',exact:true}).click();const actual=await gate.ready;expect(actual.status()).toBe(200);const url=page.url();await blocked(page,url);expect((await ownedNode('readback',()=>fixture.readOther(r.currentPlanId))).cells.matematik).toEqual([444,777,666]);gate.release();
 await expect(dialog).toHaveCount(0);await expect(workspace(page)).toContainText('Ändringen sparades.');await expect(workspace(page).getByRole('button',{name:'Ändra Matematik, Åk 8, 777 timmar',exact:true})).toBeVisible();expect(dialogs).toEqual([]);
});
test('O16: actual accepterad cell och återläsningsfel behåller unknown tills riktig retry',async({page})=>{
 const r=metadata.grRecords[0];await currentMatrix(page,r);let injectRead=false;
 await page.route('**'+CELL,async route=>{const actual=await completeActual(route);expect(actual.status()).toBe(200);injectRead=true;await route.fulfill({response:actual,status:502,json:{code:'bad_gateway'}});});
 await page.route('**'+READ,async route=>{const actual=await completeActual(route);if(injectRead)await route.fulfill({response:actual,status:502,json:{code:'bad_gateway'}});else await route.fulfill({response:actual});});
 const dialog=await edit(page);await dialog.getByRole('button',{name:'Spara ändring',exact:true}).click();await expect(dialog.getByRole('button',{name:'Läs om planen',exact:true})).toBeVisible();const url=page.url();await blocked(page,url);expect(dialogs).toEqual([]);
 expect((await ownedNode('readback',()=>fixture.readOther(r.currentPlanId))).cells.matematik).toEqual([444,777,666]);injectRead=false;await page.unroute('**'+READ);await dialog.getByRole('button',{name:'Läs om planen',exact:true}).click();await expect(dialog).toContainText('Den aktuella timplanen innehåller redan ditt värde.');await expect(dialog.getByRole('button',{name:'Spara ändring',exact:true})).toHaveCount(0);await expect(workspace(page)).toHaveAttribute('aria-busy','false');
});
test('O17: sen faktisk matrisläsning återfyller inte nytt planeringsår',async({page})=>{
 const r=metadata.grRecords[0];await enter(page,selection(r.kind,r.query,r.unitId));const gate=hold();await page.route('**'+READ,async route=>{const actual=await completeActual(route);gate.resolve(actual);await gate.released;try{await route.fulfill({response:actual});}catch{/* Client generation was invalidated after a complete actual read. */}});
 await list(page).getByRole('button',{name:/^Öppna /u}).click();expect((await gate.ready).status()).toBe(200);const waiting=page.waitForResponse(matches(LIST));await bar(page).getByLabel('Planeringsläsår',{exact:true}).selectOption(String(metadata.otherYear+1));await waiting;gate.release();
 await expect(list(page)).toHaveAttribute('aria-busy','false');await expect(workspace(page).getByTestId('other-year-binding')).toHaveCount(0);await expect(bar(page).getByLabel('Planeringsläsår',{exact:true})).toHaveValue(String(metadata.otherYear+1));
});
test('O18: hela årsöverblicken deduplicerar två klasser och håller GRokänd/IMweekly isär',async({page},info)=>{
 const r=metadata.grRecords[0];actor=fixture.principal;await fixture.cookies(page.context(),actor,baseURL);
 const wait=page.waitForResponse(matches(OVERVIEW)),q=selection(r.kind,r.query,r.unitId);await page.goto(address(q)+'&planeringsoversikt=1');await waitForHydration(page);const actual=await wait,gr=parsePlanningOverview(await actual.json(),actual.request().postDataJSON(),setup);
 expect(gr.count).toBe(1);expect(gr.rows[0].classes).toHaveLength(2);expect(gr.rows[0].columnMap).toEqual({kind:'unknown'});expect(gr.totals.annualHours.value).toBeNull();
 const region=page.getByRole('region',{name:'Läsårsöverblick',exact:true});await expect(region).toHaveAttribute('aria-busy','false');await expect(region).toContainText('Okänt');await capture(page,info,'gr-overview-unknown');
 const imWait=page.waitForResponse(matches(OVERVIEW)),imQ=selection('introduktionsprogram',metadata.imRecords[0].query,fixture.unitId);await page.goto(address(imQ)+'&planeringsoversikt=1');await waitForHydration(page);const imActual=await imWait,im=parsePlanningOverview(await imActual.json(),imActual.request().postDataJSON(),setup);
 expect(im.count).toBe(1);expect(im.totals.weeklyHours.value).toBe(14);expect(im.rows[0].relativeYear).toBeNull();await expect(region).toHaveAttribute('aria-busy','false');await expect(region).toContainText('Planerade timmar per vecka');await capture(page,info,'im-overview-weekly');
});
