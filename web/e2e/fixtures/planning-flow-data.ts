// Simulated API replies; actual ProtectedHome, workspaces, parsers, navigation and decision UI.
// This suite is not evidence of Worker, SQL, real identity or completed APL.
import {expect,type Page} from '@playwright/test';
import {parseGymTimplan,type GymTimplan} from '../../lib/gym-timplan';
import {aplContentHash,type AplReadReply} from '../../lib/apl-plan';
import {type PlanningSelection,type PlanningRow} from '../../lib/planning-year-contract';
export const id=(n:number)=>`5a180000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const rowKey='programmeSpecific:PEDG:1:PEDG1000X',sha=`sha256:${'b'.repeat(64)}`;
const base='/e2e/fixtures/apl-plan-preview.html';
export const location=(process='timplaner',plan=true)=>`${base}?vy=${process}${plan?`&timplan=${id(1)}&timplansskola=${id(3)}&timplansutbildning=${id(2)}&timplansversion=2`:''}&planeringslasar=2027&planeringsskola=${id(3)}&planeringsform=gymnasium&planeringsallaar=1`;
export function gym(vocational=true,status='faststalld'):GymTimplan {
 const common={id:id(vocational?1:11),offeringId:id(vocational?2:12),unitId:id(3),schoolName:'Exempelskolan Nord',version:2,revision:7,status,
  series:{id:id(vocational?20:21),name:vocational?'BF27A – pedagogik':'SA27A – grundfördelning',revision:0},nameAtCreation:'Syntetisk plan',
  source:{planId:id(vocational?4:14),offeringId:id(vocational?2:12),version:1,revision:0,status:'faststalld',catalogId:`sha256:${'a'.repeat(64)}`,startedOn:'2027-08-01',educationRevision:0,
   education:{name:vocational?'Barn- och fritidsprogrammet':'Samhällsvetenskapsprogrammet',cohort:'2027–2030',programCode:vocational?'BF25':'SA25',orientationCode:null}},
  currentSource:{planId:id(vocational?4:14),version:1,revision:0,status:'faststalld'},sourceChanged:false,archived:false,canPlan:status==='utkast',
  rows:[{key:rowKey,name:'Pedagogik',levelName:'Nivå 1',points:100,part:'programmeSpecific',pointTerms:[50,50,0,0,0,0],rowKind:'fixed'}]};
 return parseGymTimplan(vocational?{...common,timeModel:'school_terms_annual_apl_v2',timeRows:{[rowKey]:{schoolMinutes:[1200,1200,null,null,null,null],annualAplMinutes:[3600,null,null]}},timeCopyReview:[]}:{...common,hours:{[rowKey]:[50,50,null,null,null,null]}},common.id);
}
export async function mock(page:Page,options:{draft?:boolean;blocker?:boolean;role?:'rektor'|'huvudman';gym?:GymTimplan}={}){
 const plans=[options.gym??gym(true,options.draft?'utkast':'faststalld'),gym(false)],writes:unknown[]=[],reads:string[]=[],errors:string[]=[],unexpected:string[]=[];
 const context={assignmentId:id(6),membershipId:id(7),customerId:id(8),customerName:'Exempelhuvudman',organizerId:id(5),organizerName:'Exempelhuvudman',unitId:null,unitName:null,function:options.role??'rektor',label:options.role==='huvudman'?'Huvudman':'Rektor',blocked:false,valid:true};
 const assignment={...context,id:id(6),validFrom:'2026-01-01',validTo:null,endedAt:null,membershipStatus:'active',state:'giltigt'};
 page.on('pageerror',e=>errors.push(e.message));
 const program={code:'BF25',version:1,category:'VOCATIONAL_PROGRAM',startDate:'2025-07-01',endDate:null,canceledDate:null,sourceSupported:true};
 const read=async(p:GymTimplan):Promise<AplReadReply>=>({contractVersion:'structured_v1',revisionScope:'apl',timplanRevision:p.revision,planId:p.id,revision:3,organizerId:id(5),program,plan:null,copyReview:[],contentHash:await aplContentHash({organizerId:id(5),plan:p,program,copyReview:[]},null),confirmations:[],reviews:[],capabilities:{canSave:p.status==='faststalld',canConfirm:p.status==='faststalld',canReview:false}});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().method()==='POST'?route.request().postDataJSON():{};reads.push(path);let json:unknown;
  if(path==='/api/session')json={identity:{issuer:'synthetic-flow',subject:'synthetic-rektor',displayName:'Rektor Exempel',email:null},assignments:[assignment],assignmentGroups:{valid:[assignment],upcoming:[],ended:[]},context,today:'2026-10-18',mfa:{acr:null,amr:[],authTime:null,proof:false},epoch:1,expiresAt:'2099-01-01T00:00:00Z',correlationId:'synthetic-flow'};
  else if(path==='/api/planering/urval')json={customerId:id(8),serverDate:'2026-10-18',currentYear:2026,minimumYear:2000,maximumYear:2100,units:[{unitId:id(3),schoolName:'Exempelskolan Nord',canRead:{programplan:true,gymnasium:true,grundskola:false,introduktionsprogram:false}}]};
  else if(path==='/api/elever/urval')json={scope:{schools:[{id:id(3),name:'Exempelskolan Nord'}],groups:[],cases:[]},schoolYears:[2026,2027,2028],currentSchoolYear:2026,endsAt:null,approverName:null,purposeCode:null,serverNow:'2026-10-18T10:00:00Z'};
  else if(path==='/api/planbeslut/inkorg')json={items:[],total:0,actionCount:0,decisionCount:0,truncated:false};
  else if(path==='/api/timplaner/gym/lasa')json=plans.find(p=>p.id===body.planId);
  else if(path==='/api/timplaner/gym/apl/lasa')json=await read(plans.find(p=>p.id===body.planId)!);
  else if(path==='/api/planbeslut/underlag') {const p=plans.find(p=>p.id===body.planId)!;json={contractVersion:'timetable_decision_v2',apl:null,kind:'timplan',planId:p.id,unitId:p.unitId,offeringId:p.offeringId,educationName:p.source.education.name,schoolName:p.schoolName,series:p.series,version:p.version,revision:p.revision,decisionRevision:0,stage:options.draft?'draft':'approved',nextActor:options.draft?'rektor':null,basisHash:sha,actions:options.draft?['submit']:[],blockers:options.blocker?['Timplanen behöver ytterligare 50 undervisningstimmar.']:[],checks:[{id:'teacher-led',label:'Undervisningstiden är granskad'},{id:'apl-budget',label:'Årsramen för APL är granskad'}],history:[],sourceInfo:'Programplan version 1'};}
  else if(path==='/api/planering/lista'){
   const selection=body as PlanningSelection;
   const rows:PlanningRow[]=plans.map(p=>({customerId:id(8),unitId:p.unitId,offeringId:p.offeringId,schoolName:p.schoolName,educationName:p.source.education.name,cohort:'2027–2030',schoolform:'gymnasium',plan:{id:p.id,version:p.version,revision:p.revision,status:p.status},series:p.series,source:{planId:p.source.planId,offeringId:p.offeringId,version:1,revision:0},start:{provenance:'timplan-source',startedOn:'2027-08-01',academicYear:2027,legacyYear:null},relativeYear:1,relation:'new',underlag:'planning',archived:false,columnMap:null,application:null,classes:[],cells:[{rowKey,points:100,pointTerms:[50,50,0,0,0,0],hourValues:[50,50,null,null,null,null]}],diagnostics:[],searchDetails:{localCode:null,programCode:p.source.education.programCode,orientationCode:null,programName:p.source.education.name,orientationName:null}}));
   json={selection,selectionRevision:sha,count:rows.length,pageSize:50,rows};
  } else {writes.push(body);unexpected.push(path);return route.fulfill({status:500,json:{code:'unexpected'}});}
  await route.fulfill({json,headers:{'X-Context-Epoch':'1'}});
 });
 return {plans,reads,writes,verify(){expect(errors).toEqual([]);expect(unexpected).toEqual([]);expect(writes).toEqual([]);}};
}
