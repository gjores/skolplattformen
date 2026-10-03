// Actual Worker/SQL. Owned synthetic customer per case; browser intercepts only transport failure.
import { expect,test,type Page,type Response,type TestInfo } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3058';
const w=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const card=(page:Page)=>w(page).getByRole('region',{name:'Årskurser och terminer',exact:true});
const matches=(path:string)=>(r:Response)=>new URL(r.url()).pathname===path&&r.request().method()==='POST';
const distribution=[{rowKey:'specialization:ENGE:1:ENGE3000X',points:[50,50,0,0,0,0]}];
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});
async function navigate(page:Page){await waitForHydration(page);const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();await page.getByRole('button',{name:'Programplaner',exact:true}).click();}
async function enter(page:Page,session=fixture.principal){await fixture.cookies(page.context(),session,baseURL);await page.goto('/');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page);await expect(w(page).getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u})).toBeVisible();await w(page).getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u}).click();await expect(card(page).getByRole('button',{name:'Fördela poäng',exact:true})).toBeEnabled();}
async function edit(page:Page){await card(page).getByRole('button',{name:'Fördela poäng',exact:true}).click();await expect(card(page).getByRole('region',{name:'Poäng per årskurs och termin',exact:true})).toBeVisible();}
const field=(page:Page,term='Åk 1 HT')=>card(page).getByLabel(`Engelska · Nivå 3, ${term}`,{exact:true});
async function save(page:Page,label='Spara fördelning'){const pending=page.waitForResponse(matches('/api/programplaner/terminer'));await card(page).getByRole('button',{name:label,exact:true}).click();return pending;}
async function paired(r:Response){expect(await fixture.paired(r.headers()['x-correlation-id'],fixture.principal,'programplan_terms_changed')).toBe(true);}
async function capture(page:Page,info:TestInfo,name:string){const path=info.outputPath(name);await card(page).scrollIntoViewIfNeeded();await card(page).screenshot({path});await info.attach(name,{path,contentType:'image/png'});}
async function read(){const r=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId:fixture.planId});expect(r.status).toBe(200);return r.body;}

test('01: sex terminer, poängsummor, verkligt sparande och omläsning',async({page},info)=>{
  await enter(page);await edit(page);await field(page).focus();await page.keyboard.type('50');await field(page,'Åk 1 VT').fill('50');
  const mobile=info.project.name==='terms-phone';if(mobile)await card(page).getByRole('button',{name:'Årskurs 2',exact:true}).click();
  await card(page).getByLabel('Individuellt val · Ram för individuellt val, Åk 2 HT',{exact:true}).fill('100');
  if(mobile)await card(page).getByRole('button',{name:'Årskurs 3',exact:true}).click();
  await card(page).getByLabel('Gymnasiearbete · Gymnasiearbete, Åk 3 VT',{exact:true}).fill('100');
  await expect(card(page).locator('.ppt-year').nth(0)).toContainText('100');await expect(card(page).locator('.ppt-year').nth(1)).toContainText('100');await expect(card(page).locator('.ppt-year').nth(2)).toContainText('100');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await capture(page,info,'terms-editor.png');const r=await save(page);expect(r.status()).toBe(200);await paired(r);await expect(card(page)).toContainText('Terminsfördelningen sparades');
  const actual=await read();expect(actual.revision).toBe(1);expect(actual.distribution).toContainEqual(distribution[0]);expect(actual.distribution).toContainEqual({rowKey:'meta:individualChoice',points:[0,0,100,0,0,0]});expect(actual.distribution).toContainEqual({rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]});
  await page.reload();await navigate(page);await w(page).getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u}).click();await expect(card(page).getByRole('button',{name:'Fördela poäng',exact:true})).toBeEnabled();await expect(card(page).locator('.ppt-progress')).toContainText('300');await capture(page,info,'terms-saved.png');
});
test('02: överfördelning, decimaler och avbryt med osparade värden',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('101');await expect(field(page)).toHaveAttribute('aria-invalid','true');await expect(card(page).getByRole('button',{name:'Spara fördelning',exact:true})).toBeDisabled();
  await field(page).fill('0.5');await expect(card(page).getByRole('button',{name:'Spara fördelning',exact:true})).toBeDisabled();await field(page).fill('50');
  const pending=page.waitForEvent('dialog');await card(page).getByRole('button',{name:'Avbryt',exact:true}).click();await(await pending).dismiss();await expect(field(page)).toHaveValue('50');
  const leaving=page.waitForEvent('dialog');await card(page).getByRole('button',{name:'Avbryt',exact:true}).click();await(await leaving).accept();await expect(card(page).getByRole('button',{name:'Fördela poäng',exact:true})).toBeVisible();expect((await read()).distribution).toEqual([]);
});
test('03: verklig konkurrerande revision, jämförelse och uttryckligt omsparande',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('50');const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/terminer',{planId:fixture.planId,expectedRevision:0,distribution:[{rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]}]});expect(other.status).toBe(200);
  const r=await save(page);expect(r.status()).toBe(409);await expect(field(page)).toHaveValue('50');await expect(card(page)).toContainText('Någon har ändrat planen');await card(page).locator('.ppt-comparison summary').click();await expect(card(page).locator('.ppt-comparison')).toContainText('Gymnasiearbete');
  const retry=await save(page,'Spara min fördelning');expect(retry.status()).toBe(200);await paired(retry);expect((await read()).revision).toBe(2);expect((await read()).distribution).toEqual([{rowKey:distribution[0].rowKey,points:[50,0,0,0,0,0]}]);
});
test('04: loggfel och MFA lämnar inmatningen kvar utan skrivning',async({page})=>{
  await enter(page,fixture.noMfa);await edit(page);await field(page).fill('50');const r=await save(page);expect(r.status()).toBe(403);await expect(card(page)).toContainText('engångskod');await expect(field(page)).toHaveValue('50');expect((await read()).revision).toBe(0);
  await fixture.cookies(page.context(),fixture.principal,baseURL);page.once('dialog',d=>d.accept());await page.reload();await navigate(page);await w(page).getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u}).click();await expect(card(page).getByRole('button',{name:'Fördela poäng',exact:true})).toBeEnabled();await edit(page);await field(page).fill('50');
  await fixture.auditFailure('db','programplan_terms_changed');const failure=await save(page);expect(failure.status()).toBe(500);await expect(field(page)).toHaveValue('50');await fixture.clearAuditFailure();expect((await read()).revision).toBe(0);expect((await read()).distribution).toEqual([]);
});
test('05: tappat svar efter commit återläses utan dubbel skrivning',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('50');let writes=0;
  await page.route('**/api/programplaner/terminer',async route=>{writes++;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.abort('failed');});
  await card(page).getByRole('button',{name:'Spara fördelning',exact:true}).click();await expect(card(page)).toContainText('Inget nytt sparande behövs');expect(writes).toBe(1);expect((await read()).revision).toBe(1);
});
test('06: okänd sparstatus låser omsparande tills läsning lyckas',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('50');let writes=0;
  await page.route('**/api/programplaner/terminer/lasa',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  await page.route('**/api/programplaner/terminer',async route=>{writes++;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.abort('failed');});await card(page).getByRole('button',{name:'Spara fördelning',exact:true}).click();
  await expect(card(page).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeVisible();await expect(field(page)).toHaveValue('50');await expect(field(page)).toBeDisabled();await page.unroute('**/api/programplaner/terminer/lasa');await card(page).getByRole('button',{name:'Läs sparstatus',exact:true}).click();await expect(card(page)).toContainText('Inget nytt sparande behövs');expect(writes).toBe(1);
});
test('07: nivåborttagning kräver rensning av fördelning först',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('50');expect((await save(page)).status()).toBe(200);await expect(card(page).getByRole('button',{name:'Fördela poäng',exact:true})).toBeEnabled();
  await w(page).getByRole('button',{name:'Ändra fördjupning',exact:true}).click();const editor=w(page).locator('.pp-draft-sheet');await editor.getByRole('button',{name:'Ta bort ENGE3000X',exact:true}).click();await w(page).getByRole('button',{name:'Spara utkast',exact:true}).click();await editor.getByRole('region',{name:'Kontrollera före sparning'}).getByRole('button',{name:/^Spara (utkast|ändå)$/u}).click();await expect(editor).toContainText('rensa först');expect((await read()).distribution[0].points[0]).toBe(50);
});
test('08: ändrat innehåll och återkallat mandat stoppar gammalt formulär',async({page})=>{
  await enter(page);await edit(page);await field(page).fill('50');const changed=await fixture.request(baseURL,fixture.second,'/api/programplaner/fordjupning',{planId:fixture.planId,expectedRevision:0,specializationRefs:[]});expect(changed.status).toBe(200);expect((await save(page)).status()).toBe(409);await expect(card(page)).toContainText('innehåll eller status har ändrats');await expect(field(page)).toHaveValue('50');await expect(card(page).getByRole('button',{name:'Spara fördelning',exact:true})).toBeDisabled();
  await fixture.revokeParent();page.on('dialog',d=>d.accept());await page.getByRole('button',{name:'Logga ut',exact:true}).click();await expect(w(page)).toHaveCount(0);
});
