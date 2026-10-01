// Verklig byggd Worker/SQL, egen syntetisk kund perfall. Lokalt mintade
// sessionsbevis; inget interaktivt IdP-prov eller faktiskt skolbeslut.
import { expect,test,type Page,type Response,type Locator } from '@playwright/test';
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
  await waitForHydration(page);const b=page.getByRole('button',{name:label,exact:true});const box=await b.isVisible()?await b.boundingBox():null;
  if(!box||box.x<0||box.x+box.width>(page.viewportSize()?.width??1440))await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();await b.click();
}
async function enter(page:Page,session=fixture.principal){await fixture.cookies(page.context(),session,baseURL);await page.goto('/');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();const pending=page.waitForResponse(matches('/api/programplaner/lista'));await navigate(page);const r=await pending;expect(r.status()).toBe(200);await expect(w(page)).toBeVisible();return r;}
async function education(page:Page,name='Syntetisk bunden SA') {const pending=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByRole('button',{name:new RegExp(`^Öppna utbildning ${name},`,'u')}).click();const r=await pending;expect(r.status()).toBe(200);await expect(w(page).getByRole('heading',{name,exact:true})).toBeVisible();return r;}
async function version(page:Page,label='Version 1 · Utkast'){const pending=page.waitForResponse(matches('/api/programplaner/lasa'));await w(page).getByRole('button',{name:new RegExp(`^${label}`,'u')}).click();const r=await pending;expect(r.status()).toBe(200);return r;}
async function catalog(page:Page){const pending=page.waitForResponse(matches('/api/programplaner/underlag'));await w(page).getByLabel('Välj exakt katalog').selectOption(fixture.catalogId);expect((await pending).status()).toBe(200);}
async function edit(page:Page){await w(page).getByRole('button',{name:'Ändra programfördjupning',exact:true}).click();const d=page.getByRole('dialog',{name:'Ändra programfördjupning'});await expect(d).toBeVisible();return d;}
async function add(dialog:Locator,code='ANIM1000X'){await dialog.getByLabel('Lägg till fördjupningsnivå').selectOption(code);await dialog.getByRole('button',{name:'Lägg till nivå',exact:true}).click();}
async function save(page:Page,route='fordjupning'){const pending=page.waitForResponse(matches(`/api/programplaner/${route}`));await page.getByRole('dialog').getByRole('button',{name:'Spara utkast',exact:true}).click();return pending;}
async function paired(r:Response,action:string,objectId:string|null=fixture.planId,session=fixture.principal,type='programplan'){const corr=r.headers()['x-correlation-id'];expect(corr).toMatch(/^[a-f0-9-]{36}$/u);expect(await fixture.paired(corr,session,action,objectId,type)).toBe(true);if(type==='programplan'&&objectId&&action!=='programplan_read'){const history=await fixture.history(objectId) as {event:{action:string;actor_identity_id:string;session_id:string;assignment_id:string}}[];const matching=history.map(row=>row.event).filter(e=>e.action===action);expect(matching.length).toBeGreaterThan(0);expect(matching.every(e=>e.actor_identity_id===session.identityId&&e.session_id===session.id&&e.assignment_id===session.assignmentId)).toBe(true);}}
async function discard(page:Page,accept:boolean,action:()=>Promise<unknown>){const pending=page.waitForEvent('dialog'),operation=action();const d=await pending;expect(d.type()).toBe('confirm');if(accept)await d.accept();else await d.dismiss();await operation;}

test('01: tydligt utbildningsurval, uttrycklig katalog/start och bunden läsning',async({page})=>{
  const list=await enter(page);await paired(list,'programplan_offerings_listed',null,fixture.principal,'education_collection');
  await expect(w(page)).not.toContainText('Syntetisk annan skola SA');
  const underlying=await education(page);await paired(underlying,'programplan_workspace_read',fixture.offeringId,fixture.principal,'education');
  await expect(w(page).getByLabel('Välj exakt katalog')).toHaveValue('');
  await expect(w(page)).toContainText('Fastställande är stängt');
  const read=await version(page);await paired(read,'programplan_read');
  await expect(w(page).getByLabel('Välj exakt katalog')).toHaveValue(fixture.catalogId);await expect(w(page).getByLabel('Välj exakt katalog')).toBeDisabled();
  await expect(w(page)).toContainText('Utbildningsstart: 2026-08-01');await expect(w(page).getByRole('region',{name:'Läst programplan'})).toContainText('Engelska');
  await expect(w(page).getByRole('button',{name:/Fastställ/u})).toHaveCount(0);
  expect((await fixture.snapshot()).revision).toBe(0);
});

test('02: skapa med verkligt startdatum, ordnade nivåer och auditerad omläsning',async({page})=>{
  await enter(page);await education(page,'Syntetisk SA utan plan');await expect(w(page).getByRole('button',{name:'Skapa utkast',exact:true})).toBeDisabled();await catalog(page);
  await w(page).getByRole('button',{name:'Skapa utkast',exact:true}).click();const d=page.getByRole('dialog',{name:'Skapa programplansutkast'});
  await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('');await d.getByLabel('Utbildningens exakta startdatum').fill('2024-08-17');await add(d);await add(d,'ENGE3000X');
  const bad=await save(page,'skapa');expect(bad.status()).toBe(400);await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('2024-08-17');await expect(d).toContainText('ANIM1000X');await expect(d).toContainText('ENGE3000X');expect(await fixture.plans(fixture.emptyOfferingId)).toEqual([]);
  await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/skapa')writes++;});const pending=page.waitForResponse(matches('/api/programplaner/skapa'));await d.getByRole('button',{name:'Spara utkast',exact:true}).click({clickCount:2});const r=await pending;expect(r.status()).toBe(200);const body=await r.json();await paired(r,'programplan_draft_created',body.id);
  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(w(page)).toContainText('Utkastet sparades');const actual=await fixture.snapshot(body.id);expect(actual.basis_reference.startedOn).toBe('2026-08-17');expect(actual.specialization).toEqual(['ANIM1000X','ENGE3000X']);expect(actual.status).toBe('utkast');expect(actual.decided_on).toBe(null);
  expect(writes).toBe(1);const freshSession=await fixture.newPrincipal();await fixture.cookies(page.context(),freshSession,baseURL);await page.reload();await navigate(page);await education(page,'Syntetisk SA utan plan');const reread=await version(page);await paired(reread,'programplan_read',body.id,freshSession);await expect(w(page)).toContainText('Utbildningsstart: 2026-08-17');
});

test('03: äldre bindning bevarar val/ordning och kräver datum/bekräftelse',async({page})=>{
  await enter(page);await education(page,'Syntetisk obunden SA');await version(page);await catalog(page);await w(page).getByRole('button',{name:'Bind äldre utkast',exact:true}).click();
  const d=page.getByRole('dialog',{name:'Bind äldre utkast till underlag'});await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('');
  let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/binda')writes++;});await d.getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(d).toContainText('Ange ett verkligt');expect(writes).toBe(0);
  await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();await expect(d.getByRole('button',{name:/Ta bort/u})).toHaveCount(0);
  const r=await save(page,'binda');expect(r.status()).toBe(200);await paired(r,'programplan_basis_bound',fixture.legacyPlanId);
  await expect(page.getByRole('dialog')).toHaveCount(0);const actual=await fixture.snapshot(fixture.legacyPlanId);expect(actual.specialization).toEqual(['ENGE3000X','ANIM1000X']);expect(actual.version).toBe(1);expect(actual.revision).toBe(1);
});

test('04: ordnad fördjupning, borttagning, tomt utkast, tangentbord och telefon',async({page},info)=>{
  await enter(page);await education(page);await version(page);let d=await edit(page);await add(d);await d.getByRole('button',{name:'Flytta upp ANIM1000X',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(d).toHaveAttribute('aria-modal','true');const r=await save(page);expect(r.status()).toBe(200);await paired(r,'programplan_specialization_changed');await expect(page.getByRole('dialog')).toHaveCount(0);expect((await fixture.snapshot()).specialization).toEqual(['ANIM1000X','ENGE3000X']);
  d=await edit(page);await d.getByRole('button',{name:'Ta bort ANIM1000X',exact:true}).click();await d.getByRole('button',{name:'Ta bort ENGE3000X',exact:true}).click();await expect(d).toContainText('Inga fördjupningsnivåer valda');
  await d.evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>undefined)));});
  const targets=await d.locator('button,select,input:not([type=checkbox])').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height};}).filter(r=>r.width>0&&r.height>0));expect(targets.filter(r=>r.width<44||r.height<44)).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('programplan-dialog.png'),fullPage:true});
  expect((await save(page)).status()).toBe(200);await expect(page.getByRole('dialog')).toHaveCount(0);expect((await fixture.snapshot()).specialization).toEqual([]);
});

test('05: kopiera äldre låst källa uttryckligt och bevara källa/historik',async({page})=>{
  const before=await fixture.snapshot(fixture.lockedPlanId),history=await fixture.history(fixture.lockedPlanId);
  await enter(page);await education(page,'Syntetisk tidigare beslutad SA');await version(page,'Version 3 · Fastställd');await catalog(page);await w(page).getByRole('button',{name:'Kopiera till nytt utkast',exact:true}).click();
  const d=page.getByRole('dialog',{name:'Kopiera till nytt programplansutkast'});await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();const r=await save(page,'klona');expect(r.status()).toBe(200);const body=await r.json();expect(body.version).toBe(4);expect(body.id).not.toBe(fixture.lockedPlanId);await paired(r,'programplan_draft_cloned',body.id);await expect(page.getByRole('dialog')).toHaveCount(0);expect(await fixture.snapshot(fixture.lockedPlanId)).toEqual(before);expect(await fixture.history(fixture.lockedPlanId)).toEqual(history);
  // Konkurrerande nytt utkast stoppar även clone-CAS utan en extra version.
  await fixture.seedBoundLocked();await w(page).getByRole('button',{name:'Alla utbildningar',exact:true}).click();await education(page);await version(page,'Version 1 · Fastställd');await w(page).getByRole('button',{name:'Kopiera till nytt utkast',exact:true}).click();
  const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/skapa',{offeringId:fixture.offeringId,expectedLatestVersion:1,basisReference:fixture.basis([animation])});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_draft_created',other.body.id)).toBe(true);
  expect((await save(page,'klona')).status()).toBe(409);await expect(page.getByRole('dialog').getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();expect((await fixture.snapshot(other.body.id)).version).toBe(2);expect(await fixture.plans(fixture.offeringId)).toHaveLength(2);expect((await fixture.snapshot()).status).toBe('faststalld');
});

test('06: bunden låst syntetisk källa kopieras med oförändrad grund',async({page})=>{
  await fixture.seedBoundLocked();const before=await fixture.snapshot();await enter(page);await education(page);await version(page,'Version 1 · Fastställd');await w(page).getByRole('button',{name:'Kopiera till nytt utkast',exact:true}).click();const d=page.getByRole('dialog');await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveCount(0);await expect(d.getByRole('checkbox')).toHaveCount(0);const r=await save(page,'klona');expect(r.status()).toBe(200);const body=await r.json();await paired(r,'programplan_draft_cloned',body.id);await expect(page.getByRole('dialog')).toHaveCount(0);expect(body.basisReference).toEqual(before.basis_reference);expect(await fixture.snapshot()).toEqual(before);
});

test('07: verklig tvåsessionskonflikt och uttrycklig omprövning',async({page})=>{
  await enter(page);await education(page);await version(page);await add(await edit(page));const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/fordjupning',{planId:fixture.planId,expectedRevision:0,specializationRefs:[animation]});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_specialization_changed')).toBe(true);
  const r=await save(page);expect(r.status()).toBe(409);const d=page.getByRole('dialog');await expect(d).toContainText('Aktuell revision: 1');await expect(d).toContainText('Dina fördjupningsval: ENGE3000X, ANIM1000X');expect((await fixture.snapshot()).specialization).toEqual(['ANIM1000X']);
  const pending=page.waitForResponse(matches('/api/programplaner/fordjupning'));await d.getByRole('button',{name:'Använd mina val',exact:true}).click();const retried=await pending;expect(retried.status()).toBe(200);await paired(retried,'programplan_specialization_changed');await expect(page.getByRole('dialog')).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(2);
});

test('08: annan session binder till annan grund; eget formulär kan inte återanvändas',async({page})=>{
  await enter(page);await education(page,'Syntetisk obunden SA');await version(page);await catalog(page);await w(page).getByRole('button',{name:'Bind äldre utkast',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await d.getByRole('checkbox').check();
  const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/binda',{planId:fixture.legacyPlanId,expectedRevision:0,basisReference:fixture.basis([english,animation],'2026-08-01')});expect(other.status).toBe(200);expect(await fixture.paired(other.correlationId,fixture.second,'programplan_basis_bound',fixture.legacyPlanId)).toBe(true);
  expect((await save(page,'binda')).status()).toBe(409);await expect(d).toContainText('kan inte skickas igen automatiskt');await expect(d.getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();await expect(d.getByLabel('Utbildningens exakta startdatum')).toHaveValue('2026-08-17');expect((await fixture.snapshot(fixture.legacyPlanId)).basis_reference.startedOn).toBe('2026-08-01');
  await discard(page,true,()=>d.getByRole('button',{name:'Avbryt',exact:true}).click());await w(page).getByRole('button',{name:'Alla utbildningar',exact:true}).click();await education(page,'Syntetisk SA utan plan');await catalog(page);await w(page).getByRole('button',{name:'Skapa utkast',exact:true}).click();const creation=page.getByRole('dialog');await creation.getByLabel('Utbildningens exakta startdatum').fill('2026-08-17');await add(creation);
  const competing=await fixture.request(baseURL,fixture.second,'/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:fixture.basis([english],'2026-08-17')});expect(competing.status).toBe(200);expect(await fixture.paired(competing.correlationId,fixture.second,'programplan_draft_created',competing.body.id)).toBe(true);
  expect((await save(page,'skapa')).status()).toBe(409);await expect(creation.getByRole('button',{name:'Använd mina val',exact:true})).toBeDisabled();await expect(creation).toContainText('Dina fördjupningsval: ANIM1000X');expect((await fixture.snapshot(competing.body.id)).version).toBe(1);expect(await fixture.plans(fixture.emptyOfferingId)).toHaveLength(1);
});

test('09: MFA och DB/Worker-auditfel bevarar formulär och ändrar ingenting',async({page})=>{
  await enter(page,fixture.noMfa);await education(page);await version(page);await add(await edit(page));let r=await save(page);expect(r.status()).toBe(403);await expect(page.getByRole('dialog')).toContainText('Verifiera med engångskod');expect((await fixture.snapshot()).revision).toBe(0);
  await discard(page,true,()=>page.getByRole('dialog').getByRole('button',{name:'Avbryt',exact:true}).click());await fixture.cookies(page.context(),fixture.principal,baseURL);await page.reload();await navigate(page);await education(page);await version(page);await add(await edit(page));
  for(const source of ['db','worker']){await fixture.auditFailure(source);r=await save(page);expect(r.status()).toBe(503);await expect(page.getByRole('dialog')).toContainText('Kunde inte spara');expect((await fixture.snapshot()).revision).toBe(0);expect((await fixture.snapshot()).specialization).toEqual(['ENGE3000X']);await fixture.clearAuditFailure();}
  expect((await save(page)).status()).toBe(200);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('10: accepterad sparning följd av omläsningsfel behåller formulär; ingen dubbelwrite',async({page})=>{
  await enter(page);await education(page);await version(page);await add(await edit(page));let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/fordjupning')writes++;});
  await page.route('**/api/programplaner/underlag',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'audit_unavailable'})}));
  const r=await save(page);expect(r.status()).toBe(200);await paired(r,'programplan_specialization_changed');const d=page.getByRole('dialog');await expect(d).toContainText('Dina uppgifter finns kvar');await expect(d).toContainText('ANIM1000X');expect((await fixture.snapshot()).revision).toBe(1);
  await page.unroute('**/api/programplaner/underlag');await d.getByRole('button',{name:'Läs om underlaget',exact:true}).click();await expect(d).toContainText('Inget nytt sparande behövs');expect(writes).toBe(1);await d.getByRole('button',{name:'Stäng',exact:true}).click();
});

test('11: tappat verkligt writesvar stäms av genom verklig omläsning',async({page})=>{
  await enter(page);await education(page);await version(page);await add(await edit(page));let audited=false;
  await page.route('**/api/programplaner/fordjupning',async r=>{const actual=await r.fetch();expect(actual.status()).toBe(200);audited=await fixture.paired(actual.headers()['x-correlation-id'],fixture.principal,'programplan_specialization_changed');await r.abort('failed');});
  await page.getByRole('dialog').getByRole('button',{name:'Spara utkast',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Inget nytt sparande behövs');expect(audited).toBe(true);expect((await fixture.snapshot()).revision).toBe(1);
});

test('12: osparatskydd, sena svar, utloggning och inga plan-ID i webblager',async({page})=>{
  await enter(page);await education(page);await version(page);await add(await edit(page));await discard(page,false,()=>navigate(page,'Timplaner'));await expect(w(page)).toBeVisible();await discard(page,false,()=>page.getByRole('button',{name:'Logga ut',exact:true}).click());await expect(page.getByRole('dialog')).toBeVisible();await discard(page,false,()=>page.getByRole('dialog').getByRole('button',{name:'Avbryt',exact:true}).click());await expect(page.getByRole('dialog')).toContainText('ANIM1000X');await discard(page,true,()=>page.getByRole('dialog').getByRole('button',{name:'Avbryt',exact:true}).click());
  const stored=await page.evaluate(()=>JSON.stringify({local:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),session:Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)]))}));expect(stored).not.toContain(fixture.planId);expect(page.url()).not.toContain(fixture.planId);
  let release!:()=>void,arrived!:()=>void;const waiting=new Promise<void>(r=>{arrived=r;}),delay=new Promise<void>(r=>{release=r;});
  await page.route('**/api/programplaner/lasa',async route=>{const result=await route.fetch();arrived();await delay;try{await route.fulfill({response:result});}catch{/* browser has left */}});
  await w(page).getByRole('button',{name:/^Version 1 · Utkast/u}).click();await waiting;await page.getByRole('button',{name:'Logga ut',exact:true}).click();release();await expect(w(page)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('13: sidurval, äldre version, okända äldre val och tomt uppdrag',async({page})=>{
  await fixture.addPages();await enter(page);await expect(w(page)).toContainText('Sida 1 av 2');await w(page).getByRole('button',{name:'Nästa utbildningar',exact:true}).click();await expect(w(page)).toContainText('Sida 2 av 2');await w(page).getByRole('button',{name:'Föregående utbildningar',exact:true}).click();await education(page);await w(page).getByRole('button',{name:'Nästa versioner',exact:true}).click();await expect(w(page)).toContainText('Sida 2 av 2');await version(page,'Version 1 · Utkast');
  await fixture.unknownLegacy();await w(page).getByRole('button',{name:'Alla utbildningar',exact:true}).click();await education(page,'Syntetisk obunden SA');await version(page);await catalog(page);await expect(w(page)).toContainText('SYNTETISK_OKAND');await expect(w(page).getByRole('button',{name:'Bind äldre utkast',exact:true})).toBeDisabled();
  await fixture.emptyOfferings();await page.reload();await navigate(page);await expect(w(page)).toContainText('Inga utbildningar på den här sidan');
});

test('14: huvudman kan arbeta; förlorat uppdrag/sessionepoch rensar innehåll',async({page})=>{
  await enter(page,fixture.hm);await education(page);await version(page);await add(await edit(page));const r=await save(page);expect(r.status()).toBe(200);await paired(r,'programplan_specialization_changed',fixture.planId,fixture.hm);await expect(page.getByRole('dialog')).toHaveCount(0);
  await fixture.advanceEpoch(fixture.hm);await w(page).getByRole('button',{name:'Läs om',exact:true}).click();await expect(w(page)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('15: utgången session och avslutat givande mandat rensar det öppna formuläret',async({page})=>{
  await enter(page,fixture.noMfa);await education(page);await version(page);await add(await edit(page));await fixture.expire(fixture.noMfa);expect((await save(page)).status()).toBe(401);await expect(w(page)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(0);
  await enter(page);await education(page);await version(page);await add(await edit(page));await fixture.revokeParent();expect((await save(page)).status()).toBe(403);await expect(w(page)).toHaveCount(0);await expect(page.getByRole('dialog')).toHaveCount(0);expect((await fixture.snapshot()).revision).toBe(0);
});
