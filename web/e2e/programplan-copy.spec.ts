// Component evidence only: every API response is synthetic; no IdP or database.
import {test,expect,type Page,type Route} from '@playwright/test';
import artifact from '../lib/programplan-catalog.generated.json' with {type:'json'};
import {parseProgramplanCatalog} from '../lib/programplan-catalog';
import {defaultProgramplanChoiceBlocks} from '../lib/programplan-choice-blocks';
import {programplanTermRows,suggestProgramplanTerms,programplanLevelRanks} from '../lib/programplan-terms';
import {parseProgramplanCopyRequest,type ProgramplanCopyRequest} from '../lib/programplan-copy';
const id=(n:number)=>`77101400-0000-4000-8000-${String(n).padStart(12,'0')}`;
const schools=[{id:id(2),name:'Syntetisk Nord'},{id:id(3),name:'Syntetisk Syd'}];
const catalog=parseProgramplanCatalog(artifact),program=catalog.programs.find(p=>p.code==='ES25')!,orientationCode=program.orientations[0].code;
const basis={catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,orientationCode)};
const distribution=suggestProgramplanTerms(programplanTermRows(program,basis),[],programplanLevelRanks(program));
const codeSet=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(s=>s.subjectVersion!==null).map(s=>s.code));
const sourceEducation={id:id(10),unitId:id(2),schoolName:schools[0].name,kind:'gymnasium',name:'Syntetiskt original',localCode:null,cohort:'2027–2030',startYear:2027,status:'planerad',programCode:program.code,orientationCode,latestVersion:1,draftId:id(20)};
const expectedKeys=['basisReference','cohort','commandId','expectedEducationRevision','expectedSourceRevision','localCode','name','sourcePlanId','unitId'];
type Outcome='saved'|'lost-created'|'uncertain-created'|'uncertain-not-found'|'audit'|'conflict'|'read-failed';
async function mockCopy(page:Page,outcome:Outcome='saved',role='huvudman'){
 const commands:ProgramplanCopyRequest[]=[],statuses:ProgramplanCopyRequest[]=[],forbidden:string[]=[],unexpected:string[]=[],pageErrors:string[]=[],reads:{path:string;body:Record<string,unknown>}[]=[];
 let committed=false,created:ProgramplanCopyRequest|null=null,statusReads=0,copyPlanReads=0,releaseCommand:(()=>void)|null=null;
 page.on('pageerror',error=>pageErrors.push(error.message));
 const sourcePlan={id:id(20),offeringId:id(10),unitId:id(2),schoolName:schools[0].name,education:{name:sourceEducation.name,cohort:sourceEducation.cohort,programCode:program.code,orientationCode},version:1,revision:4,status:'utkast',decidedOn:null,catalogId:catalog.catalogId,basisReference:basis,resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[],decisionReady:false}};
 const copyEducation=()=>({...sourceEducation,id:id(11),name:created!.name,localCode:created!.localCode,cohort:created!.cohort,startYear:Number(created!.basisReference.startedOn.slice(0,4)),draftId:id(21)});
 const copyPlan=(revision=2)=>({...sourcePlan,id:id(21),offeringId:id(11),revision,education:{...sourcePlan.education,name:created!.name,cohort:created!.cohort},basisReference:created!.basisReference});
 const receipt=()=>({commandId:created!.commandId,education:copyEducation(),plan:copyPlan(0),replayed:false});
 const status=()=>committed?{commandId:created!.commandId,status:'created',education:copyEducation(),plan:copyPlan(0)}:{commandId:commands[0].commandId,status:'not_found'};
 async function respond(route:Route,json:unknown,statusCode=200){await route.fulfill({status:statusCode,json,headers:{'X-Context-Epoch':'1'}});}
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
  if(['/api/programplaner/terminer','/api/programplaner/utbildning/livscykel','/api/programplaner/utbildning/skapa'].includes(path)){forbidden.push(path);return respond(route,{code:'unexpected_followup_write'},500);}
  if(path==='/api/planering/urval')return respond(route,{customerId:id(1),serverDate:'2026-10-14',currentYear:2026,minimumYear:2000,maximumYear:2100,units:schools.map(s=>({unitId:s.id,schoolName:s.name,canRead:{programplan:true,gymnasium:true,grundskola:true,introduktionsprogram:true}}))});
  if(path==='/api/planering/lista')return respond(route,{selection:body,selectionRevision:`sha256:${'a'.repeat(64)}`,count:0,pageSize:50,rows:[]});
  if(path==='/api/planbeslut/inkorg')return respond(route,{items:[],total:0,actionCount:0,decisionCount:0,truncated:false});
  if(path==='/api/programplaner/val')return respond(route,{selection:body,units:schools,canCreateEducation:role==='huvudman',catalogs:[],programs:[],projection:null,decisionReady:false});
  if(path==='/api/programplaner/utbildning/kopiera'){
   const command=parseProgramplanCopyRequest(body);commands.push(command);created=command;
   expect(Object.keys(body).sort()).toEqual(expectedKeys);expect(command).toMatchObject({sourcePlanId:id(20),expectedSourceRevision:4,expectedEducationRevision:7,unitId:id(2),basisReference:{...basis,startedOn:'2028-08-15'}});
   if(outcome==='audit'||outcome==='conflict')return respond(route,{code:outcome==='audit'?'audit_unavailable':'conflict'},outcome==='audit'?503:409);
   if(commands.length===1&&outcome==='saved')await new Promise<void>(resolve=>{releaseCommand=resolve;});
   if(commands.length===1&&['lost-created','uncertain-created','uncertain-not-found'].includes(outcome)){
    committed=outcome!=='uncertain-not-found';return respond(route,'Lost synthetic reply',502);
   }
   committed=true;return respond(route,receipt());
  }
  if(path==='/api/programplaner/utbildning/kopiera/status'){
   statuses.push(parseProgramplanCopyRequest(body));expect(body).toEqual(commands[0]);statusReads++;
   if(statusReads===1&&['uncertain-created','uncertain-not-found'].includes(outcome))return respond(route,'Synthetic unavailable status',502);
   return respond(route,status());
  }
  if(path==='/api/programplaner/underlag'){
   reads.push({path,body});const copied=body.offeringId===id(11);if(copied)expect(committed).toBe(true);
   const p=copied?copyPlan():sourcePlan,education=copied?copyEducation():sourceEducation,selected=body.catalogId!==null;
   return respond(route,{education,lifecycle:{phase:'framtida',startsOn:p.basisReference.startedOn,archived:false,revision:copied?1:7,units:schools.map((s,i)=>({...s,primary:i===0,inMandate:true}))},
    versions:[{id:p.id,version:1,revision:p.revision,status:p.status,decidedOn:null,catalogId:p.catalogId,basisReference:p.basisReference,legacySpecialization:null}],versionCount:1,versionPage:1,pageSize:50,
    catalogs:[{catalogId:catalog.catalogId,source:catalog.source}],catalog:selected?{status:'selected',catalogId:catalog.catalogId,diagnostic:null,source:catalog.source,program,subjects:catalog.subjects.filter(s=>codeSet.has(s.code))}:{status:'unselected',catalogId:null,diagnostic:null,source:null,program:null,subjects:[]},decisionReady:false});
  }
  if(path==='/api/programplaner/lasa'){
   reads.push({path,body});const copied=body.planId===id(21);
   if(copied&&outcome==='read-failed'&&++copyPlanReads===1)return respond(route,{code:'audit_unavailable'},503);
   return respond(route,copied?copyPlan():sourcePlan);
  }
  if(path==='/api/programplaner/terminer/lasa'){reads.push({path,body});const copied=body.planId===id(21);return respond(route,{planId:copied?id(21):id(20),revision:copied?2:4,status:'utkast',distribution});}
  if(path==='/api/planbeslut/underlag'){
   const copied=body.planId===id(21),p=copied?copyPlan():sourcePlan;
   return respond(route,{kind:'programplan',planId:p.id,offeringId:p.offeringId,unitId:null,educationName:p.education.name,schoolName:null,version:1,revision:p.revision,decisionRevision:0,basisHash:`sha256:${'b'.repeat(64)}`,stage:'draft',nextActor:'rektor',actions:[],blockers:[],checks:[],history:[],sourceInfo:null});
  }
  unexpected.push(path);return respond(route,{code:'unexpected_request'},500);
 });
 return {commands,statuses,reads,release:()=>{expect(releaseCommand).not.toBeNull();releaseCommand!();},verify:()=>{expect(forbidden).toEqual([]);expect(unexpected).toEqual([]);expect(pageErrors).toEqual([]);}};
}
const workspace=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const form=(page:Page)=>workspace(page).getByRole('region',{name:'Kopiera till ny utbildning',exact:true});
async function open(page:Page,role='huvudman'){
 await page.clock.install({time:new Date('2026-10-14T10:00:00Z')});
 await page.goto(`/e2e/fixtures/programplan-copy-preview.html?role=${role}`);
 await expect(workspace(page).getByRole('heading',{name:'Syntetiskt original',exact:true})).toBeVisible();
 await expect(workspace(page).getByRole('button',{name:'Läs om',exact:true})).toBeEnabled();
 if(role==='huvudman')await workspace(page).getByRole('button',{name:'Kopiera',exact:true}).click();
}
async function fill(page:Page){await form(page).getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk komplett kopia');await form(page).getByLabel('Elevkull',{exact:true}).fill('2028–2031');await form(page).getByLabel('Lokal kod (valfri)',{exact:true}).fill('COPY28');await form(page).getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2028-08-15');}
async function copied(page:Page){await expect(form(page)).toHaveCount(0);await expect(workspace(page).getByRole('heading',{name:'Syntetisk komplett kopia',exact:true})).toBeVisible();await expect(workspace(page)).toContainText('Ram, terminsfördelning och skolval följde med.');await expect(workspace(page).locator('.pp-version')).toContainText('Revision 2');await expect(workspace(page).locator('.pps-head-text')).toContainText('Syntetisk Nord + 1');
 const row=distribution.find(item=>item.points.some(value=>value>0))!;for(let term=0;term<6;term++)await expect(workspace(page).locator(`input[data-row="${row.rowKey}"][data-term="${term}"]`)).toHaveValue(row.points[term]===0?'':String(row.points[term]));
 await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}

for(const outcome of ['saved','lost-created','uncertain-created','uncertain-not-found'] as const)test(`En komplett kopia, oförändrat kommando och exakt återläsning: ${outcome}`,async({page},info)=>{
 const mock=await mockCopy(page,outcome);await open(page);await fill(page);
 await form(page).getByRole('button',{name:'Spara kopia',exact:true}).click();
 if(outcome==='saved'){await expect.poll(()=>mock.commands.length).toBe(1);await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await expect(form(page).getByLabel('Elevkull',{exact:true})).toBeDisabled();mock.release();}
 if(outcome.startsWith('uncertain')){
  await expect(form(page)).toContainText('Sparandet kan inte avgöras ännu.');await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await expect(form(page).getByLabel('Elevkull',{exact:true})).toBeDisabled();
  await form(page).getByRole('button',{name:'Försök igen',exact:true}).click();
 }
 await copied(page);expect(mock.commands).toHaveLength(outcome==='uncertain-not-found'?2:1);for(const command of mock.commands)expect(command).toEqual(mock.commands[0]);
 expect(mock.statuses).toHaveLength(outcome==='saved'?0:outcome==='lost-created'?1:2);
 expect(mock.reads.filter(r=>r.path==='/api/programplaner/lasa'&&r.body.planId===id(21))).toHaveLength(1);
 expect(mock.reads.some(r=>r.path==='/api/programplaner/terminer/lasa'&&r.body.planId===id(21))).toBe(true);
 expect(mock.reads.some(r=>r.path==='/api/programplaner/underlag'&&r.body.offeringId===id(11))).toBe(true);
 const path=info.outputPath(`atomic-copy-${outcome}.png`);await page.screenshot({path,fullPage:true});await info.attach('atomic-copy.png',{path,contentType:'image/png'});mock.verify();
});
for(const outcome of ['audit','conflict'] as const)test(`Nekat kopieringskommando lämnar originalet: ${outcome}`,async({page})=>{
 const mock=await mockCopy(page,outcome);await open(page);await fill(page);await form(page).getByRole('button',{name:'Spara kopia',exact:true}).click();
 await expect(form(page).getByRole('alert')).toBeVisible();await expect(workspace(page).getByRole('heading',{name:'Syntetiskt original',exact:true})).toBeVisible();await expect(workspace(page)).not.toContainText('Kopian sparades');expect(mock.commands).toHaveLength(1);expect(mock.statuses).toEqual([]);expect(mock.reads.some(r=>r.body.offeringId===id(11)||r.body.planId===id(21))).toBe(false);
 if(outcome==='conflict'){await expect(form(page)).toContainText('Källplanen eller skolvalet har ändrats.');await expect(form(page).getByRole('button',{name:'Spara kopia',exact:true})).toBeDisabled();}mock.verify();
});
test('Kvittot förblir ankare när den nya planens återläsning misslyckas',async({page})=>{
 const mock=await mockCopy(page,'read-failed');await open(page);await fill(page);await form(page).getByRole('button',{name:'Spara kopia',exact:true}).click();
 await expect(workspace(page).getByRole('button',{name:'Läs aktuell sparstatus',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();await expect(workspace(page)).not.toContainText('Kopian sparades');
 await workspace(page).getByRole('button',{name:'Läs aktuell sparstatus',exact:true}).click();await copied(page);expect(mock.commands).toHaveLength(1);expect(mock.statuses).toEqual([]);expect(mock.reads.filter(r=>r.path==='/api/programplaner/lasa'&&r.body.planId===id(21))).toHaveLength(2);mock.verify();
});
test('Målet kräver senare start och inmatningen behåller tangentfokus',async({page},info)=>{
 const mock=await mockCopy(page);await open(page);await fill(page);const start=form(page).getByLabel('Utbildningens exakta startdatum',{exact:true});await expect(start).toHaveAttribute('min','2027-08-16');await start.fill('2027-08-15');await expect(form(page)).toContainText('Välj en senare elevkull');await expect(form(page).getByRole('button',{name:'Spara kopia',exact:true})).toBeDisabled();await start.fill('2028-08-15');
 const name=form(page).getByLabel('Utbildningens namn',{exact:true});await name.focus();await name.press('End');await page.keyboard.type('!');await expect(name).toBeFocused();await name.press('Tab');await expect(form(page).getByLabel('Elevkull',{exact:true})).toBeFocused();expect(mock.commands).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('copy-form-keyboard.png'),fullPage:true});mock.verify();
});
test('Rektor saknar huvudmannens kopieringsåtgärd',async({page})=>{const mock=await mockCopy(page,'saved','rektor');await open(page,'rektor');await expect(workspace(page).getByRole('button',{name:'Kopiera',exact:true})).toHaveCount(0);expect(mock.commands).toEqual([]);mock.verify();});
