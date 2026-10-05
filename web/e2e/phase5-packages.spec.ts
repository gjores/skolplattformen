import {expect,test,type Page} from '@playwright/test';
import {createProgramplanBrowserFixture,verifyProgramplanBrowserTarget} from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import {waitForHydration} from './helpers/keycloak.ts';
import {proposeLanguagePackages,suggestPackageDistribution} from '../lib/programplan-packages.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const workspace=(p:Page)=>p.getByTestId('protected-programplan-workspace');
const board=(p:Page)=>workspace(p).getByRole('region',{name:'Programplanen',exact:true});
const packages=(p:Page)=>board(p).getByRole('region',{name:'Paket i Moderna språk',exact:true});
async function enter(page:Page,actor=fixture.principal){
 await fixture.cookies(page.context(),actor,baseURL);await page.goto('/');await waitForHydration(page);
 const mobile=await page.evaluate(()=>matchMedia('(max-width:767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');
 if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
 await page.getByRole('button',{name:'Programplaner',exact:true}).click();const list=workspace(page).getByRole('region',{name:'Alla programplaner',exact:true});await expect(list).toHaveAttribute('aria-busy','false');
 await list.getByRole('button',{name:/^Öppna utbildning Syntetisk bunden SA,/u}).click();await expect(board(page)).toContainText('Allt sparat');
 await board(page).locator('tr[data-row-key="block:mosp"]').getByRole('button',{name:/^Visa paket/u}).click();await expect(packages(page)).toBeVisible();await expect(packages(page)).not.toContainText('Hämtar skolornas paket');
}
async function putFrame(){const reply=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer',{planId:fixture.planId,expectedRevision:0,distribution:[{rowKey:'block:mosp',points:[100,0,100,0,0,0]}]});expect(reply.status).toBe(200);}
async function proposal(page:Page){await packages(page).getByRole('button',{name:'Föreslå språkpaket',exact:true}).click();await expect(packages(page).getByRole('region',{name:/^Språkpaket/u})).toHaveCount(6);const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/paketval'&&r.request().method()==='POST');await packages(page).getByRole('button',{name:'Använd förslaget',exact:true}).click();expect((await pending).status()).toBe(200);await expect(packages(page)).toContainText('Sparat');}
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});
test('B04: sex språkförslag, borttaget tyskt nybörjarpaket, sparad fördelning och scoped kontroll',async({page},info)=>{
 await putFrame();await enter(page);const before=await fixture.snapshot();await proposal(page);
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/paketval'&&r.request().method()==='POST');await packages(page).getByRole('button',{name:'Ta bort paket Tyska MODY1000X',exact:true}).click();expect((await pending).status()).toBe(200);
 await expect(packages(page).getByRole('region',{name:/^Språkpaket/u})).toHaveCount(5);
 const read=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval/lasa',{planId:fixture.planId});expect(read.status).toBe(200);expect(read.body.units[0].revision).toBe(2);expect(read.body.units[0].selections[0].entries).toHaveLength(5);expect(await fixture.snapshot()).toEqual(before);
 await workspace(page).getByRole('button',{name:/^Analys/u}).click();await expect(workspace(page)).toContainText('Tyska');
 await page.reload();await enter(page);await expect(packages(page).getByRole('region',{name:/^Språkpaket/u})).toHaveCount(5);
 const path=info.outputPath('language-packages.png');await page.screenshot({path,fullPage:true});await info.attach('language-packages.png',{path,contentType:'image/png'});
});
test('B05: analys öppnar paketnivån med fel för ram och ordning, samt risk vid samma termin',async({page})=>{
 await putFrame();const block=fixture.basis().choiceBlocks.find(b=>b.id==='mosp')!,entry=proposeLanguagePackages(block)[0];
 entry.distribution=suggestPackageDistribution([0,0,100,0,100,0],entry.ref.levels).reverse();entry.distribution[0].points=[100,0,0,0,0,0];entry.distribution[1].points=[0,0,100,0,0,0];
 const put=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval',{planId:fixture.planId,unitId:fixture.unitId,expectedRevision:0,blockId:'mosp',entries:[entry]});expect(put.status).toBe(200);
 await enter(page);await board(page).getByRole('button',{name:/^Årskurs 3/u}).click();await workspace(page).getByRole('button',{name:/^Analys/u}).click();
 const issue=workspace(page).locator('tr').filter({hasText:/före/u}).filter({has:page.getByRole('button',{name:'Visa paket →',exact:true})}).first();await expect(issue).toBeVisible();await expect(workspace(page)).toContainText('paketet avviker från ramen');await issue.getByRole('button',{name:'Visa paket →',exact:true}).click();await expect(packages(page)).toBeVisible();await expect(packages(page).getByLabel('Franska MODO2000X, Åk 1 HT',{exact:true})).toBeFocused();
 const both={...entry,distribution:entry.ref.levels.map(l=>({levelKey:`${l.subjectCode}:${l.subjectVersion}:${l.itemCode}`,points:[0,0,100,0,0,0]}))};
 const overlap=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval',{planId:fixture.planId,unitId:fixture.unitId,expectedRevision:1,blockId:'mosp',entries:[both]});expect(overlap.status).toBe(200);await page.reload();await enter(page);await workspace(page).getByRole('button',{name:/^Analys/u}).click();const risk=workspace(page).locator('tr').filter({hasText:'paketnivåerna överlappar'});await expect(risk).toContainText('Risk');
});
test('B06: rektor ändrar egen skolas paket men annan skolas utbud visas för läsning',async({page})=>{
 const fresh=await fixture.request(baseURL,fixture.hm,'/api/programplaner/underlag',{offeringId:fixture.offeringId,versionPage:1,catalogId:fixture.catalogId});expect(fresh.status).toBe(200);
 const changed=await fixture.request(baseURL,fixture.hm,'/api/programplaner/utbildning/livscykel',{offeringId:fixture.offeringId,expectedRevision:fresh.body.lifecycle.revision,command:'units',details:{unitIds:[fixture.unitId,fixture.secondUnitId]}});expect(changed.status).toBe(200);
 await enter(page);await expect(packages(page).getByRole('button',{name:'Föreslå språkpaket',exact:true})).toBeEnabled();await packages(page).getByLabel('Skola för Moderna språk',{exact:true}).selectOption(fixture.secondUnitId);await expect(packages(page)).toContainText('Skolan ingår inte i ditt mandat');await expect(packages(page).getByRole('button',{name:'Lägg till paket',exact:true})).toHaveCount(0);
});
test('B07: skoladministratör kan välja paket i fastställd version och saknar planredigering',async({page})=>{
 await putFrame();await fixture.seedBoundLocked();await enter(page,fixture.admin);await proposal(page);
 await expect(board(page).locator('tr[data-row-key="block:mosp"] input')).toHaveCount(0);await expect(workspace(page).getByRole('button',{name:'Skapa ny version',exact:true})).toHaveCount(0);await expect(workspace(page).getByRole('button',{name:'Skolor',exact:true})).toHaveCount(0);
 const read=await fixture.request(baseURL,fixture.admin,'/api/programplaner/paketval/lasa',{planId:fixture.planId});expect(read.status).toBe(200);expect(read.body.units[0].revision).toBe(1);
});
test('B10: paket kan läggas till, fördelas och sparas även på telefon utan klippta kontroller',async({page},info)=>{
 await putFrame();await enter(page);await packages(page).getByLabel('Språk',{exact:true}).selectOption('it');await packages(page).getByLabel('Paketets första nivå',{exact:true}).selectOption('modern:2');
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/paketval'&&r.request().method()==='POST');await packages(page).getByRole('button',{name:'Lägg till paket',exact:true}).click();expect((await pending).status()).toBe(200);await expect(packages(page)).toContainText('Italienska');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await packages(page).evaluate(el=>{const clip=el.closest('.ppb-table-wrap')!.getBoundingClientRect();return [...el.querySelectorAll('input,select,button')].filter(c=>c.getBoundingClientRect().width>0).every(c=>{const r=c.getBoundingClientRect();return r.left>=clip.left&&r.right<=clip.right;});})).toBe(true);
 const path=info.outputPath('package-controls.png');await page.screenshot({path,fullPage:true});await info.attach('package-controls.png',{path,contentType:'image/png'});
});
test('C11: en sista radändring under sparning köas och osparade paket skyddas vid planändring',async({page})=>{
 await putFrame();await enter(page);const add=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/programplaner/paketval');await packages(page).getByRole('button',{name:'Lägg till paket',exact:true}).click();expect((await add).status()).toBe(200);
 let writes=0;await page.route('**/api/programplaner/paketval',async route=>{writes++;const reply=await route.fetch();if(writes===1)await new Promise(r=>setTimeout(r,1000));await route.fulfill({response:reply});});
 const input=packages(page).getByLabel('Franska MODO1000X, Åk 1 HT',{exact:true});await input.fill('75');await packages(page).locator('.ppk-entry strong').first().click();await expect(packages(page)).toContainText('Sparar…');
 await input.fill('50');await packages(page).locator('.ppk-entry strong').first().click();await expect.poll(()=>writes).toBe(2);await expect(packages(page)).toContainText('Sparat');await page.unroute('**/api/programplaner/paketval');
 const read=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval/lasa',{planId:fixture.planId});expect(read.body.units[0].revision).toBe(3);expect(read.body.units[0].selections[0].entries[0].distribution.find(d=>d.levelKey==='MODO:1:MODO1000X').points[0]).toBe(50);
 await input.fill('101');await packages(page).locator('.ppk-entry strong').first().click();await expect(packages(page)).toContainText('Rätta raden först');let structureWrites=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/programplaner/fordjupning')structureWrites++;});
 await board(page).getByRole('searchbox',{name:'Lägg till ämne eller nivå'}).fill('ANIM1000X');await board(page).locator('button[data-level-code="ANIM1000X"]').click();await expect(board(page)).toContainText('Spara eller läs om skolans paket innan du ändrar planens nivåer.');expect(structureWrites).toBe(0);await expect(input).toHaveValue('101');
});
test('C12: tappat svar efter sparning återläses utan en andra skrivning',async({page})=>{
 await putFrame();await enter(page);let writes=0;await page.route('**/api/programplaner/paketval',async route=>{writes++;await route.fetch();await route.fulfill({status:200,contentType:'application/json',body:'{}'});});
 await packages(page).getByRole('button',{name:'Lägg till paket',exact:true}).click();await expect(packages(page)).toContainText('Sparat');expect(writes).toBe(1);
 const back=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval/lasa',{planId:fixture.planId});expect(back.status).toBe(200);expect(back.body.units[0].revision).toBe(1);expect(back.body.units[0].selections[0].entries).toHaveLength(1);
});
