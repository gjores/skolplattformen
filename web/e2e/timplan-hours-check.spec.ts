// Actual protected UI with synthetic API responses. Not SQL, real mandates or legal readiness proof.
import {test,expect,type Page} from '@playwright/test';
import {gym,mock,location,rowKey,sha} from './fixtures/planning-flow-data';
import {isGymTimplanV2,parseGymTimplan,type GymTimplan} from '../lib/gym-timplan';
import {parseTimplanTimeCommand,parseTimplanTimeReply,type TimplanTimeRowCommand} from '../lib/timplan-time-command';
const budget=(page:Page)=>page.getByRole('region',{name:'Kontroll av planerade timmar',exact:true});
const card=(page:Page,name:string)=>budget(page).locator('.gt-budget-check').filter({has:page.getByText(name,{exact:true})});
function plan(vocational=true,school=1200,apl=300):GymTimplan{
 const p=gym(vocational,'utkast');p.rows[0].points=vocational?2700:2500;p.rows[0].pointTerms=[p.rows[0].points/2,p.rows[0].points/2,0,0,0,0];
 if(isGymTimplanV2(p)){p.timeRows[rowKey].schoolMinutes=[school*60,school*60,null,null,null,null];p.timeRows[rowKey].annualAplMinutes=[apl*60,null,null];}else p.hours[rowKey]=[school,school,null,null,null,null];
 return parseGymTimplan(p,p.id);
}
async function setup(page:Page,p:GymTimplan,role:'rektor'|'huvudman'='rektor',blockers:string[]=[]){
 const base=await mock(page,{gym:p,draft:true,role}),commands:TimplanTimeRowCommand[]=[];
 if(role==='huvudman'||blockers.length)await page.route('**/api/planbeslut/underlag',async route=>{
  await route.fulfill({json:{contractVersion:'timetable_decision_v2',apl:null,kind:'timplan',planId:p.id,unitId:p.unitId,offeringId:p.offeringId,educationName:p.source.education.name,schoolName:p.schoolName,series:p.series,version:p.version,revision:p.revision,decisionRevision:0,basisHash:sha,stage:role==='huvudman'?'submitted':'draft',nextActor:role,actions:role==='huvudman'?['approve','return']:['submit'],blockers,checks:[{id:'teacher-led',label:'Undervisningstiden är granskad'},{id:'apl-budget',label:'Årsramen för APL är granskad'}],history:[],sourceInfo:'Programplan version 1'}});
 });
 await page.route('**/api/timplaner/gym/tidsrad',async route=>{
  const c=parseTimplanTimeCommand(route.request().postDataJSON());if(c.action!=='save_row')throw Error('Expected row command');commands.push(c);expect(c.expectedRevision).toBe(p.revision);expect(c.planId).toBe(p.id);if(!isGymTimplanV2(p))throw Error('Expected V2');p.timeRows[c.rowKey]=structuredClone(c.row);p.revision++;
  const reply=parseTimplanTimeReply({contractVersion:'timplan_time_v2',plan:p,receipt:{commandId:c.commandId,planId:c.planId,action:c.action,revision:p.revision,changed:true,replayed:false}},c);await route.fulfill({json:reply,headers:{'X-Context-Epoch':'1'}});
 });
 const url=new URL(location(),'http://synthetic.invalid');url.searchParams.set('timplan',p.id);url.searchParams.set('timplansutbildning',p.offeringId);await page.goto(url.pathname+url.search);await expect(budget(page)).toBeVisible();
 return {commands,verify(){base.verify();}};
}
async function screenshot(page:Page,path:string){await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await page.screenshot({path,fullPage:true});}

test('tillräcklig total döljer inte för låg års-APL och rektor kan inte skicka',async({page},info)=>{
 const m=await setup(page,plan(),'rektor',['Årsramen för APL behöver ytterligare 45 undervisningstimmar.']);
 await expect(card(page,'Undervisning totalt (GUT)')).toContainText('Planerat: 2700 h');await expect(card(page,'Undervisning totalt (GUT)')).toContainText('Minst: 2625 h');await expect(card(page,'Undervisning totalt (GUT)')).toContainText('Timnivån uppnådd');
 await expect(card(page,'Varav APL')).toContainText('Planerat: 300 h');await expect(card(page,'Varav APL')).toContainText('Minst: 345 h');await expect(card(page,'Varav APL')).toContainText('Saknas: 45 h');await expect(card(page,'Varav APL')).not.toHaveClass(/gt-budget-sufficient/);
 await page.getByRole('button',{name:'Visa vad som saknas',exact:true}).click();await expect(page.getByRole('button',{name:'Skicka till huvudmannen',exact:true})).toBeDisabled();await expect(page.getByRole('region',{name:'APL-planering',exact:true})).toHaveCount(0);await screenshot(page,info.outputPath('vocational-short-apl.png'));m.verify();
});
test('huvudmannen ser timblockeraren och kan inte godkänna under APL-gränsen',async({page})=>{
 const m=await setup(page,plan(),'huvudman',['Årsramen för APL behöver ytterligare 45 undervisningstimmar.']);await page.getByRole('button',{name:'Visa vad som saknas',exact:true}).click();await expect(page.getByText('Årsramen för APL behöver ytterligare 45 undervisningstimmar.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toBeDisabled();m.verify();
});
test('års-APL räknas om före sparning och ett fortsatt otillräckligt utkast kan sparas',async({page})=>{
 const p=plan(),m=await setup(page,p),cell=page.getByRole('textbox',{name:'Pedagogik Nivå 1, APL årskurs 1',exact:true});await expect(cell).toBeEnabled();await cell.fill('345');await expect(cell).toBeFocused();await expect(card(page,'Varav APL')).toContainText('Planerat: 345 h');await expect(card(page,'Varav APL')).toContainText('Timnivån uppnådd');await expect(budget(page)).toContainText('Preliminär kontroll av dina ändringar.');expect(m.commands).toHaveLength(0);expect(isGymTimplanV2(p)&&p.timeRows[rowKey].annualAplMinutes[0]).toBe(18000);
 await cell.fill('310');await expect(card(page,'Varav APL')).toContainText('Saknas: 35 h');expect(m.commands).toHaveLength(0);await cell.press('Enter');await expect(page.getByText('Allt sparat',{exact:true})).toBeVisible();expect(m.commands).toHaveLength(1);expect(m.commands[0].row.annualAplMinutes[0]).toBe(18600);await expect(card(page,'Varav APL')).toContainText('Saknas: 35 h');await page.reload();await expect(card(page,'Varav APL')).toContainText('Planerat: 310 h');m.verify();
});
for(const vocational of [true,false])test(`${vocational?'yrkesprogram':'högskoleförberedande program'} visar för låg GUT och räknar om osparade skoltimmar`,async({page},info)=>{
 const p=plan(vocational,1000,345),m=await setup(page,p),total=card(page,'Undervisning totalt (GUT)');await expect(total).toContainText(vocational?'Saknas: 280 h':'Saknas: 180 h');await expect(total).not.toHaveClass(/gt-budget-sufficient/);
 if(!vocational){await expect(card(page,'Varav APL')).toHaveCount(0);await expect(page.locator('input[aria-label*="APL"]')).toHaveCount(0);await expect(page.getByRole('button',{name:/^(Visa|Fortsätt till) APL-planering$/})).toHaveCount(0);}
 const cell=page.locator(vocational?'input[data-time-cell="0"]':'input[data-term="0"]');await cell.fill(vocational?'1280':'1180');await expect(cell).toBeFocused();await expect(total).toContainText(vocational?'Planerat: 2625 h':'Planerat: 2180 h');await expect(total).toContainText('Timnivån uppnådd');await expect(budget(page)).toContainText('Preliminär kontroll');expect(m.commands).toHaveLength(0);await screenshot(page,info.outputPath(vocational?'vocational-live-gut.png':'academic-live-gut.png'));m.verify();
});
test('ogiltig inmatning och saknade aktiva celler får inget grönt besked',async({page})=>{
 const p=plan(true,1200,345);if(!isGymTimplanV2(p))throw Error('Expected V2');p.timeRows[rowKey].schoolMinutes[1]=null;p.timeRows[rowKey].schoolMinutes[0]=120000;p.timeRows[rowKey].annualAplMinutes[0]=60000;const m=await setup(page,p);
 await expect(budget(page)).toContainText('Timnivån uppnådd – fyll i resterande fält');await expect(budget(page).locator('.gt-budget-sufficient')).toHaveCount(0);await page.locator('input[data-time-cell="0"]').fill('abc');await expect(budget(page)).toContainText('Kan inte beräknas');await expect(budget(page).locator('.gt-budget-sufficient')).toHaveCount(0);expect(m.commands).toHaveLength(0);m.verify();
});
test('okänd omfattning ger ingen påhittad GUT-miniminivå',async({page})=>{
 const p=plan();p.rows[0].points=100;p.rows[0].pointTerms=[50,50,0,0,0,0];const m=await setup(page,p);await expect(budget(page)).toContainText('Timkraven behöver granskas');await expect(budget(page)).not.toContainText('Timnivån uppnådd');await expect(budget(page).locator('.gt-budget-check')).toHaveCount(0);m.verify();
});
