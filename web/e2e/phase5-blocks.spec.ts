// Stage A: actual HM creation followed by v2 term allocation in the ordinary workspace.
import { expect,test,type Page } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const workspace=(p:Page)=>p.getByTestId('protected-programplan-workspace');
const board=(p:Page)=>workspace(p).getByRole('region',{name:'Programplanen',exact:true});
async function navigate(page:Page) {
  await waitForHydration(page);
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');
  if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await page.getByRole('button',{name:'Programplaner',exact:true}).click();
  const list=workspace(page).getByRole('region',{name:'Alla programplaner',exact:true});
  await expect(list).toHaveAttribute('aria-busy','false');
  await list.getByRole('button',{name:/^Öppna utbildning Syntetisk SA utan plan,/u}).click();
  await expect(board(page)).toBeVisible();await expect(board(page)).toContainText('Allt sparat');
}
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});
test('B01: ny SA25 visar svenska och valbara block, sparar 2 500 poäng och läser om samma fördelning',async({page},info)=>{
  const basis=fixture.choiceBasis();
  const created=await fixture.request(baseURL,fixture.hm,'/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:basis});
  expect(created.status).toBe(200);expect(created.body.basisReference).toEqual(basis);
  expect(await fixture.paired(created.correlationId,fixture.hm,'programplan_draft_created',created.body.id)).toBe(true);
  await fixture.cookies(page.context(),fixture.hm,baseURL);await page.goto('/');
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page);
  await expect(board(page)).toContainText('2 500');
  for(const level of [1,2,3]) {
    const row=board(page).locator('tr[data-row-key^="alternative:"]').filter({hasText:`Nivå ${level}`});
    await expect(row).toHaveCount(1);await expect(row).toContainText('Svenska/svenska som andraspråk');
  }
  await expect(board(page)).toContainText('Moderna språk');await expect(board(page)).toContainText('Valbart block');
  const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/terminer'&&r.request().method()==='POST');
  await board(page).getByRole('button',{name:'Föreslå fördelning',exact:true}).click();const response=await saved;
  expect(response.status()).toBe(200);
  expect(await fixture.paired(response.headers()['x-correlation-id'],fixture.hm,'programplan_terms_changed',created.body.id)).toBe(true);
  await expect(board(page)).toContainText('Allt sparat');await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');
  const read=await fixture.request(baseURL,fixture.hm,'/api/programplaner/terminer/lasa',{planId:created.body.id});
  expect(read.status).toBe(200);expect(read.body.revision).toBe(1);
  expect(await fixture.paired(read.correlationId,fixture.hm,'programplan_terms_read',created.body.id)).toBe(true);
  const rows=read.body.distribution as {rowKey:string;points:number[]}[];
  expect(rows.reduce((sum,r)=>sum+r.points.reduce((a,b)=>a+b,0),0)).toBe(2500);
  expect(rows.filter(r=>r.rowKey.startsWith('alternative:'))).toHaveLength(3);
  expect(rows.find(r=>r.rowKey==='block:mosp')?.points.reduce((a,b)=>a+b,0)).toBe(200);
  expect(rows.find(r=>r.rowKey==='block:iv1')?.points.reduce((a,b)=>a+b,0)).toBe(200);
  expect(rows.some(r=>r.rowKey==='meta:individualChoice')).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('new-sa-full-points.png');await page.screenshot({path,fullPage:true});await info.attach('new-sa-full-points.png',{path,contentType:'image/png'});
  await page.reload();await navigate(page);await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');
  const reread=await fixture.request(baseURL,fixture.hm,'/api/programplaner/terminer/lasa',{planId:created.body.id});
  expect(reread.status).toBe(200);expect(reread.body).toEqual(read.body);
});
