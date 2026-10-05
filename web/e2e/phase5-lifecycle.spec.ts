// 05-20: programplanens livscykel. Verklig Worker/SQL, egen syntetisk kund per fall;
// webbläsaren injicerar bara transportfel. Status kommer alltid från serverns lifecycle.
import { expect,test,type Page,type Response,type TestInfo } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
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
