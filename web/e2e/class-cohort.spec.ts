// Synthetic component evidence. Real Worker/OIDC/DB evidence belongs to plan 08.
import {test,expect,type Page} from '@playwright/test';
import {oid} from './fixtures/operational-data';
import artifact from '../lib/programplan-catalog.generated.json' with {type:'json'};
import {parseProgramplanCatalog} from '../lib/programplan-catalog';
import {defaultProgramplanChoiceBlocks} from '../lib/programplan-choice-blocks';
import {programplanTermRows,suggestProgramplanTerms,programplanLevelRanks} from '../lib/programplan-terms';
import {parseClassCohortCreateRequest,type ClassCohortCreateRequest,type ClassCohortClass} from '../lib/class-cohort';
const id=(n:number)=>`77101400-0000-4000-8000-${String(n).padStart(12,'0')}`;
const panel=(page:Page)=>page.getByRole('region',{name:'Klasser för utbildningen',exact:true});
// Följ nuvarande beslutspanel; själva spärren ska fortfarande verifieras.
async function submitDecision(page:Page){
 const review=page.getByRole('region',{name:'Beslut och nästa steg',exact:true}).locator('details.decision-review');await expect(review).toBeVisible();if(await review.getAttribute('open')===null)await review.locator(':scope > summary').click();return review.getByRole('button',{name:'Skicka till huvudmannen',exact:true});
}
const catalog=parseProgramplanCatalog(artifact),program=catalog.programs.find(p=>p.code==='ES25')!,orientation=program.orientations[0].code;
const basis={catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode:orientation,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,orientation)};
const distribution=suggestProgramplanTerms(programplanTermRows(program,basis),[],programplanLevelRanks(program));
const codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].map(row=>row.code));
async function workspaceMock(page:Page,role='rektor',fresh=false){
 const writes:string[]=[],unexpected:string[]=[];let created=false,copied=false,version=1,educationName='Syntetiskt original';let currentBasis=basis;
 const schools=[{id:id(2),name:'Syntetisk Nord'},{id:id(3),name:'Syntetisk Syd'}];
 const plan=(offering=id(10),revision=4,v=version)=>({id:offering===id(11)?id(21):v===2?id(22):id(20),offeringId:offering,unitId:id(2),schoolName:schools[0].name,education:{name:educationName,cohort:'2027–2030',programCode:program.code,orientationCode:orientation},version:v,revision,status:v<version?'ersatt':'utkast',decidedOn:v<version?'2026-10-15':null,catalogId:catalog.catalogId,basisReference:currentBasis,resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[],decisionReady:false}});
 const education=(offering=id(10))=>({id:offering,unitId:id(2),schoolName:schools[0].name,kind:'gymnasium',name:educationName,localCode:null,cohort:'2027–2030',startYear:Number(currentBasis.startedOn.slice(0,4)),status:'planerad',programCode:program.code,orientationCode:orientation,latestVersion:version,draftId:offering===id(11)?id(21):version===2?id(22):id(20)});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():null;
  const reply=(json:unknown,status=200)=>route.fulfill({status,json,headers:{'X-Context-Epoch':'1'}});
  if(path==='/api/session'){
   const context={assignmentId:id(4),membershipId:id(5),customerId:id(1),customerName:'Syntetisk huvudman',organizerId:null,organizerName:null,unitId:null,unitName:null,function:role,label:role,blocked:false,valid:true};
   const assignment={...context,id:context.assignmentId,validFrom:'2026-01-01',validTo:null,endedAt:null,membershipStatus:'active',state:'giltigt'};
   return reply({identity:{issuer:'synthetic',subject:'synthetic-cohort',displayName:'Syntetisk användare',email:null},assignments:[assignment],assignmentGroups:{valid:[assignment],upcoming:[],ended:[]},context,today:'2026-10-15',mfa:{acr:null,amr:[],authTime:null,proof:false},epoch:1,expiresAt:'2099-01-01T00:00:00Z',correlationId:'synthetic-cohort'});
  }
  if(path==='/api/elever/urval')return reply({scope:{schools,groups:[],cases:[]},schoolYears:[2026,2027,2028],currentSchoolYear:2026,endsAt:null,approverName:null,purposeCode:null,serverNow:'2026-10-15T10:00:00Z'});
  if(path==='/api/planering/urval')return reply({customerId:id(1),serverDate:'2026-10-15',currentYear:2026,minimumYear:2000,maximumYear:2100,units:schools.map(s=>({unitId:s.id,schoolName:s.name,canRead:{programplan:true,gymnasium:true,grundskola:true,introduktionsprogram:true}}))});
  if(path==='/api/planering/lista')return reply({selection:body,selectionRevision:`sha256:${'a'.repeat(64)}`,count:0,pageSize:50,rows:[]});
  if(path==='/api/planbeslut/inkorg')return reply({items:[],total:0,actionCount:0,decisionCount:0,truncated:false});
  if(path==='/api/programplaner/lista')return reply({offerings:[],count:0,page:1,pageSize:50});
  if(path==='/api/programplaner/val')return reply({selection:body,units:schools,canCreateEducation:role==='huvudman'||role==='rektor',catalogs:fresh&&body.unitId?[{catalogId:catalog.catalogId,source:catalog.source}]:[],programs:fresh&&body.catalogId?[{programRef:basis.programRef,name:program.name,orientations:program.orientations.map(o=>({code:o.code,name:o.name}))}]:[],projection:body.programRef?{catalogId:catalog.catalogId,source:catalog.source,program,subjects:catalog.subjects.filter(s=>codes.has(s.code))}:null,decisionReady:false});
  if(path==='/api/programplaner/utbildning/skapa'){writes.push(path);created=true;educationName=body.name;currentBasis=body.basisReference;return reply({commandId:body.commandId,education:{...education(),cohort:body.cohort},plan:{...plan(id(10),0),education:{...plan().education,cohort:body.cohort}},replayed:false});}
  if(path==='/api/programplaner/utbildning/kopiera'){writes.push(path);copied=true;educationName=body.name;currentBasis=body.basisReference;return reply({commandId:body.commandId,education:{...education(id(11)),cohort:body.cohort,localCode:body.localCode},plan:{...plan(id(11),0),education:{...plan(id(11)).education,cohort:body.cohort}},replayed:false});}
  if(path==='/api/programplaner/underlag'){
   const p=plan(body.offeringId,created||copied?0:4);return reply({education:education(body.offeringId),lifecycle:{phase:'framtida',startsOn:currentBasis.startedOn,archived:false,revision:7,units:schools.map((s,i)=>({...s,primary:i===0,inMandate:true}))},versions:(version===2?[plan(body.offeringId,4,2),plan(body.offeringId,4,1)]:[p]).map(p=>({id:p.id,version:p.version,revision:p.revision,status:p.status,decidedOn:p.decidedOn,catalogId:p.catalogId,basisReference:p.basisReference,legacySpecialization:null})),versionCount:version,versionPage:1,pageSize:50,catalogs:[{catalogId:catalog.catalogId,source:catalog.source}],catalog:body.catalogId?{status:'selected',catalogId:catalog.catalogId,diagnostic:null,source:catalog.source,program,subjects:catalog.subjects.filter(s=>codes.has(s.code))}:{status:'unselected',catalogId:null,diagnostic:null,source:null,program:null,subjects:[]},decisionReady:false});
  }
  if(path==='/api/programplaner/lasa')return reply(plan(body.planId===id(21)?id(11):id(10),created||copied?0:4,body.planId===id(22)?2:1));
  if(path==='/api/programplaner/terminer/lasa')return reply({planId:body.planId,revision:created||copied?0:4,status:body.planId===id(20)&&version===2?'ersatt':'utkast',distribution});
  if(path==='/api/planbeslut/underlag'){const p=plan(body.planId===id(21)?id(11):id(10),created||copied?0:4,body.planId===id(22)?2:1);return reply({contractVersion:'apl_decision_v1',apl:null,series:null,kind:'programplan',planId:p.id,offeringId:p.offeringId,unitId:null,educationName:p.education.name,schoolName:null,version:p.version,revision:created||copied?0:4,decisionRevision:0,basisHash:`sha256:${'b'.repeat(64)}`,stage:p.version<version?'approved':'draft',nextActor:p.version<version?null:'rektor',actions:p.version===version&&role==='rektor'?['submit']:[],blockers:[],checks:[],history:[],sourceInfo:null});}
  unexpected.push(path);return reply({code:'unexpected'},500);
 });
 return{writes,unexpected,nextVersion:()=>{version++;}};
}
type Mode='saved'|'lost'|'not-found'|'malformed'|'read-failed'|'conflict'|'mfa'|'hold';
async function cohortMock(page:Page,{full=false,role='rektor',mode='saved' as Mode,unknown=false}={}){
 const commands:ClassCohortCreateRequest[]=[],statuses:ClassCohortCreateRequest[]=[],reads:string[]=[],errors:string[]=[];
 let saved:ClassCohortCreateRequest|null=null,revision=7,failRead=false,mfaStatus=false,notFoundStatus=false,badStatus=false,release:(()=>void)|null=null;
 const classes=new Map<string,ClassCohortClass[]>();
 const klass=(request:ClassCohortCreateRequest)=>request.names.map((name,n)=>({id:oid(100+n),name,cohortStartYear:Number(request.startsOn.slice(0,4)),startsOn:request.startsOn,endsOn:null,validitySource:'education_start' as const}));
 const receipt=(request:ClassCohortCreateRequest,replayed=false)=>({commandId:request.commandId,offeringId:request.offeringId,unitId:request.unitId,startsOn:request.startsOn,classes:klass(request),replayed});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/klasser/organisation/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON();
  const reply=(json:unknown,status=200)=>route.fulfill({status,json});
  if(path.endsWith('/underlag')){reads.push(body.offeringId);if(failRead){failRead=false;return reply({code:'audit_unavailable'},503);}return reply({offeringId:body.offeringId,unitId:body.unitId,educationName:'Syntetisk utbildning',schoolName:body.unitId===(full?id(2):oid(3))?'Syntetisk Nord':'Syntetisk Syd',educationRevision:revision,sourceToken:unknown?null:'a'.repeat(64),educationStartsOn:unknown?null:'2027-08-15',firstSchoolYear:unknown?null:2027,canManage:role!=='huvudman'&&!unknown,blockers:unknown?['Utbildningsstarten behöver kontrolleras.']:[],classes:classes.get(body.offeringId)??[]});}
  const request=parseClassCohortCreateRequest(body);
  if(path.endsWith('/status')){statuses.push(request);if(mfaStatus)return reply({code:'mfa_required'},403);if(badStatus)return reply({commandId:oid(999),offeringId:request.offeringId,unitId:request.unitId,status:'not_found',receipt:null});return reply({commandId:request.commandId,offeringId:request.offeringId,unitId:request.unitId,status:saved&&!notFoundStatus?'found':'not_found',receipt:saved&&!notFoundStatus?receipt(request,true):null});}
  commands.push(request);
  if(commands.length===1&&mode==='hold')await new Promise<void>(resolve=>{release=resolve;});
  if(commands.length===1&&mode==='mfa')return reply({code:'mfa_required'},403);
  if(commands.length===1&&mode==='conflict'){revision++;return reply({code:'class_name_year_conflict'},409);}
  if(commands.length===1&&mode==='not-found')return reply('lost response',502);
  saved=request;classes.set(request.offeringId,klass(request));
  if(commands.length===1&&mode==='lost')return reply('lost response',502);
  if(commands.length===1&&mode==='read-failed')failRead=true;
  return reply(mode==='malformed'&&commands.length===1?{...receipt(request),unitId:oid(99)}:receipt(request));
 });
 return{commands,statuses,reads,errors,classes,badStatus:(value:boolean)=>{badStatus=value;},changeSource:()=>{revision++;},failNextRead:()=>{failRead=true;},mfaStatus:(value:boolean)=>{mfaStatus=value;},notFoundStatus:()=>{notFoundStatus=true;},release:()=>release?.()};
}
async function openPanel(page:Page,query=''){await page.goto(`/e2e/fixtures/operational-preview.html?cohort${query}`);await expect(panel(page).getByRole('button',{name:'Skapa tomma klasser'})).toBeEnabled();}
async function prepare(page:Page){const p=panel(page);await p.getByRole('button',{name:'Skapa tomma klasser'}).click();await p.getByLabel('Klassnamn 1',{exact:true}).fill(' sa27a ');await p.getByRole('button',{name:'Lägg till klassrad'}).click();await p.getByLabel('Klassnamn 2',{exact:true}).fill('sa27b');await p.getByRole('button',{name:'Granska klasser'}).click();await expect(p.getByRole('region',{name:'Granska nya klasser'})).toBeFocused();await expect(p).toContainText('SA27A');}
async function save(page:Page){await panel(page).getByRole('button',{name:'Spara 2 klasser',exact:true}).click();}
async function done(page:Page){await expect(panel(page)).toContainText('2 tomma klasser har sparats och lästs tillbaka.');await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeEnabled();expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('sp:class-cohort:')))).toEqual([]);}
for(const mode of ['saved','lost','not-found','malformed','read-failed'] as const)test(`Två klasser och säker återhämtning: ${mode}`,async({page},info)=>{
 const m=await cohortMock(page,{mode});await openPanel(page);await prepare(page);await save(page);
 if(['lost','not-found','malformed'].includes(mode)){await expect(panel(page).getByRole('button',{name:'Gör senare'})).toBeDisabled();await panel(page).getByRole('button',{name:'Läs sparstatus',exact:true}).click();if(mode==='not-found')await panel(page).getByRole('button',{name:'Försök igen med samma begäran'}).click();}
 if(mode==='read-failed')await panel(page).getByRole('button',{name:'Läs klasserna igen'}).click();
 await done(page);expect(m.commands.length).toBe(mode==='not-found'?2:1);for(const request of m.commands)expect(request).toEqual(m.commands[0]);expect(m.errors).toEqual([]);
 const savedList=panel(page).getByRole('list',{name:'Sparade klasser',exact:true});await expect(savedList.getByRole('listitem')).toHaveCount(2);await expect(savedList.getByText('SA27A',{exact:true})).toBeVisible();await expect(savedList.getByText('SA27B',{exact:true})).toBeVisible();await expect(panel(page).getByRole('combobox')).toHaveCount(0);await expect(panel(page).getByRole('button',{name:'Läs klassunderlaget igen'})).toHaveCount(0);await expect(panel(page).getByRole('complementary',{name:'Nästa steg för klasserna'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`classes-${mode}.png`),fullPage:true});
});
test('Dubbelklick skickar bara en begäran och blockerar navigation',async({page})=>{const m=await cohortMock(page,{mode:'hold'});await openPanel(page);await prepare(page);await panel(page).getByRole('button',{name:'Spara 2 klasser'}).evaluate(button=>{(button as HTMLButtonElement).click();(button as HTMLButtonElement).click();});await expect.poll(()=>m.commands.length).toBe(1);await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();m.release();await done(page);expect(m.commands).toHaveLength(1);
});
test('Okänt utfall över hårdomladdning återställs med status och utan omsändning',async({page})=>{const m=await cohortMock(page,{mode:'lost'});await openPanel(page);await prepare(page);await save(page);await expect(panel(page).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeVisible();await page.reload();await done(page);expect(m.commands).toHaveLength(1);expect(m.statuses).toEqual([m.commands[0]]);});
test('MFA lämnar dokumentet och återkommer till samma request utan autoskick',async({page})=>{const m=await cohortMock(page,{mode:'mfa'});await openPanel(page);await prepare(page);await save(page);await page.route('**/api/auth/login?**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Syntetisk MFA-retur</title><script>location.replace("/e2e/fixtures/operational-preview.html?cohort")</script>'}));await panel(page).getByRole('button',{name:'Verifiera med engångskod'}).click();await expect(panel(page).getByRole('button',{name:'Försök igen med samma begäran'})).toBeVisible();expect(m.commands).toHaveLength(1);await panel(page).getByRole('button',{name:'Försök igen med samma begäran'}).click();await done(page);expect(m.commands[1]).toEqual(m.commands[0]);});
test('Känt kvitto över reload och MFA får aldrig nedgraderas till ny create',async({page})=>{const m=await cohortMock(page,{mode:'read-failed'});await openPanel(page);await prepare(page);await save(page);await expect(panel(page).getByRole('button',{name:'Läs klasserna igen'})).toBeVisible();m.mfaStatus(true);await page.reload();await page.route('**/api/auth/login?**',route=>{m.mfaStatus(false);m.notFoundStatus();return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Syntetisk MFA-retur</title><script>location.replace("/e2e/fixtures/operational-preview.html?cohort")</script>'});});await panel(page).getByRole('button',{name:'Verifiera med engångskod'}).click();await expect(panel(page).getByRole('alert')).toBeVisible();await expect(panel(page).getByRole('button',{name:'Försök igen med samma begäran'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Lämna arbetsytan'})).toBeDisabled();expect(m.commands).toHaveLength(1);});
test('Konflikt kräver ny granskning och misslyckad omläsning spärrar gamla underlag',async({page})=>{const m=await cohortMock(page,{mode:'conflict'});await openPanel(page);await prepare(page);await save(page);await expect(panel(page)).toContainText('Kontrollera uppgifterna och granska på nytt.');await expect(panel(page).getByLabel('Klassnamn 1',{exact:true})).toHaveValue('SA27A');m.failNextRead();await panel(page).getByRole('button',{name:'Läs klassunderlaget igen'}).click();await expect(panel(page).getByRole('button',{name:'Granska klasser'})).toBeDisabled();await panel(page).getByRole('button',{name:'Läs klassunderlaget igen'}).click();await panel(page).getByRole('button',{name:'Granska klasser'}).click();await save(page);await done(page);expect(m.commands[1].commandId).not.toBe(m.commands[0].commandId);expect(m.commands[1].expectedEducationRevision).toBe(8);});
test('Lagringsfel stoppar före mutation',async({page})=>{const m=await cohortMock(page);await openPanel(page);await prepare(page);await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('blocked');};});await save(page);await expect(panel(page)).toContainText('Inget skickades.');expect(m.commands).toEqual([]);});
test('Pågående gammalt svar och journal läcker inte till annan skola eller annat uppdrag',async({page})=>{const m=await cohortMock(page,{mode:'hold'});await openPanel(page);await prepare(page);await save(page);await expect.poll(()=>m.commands.length).toBe(1);await page.getByRole('button',{name:'Simulera annan utbildning och skola'}).click();m.release();await expect(panel(page)).toContainText('Syntetisk Syd');await expect(panel(page)).not.toContainText('SA27A');await page.getByRole('button',{name:'Simulera annat uppdrag'}).click();await expect(panel(page)).not.toContainText('SA27A');expect(m.statuses).toEqual([]);});
for(const role of ['huvudman','administrator'] as const)test(`Befintlig full arbetsyta, Gör senare och mandat: ${role}`,async({page},info)=>{const w=await workspaceMock(page,role),m=await cohortMock(page,{full:true,role});await page.goto(`/e2e/fixtures/programplan-copy-preview.html?cohort&role=${role}`);await panel(page).getByRole('button',{name:'Visa klasser'}).click();await expect(panel(page)).toContainText('Första läsår');await panel(page).getByRole('button',{name:'Gör senare'}).click();await expect(panel(page).getByRole('button',{name:'Visa klasser'})).toBeFocused();expect(m.commands).toEqual([]);await panel(page).getByRole('button',{name:'Visa klasser'}).click();if(role==='huvudman'){await expect(panel(page)).toContainText('Du läser som huvudman');await expect(panel(page).getByRole('button',{name:'Skapa tomma klasser'})).toHaveCount(0);}else{await prepare(page);await save(page);await done(page);}expect(w.unexpected).toEqual([]);expect(m.errors).toEqual([]);await page.screenshot({path:info.outputPath(`full-${role}.png`),fullPage:true});});
test('Otydlig datumkälla visar äldre klasser men inga skapandeknappar',async({page})=>{const m=await cohortMock(page,{unknown:true});m.classes.set(oid(2),[{id:oid(88),name:'Äldre klass',cohortStartYear:2020,startsOn:null,endsOn:null,validitySource:'legacy_unknown'}]);await page.goto('/e2e/fixtures/operational-preview.html?cohort');await expect(panel(page)).toContainText('Inte entydigt verifierad');await expect(panel(page).getByRole('list',{name:'Sparade klasser'}).getByText('Äldre klass',{exact:true})).toBeVisible();await expect(panel(page)).toContainText('giltighetsdatum okända');await expect(panel(page).getByRole('button',{name:'Skapa tomma klasser'})).toHaveCount(0);expect(m.commands).toEqual([]);});
for(const role of ['huvudman','rektor'] as const)test(`Ny utbildning genom hela flödet öppnar separat frivilligt klasssteg: ${role}`,async({page})=>{const w=await workspaceMock(page,role,true),m=await cohortMock(page,{full:true,role});await page.clock.install({time:new Date('2026-10-15T10:00:00Z')});await page.goto(`/e2e/fixtures/programplan-copy-preview.html?new&cohort&role=${role}`);await page.getByRole('button',{name:'Ny programplan',exact:true}).click();await page.getByLabel('Skola',{exact:true}).selectOption(id(2));await page.getByLabel('1. Program',{exact:true}).selectOption(`${program.code}:${program.version}`);await page.getByLabel('2. Inriktning',{exact:true}).selectOption(orientation);await page.getByLabel('Utbildningens namn',{exact:true}).fill('Ny syntetisk utbildning');await page.getByLabel('Elevkull',{exact:true}).fill('2027–2030');await page.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2027-08-15');await page.getByRole('button',{name:'Granska utkast'}).click();await page.getByRole('button',{name:'Spara utbildning och utkast'}).click();await expect(panel(page)).toContainText('Inga klasser finns ännu');expect(w.writes).toEqual(['/api/programplaner/utbildning/skapa']);expect(m.commands).toEqual([]);await panel(page).getByRole('button',{name:'Gör senare'}).click();await expect(page.getByRole('heading',{name:'Ny syntetisk utbildning',exact:true})).toBeVisible();expect(w.unexpected).toEqual([]);});

async function createInShell(page:Page,changedSchool:boolean){
 // The actual ProtectedHome owns selection, onOpened and the school-based key.
 // A direct workspace harness cannot reproduce this remount.
 await page.goto(`/e2e/fixtures/usability-preview.html?vy=programplaner&planeringsskola=${id(changedSchool?3:2)}&planeringslasar=2027&planeringsallaar=1`);
 await expect(page.getByLabel('Planeringsskola',{exact:true})).toHaveValue(id(changedSchool?3:2));
 await page.getByRole('button',{name:'Ny programplan',exact:true}).click();
 const flow=page.getByRole('region',{name:'Program, inriktning och fördjupning',exact:true});
 await flow.getByLabel('Skola',{exact:true}).selectOption(id(2));
 await flow.getByLabel('1. Program',{exact:true}).selectOption(`${program.code}:${program.version}`);
 await flow.getByLabel('2. Inriktning',{exact:true}).selectOption(orientation);
 await flow.getByLabel('Utbildningens namn',{exact:true}).fill('Ny syntetisk utbildning');
 await flow.getByLabel('Elevkull',{exact:true}).fill('2027–2030');
 await flow.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2027-08-15');
 await flow.getByRole('button',{name:'Granska utkast'}).click();
 await flow.getByRole('button',{name:'Spara utbildning och utkast'}).click();
}
for(const changedSchool of [false,true])test(`Skyddat skal öppnar klasssteget en gång efter ny utbildning: ${changedSchool?'skolbyte':'samma skola'}`,async({page})=>{
 const w=await workspaceMock(page,'huvudman',true),m=await cohortMock(page,{full:true,role:'huvudman'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.clock.install({time:new Date('2026-10-15T10:00:00Z')});
 await createInShell(page,changedSchool);
 await expect(page.getByLabel('Planeringsskola',{exact:true})).toHaveValue(id(2));
 await expect(panel(page)).toContainText('Inga klasser finns ännu');
 expect(w.writes).toEqual(['/api/programplaner/utbildning/skapa']);expect(m.commands).toEqual([]);
 await panel(page).getByRole('button',{name:'Gör senare'}).click();
 await expect(panel(page).getByRole('button',{name:'Visa klasser'})).toBeFocused();
 // Recreate only the panel, then the whole workspace: neither may reuse the intent.
 await page.getByRole('button',{name:/^Kontrollera planen/}).click();await expect(panel(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Tillbaka till planen',exact:true}).first().click();
 await expect(panel(page).getByRole('button',{name:'Visa klasser'})).toBeVisible();
 await page.getByLabel('Planeringsläsår',{exact:true}).selectOption('2028');
 await expect(page.getByLabel('Planeringsläsår',{exact:true})).toHaveValue('2028');
 await expect(panel(page).getByRole('button',{name:'Visa klasser'})).toBeVisible();
 await expect(panel(page).getByRole('button',{name:'Gör senare'})).toHaveCount(0);
 await panel(page).getByRole('button',{name:'Visa klasser'}).click();
 await expect(panel(page)).toContainText('Inga klasser finns ännu');
 expect(w.unexpected).toEqual([]);expect(m.errors).toEqual([]);expect(errors).toEqual([]);
});

for(const field of ['Planeringsskola','Planeringsläsår'])test(`Ny navigation rensar klassöppning före målåterläsning: ${field}`,async({page})=>{
 const w=await workspaceMock(page,'huvudman',true),m=await cohortMock(page,{full:true,role:'huvudman'});
 let reads=0,held=false,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/programplaner/underlag',async route=>{
  if(++reads===2){held=true;await gate;} // First read in the school's replacement workspace.
  await route.fallback();
 });
 try{
  await page.clock.install({time:new Date('2026-10-15T10:00:00Z')});await createInShell(page,true);
  await expect.poll(()=>held).toBe(true);
  await expect(page.getByLabel('Planeringsskola',{exact:true})).toHaveValue(id(2));
  const value=field==='Planeringsskola'?id(3):'2028';
  await page.getByLabel(field,{exact:true}).selectOption(value);
  await expect(page.getByLabel(field,{exact:true})).toHaveValue(value);
  release();
  // A school change clears the target; Back reopens it within the SAME shell
  // and document. A year change retains and remounts the target directly.
  if(field==='Planeringsskola')await page.goBack();
  await expect(panel(page).getByRole('button',{name:'Visa klasser'})).toBeVisible();
  await expect(panel(page).getByRole('button',{name:'Gör senare'})).toHaveCount(0);
  expect(w.writes).toEqual(['/api/programplaner/utbildning/skapa']);expect(m.commands).toEqual([]);expect(w.unexpected).toEqual([]);
 }finally{release();}
});
test('Ändrad källversion under granskning kräver granskning av färskt underlag',async({page})=>{const m=await cohortMock(page);await openPanel(page);await prepare(page);m.changeSource();await page.getByRole('button',{name:'Simulera ny källversion'}).click();await expect(panel(page)).toContainText('granska på nytt');await expect(panel(page).getByRole('button',{name:'Spara 2 klasser'})).toHaveCount(0);await panel(page).getByRole('button',{name:'Granska klasser'}).click();await save(page);await done(page);expect(m.commands[0].expectedEducationRevision).toBe(8);});
test('Klassbegäran spärrar syskonredigering och beslut men egen återhämtning fungerar',async({page})=>{const w=await workspaceMock(page),m=await cohortMock(page,{full:true,mode:'lost'});await page.goto('/e2e/fixtures/programplan-copy-preview.html?cohort&role=rektor');await panel(page).getByRole('button',{name:'Visa klasser'}).click();await prepare(page);await expect(await submitDecision(page)).toBeDisabled();const inputs=page.locator('input[data-term]');await expect(inputs.first()).toBeDisabled();await save(page);await expect(await submitDecision(page)).toBeDisabled();await panel(page).getByRole('button',{name:'Läs sparstatus',exact:true}).click();await done(page);await expect(inputs.first()).toBeEnabled();expect(m.commands).toHaveLength(1);expect(w.unexpected).toEqual([]);});
test('Ny programplansversion behåller samma klass-ID:n i full arbetsyta',async({page})=>{const w=await workspaceMock(page),m=await cohortMock(page,{full:true});await page.goto('/e2e/fixtures/programplan-copy-preview.html?cohort&role=rektor');await panel(page).getByRole('button',{name:'Visa klasser'}).click();await prepare(page);await save(page);await done(page);const before=m.classes.get(id(10));w.nextVersion();await page.locator('.pps-more-actions > summary').click();await page.getByRole('button',{name:'Uppdatera sidan',exact:true}).click();await page.getByText('Underlag och tidigare versioner',{exact:true}).click();await page.getByRole('button',{name:'Version 2 · Utkast',exact:true}).click();await panel(page).getByRole('button',{name:'Visa klasser'}).click();await expect(panel(page).getByRole('heading',{name:'Sparade klasser (2)',exact:true})).toBeVisible();expect(m.classes.get(id(10))).toEqual(before);expect(m.commands).toHaveLength(1);expect(w.unexpected).toEqual([]);});
test('Kopierad ny kull visar tom klasstruktur utan originalets klass-ID:n',async({page})=>{const w=await workspaceMock(page,'huvudman'),m=await cohortMock(page,{full:true,role:'huvudman'});m.classes.set(id(10),[{id:oid(88),name:'GAMMAL27',cohortStartYear:2027,startsOn:'2027-08-15',endsOn:null,validitySource:'education_start'}]);await page.clock.install({time:new Date('2026-10-15T10:00:00Z')});await page.goto('/e2e/fixtures/programplan-copy-preview.html?cohort&role=huvudman');await panel(page).getByRole('button',{name:'Visa klasser'}).click();await expect(panel(page).getByRole('heading',{name:'Sparade klasser (1)',exact:true})).toBeVisible();await page.locator('.pps-more-actions > summary').click();await page.getByRole('button',{name:'Kopiera till nästa kull',exact:true}).click();const form=page.getByRole('region',{name:'Kopiera till nästa kull',exact:true});await form.getByLabel('Utbildningens namn',{exact:true}).fill('Ny kull');await form.getByLabel('Elevkull',{exact:true}).fill('2027–2030');await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill('2028-08-15');await form.getByRole('button',{name:'Spara kopia',exact:true}).click();await expect(page.getByRole('heading',{name:'Ny kull',exact:true})).toBeVisible();await panel(page).getByRole('button',{name:'Visa klasser'}).click();await expect(panel(page)).toContainText('Inga klasser finns ännu');await expect(panel(page)).not.toContainText('GAMMAL27');expect(m.commands).toEqual([]);expect(m.classes.get(id(10))?.[0].id).toBe(oid(88));expect(w.unexpected).toEqual([]);});
test('Namnregler, tangentfokus och en enda klass',async({page},info)=>{const m=await cohortMock(page);await openPanel(page);await panel(page).getByRole('button',{name:'Skapa tomma klasser'}).click();const input=panel(page).getByLabel('Klassnamn 1',{exact:true});await expect(input).toBeFocused();await input.fill('sa27a');await input.press('End');await page.keyboard.type('x');await expect(input).toBeFocused();await input.press('Tab');await expect(panel(page).getByRole('button',{name:'Lägg till klassrad'})).toBeFocused();await panel(page).getByRole('button',{name:'Lägg till klassrad'}).click();await panel(page).getByLabel('Klassnamn 2',{exact:true}).fill('SA27AX');await panel(page).getByRole('button',{name:'Granska klasser'}).click();await expect(panel(page).getByRole('alert')).toContainText('olika klassnamn');expect(m.commands).toEqual([]);await panel(page).getByRole('button',{name:'Ta bort rad 2'}).click();await panel(page).getByRole('button',{name:'Granska klasser'}).click();await expect(panel(page)).toContainText('Granska en tom klass');await page.screenshot({path:info.outputPath('single-class-review.png'),fullPage:true});await panel(page).getByRole('button',{name:'Spara 1 klass',exact:true}).click();await expect(panel(page)).toContainText('En tom klass har sparats och lästs tillbaka');expect(m.commands[0].names).toEqual(['SA27AX']);});
test('Främmande statuskvitto låser fortsatt tills korrekt requestbunden status finns',async({page})=>{const m=await cohortMock(page,{mode:'lost'});await openPanel(page);await prepare(page);await save(page);m.badStatus(true);await panel(page).getByRole('button',{name:'Läs sparstatus',exact:true}).click();await expect(panel(page).getByRole('alert')).toBeVisible();await expect(panel(page).getByRole('button',{name:'Gör senare'})).toBeDisabled();await expect(panel(page).getByRole('button',{name:'Försök igen med samma begäran'})).toHaveCount(0);m.badStatus(false);await panel(page).getByRole('button',{name:'Läs sparstatus',exact:true}).click();await done(page);expect(m.commands).toHaveLength(1);});
test('Trasig journal kan inte skicka eller öppna syskonbeslut efter reload',async({page})=>{await workspaceMock(page);const m=await cohortMock(page,{full:true,mode:'lost'});await page.goto('/e2e/fixtures/programplan-copy-preview.html?cohort&role=rektor');await panel(page).getByRole('button',{name:'Visa klasser'}).click();await prepare(page);await save(page);await expect(panel(page).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeVisible();await page.evaluate(()=>{const key=Object.keys(sessionStorage).find(key=>key.startsWith('sp:class-cohort:'))!;const value=JSON.parse(sessionStorage.getItem(key)!);value.request.unitId='77101400-0000-4000-8000-000000000999';sessionStorage.setItem(key,JSON.stringify(value));});await page.reload();await expect(panel(page)).toContainText('Den sparade klassbegäran kan inte verifieras');await expect(await submitDecision(page)).toBeDisabled();await expect(page.locator('input[data-term]').first()).toBeDisabled();expect(m.statuses).toEqual([]);expect(m.commands).toHaveLength(1);});
test('Högst tjugo explicita namnrader och inga automatiska klassförslag',async({page})=>{const m=await cohortMock(page);await openPanel(page);await panel(page).getByRole('button',{name:'Skapa tomma klasser'}).click();for(let n=1;n<=20;n++){await panel(page).getByLabel(`Klassnamn ${n}`,{exact:true}).fill(`SA27-${n}`);if(n<20)await panel(page).getByRole('button',{name:'Lägg till klassrad'}).click();}await expect(panel(page).getByRole('button',{name:'Lägg till klassrad'})).toBeDisabled();await panel(page).getByRole('button',{name:'Granska klasser'}).click();await expect(panel(page)).toContainText('Granska 20 tomma klasser');expect(m.commands).toEqual([]);});

test('Synlig klasslista visar både giltighet och okända datum utan falsk kopplingsstatus',async({page},info)=>{
 const m=await cohortMock(page);
 m.classes.set(oid(2),[{id:oid(88),name:'SA27A',cohortStartYear:2027,startsOn:'2027-08-15',endsOn:'2030-06-15',validitySource:'education_start'},{id:oid(89),name:'SA27B',cohortStartYear:2027,startsOn:null,endsOn:null,validitySource:'legacy_unknown'}]);
 await openPanel(page);const p=panel(page),list=p.getByRole('list',{name:'Sparade klasser'});
 await expect(list.getByRole('listitem')).toHaveCount(2);await expect(list.getByText('SA27A',{exact:true})).toBeVisible();await expect(list.getByText('SA27B',{exact:true})).toBeVisible();
 await expect(list).toContainText('till och med 2030-06-15');await expect(list).toContainText('Äldre klass, giltighetsdatum okända');await expect(list.getByText('Sparad klass',{exact:true})).toHaveCount(2);
 await expect(p.getByRole('checkbox')).toHaveCount(0);await expect(p.getByRole('combobox')).toHaveCount(0);await expect(list).not.toContainText('Ingen timplan');await expect(p.getByRole('button',{name:'Läs klassunderlaget igen'})).toHaveCount(0);
 const help=p.locator('summary');await help.focus();await page.keyboard.press('Enter');await expect(p.getByText('Klasserna tillhör utbildningen och följer med', {exact:false})).toBeVisible();
 const targets=await p.locator('button,summary,input').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {height:r.height,width:r.width};}).filter(r=>r.width&&r.height));
 expect(targets.length).toBeGreaterThan(0);for(const target of targets){expect(target.height).toBeGreaterThanOrEqual(44);expect(target.width).toBeGreaterThanOrEqual(44);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('saved-classes-visible.png'),fullPage:true});expect(m.commands).toEqual([]);
 await p.getByRole('button',{name:'Skapa tomma klasser'}).click();await p.getByLabel('Klassnamn 1',{exact:true}).fill('SA27C');await p.getByRole('button',{name:'Lägg till klassrad'}).click();await expect(p.getByLabel('Klassnamn 2',{exact:true})).toBeFocused();await p.getByRole('button',{name:'Ta bort rad 2'}).click();await expect(p.getByLabel('Klassnamn 1',{exact:true})).toBeFocused();await p.getByRole('button',{name:'Granska klasser'}).click();await expect(p).toContainText('Inte sparat än');expect(m.commands).toEqual([]);await p.getByRole('button',{name:'Ändra namn'}).click();await expect(p.getByLabel('Klassnamn 1',{exact:true})).toBeFocused();
});

test('Huvudmannens klassöversikt ger läsväg utan uppmaning att skapa eller koppla',async({page})=>{
 const m=await cohortMock(page,{role:'huvudman'});await page.goto('/e2e/fixtures/operational-preview.html?cohort');const p=panel(page);
 await expect(p).toContainText('Inga klasser finns ännu');await expect(p).not.toContainText('Skapa klasser nu');await expect(p.getByRole('button',{name:'Skapa tomma klasser'})).toHaveCount(0);
 m.classes.set(oid(2),[{id:oid(88),name:'SA27A',cohortStartYear:2027,startsOn:'2027-08-15',endsOn:null,validitySource:'education_start'}]);await page.reload();
 await expect(p.getByRole('heading',{name:'Se klassernas timplanskopplingar'})).toBeVisible();await expect(p.getByRole('complementary',{name:'Nästa steg för klasserna'})).not.toContainText('väljer du Koppla klass');expect(m.commands).toEqual([]);
});
