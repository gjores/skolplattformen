import {onlyIssues,selectFilter} from './tjanst-toolbar';
// Synthetic UI evidence for 05.1-36; no real database or authentication.
import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst'), course=(p:Page)=>ws(p).getByRole('region',{name:'Per kurs/ämne',exact:true});
const phone=(p:Page)=>(p.viewportSize()?.width??1440)<=800;
const labels={matris:'Matris',fordela:'Fördela',klass:'Per klass',larare:'Per lärare',special:'Specialuppdrag',kurs:'Per kurs/ämne'};
async function view(p:Page,id:keyof typeof labels){if(phone(p))await ws(p).locator('.tjanst-view-select select').selectOption(id);else await ws(p).getByRole('tab',{name:labels[id],exact:true}).click();}
async function open(p:Page,q='?tjvy=kurs'){await p.goto('/e2e/fixtures/tjanst-preview.html'+q);await expect(ws(p).locator('.tjanst-content')).toBeVisible();}
const region=(p:Page,name:string)=>course(p).getByRole('region',{name,exact:true});

test('B02 behov visas före och efter tilldelning utan automatisk sparning',async({page})=>{
 await open(page);const math=region(page,'Matematik 1c');await expect(math).toContainText('TE26A');
 await expect(math).toContainText('Behov HT 50 h · VT 50 h');await expect(math).toContainText('Fördelat HT 0 h · VT 0 h');
 await expect(math).toContainText('Ingen lärare tilldelad ännu.');await expect(math.getByRole('checkbox')).toHaveCount(0);
 await expect(region(page,'Engelska 5')).toContainText('Fördelat HT 50 h · VT 50 h');
 await expect(math.getByRole('button',{name:'Öppna behovet i Fördela',exact:true})).toHaveCount(phone(page)?0:1);
 expect(await page.evaluate(()=>window.__tjanst.commands)).toHaveLength(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('B02 okänt behov visas som okänt',async({page})=>{await open(page,'?tjvy=kurs&data=okand-tid');await expect(region(page,'Matematik 1c')).toContainText('Behov HT okänt · VT okänt');});
test('B02 behovslänken öppnar exakt kurs och klass utan tilldelning',async({page})=>{
 test.skip(phone(page),'Tilldelning bara på dator.');await open(page);await region(page,'Matematik 1c').getByRole('button',{name:'Öppna behovet i Fördela',exact:true}).click();
 const panel=ws(page).getByRole('region',{name:'Fördela',exact:true});await expect(panel.getByRole('heading',{name:'Matematik 1c · TE26A',exact:true})).toBeVisible();await expect(panel.getByLabel('Lärartid HT (timmar)')).toHaveValue('50');
 expect(await page.evaluate(()=>window.__tjanst.commands)).toHaveLength(0);
});
test('B06 kursklick överlever omladdning samt bakåt och framåt',async({page})=>{
 test.skip(phone(page),'Matrisen finns på dator.');await open(page,'');await selectFilter(page,'Ämne','Matematik');await ws(page).getByRole('button',{name:'Matematik 1c',exact:true}).click();
 expect(await page.evaluate(()=>history.state.tjanst.filter.course)).toBe('MATMAT01c');await page.reload();await expect(region(page,'Matematik 1c')).toBeVisible();await expect(region(page,'Matematik 1b')).toHaveCount(0);
 await page.goBack();await expect(ws(page).getByRole('tab',{name:'Matris',exact:true})).toHaveAttribute('aria-selected','true');await expect(ws(page).getByLabel('Ämne',{exact:true})).toHaveValue('Matematik');expect(await page.evaluate(()=>history.state.tjanst.filter.course)).toBe('');
 await page.goForward();await expect(region(page,'Matematik 1c')).toBeVisible();await expect(region(page,'Matematik 1b')).toHaveCount(0);
});
test('B06 automatisk och uttrycklig lins bevarar avsikten vid omladdning',async({page})=>{
 test.skip(phone(page),'Matrisen finns på dator.');await open(page,'?tjvy=fordela');await view(page,'matris');await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');await page.goBack();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');await page.reload();await view(page,'matris');await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');
 await view(page,'fordela');await ws(page).getByLabel('Lins',{exact:true}).selectOption('samlasning');await ws(page).getByLabel('Lins',{exact:true}).selectOption('ofordelat');await page.reload();await view(page,'matris');await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('ofordelat');
});
test('B06 samläsningslänk visar gruppen efter omladdning',async({page})=>{
 await open(page,'?tjvy=klass');await ws(page).getByRole('button',{name:'Samläsning med EK26',exact:true}).click();const joint=region(page,'Samläsning: Svenska 1 TE26A + EK26');await expect(joint).toBeFocused();await page.reload();await expect(joint).toBeVisible();await expect(ws(page).getByLabel('Lins',{exact:true})).toHaveValue('alla');
});
for(const id of ['larare','special','kurs'] as const)test(`B04 ${labels[id]} är en tydlig årssammanställning`,async({page})=>{
 await open(page,'?tjvy='+id+'&termin=ht');await expect(ws(page).getByText('Hela läsåret · HT och VT',{exact:true})).toBeVisible();await expect(ws(page).getByRole('button',{name:'HT',exact:true})).toHaveCount(0);await view(page,'klass');await expect(ws(page).getByRole('button',{name:'HT',exact:true})).toHaveAttribute('aria-pressed','true');await expect(ws(page).getByRole('region',{name:'Per klass',exact:true}).locator('.tjanst-facts')).toContainText('150 h');
});
test('B04 kursens avvikelsefilter använder hela året, inte dolt HT-val',async({page})=>{
 await open(page,'?tjvy=kurs&termin=ht&data=apl');await onlyIssues(page);await expect(region(page,'Matematik 1b')).toContainText('Behov HT 50 h · VT 30 h');await expect(region(page,'Matematik 1b')).toContainText('Fördelat HT 50 h · VT 50 h');
});
