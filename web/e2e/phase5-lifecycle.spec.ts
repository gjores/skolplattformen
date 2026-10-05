// 05-20: programplanens livscykel. Verklig Worker/SQL, egen syntetisk kund per fall;
// webbläsaren injicerar bara transportfel. Status kommer alltid från serverns lifecycle.
import { expect,test,type Page,type Response,type TestInfo } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget,FUTURE_START,STARTED_START } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const w=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const list=(page:Page)=>w(page).getByRole('region',{name:'Alla programplaner',exact:true});
const row=(page:Page,name:string)=>list(page).getByRole('row').filter({has:page.getByRole('button',{name:new RegExp(`^Öppna utbildning ${name},`,'u')})});
const matches=(path:string)=>(r:Response)=>new URL(r.url()).pathname===path&&r.request().method()==='POST';
const LIFECYCLE='/api/programplaner/utbildning/livscykel';
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});
async function navigate(page:Page){await waitForHydration(page);const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();await page.getByRole('button',{name:'Programplaner',exact:true}).click();await expect(list(page)).toHaveAttribute('aria-busy','false',{timeout:30_000});}
async function enter(page:Page,session=fixture.hm){await fixture.cookies(page.context(),session,baseURL);await page.goto('/');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page);}
async function open(page:Page,name:string){await row(page,name).getByRole('button',{name:new RegExp(`^Öppna utbildning ${name},`,'u')}).click();await expect(w(page).getByRole('heading',{level:2,name,exact:true})).toBeVisible();}
async function capture(page:Page,info:TestInfo,name:string){const path=info.outputPath(name);await page.screenshot({path,fullPage:true});await info.attach(name,{path,contentType:'image/png'});}
const noOverflow=(page:Page)=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

test('L01: status i listan och arbetsytan kommer från servern',async({page},info)=>{
  const started=await fixture.startedEducation();await enter(page);
  await expect(row(page,'Syntetisk bunden SA').locator('[data-phase]')).toHaveText('Framtida');
  await expect(row(page,'Syntetisk pågående SA').locator('[data-phase]')).toHaveText('Pågående');
  await expect(row(page,'Syntetisk tidigare beslutad SA').locator('[data-phase]')).toHaveText('Start okänd');
  await expect(row(page,'Syntetisk obunden SA').locator('[data-phase]')).toHaveText('Framtida');
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'lifecycle-list.png');
  await open(page,'Syntetisk pågående SA');await expect(w(page).locator('.pps-head [data-phase]')).toHaveText('Pågående');
  await expect(w(page).getByRole('button',{name:'Ta bort',exact:true})).toHaveCount(0);
  expect((await fixture.offering(started.offeringId))?.id).toBe(started.offeringId);
});

test('L03: framtida plan tas bort efter bekräftelse; utbildning med klass nekas',async({page},info)=>{
  await enter(page);await open(page,'Syntetisk bunden SA');
  await w(page).getByRole('button',{name:'Ta bort',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Ta bort programplanen?'});
  await expect(dialog).toContainText('Syntetisk bunden SA');await expect(dialog).toContainText('Syntetisk kulltext utan datum');await expect(dialog).toContainText('1 version');
  const confirm=dialog.getByRole('button',{name:'Ta bort',exact:true});await expect(confirm).toBeDisabled();
  await dialog.getByRole('checkbox').check();await capture(page,info,'lifecycle-delete-dialog.png');
  const pending=page.waitForResponse(matches(LIFECYCLE));await confirm.click();const r=await pending;expect(r.status()).toBe(200);
  await expect(w(page).locator('.pp-notice')).toContainText('togs bort');await expect(list(page)).toHaveAttribute('aria-busy','false');
  await expect(row(page,'Syntetisk bunden SA')).toHaveCount(0);expect(await fixture.offering(fixture.offeringId)).toBeNull();
  await fixture.addClass(fixture.legacyOfferingId);await open(page,'Syntetisk obunden SA');
  await w(page).getByRole('button',{name:'Ta bort',exact:true}).click();await page.getByRole('dialog').getByRole('checkbox').check();
  const denied=page.waitForResponse(matches(LIFECYCLE));await page.getByRole('dialog').getByRole('button',{name:'Ta bort',exact:true}).click();expect((await denied).status()).toBe(409);
  await expect(w(page).locator('.pp-notice')).toContainText('används av klasser');await expect(row(page,'Syntetisk obunden SA')).toHaveCount(1);
  expect((await fixture.offering(fixture.legacyOfferingId))?.id).toBe(fixture.legacyOfferingId);
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'lifecycle-delete-denied.png');
});

const dialog=(page:Page)=>page.getByRole('dialog');
async function act(page:Page,button:string,confirm=true){await w(page).getByRole('button',{name:button,exact:true}).click();if(confirm)await dialog(page).getByRole('checkbox').check();}
async function submit(page:Page,name:string){const pending=page.waitForResponse(matches(LIFECYCLE));await dialog(page).getByRole('button',{name,exact:true}).click();return pending;}

test('L02: huvudmannen ändrar namn, kull och startdatum i en framtida plan',async({page},info)=>{
  await enter(page);await open(page,'Syntetisk bunden SA');await act(page,'Ändra uppgifter',false);
  const d=dialog(page),next=`${Number(FUTURE_START.slice(0,4))+1}-08-18`;
  await d.getByLabel('Utbildningens namn').fill('Syntetisk omdöpt SA');await d.getByLabel('Elevkull').fill('Syntetisk ny kull');
  await d.getByLabel('Utbildningens exakta startdatum').fill(STARTED_START);await expect(d).toContainText('måste ligga efter i dag');await expect(d.getByRole('button',{name:'Spara uppgifter'})).toBeDisabled();
  await d.getByLabel('Utbildningens exakta startdatum').fill(next);await capture(page,info,'lifecycle-edit-dialog.png');
  const r=await submit(page,'Spara uppgifter');expect(r.status()).toBe(200);
  await expect(w(page).locator('.pp-notice')).toContainText('Uppgifterna sparades');await expect(w(page).getByRole('heading',{level:2,name:'Syntetisk omdöpt SA',exact:true})).toBeVisible();
  const row=await fixture.offering(fixture.offeringId);expect(row.name).toBe('Syntetisk omdöpt SA');expect(row.cohort).toBe('Syntetisk ny kull');expect(row.start_year).toBe(Number(next.slice(0,4)));
  expect((await fixture.snapshot()).basis_reference.startedOn).toBe(next);
});

test('L04: pågående plan är låst och kan arkiveras och tas fram',async({page},info)=>{
  await fixture.startedEducation();await enter(page);await open(page,'Syntetisk pågående SA');
  await expect(w(page).locator('.ppl-lock')).toContainText('Elevkullen har börjat');
  // Vänta tills tabellen har laddats, så att frånvaron av inmatningsfält faktiskt prövas.
  const table=w(page).getByRole('region',{name:'Programplanen',exact:true});await expect(table).toContainText('Engelska',{timeout:30_000});await expect(table).toContainText('Elevkullen har börjat');
  for(const name of ['Ta bort','Ändra uppgifter','Föreslå fördelning'])await expect(w(page).getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
  await act(page,'Arkivera');expect((await submit(page,'Arkivera')).status()).toBe(200);
  await expect(w(page).locator('.pps-head [data-phase]')).toHaveText('Arkiverad · Pågående');await expect(w(page).locator('.ppl-lock')).toContainText('arkiverad');
  await expect(w(page).getByRole('region',{name:'Programplanen',exact:true})).toContainText('Engelska',{timeout:30_000});await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
  await capture(page,info,'lifecycle-archived.png');
  await w(page).getByRole('button',{name:'Alla programplaner'}).click();await expect(list(page)).toHaveAttribute('aria-busy','false',{timeout:30_000});
  await expect(row(page,'Syntetisk pågående SA')).toHaveCount(0);await list(page).getByLabel('Visa arkiverade (1)').check();await expect(row(page,'Syntetisk pågående SA')).toHaveCount(1);
  await capture(page,info,'lifecycle-archive-filter.png');
  await open(page,'Syntetisk pågående SA');await act(page,'Ta fram ur arkivet');expect((await submit(page,'Ta fram ur arkivet')).status()).toBe(200);
  await expect(w(page).locator('.pps-head [data-phase]')).toHaveText('Pågående');
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto('/');await navigate(page);await open(page,'Syntetisk pågående SA');
  for(const name of ['Arkivera','Ta bort','Ändra uppgifter'])await expect(w(page).getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(w(page).getByRole('region',{name:'Programplanen',exact:true})).toContainText('Engelska',{timeout:30_000});await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
});

test('L05: konflikt, MFA och okänt svar läser om listan innan något nytt skickas',async({page})=>{
  await enter(page);await open(page,'Syntetisk SA utan plan');
  const other=await fixture.request(baseURL,fixture.hm,LIFECYCLE,{offeringId:fixture.emptyOfferingId,expectedRevision:0,command:'update',details:{name:'Syntetisk SA utan plan',localCode:'ANNAN',cohort:'Kulltext utan startdatum',startedOn:null}});expect(other.status).toBe(200);
  await act(page,'Ändra uppgifter',false);await dialog(page).getByLabel('Elevkull').fill('Min kull');expect((await submit(page,'Spara uppgifter')).status()).toBe(409);
  await expect(w(page).locator('.pp-notice')).toContainText('har ändrats');await expect(list(page)).toHaveAttribute('aria-busy','false',{timeout:30_000});
  expect((await fixture.offering(fixture.emptyOfferingId)).cohort).toBe('Kulltext utan startdatum');
  await open(page,'Syntetisk SA utan plan');let writes=0;
  await page.route('**'+LIFECYCLE,async route=>{writes++;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.abort('failed');});
  await act(page,'Arkivera');await dialog(page).getByRole('button',{name:'Arkivera',exact:true}).click();
  await expect(w(page).locator('.pp-notice')).toContainText('kunde inte bekräftas');await expect(list(page)).toHaveAttribute('aria-busy','false',{timeout:30_000});
  expect(writes).toBe(1);expect((await fixture.offering(fixture.emptyOfferingId)).archived_at).not.toBeNull();await expect(list(page).getByLabel('Visa arkiverade (1)')).toBeVisible();
  await page.unroute('**'+LIFECYCLE);
  await fixture.cookies(page.context(),fixture.hmNoMfa,baseURL);await page.goto('/');await navigate(page);await open(page,'Syntetisk obunden SA');
  await act(page,'Ta bort');expect((await submit(page,'Ta bort')).status()).toBe(403);await expect(dialog(page)).toContainText('engångskod');
  await expect(dialog(page).getByRole('button',{name:'Ta bort',exact:true})).toBeDisabled();
  await dialog(page).getByRole('button',{name:'Avbryt'}).click();await expect(w(page).locator('.pp-notice')).toContainText('Inget har ändrats');
  expect((await fixture.offering(fixture.legacyOfferingId))?.id).toBe(fixture.legacyOfferingId);
});

test('L06: kopia med passerat startdatum stoppas i formuläret och av servern',async({page},info)=>{
  await enter(page);await open(page,'Syntetisk bunden SA');await w(page).getByRole('button',{name:'Kopiera',exact:true}).click();
  const form=w(page).getByRole('region',{name:'Kopiera till ny utbildning'});await form.getByLabel('Elevkull').fill('Syntetisk kopia');
  await form.getByLabel('Utbildningens exakta startdatum').fill(STARTED_START);await expect(form).toContainText('måste ligga efter i dag');
  await expect(form.getByRole('button',{name:'Spara kopia'})).toBeDisabled();await capture(page,info,'lifecycle-copy-past.png');
  await form.getByLabel('Utbildningens exakta startdatum').fill(FUTURE_START);await expect(form.getByRole('button',{name:'Spara kopia'})).toBeEnabled();
  // Servern är auktoritativ: ett förfalskat passerat startdatum nekas och beskedet visas.
  await page.route('**/api/programplaner/utbildning/skapa',async route=>{const body=JSON.parse(route.request().postData()??'{}');body.basisReference.startedOn=STARTED_START;await route.continue({postData:JSON.stringify(body)});});
  const pending=page.waitForResponse(matches('/api/programplaner/utbildning/skapa'));await form.getByRole('button',{name:'Spara kopia'}).click();expect((await pending).status()).toBe(400);
  await expect(form).toContainText('Utbildningen har redan startat. En ny plan kan bara skapas för en kull som inte har börjat.');
  expect((await fixture.plans(fixture.offeringId)).length).toBe(1);await page.unroute('**/api/programplaner/utbildning/skapa');
});

const schools=(page:Page)=>dialog(page).getByRole('region',{name:'Skolor',exact:true});
const schoolB=(page:Page)=>schools(page).getByRole('checkbox',{name:'Syntetisk gymnasieskola B',exact:true});
async function chooseSchools(page:Page,includeB:boolean){
  await w(page).getByRole('button',{name:'Skolor',exact:true}).click();await expect(dialog(page)).toHaveAccessibleName('Skolor');
  await expect(schools(page)).toContainText('Skapad här');
  const primary=schools(page).getByRole('checkbox',{name:/Syntetisk programplansskola/u});await expect(primary).toBeChecked();await expect(primary).toBeDisabled();
  if(includeB)await schoolB(page).check();else await schoolB(page).uncheck();
  const pending=page.waitForResponse(matches(LIFECYCLE));await dialog(page).getByRole('button',{name:'Spara skolor',exact:true}).click();
  const response=await pending;expect(response.status()).toBe(200);expect(response.request().postDataJSON().command).toBe('units');
  await expect(dialog(page)).toHaveCount(0);
  await expect(w(page).getByRole('button',{name:'Skolor',exact:true})).toBeVisible();
  await expect(w(page).getByRole('region',{name:'Programplanen',exact:true})).toContainText('Engelska',{timeout:30_000});return response;
}

test('L07: huvudmannen lägger till skola B som läser samma plan utan rätt att ändra planen',async({page},info)=>{
  const beforeB=await fixture.request(baseURL,fixture.principalB,'/api/programplaner/lista',{page:1});expect(beforeB.status).toBe(200);expect(beforeB.body.offerings.some((o:{id:string})=>o.id===fixture.offeringId)).toBe(false);
  const original=await fixture.snapshot();await enter(page);await open(page,'Syntetisk bunden SA');await chooseSchools(page,true);
  expect((await fixture.units(fixture.offeringId)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId,fixture.secondUnitId]);expect(await fixture.snapshot()).toEqual(original);
  await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await expect(list(page)).toHaveAttribute('aria-busy','false');
  await list(page).getByLabel('Skola',{exact:true}).selectOption(fixture.secondUnitId);await expect(row(page,'Syntetisk bunden SA')).toContainText('Syntetisk programplansskola + 1');await expect(row(page,'Syntetisk obunden SA')).toHaveCount(0);
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-school-filter.png');
  await fixture.cookies(page.context(),fixture.principalB,baseURL);await page.goto('/');await navigate(page);await open(page,'Syntetisk bunden SA');
  await expect(w(page)).toContainText('Planen delas med skolor utanför ditt uppdrag och kan bara läsas');
  await expect(w(page).getByRole('region',{name:'Programplanen',exact:true})).toContainText('Engelska',{timeout:30_000});
  await expect(w(page).getByRole('button',{name:/^Analys/u})).toContainText('fel');
  await w(page).getByRole('button',{name:/^Analys/u}).click();
  const analysis=w(page).getByRole('region',{name:'Analys av programplanen',exact:true});
  await expect(analysis).toContainText('Planen delas med skolor utanför ditt uppdrag');
  await expect(analysis.locator('.pps-link').filter({hasNotText:'Visa paket'})).toHaveCount(0);await expect(analysis.getByRole('button',{name:'Visa paket →',exact:true}).first()).toBeVisible();
  await analysis.getByRole('button',{name:'Tillbaka till planen',exact:true}).click();
  await expect(w(page)).toContainText('Version 1');await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
  for(const name of ['Skolor','Ändra uppgifter','Arkivera','Ta bort','Föreslå fördelning'])await expect(w(page).getByRole('button',{name,exact:true})).toHaveCount(0);
  const request={offeringId:fixture.offeringId,versionPage:1,catalogId:null},a=await fixture.request(baseURL,fixture.hm,'/api/programplaner/underlag',request),b=await fixture.request(baseURL,fixture.principalB,'/api/programplaner/underlag',request);
  expect(b.status).toBe(200);expect(b.body.versions).toEqual(a.body.versions);expect(b.body.lifecycle.units.find((u:{id:string})=>u.id===fixture.unitId).inMandate).toBe(false);
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-principal-b-readonly.png');
});

test('L08: B tas bort före kullstart, läggs till efter start och kan då inte tas bort',async({page},info)=>{
  const started=await fixture.startedEducation();await enter(page);await open(page,'Syntetisk bunden SA');await chooseSchools(page,true);await chooseSchools(page,false);
  expect((await fixture.units(fixture.offeringId)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId]);
  await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await expect(list(page)).toHaveAttribute('aria-busy','false');await open(page,'Syntetisk pågående SA');await chooseSchools(page,true);
  await w(page).getByRole('button',{name:'Skolor',exact:true}).click();await expect(schoolB(page)).toBeChecked();await expect(schoolB(page)).toBeDisabled();await expect(schools(page)).toContainText('Skolan kan inte tas bort när kullen har börjat');
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-started-removal-locked.png');
  await dialog(page).getByRole('button',{name:'Avbryt',exact:true}).click();
  // Direkta försök omfattas också av serverns statusregel.
  const startedId=started.offeringId;
  const current=await fixture.request(baseURL,fixture.hm,'/api/programplaner/underlag',{offeringId:startedId,versionPage:1,catalogId:null});
  const denied=await fixture.request(baseURL,fixture.hm,LIFECYCLE,{offeringId:startedId,expectedRevision:current.body.lifecycle.revision,command:'units',details:{unitIds:[fixture.unitId]}});
  expect(denied.status).toBe(409);expect(denied.body.code).toBe('programplan_locked');expect((await fixture.units(startedId)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId,fixture.secondUnitId]);
});

test('L10: tillagd skola med klass kan inte tas bort och kopplingen bevaras',async({page},info)=>{
  await enter(page);await open(page,'Syntetisk bunden SA');await chooseSchools(page,true);
  await fixture.addClass(fixture.offeringId,fixture.secondUnitId);const before=await fixture.offering(fixture.offeringId);
  await w(page).getByRole('button',{name:'Skolor',exact:true}).click();await expect(schoolB(page)).toBeChecked();await schoolB(page).uncheck();
  const pending=page.waitForResponse(matches(LIFECYCLE));await dialog(page).getByRole('button',{name:'Spara skolor',exact:true}).click();const r=await pending;
  expect(r.status()).toBe(409);expect((await r.json()).code).toBe('programplan_in_use');
  await expect(dialog(page)).toHaveCount(0);await expect(w(page)).toContainText('Skolan används av klasser, elevplaceringar eller timplaner och kan inte tas bort från planen.');
  await expect(list(page)).toHaveAttribute('aria-busy','false');expect(await fixture.offering(fixture.offeringId)).toEqual(before);
  expect((await fixture.units(fixture.offeringId)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId,fixture.secondUnitId]);
  await open(page,'Syntetisk bunden SA');await w(page).getByRole('button',{name:'Skolor',exact:true}).click();await expect(schoolB(page)).toBeChecked();
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-in-use-removal-denied.png');
});

test('L09: kopiering till ny elevkull bevarar skolor, innehåll och original',async({page},info)=>{
  await enter(page);await open(page,'Syntetisk bunden SA');await chooseSchools(page,true);const original=await fixture.snapshot();
  await w(page).getByRole('button',{name:'Kopiera',exact:true}).click();const form=w(page).getByRole('region',{name:'Kopiera till ny utbildning',exact:true});
  await form.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk delad kopia SA');await form.getByLabel('Elevkull',{exact:true}).fill('Syntetisk kopierad kull');await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(FUTURE_START);
  const created=page.waitForResponse(matches('/api/programplaner/utbildning/skapa')),units=page.waitForResponse(matches(LIFECYCLE));await form.getByRole('button',{name:'Spara kopia',exact:true}).click();
  const response=await created;expect(response.status()).toBe(200);const body=await response.json(),schoolResponse=await units;
  expect(schoolResponse.status()).toBe(200);expect(schoolResponse.request().postDataJSON()).toMatchObject({offeringId:body.education.id,command:'units',details:{unitIds:[fixture.unitId,fixture.secondUnitId]}});
  await expect(w(page).getByRole('heading',{name:'Syntetisk delad kopia SA',exact:true})).toBeVisible();await expect(w(page)).toContainText('Kopian sparades');
  expect((await fixture.units(body.education.id)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId,fixture.secondUnitId]);const copy=await fixture.snapshot(body.plan.id);
  expect(copy.specialization).toEqual(original.specialization);expect(copy.basis_reference).toEqual(original.basis_reference);expect(await fixture.snapshot()).toEqual(original);
  const b=await fixture.request(baseURL,fixture.principalB,'/api/programplaner/underlag',{offeringId:body.education.id,versionPage:1,catalogId:null});expect(b.status).toBe(200);expect(b.body.education.name).toBe('Syntetisk delad kopia SA');
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-copied-new-cohort.png');
  // Fel i skolsteget lämnar den redan sparade kopian och ger en konkret återhämtningsväg.
  await w(page).getByRole('button',{name:'Kopiera',exact:true}).click();const recovery=w(page).getByRole('region',{name:'Kopiera till ny utbildning',exact:true});
  await recovery.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk kopia med skolstegfel');await recovery.getByLabel('Elevkull',{exact:true}).fill('Syntetisk återhämtningskull');await recovery.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(FUTURE_START);
  await page.route('**'+LIFECYCLE,route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  const failureCreated=page.waitForResponse(matches('/api/programplaner/utbildning/skapa')),failedSchools=page.waitForResponse(matches(LIFECYCLE));await recovery.getByRole('button',{name:'Spara kopia',exact:true}).click();
  const saved=await failureCreated;expect(saved.status()).toBe(200);const partial=await saved.json();expect((await failedSchools).status()).toBe(500);
  await expect(w(page).getByRole('heading',{name:'Syntetisk kopia med skolstegfel',exact:true})).toBeVisible();await expect(w(page)).toContainText('Skolorna kunde inte kopieras och behöver väljas igen under Skolor.');
  expect((await fixture.units(partial.education.id)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId]);expect(await fixture.snapshot(partial.plan.id)).toBeTruthy();expect(await fixture.snapshot()).toEqual(original);
  await page.unroute('**'+LIFECYCLE);await chooseSchools(page,true);expect((await fixture.units(partial.education.id)).map((u:{unit_id:string})=>u.unit_id)).toEqual([fixture.unitId,fixture.secondUnitId]);
  expect(await noOverflow(page)).toBe(true);await capture(page,info,'units-copy-recovery.png');
});
