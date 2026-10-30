import {selectFilter} from './tjanst-toolbar';
// Synthetic in-memory component evidence for B05; no real database/authentication.
import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst');
const allocation=(p:Page)=>ws(p).getByRole('region',{name:'Fördela',exact:true});
const ht=(p:Page)=>allocation(p).getByLabel('Lärartid HT (timmar)');
const queue=(p:Page)=>allocation(p).getByRole('list',{name:'Ofördelade behov'});
const dirty=(p:Page)=>p.locator('[data-unsaved]');
async function open(p:Page){await p.goto('/e2e/fixtures/tjanst-preview.html?tjvy=fordela');await expect(ht(p)).toHaveValue('50');}
async function view(p:Page,name:string){await ws(p).getByRole('tab',{name,exact:true}).click();}
async function math(p:Page){await queue(p).getByRole('button',{name:'Matematik 1c · TE26A',exact:true}).click();}
async function im(p:Page){await queue(p).getByRole('button',{name:'Svenska som andraspråk 1 · IMSPR',exact:true}).click();}
test.beforeEach(({},info)=>{test.skip(!info.project.name.startsWith('desktop'),'Tider anges på dator; storleksbyte provas från datorläget.');});

test('B05 tider per behov över vybyte och filter, även ogiltig inmatning',async({page})=>{
 await open(page);await ht(page).fill('37');await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
 await im(page);await expect(ht(page)).toHaveValue('36');await ht(page).fill('ej tid');
 await view(page,'Per lärare');await expect(ws(page).getByText('Osparade tider i Fördela: 2 behov.',{exact:false})).toBeVisible();
 await view(page,'Fördela');await math(page);await expect(ht(page)).toHaveValue('37');
 await selectFilter(page,'Ämne','Engelska');await expect(ht(page)).toHaveCount(0);
 await ws(page).locator('.tjanst-filter').getByRole('button',{name:'Rensa filter',exact:true}).click();
 // Rensa filter väljer Alla behov. Återställ Ofördelat för att hitta båda osparade behoven.
 await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');
 await math(page);await expect(ht(page)).toHaveValue('37');
 await allocation(page).getByRole('button',{name:'Återställ tider för behovet',exact:true}).click();await expect(ht(page)).toHaveValue('50');
 await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
 await im(page);await expect(ht(page)).toHaveValue('ej tid');
 expect(await page.evaluate(()=>window.__tjanst.commands)).toHaveLength(0);
});

test('B05 historik och telefonstorlek bevarar aktuella tider; återställning är uttrycklig',async({page})=>{
 await open(page);await ht(page).fill('37');
 await ws(page).getByRole('button',{name:'Historik',exact:true}).click();
 await expect(ht(page)).toHaveCount(0);await expect(ws(page).getByRole('button',{name:'Återställ alla osparade tider i Fördela'})).toHaveCount(0);
 await ws(page).getByRole('button',{name:'Tillbaka till planeringen',exact:true}).click();await expect(ht(page)).toHaveValue('37');
 await page.setViewportSize({width:390,height:844});await expect(ht(page)).toHaveCount(0);
 await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
 await page.setViewportSize({width:1024,height:768});await expect(ht(page)).toHaveValue('37');
 await allocation(page).getByRole('button',{name:'Återställ tider för behovet',exact:true}).click();
 await expect(ht(page)).toHaveValue('50');await expect(dirty(page)).toHaveAttribute('data-unsaved','false');
});

test('B05 lyckad sparning rensar bara det sparade behovet',async({page})=>{
 await open(page);await ht(page).fill('37');await im(page);await ht(page).fill('29');await math(page);await expect(ht(page)).toHaveValue('37');
 await allocation(page).getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
 await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 37 h · VT 50 h.',{exact:true})).toBeVisible();
 await expect(ws(page).getByText('Osparade tider i Fördela: 1 behov.',{exact:false})).toBeVisible();
 await im(page);await expect(ht(page)).toHaveValue('29');await math(page);await expect(ht(page)).toHaveValue('13');
 await ws(page).getByRole('button',{name:'Återställ alla osparade tider i Fördela',exact:true}).click();
 await expect(dirty(page)).toHaveAttribute('data-unsaved','false');
});

test('B05 underlagsfel bevarar utkast över vybyte och kräver nytt stöd',async({page})=>{
 await open(page);await ht(page).fill('37');
 await page.evaluate(()=>{window.__tjanst.bump('core');window.__tjanst.holdNext('plan/forhandsvisa');});
 await allocation(page).getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
 await expect(allocation(page).getByRole('alert')).toContainText('Underlaget har ändrats');
 await expect(allocation(page).getByRole('button',{name:'Välj Cecilia Dahl',exact:true})).toHaveCount(0);
 await view(page,'Per lärare');await page.evaluate(()=>window.__tjanst.release());await view(page,'Fördela');
 await expect(ht(page)).toHaveValue('37');await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
 await allocation(page).getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
 await expect(dirty(page)).toHaveAttribute('data-unsaved','false');
 const sent=await page.evaluate(()=>window.__tjanst.commands.filter(c=>c.body.action==='save_row'));
 expect(sent).toHaveLength(2);expect(sent[0].body.payload.planningContext.expectedBasisHash).not.toBe(sent[1].body.payload.planningContext.expectedBasisHash);
});

test('B05 byte av skola, läsår och uppdrag läcker inte utkast',async({page})=>{
 for(const label of ['Byt skola','Byt läsår','Byt uppdrag']){
  await open(page);await ht(page).fill('37');await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
  // Harness switches scope directly; the full shell's existing confirmDiscard guards are not simulated here.
  await page.getByRole('button',{name:label,exact:true}).click();await expect(dirty(page)).toHaveAttribute('data-unsaved','false');
  await page.getByRole('button',{name:label,exact:true}).click();await expect(ht(page)).toHaveValue('50');
 }
});


test('B05 okänt sparsvar bevarar tider och journalspärr över vybyte',async({page})=>{
 await open(page);await ht(page).fill('37');
 await page.evaluate(()=>{window.__tjanst.failNext('plan/kommando','network');window.__tjanst.failNext('plan/status','network');});
 await allocation(page).getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();
 await expect(ws(page).getByRole('button',{name:'Kontrollera sparstatus',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Lämna arbetsytan',exact:true})).toBeDisabled();
 const attempts=await page.evaluate(()=>window.__tjanst.commands.filter(c=>c.body.action==='save_row').length);
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')).length)).toBe(1);
 await view(page,'Per lärare');await view(page,'Fördela');
 await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
 await expect(ws(page).getByRole('button',{name:'Återställ alla osparade tider i Fördela',exact:true})).toBeDisabled();
 await ws(page).getByRole('button',{name:'Kontrollera sparstatus',exact:true}).click();
 await expect(ht(page)).toHaveValue('37');
 expect(await page.evaluate(()=>window.__tjanst.commands.filter(c=>c.body.action==='save_row').length)).toBe(attempts);
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')).length)).toBe(0);
 await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
});


test('B05 webbläsarens lämna-skydd bevarar tider vid avbruten omladdning',async({page})=>{
 await open(page);await ht(page).click();await ht(page).fill('37');
 const prompted=page.waitForEvent('dialog',{timeout:5000});
 const reload=page.reload({timeout:5000}).catch(()=>null);
 const dialog=await prompted;expect(dialog.type()).toBe('beforeunload');await dialog.dismiss();await reload;
 await expect(ht(page)).toHaveValue('37');await expect(dirty(page)).toHaveAttribute('data-unsaved','true');
});
