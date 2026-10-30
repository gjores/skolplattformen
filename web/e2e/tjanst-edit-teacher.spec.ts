import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst');
const cell=(p:Page,name:string)=>ws(p).getByRole('button',{name,exact:true});
const commands=(p:Page)=>p.evaluate(()=>window.__tjanst.commands);
test.beforeEach(async({page},info)=>{test.skip(!info.project.name.startsWith('desktop'),'Redigering sker på dator.');await page.goto('/e2e/fixtures/tjanst-preview.html');await expect(ws(page).locator('.tjanst-content')).toBeVisible();});
test('byt befintlig lärare uttryckligt: bevara rad och tid, avbryt utan skrivning och spara en gång',async({page})=>{
 await cell(page,'Anna Andersson, Matematik 1b, EK26: 100 h. Ändra.').click();let d=page.getByRole('dialog');
 await expect(d.getByRole('heading',{name:'Vad vill du göra?'})).toBeVisible();await expect(d.getByRole('button',{name:'Avancerade val'})).toBeVisible();await expect(d.getByLabel('Lärartid HT (timmar)')).toHaveCount(0);
 await d.getByRole('button',{name:'Byt lärare'}).click();await d.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();await expect(d.getByText('Lärare: Cecilia Dahl',{exact:true})).toBeVisible();expect(await commands(page)).toHaveLength(0);
 await d.getByRole('button',{name:'Stäng utan att spara'}).click();expect(await commands(page)).toHaveLength(0);await expect(cell(page,'Anna Andersson, Matematik 1b, EK26: 100 h. Ändra.')).toBeVisible();
 await cell(page,'Anna Andersson, Matematik 1b, EK26: 100 h. Ändra.').click();d=page.getByRole('dialog');await d.getByRole('button',{name:'Byt lärare'}).click();await d.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();await expect(d.getByRole('button',{name:'Spara tjänsteraden',exact:true})).toBeFocused();await d.getByRole('button',{name:'Spara tjänsteraden',exact:true}).click();await expect(d).toHaveCount(0);
 const q=(await commands(page))[0].body;expect(q.payload).toMatchObject({rowId:'51a50000-0000-4000-8000-000000000306',personId:'51a50000-0000-4000-8000-000000000103',teacherHt:3000,teacherVt:3000});expect(await commands(page)).toHaveLength(1);await expect(cell(page,'Cecilia Dahl, Matematik 1b, EK26: 100 h. Ändra.')).toBeVisible();await expect(ws(page).getByText('Sparat · Cecilia Dahl',{exact:true})).toBeVisible();
});
test('redan tilldelad kollega går inte att välja som dubblett',async({page})=>{
 await cell(page,'Anna Andersson, Engelska 5, TE26A: 50 h. Ändra.').click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Byt lärare'}).click();await expect(d.getByRole('button',{name:'Välj Bertil Berg',exact:true})).toBeDisabled();await expect(d.getByText('Redan tilldelad på behovet. Ändra den lärarens ruta i matrisen.')).toBeVisible();expect(await commands(page)).toHaveLength(0);
});
test('sparfel lämnar valt lärarbyte och tid kvar för kontroll',async({page})=>{
 await cell(page,'Anna Andersson, Matematik 1b, EK26: 100 h. Ändra.').click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Byt lärare'}).click();await d.getByRole('button',{name:'Välj Cecilia Dahl',exact:true}).click();await d.getByLabel('Lärartid HT (timmar)').fill('45');
 await page.evaluate(()=>window.__tjanst.failNext('plan/kommando',{status:409,code:'tjanst_revision_conflict'}));await d.getByRole('button',{name:'Spara tjänsteraden',exact:true}).click();await expect(d.getByRole('alert').first()).toBeVisible();await expect(d.getByText('Lärare: Cecilia Dahl',{exact:true})).toBeVisible();await expect(d.getByLabel('Lärartid HT (timmar)')).toHaveValue('45');await expect(page.locator('.tjanst-matrix button[aria-label="Anna Andersson, Matematik 1b, EK26: 100 h. Ändra."]')).toHaveCount(1);
});
