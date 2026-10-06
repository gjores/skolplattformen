// Positiva svar kommer från byggd skyddad Worker och egen syntetisk DB-kund.
// Transportfel får injiceras först efter att den riktiga Worker-begäran har utförts.
import { expect,test,type Page,type TestInfo } from '@playwright/test';
import { createGymTimplanFixture,verifyGymTimplanBrowserTarget } from '../../work/pilot/phase5-gym-timplan-fixtures.mjs';
import { PROGRAMPLAN_TERMS } from '../lib/programplan-terms.ts';
import type { GymTimplan,GymTimplanHours,GymTimplanRow } from '../lib/gym-timplan.ts';
import { waitForHydration } from './helpers/keycloak.ts';

type Fixture=Awaited<ReturnType<typeof createGymTimplanFixture>>;
type Session=Fixture['principal'];
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const CREATE='/api/timplaner/gym/skapa',READ='/api/timplaner/gym/lasa',ROW='/api/timplaner/gym/rad';
const programWorkspace=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const gymWorkspace=(page:Page)=>page.getByTestId('protected-gym-timplan-workspace');
const gymTable=(page:Page)=>gymWorkspace(page).getByRole('region',{name:'Skolans undervisningstid',exact:true});
const responseFor=(route:string)=>(response:{url:()=>string;request:()=>{method:()=>string}})=>new URL(response.url()).pathname===route&&response.request().method()==='POST';

async function navigate(page:Page,name:'Programplaner'|'Timplaner') {
  await waitForHydration(page);
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches);
  if(mobile){
    const sidebar=page.locator('[data-mobile="true"]');
    if(!await sidebar.isVisible())await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
    await expect(sidebar).toBeVisible();await sidebar.getByRole('button',{name,exact:true}).click();await expect(sidebar).not.toBeVisible();
  }else{
    const sidebar=page.locator('[data-slot="sidebar"][data-state]');
    if(await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
    await page.getByRole('button',{name,exact:true}).click();
  }
}
async function enterProgram(page:Page,session=fixture.principal) {
  await fixture.cookies(page.context(),session,baseURL);await page.goto('/');
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page,'Programplaner');
  const list=programWorkspace(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');
  await list.getByRole('button',{name:/^Öppna utbildning Syntetisk SA utan plan,/u}).click();
  await expect(programWorkspace(page).getByRole('region',{name:'Programplanen',exact:true})).toBeVisible();
}
async function enterTransition(page:Page,session=fixture.principal) {
  await enterProgram(page,session);await programWorkspace(page).getByRole('button',{name:'Timplan',exact:true}).click();await expect(gymWorkspace(page)).toBeVisible();
}
async function createFromUI(page:Page,schoolName='Syntetisk programplansskola') {
  await gymWorkspace(page).getByRole('button',{name:`Skapa timplansutkast för ${schoolName}`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Skapa timplansutkast',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(schoolName);const pending=page.waitForResponse(responseFor(CREATE));
  await dialog.getByRole('button',{name:'Skapa timplansutkast',exact:true}).click();const response=await pending;
  expect(response.status()).toBe(200);const reply=await response.json();await expect(dialog).toHaveCount(0);await expect(gymTable(page)).toBeVisible();
  return {reply,response};
}
async function readPlan(planId:string,session=fixture.principal):Promise<GymTimplan> {
  const reply=await fixture.request(baseURL,session,READ,{planId});expect(reply.status).toBe(200);
  expect(await fixture.pairedGym(reply.correlationId,session,'gym_timplan_read',planId)).toBe(true);
  return reply.body as GymTimplan;
}
async function openExisting(page:Page,version=1,schoolName='Syntetisk programplansskola') {
  const button=gymWorkspace(page).getByRole('button',{name:`Öppna timplan, version ${version}, ${schoolName}`,exact:true});
  // En enda matchande skolas plan kan öppnas direkt efter asynkron underlagsläsning.
  // Vänta på det verkliga utfallet innan skolöversikten används som alternativ.
  await expect(gymTable(page).or(button).first()).toBeVisible();
  if(await gymTable(page).isVisible())return;
  await button.click();await expect(gymTable(page)).toBeVisible();
}
function rowInputs(page:Page,row:GymTimplanRow) {
  return gymTable(page).locator(`tr[data-row-key="${row.key}"]`);
}
function cell(page:Page,row:GymTimplanRow,index:number) {
  return rowInputs(page,row).getByLabel(`${row.name} ${row.levelName}, ${PROGRAMPLAN_TERMS[index]}`,{exact:true});
}
async function saveHours(page:Page,plan:GymTimplan,row:GymTimplanRow,hours:GymTimplanHours,session=fixture.principal) {
  await expect(page.getByRole('dialog',{name:'Fördela undervisningstid',exact:true})).toHaveCount(0);
  await expect(gymTable(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
  for(const [index,value] of hours.entries()){
    const input=cell(page,row,index);
    if(row.pointTerms[index]===0){expect(value).toBeNull();await expect(input).toHaveCount(0);}else await input.fill(value===null?'':String(value));
  }
  const last=row.pointTerms.findLastIndex(value=>value>0),pending=page.waitForResponse(responseFor(ROW));
  await cell(page,row,last).press('Enter');const response=await pending;
  expect(response.status()).toBe(200);expect(response.request().postDataJSON()).toEqual({planId:plan.id,expectedRevision:plan.revision,rowKey:row.key,hours});
  expect(await fixture.pairedGym(response.headers()['x-correlation-id'],session,'gym_timplan_row_changed',plan.id)).toBe(true);
  await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');return readPlan(plan.id,session);
}
async function capture(page:Page,info:TestInfo,name:string) {
  const viewport=page.viewportSize();if(!viewport)throw Error('Browserprovet kräver en uttrycklig viewport.');
  const geometry=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,innerWidth,
    visualWidth:visualViewport?.width??null,scrollContainers:[...document.querySelectorAll('.gt-table-scroll')].map(element=>({clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,contain:getComputedStyle(element).contain}))}));
  await info.attach(`${name}-geometry.json`,{body:JSON.stringify({...geometry,viewportWidth:viewport.width}),contentType:'application/json'});
  const path=info.outputPath(`${name}.png`);await page.screenshot({path,fullPage:true});await info.attach(`${name}.png`,{path,contentType:'image/png'});
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
  expect(geometry.innerWidth).toBeLessThanOrEqual(viewport.width+1);
}
function noPackages(page:Page) {
  const attempts:string[]=[];page.on('request',request=>{const pathname=new URL(request.url()).pathname;
    if(/^\/api\/programplaner\/(?:paketval|valpaket)(?:\/|$)/u.test(pathname))attempts.push(pathname);});return attempts;
}
async function reopenFromList(page:Page) {
  await navigate(page,'Timplaner');
  const gym=page.getByRole('button',{name:'Gymnasium',exact:true});if(await gym.isVisible())await gym.click();
  await gymWorkspace(page).getByRole('button',{name:/^Timplan för Syntetisk SA utan plan,/u}).click();await openExisting(page);
}

test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyGymTimplanBrowserTarget(baseURL),browserName}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=undefined!;fixture=await createGymTimplanFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});

test('T01: färdig utkastkälla blir skolans egna timmar med blankt, noll och exakt retur till källan',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL),attempts=noPackages(page),sourceBefore=await fixture.snapshot(source.planId);
  await enterTransition(page);const created=await createFromUI(page);expect(created.reply.sourcePlanId).toBe(source.planId);
  expect(await fixture.pairedGym(created.response.headers()['x-correlation-id'],fixture.principal,'gym_timplan_created',created.reply.id)).toBe(true);
  let plan=await readPlan(created.reply.id);expect(plan.source.status).toBe('utkast');expect(plan.status).toBe('utkast');expect(plan.rows.reduce((sum,row)=>sum+row.points,0)).toBe(2500);
  expect(plan.rows.filter(row=>row.key==='block:iv1')).toHaveLength(1);expect(plan.rows.filter(row=>row.key==='block:mosp')).toHaveLength(1);
  for(const row of plan.rows){const entry=source.distribution.find((value:{rowKey:string})=>value.rowKey===row.key);expect(entry).toBeDefined();expect(row.pointTerms).toEqual(entry!.points);expect(plan.hours[row.key]).toEqual([null,null,null,null,null,null]);}
  const row=plan.rows.find(row=>row.key==='foundation:ENGE:1:ENGE1000X')!;expect(row).toBeDefined();
  plan=await saveHours(page,plan,row,[30,0,null,null,null,null]);expect(plan.hours[row.key]).toEqual([30,0,null,null,null,null]);
  await gymWorkspace(page).getByLabel('Visa årskurs').selectOption('1');
  await expect(gymTable(page).getByRole('columnheader',{name:'Åk 1 HT',exact:true})).toHaveCount(0);
  await expect(gymTable(page).getByRole('columnheader',{name:'Åk 2 HT',exact:true})).toBeVisible();
  await capture(page,info,'separate-school-hours');
  await gymWorkspace(page).getByRole('button',{name:'Öppna programplan',exact:true}).click();await expect(programWorkspace(page)).toBeVisible();
  await expect(programWorkspace(page).getByRole('region',{name:'Programplanen',exact:true})).toContainText('2 500 av 2 500 poäng fördelade');
  await programWorkspace(page).getByRole('button',{name:'Timplan',exact:true}).click();await openExisting(page);
  await expect(gymWorkspace(page).getByLabel('Visa årskurs')).toHaveValue('1');expect((await readPlan(plan.id)).hours[row.key]).toEqual(plan.hours[row.key]);
  expect(new URL(page.url()).searchParams.get('timplan')).toBe(plan.id);await page.reload();await expect(gymTable(page)).toBeVisible();
  await reopenFromList(page);await expect(gymTable(page)).toBeVisible();
  expect((await readPlan(plan.id)).hours[row.key]).toEqual([30,0,null,null,null,null]);expect(await fixture.snapshot(source.planId)).toEqual(sourceBefore);expect(attempts).toEqual([]);
  await capture(page,info,'reloaded-school-hours');
});

test('T02: två skolor får olika timmar; administratör skriver eget gymutkast och HM läser',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL,{twoSchools:true}),attempts=noPackages(page);
  await enterTransition(page);const a=(await createFromUI(page)).reply;let planA=await readPlan(a.id);
  const row=planA.rows.find(row=>row.key==='foundation:ENGE:1:ENGE1000X')!;planA=await saveHours(page,planA,row,[25,26,null,null,null,null]);
  await enterTransition(page,fixture.principalB);const b=(await createFromUI(page,'Syntetisk gymnasieskola B')).reply;let planB=await readPlan(b.id,fixture.principalB);
  planB=await saveHours(page,planB,row,[40,41,null,null,null,null],fixture.principalB);expect(planB.unitId).toBe(fixture.secondUnitId);
  await enterTransition(page,fixture.admin);await openExisting(page);planA=await readPlan(a.id,fixture.admin);expect(planA.canPlan).toBe(true);
  planA=await saveHours(page,planA,row,[27,28,null,null,null,null],fixture.admin);expect((await readPlan(b.id,fixture.principalB)).hours[row.key]).toEqual([40,41,null,null,null,null]);
  const before=await fixture.timplanSnapshot(a.id);await enterTransition(page,fixture.hm);await openExisting(page);await expect(gymTable(page).locator('input')).toHaveCount(0);
  const denied=await fixture.request(baseURL,fixture.hm,ROW,{planId:a.id,expectedRevision:planA.revision,rowKey:row.key,hours:[99,99,null,null,null,null]});expect(denied.status).toBe(403);
  expect(await fixture.timplanSnapshot(a.id)).toEqual(before);expect((await readPlan(a.id,fixture.hm)).hours[row.key]).toEqual([27,28,null,null,null,null]);
  await gymWorkspace(page).getByRole('button',{name:'Öppna programplan',exact:true}).click();await expect(programWorkspace(page)).toBeVisible();
  await programWorkspace(page).getByRole('button',{name:'Timplan',exact:true}).click();await expect(gymTable(page)).toBeVisible();
  expect(new URL(page.url()).searchParams.get('timplan')).toBe(a.id);await expect(gymWorkspace(page)).toContainText('Syntetisk programplansskola');
  expect((await readPlan(a.id,fixture.hm)).hours[row.key]).toEqual([27,28,null,null,null,null]);
  expect((await fixture.snapshot(source.planId)).term_distribution).toEqual(source.distribution);expect(attempts).toEqual([]);await capture(page,info,'hm-reads-school-hours');
});

test('T03: ändrad källram kräver uttrycklig ny version och bevarar gamla timmar och klasslänkar',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL),legacy=await fixture.seedLegacyClassLink();
  await enterTransition(page);const created=(await createFromUI(page)).reply;let previous=await readPlan(created.id);
  const unchanged=previous.rows.find(row=>row.key==='foundation:ENGE:1:ENGE1000X')!,changed=previous.rows.find(row=>row.key==='block:iv1')!;
  previous=await saveHours(page,previous,unchanged,[30,31,null,null,null,null]);previous=await saveHours(page,previous,changed,[null,null,10,11,12,13]);
  const previousWhole=await fixture.timplanSnapshot(previous.id),sourceWhole=await fixture.snapshot(source.planId);
  const distribution=source.distribution.map((entry:{rowKey:string;points:number[]})=>entry.rowKey==='block:iv1'?{rowKey:entry.rowKey,points:[0,0,40,60,50,50]}:entry);
  const updated=await fixture.request(baseURL,fixture.hm,'/api/programplaner/terminer',{planId:source.planId,expectedRevision:sourceWhole.revision,distribution});expect(updated.status).toBe(200);
  await enterTransition(page);await openExisting(page);await expect(gymWorkspace(page)).toContainText('Programplanen har ändrats');
  await gymWorkspace(page).getByRole('button',{name:/^Underlag: Programplan v1, revision /u}).click();
  const frozen=page.getByRole('dialog',{name:'Sparat programunderlag',exact:true});await expect(frozen).toContainText(`revision ${previous.source.revision}`);
  const frozenChoice=frozen.locator('tbody tr').filter({hasText:'Individuellt val'});await expect(frozenChoice).toHaveCount(1);
  expect(await frozenChoice.getByRole('cell').allTextContents()).toEqual(changed.pointTerms.map(String));
  await frozen.getByRole('button',{name:'Stäng underlaget',exact:true}).click();await expect(frozen).toHaveCount(0);
  await gymWorkspace(page).getByRole('button',{name:'Välj nytt underlag',exact:true}).click();
  const pending=page.waitForResponse(responseFor(CREATE));await gymWorkspace(page).getByRole('button',{name:'Nytt timplansutkast för Syntetisk programplansskola',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Skapa timplansutkast',exact:true});await dialog.getByRole('button',{name:'Skapa timplansutkast',exact:true}).click();
  const response=await pending;expect(response.status()).toBe(200);const next=await response.json();expect(next.id).not.toBe(previous.id);expect(next.version).toBe(2);
  const current=await readPlan(next.id);expect(current.hours[unchanged.key]).toEqual(previous.hours[unchanged.key]);expect(current.hours[changed.key]).toEqual([null,null,null,null,null,null]);
  const retained=await fixture.timplanSnapshot(previous.id);expect(retained.plan.status).toBe('ersatt');expect(retained.cells).toEqual(previousWhole.cells);expect(retained.plan.gym_basis).toEqual(previousWhole.plan.gym_basis);
  expect(await fixture.timplanSnapshot(legacy.planId)).toEqual(legacy.snapshot);expect(await fixture.classLinks()).toEqual(legacy.links);
  await expect(gymTable(page)).toBeVisible();await capture(page,info,'explicit-new-source-version');
});

test('T04: ofullständig poängram ger konkret åtgärd och ingen tom timplan',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL,{incomplete:true});await enterTransition(page);
  await expect(gymWorkspace(page)).toContainText('poäng');await expect(gymWorkspace(page).getByRole('button',{name:/^Skapa timplansutkast för /u})).toHaveCount(0);
  const basis=await fixture.request(baseURL,fixture.principal,'/api/timplaner/gym/underlag',{sourcePlanId:source.planId});expect(basis.status).toBe(200);expect(basis.body.readiness.ready).toBe(false);expect(basis.body.readiness.missing.length).toBeGreaterThan(0);
  expect(basis.body.units.every((unit:{plans:unknown[]})=>unit.plans.length===0)).toBe(true);
  await gymWorkspace(page).getByRole('button',{name:'Öppna programplan',exact:true}).click();await expect(programWorkspace(page).getByRole('region',{name:'Programplanen',exact:true})).toBeVisible();
  await capture(page,info,'incomplete-source-action');
});

test('T05: CAS-konflikt skriver aldrig över en annan sparad timrad',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const created=(await createFromUI(page)).reply,plan=await readPlan(created.id),row=plan.rows[0];
  const inputs=rowInputs(page,row);await cell(page,row,0).fill('70');
  const other=await fixture.request(baseURL,fixture.second,ROW,{planId:plan.id,expectedRevision:plan.revision,rowKey:row.key,hours:[44,null,null,null,null,null]});expect(other.status).toBe(200);
  const whole=await fixture.timplanSnapshot(plan.id),pending=page.waitForResponse(responseFor(ROW));await cell(page,row,0).press('Enter');expect((await pending).status()).toBe(409);
  await expect(cell(page,row,0)).toHaveValue('70');await expect(inputs).toContainText('Aktuell timplan har hämtats');
  await expect(inputs.getByRole('button',{name:'Spara min fördelning',exact:true})).toBeVisible();
  expect(await fixture.timplanSnapshot(plan.id)).toEqual(whole);expect((await readPlan(plan.id)).hours[row.key]).toEqual([44,null,null,null,null,null]);
  await capture(page,info,'row-conflict-keeps-input');
  const chosen=page.waitForResponse(responseFor(ROW));await inputs.getByRole('button',{name:'Spara min fördelning',exact:true}).click();expect((await chosen).status()).toBe(200);
  await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');expect((await readPlan(plan.id)).hours[row.key][0]).toBe(70);
  await capture(page,info,'row-conflict-confirmed');
});

test('T06: tappat skapasvar återfinner samma kommando utan en andra timplansversion',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL);await enterTransition(page);let commandId:string|undefined,realPlanId:string|undefined,injected=false;
  await page.route('**'+CREATE,async route=>{
    if(injected){await route.continue();return;}injected=true;const body=route.request().postDataJSON();commandId=body.commandId;
    const response=await route.fetch();expect(response.status()).toBe(200);realPlanId=(await response.json()).id;await route.abort('failed');
  });
  await gymWorkspace(page).getByRole('button',{name:'Skapa timplansutkast för Syntetisk programplansskola',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Skapa timplansutkast',exact:true});await dialog.getByRole('button',{name:'Skapa timplansutkast',exact:true}).click();
  // Återhämtningen använder riktig serverkvittens/replay. Positiva svar mockas aldrig.
  await dialog.getByRole('button',{name:'Hämta sparad timplan',exact:true}).click();
  await expect(gymTable(page)).toBeVisible();expect(commandId).toBeTruthy();expect(realPlanId).toBeTruthy();
  const basis=await fixture.request(baseURL,fixture.principal,'/api/timplaner/gym/underlag',{sourcePlanId:source.planId});expect(basis.status).toBe(200);
  const plans=basis.body.units.find((unit:{unitId:string})=>unit.unitId===fixture.unitId).plans;expect(plans).toHaveLength(1);expect(plans[0].id).toBe(realPlanId);expect(plans[0].version).toBe(1);
  await capture(page,info,'create-response-recovered');
});

test('T07: datumlåst programkälla låser inte skolans timmar, men arkiverad utbildning gör det',async({page},info)=>{
  const source=await fixture.createReadyProgramplan(baseURL,{started:true});await enterTransition(page);const created=(await createFromUI(page)).reply;
  let plan=await readPlan(created.id);const row=plan.rows[0];plan=await saveHours(page,plan,row,[15,16,null,null,null,null]);
  const underlag=await fixture.request(baseURL,fixture.hm,'/api/programplaner/underlag',{offeringId:source.offeringId,versionPage:1,catalogId:null});expect(underlag.status).toBe(200);
  const archived=await fixture.request(baseURL,fixture.hm,'/api/programplaner/utbildning/livscykel',{offeringId:source.offeringId,expectedRevision:underlag.body.lifecycle.revision,command:'archive',details:{}});expect(archived.status).toBe(200);
  const before=await fixture.timplanSnapshot(plan.id),denied=await fixture.request(baseURL,fixture.principal,ROW,{planId:plan.id,expectedRevision:plan.revision,rowKey:row.key,hours:[50,50,null,null,null,null]});expect(denied.status).toBe(409);
  expect(await fixture.timplanSnapshot(plan.id)).toEqual(before);const reread=await readPlan(plan.id);expect(reread.archived).toBe(true);expect(reread.hours[row.key]).toEqual([15,16,null,null,null,null]);
  await page.reload();await reopenFromList(page);await expect(gymTable(page).locator('input')).toHaveCount(0);
  await capture(page,info,'archived-school-hours');
});

test('T08: osparade timvärden skyddas och ny cellinmatning under sparandet finns kvar',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const created=(await createFromUI(page)).reply,plan=await readPlan(created.id),row=plan.rows[0];
  const input=cell(page,row,0);await input.fill('30.5');await input.press('Enter');
  await expect(rowInputs(page,row)).toContainText('Ange hela timmar');
  const discard=page.waitForEvent('dialog'),cancel=gymWorkspace(page).getByRole('button',{name:'Öppna programplan',exact:true}).click();
  const prompt=await discard;expect(prompt.message()).toContain('osparade ändringar');await prompt.dismiss();await cancel;await expect(input).toHaveValue('30.5');
  await input.fill('30');let release:()=>void=()=>{},entered:()=>void=()=>{};const writes:number[]=[];
  const held=new Promise<void>(resolve=>{release=resolve;}),workerAccepted=new Promise<void>(resolve=>{entered=resolve;});let intercepted=false;
  await page.route('**'+ROW,async route=>{
    writes.push(route.request().postDataJSON().hours[0]);
    if(intercepted){await route.continue();return;}intercepted=true;const response=await route.fetch();expect(response.status()).toBe(200);entered();await held;await route.fulfill({response});
  });
  await input.press('Enter');await workerAccepted;await input.fill('41');release();
  await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');await expect(input).toHaveValue('41');
  expect(writes).toEqual([30,41]);expect((await readPlan(plan.id)).hours[row.key][0]).toBe(41);await capture(page,info,'edit-during-inline-save-kept');
});

test('T09: förlorad session rensar osparade terminsceller utan att skriva timvärden',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const created=(await createFromUI(page)).reply,plan=await readPlan(created.id),row=plan.rows[0];
  const before=await fixture.timplanSnapshot(plan.id);await cell(page,row,0).fill('88');
  await fixture.expire(fixture.principal);const pending=page.waitForResponse(responseFor(ROW));await cell(page,row,0).press('Enter');expect((await pending).status()).toBe(401);
  await expect(gymWorkspace(page)).toHaveCount(0);await expect(page.getByRole('dialog',{name:'Fördela undervisningstid',exact:true})).toHaveCount(0);
  expect(await fixture.timplanSnapshot(plan.id)).toEqual(before);await capture(page,info,'expired-session-clears-hours');
});

test('T10: Tab mellan rader köar sparning med rätt revision och återläser båda raderna',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const plan=await readPlan((await createFromUI(page)).reply.id),a=plan.rows[0],b=plan.rows[1];
  const firstTerm=b.pointTerms.findIndex(p=>p>0),lastTerm=b.pointTerms.findLastIndex(p=>p>0);
  let release:()=>void=()=>{},entered:()=>void=()=>{};const held=new Promise<void>(resolve=>{release=resolve;}),accepted=new Promise<void>(resolve=>{entered=resolve;});
  const writes:{rowKey:string;expectedRevision:number}[]=[];
  await page.route('**'+ROW,async route=>{
    const body=route.request().postDataJSON();writes.push({rowKey:body.rowKey,expectedRevision:body.expectedRevision});
    if(writes.length>1){await route.continue();return;}
    const response=await route.fetch();expect(response.status()).toBe(200);entered();await held;await route.fulfill({response});
  });
  await cell(page,a,0).fill('30');await cell(page,a,1).fill('31');await cell(page,a,1).press('Tab');await accepted;
  await expect(cell(page,b,firstTerm)).toBeFocused();await cell(page,b,firstTerm).fill('40');await cell(page,b,lastTerm).fill('41');await cell(page,b,lastTerm).press('Enter');
  expect(writes).toHaveLength(1);release();await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');
  expect(writes).toEqual([{rowKey:a.key,expectedRevision:plan.revision},{rowKey:b.key,expectedRevision:plan.revision+1}]);
  const result=await readPlan(plan.id);expect(result.hours[a.key].slice(0,2)).toEqual([30,31]);expect(result.hours[b.key][firstTerm]).toBe(40);expect(result.hours[b.key][lastTerm]).toBe(41);
  await page.reload();await expect(gymTable(page)).toBeVisible();await expect(cell(page,a,0)).toHaveValue('30');await expect(cell(page,b,lastTerm)).toHaveValue('41');
  await capture(page,info,'inline-two-rows-reloaded');
});

test('T11: ogiltiga cellvärden bevaras lokalt och skriver inga timmar innan rättning',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const plan=await readPlan((await createFromUI(page)).reply.id),row=plan.rows[0],before=await fixture.timplanSnapshot(plan.id);
  let writes=0;page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===ROW)writes++;});
  for(const value of ['2001','1.5','-1','abc']){
    await cell(page,row,0).fill(value);await cell(page,row,0).press('Enter');await expect(rowInputs(page,row)).toContainText('Ange hela timmar');await expect(cell(page,row,0)).toHaveValue(value);await expect(cell(page,row,0)).toHaveAttribute('aria-invalid','true');
    expect(await fixture.timplanSnapshot(plan.id)).toEqual(before);
  }
  expect(writes).toBe(0);await cell(page,row,0).fill('2000');await cell(page,row,0).press('Enter');await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');
  expect(writes).toBe(1);expect((await readPlan(plan.id)).hours[row.key][0]).toBe(2000);await capture(page,info,'inline-invalid-corrected');
});

test('T12: tappat timsvar bekräftas genom återläsning utan dubbel radskrivning',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const plan=await readPlan((await createFromUI(page)).reply.id),row=plan.rows[0];let writes=0;
  await page.route('**'+ROW,async route=>{writes++;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
  await cell(page,row,0).fill('32');await cell(page,row,0).press('Enter');await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');
  expect(writes).toBe(1);const after=await readPlan(plan.id);expect(after.revision).toBe(plan.revision+1);expect(after.hours[row.key][0]).toBe(32);await expect(cell(page,row,0)).toHaveValue('32');
  await capture(page,info,'inline-lost-answer-recovered');
});

test('T13: oläst sparstatus låser vidare skrivning tills verklig återläsning bekräftar timmarna',async({page},info)=>{
  await fixture.createReadyProgramplan(baseURL);await enterTransition(page);const plan=await readPlan((await createFromUI(page)).reply.id),row=plan.rows[0];let writes=0;
  await page.route('**'+ROW,async route=>{writes++;const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
  await page.route('**'+READ,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');});
  await cell(page,row,0).fill('33');await cell(page,row,0).press('Enter');await expect(rowInputs(page,row)).toContainText('Sparstatus kunde inte läsas');await expect(cell(page,row,0)).toHaveValue('33');await expect(cell(page,row,0)).toBeDisabled();
  expect(writes).toBe(1);expect((await readPlan(plan.id)).hours[row.key][0]).toBe(33);
  await page.unroute('**'+READ);await rowInputs(page,row).getByRole('button',{name:'Läs aktuell timplan',exact:true}).click();await expect(gymWorkspace(page).locator('.gt-save-state')).toHaveText('Allt sparat');
  expect(writes).toBe(1);await expect(cell(page,row,0)).toHaveValue('33');await expect(cell(page,row,0)).toBeEnabled();await capture(page,info,'inline-unread-status-recovered');
});
