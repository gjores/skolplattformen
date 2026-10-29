// F09 / 05.1-37: synthetic in-memory component evidence, no actual auth/database.
import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst'), matrix=(p:Page)=>ws(p).getByRole('region',{name:'Matris',exact:true});
const undo=(p:Page)=>ws(p).getByRole('button',{name:'Ångra senaste direkta tilldelningen',exact:true});
const cell=(p:Page,teacher='Cecilia Dahl',course='Matematik 1c',cls='TE26A')=>matrix(p).getByRole('button',{name:new RegExp(`^${teacher}, ${course}, ${cls}:`)});
const commands=(p:Page)=>p.evaluate(()=>window.__tjanst.commands);
const draft=(p:Page)=>p.evaluate(()=>(window.__tjanst.snapshotOf() as {draft:{rows:unknown[]}}).draft);
async function open(p:Page,q=''){await p.goto('/e2e/fixtures/tjanst-preview.html'+q);await expect(ws(p).locator('.tjanst-content')).toBeVisible();}
async function saved(p:Page){await expect(undo(p)).toBeEnabled();await expect(ws(p).getByText('Kontrollerar ändringen i matrisen…')).toHaveCount(0);}

test('F09 telefon och historik erbjuder ingen direkt tilldelning',async({page},info)=>{
 await open(page);if(info.project.name.startsWith('phone')){
  await expect(ws(page).getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true})).toHaveCount(0);await expect(undo(page)).toHaveCount(0);
 }else{
  await ws(page).getByRole('button',{name:'Historik',exact:true}).click();await expect(ws(page).getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true})).toHaveCount(0);
  await expect(matrix(page).getByRole('button',{name:/Tilldela\.$/})).toHaveCount(0);
 }
 expect(await commands(page)).toHaveLength(0);
});

test.describe('F09 dator',()=>{
 test.beforeEach(({},info)=>test.skip(!info.project.name.startsWith('desktop'),'Tilldelning sker bara på dator.'));
 test('ett klick tilldelar namngiven lärare och ångra bevarar övriga rader',async({page})=>{
  await open(page);const before=await draft(page);await expect(ws(page).getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true})).not.toBeChecked();
  await cell(page).click();await saved(page);await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(cell(page)).toHaveAccessibleName('Cecilia Dahl, Matematik 1c, TE26A: 100 h. Ändra.');await expect(cell(page)).toBeFocused();
  const sent=await commands(page);expect(sent).toHaveLength(1);expect(sent[0].body.payload).toMatchObject({personId:'51a50000-0000-4000-8000-000000000103',teacherHt:3000,teacherVt:3000,planningContext:{choice:{kind:'manual'}}});
  await undo(page).click();await expect(cell(page)).toHaveAccessibleName('Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.');await expect(undo(page)).toHaveCount(0);await expect(cell(page)).toBeFocused();
  expect((await draft(page)).rows).toEqual(before.rows);
 });
 test('vakant rad ersätts med återstående tid; ångra återställer exakt tidigare rad',async({page})=>{
  await open(page);const before=await draft(page);await cell(page,'Cecilia Dahl','Svenska som andraspråk 1','IMSPR').click();await saved(page);
  expect((await commands(page))[0].body.payload).toMatchObject({rowId:'51a50000-0000-4000-8000-000000000305',teacherHt:4320,teacherVt:4320});
  await undo(page).click();await expect(undo(page)).toHaveCount(0);expect((await draft(page)).rows).toEqual(before.rows);
 });
 test('delvis fördelat behov får bara återstående tid och obligatorisk delningsfråga',async({page})=>{
  await open(page,'?data=manga&delvis=1');const target=matrix(page).getByRole('button',{name:/, Historia 1, MA3: ingen tid\. Tilldela\.$/}).first();await target.click();
  await expect(page.getByRole('dialog',{name:'Hur delar lärarna kursen?'})).toBeVisible();
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');expect(sent).toHaveLength(1);expect(sent[0].body.payload).toMatchObject({teacherHt:0,teacherVt:1500});
 });
 test('okänd tid och redan täckt behov kräver dialog, utan automatisk extratid',async({page})=>{
  await open(page,'?data=okand-tid');await cell(page).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await commands(page)).toHaveLength(0);
  await page.getByRole('dialog').getByRole('button',{name:'Stäng utan att spara',exact:true}).click();
  await cell(page,'Cecilia Dahl','Matematik 1b','EK26').click();const d=page.getByRole('dialog');await expect(d.getByLabel('Lärartid HT (timmar)')).toHaveValue('0');await expect(d.getByLabel('Lärartid VT (timmar)')).toHaveValue('0');expect(await commands(page)).toHaveLength(0);
 });
 test('avancerat läge och Skift+Enter öppnar dialog; vanlig Enter sparar',async({page})=>{
  await open(page);const advanced=ws(page).getByRole('checkbox',{name:'Avancerade val före tilldelning',exact:true});await advanced.check();await cell(page).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await advanced.uncheck();await cell(page).focus();await page.keyboard.press('Shift+Enter');await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');expect(await commands(page)).toHaveLength(0);await cell(page).focus();await page.keyboard.press('Enter');await saved(page);
 });
 test('sparstatus och Ångra stannar på raden utan att flytta matrisen',async({page})=>{
  await open(page);const scroll=ws(page).locator('.tjanst-matrix-scroll');const target=cell(page);await target.scrollIntoViewIfNeeded();
  const key=await target.locator('xpath=ancestor::tr').getAttribute('data-need-row');
  const row=scroll.locator(`tr[data-need-row="${key}"]`), feedback=row.locator('.tjanst-row-feedback');
  const before=await scroll.boundingBox();const rowBefore=await row.boundingBox();
  await page.evaluate(()=>window.__tjanst.holdNext('plan/forhandsvisa'));await target.click();
  await expect(feedback.getByText('Kontrollerar ändringen i matrisen…')).toBeVisible();
  const pending=await scroll.boundingBox();expect(pending!.y).toBeCloseTo(before!.y,0);
  await page.evaluate(()=>window.__tjanst.release());await saved(page);
  await expect(feedback.getByText('Sparat · Cecilia Dahl')).toBeVisible();await page.screenshot({path:'/private/tmp/tjanst38-row-feedback.png'});await expect(row.getByRole('button',{name:'Ångra senaste direkta tilldelningen'})).toBeEnabled();
  expect((await scroll.boundingBox())!.y).toBeCloseTo(before!.y,0);expect((await row.boundingBox())!.height).toBeCloseTo(rowBefore!.height,0);
  await expect(ws(page).locator('.tjanst-messages .admin-notice')).toHaveCount(0);
  await undo(page).click();await expect(feedback.getByText('Tilldelningen är ångrad.')).toBeVisible();expect((await scroll.boundingBox())!.y).toBeCloseTo(before!.y,0);
 });
 test('kompakta och fulla lärarrubriker ligger kvar vid lodrät och vågrät skrollning',async({page})=>{
  await open(page,'?data=stor');await ws(page).getByRole('button',{name:'Visa alla lärare (40)'}).click();
  const compact=ws(page).getByRole('checkbox',{name:'Kompakta kolumner',exact:true});
  for(const enabled of [true,false]){
   await compact.setChecked(enabled);const scroll=ws(page).locator('.tjanst-matrix-scroll');
   await scroll.evaluate(el=>{el.scrollTop=450;el.scrollLeft=350;});
   const bounds=await scroll.boundingBox(),head=await scroll.locator('thead th.tjanst-teacher').nth(8).boundingBox();
   expect(head!.y).toBeGreaterThanOrEqual(bounds!.y);expect(head!.y).toBeLessThan(bounds!.y+3);
   const first=await scroll.locator('thead .tjanst-first').boundingBox();expect(first!.x).toBeCloseTo(bounds!.x+1,0);if(enabled) await scroll.screenshot({path:'/private/tmp/tjanst38-sticky-'+test.info().project.name+'.png'});
  }
 });
 test('dubbelklick under förhandskontroll skickar bara ett kommando',async({page})=>{
  await open(page);await page.evaluate(()=>window.__tjanst.holdNext('plan/forhandsvisa'));
  await cell(page).evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});
  await expect(ws(page).getByText('Kontrollerar ändringen i matrisen…')).toBeVisible();await expect(page.getByRole('button',{name:'Lämna arbetsytan',exact:true})).toBeDisabled();
  expect(await commands(page)).toHaveLength(0);await page.evaluate(()=>window.__tjanst.release());await saved(page);expect(await commands(page)).toHaveLength(1);
 });
 test('byte till telefon före kontrollsvaret skickar ingen tilldelning',async({page})=>{
  await open(page);await page.evaluate(()=>window.__tjanst.holdNext('plan/forhandsvisa'));await cell(page).click();await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__tjanst.release());
  await expect(ws(page).getByText('Kontrollerar ändringen i matrisen…')).toHaveCount(0);expect(await commands(page)).toHaveLength(0);await page.setViewportSize({width:1024,height:768});await expect(cell(page)).toHaveAccessibleName('Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.');
 });
 test('underlag som ändras före sparningen måste väljas på nytt',async({page})=>{
  await open(page);await page.evaluate(()=>window.__tjanst.holdProduced('plan/forhandsvisa'));await cell(page).click();
  await expect.poll(()=>page.evaluate(()=>window.__tjanst.produced.filter(x=>x.route==='plan/forhandsvisa').length)).toBe(1);
  await page.evaluate(()=>{window.__tjanst.bump('core');window.__tjanst.releaseProduced();});
  await expect(ws(page).getByRole('alert')).toContainText('Underlaget har ändrats');await expect(undo(page)).toHaveCount(0);
  await cell(page).click();await saved(page);expect((await commands(page)).filter(c=>c.body.action==='save_row')).toHaveLength(2);
 });
 test('okänt sparutfall ger ingen falsk ångra eller automatisk omsändning',async({page})=>{
  await open(page);await page.evaluate(()=>{window.__tjanst.failNext('plan/kommando','network');window.__tjanst.failNext('plan/status','network');});await cell(page).click();
  await expect(ws(page).getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible();await expect(undo(page)).toHaveCount(0);await expect(page.getByRole('button',{name:'Lämna arbetsytan',exact:true})).toBeDisabled();
  const n=(await commands(page)).length;await ws(page).getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click();await expect(cell(page)).toBeVisible();expect((await commands(page)).length).toBe(n);
 });
 test('ändrad rad gör tidigare ångra otillgängligt',async({page})=>{
  await open(page);await cell(page).click();await saved(page);await cell(page).click();const d=page.getByRole('dialog');await d.getByLabel('Lärartid HT (timmar)').fill('40');await d.getByRole('button',{name:'Spara tjänsteraden',exact:true}).click();await expect(d).toHaveCount(0);await expect(undo(page)).toHaveCount(0);await expect(cell(page)).toHaveAccessibleName('Cecilia Dahl, Matematik 1c, TE26A: 90 h. Ändra.');
 });
 test('ångra avbryts om Bakåt lämnar matrisen före förhandskontrollen',async({page})=>{
  await open(page,'?tjvy=klass');await ws(page).getByRole('tab',{name:'Matris',exact:true}).click();await cell(page).click();await saved(page);
  await page.evaluate(()=>window.__tjanst.holdNext('plan/forhandsvisa'));await undo(page).click();await page.goBack();
  await expect(ws(page).locator('section[aria-label="Per klass"]')).toBeVisible();await page.evaluate(()=>window.__tjanst.release());
  await expect(ws(page).getByText('Kontrollerar ändringen i matrisen…')).toHaveCount(0);expect(await commands(page)).toHaveLength(1);
  await page.goForward();await expect(cell(page)).toHaveAccessibleName('Cecilia Dahl, Matematik 1c, TE26A: 100 h. Ändra.');
 });
 test('första direktvalet efter publicering och ångra bevarar publicerad historik',async({page})=>{
  await open(page,'?data=publicerad');const before=await page.evaluate(()=>window.__tjanst.snapshotOf() as {snapshots:unknown});
  await cell(page).click();await saved(page);await undo(page).click();await expect(undo(page)).toHaveCount(0);await expect(cell(page)).toBeFocused();
  expect(await page.evaluate(()=>(window.__tjanst.snapshotOf() as {snapshots:unknown}).snapshots)).toEqual(before.snapshots);
 });

});
