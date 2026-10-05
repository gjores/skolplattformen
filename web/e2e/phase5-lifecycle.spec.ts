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
  for(const name of ['Ta bort','Ändra uppgifter','Föreslå fördelning'])await expect(w(page).getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
  await act(page,'Arkivera');expect((await submit(page,'Arkivera')).status()).toBe(200);
  await expect(w(page).locator('.pps-head [data-phase]')).toHaveText('Arkiverad · Pågående');await expect(w(page).locator('.ppl-lock')).toContainText('arkiverad');
  await capture(page,info,'lifecycle-archived.png');
  await w(page).getByRole('button',{name:'Alla programplaner'}).click();await expect(list(page)).toHaveAttribute('aria-busy','false',{timeout:30_000});
  await expect(row(page,'Syntetisk pågående SA')).toHaveCount(0);await list(page).getByLabel('Visa arkiverade (1)').check();await expect(row(page,'Syntetisk pågående SA')).toHaveCount(1);
  await capture(page,info,'lifecycle-archive-filter.png');
  await open(page,'Syntetisk pågående SA');await act(page,'Ta fram ur arkivet');expect((await submit(page,'Ta fram ur arkivet')).status()).toBe(200);
  await expect(w(page).locator('.pps-head [data-phase]')).toHaveText('Pågående');
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto('/');await navigate(page);await open(page,'Syntetisk pågående SA');
  for(const name of ['Arkivera','Ta bort','Ändra uppgifter'])await expect(w(page).getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(w(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
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
