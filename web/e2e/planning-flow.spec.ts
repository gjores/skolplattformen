// Simulated replies with actual ProtectedHome/navigation; no Worker/SQL proof.
import {test,expect,type Page} from '@playwright/test';
import {id,location,mock} from './fixtures/planning-flow-data';
async function capture(page:Page,path:string){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path,fullPage:true});}
const timetable=(page:Page)=>page.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true});
const apl=(page:Page)=>page.getByRole('region',{name:'APL-planering',exact:true});
async function nav(page:Page,id:string){const target=page.getByTestId(id);if(!await target.isVisible())await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();await target.click();}
function scope(page:Page,process:string){const q=new URL(page.url()).searchParams;expect(q.get('vy')).toBe(process);expect(q.get('timplan')).toBe(id(1));expect(q.get('timplansskola')).toBe(id(3));expect(q.get('timplansutbildning')).toBe(id(2));expect(q.get('timplansversion')).toBe('2');expect(q.get('planeringslasar')).toBe('2027');}

test('timplanen visar endast timtabell; header öppnar separat APL och Back/reload bevarar exakt version',async({page},info)=>{
 const m=await mock(page);await page.goto(location());await expect(timetable(page)).toBeVisible();await expect(page.getByRole('heading',{name:'BF27A – pedagogik',exact:true})).toBeVisible();await expect(apl(page)).toHaveCount(0);expect(m.reads).not.toContain('/api/timplaner/gym/apl/lasa');
 await expect(timetable(page)).toContainText('100');await capture(page,info.outputPath('timetable-only.png'));
 await page.getByRole('button',{name:'Fortsätt till APL-planering'}).click();await expect(apl(page)).toBeVisible();scope(page,'apl-planering');await expect(timetable(page)).toHaveCount(0);await expect(page.getByRole('region',{name:'Beslut och nästa steg'})).toHaveCount(0);
 await page.reload();await expect(apl(page)).toBeVisible();scope(page,'apl-planering');await capture(page,info.outputPath('separate-apl.png'));
 await page.goBack();await expect(timetable(page)).toBeVisible();scope(page,'timplaner');await expect(apl(page)).toHaveCount(0);m.verify();
});
test('Till timplanen bevarar samma godkända tabell och skiljer processen från godkännandet',async({page})=>{
 const m=await mock(page);await page.goto(location('apl-planering'));await expect(apl(page)).toBeVisible();await expect(page.getByRole('heading',{name:'APL · BF27A – pedagogik',exact:true})).toBeVisible();await page.getByRole('button',{name:'Till timplanen',exact:true}).click();await expect(timetable(page)).toBeVisible();scope(page,'timplaner');expect(m.plans[0].revision).toBe(7);expect(m.plans[0].status).toBe('faststalld');m.verify();
});
test('sidebar öppnar APL-väljare med samtliga rader och spärrat högskoleförberedande program',async({page},info)=>{
 const m=await mock(page);await page.goto(location());await expect(timetable(page)).toBeVisible();await nav(page,'apl-planning-nav');await expect(page.getByRole('heading',{name:'APL-planering',exact:true})).toBeVisible();await page.getByRole('button',{name:'Välj timplan för APL',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.locator('tbody tr')).toHaveCount(2);
 const sa=dialog.locator('tbody tr').filter({hasText:'SA27A – grundfördelning'});await expect(sa).toContainText('Ingen APL på detta program');await expect(sa.getByRole('button',{name:/Öppna/})).toBeDisabled();
 await dialog.screenshot({path:info.outputPath('apl-picker.png')});await dialog.getByRole('button',{name:/Öppna BF27A – pedagogik/}).click();await expect(apl(page)).toBeVisible();scope(page,'apl-planering');await expect(dialog).toHaveCount(0);m.verify();
});
test('direkt APL-länk till högskoleförberedande program laddar rätt plan men ingen APL-editor',async({page})=>{
 const m=await mock(page);await page.goto(location('apl-planering').replace(`timplan=${id(1)}`,`timplan=${id(11)}`).replace(`timplansutbildning=${id(2)}`,`timplansutbildning=${id(12)}`));await expect(page.getByRole('heading',{name:'APL · SA27A – grundfördelning',exact:true})).toBeVisible();await expect(page.getByText('APL ingår inte i det här programmet.',{exact:false})).toBeVisible();await expect(apl(page)).toHaveCount(0);expect(m.reads).not.toContain('/api/timplaner/gym/apl/lasa');m.verify();
});
test('kompakt godkännande döljer kontrollformuläret tills det efterfrågas',async({page})=>{
 const m=await mock(page,{draft:true});await page.goto(location());await expect(timetable(page)).toBeVisible();const review=page.locator('.decision-review');await expect(review).toBeVisible();await expect(review).not.toHaveAttribute('open','');await expect(page.getByLabel('Undervisningstiden är granskad')).not.toBeVisible();await review.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Undervisningstiden är granskad')).toBeVisible();await expect(review).toContainText('Perioder och arbetsmoment granskas i APL-planeringen efteråt.');await expect(page.getByRole('button',{name:'Skicka till huvudmannen',exact:true})).toBeDisabled();m.verify();
});
test('kompakt godkännande visar att komplettering krävs innan granskningen öppnas',async({page})=>{
 const m=await mock(page,{draft:true,blocker:true});await page.goto(location());await expect(timetable(page)).toBeVisible();await expect(page.locator('.decision-review')).not.toHaveAttribute('open','');await expect(page.getByText('1 punkt behöver kompletteras före godkännande.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Visa vad som saknas',exact:true}).click();await expect(page.getByText('Timplanen behöver ytterligare 50 undervisningstimmar.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Skicka till huvudmannen',exact:true})).toBeDisabled();m.verify();
});
