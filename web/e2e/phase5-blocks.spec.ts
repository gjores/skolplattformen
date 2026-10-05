// Stages A/B: actual HM creation followed by v2 term allocation in the ordinary workspace.
import { expect,test,type Page } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const workspace=(p:Page)=>p.getByTestId('protected-programplan-workspace');
const board=(p:Page)=>workspace(p).getByRole('region',{name:'Programplanen',exact:true});
async function navigate(page:Page,name=/^Öppna utbildning Syntetisk SA utan plan,/u) {
  await waitForHydration(page);
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');
  if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await page.getByRole('button',{name:'Programplaner',exact:true}).click();
  const list=workspace(page).getByRole('region',{name:'Alla programplaner',exact:true});
  await expect(list).toHaveAttribute('aria-busy','false');
  await list.getByRole('button',{name}).click();
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

async function enterExisting(page:Page,name=/^Öppna utbildning Syntetisk bunden SA,/u) {
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto('/');
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page,name);
}
async function saveBlocks(page:Page,region:ReturnType<Page['getByRole']>) {
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/block'&&r.request().method()==='POST');
  await region.getByRole('button',{name:'Spara block',exact:true}).click();const r=await pending;expect(r.status()).toBe(200);
  expect(await fixture.paired(r.headers()['x-correlation-id'],fixture.principal,'programplan_blocks_changed')).toBe(true);
  await expect(board(page)).toContainText('Allt sparat');return r;
}
async function editorFits(region:ReturnType<Page['getByRole']>) {
  expect(await region.evaluate(el=>{
    const clip=el.closest('.ppb-table-wrap')!.getBoundingClientRect();
    return [...el.querySelectorAll('input,button,p')].every(control=>{
      const rect=control.getBoundingClientRect();
      return rect.left>=clip.left && rect.right<=clip.right;
    });
  })).toBe(true);
}
test('B02: rektor delar IV i två block och lägger till fördjupningsram, fördelar och läser om',async({page},info)=>{
  await enterExisting(page);
  const iv=board(page).getByRole('region',{name:'Block för individuellt val',exact:true});
  await iv.getByRole('button',{name:'Dela i block',exact:true}).click();await iv.getByLabel('Poäng för block iv1',{exact:true}).fill('100');
  await iv.getByRole('button',{name:'Lägg till block',exact:true}).click();
  const name=iv.locator('input[aria-label^="Namn på block "]').last();await name.fill('Individuellt val 2');
  await editorFits(iv);
  const first=await saveBlocks(page,iv),split=await first.json();
  expect(split.basisReference.choiceBlocks.filter((b:{kind:string})=>b.kind==='individualChoice').map((b:{points:number})=>b.points)).toEqual([100,100]);
  const spec=board(page).getByRole('region',{name:'Valbara fördjupningsblock',exact:true});
  await spec.getByRole('button',{name:'Lägg till valbart block',exact:true}).click();await spec.getByRole('button',{name:'Lägg till block',exact:true}).click();
  await spec.locator('input[aria-label^="Namn på block "]').fill('Valbar profil');await spec.locator('input[aria-label^="Poäng för block "]').fill('200');
  await editorFits(spec);
  const second=await saveBlocks(page,spec),saved=await second.json(),block=saved.basisReference.choiceBlocks.find((b:{kind:string})=>b.kind==='specialization');expect(block.points).toBe(200);
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/terminer'&&r.request().method()==='POST');
  await board(page).getByRole('button',{name:'Föreslå fördelning',exact:true}).click();expect((await pending).status()).toBe(200);await expect(board(page)).toContainText('allt fördelat');
  const read=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId:fixture.planId});expect(read.status).toBe(200);
  expect(read.body.distribution.reduce((n:number,r:{points:number[]})=>n+r.points.reduce((a,b)=>a+b,0),0)).toBe(2500);
  expect(read.body.distribution.find((r:{rowKey:string})=>r.rowKey===`block:${block.id}`).points.reduce((a:number,b:number)=>a+b,0)).toBe(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('blocks-split-specialization.png');await page.screenshot({path,fullPage:true});await info.attach('blocks-split-specialization.png',{path,contentType:'image/png'});
  // Orphans are refused locally before sending a write, even for a writable future draft.
  let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/block')writes++;});
  await spec.getByRole('button',{name:'Lägg till valbart block',exact:true}).click();await spec.getByRole('button',{name:'Ta bort block Valbar profil',exact:true}).click();
  await expect(spec).toContainText('Töm blockets terminsfördelning och spara först.');expect(writes).toBe(0);await spec.getByRole('button',{name:'Avbryt blockändring',exact:true}).click();
  await page.reload();await navigate(page,/^Öppna utbildning Syntetisk bunden SA,/u);
  await expect(board(page).locator(`tr[data-row-key="block:${block.id}"]`)).toContainText('Valbar profil');
  const persisted=await fixture.request(baseURL,fixture.hm,'/api/programplaner/terminer/lasa',{planId:fixture.planId});expect(persisted.body.distribution).toEqual(read.body.distribution);
});

test('B03: äldre fastställd version är Ofullständig, ny version får svenska och behåller gamla IV-poäng',async({page},info)=>{
  await fixture.seedLegacyBound();const before=await fixture.snapshot(fixture.legacyPlanId),history=await fixture.history(fixture.legacyPlanId);
  await enterExisting(page,/^Öppna utbildning Syntetisk obunden SA,/u);await expect(workspace(page).locator('.pp-status')).toContainText('Ofullständig');
  await expect(board(page).locator('tr[data-row-key^="alternative:"]')).toHaveCount(0);
  await workspace(page).getByRole('button',{name:'Skapa ny version',exact:true}).click();
  const draft=workspace(page).getByRole('region',{name:'Skapa ny version',exact:true});await expect(draft.locator('tr[data-row-key^="alternative:"]')).toHaveCount(3);
  await workspace(page).getByRole('button',{name:'Spara utkast',exact:true}).click();
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/klona'&&r.request().method()==='POST');
  await draft.getByRole('region',{name:'Kontrollera före sparning'}).getByRole('button',{name:/^Spara (utkast|ändå)$/u}).click();const response=await pending;expect(response.status()).toBe(200);const clone=await response.json();
  expect(clone.version).toBe(2);expect(await fixture.paired(response.headers()['x-correlation-id'],fixture.principal,'programplan_draft_cloned',clone.id)).toBe(true);
  await expect(draft).toHaveCount(0);await expect(board(page).locator('tr[data-row-key^="alternative:"]')).toHaveCount(3);await expect(workspace(page).locator('.pp-status')).not.toContainText('Ofullständig');
  const reread=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId:clone.id});expect(reread.status).toBe(200);expect(reread.body.distribution).toContainEqual({rowKey:'block:iv1',points:[0,0,50,50,50,50]});
  expect(await fixture.snapshot(fixture.legacyPlanId)).toEqual(before);expect(await fixture.history(fixture.legacyPlanId)).toEqual(history);
  const path=info.outputPath('legacy-new-version-swedish.png');await page.screenshot({path,fullPage:true});await info.attach('legacy-new-version-swedish.png',{path,contentType:'image/png'});
});
