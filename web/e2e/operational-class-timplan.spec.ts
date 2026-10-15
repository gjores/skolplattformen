// Synthetic component evidence; protected DB/API evidence is reported separately.
import {test,expect,type Page} from '@playwright/test';
import {oid,operationPlan} from './fixtures/operational-data';
const base='/e2e/fixtures/operational-preview.html';
async function classMock(page:Page,{role='rektor',lost=false,conflict=false,conflictCode='conflict',existing=false,old=false,firstYear=2026 as number|null}={}){
 const commands:any[]=[],errors:string[]=[];let failed=false;
 const classes:any[]=existing?[{id:oid(10),name:'SA26A',startYear:firstYear??2026,link:{planId:oid(19),version:1,status:'ersatt',columnId:'ar1',revision:2,legacy:false}}]:[],links:any[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/klasser/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();let json;
  if(path.endsWith('underlag'))json={plan:{id:oid(1),offeringId:oid(2),unitId:oid(3),schoolName:'Exempelskolan',educationName:'Samhällsvetenskapsprogrammet',cohort:'2026–2029',startYear:firstYear,version:1,status:old?'ersatt':'faststalld',revision:4},schoolYear:body.schoolYear,canManage:role==='rektor'&&!old&&firstYear!==null&&body.schoolYear>=firstYear&&body.schoolYear<=firstYear+2,blockers:firstYear===null?['Timplanen saknar ett giltigt fryst startdatum.']:body.schoolYear<firstYear||body.schoolYear>firstYear+2?['Välj ett läsår inom timplanens tre gymnasieår.']:[],classes:classes.map(c=>({...c,link:links.find(l=>l.schoolYear===body.schoolYear&&l.classId===c.id)?{planId:oid(1),version:1,status:'faststalld',columnId:links.find(l=>l.schoolYear===body.schoolYear&&l.classId===c.id).columnId,revision:links.find(l=>l.schoolYear===body.schoolYear&&l.classId===c.id).revision,legacy:false}:c.link})),linkedClasses:links};
  else if(path.endsWith('skapa')){commands.push(body);let c=classes.find(c=>c.name===body.name);if(!c){c={id:oid(10),name:body.name,startYear:body.startYear,link:null};classes.push(c);}json={id:c.id,name:c.name,startYear:c.startYear,replayed:failed};if(lost&&!failed){failed=true;return route.abort();}}
  else if(path.endsWith('koppla')){commands.push(body);if(conflict)return route.fulfill({status:409,json:{code:conflictCode,message:'Kopplingen har ändrats. Läs om.'}});const c=classes.find(c=>c.id===body.classId);links.push({classId:c.id,className:c.name,classStartYear:c.startYear,schoolYear:body.schoolYear,columnId:body.columnId,revision:(body.expectedLinkRevision??-1)+1,legacy:false});json={classId:c.id,schoolYear:body.schoolYear,planId:body.planId,columnId:body.columnId,revision:(body.expectedLinkRevision??-1)+1,replayed:false};}
  else throw Error(path);await route.fulfill({json,headers:{'X-Context-Epoch':'1'}});
 });return{commands,classes,links,errors};
}
test('skapa klass och koppla exakt läsår, behåll övriga år efter omläsning',async({page},info)=>{
 const state=await classMock(page);await page.goto(base);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();
 await page.getByLabel('Klassnamn',{exact:true}).fill('sa26a');await page.getByRole('button',{name:'Skapa klass',exact:true}).click();
 await expect(page.getByText('Klassen SA26A är skapad.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:/Koppla valda klasser/}).click();await expect(page.getByRole('dialog')).toContainText('2026/27');await page.getByRole('button',{name:'Bekräfta koppling'}).click();
 await expect(page.locator('.class-plan-links')).toContainText('SA26A');expect(state.commands.at(-1).columnId).toBe('ar1');
 await page.getByLabel('Läsår för klasskoppling').selectOption('2027');await page.getByRole('checkbox',{name:'Välj SA26A'}).check();await page.getByRole('button',{name:/Koppla valda klasser/}).click();await page.getByRole('button',{name:'Bekräfta koppling'}).click();
 await expect(page.locator('.class-plan-links li')).toHaveCount(2);expect(state.commands.at(-1).columnId).toBe('ar2');
 await page.reload();await page.getByRole('button',{name:'Koppla klass',exact:true}).click();await expect(page.locator('.class-plan-links li')).toHaveCount(2);expect(state.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('class-links.png'),fullPage:true});
});
test('förlorat kvitto spärrar navigering och återhämtas med samma kommando utan ny klass',async({page})=>{
 const state=await classMock(page,{lost:true});await page.goto(base);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();await page.getByLabel('Klassnamn',{exact:true}).fill('sa26a');await page.getByRole('button',{name:'Skapa klass',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hämta sparstatus'})).toBeVisible();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await page.getByRole('button',{name:'Hämta sparstatus'}).click();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();expect(state.commands[0]).toEqual(state.commands[1]);expect(state.classes).toHaveLength(1);expect(state.errors).toEqual([]);
});
test('explicit byte visar tidigare version, konflikt kräver omläsning',async({page})=>{
 const state=await classMock(page,{existing:true,conflict:true});await page.goto(base);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();await page.getByRole('checkbox',{name:'Välj SA26A'}).check();await page.getByRole('button',{name:/Koppla valda klasser/}).click();await expect(page.getByRole('dialog')).toContainText('Nuvarande koppling');await page.getByRole('button',{name:'Bekräfta koppling'}).click();await expect(page.getByRole('alert')).toContainText('Läs om');expect(state.commands[0].expectedLinkRevision).toBe(2);expect(state.commands[0].previousPlanId).toBe(oid(19));expect(state.links).toEqual([]);expect(state.errors).toEqual([]);
});
for(const params of ['?hm=1','?old=1'])test(`huvudman och ersatt version visar läsvy ${params}`,async({page})=>{
 const state=await classMock(page,{role:params.includes('hm')?'huvudman':'rektor',old:params.includes('old')});await page.goto(base+params);await page.getByRole('button',{name:'Visa klasskopplingar'}).click();await expect(page.getByText('Inga klasser är kopplade',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Skapa klass',exact:true})).toHaveCount(0);expect(state.commands).toEqual([]);
});
async function gymMock(page:Page,draft=false){const named={...operationPlan,canPlan:true,series:{id:oid(50),name:'Grundfördelning',revision:0},nameAtCreation:'Grundfördelning'};const errors:string[]=[];let creates=0;page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;let json:any;
 if(path==='/api/planering/urval')json={customerId:oid(7),serverDate:'2026-10-12',currentYear:2026,minimumYear:2000,maximumYear:2100,units:[{unitId:oid(3),schoolName:'Exempelskolan',canRead:{programplan:true,gymnasium:true,grundskola:true,introduktionsprogram:true}}]};
 else if(path==='/api/planbeslut/inkorg')json={items:[],total:0,actionCount:0,decisionCount:0,truncated:false};
 else if(path==='/api/timplaner/gym/lasa')json=body.planId===oid(11)?{...named,source:{...named.source,revision:3},id:oid(11),status:'utkast',version:2,revision:0}:named;
 else if(path==='/api/timplaner/gym/underlag')json={source:{...operationPlan.source,...operationPlan.currentSource},rows:operationPlan.rows,readiness:{ready:true,missing:[]},units:[{unitId:oid(3),schoolName:'Exempelskolan',canPlan:true,plans:[...(draft?[{series:named.series,id:oid(11),version:2,revision:0,status:'utkast',sourcePlanId:oid(4),sourceVersion:1,sourceRevision:3}]:[]),{series:named.series,id:oid(1),version:1,revision:4,status:'faststalld',sourcePlanId:oid(4),sourceVersion:1,sourceRevision:2}]}]};
 else if(path==='/api/timplaner/gym/skapa'){creates++;json={id:oid(11),offeringId:oid(2),unitId:oid(3),version:2,revision:0,sourcePlanId:oid(4),sourceRevision:3,replayed:false,carriedRows:1,resetRows:0};}
 else if(path==='/api/planbeslut/underlag'){return route.fulfill({status:409,json:{code:'conflict',message:'Syntetiskt separat beslutsprov'}});}
 else return route.fulfill({status:500,json:{code:'unexpected',message:path}});
 await route.fulfill({json,headers:{'X-Context-Epoch':'1'}});
 });return{errors,count:()=>creates};}
for(const draft of [false,true])test(`ny version använder aktuell källa och återanvänder befintligt utkast ${draft}`,async({page})=>{
 const state=await gymMock(page,draft);await page.goto(base+'?gym=1');await expect(page.getByRole('button',{name:'Skapa ny version',exact:true})).toBeVisible();await page.getByRole('button',{name:'Skapa ny version',exact:true}).click();
 if(!draft){await expect(page.getByRole('dialog')).toContainText('klasskopplingar bevaras');await page.getByRole('button',{name:'Granska',exact:true}).click();await page.getByRole('button',{name:'Bekräfta och spara',exact:true}).click();}
 await expect(page.locator('.gt-state')).toContainText('Timplan version 2');expect(state.count()).toBe(draft?0:1);expect(state.errors).toEqual([]);
});

for(const [start,firstYear] of [['2027-08-01',2027],['2027-01-15',2026],['2027-06-30',2026],['2027-07-01',2027]] as const){
 test(`fryst start ${start} skiljer första läsår från planeringsår`,async({page},info)=>{
  const state=await classMock(page,{firstYear,existing:true});
  await page.goto(`${base}?start=${start}&year=${firstYear+1}`);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();
  await expect(page.locator('.class-plan-dates')).toContainText(start);
  await expect(page.locator('.class-plan-dates')).toContainText(`Valt planeringsår${firstYear+1}/${String(firstYear+2).slice(-2)}`);
  await expect(page.locator('.class-plan-dates')).toContainText(`Första läsår${firstYear}/${String(firstYear+1).slice(-2)}`);
  const select=page.getByLabel('Läsår för klasskoppling');
  await expect(select.locator('option')).toHaveText([0,1,2].map(i=>`Årskurs ${i+1} · ${firstYear+i}/${String(firstYear+i+1).slice(-2)}`));
  await select.focus();await expect(select).toBeFocused();await select.selectOption(String(firstYear));await expect(select).toBeEnabled();await expect(select).toBeFocused();await select.press('Tab');await expect(page.getByRole('button',{name:'Läs om klasskopplingar'})).toBeFocused();
  await page.getByRole('checkbox',{name:'Välj SA26A'}).check();await page.getByRole('button',{name:/Koppla valda klasser/}).click();
  await expect(page.getByRole('dialog')).toContainText('årskurs 1');await page.getByRole('button',{name:'Avbryt',exact:true}).click();
  await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toBeFocused();
  expect(state.commands).toEqual([]);expect(state.errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('frozen-year.png'),fullPage:true});
 });
}
for(const planningYear of [2026,2030])test(`URL-år ${planningYear} utanför kullen kräver uttryckligt årsval`,async({page})=>{
 const state=await classMock(page,{firstYear:2027,existing:true});
 state.links.push({classId:oid(10),className:'SA26A',classStartYear:2027,schoolYear:2028,columnId:'ar2',revision:0,legacy:false});
 await page.goto(`${base}?start=2027-08-01&year=${planningYear}`);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();
 const select=page.getByLabel('Läsår för klasskoppling');await expect(select).toHaveValue('');
 await expect(select.locator('option:not([disabled])')).toHaveCount(3);await expect(select.locator(`option[value="${planningYear}"]`)).toHaveCount(0);
 await expect(page.locator('.class-plan-year-notice')).toContainText('Ditt planeringsår ändras inte');
 await expect(page.locator('.class-plan-links')).toContainText('2028/29');await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toHaveCount(0);
 expect(state.commands).toEqual([]);await select.selectOption('2027');await expect(select).toBeEnabled();
 await page.getByRole('checkbox',{name:'Välj SA26A'}).check();await page.getByRole('button',{name:/Koppla valda klasser/}).click();
 await page.getByRole('button',{name:'Bekräfta koppling'}).click();await expect(page.locator('.class-plan-links li')).toHaveCount(2);
 expect(state.commands[0].schoolYear).toBe(2027);expect(state.commands[0].columnId).toBe('ar1');
 await expect(page.locator('.class-plan-dates')).toContainText(`Valt planeringsår${planningYear}/${String(planningYear+1).slice(-2)}`);
 expect(new URL(page.url()).searchParams.get('year')).toBe(String(planningYear));expect(state.errors).toEqual([]);
});
for(const [start,firstYear] of [['null',null],['2027-08-01',null],['null',2027],['2027-01-15',2027]] as const)test(`saknat eller motsägande underlag ${start}/${firstYear} spärrar skrivning`,async({page})=>{
 const state=await classMock(page,{firstYear});await page.goto(`${base}?start=${start}&year=2027`);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('saknas eller stämmer inte överens');await expect(page.getByLabel('Läsår för klasskoppling')).toBeDisabled();
 await expect(page.getByRole('button',{name:'Skapa klass',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toHaveCount(0);expect(state.commands).toEqual([]);expect(state.errors).toEqual([]);
});

test('misslyckad omläsning spärrar tidigare underlag tills ny läsning lyckas',async({page})=>{
 const state=await classMock(page,{existing:true});await page.goto(base);await page.getByRole('button',{name:'Koppla klass',exact:true}).click();
 await expect(page.getByRole('button',{name:'Skapa klass',exact:true})).toBeVisible();
 await page.route('**/api/klasser/underlag',route=>route.fulfill({status:503,json:{code:'unavailable'}}),{times:1});
 await page.getByRole('button',{name:'Läs om klasskopplingar'}).click();await expect(page.getByRole('alert')).toContainText('unavailable');
 await expect(page.getByRole('button',{name:'Skapa klass',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toHaveCount(0);
 await page.getByRole('button',{name:'Läs om klasskopplingar'}).click();await expect(page.getByRole('button',{name:'Skapa klass',exact:true})).toBeVisible();
 expect(state.commands).toEqual([]);expect(state.errors).toEqual([]);
});

for(const [code,message] of [
 ['class_name_year_conflict','Klassnamnet är redan upptaget på skolan'],
 ['class_cohort_start_locked','Utbildningsstarten kan inte ändras när klasser finns'],
 ['class_plan_not_ready','Utbildningens start eller timplanens underlag behöver kontrolleras'],
])test(`säkert klassbesked ${code} behålls och kräver omläsning`,async({page})=>{
 const state=await classMock(page,{existing:true,conflict:true,conflictCode:code});await page.goto(base);
 await page.getByRole('button',{name:'Koppla klass',exact:true}).click();await page.getByRole('checkbox',{name:'Välj SA26A'}).check();
 await page.getByRole('button',{name:/Koppla valda klasser/}).click();await page.getByRole('button',{name:'Bekräfta koppling'}).click();
 await expect(page.getByRole('alert')).toContainText(message);await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toHaveCount(0);await expect(page.getByRole('button',{name:'Hämta sparstatus'})).toHaveCount(0);
 await page.getByRole('button',{name:'Avsluta och granska på nytt'}).click();await page.getByRole('button',{name:'Läs om klasskopplingar'}).click();await expect(page.getByRole('button',{name:/Koppla valda klasser/})).toBeVisible();
 expect(state.commands).toHaveLength(1);expect(state.links).toEqual([]);expect(state.errors).toEqual([]);
});
