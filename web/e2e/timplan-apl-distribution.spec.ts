// Production ProtectedHome/dialog with synthetic API. This does not prove SQL, mandates or delivered APL.
import {test,expect,type Page} from '@playwright/test';
import {gym,mock,location,rowKey,id} from './fixtures/planning-flow-data';
import {parseGymTimplan,isGymTimplanV2,type GymTimplan,type GymTimplanV2} from '../lib/gym-timplan';
import {suggestGymTimplanTimeV2,suggestGymTimplanHours,parseGymTimplanDistributionRequest} from '../lib/gym-timplan-distribution';
import {timplanTimeTotals} from '../lib/timplan-time';
const second='orientation:SOCS:1:SOCS1000X',general='foundation:SVEN:1:SVEN1000X';
const dialog=(page:Page)=>page.getByRole('dialog');
const fields=(page:Page)=>({total:page.getByLabel('Total undervisningstid (timmar)',{exact:true}),apl:page.getByLabel('APL totalt (timmar)',{exact:true}),include:page.getByRole('checkbox',{name:/^Föreslå APL-timmar/}),review:page.getByRole('button',{name:'Granska fördelning',exact:true})});
function plan(kind:'v2'|'legacy'|'academic'='v2'):GymTimplan{
 const p=gym(kind!=='academic','utkast');p.id=id(1);p.offeringId=id(2);p.source.offeringId=p.offeringId;
 p.rows=kind==='academic'?[{...p.rows[0],name:'Svenska',points:2500,part:'foundation',pointTerms:[500,500,500,500,250,250]}]:[{...p.rows[0],points:900,pointTerms:[150,150,150,150,150,150]},{...p.rows[0],key:second,name:'Socialt arbete',part:'orientation',points:900,pointTerms:[150,150,150,150,150,150]},{...p.rows[0],key:general,name:'Svenska',part:'foundation',points:900,pointTerms:[150,150,150,150,150,150]}];
 if(isGymTimplanV2(p))p.timeRows=Object.fromEntries(p.rows.map(r=>[r.key,{schoolMinutes:[null,null,null,null,null,null],annualAplMinutes:[null,null,null]}]));else p.hours=Object.fromEntries(p.rows.map(r=>[r.key,[null,null,null,null,null,null]]));
 if(kind==='legacy'&&isGymTimplanV2(p)){const{timeModel:_model,timeRows:_rows,timeCopyReview:_review,...legacy}=p;return parseGymTimplan({...legacy,hours:Object.fromEntries(p.rows.map(r=>[r.key,[null,null,null,null,null,null]]))},p.id);}
 return parseGymTimplan(p,p.id);
}
async function setup(page:Page,p:GymTimplan,wrongRevision=false){
 const base=await mock(page,{gym:p,draft:true}),writes:ReturnType<typeof parseGymTimplanDistributionRequest>[]=[],aplReads:number[]=[];const aplRevision=3;
 await page.route('**/api/timplaner/gym/apl/lasa',async route=>{aplReads.push(p.revision);await route.fulfill({json:{contractVersion:'structured_v1',revisionScope:'apl',timplanRevision:p.revision+(wrongRevision?1:0),planId:p.id,revision:aplRevision,organizerId:id(5),program:{code:'BF25',version:1,category:'VOCATIONAL_PROGRAM',startDate:'2025-07-01',endDate:null,canceledDate:null,sourceSupported:true},plan:null,copyReview:[],contentHash:`sha256:${'b'.repeat(64)}`,confirmations:[],reviews:[],capabilities:{canSave:false,canConfirm:false,canReview:false}},headers:{'X-Context-Epoch':'1'}});});
 await page.route('**/api/timplaner/gym/fordela',async route=>{
  const q=parseGymTimplanDistributionRequest(route.request().postDataJSON());writes.push(q);expect(q.planId).toBe(p.id);expect(q.expectedRevision).toBe(p.revision);
  // Synthetic server uses the pure proposal function; assertions independently check sums, preservation and payload.
  if(isGymTimplanV2(p)){const result=suggestGymTimplanTimeV2(p,q.totalHours,q.mode,q.apl);p.timeRows=result.timeRows;p.revision++;}else{const result=suggestGymTimplanHours(p,q.totalHours,q.mode);p.hours=result.hours;p.revision+=result.changedRows.length;}
  await route.fulfill({json:p,headers:{'X-Context-Epoch':'1'}});
 });
 await page.goto(location());await page.getByRole('button',{name:'Autofördela timmar',exact:true}).click();await expect(dialog(page)).toBeVisible();return{p,writes,aplReads,aplRevision,verify(){base.verify();}};
}
async function ready(page:Page){await expect(fields(page).total).toBeEnabled();}
async function save(page:Page){await fields(page).review.click();await expect(page.getByRole('heading',{name:'Granska före sparande',exact:true})).toBeVisible();await page.getByRole('button',{name:'Spara fördelning',exact:true}).click();await expect(dialog(page)).toHaveCount(0);}
async function shot(page:Page,path:string){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path});}

test('tom yrkestimplan får granskat APL-förslag och sparas med egen APL-revision oförändrad',async({page},info)=>{
 const m=await setup(page,plan());await ready(page);await expect(fields(page).include).toBeChecked();await expect(fields(page).apl).toHaveValue('345');await expect(fields(page).total).toHaveValue('2625');await expect(dialog(page)).toContainText('Årskurs 3');await expect(dialog(page)).toContainText('Pedagogik');await expect(dialog(page)).toContainText('Socialt arbete');
 await fields(page).apl.scrollIntoViewIfNeeded();await shot(page,info.outputPath('apl-distribution-choices.png'));await fields(page).review.click();await expect(page.getByRole('heading',{name:'Granska före sparande',exact:true})).toBeVisible();expect(m.writes).toHaveLength(0);expect(await dialog(page).evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);await shot(page,info.outputPath('apl-distribution-preview.png'));await dialog(page).evaluate(e=>{e.scrollTop=e.scrollHeight;});await shot(page,info.outputPath('apl-distribution-review-bottom.png'));if(info.project.name==='phone'){const scroll=dialog(page).locator('.gt-distribution-apl-preview');await scroll.evaluate(e=>{e.scrollLeft=e.scrollWidth;});expect(await scroll.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);await shot(page,info.outputPath('apl-distribution-year3.png'));}await page.getByRole('button',{name:'Spara fördelning',exact:true}).click();await expect(dialog(page)).toHaveCount(0);
 expect(m.writes).toHaveLength(1);expect(m.writes[0]).toMatchObject({expectedRevision:7,totalHours:2625,mode:'fill-empty',apl:{totalHours:345,rowKeys:[rowKey,second]}});expect(m.writes[0].commandId).toMatch(/^[\da-f-]{36}$/);if(!isGymTimplanV2(m.p))throw Error('V2 expected');const totals=timplanTimeTotals(m.p);expect(totals.totalMinutes).toBe(2625*60);expect(totals.aplMinutes).toBe(345*60);expect(totals.schoolMinutes).toBe(2280*60);expect(totals.missingAplCells).toBe(0);expect(m.p.timeRows[general].annualAplMinutes).toEqual([0,0,0]);expect(m.p.timeRows[rowKey].annualAplMinutes).toEqual([3450,3450,3450]);expect(m.p.timeRows[second].annualAplMinutes).toEqual([3450,3450,3450]);expect(m.aplRevision).toBe(3);expect(m.aplReads).toEqual([]);await page.reload();await expect(page.getByRole('region',{name:'Kontroll av planerade timmar'})).toContainText('Planerat: 345 h');m.verify();
});
test('avbrytet APL-förslag lämnar hela timplanen oförändrad',async({page})=>{
 const p=plan(),before=structuredClone(p),m=await setup(page,p);await ready(page);await fields(page).apl.fill('450');await fields(page).review.click();await page.getByRole('button',{name:'Avbryt',exact:true}).click();expect(p).toEqual(before);expect(m.writes).toHaveLength(0);m.verify();
});
test('fyllda skolceller kräver uttryckligt omfördelningsval och felaktigt förslag skriver inget',async({page})=>{
 const p=plan() as GymTimplanV2;for(const row of Object.values(p.timeRows))row.schoolMinutes=[100*60,100*60,100*60,100*60,100*60,100*60];const before=structuredClone(p),m=await setup(page,p);await ready(page);await expect(fields(page).review).toBeDisabled();await page.getByRole('radio',{name:/Fördela om skoltimmarna/}).check();await expect(fields(page).review).toBeEnabled();expect(p).toEqual(before);expect(m.writes).toHaveLength(0);await page.getByRole('button',{name:'Avbryt',exact:true}).click();m.verify();
});
test('sparad års-APL och uttryckliga skolnollor bevaras medan APL-underskott fylls',async({page})=>{
 const p=plan() as GymTimplanV2;p.timeRows[rowKey].annualAplMinutes=[18000,6000,0];p.timeRows[second].annualAplMinutes=[0,0,0];p.timeRows[general].annualAplMinutes=[0,0,0];p.timeRows[rowKey].schoolMinutes[0]=0;const before=structuredClone(p),m=await setup(page,p);await ready(page);await expect(fields(page).apl).toHaveValue('400');await fields(page).apl.fill('450');await save(page);expect(timplanTimeTotals(p).aplMinutes).toBe(27000);for(const[key,row]of Object.entries(before.timeRows))row.annualAplMinutes.forEach((n,i)=>expect(p.timeRows[key].annualAplMinutes[i]).toBeGreaterThanOrEqual(n!));expect(p.timeRows[rowKey].schoolMinutes[0]).toBe(0);expect(p.timeRows[second].annualAplMinutes.some(n=>n!>0)).toBe(true);expect(m.writes).toHaveLength(1);m.verify();
});
test('för låg total, för låg APL och tomt ämnesval kan inte skickas',async({page})=>{
 const m=await setup(page,plan());await ready(page);await fields(page).total.fill('2000');await expect(fields(page).review).toBeDisabled();await fields(page).total.fill('2625');await fields(page).apl.fill('344');await expect(fields(page).review).toBeDisabled();await fields(page).apl.fill('345');await dialog(page).getByText('Ämnen som får förslag på APL (2)',{exact:true}).click();const choices=dialog(page).getByRole('checkbox',{name:/Pedagogik|Socialt arbete/});for(const choice of await choices.all()){if(await choice.isChecked())await choice.uncheck();}await expect(fields(page).review).toBeDisabled();expect(m.writes).toHaveLength(0);m.verify();
});
test('högskoleförberedande program saknar APL-förslag och behåller skolautofördelning',async({page})=>{
 const m=await setup(page,plan('academic'));await ready(page);await expect(fields(page).include).toHaveCount(0);await expect(fields(page).apl).toHaveCount(0);await save(page);expect(m.writes[0]).not.toHaveProperty('apl');expect(m.aplReads).toEqual([]);m.verify();
});
test('äldre yrkestabell får inget automatiskt års-APL utan uttryckligt byte',async({page})=>{
 const m=await setup(page,plan('legacy'));await ready(page);await expect(fields(page).include).toHaveCount(0);await expect(fields(page).apl).toHaveCount(0);await expect(dialog(page)).toContainText('skola och APL');await save(page);expect(m.writes[0]).not.toHaveProperty('apl');expect(m.aplReads).toEqual([7,10]);m.verify();
});
test('fel timplansrevision i det separata APL-underlaget stoppar förslaget',async({page})=>{
 const m=await setup(page,plan('legacy'),true);await expect(dialog(page).getByRole('alert')).toContainText('Timplanen ändrades');await expect(fields(page).review).toHaveCount(0);expect(m.writes).toHaveLength(0);await page.getByRole('button',{name:'Avbryt',exact:true}).click();m.verify();
});

for(const invalid of ['unknown-profile','no-subjects'] as const)test(`ogiltigt underlag stoppar uttryckligt APL-förslag: ${invalid}`,async({page})=>{
 const p=plan() as GymTimplanV2;if(invalid==='no-subjects')p.rows.forEach(row=>{row.part='foundation';});else{p.rows[0].points=901;p.rows[0].pointTerms=[151,150,150,150,150,150];}const m=await setup(page,p);await ready(page);await fields(page).total.fill('2625');await expect(fields(page).include).not.toBeChecked();await fields(page).include.check();await expect(fields(page).review).toBeDisabled();await expect(dialog(page).getByRole('alert')).toContainText(invalid==='no-subjects'?'Välj minst ett ämne':'stödd yrkesutbildning');expect(m.writes).toHaveLength(0);m.verify();
});
test('avmarkerat APL-förslag lämnar årsramens tomma värden orörda',async({page})=>{
 const p=plan() as GymTimplanV2,m=await setup(page,p);await ready(page);await fields(page).include.uncheck();await expect(fields(page).apl).toHaveCount(0);await save(page);expect(m.writes[0]).not.toHaveProperty('apl');for(const row of Object.values(p.timeRows))expect(row.annualAplMinutes).toEqual([null,null,null]);expect(timplanTimeTotals(p).totalMinutes).toBe(2625*60);expect(timplanTimeTotals(p).missingAplCells).toBe(9);m.verify();
});
