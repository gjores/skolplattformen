// Verklig byggd protected-Worker och egen syntetisk PostgreSQL-fixtur perfall.
// Sessionscookies mintas lokalt; detta är inget interaktivt IdP-/pilotbevis.
import { expect, test, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';
import { createTimplanBrowserFixture, verifyBrowserTarget } from '../../work/pilot/phase5-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';

type Fixture = Awaited<ReturnType<typeof createTimplanBrowserFixture>>;
type Session = Fixture['principal'];
let fixture: Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3056';
const workspace=(page: Page)=>page.getByTestId('protected-timplan-workspace');
const matches=(path: string)=>(response: Response)=>new URL(response.url()).pathname===path && response.request().method()==='POST';
const mainPlan='Öppna Syntetisk grundskola, Syntetiskt prov, version 1';
const imPlan='Öppna Syntetisk IM, Syntetiskt prov, version 1';
const lockedPlan='Öppna Syntetisk grundskola, Syntetiskt prov, version 2';

test.beforeAll(async({browserName},testInfo)=>{
  const proof=await verifyBrowserTarget(baseURL);
  await testInfo.attach('source-build.json',{body:JSON.stringify({...proof,browserName,scope:'local-synthetic-only'}),contentType:'application/json'});
});
test.beforeEach(async()=>{ fixture=undefined!; fixture=await createTimplanBrowserFixture(); });
test.afterEach(async()=>{ await fixture?.cleanup(); });

async function navigate(page: Page,label: string) {
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();
  await waitForHydration(page);
  const button=page.getByRole('button',{name:label,exact:true});
  const bounds=await button.isVisible()?await button.boundingBox():null;
  const width=page.viewportSize()?.width??1440;
  if(!bounds || bounds.x<0 || bounds.x+bounds.width>width) {
    await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  }
  await button.click();
}
function planChoice(page:Page,label:string) {
  return workspace(page).getByRole('button',{name:new RegExp(`^${label}(?:,|$)`,'u')});
}
async function enter(page: Page,session=fixture.principal) {
  await fixture.cookies(page.context(),session,baseURL);
  await page.goto('/');
  await waitForHydration(page);
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();
  const listed=page.waitForResponse(matches('/api/timplaner/lista'));
  await navigate(page,'Timplaner');
  expect((await listed).status()).toBe(200);
  await expect(workspace(page)).toBeVisible();
}
async function open(page: Page,label=mainPlan) {
  const read=page.waitForResponse(matches('/api/timplaner/lasa'));
  await planChoice(page,label).click();
  const response=await read;
  expect(response.status()).toBe(200);
  await expect(workspace(page).getByRole('region',{name:'Undervisningstid per ämne'})).toBeVisible();
  return response;
}
async function edit(page: Page,value: number,current=100,column='Åk 9') {
  await workspace(page).getByRole('button',{name:`Ändra Matematik, ${column}, ${current} timmar`,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Ändra undervisningstid'});
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox',{name:/^Timmar/u}).fill(String(value));
  return dialog;
}
async function save(page: Page) {
  const response=page.waitForResponse(matches('/api/timplaner/cell'));
  await page.getByRole('button',{name:'Spara ändring',exact:true}).click();
  return response;
}
async function denyDiscard(page: Page,action:()=>Promise<unknown>) {
  const dialog=page.waitForEvent('dialog');
  const operation=action();
  const prompt=await dialog;
  expect(prompt.type()).toBe('confirm');
  await prompt.dismiss();
  await operation;
}
async function acceptDiscard(page: Page,action:()=>Promise<unknown>) {
  const dialog=page.waitForEvent('dialog');
  const operation=action();
  const prompt=await dialog;
  expect(prompt.type()).toBe('confirm');
  await prompt.accept();
  await operation;
}
async function noStoredPlanId(page: Page) {
  expect(new URL(page.url()).search+new URL(page.url()).hash).not.toContain(fixture.planId);
  const storage=await page.evaluate(()=>{
    const values=(storage:Storage)=>Array.from({length:storage.length},(_,index)=>{
      const key=storage.key(index);return [key,key===null?null:storage.getItem(key)];
    });
    return JSON.stringify({local:values(localStorage),session:values(sessionStorage)});
  });
  expect(storage).not.toContain(fixture.planId);
  expect(storage).not.toContain(fixture.imPlanId);
}
async function pairedResponse(response: Response,session: Session,action: string,plan=fixture.planId) {
  const correlationId=response.headers()['x-correlation-id'];
  expect(correlationId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(await fixture.paired(correlationId,session,action,plan)).toBe(true);
}
async function dialogTargets(dialog:Locator,testInfo:TestInfo,name:string) {
  // Mät pekytan efter dialogens korta öppningsanimation, inte dess skalade bild.
  await dialog.evaluate(async element=>{
    await Promise.all(element.getAnimations().map(animation=>animation.finished.catch(()=>undefined)));
  });
  const targets=await dialog.locator('input,button').evaluateAll(elements=>elements.map(el=>{
    const rect=el.getBoundingClientRect();
    return {tag:el.tagName,label:el.getAttribute('aria-label')??el.textContent?.trim()??'',width:rect.width,height:rect.height};
  }).filter(target=>target.width>0 && target.height>0));
  await testInfo.attach(`${name}-targets.json`,{body:JSON.stringify(targets),contentType:'application/json'});
  expect(targets.filter(target=>target.width<44 || target.height<44)).toEqual([]);
}

test('10: skolformsanpassat regelstöd, källor och påminnelse vid ändring',async({page},testInfo)=>{
  await enter(page);
  await open(page);
  const guidance=workspace(page).getByRole('complementary',{name:'Regelstöd för timplanen'});
  await expect(guidance.getByText('Sparat betyder inte regelkontrollerat.',{exact:true})).toBeVisible();
  const summary=guidance.locator('summary');
  await expect(summary).toHaveText('Regler och ansvar för grundskolan');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(guidance.getByText(/högst 20 procent/u)).toBeVisible();
  await expect(guidance.getByText(/6 890 timmar/u)).toBeVisible();
  await expect(guidance.getByText(/efter rektors förslag/u)).toBeVisible();
  await expect(guidance.getByText(/Appen väljer ännu inte regelversion/u)).toBeVisible();
  await expect(guidance.getByRole('link',{name:'Skolverkets timplan',exact:true})).toHaveAttribute('href','https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan');
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await summary.scrollIntoViewIfNeeded();
  await testInfo.attach('grundskola-regelstod.png',{body:await page.screenshot(),contentType:'image/png'});
  const dialog=await edit(page,101);
  await expect(dialog.getByText(/Kontrollera ämnesramarna och huvudmannens beslut/u)).toBeVisible();
  await expect(dialog.getByText(/Sparningen är ingen kontroll av hela regelverket/u)).toBeVisible();
  await acceptDiscard(page,()=>dialog.getByRole('button',{name:'Avbryt',exact:true}).click());
  await workspace(page).getByRole('button',{name:'Alla timplaner',exact:true}).click();
  await open(page,imPlan);
  await expect(summary).toHaveText('Regler och ansvar för introduktionsprogram');
  // Planbyte kan återanvända details-elementets öppna läge. Öppna bara om stängt.
  if(!await guidance.locator('details').evaluate(element=>(element as HTMLDetailsElement).open))await summary.click();
  await expect(guidance.getByText(/minst 23 timmars undervisning/u)).toBeVisible();
  await expect(guidance.getByText(/Rektor beslutar hur undervisningstiden/u)).toBeVisible();
  await expect(guidance.getByText(/högst 20 procent/u)).toHaveCount(0);
  await expect(guidance.getByRole('link',{name:'Skolverkets timplan',exact:true})).toHaveCount(0);
  await expect(guidance.getByRole('link',{name:'Skolverkets regler om undervisningstid och ansvar',exact:true})).toHaveAttribute('href','https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await summary.scrollIntoViewIfNeeded();
  await testInfo.attach('im-regelstod.png',{body:await page.screenshot(),contentType:'image/png'});
  await workspace(page).getByRole('button',{name:/^Ändra Matematik, grundskolenivå,/u}).click();
  const imDialog=page.getByRole('dialog',{name:'Ändra undervisningstid'});
  await expect(imDialog.getByText(/Ändringen påverkar veckofördelningen/u)).toBeVisible();
  await imDialog.getByRole('textbox',{name:'Timmar per vecka',exact:true}).fill('11');
  await page.route('**/api/timplaner/cell',async route=>{
    const actual=await route.fetch();expect(actual.status()).toBe(200);
    await route.abort('failed');
  });
  await page.route('**/api/timplaner/lasa',async route=>{
    const actual=await route.fetch();expect(actual.status()).toBe(200);
    await route.abort('failed');
  });
  await imDialog.getByRole('button',{name:'Spara ändring',exact:true}).click();
  await expect(imDialog).toContainText('Aktuell timplan kunde inte läsas.');
  await expect(imDialog.getByText(/Ändringen påverkar veckofördelningen/u)).toBeVisible();
  await expect(imDialog.getByText(/Kontrollera ämnesramarna och huvudmannens beslut/u)).toHaveCount(0);
  await page.unroute('**/api/timplaner/cell');
  await page.unroute('**/api/timplaner/lasa');
});

test('01: rätt kolumnordning, IM-enhet, saknat underlag och mobilpresentation',async({page},testInfo)=>{
  await enter(page);
  const response=await open(page);
  await pairedResponse(response,fixture.principal,'timplan_read');
  await expect(workspace(page)).toContainText('Syntetisk skola 30');
  await expect(workspace(page)).toContainText('Syntetisk grundskola');
  const columns=await workspace(page).getByRole('columnheader').allTextContents();
  expect(columns.filter(text=>/^Åk [149]$/u.test(text.trim()))).toEqual(['Åk 9','Åk 1','Åk 4']);
  await expect(workspace(page)).toContainText(/saknas/iu);
  await expect(workspace(page).getByRole('button',{name:/Ändra Bild/})).toHaveCount(0);
  await noStoredPlanId(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  const targets=await workspace(page).locator('button,input,select').evaluateAll(elements=>elements.filter(el=>{
    const rect=el.getBoundingClientRect();return rect.width>0 && rect.height>0 && (rect.width<44 || rect.height<44);
  }).map(el=>{const rect=el.getBoundingClientRect();return {label:el.getAttribute('aria-label')??el.textContent?.trim(),width:rect.width,height:rect.height};}));
  expect(targets).toEqual([]);
  await page.screenshot({path:testInfo.outputPath('grundskola.png'),fullPage:true});
  const listed=page.waitForResponse(matches('/api/timplaner/lista'));
  await workspace(page).getByRole('button',{name:'Alla timplaner',exact:true}).click();
  expect((await listed).status()).toBe(200);
  const im=page.waitForResponse(matches('/api/timplaner/lasa'));
  await planChoice(page,imPlan).click();
  expect((await im).status()).toBe(200);
  await expect(workspace(page)).toContainText('Per vecka');
  await expect(workspace(page)).toContainText('timmar per vecka');
  await expect(workspace(page).getByRole('button',{name:/Ändra Matematik, grundskolenivå, Per vecka, 5/})).toBeVisible();
  await noStoredPlanId(page);
  await page.screenshot({path:testInfo.outputPath('introduktionsprogram.png'),fullPage:true});
});

test('02: vald cell sparas en gång med faktisk revision, dubbel audit och omläsning',async({page},testInfo)=>{
  await enter(page);await open(page);
  const before=await fixture.snapshot();
  await edit(page,111);
  await dialogTargets(page.getByRole('dialog',{name:'Ändra undervisningstid'}),testInfo,'draft');
  await page.getByRole('dialog',{name:'Ändra undervisningstid'}).screenshot({path:testInfo.outputPath('cell-draft.png')});
  const response=await save(page);
  expect(response.status()).toBe(200);
  await pairedResponse(response,fixture.principal,'timplan_cell_changed');
  await expect(workspace(page)).toContainText('Ändringen sparades.');
  const after=await fixture.snapshot();
  expect(after.revision).toBe(before.revision+1);
  expect(after.cells).toEqual({...before.cells,matematik:[111,200,300]});
  await page.reload();await navigate(page,'Timplaner');
  await open(page);
  await expect(workspace(page).getByRole('button',{name:'Ändra Matematik, Åk 9, 111 timmar',exact:true})).toBeVisible();
  expect((await fixture.snapshot()).revision).toBe(after.revision);
});

test('03: huvudman och fastställd version är läsning utan redigering',async({page})=>{
  await enter(page,fixture.hm);
  let read=page.waitForResponse(matches('/api/timplaner/lasa'));
  await planChoice(page,mainPlan).click();
  expect((await read).status()).toBe(200);
  await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.reload();
  await navigate(page,'Timplaner');
  read=page.waitForResponse(matches('/api/timplaner/lasa'));
  await planChoice(page,lockedPlan).click();
  expect((await read).status()).toBe(200);
  await expect(workspace(page)).toContainText('Fastställd');
  await expect(workspace(page).getByRole('button',{name:/^Ändra /u})).toHaveCount(0);
  expect((await fixture.snapshot(fixture.lockedPlanId)).revision).toBe(0);
});

test('04: verklig revisionskonflikt läses om och skrivs bara efter uttryckligt val',async({page},testInfo)=>{
  await enter(page);await open(page);await edit(page,333);
  const other=await fixture.request(baseURL,fixture.second,'/api/timplaner/cell',{
    planId:fixture.planId,expectedRevision:0,rowId:'matematik',columnIndex:0,hours:222,
  });
  expect(other.status).toBe(200);
  expect(await fixture.paired(other.correlationId,fixture.second,'timplan_cell_changed')).toBe(true);
  let writes=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/timplaner/cell')writes++;});
  const response=await save(page);
  expect(response.status()).toBe(409);
  expect((await fixture.snapshot()).cells.matematik[0]).toBe(222);
  const denied=await fixture.events(response.headers()['x-correlation-id']);
  expect(denied).toHaveLength(1);
  expect(denied[0].outcome).toBe('denied');expect(denied[0].details.code).toBe('conflict');
  expect(denied[0].session_id).toBe(fixture.principal.id);
  // UI gör en riktig auditerad omläsning efter409, men aldrig automatisk write.
  await expect(page.getByRole('dialog')).toContainText('Aktuellt värde');
  await expect(page.getByRole('dialog')).toContainText('222');
  await expect(page.getByRole('dialog')).toContainText('333');
  await dialogTargets(page.getByRole('dialog',{name:'Ändra undervisningstid'}),testInfo,'compare');
  await page.getByRole('dialog',{name:'Ändra undervisningstid'}).screenshot({path:testInfo.outputPath('cell-compare.png')});
  expect(writes).toBe(1);expect((await fixture.snapshot()).revision).toBe(1);
  const retry=page.waitForResponse(matches('/api/timplaner/cell'));
  await page.getByRole('button',{name:'Använd min ändring',exact:true}).click();
  const retried=await retry;expect(retried.status()).toBe(200);
  await pairedResponse(retried,fixture.principal,'timplan_cell_changed');
  expect(writes).toBe(2);
  expect((await fixture.snapshot()).cells.matematik).toEqual([333,200,300]);
  expect((await fixture.snapshot()).revision).toBe(2);
});

test('05: osparat skydd vid dialogstängning och byte till annan plan',async({page})=>{
  await fixture.addPrincipalContext();
  await enter(page);await open(page);await edit(page,444);
  // Den modala dialogen blockerar bakomliggande plan-/sidebar-/sidval.
  await expect(page.getByRole('dialog',{name:'Ändra undervisningstid'})).toHaveAttribute('aria-modal','true');
  await expect(page.locator('#uppdrag')).toHaveCount(1);
  await expect(page.getByRole('combobox',{name:'Uppdrag',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Mandat',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Alla timplaner',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/^(Nästa|Föregående)$/u})).toHaveCount(0);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(()=>Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  await denyDiscard(page,()=>page.getByRole('button',{name:'Avbryt',exact:true}).click());
  await expect(page.getByRole('textbox',{name:/^Timmar/u})).toHaveValue('444');
  await denyDiscard(page,()=>page.keyboard.press('Escape'));
  await expect(workspace(page)).toBeVisible();
  await expect(page.getByRole('textbox',{name:/^Timmar/u})).toHaveValue('444');
  // Plattformens beforeunload-guard är registrerat även i telefonens WebKit.
  expect(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(false);
  await acceptDiscard(page,()=>page.getByRole('button',{name:'Avbryt',exact:true}).click());
  await expect(page.getByRole('dialog',{name:'Ändra undervisningstid'})).toHaveCount(0);
  const listed=page.waitForResponse(matches('/api/timplaner/lista'));
  await workspace(page).getByRole('button',{name:'Alla timplaner',exact:true}).click();
  expect((await listed).status()).toBe(200);
  const read=page.waitForResponse(matches('/api/timplaner/lasa'));
  await planChoice(page,imPlan).click();
  expect((await read).status()).toBe(200);
  await expect(page.getByRole('dialog',{name:'Ändra undervisningstid'})).toHaveCount(0);
  expect((await fixture.snapshot()).revision).toBe(0);
});

test('06: MFA och obligatoriskt loggfel ger ingen falsk sparbekräftelse',async({page})=>{
  await enter(page,fixture.noMfa);await open(page);await edit(page,555);
  const noMfa=await save(page);expect(noMfa.status()).toBe(403);
  await expect(page.getByText(/engångskod/iu).first()).toBeVisible();
  expect((await fixture.snapshot()).revision).toBe(0);
  await fixture.cookies(page.context(),fixture.principal,baseURL);
  page.once('dialog',dialog=>dialog.accept());await page.reload();
  await navigate(page,'Timplaner');await open(page);await edit(page,555);
  for(const source of ['db','worker'] as const){
    await fixture.auditFailure(source);
    try {
      const response=await save(page);expect(response.status()).toBe(500);
      expect((await response.json()).code).toBe('audit_unavailable');
      await expect(page.getByRole('dialog')).toContainText(/logg|spar|åtgärd/iu);
      await expect(page.getByRole('textbox',{name:/^Timmar/u})).toHaveValue('555');
      expect((await fixture.snapshot()).revision).toBe(0);
      expect((await fixture.snapshot()).cells.matematik[0]).toBe(100);
      const success=(await fixture.events(response.headers()['x-correlation-id'])).filter((event:{outcome:string})=>event.outcome==='ok');
      expect(success).toHaveLength(0);
    } finally {await fixture.clearAuditFailure();}
  }
});

test('07: session, epoch och återkallat mandat rensar uppgifter och sena verkliga svar',async({page})=>{
  await enter(page);
  let release!:()=>void;
  const released=new Promise<void>(resolve=>{release=resolve;});
  let received!:()=>void;
  const arrived=new Promise<void>(resolve=>{received=resolve;});
  await page.route('**/api/timplaner/lasa',async route=>{
    const response=await route.fetch();expect(response.status()).toBe(200);received();
    await released;
    await route.fulfill({response}).catch(()=>{ /* Abort efter riktig utloggning är avsedd. */ });
  });
  const pendingOpen=planChoice(page,mainPlan).click();
  await arrived;await pendingOpen;
  await page.getByRole('button',{name:'Logga ut',exact:true}).click();
  await expect(workspace(page)).toHaveCount(0);
  release();await page.unroute('**/api/timplaner/lasa');
  await expect(page.getByRole('heading',{name:/Logga in/iu})).toBeVisible();
  await expect(workspace(page)).toHaveCount(0);

  await enter(page,fixture.second);await open(page);await edit(page,666);
  await fixture.advanceEpoch(fixture.second);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await expect(workspace(page)).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toContainText(/Kontexten ändrades/iu);

  await enter(page,fixture.noMfa);await open(page);
  await fixture.expire(fixture.noMfa);
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await expect(workspace(page)).toHaveCount(0);
  await expect(page.getByRole('heading',{name:/Logga in/iu})).toBeVisible();

  fixture.principal=await fixture.newPrincipal();
  await enter(page,fixture.principal);
  await open(page);await edit(page,666);await fixture.revokeParent();
  const denied=await save(page);expect(denied.status()).toBe(403);
  await expect(workspace(page)).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:/^Timmar/u})).toHaveCount(0);
  expect((await fixture.snapshot()).revision).toBe(0);
});

test('08: pagination, tom lista, okänd rad och stängd programplansnavigation',async({page})=>{
  await fixture.unknownRow();await enter(page);await open(page);
  await expect(workspace(page)).toContainText(/okänd|ej stö|stöds inte/iu);
  await expect(workspace(page).getByRole('button',{name:/Ändra syntetisk_okand/iu})).toHaveCount(0);
  await navigate(page,'Programplaner');
  await expect(page.getByRole('heading',{name:'Stängt i denna fas'})).toBeVisible();
  await fixture.addPages();
  await navigate(page,'Timplaner');
  await expect(workspace(page).getByRole('button',{name:/^Öppna /u})).toHaveCount(50);
  const next=page.waitForResponse(matches('/api/timplaner/lista'));
  await workspace(page).getByRole('button',{name:'Nästa',exact:true}).click();
  expect((await next).status()).toBe(200);
  await expect(workspace(page).getByRole('button',{name:/^Öppna /u})).toHaveCount(9);
  const previous=page.waitForResponse(matches('/api/timplaner/lista'));
  await workspace(page).getByRole('button',{name:'Föregående',exact:true}).click();
  expect((await previous).status()).toBe(200);
  await expect(workspace(page).getByRole('button',{name:/^Öppna /u})).toHaveCount(50);
  await fixture.emptyPlans();await page.reload();await navigate(page,'Timplaner');
  await expect(workspace(page)).toContainText(/inga timplaner/iu);
  await expect(workspace(page).getByRole('button',{name:/^Öppna /u})).toHaveCount(0);
});

test('09: committad ändring med tappat svar ger okänt utfall och kräver omläsning',async({page})=>{
  await enter(page);await open(page);await edit(page,777);
  await page.route('**/api/timplaner/cell',async route=>{
    const actual=await route.fetch();expect(actual.status()).toBe(200);
    expect(await fixture.paired(actual.headers()['x-correlation-id'],fixture.principal,'timplan_cell_changed')).toBe(true);
    await route.abort('failed');
  });
  await page.getByRole('button',{name:'Spara ändring',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('Den aktuella timplanen innehåller redan ditt värde.');
  await expect(page.getByRole('button',{name:'Spara ändring',exact:true})).toHaveCount(0);
  expect((await fixture.snapshot()).revision).toBe(1);
  expect((await fixture.snapshot()).cells.matematik[0]).toBe(777);
  await page.unroute('**/api/timplaner/cell');
  await page.getByRole('button',{name:'Stäng',exact:true}).click();
  await expect(workspace(page).getByRole('button',{name:'Ändra Matematik, Åk 9, 777 timmar',exact:true})).toBeVisible();
  expect((await fixture.snapshot()).revision).toBe(1);
});
