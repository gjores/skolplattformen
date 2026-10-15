// Actual evidence: own synthetic customer, real OIDC/MFA, built Worker and SQL.
// No request interception, response replacement or locally minted login cookies.
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {expect,test,type Browser,type BrowserContext,type Page,type Response,type TestInfo} from '@playwright/test';
import {createClassCohortOidcFixture} from '../../work/pilot/phase5-class-cohort-oidc-fixtures.mjs';
import {parseClassCohortCreateReply,parseClassCohortCreateRequest,parseClassCohortUnderlag} from '../lib/class-cohort';
import {planLocationQuery} from '../lib/protected-plan-location';
import {waitForHydration} from './helpers/keycloak';

type Fixture=Awaited<ReturnType<typeof createClassCohortOidcFixture>>;
type Role='hm'|'principal'|'admin'|'second';
type Education={offeringId:string;planId:string;unitId:string;startedOn:string};
type Actor={context:BrowserContext;page:Page};
const baseURL=process.env.PHASE5_BASE_URL!;
const UNDERLAG='/api/klasser/organisation/underlag',CREATE='/api/klasser/organisation/skapa';
const workspace=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const panel=(page:Page)=>page.getByRole('region',{name:'Klasser för utbildningen',exact:true});
const matches=(pathname:string)=>(response:Response)=>new URL(response.url()).pathname===pathname&&response.request().method()==='POST';
const firstYear=(startedOn:string)=>Number(startedOn.slice(0,4))-(startedOn.slice(5,7)<'07'?1:0);
const byClassId=<T extends{id:string}>(classes:T[])=>[...classes].sort((a,b)=>a.id.localeCompare(b.id));
let fixture:Fixture;
let contexts:BrowserContext[]=[];

test.beforeEach(async({browserName},info)=>{
  fixture=undefined!;contexts=[];
  const evidenceDir=process.env.CLASS_COHORT_EVIDENCE_DIR;
  if(!evidenceDir||!path.isAbsolute(evidenceDir))throw Error('Actualprovet kräver en privat absolut CLASS_COHORT_EVIDENCE_DIR.');
  fixture=await createClassCohortOidcFixture({baseURL,evidenceDir,evidencePath:path.join(evidenceDir,`${info.project.name}-${browserName}-${randomUUID()}.json`)});
});
test.afterEach(async({browserName},info)=>{
  // Adapter cleanup first quiesces tracked pages and drains their commands,
  // retaining context.request for status resolution before deleting own rows.
  try{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify({browserName,result:await fixture.cleanup()}),contentType:'application/json'});}
  finally{await Promise.all(contexts.map(context=>context.close()));}
});

async function actor(browser:Browser,info:TestInfo,role:Role):Promise<Actor>{
  const {viewport,userAgent,isMobile,hasTouch,deviceScaleFactor}=info.project.use;
  const context=await browser.newContext({baseURL,viewport,userAgent,isMobile,hasTouch,deviceScaleFactor,locale:'sv-SE',timezoneId:'Europe/Stockholm'});
  contexts.push(context);const page=await context.newPage();
  fixture.trackPage(page,role);
  const login=await fixture.login(page,role,{stepUp:true});
  await info.attach(`oidc-${role}.json`,{body:JSON.stringify(login),contentType:'application/json'});
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();
  return{context,page};
}
async function navigate(page:Page){
  await waitForHydration(page);
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches);
  const sidebar=page.locator('[data-slot="sidebar"][data-state]');
  if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')
    await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await page.getByRole('button',{name:'Programplaner',exact:true}).click();
  await expect(workspace(page)).toBeVisible();
}
function educationURL(education:Education){return '/'+planLocationQuery({view:'programplaner',programplan:{...education,version:1},planning:{unitId:education.unitId,schoolYear:firstYear(education.startedOn),schoolform:'gymnasium'},allYears:true});}
async function openEducation(page:Page,education:Education){
  await page.goto(educationURL(education));await expect(panel(page)).toBeVisible();
  const opener=panel(page).getByRole('button',{name:'Visa klasser',exact:true});
  if(await opener.isVisible())await opener.click();
  await expect(panel(page)).toContainText(education.startedOn);
}
async function classes(actor:Actor,role:Role,education:Education){
  const input={offeringId:education.offeringId,unitId:education.unitId};
  const response=await fixture.request(actor.context,role,UNDERLAG,input);
  expect(response.status).toBe(200);return parseClassCohortUnderlag(response.body,input);
}
async function prepareClasses(page:Page,names:string[]){
  await panel(page).getByRole('button',{name:'Skapa tomma klasser',exact:true}).click();
  for(const [index,name] of names.entries()){
    if(index)await panel(page).getByRole('button',{name:'Lägg till klassrad',exact:true}).click();
    await panel(page).getByLabel(`Klassnamn ${index+1}`,{exact:true}).fill(name);
  }
  await panel(page).getByRole('button',{name:'Granska klasser',exact:true}).click();
  await expect(panel(page).getByRole('region',{name:'Granska nya klasser',exact:true})).toBeFocused();
}
async function saveClasses(page:Page,count:number){
  const pending=page.waitForResponse(matches(CREATE));
  await panel(page).getByRole('button',{name:`Spara ${count} ${count===1?'klass':'klasser'}`,exact:true}).click();
  const response=await pending;expect(response.status()).toBe(200);
  const request=parseClassCohortCreateRequest(response.request().postDataJSON());
  const receipt=parseClassCohortCreateReply(await response.json(),request);
  expect(receipt.replayed).toBe(false);
  await expect(panel(page)).toContainText(count===1?'En tom klass har sparats och lästs tillbaka.':`${count} tomma klasser har sparats och lästs tillbaka.`);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('sp:class-cohort:')))).toEqual([]);
  return{request,receipt};
}
async function capture(page:Page,info:TestInfo,name:string){
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width+1);
  const imagePath=info.outputPath(`${name}.png`);await page.screenshot({path:imagePath,fullPage:true});
  await info.attach(name,{path:imagePath,contentType:'image/png'});
}

test('A01: ny utbildning, frivilligt klasssteg, återläsning och uttrycklig timplanskoppling',async({browser},info)=>{
  const hm=await actor(browser,info,'hm'),basis=fixture.basis();
  await navigate(hm.page);await workspace(hm.page).getByRole('button',{name:'Ny programplan',exact:true}).click();
  const flow=workspace(hm.page).getByRole('region',{name:'Program, inriktning och fördjupning',exact:true});
  await flow.getByLabel('Skola',{exact:true}).selectOption(fixture.scope.unitId);
  await expect(flow).toHaveAttribute('aria-busy','false');
  const catalog=flow.getByLabel('Välj underlag',{exact:true});
  if(await catalog.inputValue()!==basis.catalogId){
    const source=flow.locator('details.pp-flow-source');
    if(await source.getAttribute('open')===null)await source.locator('summary').click();
    await catalog.selectOption(basis.catalogId);
    await expect(flow).toHaveAttribute('aria-busy','false');
  }
  await flow.getByLabel('1. Program',{exact:true}).selectOption(`${basis.programRef.code}:${basis.programRef.version}`);
  await flow.getByLabel('2. Inriktning',{exact:true}).selectOption(basis.orientationCode);
  await flow.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk klassorganisation');
  await flow.getByLabel('Elevkull',{exact:true}).fill('Syntetisk ny kull');
  await flow.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(basis.startedOn);
  await flow.getByRole('button',{name:'Granska utkast',exact:true}).click();
  const creation=hm.page.waitForResponse(matches('/api/programplaner/utbildning/skapa'));
  await flow.getByRole('button',{name:'Spara utbildning och utkast',exact:true}).click();
  const response=await creation;expect(response.status()).toBe(200);const created=await response.json();
  const education={offeringId:created.education.id,planId:created.plan.id,unitId:fixture.scope.unitId,startedOn:basis.startedOn};
  await expect(panel(hm.page)).toContainText('Inga klasser finns ännu');
  await expect(panel(hm.page).getByRole('button',{name:'Skapa tomma klasser',exact:true})).toHaveCount(0);
  await panel(hm.page).getByRole('button',{name:'Gör senare',exact:true}).click();
  await expect(panel(hm.page).getByRole('button',{name:'Visa klasser',exact:true})).toBeFocused();
  await panel(hm.page).getByRole('button',{name:'Visa klasser',exact:true}).click();
  expect((await classes(hm,'hm',education)).classes).toEqual([]);

  const principal=await actor(browser,info,'principal');await openEducation(principal.page,education);
  await prepareClasses(principal.page,['sa a','sa b']);await capture(principal.page,info,'early-classes-review');
  const saved=await saveClasses(principal.page,2);expect(saved.request.names).toEqual(['SA A','SA B']);
  const before=await classes(principal,'principal',education);expect(byClassId(before.classes)).toEqual(byClassId(saved.receipt.classes));
  await principal.page.reload();await panel(principal.page).getByRole('button',{name:'Visa klasser',exact:true}).click();
  await expect(panel(principal.page).getByLabel('Befintliga klasser (2)',{exact:true})).toBeVisible();
  expect((await classes(principal,'principal',education)).classes).toEqual(before.classes);
  await capture(principal.page,info,'early-classes-reloaded');

  const timplan=await fixture.approveTimplan({hm:hm.context,principal:principal.context},education);
  await principal.page.goto('/'+planLocationQuery({view:'timplaner',gym:{kind:'plan',id:timplan.id,unitId:education.unitId,offeringId:education.offeringId,version:timplan.version},planning:{unitId:education.unitId,schoolYear:firstYear(education.startedOn),schoolform:'gymnasium'},allYears:true}));
  const links=principal.page.getByRole('region',{name:'Klasser och läsår',exact:true});
  await links.getByRole('button',{name:'Koppla klass',exact:true}).click();
  await links.getByLabel('Läsår för klasskoppling',{exact:true}).selectOption(String(firstYear(education.startedOn)));
  await links.getByRole('combobox',{name:'Klass',exact:true}).selectOption(saved.receipt.classes[0].id);
  await links.getByRole('button',{name:'Koppla vald klass',exact:true}).click();
  const dialog=principal.page.getByRole('dialog',{name:'Koppla klass till timplan',exact:true});
  await expect(dialog).toContainText('SA A');const linking=principal.page.waitForResponse(matches('/api/klasser/koppla'));
  await dialog.getByRole('button',{name:'Bekräfta koppling',exact:true}).click();
  const linked=await linking;expect(linked.status()).toBe(200);expect(linked.request().postDataJSON()).toMatchObject({classId:saved.receipt.classes[0].id,schoolYear:firstYear(education.startedOn),planId:timplan.id,columnId:'ar1'});
  await expect(links).toContainText(`Klassens koppling till timplan version ${timplan.version}`);
  expect((await classes(principal,'principal',education)).classes).toEqual(before.classes);
  await capture(principal.page,info,'explicit-class-year-version');
});

test('A02: vårstart, administratörens namnkonflikt, huvudmannens läsläge och tom kopierad kull',async({browser},info)=>{
  const hm=await actor(browser,info,'hm'),principal=await actor(browser,info,'principal');
  const startedOn=fixture.scope.springStart;
  const education=await fixture.prepareEducation(hm.context,principal.context,{name:'Syntetisk vårstart',startedOn});
  const admin=await actor(browser,info,'admin');await openEducation(admin.page,education);
  await expect(panel(admin.page)).toContainText(`${firstYear(startedOn)}/${firstYear(startedOn)+1}`);
  await prepareClasses(admin.page,['VÅR A']);const saved=await saveClasses(admin.page,1);
  expect(saved.receipt.classes[0]).toMatchObject({startsOn:startedOn,cohortStartYear:firstYear(startedOn),endsOn:null,validitySource:'education_start'});
  await prepareClasses(admin.page,['VÅR A']);const conflict=admin.page.waitForResponse(matches(CREATE));
  await panel(admin.page).getByRole('button',{name:'Spara 1 klass',exact:true}).click();
  const denied=await conflict;expect(denied.status()).toBe(409);expect((await denied.json()).code).toBe('class_name_year_conflict');
  expect((await classes(admin,'admin',education)).classes).toEqual(saved.receipt.classes);
  await panel(admin.page).getByRole('button',{name:'Gör senare',exact:true}).click();
  await openEducation(hm.page,education);await expect(panel(hm.page)).toContainText('Du läser som huvudman');
  await expect(panel(hm.page).getByRole('button',{name:'Skapa tomma klasser',exact:true})).toHaveCount(0);
  await panel(hm.page).getByLabel('Befintliga klasser (1)',{exact:true}).selectOption(saved.receipt.classes[0].id);
  await expect(panel(hm.page)).toContainText(startedOn);expect((await classes(hm,'hm',education)).classes).toEqual(saved.receipt.classes);
  const forbidden=await fixture.request(hm.context,'hm',CREATE,{...saved.request,commandId:randomUUID(),names:['HM SKA INTE SKAPA']});
  expect(forbidden.status).toBe(403);expect((await classes(hm,'hm',education)).classes).toEqual(saved.receipt.classes);
  await capture(hm.page,info,'head-organizer-read-only-spring');
  await workspace(hm.page).getByRole('button',{name:'Kopiera',exact:true}).click();
  const copy=hm.page.getByRole('region',{name:'Kopiera till ny utbildning',exact:true});
  const copyStart=`${Number(startedOn.slice(0,4))+1}-01-15`;
  await copy.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk nästa vårkull');
  await copy.getByLabel('Elevkull',{exact:true}).fill('Syntetisk kopierad kull');
  await copy.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(copyStart);
  const copying=hm.page.waitForResponse(matches('/api/programplaner/utbildning/kopiera'));
  await copy.getByRole('button',{name:'Spara kopia',exact:true}).click();
  const copied=await copying;expect(copied.status()).toBe(200);const result=await copied.json();
  const newEducation={offeringId:result.education.id,planId:result.plan.id,unitId:education.unitId,startedOn:copyStart};
  expect(newEducation.offeringId).not.toBe(education.offeringId);expect(newEducation.planId).not.toBe(education.planId);
  await expect(panel(hm.page)).toBeVisible();await panel(hm.page).getByRole('button',{name:'Visa klasser',exact:true}).click();
  await expect(panel(hm.page)).toContainText('Inga klasser finns ännu');await expect(panel(hm.page)).not.toContainText('VÅR A');
  expect((await classes(hm,'hm',newEducation)).classes).toEqual([]);
  expect((await classes(hm,'hm',education)).classes).toEqual(saved.receipt.classes);
  await capture(hm.page,info,'copied-cohort-without-classes');
});

test('A03: verklig MFA-retur återställer samma journal och kräver uttryckligt omförsök',async({browser},info)=>{
  const hm=await actor(browser,info,'hm'),principal=await actor(browser,info,'principal');
  const education=await fixture.prepareEducation(hm.context,principal.context,{name:'Syntetisk MFA-återkomst',startedOn:fixture.scope.futureStart});
  await openEducation(principal.page,education);await prepareClasses(principal.page,['MFA A','MFA B']);
  // Only this own callback session's MFA timestamp is aged synthetically.
  // The ensuing step-up, IdP callback and request-bound status are real HTTP.
  await fixture.expireMfa(principal.context,'principal');
  const writes:unknown[]=[];
  principal.page.on('request',request=>{if(new URL(request.url()).pathname===CREATE&&request.method()==='POST')writes.push(request.postDataJSON());});
  const first=principal.page.waitForResponse(matches(CREATE));
  await panel(principal.page).getByRole('button',{name:'Spara 2 klasser',exact:true}).click();
  const denied=await first;expect(denied.status()).toBe(403);expect((await denied.json()).code).toBe('mfa_required');
  const original=parseClassCohortCreateRequest(denied.request().postDataJSON());
  expect(writes).toHaveLength(1);
  const statusResponses:Response[]=[];
  const observeStatus=(response:Response)=>{if(matches('/api/klasser/organisation/status')(response))statusResponses.push(response);};
  principal.page.on('response',observeStatus);
  try{
    await fixture.prepareStepUp(principal.context,'principal');
    await panel(principal.page).getByRole('button',{name:'Verifiera med engångskod',exact:true}).click();
    const mfa=await fixture.completeStepUp(principal.page,'principal');
    await info.attach('oidc-step-up.json',{body:JSON.stringify(mfa),contentType:'application/json'});
    // A fresh TOTP can require the next 30-second period. Time the HTTP check
    // after interactive MFA, while retaining responses received during return.
    await expect.poll(()=>statusResponses.length).toBeGreaterThan(0);
  }finally{principal.page.off('response',observeStatus);}
  const checked=statusResponses[0];expect(checked.status()).toBe(200);expect(checked.request().postDataJSON()).toEqual(original);
  expect(await checked.json()).toMatchObject({commandId:original.commandId,offeringId:education.offeringId,unitId:education.unitId,status:'not_found',receipt:null});
  await expect(panel(principal.page).getByRole('button',{name:'Försök igen med samma begäran',exact:true})).toBeVisible();
  expect(writes).toHaveLength(1);expect((await classes(principal,'principal',education)).classes).toEqual([]);
  await capture(principal.page,info,'mfa-return-explicit-retry');
  const retry=principal.page.waitForResponse(matches(CREATE));
  await panel(principal.page).getByRole('button',{name:'Försök igen med samma begäran',exact:true}).click();
  const retried=await retry;expect(retried.status()).toBe(200);expect(retried.request().postDataJSON()).toEqual(original);
  const receipt=parseClassCohortCreateReply(await retried.json(),original);expect(receipt.replayed).toBe(false);
  await expect(panel(principal.page)).toContainText('2 tomma klasser har sparats och lästs tillbaka.');
  expect(writes).toEqual([original,original]);expect(byClassId((await classes(principal,'principal',education)).classes)).toEqual(byClassId(receipt.classes));
  expect(await principal.page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('sp:class-cohort:')))).toEqual([]);
  await principal.page.reload();await panel(principal.page).getByRole('button',{name:'Visa klasser',exact:true}).click();
  await expect(panel(principal.page).getByLabel('Befintliga klasser (2)',{exact:true})).toBeVisible();
  expect(writes).toHaveLength(2);await capture(principal.page,info,'mfa-classes-reloaded');
});
