// 05-19: programplanen som en tabell med terminer. Verklig Worker/SQL, egen syntetisk kund per fall;
// webbläsaren injicerar bara transportfel. Ersätter 05-18:s separata terminskort.
import { expect,test,type Page,type Response,type TestInfo } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3058';
const w=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const board=(page:Page)=>w(page).getByRole('region',{name:'Programplanen',exact:true});
const matches=(path:string)=>(r:Response)=>new URL(r.url()).pathname===path&&r.request().method()==='POST';
const ENG='Engelska Nivå 3';
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});
async function navigate(page:Page){await waitForHydration(page);const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();await page.getByRole('button',{name:'Programplaner',exact:true}).click();}
async function open(page:Page){const list=w(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');await list.getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u}).click();await expect(board(page)).toBeVisible();await expect(board(page)).toContainText('Allt sparat');}
async function enter(page:Page,session=fixture.principal){await fixture.cookies(page.context(),session,baseURL);await page.goto('/');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page);await open(page);}
const cell=(page:Page,term='Åk 1 HT',row=ENG)=>board(page).getByLabel(`${row}, ${term}`,{exact:true});
async function year(page:Page,info:TestInfo,y:number){if(info.project.name==='terms-phone')await board(page).getByRole('button',{name:`Åk ${y}`,exact:true}).click();}
/** Lämnar raden: ändringen sparas automatiskt. */
async function leave(page:Page){const pending=page.waitForResponse(matches('/api/programplaner/terminer'));await w(page).getByRole('heading',{level:2}).first().click();return pending;}
async function paired(r:Response,session=fixture.principal){expect(await fixture.paired(r.headers()['x-correlation-id'],session,'programplan_terms_changed')).toBe(true);}
async function read(){const r=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId:fixture.planId});expect(r.status).toBe(200);return r.body;}
async function capture(page:Page,info:TestInfo,name:string){const path=info.outputPath(name);await page.screenshot({path,fullPage:true});await info.attach(name,{path,contentType:'image/png'});}

test('01: klick i tom termin lägger hela nivån, sparas när raden lämnas och finns kvar efter omladdning',async({page},info)=>{
  await enter(page);await cell(page).click();await expect(cell(page)).toHaveValue('100');await expect(board(page)).toContainText('Osparade ändringar');
  const r=await leave(page);expect(r.status()).toBe(200);await paired(r);await expect(board(page)).toContainText('Allt sparat');
  expect((await read()).distribution).toContainEqual({rowKey:'specialization:ENGE:1:ENGE3000X',points:[100,0,0,0,0,0]});
  await cell(page,'Åk 1 HT').fill('50');await cell(page,'Åk 1 VT').fill('50');expect((await leave(page)).status()).toBe(200);
  await year(page,info,3);await cell(page,'Åk 3 VT','Gymnasiearbete Gymnasiearbete').fill('100');expect((await leave(page)).status()).toBe(200);
  const actual=await read();expect(actual.revision).toBe(3);expect(actual.distribution).toContainEqual({rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,'board-editing.png');
  await page.reload();await navigate(page);await open(page);await year(page,info,1);await expect(cell(page,'Åk 1 VT')).toHaveValue('50');
});

test('02: för många poäng sparas inte och markeras tills raden är rättad',async({page})=>{
  await enter(page);let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/terminer')writes++;});
  await cell(page).fill('101');await expect(cell(page)).toHaveAttribute('aria-invalid','true');await w(page).getByRole('heading',{level:2}).first().click();
  await expect(board(page)).toContainText('Rätta de markerade raderna');await expect(board(page)).toContainText('För många');expect(writes).toBe(0);
  await cell(page).fill('100');const r=await leave(page);expect(r.status()).toBe(200);expect(writes).toBe(1);
});

test('03: föreslå fördelning fyller alla tomma rader och planen blir klar för beslut',async({page},info)=>{
  await enter(page);await expect(w(page).getByRole('region',{name:'Innan planen är klar',exact:true})).toContainText('Alla nivåer är inte fördelade');
  await expect(w(page).getByRole('region',{name:'Innan planen är klar',exact:true})).toContainText('Outnyttjat utrymme');
  for(const code of ['ANIM1000X','ANIM2000X']){const search=board(page).getByRole('searchbox',{name:'Lägg till ämne eller nivå'});await search.fill(code);const added=page.waitForResponse(matches('/api/programplaner/fordjupning'));await board(page).locator(`button[data-level-code="${code}"]`).click();expect((await added).status()).toBe(200);await expect(board(page)).toContainText('Allt sparat');}
  const pending=page.waitForResponse(matches('/api/programplaner/terminer'));await board(page).getByRole('button',{name:'Föreslå fördelning',exact:true}).click();const r=await pending;expect(r.status()).toBe(200);await paired(r);
  await expect(board(page)).toContainText('allt fördelat');await expect(w(page).locator('.pp-status')).toContainText('Klar för beslut');
  await expect(w(page).getByRole('region',{name:'Klar för beslut',exact:true})).toBeVisible();
  const actual=await read();const rows=new Map(actual.distribution.map((d:{rowKey:string;points:number[]})=>[d.rowKey,d.points]));
  expect(rows.get('meta:diplomaWork')).toEqual([0,0,0,0,50,50]);expect(rows.get('foundation:ENGE:1:ENGE1000X')).toEqual([50,50,0,0,0,0]);expect(rows.get('foundation:ENGE:1:ENGE2000X')).toEqual([0,0,50,50,0,0]);
  await expect(board(page).getByRole('button',{name:'Föreslå fördelning',exact:true})).toBeDisabled();await capture(page,info,'board-ready.png');
  await w(page).getByRole('button',{name:/^Analys/u}).click();await expect(w(page)).toContainText('Alla nivåer har terminer');await capture(page,info,'board-analysis.png');
});

test('04: konkurrerande revision visas och egna värden kan sparas uttryckligen',async({page})=>{
  await enter(page);const other=await fixture.request(baseURL,fixture.second,'/api/programplaner/terminer',{planId:fixture.planId,expectedRevision:0,distribution:[{rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]}]});expect(other.status).toBe(200);
  await cell(page).fill('50');const r=await leave(page);expect(r.status()).toBe(409);await expect(board(page)).toContainText('Någon annan har ändrat planen');await expect(cell(page)).toHaveValue('50');
  const pending=page.waitForResponse(matches('/api/programplaner/terminer'));await board(page).getByRole('button',{name:'Spara mina värden',exact:true}).click();const retry=await pending;expect(retry.status()).toBe(200);await paired(retry);
  const actual=await read();expect(actual.revision).toBe(2);expect(actual.distribution).toContainEqual({rowKey:'specialization:ENGE:1:ENGE3000X',points:[50,0,0,0,0,0]});
});

test('05: MFA och loggfel lämnar värdena kvar utan skrivning',async({page})=>{
  await enter(page,fixture.noMfa);await cell(page).fill('50');const r=await leave(page);expect(r.status()).toBe(403);await expect(board(page)).toContainText('engångskod');await expect(cell(page)).toHaveValue('50');expect((await read()).revision).toBe(0);
  await fixture.cookies(page.context(),fixture.principal,baseURL);page.once('dialog',d=>d.accept());await page.reload();await navigate(page);await open(page);
  await fixture.auditFailure('db','programplan_terms_changed');await cell(page).fill('50');const failure=await leave(page);expect(failure.status()).toBe(500);await expect(cell(page)).toHaveValue('50');await expect(board(page)).toContainText('Kunde inte spara');
  await fixture.clearAuditFailure();expect((await read()).revision).toBe(0);
});

test('06: tappat svar efter commit läses tillbaka utan en andra skrivning',async({page})=>{
  await enter(page);let writes=0;
  await page.route('**/api/programplaner/terminer',async route=>{writes++;const actual=await route.fetch();expect(actual.status()).toBe(200);await route.abort('failed');});
  await cell(page).fill('50');await w(page).getByRole('heading',{level:2}).first().click();await expect(board(page)).toContainText('Allt sparat');expect(writes).toBe(1);
  expect((await read()).revision).toBe(1);await page.unroute('**/api/programplaner/terminer');
});

test('07: borttagen fördjupningsnivå töms först och försvinner ur tabellen',async({page})=>{
  await enter(page);await cell(page).click();expect((await leave(page)).status()).toBe(200);
  const cleared=page.waitForResponse(matches('/api/programplaner/terminer')),removed=page.waitForResponse(matches('/api/programplaner/fordjupning'));
  await board(page).getByRole('button',{name:'Ta bort ENGE3000X',exact:true}).click();
  expect((await cleared).status()).toBe(200);expect((await removed).status()).toBe(200);await expect(board(page)).toContainText('Allt sparat');await expect(cell(page)).toHaveCount(0);
  const plan=await fixture.snapshot();expect(plan.specialization).toEqual([]);expect((await read()).distribution.some((d:{rowKey:string})=>d.rowKey.includes('ENGE3000X'))).toBe(false);
});

test('08: telefon visar en årskurs i taget med stora pekytor',async({page},info)=>{
  test.skip(info.project.name!=='terms-phone','gäller telefon');
  await enter(page);await board(page).getByRole('button',{name:'Åk 2',exact:true}).click();await expect(cell(page,'Åk 2 HT')).toBeVisible();await expect(cell(page,'Åk 1 HT')).toBeHidden();
  const box=await cell(page,'Åk 2 HT').boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await capture(page,info,'board-phone.png');
});


// Användarfynd 2026-10-05: analysens åtgärder får inte öppna replace-formuläret med 0 poäng.
const analysis=(page:Page)=>w(page).getByRole('region',{name:'Analys av programplanen',exact:true});
async function fix(page:Page,name:string){await w(page).getByRole('button',{name:/^Analys/u}).click();await analysis(page).getByRole('button',{name,exact:true}).click();await expect(board(page)).toBeVisible();}
async function store(distribution:{rowKey:string;points:number[]}[],revision=0){const r=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer',{planId:fixture.planId,expectedRevision:revision,distribution});expect(r.status).toBe(200);}

test('09: Flytta nivån behåller poängen, visar rätt årskurs och låter felet rättas beständigt',async({page},info)=>{
  const higher='specialization:ENGE:1:ENGE3000X';
  await store([{rowKey:'foundation:ENGE:1:ENGE1000X',points:[100,0,0,0,0,0]},{rowKey:'foundation:ENGE:1:ENGE2000X',points:[0,0,0,0,100,0]},{rowKey:higher,points:[0,0,100,0,0,0]}]);
  await enter(page);await board(page).getByRole('button',{name:'Visa bara ofördelade',exact:true}).click();
  await fix(page,'Flytta nivån →');
  await expect(board(page)).toHaveAttribute('data-year','1');await expect(cell(page,'Åk 2 HT')).toBeFocused();await expect(cell(page,'Åk 2 HT')).toHaveValue('100');
  await expect(board(page).locator(`tr[data-row-key="${higher}"]`)).toHaveAttribute('data-analysis-target','true');
  await expect(board(page)).toContainText('300 av');await expect(w(page).getByRole('button',{name:'Spara utkast',exact:true})).toHaveCount(0);
  await capture(page,info,'analysis-fix-order.png');
  await cell(page,'Åk 2 HT').fill('');await year(page,info,3);await cell(page,'Åk 3 VT').fill('100');expect((await leave(page)).status()).toBe(200);await expect(board(page)).toContainText('Allt sparat');
  await w(page).getByRole('button',{name:/^Analys/u}).click();await expect(analysis(page).getByRole('button',{name:'Flytta nivån →',exact:true})).toHaveCount(0);
  expect((await read()).distribution).toContainEqual({rowKey:higher,points:[0,0,0,0,0,100]});
  await page.reload();await navigate(page);await open(page);await year(page,info,3);await expect(cell(page,'Åk 3 VT')).toHaveValue('100');
});

test('10: Fördela och Flytta går till rätt rad, Lägg till nivå till sökfältet och sparar bara egna ändringar',async({page},info)=>{
  await store([{rowKey:'meta:diplomaWork',points:[0,0,100,0,0,0]}]);await enter(page);
  await fix(page,'Fördela →');await expect(cell(page,'Åk 1 HT','Engelska Nivå 1')).toBeFocused();
  await expect(board(page)).toContainText('100 av');expect((await read()).revision).toBe(1);
  await fix(page,'Flytta →');await expect(cell(page,'Åk 2 HT','Gymnasiearbete Gymnasiearbete')).toBeFocused();await expect(cell(page,'Åk 2 HT','Gymnasiearbete Gymnasiearbete')).toHaveValue('100');
  await fix(page,'Lägg till nivå →');await expect(board(page).getByRole('searchbox',{name:'Lägg till ämne eller nivå'})).toBeFocused();
  await board(page).getByRole('searchbox',{name:'Lägg till ämne eller nivå'}).fill('ANIM1000X');const added=page.waitForResponse(matches('/api/programplaner/fordjupning'));await board(page).locator('button[data-level-code="ANIM1000X"]').click();expect((await added).status()).toBe(200);await expect(board(page)).toContainText('Allt sparat');
  expect((await read()).distribution).toContainEqual({rowKey:'meta:diplomaWork',points:[0,0,100,0,0,0]});
  expect((await fixture.snapshot()).specialization).toContain('ANIM1000X');await capture(page,info,'analysis-fix-specialization.png');
});

test('11: Jämna ut behåller full fördelning och Ta bort nivåer går till fördjupningsradens kryss',async({page})=>{
  await enter(page);const pending=page.waitForResponse(matches('/api/programplaner/terminer'));await board(page).getByRole('button',{name:'Föreslå fördelning',exact:true}).click();expect((await pending).status()).toBe(200);
  const saved=await read();const unbalanced=saved.distribution.map((d:{rowKey:string;points:number[]})=>({rowKey:d.rowKey,points:[0,0,0,0,d.points.reduce((a,b)=>a+b,0),0]}));
  await store(unbalanced,saved.revision);await page.reload();await navigate(page);await open(page);
  await fix(page,'Jämna ut →');await expect(board(page).locator('.ppb-year').first()).toBeFocused();await expect(board(page)).toContainText('allt fördelat');expect((await read()).distribution).toEqual(unbalanced);
  // Verklig fördjupningsskrivning gör ramen för stor, utan att ändra terminsfördelningen.
  const current=await read();const refs=[...fixture.basis().specializationRefs,...['ANIM1000X','ANIM2000X','ARTI1000X'].map(code=>({subjectCode:code.slice(0,4),subjectVersion:code.startsWith('ARTI')?2:1,itemCode:code,points:100}))];
  const over=await fixture.request(baseURL,fixture.principal,'/api/programplaner/fordjupning',{planId:fixture.planId,expectedRevision:current.revision,specializationRefs:refs});expect(over.status).toBe(200);
  await page.reload();await navigate(page);await open(page);await fix(page,'Ta bort nivåer →');await expect(board(page).getByRole('button',{name:'Ta bort ENGE3000X',exact:true})).toBeFocused();
  const cleared=page.waitForResponse(matches('/api/programplaner/terminer')),removed=page.waitForResponse(matches('/api/programplaner/fordjupning'));await board(page).getByRole('button',{name:'Ta bort ENGE3000X',exact:true}).click();expect((await cleared).status()).toBe(200);expect((await removed).status()).toBe(200);expect((await fixture.snapshot()).specialization).not.toContain('ENGE3000X');
});

test('12: en skrivskyddad plan förklarar varför risker inte kan åtgärdas',async({page},info)=>{
  await fixture.startedEducation();await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto('/');await navigate(page);
  const list=w(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');await list.getByRole('button',{name:/^Öppna utbildning Syntetisk pågående SA,/u}).click();await expect(board(page)).toContainText('Allt sparat');
  await w(page).getByRole('button',{name:/^Analys/u}).click();await expect(analysis(page)).toContainText('Elevkullen har börjat.');await expect(analysis(page).locator('.pps-link')).toHaveCount(0);await capture(page,info,'analysis-readonly.png');
});


test('13: Ange datum går till det osparade utkastets datumfält utan att tappa lokala poäng',async({page})=>{
  await fixture.cookies(page.context(),fixture.principal,baseURL);await page.goto('/');await navigate(page);
  const list=w(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');await list.getByRole('button',{name:/^Öppna utbildning Syntetisk SA utan plan,/u}).click();
  await w(page).getByRole('button',{name:'Skapa programplan',exact:true}).click();await w(page).getByLabel('Välj underlag',{exact:true}).selectOption(fixture.catalogId);await expect(w(page)).toHaveAttribute('aria-busy','false');await w(page).getByRole('button',{name:'Fortsätt till startdatum och val',exact:true}).click();
  await cell(page,'Åk 1 HT','Engelska Nivå 1').fill('75');await w(page).getByRole('button',{name:/^Analys/u}).click();await analysis(page).getByRole('button',{name:'Ange datum →',exact:true}).click();
  await expect(w(page).getByLabel('Utbildningens exakta startdatum',{exact:true})).toBeFocused();await expect(cell(page,'Åk 1 HT','Engelska Nivå 1')).toHaveValue('75');expect((await fixture.plans(fixture.emptyOfferingId)).length).toBe(0);
});
