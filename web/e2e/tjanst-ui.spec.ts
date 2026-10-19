// Synthetic component evidence for Tjänstefördelning (05.1-05). /api/tjanst/* is answered by the fixture's in-browser mock;
// no database, server or live authentication. Komponentprov, inte faktiskt prov.
import {test,expect,type Page} from '@playwright/test';
const url='/e2e/fixtures/tjanst-preview.html';
const ws=(page:Page)=>page.locator('.tjanst');
type Logged={path:string;body:any};
const commands=(page:Page)=>page.evaluate(()=>window.__tjanst.commands) as Promise<Logged[]>;
const desktop=(name:string)=>name.startsWith('desktop');
async function open(page:Page,query=''){
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url+query);await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
 return errors;
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);}
const matrix=(page:Page)=>ws(page).getByRole('region',{name:'Matris'});
const footer=(page:Page,label:string,teacher:string)=>page.locator(`[data-sum="${label}:${teacher}"]`);

test.describe('dator',()=>{
 test.beforeEach(({},info)=>{test.skip(!desktop(info.project.name),'Matris och redigering finns bara på dator (D-15).');});

 test('fördela tom cell',async({page})=>{
  const errors=await open(page);
  const cell=matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: ingen tid. Tilldela.'});
  await cell.click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Schemalagd tid')).toBeVisible();await expect(dialog.getByText('Underlag saknas')).toBeVisible();
  await expect(dialog.getByText('Källa: Teknikprogrammet version 2, ämnesrad Matematik 1c')).toBeVisible();
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('50');await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('50');
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await expect(dialog.getByText('Avvikelse VT: −10 h')).toBeVisible();
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 50 h · VT 40 h.')).toBeVisible();
  const sent=(await commands(page)).filter(c=>c.body.action==='save_row');
  expect(sent).toHaveLength(1);expect(sent[0].body.payload).toMatchObject({rowId:null,personId:'51a50000-0000-4000-8000-000000000103',teacherHt:3000,teacherVt:2400});
  expect(sent[0].body.payloadHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  const reads=await page.evaluate(()=>window.__tjanst.reads.filter(r=>r.path.endsWith('/plan/lasa')).length);expect(reads).toBeGreaterThanOrEqual(2);
  const saved=matrix(page).getByRole('button',{name:'Cecilia Dahl, Matematik 1c, TE26A: 90 h. Ändra.'});await expect(saved).toBeVisible();
  const mathRow=matrix(page).getByRole('row').filter({has:page.getByRole('rowheader',{name:/^Matematik 1c/})});
  await expect(mathRow.locator('.tjanst-deviation')).toHaveText('−10 h');
  await expect(footer(page,'Totalt','Cecilia Dahl')).toHaveText('90 h');await expect(footer(page,'Undervisning','Cecilia Dahl')).toHaveText('90 h');
  await expect(saved).toBeFocused();
  expect(errors).toEqual([]);
 });
});
