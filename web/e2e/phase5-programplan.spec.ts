// Verklig byggd Worker/SQL, egen syntetisk kund perfall. Lokalt mintade
// sessionsbevis; inget interaktivt IdP-prov eller faktiskt skolbeslut.
import { expect,test,type Page,type Response,type Locator,type TestInfo } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3056';
const w=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const matches=(path:string)=>(r:Response)=>new URL(r.url()).pathname===path&&r.request().method()==='POST';
const animation={subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100};
const english={subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100};
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=undefined!;fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({browserName},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify({...await fixture.cleanup(),browserName}),contentType:'application/json'});});
async function navigate(page:Page,label='Programplaner'){
  await waitForHydration(page);const b=page.getByRole('button',{name:label,exact:true});
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches);
  const sidebar=page.locator('[data-slot="sidebar"][data-state]');
  if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await b.click();
}
async function enter(page:Page,session=fixture.principal){await fixture.cookies(page.context(),session,baseURL);await page.goto('/');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();const pending=page.waitForResponse(matches('/api/programplaner/lista'));await navigate(page);const r=await pending;expect(r.status()).toBe(200);await expect(w(page)).toBeVisible();return r;}
async function chooseProgram(page:Page,code='SA25',orientation:string|null='SABEP') {
  const flow=w(page).getByRole('region',{name:'Program, inriktning och fördjupning',exact:true});
  if(!await flow.count()){await w(page).getByRole('button',{name:'Ny programplan',exact:true}).click();await expect(flow).toBeVisible();}
  const school=flow.getByLabel('Skola',{exact:true});await expect(school).toBeEnabled();if(await school.inputValue()===''){const schoolRead=page.waitForResponse(matches('/api/programplaner/val'));await school.selectOption(fixture.unitId);expect((await schoolRead).status()).toBe(200);await expect(flow).toHaveAttribute('aria-busy','false');}
  const select=flow.getByLabel('1. Program',{exact:true});await expect(select).toBeEnabled();
  const value=await select.locator('option').evaluateAll((rows,code)=>rows.map(row=>(row as HTMLOptionElement).value).find(value=>value.startsWith(`${code}:`))??code,code);
  if(await select.inputValue()!==value){const pending=page.waitForResponse(matches('/api/programplaner/val'));await select.selectOption(value);expect((await pending).status()).toBe(200);await expect(flow).toHaveAttribute('aria-busy','false');}
  if(orientation!==null)await flow.getByLabel('2. Inriktning',{exact:true}).selectOption(orientation);else await expect(flow).toContainText('Programmet har ingen inriktning.');
  return flow;
}
async function education(page:Page,name='Syntetisk bunden SA',code='SA25',orientation:string|null='SABEP') {
  const list=w(page).getByRole('region',{name:'Alla programplaner',exact:true});
  const flow=w(page).getByRole('region',{name:'Program, inriktning och fördjupning',exact:true});await expect(list.or(flow)).toBeVisible();
  if(await list.isVisible())await expect(list).toHaveAttribute('aria-busy','false');else await chooseProgram(page,code,orientation);
  const pending=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByRole('button',{name:new RegExp(`^Öppna utbildning ${name},`,'u')}).click();const r=await pending;expect(r.status()).toBe(200);await expect(w(page).getByRole('heading',{name,exact:true})).toBeVisible();return r;
}
const editor=(page:Page)=>w(page).locator('.pp-draft-sheet');
async function underlying(page:Page){const details=w(page).locator('.pp-underlying');if(!await details.evaluate(el=>(el as HTMLDetailsElement).open)){await details.locator('summary').first().focus();await page.keyboard.press('Enter');}await expect(details).toHaveAttribute('open','');}
async function version(page:Page,label='Version 1 · Utkast'){await underlying(page);const pending=page.waitForResponse(matches('/api/programplaner/lasa'));await w(page).getByRole('button',{name:new RegExp(`^${label}`,'u')}).click();const r=await pending;expect(r.status()).toBe(200);return r;}
async function catalog(page:Page,proceed=true){
  const guide=w(page).getByLabel('Välj underlag',{exact:true});if(!await guide.count())await w(page).getByRole('button',{name:/^(Skapa programplan|Gör utkastet redo för ändring|Skapa ny version)$/u}).click();
  await expect(guide).toHaveValue('');await expect(guide.locator('option:checked')).toHaveText('Välj underlag');await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeDisabled();
  const pending=page.waitForResponse(matches('/api/programplaner/underlag'));await guide.selectOption(fixture.catalogId);const selected=await pending;expect(selected.status()).toBe(200);const source=(await selected.json()).catalog.source;
  await expect(guide).toHaveValue(fixture.catalogId);await expect(w(page)).toHaveAttribute('aria-busy','false');await expect(guide.locator('option:checked')).toHaveText(`Skolverket · hämtat ${source.fetched}`);await expect(w(page).getByText(/^Valt underlag:/u)).toContainText(source.fetched);
  if(proceed)await w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true}).click();
}
const board=(page:Page)=>w(page).getByRole('region',{name:'Programplanen',exact:true});
async function addLevel(page:Page,code='ANIM1000X'){const b=board(page);await expect(b).toContainText('Allt sparat');const search=b.getByRole('searchbox',{name:'Lägg till ämne eller nivå'});await search.fill(code);const pending=page.waitForResponse(matches('/api/programplaner/fordjupning'));await b.locator(`button[data-level-code="${code}"]`).click();return pending;}
async function removeLevel(page:Page,code:string){const b=board(page);await expect(b).toContainText('Allt sparat');const pending=page.waitForResponse(matches('/api/programplaner/fordjupning'));await b.getByRole('button',{name:`Ta bort ${code}`,exact:true}).click();return pending;}
async function add(dialog:Locator,code='ANIM1000X'){const search=dialog.getByRole('searchbox',{name:'Lägg till ämne eller nivå'});const previous=await search.inputValue();await search.fill(code);await dialog.locator(`button[data-level-code="${code}"]`).click();await search.fill(previous);}
async function review(page:Page){if(await editor(page).getByRole('region',{name:'Kontrollera före sparning'}).count())return;const next=w(page).getByRole('button',{name:'Spara utkast',exact:true});if(await next.count())await next.click();}
async function save(page:Page,route='fordjupning'){await review(page);const pending=page.waitForResponse(matches(`/api/programplaner/${route}`));await editor(page).getByRole('region',{name:'Kontrollera före sparning'}).getByRole('button',{name:/^Spara (utkast|ändå)$/u}).click();return pending;}
async function paired(r:Response,action:string,objectId:string|null=fixture.planId,session=fixture.principal,type='programplan'){const corr=r.headers()['x-correlation-id'];expect(corr).toMatch(/^[a-f0-9-]{36}$/u);expect(await fixture.paired(corr,session,action,objectId,type)).toBe(true);if(type==='programplan'&&objectId&&action!=='programplan_read'){const history=await fixture.history(objectId) as {event:{action:string;actor_identity_id:string;session_id:string;assignment_id:string}}[];const matching=history.map(row=>row.event).filter(e=>e.action===action);expect(matching.length).toBeGreaterThan(0);const latest=matching.at(-1)!;expect(latest.actor_identity_id).toBe(session.identityId);expect(latest.session_id).toBe(session.id);expect(latest.assignment_id).toBe(session.assignmentId);}}
async function capture(page:Page,info:TestInfo,name:string,fullPage?:boolean){const path=info.outputPath(name);await page.screenshot({path,fullPage:fullPage??await editor(page).count()===0});await info.attach(name,{path,contentType:'image/png'});}
async function discard(page:Page,accept:boolean,action:()=>Promise<unknown>){const pending=page.waitForEvent('dialog'),operation=action();const d=await pending;expect(d.type()).toBe('confirm');if(accept)await d.accept();else await d.dismiss();await operation;}

test('01: tydligt utbildningsurval, uttrycklig katalog/start och bunden läsning',async({page},info)=>{
  const list=await enter(page);await paired(list,'programplan_offerings_listed',null,fixture.principal,'education_collection');
  await expect(w(page)).not.toContainText('Syntetisk annan skola SA');
  const pendingRead=page.waitForResponse(matches('/api/programplaner/lasa'));const firstWorkspace=await education(page);await paired(firstWorkspace,'programplan_workspace_read',fixture.offeringId,fixture.principal,'education');
  await paired(await pendingRead,'programplan_read');
  await expect(board(page)).toContainText('Gymnasiegemensamma ämnen');
  await expect(w(page).locator('.pp-overview')).toHaveCount(0);
  const details=w(page).locator('.pp-underlying');await expect(details).not.toHaveAttribute('open','');
  await expect(board(page)).toContainText('Engelska');await expect(board(page)).toContainText('ENGE3000X');await expect(board(page)).toContainText('100 av 300 poäng');
  await expect(w(page).getByRole('button',{name:'Ändra fördjupning',exact:true})).toHaveCount(0);await expect(w(page)).toContainText('Utkast · Version');
  await expect(board(page)).toContainText('(alternativ)');await expect(board(page)).toContainText('(nivåer saknas)');await expect(w(page).getByRole('region',{name:'Innan planen är klar',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,'programplan-read.png');
  await underlying(page);await expect(details).toContainText(fixture.catalogId);await expect(details).toContainText('Utbildningsstart: 2026-08-01');await expect(details).toContainText('Fastställande är stängt');
  await expect(w(page).getByRole('button',{name:/Fastställ/u})).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(0);

});

test('02: skapa med verkligt startdatum, ordnade nivåer och auditerad omläsning',async({page},info)=>{
  await enter(page);await education(page,'Syntetisk SA utan plan');await expect(w(page).getByRole('button',{name:'Skapa programplan',exact:true})).toBeEnabled();await w(page).getByRole('button',{name:'Skapa programplan',exact:true}).click();await expect(w(page).getByLabel('Välj underlag',{exact:true})).toHaveValue('');await capture(page,info,'programplan-guide.png',false);
  let guideAudited=false;await page.route('**/api/programplaner/underlag',async route=>{const actual=await route.fetch();expect(actual.status()).toBe(200);guideAudited=await fixture.paired(actual.headers()['x-correlation-id'],fixture.principal,'programplan_workspace_read',fixture.emptyOfferingId,'education');await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})});});
  await w(page).getByLabel('Välj underlag',{exact:true}).selectOption(fixture.catalogId);await expect(w(page)).toHaveAttribute('aria-busy','false');await expect(w(page).getByLabel('Välj underlag',{exact:true})).toHaveValue(fixture.catalogId);await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeDisabled();expect(guideAudited).toBe(true);expect(await fixture.plans(fixture.emptyOfferingId)).toEqual([]);
  await page.unroute('**/api/programplaner/underlag');const sourceRetry=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByRole('button',{name:'Läs underlaget igen',exact:true}).click();expect((await sourceRetry).status()).toBe(200);await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeEnabled();
  // Lyckat A finns kvar som läsbild; ett misslyckat nytt val får aldrig återaktivera Fortsätt.
  let failedGuideReads=0;await page.route('**/api/programplaner/underlag',async route=>{const actual=await route.fetch();expect(actual.status()).toBe(200);expect(await fixture.paired(actual.headers()['x-correlation-id'],fixture.principal,'programplan_workspace_read',fixture.emptyOfferingId,'education')).toBe(true);failedGuideReads++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})});});
  for(const choice of ['',fixture.catalogId]){const failed=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByLabel('Välj underlag',{exact:true}).selectOption(choice);expect((await failed).status()).toBe(503);await expect(w(page)).toHaveAttribute('aria-busy','false');await expect(w(page).getByLabel('Välj underlag',{exact:true})).toHaveValue(choice);await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeDisabled();await expect(w(page).getByText(/^Valt underlag:/u)).toHaveCount(0);}
  expect(failedGuideReads).toBe(2);expect(await fixture.plans(fixture.emptyOfferingId)).toEqual([]);await page.unroute('**/api/programplaner/underlag');const freshGuide=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByRole('button',{name:'Läs underlaget igen',exact:true}).click();expect((await freshGuide).status()).toBe(200);await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeEnabled();await w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true}).click();
  const d=page.getByRole('region',{name:'Skapa programplan',exact:true});
  await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('');await d.getByLabel('Utbildningens exakta startdatum').fill('2024-08-17');await add(d);await add(d,'ENGE3000X');
  const bad=await save(page,'skapa');expect(bad.status()).toBe(400);await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('2024-08-17');await expect(d).toContainText('ANIM1000X');await expect(d).toContainText('ENGE3000X');expect(await fixture.plans(fixture.emptyOfferingId)).toEqual([]);
  await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/skapa')writes++;});await review(page);const pending=page.waitForResponse(matches('/api/programplaner/skapa'));await d.getByRole('button',{name:'Spara utkast',exact:true}).click({clickCount:2});const r=await pending;expect(r.status()).toBe(200);const body=await r.json();await paired(r,'programplan_draft_created',body.id);
  await expect(editor(page)).toHaveCount(0);await expect(w(page)).toContainText('Utkastet sparades');const actual=await fixture.snapshot(body.id);expect(actual.basis_reference.startedOn).toBe('2026-08-17');expect(actual.basis_reference.catalogId).toBe(fixture.catalogId);expect(actual.specialization).toEqual(['ANIM1000X','ENGE3000X']);expect(actual.status).toBe('utkast');expect(actual.decided_on).toBe(null);
  expect(writes).toBe(1);const freshSession=await fixture.newPrincipal();await fixture.cookies(page.context(),freshSession,baseURL);await page.reload();await navigate(page);await education(page,'Syntetisk SA utan plan');const reread=await version(page);await paired(reread,'programplan_read',body.id,freshSession);await underlying(page);await expect(w(page)).toContainText('Utbildningsstart: 2026-08-17');
});

test('03: äldre bindning bevarar val/ordning och kräver datum/bekräftelse',async({page})=>{
  await enter(page);await education(page,'Syntetisk obunden SA');await version(page);await catalog(page);
  const d=page.getByRole('region',{name:'Gör utkastet redo för ändring',exact:true});await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('');
  let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/binda')writes++;});await review(page);await d.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(d).toContainText('Ange ett verkligt');expect(writes).toBe(0);
  await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();await expect(d.getByRole('button',{name:/Ta bort/u})).toHaveCount(0);
  const r=await save(page,'binda');expect(r.status()).toBe(200);await paired(r,'programplan_basis_bound',fixture.legacyPlanId);
  await expect(editor(page)).toHaveCount(0);const actual=await fixture.snapshot(fixture.legacyPlanId);expect(actual.specialization).toEqual(['ENGE3000X','ANIM1000X']);expect(actual.version).toBe(1);expect(actual.revision).toBe(1);
});

test('04: fördjupning läggs till och tas bort direkt i tabellen, sök och pekytor',async({page},info)=>{
  await enter(page);await education(page);await version(page);
  const b=board(page);await b.getByRole('searchbox',{name:'Lägg till ämne eller nivå'}).fill('saknas helt');await expect(b).toContainText('Ingen tillgänglig nivå matchar');
  const added=await addLevel(page,'ANIM1000X');expect(added.status()).toBe(200);await paired(added,'programplan_specialization_changed');await expect(board(page)).toContainText('ANIM1000X');expect((await fixture.snapshot()).specialization).toEqual(['ENGE3000X','ANIM1000X']);
  await expect(board(page)).toContainText('200 av 300 poäng');
  expect((await removeLevel(page,'ANIM1000X')).status()).toBe(200);expect((await removeLevel(page,'ENGE3000X')).status()).toBe(200);expect((await fixture.snapshot()).specialization).toEqual([]);
  const area=board(page).locator('.ppb-add-row');await area.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>undefined)));});
  const targets=await area.locator('button,input').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));expect(targets.filter(r=>r.width<44||r.height<42)).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,'programplan-dialog.png');
});

test('05: kopiera äldre låst källa uttryckligt och bevara källa/historik',async({page},info)=>{
  const before=await fixture.snapshot(fixture.lockedPlanId),history=await fixture.history(fixture.lockedPlanId);
  await enter(page);await education(page,'Syntetisk tidigare beslutad SA');await version(page,'Version 3 · Fastställd');await catalog(page);
  const d=page.getByRole('region',{name:'Skapa ny version',exact:true});await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();await capture(page,info,'programplan-legacy-clone.png');const r=await save(page,'klona');expect(r.status()).toBe(200);const body=await r.json();expect(body.version).toBe(4);expect(body.id).not.toBe(fixture.lockedPlanId);await paired(r,'programplan_draft_cloned',body.id);await expect(editor(page)).toHaveCount(0);expect(await fixture.snapshot(fixture.lockedPlanId)).toEqual(before);expect(await fixture.history(fixture.lockedPlanId)).toEqual(history);
  // Konkurrerande nytt utkast stoppar även clone-CAS utan en extra version.
  await fixture.seedBoundLocked();await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page);await version(page,'Version 1 · Fastställd');await w(page).getByRole('button',{name:'Skapa ny version',exact:true}).click();
  const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/skapa',{offeringId:fixture.offeringId,expectedLatestVersion:1,basisReference:fixture.basis([animation])});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_draft_created',other.body.id)).toBe(true);
  expect((await save(page,'klona')).status()).toBe(409);await expect(editor(page).getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();expect((await fixture.snapshot(other.body.id)).version).toBe(2);expect(await fixture.plans(fixture.offeringId)).toHaveLength(2);expect((await fixture.snapshot()).status).toBe('faststalld');
});

test('06: bunden låst syntetisk källa kopieras med oförändrad grund',async({page})=>{
  await fixture.seedBoundLocked();const before=await fixture.snapshot();await enter(page);await education(page);await version(page,'Version 1 · Fastställd');await w(page).getByRole('button',{name:'Skapa ny version',exact:true}).click();const d=editor(page);await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveCount(0);await expect(d.getByRole('checkbox')).toHaveCount(0);const r=await save(page,'klona');expect(r.status()).toBe(200);const body=await r.json();await paired(r,'programplan_draft_cloned',body.id);await expect(editor(page)).toHaveCount(0);expect(body.basisReference).toEqual(before.basis_reference);expect(await fixture.snapshot()).toEqual(before);
});

test('07: verklig tvåsessionskonflikt stoppar och planen läses om',async({page},info)=>{
  await enter(page);await education(page);await version(page);await expect(board(page)).toContainText('Allt sparat');
  const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/fordjupning',{planId:fixture.planId,expectedRevision:0,specializationRefs:[animation]});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_specialization_changed')).toBe(true);
  const r=await addLevel(page,'ARTI1000X');expect(r.status()).toBe(409);await expect(board(page)).toContainText('Någon annan har ändrat planen');expect((await fixture.snapshot()).specialization).toEqual(['ANIM1000X']);await capture(page,info,'programplan-conflict.png');
  await board(page).getByRole('button',{name:'Läs om planen',exact:true}).click();await expect(board(page)).toContainText('ANIM1000X');await expect(board(page)).not.toContainText('ENGE3000X');
  const retried=await addLevel(page,'ARTI1000X');expect(retried.status()).toBe(200);await paired(retried,'programplan_specialization_changed');expect((await fixture.snapshot()).revision).toBe(2);
});

test('08: annan session binder till annan grund; eget formulär kan inte återanvändas',async({page})=>{
  await enter(page);await education(page,'Syntetisk obunden SA');await version(page);await catalog(page);const d=editor(page);await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();
  const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/binda',{planId:fixture.legacyPlanId,expectedRevision:0,basisReference:fixture.basis([english,animation],'2026-08-01')});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_basis_bound',fixture.legacyPlanId)).toBe(true);
  expect((await save(page,'binda')).status()).toBe(409);await expect(d).toContainText('kan inte skickas igen automatiskt');await expect(d.getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('2026-08-17');expect((await fixture.snapshot(fixture.legacyPlanId)).basis_reference.startedOn).toBe('2026-08-01');
  await discard(page,true,()=>d.getByRole('button',{name:'Avbryt',exact:true}).click());await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page,'Syntetisk SA utan plan');await catalog(page);const creation=editor(page);await creation.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await add(creation);
  const competing=await fixture.request(baseURL,fixture.second,'/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:fixture.basis([english],'2026-08-17')});expect(competing.status).toBe(200);expect(await fixture.paired(competing.correlationId,fixture.second,'programplan_draft_created',competing.body.id)).toBe(true);
  expect((await save(page,'skapa')).status()).toBe(409);await expect(creation.getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();await expect(creation).toContainText('Dina fördjupningsval: Animation · Nivå 1 (100 poäng)');expect((await fixture.snapshot(competing.body.id)).version).toBe(1);expect(await fixture.plans(fixture.emptyOfferingId)).toHaveLength(1);
});

test('09: MFA och DB/Worker-auditfel ändrar ingenting',async({page},info)=>{
  await enter(page,fixture.noMfa);await education(page);await version(page);let r=await addLevel(page);expect(r.status()).toBe(403);await expect(w(page)).toContainText('engångskod');expect((await fixture.snapshot()).revision).toBe(0);await capture(page,info,'programplan-mfa.png');
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.reload();await navigate(page);await education(page);await version(page);
  for(const source of ['db','worker']){await fixture.auditFailure(source);r=await addLevel(page);expect(r.status()).toBe(500);expect((await r.json()).code).toBe('audit_unavailable');await expect(board(page)).toContainText('Kunde inte ändra fördjupningen');expect((await fixture.snapshot()).revision).toBe(0);expect((await fixture.snapshot()).specialization).toEqual(['ENGE3000X']);await fixture.clearAuditFailure();}
  expect((await addLevel(page)).status()).toBe(200);await expect(board(page)).toContainText('ANIM1000X');
});

test('10: accepterad ändring följd av omläsningsfel ger ingen dubbelwrite',async({page},info)=>{
  await enter(page);await education(page);await version(page);let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/fordjupning')writes++;});
  await page.route('**/api/programplaner/underlag',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  const r=await addLevel(page);expect(r.status()).toBe(200);await paired(r,'programplan_specialization_changed');await expect(w(page).getByRole('button',{name:'Hämta utbildningarna igen',exact:true})).toBeVisible();expect((await fixture.snapshot()).revision).toBe(1);await capture(page,info,'programplan-refresh-error.png');
  await page.unroute('**/api/programplaner/underlag');await w(page).getByRole('button',{name:'Hämta utbildningarna igen',exact:true}).click();await education(page);await version(page);await expect(board(page)).toContainText('ANIM1000X');expect(writes).toBe(1);
});

test('11: tappat verkligt writesvar stäms av genom verklig omläsning',async({page})=>{
  await enter(page);await education(page);await version(page);
  for(const [index,failure]of ['abort','gateway502','codeless400'].entries()){
    let audited=false,writes=0;
    await page.route('**/api/programplaner/fordjupning',async r=>{writes++;const actual=await r.fetch();expect(actual.status()).toBe(200);audited=await fixture.paired(actual.headers()['x-correlation-id'],fixture.principal,'programplan_specialization_changed');if(failure==='abort')await r.abort('failed');else await r.fulfill({status:failure==='codeless400'?400:502,contentType:'text/plain',body:'Synthetic gateway failure without an API error code'});});
    const b=board(page);await expect(b).toContainText('Allt sparat');if(index%2===0){await b.getByRole('searchbox',{name:'Lägg till ämne eller nivå'}).fill('ANIM1000X');await b.locator('button[data-level-code="ANIM1000X"]').click();}else await b.getByRole('button',{name:'Ta bort ANIM1000X',exact:true}).click();
    await expect(board(page)).toContainText('Allt sparat');if(index%2===0)await expect(board(page)).toContainText('ANIM1000X');else await expect(board(page)).not.toContainText('ANIM1000X');
    expect(audited).toBe(true);expect(writes).toBe(1);expect((await fixture.snapshot()).revision).toBe(index+1);await page.unroute('**/api/programplaner/fordjupning');
  }
});

test('12: osparatskydd, sena svar, utloggning och inga plan-ID i webblager',async({page})=>{
  await enter(page);await education(page);await version(page);const field=board(page).getByLabel('Engelska Nivå 3, Åk 1 HT',{exact:true});await field.fill('101');await expect(field).toHaveAttribute('aria-invalid','true');
  // Simulerad unload kontrollerar registreringen efter Reacts effekter; ingen faktisk mobilunload.
  await expect.poll(()=>page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(false);
  await discard(page,false,()=>navigate(page,'Timplaner'));await expect(field).toHaveValue('101');await field.fill('100');await w(page).getByRole('heading',{level:2}).first().click();await expect(board(page)).toContainText('Allt sparat');
  const stored=await page.evaluate(()=>JSON.stringify({local:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),session:Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)]))}));expect(stored).not.toContain(fixture.planId);expect(page.url()).not.toContain(fixture.planId);
  let release!:()=>void,arrived!:()=>void;const waiting=new Promise<void>(r=>{arrived=r;}),delay=new Promise<void>(r=>{release=r;});
  await page.route('**/api/programplaner/lasa',async route=>{const result=await route.fetch();arrived();await delay;try{await route.fulfill({response:result});}catch{/* browser has left */}});
  await w(page).getByRole('button',{name:'Läs om',exact:true}).click();await waiting;
  // Innehållet rensas före serverns utloggning. Avsluta inte fixturen medan
  // återkallelse eller omdirigering fortfarande pågår; det sena lässvaret kvarstår.
  const logoutResponse=page.waitForResponse(matches('/api/auth/logout'));
  await page.getByRole('button',{name:'Logga ut',exact:true}).click();release();
  await expect(w(page)).toHaveCount(0);await expect(editor(page)).toHaveCount(0);
  const loggedOut=await logoutResponse;expect(loggedOut.status()).toBe(200);
  expect(loggedOut.request().postData()).toBeNull();
  expect(await loggedOut.finished()).toBeNull();
  await page.waitForURL(url=>url.origin===fixture.idpOrigin&&url.pathname==='/realms/skolplattform-test/protocol/openid-connect/logout');await page.waitForLoadState('load');
  expect((await fixture.request(baseURL,fixture.principal,'/api/programplaner/lista',{page:1})).status).toBe(401);
});

test('13: sidurval, äldre version, okända äldre val och tomt uppdrag',async({page})=>{
  await fixture.addPages();await enter(page);await chooseProgram(page);await expect(w(page).getByRole('button',{name:/^Öppna utbildning Syntetisk sidutbildning 151,/u})).toBeVisible();await education(page,'Syntetisk sidutbildning 151');await expect(w(page)).toContainText('Ingen programplan ännu');await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page);
  // Current draft is v1 on history page2; its read is independent of visible page1.
  await expect(board(page)).toContainText('Engelska');await underlying(page);await expect(w(page).getByRole('button',{name:'Version 1 · Utkast',exact:true})).toHaveCount(0);
  await version(page,'Version 53 · Ersatt');await expect(w(page).getByRole('button',{name:'Öppna utkastet',exact:true})).toBeVisible();await w(page).getByRole('button',{name:'Öppna utkastet',exact:true}).click();await expect(board(page)).toContainText('Allt sparat');
  await underlying(page);await w(page).getByRole('button',{name:'Nästa versioner',exact:true}).click();await expect(w(page)).toContainText('Sida 2 av 2');await expect(board(page)).toContainText('Engelska');await version(page,'Version 2 · Ersatt');await underlying(page);await w(page).getByRole('button',{name:'Föregående versioner',exact:true}).click();await expect(w(page).locator('.pp-status')).toContainText('Version 2');
  // Unbound draft on page2 still gets its exact raw legacy summary, never [].
  await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page,'Syntetisk obunden SA');await expect(w(page).getByRole('region',{name:'Dina sparade fördjupningsval',exact:true})).toContainText('ANIM1000X');await underlying(page);await expect(w(page).getByRole('button',{name:'Version 1 · Utkast',exact:true})).toHaveCount(0);
  await fixture.unknownLegacy();await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page,'Syntetisk obunden SA');await catalog(page,false);await expect(w(page)).toContainText('SYNTETISK_OKAND');await expect(w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true})).toBeDisabled();
  await discard(page,false,()=>w(page).getByRole('button',{name:'Avbryt förberedelse',exact:true}).click());await expect(w(page).getByLabel('Välj underlag',{exact:true})).toHaveValue(fixture.catalogId);await discard(page,true,()=>w(page).getByRole('button',{name:'Avbryt förberedelse',exact:true}).click());
  await fixture.emptyOfferings();await page.reload();await navigate(page);await chooseProgram(page);await expect(w(page)).toContainText('Skolan har ingen utbildning med det här programmet och den här inriktningen.');
});

test('14: huvudman kan arbeta; förlorat uppdrag/sessionepoch rensar innehåll',async({page})=>{
  await enter(page,fixture.hm);await education(page);await version(page);const r=await addLevel(page);expect(r.status()).toBe(200);await paired(r,'programplan_specialization_changed',fixture.planId,fixture.hm);await expect(board(page)).toContainText('ANIM1000X');
  let release!:()=>void,arrived!:()=>void;const waiting=new Promise<void>(r=>{arrived=r;}),delay=new Promise<void>(r=>{release=r;});
  await page.route('**/api/programplaner/lasa',async route=>{const result=await route.fetch();arrived();await delay;try{await route.fulfill({response:result});}catch{/* request belonged to the old epoch */}});
  await w(page).getByRole('button',{name:'Läs om',exact:true}).click();await waiting;await fixture.advanceEpoch(fixture.hm);await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(w(page)).toHaveCount(0);release();await expect(w(page)).toHaveCount(0);await expect(editor(page)).toHaveCount(0);
});

test('15: utgången session och avslutat givande mandat rensar den öppna planen',async({page})=>{
  await enter(page,fixture.noMfa);await education(page);await version(page);await expect(board(page)).toContainText('Allt sparat');await fixture.expire(fixture.noMfa);expect((await addLevel(page)).status()).toBe(401);await expect(w(page)).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(0);
  await enter(page);await education(page);await version(page);await expect(board(page)).toContainText('Allt sparat');await fixture.revokeParent();expect((await addLevel(page)).status()).toBe(403);await expect(w(page)).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(0);
});

// Different programmes must round-trip their own exact source and ordered choices.
test('16: fem ytterligare program skapas, granskas och läses med rätt programgrund',async({page},info)=>{
  const specs=await fixture.addProgramTrials();await enter(page);
  for(const spec of specs){
    await education(page,spec.name,spec.program,spec.orientation);await catalog(page);
    const d=page.getByRole('region',{name:'Skapa programplan',exact:true});
    await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');
    const selector=d.locator('button[data-level-code]').first();
    const code=await selector.getAttribute('data-level-code');expect(code).toBeTruthy();await selector.click();
    await review(page);const summary=d.getByRole('region',{name:'Kontrollera före sparning',exact:true});
    await expect(summary).toContainText(spec.name);await expect(summary).toContainText('2026-08-17');await expect(summary).toContainText('1 vald nivå');
    expect(await fixture.plans(spec.id)).toEqual([]);
    if(spec.program==='VO25')await capture(page,info,'programplan-vard-review.png');
    const r=await save(page,'skapa');expect(r.status()).toBe(200);const body=await r.json();await paired(r,'programplan_draft_created',body.id);
    await expect(editor(page)).toHaveCount(0);if(spec.program==='VO25')await expect(board(page)).toContainText('Programmet har ingen inriktning.');const row=await fixture.snapshot(body.id);
    expect(row.offering_id).toBe(spec.id);expect(row.basis_reference.programRef).toEqual({code:spec.program,version:spec.version});expect(row.basis_reference.orientationCode).toBe(spec.orientation);expect(row.basis_reference.startedOn).toBe('2026-08-17');expect(row.specialization).toEqual([code]);expect(row.status).toBe('utkast');expect(row.decided_on).toBe(null);
    await expect(board(page)).toContainText(code!);
    await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await education(page,spec.name,spec.program,spec.orientation);
    await expect(board(page)).toContainText(code!);await expect(board(page)).toContainText('Allt sparat');
    await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

async function newEducation(page:Page,name:string,code='SA25',orientation:string|null='SABEP') {
  await chooseProgram(page,code,orientation);await w(page).getByRole('button',{name:'Ny utbildning',exact:true}).click();
  const form=w(page).getByRole('region',{name:'Ny utbildning och programfördjupning',exact:true});
  await form.getByLabel('Utbildningens namn',{exact:true}).fill(name);await form.getByLabel('Elevkull',{exact:true}).fill('Syntetisk ny kull 2026');
  await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2026-08-17');return form;
}

test('17: samma flöde skapar utbildning och första utkast, med och utan inriktning',async({page},info)=>{
  await enter(page,fixture.hm);
  for(const [code,orientation] of [['SA25','SABEP'],['VO25',null]] as const){
    const name=`Syntetisk ny ${code}`,form=await newEducation(page,name,code,orientation);
    const input=form.locator('button[data-level-code]').first(),level=await input.getAttribute('data-level-code');expect(level).toBeTruthy();await input.click();
    const before=await fixture.request(baseURL,fixture.hm,'/api/programplaner/lista',{page:1});expect(before.status).toBe(200);expect(before.body.offerings.some((o:{name:string})=>o.name===name)).toBe(false);
    await form.getByRole('button',{name:'Granska utkast',exact:true}).click();await expect(form.getByRole('region',{name:'Kontrollera före sparning',exact:true})).toContainText(name);
    await form.getByRole('button',{name:'Tillbaka till uppgifterna',exact:true}).click();await expect(form.getByLabel('Utbildningens namn',{exact:true})).toHaveValue(name);await expect(form.getByRole('button',{name:`Ta bort ${level}`,exact:true})).toBeVisible();
    await form.getByRole('button',{name:'Granska utkast',exact:true}).click();if(code==='VO25')await capture(page,info,'shared-new-vo-review.png');
    const pending=page.waitForResponse(matches('/api/programplaner/utbildning/skapa'));await form.getByRole('button',{name:'Spara utbildning och utkast',exact:true}).click();const r=await pending;expect(r.status()).toBe(200);const body=await r.json();
    await paired(r,'programplan_education_created',body.education.id,fixture.hm,'education');await expect(w(page).getByRole('heading',{name,exact:true})).toBeVisible();
    const plan=await fixture.snapshot(body.plan.id);expect(plan.offering_id).toBe(body.education.id);expect(plan.specialization).toEqual([level]);expect(plan.basis_reference.programRef.code).toBe(code);expect(plan.basis_reference.orientationCode).toBe(orientation);expect(plan.basis_reference.startedOn).toBe('2026-08-17');expect(plan.status).toBe('utkast');expect(plan.version).toBe(1);expect(plan.revision).toBe(0);
    await expect(board(page)).toContainText('Allt sparat');await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();
  }
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.reload();await navigate(page);await education(page,'Syntetisk ny VO25','VO25',null);await expect(board(page)).toContainText('Allt sparat');
  await w(page).getByRole('button',{name:'Alla programplaner',exact:true}).click();await chooseProgram(page);await expect(w(page).getByRole('button',{name:'Ny utbildning',exact:true})).toHaveCount(0);
  const denied=await fixture.request(baseURL,fixture.principal,'/api/programplaner/utbildning/skapa',{commandId:crypto.randomUUID(),unitId:fixture.unitId,name:'Syntetisk otillåten ny',localCode:null,cohort:'Syntetisk',basisReference:fixture.basis([],'2026-08-17')});expect(denied.status).toBe(403);
});

test('18: tappat skapandesvar läses med samma kvitto utan en andra utbildning',async({page},info)=>{
  await enter(page,fixture.hm);const name='Syntetisk tappat skapandesvar',form=await newEducation(page,name);await add(form);await form.getByRole('button',{name:'Granska utkast',exact:true}).click();
  let writes=0,commandId='',educationId='',planId='',audited=false;
  await page.route('**/api/programplaner/utbildning/status',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  await page.route('**/api/programplaner/utbildning/skapa',async route=>{writes++;commandId=route.request().postDataJSON().commandId;const actual=await route.fetch();expect(actual.status()).toBe(200);const body=await actual.json();educationId=body.education.id;planId=body.plan.id;audited=await fixture.paired(actual.headers()['x-correlation-id'],fixture.hm,'programplan_education_created',educationId,'education');await route.abort('failed');});
  await form.getByRole('button',{name:'Spara utbildning och utkast',exact:true}).click();await expect(w(page)).toContainText('Sparandet kan inte avgöras ännu.');await expect(form.getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();
  await expect(w(page).getByLabel('1. Program',{exact:true})).toBeDisabled();await expect(w(page).getByRole('button',{name:'Ny utbildning',exact:true})).toBeDisabled();await expect(form).toContainText(name);expect(writes).toBe(1);expect(audited).toBe(true);expect(await fixture.plans(educationId)).toHaveLength(1);await capture(page,info,'shared-unknown-create.png');
  await page.unroute('**/api/programplaner/utbildning/status');await page.route('**/api/programplaner/underlag',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));const status=page.waitForResponse(matches('/api/programplaner/utbildning/status'));await form.getByRole('button',{name:'Läs sparstatus',exact:true}).click();const resolved=await status;expect(resolved.request().postDataJSON()).toEqual({commandId});expect(resolved.status()).toBe(200);expect((await resolved.json()).plan.id).toBe(planId);await paired(resolved,'programplan_education_status_read',commandId,fixture.hm,'education_command');
  await expect(form.getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();await expect(w(page).getByRole('button',{name:'Hämta utbildningarna igen',exact:true})).toBeVisible();await discard(page,false,()=>w(page).getByRole('button',{name:'Hämta utbildningarna igen',exact:true}).click());await expect(form).toContainText(name);expect(writes).toBe(1);
  await page.unroute('**/api/programplaner/underlag');await form.getByRole('button',{name:'Läs sparstatus',exact:true}).click();
  await expect(w(page).getByRole('heading',{name,exact:true})).toBeVisible();expect(writes).toBe(1);expect(await fixture.plans(educationId)).toHaveLength(1);
  const list=await fixture.request(baseURL,fixture.hm,'/api/programplaner/lista',{page:1});expect(list.body.offerings.filter((o:{name:string})=>o.name===name)).toHaveLength(1);
});

test('19: osparade nyuppgifter skyddas och misslyckat programval lämnar ingen gammal grund',async({page})=>{
  await enter(page,fixture.hm);const form=await newEducation(page,'Syntetisk skyddad ny utbildning');await add(form);
  const flow=w(page).getByRole('region',{name:'Program, inriktning och fördjupning',exact:true}),select=flow.getByLabel('1. Program',{exact:true});const before=await select.inputValue();
  const te=await select.locator('option').evaluateAll(rows=>rows.map(row=>(row as HTMLOptionElement).value).find(value=>value.startsWith('TE25:'))!);
  await discard(page,false,()=>select.selectOption(te));await expect(select).toHaveValue(before);await expect(form.getByLabel('Utbildningens namn',{exact:true})).toHaveValue('Syntetisk skyddad ny utbildning');await expect(form.getByRole('button',{name:'Ta bort ANIM1000X',exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true})))).toBe(false);
  await page.route('**/api/programplaner/val',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  await discard(page,true,()=>select.selectOption(te));await expect(flow).toContainText('Läs valen igen');await expect(flow.getByRole('region',{name:'Ny utbildning och programfördjupning',exact:true})).toHaveCount(0);await expect(flow.getByRole('region',{name:'Ingår enligt underlaget',exact:true})).toHaveCount(0);
  await page.unroute('**/api/programplaner/val');await flow.getByRole('button',{name:'Läs valen igen',exact:true}).click();await chooseProgram(page,'VO25',null);const fresh=flow.getByRole('region',{name:'Ny utbildning och programfördjupning',exact:true});await expect(fresh.getByLabel('Utbildningens namn',{exact:true})).toHaveValue('');await expect(fresh.getByRole('group',{name:'Programfördjupning',exact:true})).toContainText('Inga nivåer valda');await expect(fresh).toContainText('Programmet har ingen inriktning.');
  const list=await fixture.request(baseURL,fixture.hm,'/api/programplaner/lista',{page:1});expect(list.body.offerings.some((o:{name:string})=>o.name==='Syntetisk skyddad ny utbildning')).toBe(false);
});

test('20: startlistan öppnar och kopierar en plan till en ny utbildning utan att ändra originalet',async({page},info)=>{
  await enter(page,fixture.hm);const list=w(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');
  await expect(list.getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u})).toBeVisible();await expect(list).toContainText('Utkast');await capture(page,info,'programplan-list.png',false);
  const before=await fixture.snapshot();const opened=page.waitForResponse(matches('/api/programplaner/underlag'));await list.getByRole('button',{name:'Kopiera Syntetisk bunden SA',exact:true}).click();expect((await opened).status()).toBe(200);
  const form=w(page).getByRole('region',{name:'Kopiera till ny utbildning',exact:true});await expect(form).toBeVisible();await expect(form.getByLabel('Utbildningens namn',{exact:true})).toHaveValue('Syntetisk bunden SA – kopia');
  await expect(form.getByRole('button',{name:'Spara kopia',exact:true})).toBeDisabled();
  await form.getByLabel('Elevkull',{exact:true}).fill('Syntetisk kull 2027');await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2027-08-16');
  const pending=page.waitForResponse(matches('/api/programplaner/utbildning/skapa'));await form.getByRole('button',{name:'Spara kopia',exact:true}).click();const r=await pending;expect(r.status()).toBe(200);const body=await r.json();
  await paired(r,'programplan_education_created',body.education.id,fixture.hm,'education');await expect(w(page).getByRole('heading',{name:'Syntetisk bunden SA – kopia',exact:true})).toBeVisible();await expect(w(page)).toContainText('Kopian sparades');
  const copy=await fixture.snapshot(body.plan.id);expect(copy.offering_id).toBe(body.education.id);expect(copy.specialization).toEqual(before.specialization);expect(copy.basis_reference.programRef).toEqual(before.basis_reference.programRef);expect(copy.basis_reference.orientationCode).toBe(before.basis_reference.orientationCode);expect(copy.basis_reference.startedOn).toBe('2027-08-16');expect(copy.status).toBe('utkast');
  expect(await fixture.snapshot()).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
