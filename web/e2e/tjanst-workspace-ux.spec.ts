import {clickToolbarAction,selectFilter} from './tjanst-toolbar';
import {test,expect,type Page} from '@playwright/test';
const ws=(p:Page)=>p.locator('.tjanst');
async function open(p:Page,q=''){await p.goto('/e2e/fixtures/tjanst-preview.html'+q);await expect(ws(p).locator('.tjanst-content')).toBeVisible();}
const commands=(p:Page)=>p.evaluate(()=>window.__tjanst.commands);
test('hinderantal syns före öppning; exakt delningsbehov nås utan skrivning',async({page},info)=>{
 await open(page,'?delning=saknas');const phone=info.project.name.startsWith('phone');
 await expect(ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true})).toHaveCount(0);
 await ws(page).getByRole('button',{name:'Visa 1 hinder för publicering',exact:true}).click();const panel=ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true});await expect(panel).toBeFocused();
 await panel.getByRole('button',{name:`${phone?'Visa':'Öppna'} Engelska 5 · TE26A`,exact:true}).click();
 if(phone){await expect(ws(page).getByRole('region',{name:'Per klass',exact:true})).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);}else{await expect(page.getByRole('dialog')).toContainText('Engelska 5');}
 expect(await commands(page)).toHaveLength(0);
});
test('noll och okänt hinder ger inget påhittat objekt',async({page},info)=>{
 await open(page);await expect(ws(page).getByRole('button',{name:/^Visa \d+ hinder för publicering$/})).toHaveCount(0);
 await open(page,'?hinder=okant');await ws(page).getByRole('button',{name:'Visa 1 hinder för publicering',exact:true}).click();const panel=ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true});await expect(panel).toContainText('Meddelandet pekar inte ut en viss rad.');
 await panel.getByRole('button',{name:`${info.project.name.startsWith('phone')?'Visa':'Öppna'} Samlad granskning`,exact:true}).click();await expect(ws(page).getByRole('region',{name:'Per kurs/ämne',exact:true})).toBeVisible();expect(await commands(page)).toHaveLength(0);
});
test.describe('arbetsyta dator',()=>{
 test.beforeEach(({},info)=>test.skip(!info.project.name.startsWith('desktop'),'Redigering sker på dator.'));
 test('introduktion och verktyg tar inte första arbetsytan; menyer stängs och återfår fokus',async({page},info)=>{
  await open(page);await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);
  await expect(ws(page).getByText('Fördela skolans undervisning och specialuppdrag på lärare.',{exact:false})).toBeHidden();
  const row=ws(page).locator('[data-need-row]').first();const box=await row.boundingBox();expect(box!.y+44).toBeLessThanOrEqual(page.viewportSize()!.height);
  const tools=ws(page).locator('.tjanst-actions > details').filter({hasText:'Verktyg'}).locator(':scope > summary');await tools.click();await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(tools).toBeFocused();await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);
  await page.keyboard.press('Enter');await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toBeVisible();await ws(page).getByRole('heading',{name:'Tjänstefördelning',exact:true}).click();await expect(ws(page).getByRole('button',{name:'Massregistrera',exact:true})).toHaveCount(0);
  await tools.focus();await page.keyboard.press('Space');await page.keyboard.press('Tab');await page.keyboard.press('Tab');await page.keyboard.press('Tab');await expect(ws(page).getByRole('button',{name:'Flytta uppdrag',exact:true})).toBeFocused();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(tools).toBeFocused();expect(await commands(page)).toHaveLength(0);
  await clickToolbarAction(page,'Lägg till specialuppdrag');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(ws(page).locator('.tjanst-actions > details').filter({hasText:'Lägg till'}).locator(':scope > summary')).toBeFocused();
  await page.screenshot({path:`/private/tmp/tjanst41-${info.project.name}-workspace.png`});
 });
 test('flera hinder pekar på rätt rad; rättning och omläsning minskar antalet',async({page})=>{
  await open(page,'?hinder=flera');await ws(page).getByRole('button',{name:'Visa 3 hinder för publicering',exact:true}).click();const panel=ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true});
  await expect(panel.getByRole('button',{name:'Öppna Lärare i fördelningen',exact:true})).toBeVisible();await panel.getByRole('button',{name:'Öppna Anna Andersson · Matematik 1b · EK26',exact:true}).click();const d=page.getByRole('dialog');await expect(d).toContainText('Matematik 1b · EK26');expect(await commands(page)).toHaveLength(0);await d.getByRole('button',{name:'Spara tjänsteraden',exact:true}).click();await expect(d).toHaveCount(0);await expect(ws(page).getByRole('button',{name:'Visa 2 hinder för publicering',exact:true})).toBeVisible();
  await clickToolbarAction(page,'Hämta aktuellt läge');await expect(ws(page).locator('.tjanst-actions > details > summary').filter({hasText:'Verktyg'})).toBeFocused();await expect(ws(page).getByRole('button',{name:'Visa 2 hinder för publicering',exact:true})).toBeVisible();
 });
});

test('samläsningshinder fokuserar exakt objekt även med tidigare filter',async({page},info)=>{
 await open(page,'?data=samlasning&hinder=blandad');if(info.project.name.startsWith('phone'))await ws(page).getByRole('combobox',{name:'Vy',exact:true}).selectOption('klass');await selectFilter(page,'Klass',{label:'EK26'});await ws(page).getByRole('button',{name:'Visa 1 hinder för publicering',exact:true}).click();
 const panel=ws(page).getByRole('region',{name:'Fastställ och publicera',exact:true});await panel.getByRole('button',{name:/^(Öppna|Visa) Samläsning:/}).click();const joint=ws(page).locator('[data-joint]').first();await expect(joint).toBeFocused();await expect(joint).toBeInViewport();expect(await commands(page)).toHaveLength(0);
});

test('verktygsmeny och filter ryms inom skärmens bredd; verktyg ryms också på höjden',async({page},info)=>{
 await open(page);const width=page.viewportSize()!.width,height=page.viewportSize()!.height;
 if(!info.project.name.startsWith('phone')){
  const tools=ws(page).locator('.tjanst-actions > details').filter({hasText:'Verktyg'});await tools.locator(':scope > summary').click();const panel=tools.locator(':scope > fieldset');
  await expect.poll(async()=>{const box=await panel.boundingBox();return !!box&&box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1;}).toBe(true);
  await page.keyboard.press('Escape');await expect(tools.locator(':scope > summary')).toBeFocused();
 }else await ws(page).getByRole('combobox',{name:'Vy',exact:true}).selectOption('kurs');
 const filters=ws(page).locator('.tjanst-filter-options');await filters.locator(':scope > summary').click();const panel=await filters.locator(':scope > fieldset').boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(width+1);
 await filters.getByLabel('Ämne',{exact:true}).selectOption('Matematik');await page.keyboard.press('Escape');await expect(filters.locator(':scope > summary')).toHaveText('Filter (1)');await expect(filters.locator(':scope > summary')).toBeFocused();expect(await commands(page)).toHaveLength(0);
});
