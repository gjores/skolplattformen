// Synthetic component evidence for Min tjänst, Personal, Bemanning and navigation (05.1-07). The real shell (ProtectedHome) runs;
// every /api/* request is answered here with synthetic people and schools. No database, server or live authentication.
// Komponentprov, inte faktiskt prov (det görs i 05.1-09).
import {test,expect,type Page,type Route,type TestInfo} from '@playwright/test';
import {parsePersonalReadReply,parsePlanReadReply,parseSelfReadReply,parseStaffingReadReply} from '../lib/tjanst-contract';

const url='/e2e/fixtures/tjanst-staff-preview.html';
const id=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash=(n:number)=>`sha256:${String(n).padStart(8,'0').repeat(8)}`;
const A=id(3),B=id(4),YEAR=2026,TODAY='2026-10-16';
const P={anna:id(101),bertil:id(102),cecilia:id(103),david:id(104)};
const SCHOOL_A='Syntetiska gymnasiet',SCHOOL_B='Andra syntetiska skolan';
type Role='self'|'rektor'|'huvudman';
type Failure={status:number;json:unknown}|'abort'|'lost';
type Options={role:Role;data?:'standard'|'tom'|'obunden'|'kvitterad'|'lang'|'utkast';mfa?:boolean};
const phone=(info:TestInfo)=>info.project.name.startsWith('phone');
const desktopOnly=(info:TestInfo)=>test.skip(phone(info),'Redigering finns bara på dator (D-15).');

function session(role:Role){
 const fn=role==='self'?'larare':role;
 const context={assignmentId:id(950),membershipId:id(951),customerId:id(952),customerName:'Syntetisk kund',organizerId:id(953),organizerName:'Syntetisk huvudman',unitId:null,unitName:null,
  function:fn,scopeKind:role==='self'?'self':'school',label:role==='self'?'Lärare · Egen tjänst':role==='rektor'?'Rektor':'Huvudman',blocked:false,valid:true};
 const assignment={...context,id:id(950),validFrom:'2026-01-01',validTo:null,endedAt:null,membershipStatus:'active',state:'giltigt'};
 return{identity:{issuer:'https://synthetic.tjanst.example.test',subject:`synthetic-${role}`,displayName:role==='self'?'Anna Andersson':'Syntetisk Användare',email:null},
  assignments:[assignment],assignmentGroups:{valid:[assignment],upcoming:[],ended:[]},context,today:TODAY,mfa:{acr:null,amr:[],authTime:null,proof:false},epoch:1,expiresAt:'2099-01-01T00:00:00Z',correlationId:'synthetic-tjanst'};
}
const setup={customerId:id(952),serverDate:TODAY,currentYear:YEAR,minimumYear:2000,maximumYear:2100,
 units:[A,B].map(unitId=>({unitId,schoolName:unitId===A?SCHOOL_A:SCHOOL_B,canRead:{programplan:true,gymnasium:true,grundskola:true,introduktionsprogram:true}}))};

/** Med variant utkast har skolan en ersatt version 1, en publicerad version 2 och rektors utkast version 3 med annan tid (WR-07).
 * Som servern: utan versionId svarar läsningen med utkastet, med versionId med den publicerade eller ersatta versionen. */
function planRead(unitId:string,role:Role,variant='standard',versionId?:string){
 const sourceKey=`class_timplan:${id(201)}:${YEAR}:ENGENG05`;
 const cls={classId:id(201),name:'TE26A',link:{linkRevision:0,timplanId:id(701),seriesId:id(750),seriesName:'Teknikprogrammet',timplanVersion:2,column:'ar1',schoolform:'gymnasium'},
  needs:[{sourceKind:'class_timplan',sourceKey,rowKey:'ENGENG05',label:'Engelska 5',needHt:3000,needVt:3000,needBasis:'terms'}]};
 const v1={id:id(601),versionNo:1,status:'published',contentHash:hash(1),basedOnVersionId:null,publishedByName:'Rektor Syntetisk',publishedAt:'2026-06-15T08:00:00.000Z'};
 const row={id:id(301),lineageId:id(5301),sourceKind:'class_timplan',sourceKey,classId:id(201),rowKey:'ENGENG05',personId:P.anna,teacherHt:3000,teacherVt:3000,needHt:3000,needVt:3000,needBasis:'terms',stale:false,jointGroupId:null,comment:''};
 if(variant==='utkast'){
  const old={id:id(604),versionNo:1,status:'superseded',contentHash:hash(4),basedOnVersionId:null,publishedByName:'Rektor Syntetisk',publishedAt:'2026-06-15T08:00:00.000Z'};
  const pub={id:id(605),versionNo:2,status:'published',contentHash:hash(5),basedOnVersionId:id(604),publishedByName:'Rektor Syntetisk',publishedAt:'2026-09-01T08:00:00.000Z'};
  const draft={id:id(606),versionNo:3,status:'draft',contentHash:hash(6),basedOnVersionId:id(605),publishedByName:null,publishedAt:null};
  const shown=[old,pub,draft].find(v=>v.id===versionId)??draft;
  // Utkastet har 20 + 20 h, de publicerade versionerna 50 + 50 h.
  const time=shown===draft?{teacherHt:1200,teacherVt:1200}:{teacherHt:3000,teacherVt:3000};
  return{contractVersion:'tjanst_v1',unitId,schoolName:SCHOOL_A,schoolYear:YEAR,revision:5,version:shown,versions:[old,pub,draft],teachers:[{personId:P.anna,displayName:'Anna Andersson',draft:false,shareHere:60}],
   classes:[cls],rows:[{...row,id:shown===draft?id(306):row.id,...time}],specials:[],joints:[],actions:[],blockers:[],capabilities:{canEdit:false,canPublish:false,canReadHistory:true}};
 }
 return{contractVersion:'tjanst_v1',unitId,schoolName:SCHOOL_A,schoolYear:YEAR,revision:3,version:v1,versions:[v1],teachers:[{personId:P.anna,displayName:'Anna Andersson',draft:false,shareHere:60}],
  classes:[cls],rows:[row],specials:[],joints:[],actions:role==='rektor'?['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk']:[],blockers:[],capabilities:{canEdit:role==='rektor',canPublish:false,canReadHistory:true}};
}
type Duty={id:string;unitId:string;schoolName:string;percent:number;startsOn:string;endsOn:string|null};
type Person={id:string;givenName:string;familyName:string;externalId:string|null;externalIdSource:string|null;status:'active'|'draft';proposedForUnitId:string|null;draftNote:string|null;revision:number;
 employments:{id:string;percent:number;startsOn:string;endsOn:string|null;duties:Duty[]}[];account:boolean};
const duty=(n:number,unitId:string,percent:number):Duty=>({id:id(n),unitId,schoolName:unitId===A?SCHOOL_A:SCHOOL_B,percent,startsOn:'2026-07-01',endsOn:null});
function staff(variant:string):Person[]{
 if(variant==='tom')return[];
 return[
  {id:P.anna,givenName:'Anna',familyName:'Andersson',externalId:'SYN-0001',externalIdSource:'syntetisk-källa',status:'active',proposedForUnitId:null,draftNote:null,revision:3,
   employments:[{id:id(810),percent:100,startsOn:'2026-07-01',endsOn:null,duties:[duty(820,A,60)]}],account:true},
  {id:P.bertil,givenName:'Bertil',familyName:'Berg',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:2,
   employments:[{id:id(811),percent:100,startsOn:'2026-07-01',endsOn:null,duties:[duty(821,A,100)]}],account:false},
  {id:P.cecilia,givenName:'Cecilia',familyName:'Dahl',externalId:null,externalIdSource:null,status:'draft',proposedForUnitId:A,draftNote:'Ny engelsklärare',revision:1,employments:[],account:false},
  {id:P.david,givenName:'David',familyName:'Ek',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],account:false},
 ];
}

async function mock(page:Page,options:Options){
 const variant=options.data??'standard',requests:string[]=[],bodies:{path:string;body:any}[]=[],unexpected:string[]=[],errors:string[]=[];
 const fail:Record<string,Failure[]>={},holds:Record<string,Promise<void>|undefined>={},receipts=new Map<string,unknown>();
 let release:()=>void=()=>{};
 page.on('pageerror',e=>errors.push(e.message));
 const people=staff(variant);
 const publication={versionId:id(602),versionNo:2,unitId:A,schoolName:variant==='lang'?'Syntetiska gymnasiet för teknik, naturvetenskap och samhällsvetenskap i Exempelstad':SCHOOL_A,
  schoolYear:YEAR,publishedAt:'2026-10-01T08:00:00.000Z',contentHash:hash(2),
  rows:[{id:id(301),className:'TE26A',rowKey:'ENGENG05',label:'Engelska 5',ht:3000,vt:0,joint:null},
   {id:id(303),className:'TE26A',rowKey:'SVESVE01',label:'Svenska 1',ht:3000,vt:3000,joint:{jointId:id(401),name:'Svenska 1 TE26A + EK26',colleagues:[],ht:3000,vt:3000}},
   {id:id(304),className:'EK26',rowKey:'SVESVE01',label:'Svenska 1',ht:3000,vt:3000,joint:{jointId:id(401),name:'Svenska 1 TE26A + EK26',colleagues:[],ht:3000,vt:3000}}],
  specials:[{id:id(501),kind:'mentor',label:'Mentor',className:'TE26A',ht:1200,vt:1200}],
  acknowledgedAt:variant==='kvitterad'?'2026-10-02T07:00:00.000Z':null as string|null,comments:[] as {id:string;body:string;at:string}[]};
 const selfRead=()=>({contractVersion:'tjanst_v1',person:{id:P.anna,displayName:'Anna Andersson'},publications:variant==='tom'?[]:[structuredClone(publication)],capabilities:{canAck:true,canComment:true}});
 const organizerRead=()=>({contractVersion:'tjanst_v1',scope:'organizer',unitId:null,people:people.map(p=>({...structuredClone(p),duties:p.employments.flatMap(e=>structuredClone(e.duties))})),
  actions:['create_person','update_person','save_employment','save_duties'],blockers:[],capabilities:{canManage:true,canCreateDraft:false}});
 const unitRead=(unitId:string)=>({contractVersion:'tjanst_v1',scope:'unit',unitId,people:people.filter(p=>p.employments.some(e=>e.duties.some(d=>d.unitId===unitId))||p.proposedForUnitId===unitId)
  .map(({account:_a,employments,...p})=>({...structuredClone(p),employments:[],duties:employments.flatMap(e=>e.duties.filter(d=>d.unitId===unitId))})),actions:['create_draft_teacher'],blockers:[],capabilities:{canManage:false,canCreateDraft:true}});
 const staffing=()=>({contractVersion:'tjanst_v1',schoolYear:YEAR,units:[
  {unitId:A,schoolName:SCHOOL_A,published:variant==='tom'?null:variant==='utkast'?{versionId:id(605),versionNo:2,publishedAt:'2026-09-01T08:00:00.000Z'}:{versionId:id(601),versionNo:1,publishedAt:'2026-06-15T08:00:00.000Z'},
   sums:variant==='tom'?null:{teaching:{ht:6000,vt:3000},special:{ht:1200,vt:1200},vacant:{ht:2160,vt:2160},unallocated:{ht:1500,vt:4500},unlinkedClasses:1}},
  {unitId:B,schoolName:SCHOOL_B,published:null,sums:null}],vacancies:variant==='tom'?[]:[{unitId:A,kind:'row',id:id(305),label:'Svenska som andraspråk 1 IMSPR',ht:2160,vt:2160}]});
 // Mockens svar ska själva klara kontraktets parsers, annars bevisar provet inget.
 parseSelfReadReply(selfRead());parsePersonalReadReply(organizerRead(),{});parsePersonalReadReply(unitRead(A),{unitId:A});parseStaffingReadReply(staffing(),{schoolYear:YEAR});
 parsePlanReadReply(planRead(A,'huvudman'),{unitId:A,schoolYear:YEAR});
 parsePlanReadReply(planRead(A,'huvudman','utkast'),{unitId:A,schoolYear:YEAR});parsePlanReadReply(planRead(A,'huvudman','utkast',id(605)),{unitId:A,schoolYear:YEAR,versionId:id(605)});
 const reason=(status:number,code:string)=>({status,json:{code:status===409?'conflict':'bad_request',correlationId:'syntetisk-ref-1',details:{reason:code}}});
 let mfaPending=options.mfa===true;
 function personal(body:any){
  if(mfaPending){mfaPending=false;return{status:403,json:{code:'mfa_required',correlationId:'syntetisk-ref-2'}};}
  const p=body.payload,person=people.find(x=>x.id===p.personId);
  if(!person||person.revision!==body.expectedRevision)return reason(409,'tjanst_revision_conflict');
  if(body.action==='save_duties'){
   const e=person.employments.find(x=>x.id===p.employmentId)!;
   if(p.duties.reduce((n:number,d:any)=>n+d.percent,0)>e.percent)return reason(400,'tjanst_capacity_exceeded');
   e.duties=p.duties.map((d:any,i:number)=>({id:d.dutyId??id(900+i),unitId:d.unitId,schoolName:d.unitId===A?SCHOOL_A:SCHOOL_B,percent:d.percent,startsOn:d.startsOn,endsOn:d.endsOn}));
  }else return{status:400,json:{code:'bad_request'}};
  person.revision++;
  return{status:200,json:{receipt:{commandId:body.commandId,action:body.action,personId:person.id,revision:person.revision,replayed:false},detail:organizerRead()}};
 }
 function self(body:any){
  const feedbackId=id(700+publication.comments.length+(publication.acknowledgedAt?1:0)+10);
  if(body.action==='ack')publication.acknowledgedAt='2026-10-16T08:00:00.000Z';
  else publication.comments.push({id:feedbackId,body:body.body,at:`2026-10-16T08:0${publication.comments.length}:00.000Z`});
  const reply={receipt:{commandId:body.commandId,action:body.action,versionId:body.versionId,feedbackId,replayed:false},detail:selfRead()};
  receipts.set(body.commandId,reply);return{status:200,json:reply};
 }
 await page.route('**/api/**',async(route:Route)=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():{};
  requests.push(path);bodies.push({path,body});
  const name=path.replace('/api/','');
  if(holds[name]){const h=holds[name];holds[name]=undefined;await h;}
  const failure=fail[name]?.shift();
  if(failure==='abort')return route.abort();
  if(failure&&failure!=='lost')return route.fulfill({status:failure.status,json:failure.json});
  let reply:{status:number;json:unknown};
  if(path==='/api/session')reply={status:200,json:session(options.role)};
  else if(path==='/api/planering/urval')reply={status:200,json:setup};
  else if(path==='/api/planbeslut/inkorg')reply={status:200,json:{items:[],total:0,actionCount:0,decisionCount:0,truncated:false}};
  else if(path==='/api/tjanst/egen/lasa')reply=variant==='obunden'?{status:403,json:{code:'forbidden',correlationId:'syntetisk-ref-3'}}:{status:200,json:selfRead()};
  else if(path==='/api/tjanst/egen/kommando')reply=self(body);
  else if(path==='/api/tjanst/egen/status'||path==='/api/tjanst/personal/status'){const r=receipts.get(body.command.commandId);reply={status:200,json:r?{state:'completed',result:r}:{state:'not_found',result:null}};}
  else if(path==='/api/tjanst/personal/lasa')reply={status:200,json:body.unitId?unitRead(body.unitId):organizerRead()};
  else if(path==='/api/tjanst/personal/kommando'){reply=personal(body);if(reply.status===200)receipts.set(body.commandId,reply.json);}
  else if(path==='/api/tjanst/bemanning/lasa')reply={status:200,json:staffing()};
  else if(path==='/api/tjanst/plan/lasa')reply={status:200,json:planRead(body.unitId,options.role,variant,body.versionId)};
  else if(path==='/api/kund/mandat'&&route.request().method()==='GET')reply={status:200,json:{mandates:[{id:id(960),displayName:'Anna Andersson',function:'larare',schools:[{id:A,name:SCHOOL_A}],scopeKind:'self',
   validFrom:'2026-08-01',validTo:null,startsAt:null,endsAt:null,status:'giltigt',approverName:null,purposeCode:null}]}};
  else if(path==='/api/kund/mandat/urval')reply={status:200,json:{functions:['larare','administrator'],recipients:[{membershipId:id(970),displayName:'Bertil Berg'}],schools:[{id:A,name:SCHOOL_A},{id:B,name:SCHOOL_B}],
   groups:[{id:id(980),unitId:A,label:'TE26A'}],pupils:[],cases:[],validFrom:TODAY,validTo:null}};
  else if(path==='/api/kund/mandat')reply={status:200,json:{assignmentId:id(990)}};
  else{unexpected.push(path);reply={status:404,json:{code:'not_found'}};}
  if(failure==='lost')return route.abort();
  return route.fulfill({status:reply.status,json:reply.json});
 });
 return{requests,bodies,unexpected,errors,publication,people,
  failNext:(name:string,f:Failure)=>{(fail[name]??=[]).push(f);},
  holdNext:(name:string)=>{holds[name]=new Promise<void>(resolve=>{release=resolve;});},
  release:()=>release()};
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);}
async function navItems(page:Page,info:TestInfo){
 if(phone(info)||(page.viewportSize()?.width??1440)<768)await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
 const items=page.locator('.nav-button:visible');await expect(items.first()).toBeVisible();
 return (await items.allInnerTexts()).map(t=>t.trim());
}
const heading=(page:Page,name:string)=>page.getByRole('heading',{level:1,name,exact:true});
const card=(page:Page)=>page.locator('.min-tjanst-card').first();

test.describe('Egen tjänst och navigering',()=>{
 test('self landar i Min tjänst: bara menyn Min tjänst, ?vy=elever ger Min tjänst och inga elev- eller planeringsanrop',async({page},info)=>{
  const m=await mock(page,{role:'self'});
  await page.goto(url+'?vy=elever&skola='+A);
  await expect(heading(page,'Min tjänst')).toBeVisible();
  await expect(page.getByText('Hämtar din tjänst…')).toHaveCount(0);
  await expect(card(page).getByRole('heading',{name:SCHOOL_A})).toBeVisible();
  const facts=card(page).locator('dl.tjanst-facts');
  // Engelska 5 (50 + 0 h) och samläsningen Svenska 1 en gång (50 + 50 h), mentor skilt från undervisning (D-16).
  await expect(facts).toContainText('UndervisningHT 100 h · VT 50 h · Läsår 150 h');await expect(facts).toContainText('SpecialuppdragHT 20 h · VT 20 h · Läsår 40 h');
  await expect(facts).toContainText('TotaltHT 120 h · VT 70 h · Läsår 190 h');await expect(facts).toContainText('Schemalagd tidUnderlag saknas');
  await expect(card(page).getByText('Samläsning med EK26').locator('visible=true').first()).toBeVisible();
  expect(await navItems(page,info)).toEqual(['Min tjänst']);
  if(phone(info))await page.keyboard.press('Escape');
  await page.evaluate(()=>{history.pushState(null,'','?vy=elever');history.pushState(null,'','?vy=mandat');history.back();});
  await expect(heading(page,'Min tjänst')).toBeVisible();
  await page.reload();await expect(heading(page,'Min tjänst')).toBeVisible();await expect(card(page)).toBeVisible();
  expect(m.requests.filter(p=>p.startsWith('/api/elever')||p.startsWith('/api/planering'))).toEqual([]);
  expect(m.requests.every(p=>p==='/api/session'||p.startsWith('/api/tjanst/egen/'))).toBe(true);
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/egen/lasa').every(b=>JSON.stringify(b.body)==='{}')).toBe(true);
  expect(m.unexpected).toEqual([]);expect(m.errors).toEqual([]);
 });

 test('rektor når Tjänstefördelning i PLANERING och TjanstWorkspace monteras med planeringsvalets skola',async({page},info)=>{
  const m=await mock(page,{role:'rektor'});
  await page.goto(url);
  const items=await navItems(page,info);
  expect(items.indexOf('Tjänstefördelning')).toBe(items.indexOf('APL-planering')+1);
  await page.locator('.nav-button:visible',{hasText:'Tjänstefördelning'}).click();
  await expect(heading(page,'Tjänstefördelning')).toBeVisible();
  await expect(page.getByText('Gäller årsöverblick, programplaner, timplaner och tjänstefördelning.')).toBeVisible();
  await expect(page.getByText('Välj en skola i planeringsvalet. En tjänstefördelning gäller en skola.')).toBeVisible();
  await page.getByLabel('Planeringsskola').selectOption(A);
  await expect(page.locator('.tjanst .admin-kicker')).toHaveText(`PLANERING · ${SCHOOL_A}`);
  await expect(page.getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/plan/lasa').map(b=>b.body)).toEqual([{unitId:A,schoolYear:YEAR}]);
  expect(new URL(page.url()).searchParams.get('vy')).toBe('tjanst');
  await noOverflow(page);expect(m.errors).toEqual([]);
 });
});

test.describe('Min tjänst',()=>{
 test('Min tjänst populated och ny version: kvittera en gång, märket ändras och knappen försvinner',async({page})=>{
  const m=await mock(page,{role:'self'});
  await page.goto(url);
  await expect(card(page).getByText('Rektor har publicerat version 2. Läs igenom och kvittera den nya versionen.')).toBeVisible();
  await expect(card(page).getByText('Inte kvitterad')).toBeVisible();
  await expect(card(page).getByText('Kvittensen visar rektor att du har läst tjänsten. Den betyder inte att du godkänner den.',{exact:false})).toBeVisible();
  await card(page).getByRole('button',{name:'Kvittera att jag har läst'}).click();
  await expect(card(page).getByText('Du har kvitterat version 2.')).toBeVisible();
  await expect(card(page).getByText('Kvitterad 2026-10-16')).toBeVisible();
  await expect(card(page).getByRole('button',{name:'Kvittera att jag har läst'})).toHaveCount(0);
  await expect(card(page).getByText('Rektor har publicerat version 2.',{exact:false})).toHaveCount(0);
  const sent=m.bodies.filter(b=>b.path==='/api/tjanst/egen/kommando');
  expect(sent).toHaveLength(1);expect(Object.keys(sent[0].body).sort()).toEqual(['action','commandId','versionId']);expect(sent[0].body).toMatchObject({action:'ack',versionId:id(602)});
  expect(m.errors).toEqual([]);
 });

 test('Min tjänst long-text och overflow: kommentar på 2 000 tecken godkänns, 2 001 ger fältfel och inget sidledsrull',async({page})=>{
  const m=await mock(page,{role:'self',data:'lang'});
  await page.goto(url);
  const field=card(page).getByLabel('Kommentar till rektor');
  await field.fill('x'.repeat(2001));
  await expect(card(page).getByText('Kommentaren får vara högst 2 000 tecken.')).toBeVisible();
  await expect(field).toHaveAttribute('aria-invalid','true');
  await card(page).getByRole('button',{name:'Skicka kommentar'}).click();
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/egen/kommando')).toHaveLength(0);
  const text=('Arbetstidsfördelningsöverenskommelseförslag'.repeat(10)+' ').repeat(5).slice(0,2000);
  await field.fill(text);
  await expect(card(page).getByText('2 000 av 2 000 tecken')).toBeVisible();
  await expect(card(page).getByText('Kommentaren får vara högst 2 000 tecken.')).toHaveCount(0);
  await card(page).getByRole('button',{name:'Skicka kommentar'}).click();
  await expect(card(page).getByText('Kommentaren är skickad till rektor.')).toBeVisible();
  await expect(field).toHaveValue('');
  const sent=m.bodies.filter(b=>b.path==='/api/tjanst/egen/kommando');expect(sent).toHaveLength(1);expect(sent[0].body.body).toHaveLength(2000);
  const shown=card(page).locator('.min-tjanst-comments p');await expect(shown).toHaveText(text);
  expect(await shown.evaluate(e=>getComputedStyle(e).whiteSpace)).toBe('pre-wrap');
  await noOverflow(page);
  await expect(card(page).getByText('Du har inte skrivit några kommentarer.')).toHaveCount(0);
 });

 test('Min tjänst error: okänt utfall avgörs via status och kommentarstexten sparas aldrig i sessionStorage',async({page})=>{
  const m=await mock(page,{role:'self'});
  const marker='SYNTETISKKOMMENTAR om mentorstiden';
  await page.goto(url);
  const field=card(page).getByLabel('Kommentar till rektor');
  await field.fill(marker);
  m.failNext('tjanst/egen/kommando','lost');
  m.holdNext('tjanst/egen/status');
  await card(page).getByRole('button',{name:'Skicka kommentar'}).click();
  await expect(card(page).getByText('Svaret uteblev. Vi kontrollerar om ändringen sparades.')).toBeVisible();
  await expect(card(page).getByRole('button',{name:'Sparar…'})).toBeDisabled();
  const stored=await page.evaluate(()=>Object.entries(sessionStorage));
  expect(stored.some(([k])=>k.startsWith('tjanst:'))).toBe(true);
  expect(JSON.stringify(stored)).not.toContain('SYNTETISKKOMMENTAR');
  m.release();
  await expect(card(page).getByText('Kommentaren är skickad till rektor.')).toBeVisible();
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')))).toEqual([]);
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/egen/status').map(b=>Object.keys(b.body.command).sort())).toEqual([['action','commandId','family','target']]);
  // Utan kvitto: texten står kvar och inget skickas om automatiskt.
  await field.fill('Andra kommentaren');
  m.failNext('tjanst/egen/kommando','abort');
  await card(page).getByRole('button',{name:'Skicka kommentar'}).click();
  await expect(card(page).getByText('Ändringen sparades inte. Dina uppgifter finns kvar i formuläret.')).toBeVisible();
  await expect(field).toHaveValue('Andra kommentaren');
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/egen/kommando')).toHaveLength(2);
  expect(JSON.stringify(await page.evaluate(()=>Object.entries(sessionStorage)))).not.toContain('Andra kommentaren');
 });

 test('Min tjänst error: 403 vid kommentar behåller texten och nätverksfel vid läsning ger Hämta igen',async({page})=>{
  const m=await mock(page,{role:'self'});
  m.failNext('tjanst/egen/lasa','abort');
  await page.goto(url);
  await expect(page.getByText('Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.')).toBeVisible();
  await page.getByRole('button',{name:'Hämta din tjänst igen'}).click();
  await expect(card(page)).toBeVisible();
  const field=card(page).getByLabel('Kommentar till rektor');
  await field.fill('Fråga om VT');
  m.failNext('tjanst/egen/kommando',{status:403,json:{code:'forbidden',correlationId:'syntetisk-ref-4'}});
  await card(page).getByRole('button',{name:'Skicka kommentar'}).click();
  await expect(card(page).getByText('Ditt aktuella uppdrag tillåter inte ändringen. Referens: syntetisk-ref-4')).toBeVisible();
  await expect(field).toHaveValue('Fråga om VT');
  expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')))).toEqual([]);
 });

 test('Min tjänst empty: ingen publicerad version och konto utan personkoppling har egna texter',async({page})=>{
  const m=await mock(page,{role:'self',data:'tom'});
  await page.goto(url);
  await expect(page.getByRole('heading',{name:'Ingen publicerad tjänst ännu'})).toBeVisible();
  await expect(page.getByText('Rektor har inte publicerat tjänstefördelningen för läsåret 26/27. Du ser din tjänst här när den är publicerad.')).toBeVisible();
  await expect(page.locator('.min-tjanst-card')).toHaveCount(0);
  expect(m.errors).toEqual([]);
  const n=await mock(page,{role:'self',data:'obunden'});
  await page.reload();
  await expect(page.getByText('Ditt konto är inte kopplat till någon personal. Kontakta huvudmannen.')).toBeVisible();
  await expect(page.locator('.min-tjanst-card')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Hämta din tjänst igen'})).toHaveCount(0);
  expect(n.requests.filter(p=>p.startsWith('/api/elever'))).toEqual([]);
 });

 test('Min tjänst loading: Hämtar din tjänst… och knapparna är inaktiva under sparning',async({page})=>{
  const m=await mock(page,{role:'self'});
  m.holdNext('tjanst/egen/lasa');
  await page.goto(url);
  await expect(page.getByText('Hämtar din tjänst…')).toBeVisible();
  m.release();
  await expect(card(page)).toBeVisible();
  await card(page).getByLabel('Kommentar till rektor').fill('Kort fråga');
  m.holdNext('tjanst/egen/kommando');
  await card(page).getByRole('button',{name:'Kvittera att jag har läst'}).click();
  await expect(card(page).getByRole('button',{name:'Sparar…'})).toBeDisabled();
  await expect(card(page).getByRole('button',{name:'Skicka kommentar'})).toBeDisabled();
  await expect(card(page).getByLabel('Kommentar till rektor')).toBeDisabled();
  m.release();
  await expect(card(page).getByText('Du har kvitterat version 2.')).toBeVisible();
  await expect(card(page).getByLabel('Kommentar till rektor')).toHaveValue('Kort fråga');
 });

 test('Min tjänst overflow: korten ersätter tabeller på telefon utan sidledsrullning',async({page},info)=>{
  await mock(page,{role:'self',data:'lang'});
  await page.goto(url);
  await expect(card(page)).toBeVisible();
  const table=card(page).locator('table.tjanst-wide').first(),cards=card(page).locator('ul.tjanst-cards').first();
  if(phone(info)){await expect(table).toBeHidden();await expect(cards).toBeVisible();await expect(cards).toContainText('HT 50 h · VT 0 h');}
  else{await expect(table).toBeVisible();await expect(cards).toBeHidden();}
  await noOverflow(page);
 });
});

test.describe('Mandat',()=>{
 test('Egen tjänst i tilldelningsdialogen: person från skolans personal, scopeKind self och staffPersonId utan grupper',async({page})=>{
  const m=await mock(page,{role:'rektor'});
  await page.goto(url+'?vy=mandat');
  await expect(page.getByText('Egen tjänst · Syntetiska gymnasiet')).toBeVisible();
  await page.getByRole('button',{name:'Tilldela uppdrag'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Uppdrag').selectOption('larare');
  await dialog.getByLabel('Mottagare').selectOption(id(970));
  await dialog.getByLabel('Omfattning').selectOption('self');
  await expect(dialog.getByText('Läraren ser bara sin publicerade tjänst på skolan i Min tjänst. Uppdraget ger inga grupper och inga elever.')).toBeVisible();
  await dialog.getByRole('button',{name:'Tilldela uppdraget'}).click();
  await expect(dialog.getByText('Välj skola.')).toBeVisible();
  await dialog.getByLabel(SCHOOL_A).check();
  const person=dialog.getByLabel('Person i personalen');
  await expect(person.locator('option')).toHaveText(['Välj person','Anna Andersson','Bertil Berg','Cecilia Dahl']);
  await dialog.getByRole('button',{name:'Tilldela uppdraget'}).click();
  await expect(dialog.getByText('Välj person.')).toBeVisible();
  await person.selectOption(P.bertil);
  await dialog.getByRole('button',{name:'Tilldela uppdraget'}).click();
  await expect(dialog).toHaveCount(0);
  const grant=m.bodies.filter(b=>b.path==='/api/kund/mandat'&&b.body&&b.body.membershipId);
  expect(grant).toHaveLength(1);
  expect(grant[0].body).toMatchObject({membershipId:id(970),function:'larare',scopeKind:'self',unitIds:[A],groups:[],pupilIds:[],caseIds:[],staffPersonId:P.bertil});
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/personal/lasa').map(b=>b.body)).toEqual([{unitId:A}]);
 });
});

test.describe('Personal',()=>{
 async function openPerson(page:Page,name:string){await page.getByRole('button',{name,exact:true}).first().click();await expect(heading(page,name)).toBeFocused();}
 test('Andelsdialog populated: 60 % + 40 % sparas och Fördelat uppdateras',async({page},info)=>{
  desktopOnly(info);
  const m=await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await openPerson(page,'Anna Andersson');
  await page.getByRole('button',{name:'Fördela på skolor'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByText('Fördelat: 60 av 100 %')).toBeVisible();
  await dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`).fill('40');
  await expect(dialog.getByText('Fördelat: 100 av 100 %')).toBeVisible();
  await expect(dialog.locator('.field-error')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Spara andelarna'}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(`Andelarna är sparade: ${SCHOOL_B} 40 %, ${SCHOOL_A} 60 %.`)).toBeVisible();
  const sent=m.bodies.filter(b=>b.path==='/api/tjanst/personal/kommando');
  expect(sent).toHaveLength(1);expect(sent[0].body).toMatchObject({action:'save_duties',expectedRevision:3,payload:{personId:P.anna,employmentId:id(810)}});
  expect(sent[0].body.payload.duties.map((d:any)=>[d.unitId,d.percent]).sort()).toEqual([[A,60],[B,40]].sort());
  await expect(page.getByText('Fördelat: 100 av 100 %')).toBeVisible();
 });

 test('Andelsdialog error: 60 % + 50 % ger fältfel under skrivning och samma text när servern nekar',async({page},info)=>{
  desktopOnly(info);
  const m=await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await openPerson(page,'Anna Andersson');
  await page.getByRole('button',{name:'Fördela på skolor'}).click();
  const dialog=page.getByRole('dialog'),text='Andelarna blir 110 %, men tjänstgöringsgraden är 100 %. Minska någon andel.';
  await dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`).fill('50');
  await expect(dialog.getByText('Fördelat: 110 av 100 %')).toBeVisible();
  await expect(dialog.getByText(text)).toBeVisible();
  await expect(dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`)).toHaveAttribute('aria-invalid','true');
  const save=dialog.getByRole('button',{name:'Spara andelarna'});
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dialog.getByRole('alert').filter({hasText:text})).toBeVisible();
  await expect(dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`)).toHaveValue('50');
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/personal/kommando')).toHaveLength(1);
  expect(m.people.find(p=>p.id===P.anna)!.employments[0].duties).toHaveLength(1);
 });

 test('Personal partial: person utan konto visar Inget konto, utkastlärare har märke och filtret behöver kompletteras',async({page})=>{
  await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await expect(heading(page,'Personal')).toBeVisible();
  const list=page.locator(phoneList(page));
  await expect(list).toContainText('Ny lärare · från Syntetiska gymnasiet');
  await expect(list.getByText('Inget konto')).toHaveCount(3);
  await page.getByLabel('Visa bara personer som behöver kompletteras').check();
  await expect(page.getByRole('button',{name:'Cecilia Dahl',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'David Ek',exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Anna Andersson',exact:true})).toHaveCount(0);
  await page.getByLabel('Visa bara personer som behöver kompletteras').uncheck();
  await openPerson(page,'Bertil Berg');
  await expect(page.getByText('Inget konto kopplat. Personen kan ändå få undervisning och uppdrag.')).toBeVisible();
  await expect(page.getByText('Tillgång till Min tjänst ges i Mandat.')).toBeVisible();
  await expect(page.getByText(`Personal-ID ${P.bertil}`)).toBeVisible();
  await noOverflow(page);
 });

 test('Personal empty: tom personallista och ingen träff har egna texter, sökordet hålls utanför adressen',async({page})=>{
  await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await page.getByLabel('Namn',{exact:true}).fill('Zlatan');
  await expect(page.getByText('Ingen person matchar sökningen.')).toBeVisible();
  expect(page.url()).not.toContain('Zlatan');
  await mock(page,{role:'huvudman',data:'tom'});
  await page.reload();
  await expect(page.getByRole('heading',{name:'Inga personer är upplagda ännu.'})).toBeVisible();
 });

 test('Personal MFA: andelsändring utan engångskod ger rutan med personaltexten och inmatningen står kvar',async({page},info)=>{
  desktopOnly(info);
  await mock(page,{role:'huvudman',mfa:true});
  await page.goto(url+'?vy=personal');
  await openPerson(page,'Anna Andersson');
  await page.getByRole('button',{name:'Fördela på skolor'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`).fill('40');
  await dialog.getByRole('button',{name:'Spara andelarna'}).click();
  await expect(dialog.getByText('Att ändra personaluppgifter kräver verifiering med engångskod.')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Verifiera med engångskod'})).toBeVisible();
  await expect(dialog.getByLabel(`Andel (%) på ${SCHOOL_B}`)).toHaveValue('40');
 });

 test('Personal personkortet fokuserar sin h1 och Tillbaka återför fokus till namnknappen',async({page})=>{
  await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await openPerson(page,'Anna Andersson');
  await expect(page.getByText('SYN-0001 (källa: syntetisk-källa)')).toBeVisible();
  await page.getByRole('button',{name:'Tillbaka till personallistan'}).click();
  await expect(heading(page,'Personal')).toBeVisible();
  await expect(page.locator('[data-person-button]:focus')).toHaveText('Anna Andersson');
  await expect(page.locator('[data-person-button]:focus')).toBeVisible();
  await openPerson(page,'Anna Andersson');
  await page.goBack();
  await expect(heading(page,'Personal')).toBeVisible();
 });

 test('Personal och Bemanning på telefon: läsbara kort utan Lägg till, Ändra och Fördela',async({page},info)=>{
  test.skip(!phone(info),'Telefonprov.');
  await mock(page,{role:'huvudman'});
  await page.goto(url+'?vy=personal');
  await expect(page.locator('ul.tjanst-cards')).toBeVisible();
  await expect(page.getByRole('button',{name:'Lägg till person'})).toHaveCount(0);
  await openPerson(page,'Anna Andersson');
  for(const name of ['Ändra uppgifter','Ändra anställningen','Lägg till anställning','Fördela på skolor'])await expect(page.getByRole('button',{name})).toHaveCount(0);
  await noOverflow(page);
  await page.goto(url+'?vy=bemanning');
  await expect(page.locator('.bemanning ul.tjanst-cards')).toBeVisible();
  await noOverflow(page);
 });
});
function phoneList(page:Page){return (page.viewportSize()?.width??1440)<=800?'ul.tjanst-cards':'table.personal-table';}

test.describe('Bemanning',()=>{
 test('Bemanning partial: ej fördelad tid bara för kopplade klasser och okopplade klasser i Koppling saknas',async({page},info)=>{
  const m=await mock(page,{role:'huvudman'});
  await page.goto(url);
  const items=await navItems(page,info);
  expect(items.indexOf('Personal')).toBe(items.indexOf('Skolor')+1);
  expect(items).toContain('Bemanning');
  await page.locator('.nav-button:visible',{hasText:'Bemanning'}).click();
  await expect(heading(page,'Bemanning')).toBeVisible();
  await expect(page.getByLabel('Planeringsskola')).toBeDisabled();
  await expect(page.getByLabel('Planeringsskola')).toHaveValue('all');
  const scope=page.locator('table.bemanning-table');
  if(phone(info)){
   const a=page.locator('.bemanning ul.tjanst-cards li').filter({hasText:SCHOOL_A});
   await expect(a).toContainText('Ej fördelad tid 100 h');await expect(a).toContainText('Koppling saknas: 1 klass');await expect(a).toContainText('Vakant tid 72 h');
  }else{
   const a=scope.getByRole('row').filter({hasText:SCHOOL_A}),b=scope.getByRole('row').filter({hasText:SCHOOL_B});
   await expect(a.getByRole('cell').nth(4)).toHaveText('100 h');await expect(a.getByRole('cell').nth(5)).toHaveText('1 klass');await expect(a.getByRole('cell').nth(3)).toHaveText('72 h');
   await expect(b).toContainText('Ingen publicerad version');
   await page.getByRole('button',{name:'HT',exact:true}).click();
   await expect(a.getByRole('cell').nth(4)).toHaveText('25 h');
  }
  await expect(page.getByText('Ej fördelad tid räknas bara på klasser med timplan.',{exact:false})).toBeVisible();
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/bemanning/lasa').map(b=>b.body)).toEqual([{schoolYear:YEAR}]);
  await noOverflow(page);
 });

 test('Bemanning empty: ingen skola med fördelning har egen text',async({page})=>{
  await mock(page,{role:'huvudman',data:'tom'});
  await page.goto(url+'?vy=bemanning');
  await expect(page.getByText('Ingen skola har en tjänstefördelning för läsåret 26/27 ännu.')).toBeVisible();
 });

 test('Bemanning Visa fördelningen är skrivskyddad och öppnar den publicerade versionen trots rektors utkast (WR-07)',async({page},info)=>{
  const m=await mock(page,{role:'huvudman',data:'utkast'});
  await page.goto(url+'?vy=bemanning');
  // Skola B saknar publicerad version: raden visar texten men har ingen knapp.
  const rowB=phone(info)?page.locator('.bemanning ul.tjanst-cards li').filter({hasText:SCHOOL_B}):page.locator('table.bemanning-table').getByRole('row').filter({hasText:SCHOOL_B});
  await expect(rowB).toContainText('Ingen publicerad version');
  // 05.1-26: publiceringsdatumet bryts inte vid bindestrecket.
  const rowA=phone(info)?page.locator('.bemanning ul.tjanst-cards li').filter({hasText:SCHOOL_A}):page.locator('table.bemanning-table').getByRole('row').filter({hasText:SCHOOL_A});
  await expect(rowA.locator('.tjanst-nowrap')).toHaveText(/^\d{4}-\d\d-\d\d$/u);await expect(rowA.locator('.tjanst-nowrap')).toHaveCSS('white-space','nowrap');
  await expect(page.getByRole('button',{name:`Visa fördelningen för ${SCHOOL_B}`})).toHaveCount(0);
  await page.getByRole('button',{name:`Visa fördelningen för ${SCHOOL_A}`}).locator('visible=true').click();
  await expect(heading(page,'Tjänstefördelning')).toBeVisible();
  await expect(page.getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);
  await expect(page.locator('.tjanst').getByText('Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning.').first()).toBeVisible();
  for(const name of ['Fastställ och publicera','Ändra i ny version','Lägg till lärare i fördelningen','Lägg till specialuppdrag','Hämta aktuellt läge'])
   await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/plan/lasa').map(b=>b.body)).toEqual([{unitId:A,schoolYear:YEAR,versionId:id(605)}]);
  await expect(page.locator('.tjanst-readonly')).toHaveText('Du läser version 2 skrivskyddat, publicerad 2026-09-01 av Rektor Syntetisk. Lärarna ser den här versionen.');
  await noOverflow(page);
  // De publicerade summorna (50 + 50 h), inte utkastets (20 + 20 h).
  if(phone(info))await expect(page.locator('.tjanst dl.tjanst-facts')).toContainText('UndervisningHT 50 h · VT 50 h · Läsår 100 h');
  else await expect(page.locator('[data-sum="Undervisning:Anna Andersson"]')).toHaveText('100 h');
  const select=page.locator('.tjanst').getByLabel('Historisk publicering');
  await expect(select).toHaveValue(id(605));
  expect(await select.locator('option').allInnerTexts()).toEqual(['Version 2 · publicerad 2026-09-01','Version 1 · publicerad 2026-06-15']);
  await select.selectOption(id(604));
  await expect(page.locator('.tjanst-readonly')).toHaveText('Du läser version 1 skrivskyddat, publicerad 2026-06-15 av Rektor Syntetisk. Lärarna ser version 2.');
  expect(m.bodies.filter(b=>b.path==='/api/tjanst/plan/lasa').map(b=>b.body.versionId)).toEqual([id(605),id(604)]);
  expect(m.requests.filter(p=>/kommando|publicera/u.test(p))).toEqual([]);
  await page.getByRole('button',{name:'Tillbaka till bemanningen'}).click();
  await expect(page.getByRole('button',{name:`Visa fördelningen för ${SCHOOL_A}`}).locator('visible=true')).toBeFocused();
  await noOverflow(page);
 });
});
