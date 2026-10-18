import {test,expect,type Page} from '@playwright/test';
import {parsePlanDecisionDetail,type PlanDecisionDetail,type PlanDecisionAction,type PlanDecisionStage} from '../lib/plan-decision';
const uid=(n:number)=>`5a160000-0000-4000-8000-${String(n).padStart(12,'0')}`,planId=uid(1),unitId=uid(2),offeringId=uid(3);
const hash=`sha256:${'a'.repeat(64)}`,url='/e2e/fixtures/apl-decision-preview.html';
type Role='huvudman'|'rektor'|'administrator';
type Scenario='complete'|'unconfirmed'|'stale'|'legacy'|'historical'|'mixed'|'program';
const labels={structure:'Programstrukturen är granskad',choices:'Valen är granskade','teacher-led':'Undervisningstiden är granskad','choice-paths':'Alla studievägar har granskats',eligibility:'Behörighetsnivåerna är granskade',apl:'APL-underlaget och rektors bekräftelse är granskade'};
function detail(role:Role,scenario:Scenario):PlanDecisionDetail{
 const program=scenario==='program',historical=scenario==='historical',stage:PlanDecisionStage=historical?'approved':role==='huvudman'?'submitted':'draft';
 const legacy=['legacy','historical'].includes(scenario),current=scenario==='complete',confirmed=['complete','stale'].includes(scenario);
 const blockers=legacy?['APL-planeringen behöver kompletteras.']:scenario==='stale'?['APL-innehållet har ändrats. Rektor behöver bekräfta igen.']:scenario==='unconfirmed'?['Rektor behöver bekräfta förläggningen.']:scenario==='mixed'?['Delveckorna behöver granskas särskilt.']:[];
 const raw={contractVersion:'apl_decision_v1',kind:program?'programplan':'timplan',planId,unitId:program?null:unitId,offeringId,educationName:'Barn- och fritid 2027',schoolName:program?null:'Exempelskolan',version:2,revision:9,decisionRevision:1,
  series:program?null:{id:uid(4),name:'BF27A – förstärkt pedagogik',revision:0},stage,nextActor:historical?null:role==='huvudman'?'huvudman':'rektor',basisHash:hash,
  actions:historical?[]:role==='huvudman'?['return','approve']:['submit'],blockers:historical?[]:program?[]:blockers,
  checks:(program?['structure','choices','eligibility','apl']:['teacher-led','choice-paths','eligibility','apl']).map(id=>({id,label:labels[id as keyof typeof labels]})),history:historical?[{action:'approve',at:'2026-10-01T10:00:00Z',actorName:'Huvudmannen',comment:'Tidigare beslut',nameAtDecision:'BF27A – äldre benämning'}]:[],sourceInfo:program?null:'Programplan version 1 · fryst revision 3',
  apl:program?null:{ready:current,currentConfirmationId:current?uid(9):null,blockers,detail:{contractVersion:'structured_v1',planId,revision:9,organizerId:uid(5),program:{code:'BF25',version:1,category:'VOCATIONAL_PROGRAM',startDate:'2025-07-01',endDate:null,canceledDate:null,sourceSupported:true},
   plan:legacy?null:{contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[{id:uid(6),name:'APL på fritidshem',startsOn:'2027-08-16',endsOn:'2027-11-28',schoolYear:2027,
    extent:scenario==='mixed'?{basis:'mixed_weeks',weeks:null,reviewed:false,reviewNote:''}:{basis:'whole_weeks',weeks:15,reviewed:true,reviewNote:'15 hela veckor planerade tillsammans med verksamheten.'},
    contents:[{rowKey:'programmeSpecific:PEDG:1:PEDG1000X',description:'Planera, genomföra och följa upp pedagogiska aktiviteter.'}],allocations:[{rowKey:'programmeSpecific:PEDG:1:PEDG1000X',termIndex:0,gutMinutes:scenario==='mixed'?1381:20700}]}]},copyReview:[],contentHash:hash,
   confirmations:confirmed?[{id:uid(9),planId,unitId,actorId:uid(7),assignmentId:uid(8),actorName:'Rektor Anna Exempel',at:'2026-10-16T08:30:00.000Z',revision:7,contentHash:current?hash:`sha256:${'b'.repeat(64)}`,comment:'Förläggningen är granskad med ansvariga lärare.'}]:[],capabilities:{canSave:stage==='draft',canConfirm:stage==='draft'&&role==='rektor'}}}};
 return parsePlanDecisionDetail(raw,{kind:program?'programplan':'timplan',planId});
}
async function mock(page:Page,role:Role='huvudman',scenario:Scenario='complete',mode:'normal'|'conflict'|'lost'|'legacy-replay'='normal'){
 let current=detail(role,scenario),first=true;const commands:Record<string,unknown>[]=[],reads:Record<string,unknown>[]=[];
 const item=()=>({kind:current.kind,planId,unitId:current.unitId,offeringId,educationName:current.educationName,schoolName:current.schoolName,series:current.series,version:current.version,stage:current.stage,nextActor:current.nextActor,
  task:role==='huvudman'?'review':'prepare',apl:current.apl?{state:current.apl.detail.plan?'structured_v1':'legacy',ready:current.apl.ready,blockers:current.apl.blockers}:null});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():{};
  if(path==='/api/planbeslut/inkorg')return route.fulfill({json:{items:['approved','replaced'].includes(current.stage)?[]:[item()],total:['approved','replaced'].includes(current.stage)?0:1,actionCount:['approved','replaced'].includes(current.stage)?0:1,decisionCount:role==='huvudman'&&!['approved','replaced'].includes(current.stage)?1:0,truncated:false}});
  if(path==='/api/planbeslut/underlag'){reads.push(body);return route.fulfill({json:current});}
  if(path==='/api/planbeslut/andra'){
   commands.push(body);
   if(mode==='conflict')return route.fulfill({status:409,json:{code:'plan_decision_conflict'}});
   if(first){current={...current,stage:({approve:'approved',return:'returned',submit:'submitted',withdraw:'draft'} as const)[body.action as PlanDecisionAction],revision:current.revision+1,decisionRevision:current.decisionRevision+1,actions:[],nextActor:null,history:[{action:body.action,at:'2026-10-16T10:00:00Z',actorName:role==='huvudman'?'Huvudmannen':'Rektor Anna Exempel',comment:body.comment,nameAtDecision:current.series?.name??null},...current.history]};if(current.apl)current.apl={...current.apl,detail:{...current.apl.detail,revision:current.revision,capabilities:{canSave:false,canConfirm:false}}};
    first=false;if(mode==='lost'||mode==='legacy-replay')return route.abort('failed');}
   if(mode==='legacy-replay'){const {apl:_apl,series:_series,...legacy}=current;return route.fulfill({json:{...legacy,contractVersion:'legacy',history:legacy.history.map(({nameAtDecision:_name,...event})=>event)}});}
   return route.fulfill({json:current});
  }
  throw Error(`Unexpected synthetic endpoint ${path}`);
 });
 return {commands,reads,get current(){return current;},set(value:PlanDecisionDetail){current=value;}};
}
async function expandReview(page:Page){const panel=page.locator('.decision-review');await expect(panel).toBeVisible();if(await panel.getAttribute('open')===null)await panel.locator(':scope > summary').click();const historical=page.getByText('APL-underlag från tidigare beslut',{exact:true});if(await historical.count()&&await historical.evaluate(e=>e.parentElement?.hasAttribute('open'))===false)await historical.click();}
async function open(page:Page,role:Role='huvudman',query=''){await page.goto(`${url}?role=${role}${query}`);if(!query.includes('inbox'))await expandReview(page);}
async function checks(page:Page){for(const input of await page.locator('.decision-check input').all())await input.check();}
async function approve(page:Page){await checks(page);await page.getByRole('button',{name:'Godkänn planen',exact:true}).click();await page.getByRole('button',{name:'Ja, godkänn planen'}).click();}
const evidence=(page:Page)=>page.getByRole('region',{name:'APL inför beslut'});

test('huvudmannen öppnar exakt plan från inkorgen, granskar sparat APL och fastställer',async({page},info)=>{
 const m=await mock(page);await open(page,'huvudman','&inbox');
 await expect(page.getByText('BF27A – förstärkt pedagogik')).toBeVisible();await expect(page.getByText('APL-underlag och rektorsbekräftelse finns')).toBeVisible();
 await page.getByRole('button',{name:'Granska och besluta'}).click();await expandReview(page);await expect(evidence(page)).toContainText('345 h');await expect(evidence(page)).toContainText('Rektor Anna Exempel');
 expect(m.reads[0]).toEqual({kind:'timplan',planId});const opened=JSON.parse(await page.getByTestId('opened-scope').textContent()??'{}');expect(opened).toMatchObject({planId,unitId,version:2});
 await page.getByText('Visa sparade perioder och arbetsmoment (1)',{exact:true}).click();await expect(evidence(page)).toContainText('Uppgiven omfattning: 15 hela veckor');await expect(evidence(page)).toContainText('Planera, genomföra och följa upp pedagogiska aktiviteter.');
 await expect(evidence(page)).not.toContainText('PEDG1000X');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('apl-decision-evidence.png'),fullPage:true});await approve(page);await expect(page.locator('.plan-decision-heading')).toContainText('Fastställd');await expandReview(page);
 await expect(evidence(page)).toContainText('Gäller det sparade innehållet');expect(m.commands).toHaveLength(1);expect(m.commands[0]).toMatchObject({action:'approve',planId,expectedRevision:9});
});
test('rektor skickar bekräftad plan och administrativ revision gör inte bekräftelsen inaktuell',async({page})=>{
 const m=await mock(page,'rektor');await open(page,'rektor');await expect(evidence(page)).toContainText('Gäller det sparade innehållet');
 await expect(page.getByRole('button',{name:'Bekräfta förläggningen'})).toHaveCount(0);await checks(page);await page.getByRole('button',{name:'Skicka till huvudmannen',exact:true}).click();
 await expect(page.locator('.plan-decision-heading')).toContainText('Inväntar beslut');await expandReview(page);await expect(evidence(page)).toContainText('Gäller det sparade innehållet');expect(m.current.apl?.detail.confirmations[0].revision).toBe(7);expect(m.current.revision).toBe(10);
});
test('beredare ser sparat underlag men kan inte ersätta rektors bekräftelse',async({page})=>{
 const m=await mock(page,'administrator','unconfirmed');await open(page,'administrator');await expect(evidence(page)).toContainText('Rektor har ännu inte bekräftat');
 await expect(page.getByRole('button',{name:'Skicka till huvudmannen'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Bekräfta förläggningen'})).toHaveCount(0);
 await expect(evidence(page)).toContainText('Öppna APL-planering i menyn för att fortsätta med perioderna.');await expect(page.getByRole('link',{name:'Öppna APL-planeringen'})).toHaveCount(0);expect(m.commands).toEqual([]);
});
test('ändrat innehåll visar tidigare rektor men kräver ny bekräftelse',async({page},info)=>{
 const m=await mock(page,'huvudman','stale');await open(page);await expect(evidence(page)).toContainText('Behöver förnyas efter ändring');await expect(evidence(page)).toContainText('Rektor Anna Exempel');
 await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toHaveCount(0);await expect(page.getByText('APL-underlaget är klart för prövning',{exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('apl-stale-confirmation.png'),fullPage:true});expect(m.commands).toEqual([]);
});
for(const [role,action] of [['huvudman','return'],['rektor','withdraw']] as const)test(`äldre inskickat ärende kan ${action} utan falskt grönt APL-besked`,async({page})=>{
 const m=await mock(page,role,'legacy');if(role==='rektor'){const d=m.current;m.set({...d,stage:'submitted',nextActor:'huvudman',actions:['withdraw']});}await open(page,role,'&inbox');
 await expect(page.getByText('APL-planering behöver kompletteras',{exact:true})).toBeVisible();await page.getByRole('button',{name:role==='huvudman'?'Granska och besluta':'Förbered beslut'}).click();await expandReview(page);
 await expect(evidence(page)).toContainText('APL-planeringen behöver kompletteras');await expect(evidence(page)).not.toContainText('0 h');await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toHaveCount(0);
 if(action==='return'){await page.getByLabel('Kommentar – vad behöver rättas?').fill('Planera perioderna och låt rektor bekräfta APL.');await page.getByRole('button',{name:'Be om ändringar'}).click();}
 else await page.getByRole('button',{name:'Ta tillbaka för ändring'}).click();
 await expect(page.getByTestId('changed')).toHaveText('1');expect(m.commands[0].action).toBe(action);
});
test('äldre fastställd plan visar historik och okänd APL utan kompletteringsuppgift',async({page})=>{
 await mock(page,'huvudman','historical');await open(page);await expect(evidence(page)).toContainText('Det tidigare fastställandet ligger kvar');await expect(evidence(page)).not.toContainText('0 h');
 await expect(page.getByText('Behöver åtgärdas före beslut',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toHaveCount(0);
 await page.getByText('Beslutshistorik (1)',{exact:true}).click();await expect(page.locator('.decision-history')).toContainText('BF27A – äldre benämning');
});
test('blandat upplägg visas utan påhittad omräkning till hela veckor',async({page})=>{
 await mock(page,'rektor','mixed');await open(page,'rektor');await page.getByText('Visa sparade perioder och arbetsmoment (1)',{exact:true}).click();
 await expect(evidence(page)).toContainText('23 h 1 min');await expect(evidence(page)).toContainText('delveckor eller blandat upplägg');await expect(evidence(page)).toContainText('Veckounderlaget behöver granskas');
 await expect(evidence(page)).not.toContainText('Uppgiven omfattning:');
});
test('gemensam programplan behåller sin checklista utan skolans APL-spärr',async({page})=>{
 const m=await mock(page,'huvudman','program');await open(page,'huvudman','&program');await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toBeVisible();await expect(evidence(page)).toHaveCount(0);
 await approve(page);await expect(page.getByTestId('changed')).toHaveText('1');expect(m.commands[0].kind).toBe('programplan');
});
test('ny spärr stoppar redan öppnad fastställandedialog och även direkt knappklick',async({page})=>{
 const m=await mock(page);await open(page);await checks(page);await page.getByRole('button',{name:'Godkänn planen',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('apl-test-block',{detail:true})));const confirm=page.getByRole('button',{name:'Ja, godkänn planen'});await expect(confirm).toBeDisabled();
 await confirm.evaluate(button=>(button as HTMLButtonElement).click());expect(m.commands).toEqual([]);await page.getByRole('button',{name:'Avbryt'}).click();await expect(page.getByRole('button',{name:'Godkänn planen',exact:true})).toBeDisabled();
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('apl-test-block',{detail:false})));await approve(page);expect(m.commands).toHaveLength(1);
});
test('konflikt kräver omläsning och ny granskning med begripliga ord',async({page})=>{
 const m=await mock(page,'huvudman','complete','conflict');await open(page);await approve(page);await expect(page.getByRole('alert')).toContainText('Läs om och granska på nytt');
 expect(m.commands).toHaveLength(1);await page.getByRole('button',{name:'Uppdatera status'}).click();await expandReview(page);await expect(evidence(page)).toBeVisible();await expect(page.locator('.decision-check input').first()).not.toBeChecked();
});
for(const mode of ['lost','legacy-replay'] as const)test(`okänt ${mode}-svar återprövar samma kommando och visar sedan färsk plan`,async({page})=>{
 const m=await mock(page,'huvudman','complete',mode);await open(page);await approve(page);await expect(page.getByRole('button',{name:'Kontrollera och försök igen'})).toBeVisible();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();
 m.set({...m.current,series:{...m.current.series!,name:'BF27A – senare benämning',revision:1}});await page.getByRole('button',{name:'Kontrollera och försök igen'}).click();
 await expect(page.locator('.plan-decision-heading')).toContainText('BF27A – senare benämning');await expandReview(page);await expect(evidence(page)).toContainText('Gäller det sparade innehållet');expect(m.commands).toHaveLength(2);expect(m.commands[1]).toEqual(m.commands[0]);
});
