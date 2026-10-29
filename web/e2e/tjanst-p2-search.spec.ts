// 05.1-36/B03: synthetic in-memory component evidence; no real server or database.
import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst');
const allocation=(p:Page)=>ws(p).getByRole('region',{name:'Fördela',exact:true});
const candidates=(p:Page)=>allocation(p).getByRole('list',{name:'Lärare att välja'});
const search=(p:Page)=>allocation(p).getByLabel('Sök lärare',{exact:true});
const sent=(p:Page)=>p.evaluate(()=>window.__tjanst.commands.filter(c=>c.body.action==='save_row'));
async function open(p:Page){await p.goto('/e2e/fixtures/tjanst-preview.html?tjvy=fordela');await expect(allocation(p).getByRole('button',{name:'Välj Anna Andersson',exact:true})).toBeVisible();}
test.beforeEach(({},info)=>{test.skip(!info.project.name.startsWith('desktop'),'Lärarval finns bara på dator.');});

test('B03 ingen träff ger inga kandidatval eller skrivningar',async({page})=>{
 await open(page);await search(page).fill('ZZZINGEN');
 await expect(candidates(page).getByRole('button')).toHaveCount(0);
 await expect(allocation(page).getByText('Inga lärare matchar sökningen.',{exact:true})).toBeVisible();
 await search(page).press('Enter');
 await allocation(page).getByRole('heading',{name:'Matematik 1c · TE26A',exact:true}).focus();await page.keyboard.press('1');
 expect(await sent(page)).toHaveLength(0);
});

test('B03 rekommenderad namnsökning filtreras och Enter väljer synlig träff',async({page})=>{
 await open(page);await search(page).fill(' aNNa ');
 await expect(candidates(page).getByRole('button')).toHaveText(['Välj Anna Andersson']);
 expect(await sent(page)).toHaveLength(0);
 await search(page).press('Enter');
 await expect(ws(page).getByText('Tjänsteraden är sparad: Anna Andersson, Matematik 1c, TE26A, HT 50 h · VT 50 h.',{exact:true})).toBeVisible();
 const writes=await sent(page);expect(writes).toHaveLength(1);
 expect(writes[0].body.payload).toMatchObject({personId:'51a50000-0000-4000-8000-000000000101',planningContext:{choice:{kind:'suggestion'}}});
});

test('B03 exakt manuell kandidat kan väljas med Enter',async({page})=>{
 await open(page);await search(page).fill('Cecilia Dahl');
 await expect(candidates(page).getByRole('button')).toHaveText(['Välj Cecilia Dahl']);expect(await sent(page)).toHaveLength(0);
 await search(page).press('Enter');
 await expect(ws(page).getByText('Tjänsteraden är sparad: Cecilia Dahl, Matematik 1c, TE26A, HT 50 h · VT 50 h.',{exact:true})).toBeVisible();
 const writes=await sent(page);expect(writes).toHaveLength(1);
 expect(writes[0].body.payload).toMatchObject({personId:'51a50000-0000-4000-8000-000000000103',planningContext:{choice:{kind:'manual'}}});
});

test('B03 sifferval gäller bara synliga kandidater efter sökning',async({page})=>{
 await open(page);await search(page).fill('Bertil');
 await expect(candidates(page).getByRole('button')).toHaveText(['Välj Bertil Berg']);expect(await sent(page)).toHaveLength(0);
 await allocation(page).getByRole('heading',{name:'Matematik 1c · TE26A',exact:true}).focus();await page.keyboard.press('1');
 await expect(ws(page).getByText('Tjänsteraden är sparad: Bertil Berg, Matematik 1c, TE26A, HT 50 h · VT 50 h.',{exact:true})).toBeVisible();
 const writes=await sent(page);expect(writes).toHaveLength(1);
 expect(writes[0].body.payload.personId).toBe('51a50000-0000-4000-8000-000000000102');
});

test('B03 tömd sökning återställer kandidater utan dubbletter eller sparning',async({page})=>{
 await open(page);const before=await candidates(page).getByRole('button').allTextContents();
 await search(page).fill('Anna');await expect(candidates(page).getByRole('button')).toHaveText(['Välj Anna Andersson']);
 await search(page).fill('');await expect(candidates(page).getByRole('button')).toHaveText(before);
 expect(new Set(before).size).toBe(before.length);expect(await sent(page)).toHaveLength(0);
});
