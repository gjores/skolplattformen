import test from 'node:test';
import assert from 'node:assert/strict';
import { aplContentHash, projectAplPlan } from '../apl-plan.ts';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { defaultProgramplanChoiceBlocks } from '../programplan-choice-blocks.ts';
import { programFrame } from '../programplan-table.ts';
import { programplanProfile, VOCATIONAL_GY25_CODES } from '../programplan-profile.ts';
import { programplanLevelRanks, programplanTermRows, suggestProgramplanTerms } from '../programplan-terms.ts';

const id='55402000-0000-4000-8000-000000000001',unit='55402000-0000-4000-8000-000000000002',offering='55402000-0000-4000-8000-000000000003',planId='55402000-0000-4000-8000-000000000004';
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
const artifact=JSON.parse(await readFile(new URL('../programplan-catalog.generated.json',import.meta.url),'utf8'));
const program=artifact.programs.find(program=>program.code==='SA25'),orientationCode='SABEP';
const blocks=defaultProgramplanChoiceBlocks(program,orientationCode);
blocks.push({id:'fordj',name:'Programfördjupning',kind:'specialization',points:programFrame(program,orientationCode).specializationRoom});
const basis={catalogId:artifact.catalogId,programRef:{code:program.code,version:program.version},orientationCode,startedOn:'2027-08-01',specializationRefs:[],choiceBlocks:blocks};
const termRows=programplanTermRows(program,basis),distribution=suggestProgramplanTerms(termRows,[],programplanLevelRanks(program));
let state;
const fixture=globalThis.__planDecisionTest={
  env:{APP_MODE:'protected',DATABASE_URL:'postgres://synthetic@127.0.0.1:56322/postgres',SUPABASE_URL:'http://127.0.0.1:56321',OIDC_ISSUER:issuer,OIDC_CLIENT_ID:clientId,MFA_MAX_AGE_SECONDS:'28800',SESSION_SECRET:'synthetic-gym-only'},
  session(){const future=new Date(Date.now()+60000);return{session:{id,identityId:id,membershipId:id,assignmentId:id,customerId:id,expiresAt:future,absoluteExpiresAt:future,epoch:1}};},
  async login(_corr,fn){return fn(fixture.tx);},
  async context(_ctx,fn){const events=state.events.length,mutations=state.mutations.length;try{return await fn(fixture.tx,{sessionId:id,identityId:id,membershipId:id,assignmentId:id,customerId:id,organizerId:id,identity:{issuer,subject:'synthetic'},correlationId:id,accessFunction:state.fn,epoch:1,
    mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:state.mfa?'2':'1',amr:state.mfa?['pwd','otp']:['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date()}});}catch(error){state.events.length=events;state.mutations.length=mutations;throw error;}},
  tx:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('select i.auth_user_id'))return[{function:state.fn}];
    if(sql.includes('insert into public.security_events')){if(state.auditFails)throw new Error('private audit failure');state.events.push({action:values[8],objectType:values[9],objectId:values[10],outcome:values[11],details:values[12]});return[];}
    state.calls.push({sql,values});if(state.sqlError)throw state.sqlError;
    if(sql.includes('phase5_plan_decision_basis'))return[{result:envelope(state.basis)}];
    if(sql.includes('phase5_plan_decision_page'))return[{result:state.page}];
    if(sql.includes('phase5_plan_decision_inbox'))return[{result:state.inbox}];
    if(sql.includes('phase5_plan_decision_command')){state.mutations.push(values);return[{result:envelope(state.reply)}];}
    throw new Error('Unexpected synthetic query');
  },
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;
  if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__planDecisionTest.login(...a);export const withSessionContext=(...a)=>globalThis.__planDecisionTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__planDecisionTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__planDecisionTest.env;';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {POST:read}=await import('../../app/api/planbeslut/underlag/route.ts');
const {POST:change}=await import('../../app/api/planbeslut/andra/route.ts');
const {GET:inbox}=await import('../../app/api/planbeslut/inkorg/route.ts');
const rawSource=()=>({planId:id,offeringId:offering,version:1,revision:3,status:'utkast',catalogId:artifact.catalogId,basisReference:structuredClone(basis),distribution:structuredClone(distribution),
 rows:termRows.map(row=>({key:row.key,points:row.points})),educationRevision:2,education:{name:'Syntetisk SA',cohort:'27/28',programCode:program.code,orientationCode},archived:false});
const catalog=()=>{const{catalogId:_catalogId,...payload}=structuredClone(artifact);return payload;};
const detail=()=>({contractVersion:'apl_decision_v1',apl:null,series:null,kind:'programplan',planId:id,offeringId:offering,unitId:null,educationName:'Syntetisk SA',schoolName:null,version:1,stage:'draft',nextActor:'rektor',revision:3,decisionRevision:0,basisHash:`sha256:${'a'.repeat(64)}`,actions:['submit'],blockers:[],checks:[{id:'structure',label:'Granska struktur'},{id:'choices',label:'Granska val'}],history:[],sourceInfo:null,source:rawSource(),catalog:catalog(),hours:[]});
const command=()=>({kind:'programplan',planId:id,commandId:planId,action:'submit',expectedRevision:3,expectedDecisionRevision:0,basisHash:`sha256:${'a'.repeat(64)}`,comment:'',confirmedChecks:['structure','choices']});
function reset(){const b=detail();state={fn:'rektor',mfa:true,basis:b,reply:{...structuredClone(b),stage:'submitted',nextActor:'huvudman',decisionRevision:1,actions:['withdraw']},inbox:{items:[],actionCount:0,decisionCount:0,total:0,truncated:false},events:[],calls:[],mutations:[]};}
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/planbeslut/${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
const { projectAplFrozenBasis } = await import('./apl-plan.ts');
const { projectPlanDecision } = await import('./plan-decision.ts');
const authority = () => ({identityId:id,assignmentId:id,organizerId:id,accessFunction:state.fn});
function envelope(result){return state.envelopeOverride ?? {contractVersion:'apl_decision_sql_v1',resultContract:state.legacy?'legacy':'apl_decision_v1',replayed:!!(state.legacy||state.replayed),result,aplBasis:state.aplBasis??null};}
async function attachApl(result,{legacy=false,confirm=true}={}){
 const source=structuredClone(result.source), status={draft:'utkast',submitted:'forslag',returned:'atersand',approved:'faststalld',replaced:'ersatt'}[result.stage];
 const editable=['utkast','atersand'].includes(status), canSave=editable&&state.fn!=='huvudman';
 const basis={organizerId:id,copyReview:[],gymTimplan:{id:planId,offeringId:offering,unitId:unit,schoolName:result.schoolName,version:result.version,revision:result.revision,status,source,catalog:structuredClone(result.catalog),
  currentSource:{planId:source.planId,version:source.version,revision:source.revision,status:source.status},currentSourceBasis:structuredClone(source),
  hours:Object.fromEntries(result.hours.map(r=>[r.rowKey,structuredClone(r.hours)])),canPlan:canSave,archived:false,series:structuredClone(result.series),nameAtCreation:result.series.name}};
 const {context}=await projectAplFrozenBasis(basis,planId);
 let remaining=20700;const allocations=[];
 for(const row of context.plan.rows)if(row.rowKind==='fixed'&&!row.key.startsWith('meta:'))for(let termIndex=0;termIndex<2;termIndex++){
  const capacity=(context.plan.hours[row.key]?.[termIndex]??0)*60, gutMinutes=Math.min(capacity,remaining);
  if(row.pointTerms[termIndex]>0&&gutMinutes>0){allocations.push({rowKey:row.key,termIndex,gutMinutes});remaining-=gutMinutes;}
 }
 assert.equal(remaining,0,'synthetic first-year capacity');
 const plan=legacy?null:{contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[{
  id:'55402000-0000-4000-8000-000000000099',name:'Syntetisk APL',startsOn:'2027-08-02',endsOn:'2028-06-30',schoolYear:2027,
  extent:{basis:'whole_weeks',weeks:15,reviewed:true,reviewNote:'Syntetiskt veckounderlag granskat.'},
  contents:[...new Set(allocations.map(a=>a.rowKey))].map(rowKey=>({rowKey,description:'Arbetsmoment'})),allocations}]};
 const contentHash=await aplContentHash(context,plan), confirmations=confirm&&!legacy?[{id:'55402000-0000-4000-8000-000000000098',planId,unitId:unit,actorId:id,assignmentId:id,actorName:'Syntetisk rektor',at:'2026-10-16T12:00:00.000Z',revision:result.revision-1,contentHash,comment:''}]:[];
 const detail={contractVersion:'structured_v1',planId,revision:result.revision,organizerId:id,program:context.program,plan,copyReview:[],contentHash,confirmations,
  capabilities:{canSave,canConfirm:editable&&state.fn==='rektor'}};
 const blockers=projectAplPlan(context,plan).issues.filter(i=>i.level==='blocker').map(i=>i.message);
 if(!confirm||legacy)blockers.push('Rektor behöver bekräfta APL-förläggningen för det aktuella innehållet.');
 result.apl={detail,blockers,currentConfirmationId:confirmations.at(-1)?.id??null,ready:blockers.length===0};
 result.blockers=['approved','replaced'].includes(result.stage)?[]:[...blockers];
 state.aplBasis=basis;return context;
}
test('activated decision projection rejects omitted series metadata',async()=>{
 reset();delete state.basis.series;assert.equal((await read(request('underlag',{kind:'programplan',planId:id}))).status,500);
 assert.equal(state.events.some(e=>e.outcome==='ok'),false);
});
test('legacy immutable decision replay preserves absent series and old history with explicit public marker',async()=>{
 reset();state.legacy=true;delete state.reply.contractVersion;delete state.reply.apl;delete state.reply.series;state.reply.history=[{action:'submit',at:'2026-10-15T12:00:00Z',actorName:'Syntetisk rektor',comment:''}];
 const response=await change(request('andra',command()));assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.contractVersion,'legacy');assert.equal(Object.hasOwn(body,'series'),false);assert.equal(Object.hasOwn(body,'apl'),false);assert.deepEqual(body.history,state.reply.history);
});
test('all planning roles read strictly projected and audited decision data without MFA',async()=>{
 for(const fn of ['huvudman','rektor','administrator']){
  reset();state.fn=fn;state.mfa=false;let response=await read(request('underlag',{kind:'programplan',planId:id}));assert.equal(response.status,200);const body=await response.json();assert.deepEqual(body.blockers,[]);assert.equal(body.source,undefined);assert.equal(body.catalog,undefined);assert.equal(state.events[0].action,'plan_decision_basis_read');
  response=await inbox(request('inkorg'));assert.equal(response.status,200);assert.equal(state.events[1].objectType,'plan_decision_collection');
 }
});
test('decision writes require MFA and allowed route role before SQL',async()=>{
 for(const patch of [{mfa:false},{fn:'larare'}]){reset();Object.assign(state,patch);const response=await change(request('andra',command()));assert.equal(response.status,403);assert.equal(state.calls.length,0);assert.equal(state.mutations.length,0);}
});
test('command enforces contract and CSRF before SQL',async()=>{
 for(const input of [{...command(),action:'return',comment:'  '},{...command(),confirmedChecks:['structure','structure']},{...command(),expectedRevision:-1},{...command(),unexpected:true}]){
  reset();assert.equal((await change(request('andra',input))).status,400);assert.equal(state.calls.length,0);
 }
 reset();assert.equal((await change(request('andra',command(),'https://outside.invalid'))).status,403);assert.equal(state.calls.length,0);
});
test('valid persisted decision commits exactly one minimal audit; comments stay out of audit',async()=>{
 reset();const response=await change(request('andra',{...command(),comment:'Syntetisk privat kommentar'}));assert.equal(response.status,200);assert.equal(state.mutations.length,1);assert.equal(state.events.length,1);assert.equal(state.events[0].action,'plan_decision_command');assert.ok(!JSON.stringify(state.events).includes('privat'));
});
test('independent source validation blocks incomplete stored plans even if SQL says ready',async()=>{
 reset();state.reply.source.distribution=[];const response=await change(request('andra',command()));assert.equal(response.status,409);assert.equal(state.mutations.length,0);assert.equal(state.events.filter(e=>e.outcome==='success').length,0);
});
test('bad catalog or result identity rolls back the decision and rejects projection',async()=>{
 for(const tamper of [r=>{r.catalog.source.fetched='2020-01-01';},r=>{r.planId=planId;},r=>{r.stage='approved';},r=>{r.decisionRevision=0;},r=>{r.checks=[];}]){
  reset();tamper(state.reply);assert.equal((await change(request('andra',command()))).status,500);assert.equal(state.mutations.length,0);
 }
});
test('missing final audit rolls back a valid decision',async()=>{
 reset();state.auditFails=true;assert.equal((await change(request('andra',command()))).status,500);assert.equal(state.mutations.length,0);assert.equal(state.events.length,0);
});
test('CAS, blocker and permission SQL failures are minimized and exposed correctly',async()=>{
 for(const[code,hint,status,expected]of[['40001','plan_decision_conflict',409,'plan_decision_conflict'],['40001','plan_decision_blocked',409,'plan_decision_blocked'],['42501','secret',403,'forbidden'],['55000','secret',500,'audit_unavailable']]){
  reset();state.sqlError={code,hint,message:'private exception'};const response=await change(request('andra',command()));assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,expected);assert.ok(!JSON.stringify(body).includes('private'));
 }
});
test('timplan submit requires complete positive rows and 2180 hours after independent projection',async()=>{
 const make=()=>{reset();const r=state.reply;r.series={id:unit,name:'Grundfördelning',revision:0};r.kind='timplan';r.planId=planId;r.unitId=unit;r.schoolName='Syntetisk skola';r.revision=4;r.checks=[{id:'teacher-led',label:'Undervisning'},{id:'choice-paths',label:'Val'}];r.hours=termRows.map(row=>{const d=distribution.find(d=>d.rowKey===row.key);return{rowKey:row.key,hours:d.points.map(p=>p>0?p:null)};});return{...command(),kind:'timplan',planId,confirmedChecks:['teacher-led','choice-paths']};};
 let input=make();assert.equal((await change(request('andra',input))).status,200);
 for(const missing of [null,0]){input=make();state.reply.hours[0].hours=state.reply.hours[0].hours.map(v=>v===null?null:missing);assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);}
 input=make();state.reply.hours.forEach(row=>{row.hours=row.hours.map(v=>v===null?null:1);});assert.equal((await change(request('andra',input))).status,409);
});

async function vocationalReply(code,kind='programplan',startedOn='2027-08-01'){
 reset();const p=artifact.programs.find(p=>p.code===code),orientation=p.orientations[0]?.code??null;
 const frame=programFrame(p,orientation),choiceBlocks=defaultProgramplanChoiceBlocks(p,orientation);
 if(frame.specializationRoom)choiceBlocks.push({id:'fordj',name:'Programfördjupning',kind:'specialization',points:frame.specializationRoom});
 const basisReference={catalogId:artifact.catalogId,programRef:{code,version:p.version},orientationCode:orientation,startedOn,specializationRefs:[],choiceBlocks};
 const rows=programplanTermRows(p,basisReference),distribution=suggestProgramplanTerms(rows,[],programplanLevelRanks(p));
 Object.assign(state.reply.source,{basisReference,distribution,rows:rows.map(r=>({key:r.key,points:r.points})),education:{name:'Syntetiskt yrkesprogram',cohort:'27/28',programCode:code,orientationCode:orientation}});
 state.reply.checks=[...(kind==='programplan'?['structure','choices']:['teacher-led','choice-paths']),'eligibility','apl'].map(id=>({id,label:id}));
 if(kind==='timplan'){
  Object.assign(state.reply,{series:{id:unit,name:'Grundfördelning',revision:0},kind,planId,unitId:unit,schoolName:'Syntetisk skola',revision:4});
  const count=distribution.reduce((n,row)=>n+row.points.filter(p=>p>0).length,0),total=programplanProfile(p).hours;
  let remainder=total%count;
  state.reply.hours=distribution.map(row=>({rowKey:row.rowKey,hours:row.points.map(p=>p>0?Math.floor(total/count)+(remainder-->0?1:0):null)}));
 }
 if(kind==='timplan')await attachApl(state.reply);
 return {...command(),kind,planId:kind==='timplan'?planId:id,confirmedChecks:state.reply.checks.map(c=>c.id)};
}
test('all twelve complete vocational programmes pass independent programme and exact minimum-hour decision checks',async()=>{
 for(const code of VOCATIONAL_GY25_CODES)for(const kind of ['programplan','timplan']){
  const input=await vocationalReply(code,kind);assert.equal((await change(request('andra',input))).status,200,`${code}/${kind}`);
 }
});
test('vocational decision rejects missing checks, one point/hour too little and incompatible dates',async()=>{
 for(const code of ['BF25','FR25']){
  let input=await vocationalReply(code);input.confirmedChecks.pop();assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
  input=await vocationalReply(code,'timplan');const hours=state.reply.hours[0].hours;hours[hours.findIndex(v=>v!==null)]--;await attachApl(state.reply);assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
  input=await vocationalReply(code);const source=state.reply.source,p=artifact.programs.find(p=>p.code===code);source.basisReference.choiceBlocks.find(b=>b.kind==='specialization').points--;
  const rows=programplanTermRows(p,source.basisReference);source.rows=rows.map(r=>({key:r.key,points:r.points}));source.distribution=suggestProgramplanTerms(rows,[],programplanLevelRanks(p));
  assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
  input=await vocationalReply(code,'programplan','2028-07-01');assert.equal((await change(request('andra',input))).status,200);
  input=await vocationalReply(code,'programplan','2028-07-02');assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
  input=await vocationalReply(code,'programplan','2025-06-30');assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
 }
});

test('decision search is audited, strictly bounded and rejects foreign origins/roles',async()=>{
 const {POST:search}=await import('../../app/api/planbeslut/lista/route.ts');
 const selection={query:'',kind:'all',stage:'all',tasks:'all',page:1};
 for(const fn of ['huvudman','rektor','administrator']){
  reset();state.fn=fn;state.mfa=false;state.page={selection,items:[],actionCount:0,decisionCount:0,total:0,count:0,pageSize:50};
  assert.equal((await search(request('lista',selection))).status,200);assert.equal(state.events.at(-1).action,'plan_decision_inbox_read');
 }
 for(const patch of [{page:0},{stage:'approved'},{tasks:'foreign'},{unitId:unit}]){reset();assert.equal((await search(request('lista',{...selection,...patch}))).status,400);assert.equal(state.calls.length,0);}
 reset();assert.equal((await search(request('lista',selection,'https://outside.invalid'))).status,403);assert.equal(state.calls.length,0);
 reset();state.fn='larare';assert.equal((await search(request('lista',selection))).status,403);assert.equal(state.calls.length,0);
 reset();state.page={selection,items:[],actionCount:0,decisionCount:0,total:1,count:1,pageSize:50};assert.equal((await search(request('lista',selection))).status,500);
 reset();state.auditFails=true;state.page={selection,items:[],actionCount:0,decisionCount:0,total:0,count:0,pageSize:50};assert.equal((await search(request('lista',selection))).status,500);
});

test('trusted legacy replay is distinct from a read or a newly executed decision',async()=>{
 for(const action of ['submit','approve']){
  reset();state.legacy=true;delete state.reply.contractVersion;delete state.reply.apl;delete state.reply.series;
  const input={...command(),action};if(action==='approve'){state.fn='huvudman';state.reply.stage='approved';state.reply.revision=4;state.reply.actions=[];}
  const before=structuredClone(state.reply),response=await change(request('andra',input));assert.equal(response.status,200);
  const body=await response.json(),{source:_source,catalog:_catalog,hours:_hours,...publicBefore}=before;
  assert.deepEqual(body,{...publicBefore,contractVersion:'legacy'});assert.deepEqual(state.reply,before);
 }
 for(const patch of [{replayed:false},{resultContract:'apl_decision_v1'},{aplBasis:{}}]){
  reset();state.legacy=true;delete state.reply.contractVersion;delete state.reply.apl;state.envelopeOverride={...envelope(state.reply),...patch};
  assert.equal((await change(request('andra',command()))).status,500);assert.equal(state.mutations.length,0);
 }
 reset();state.legacy=true;delete state.basis.contractVersion;delete state.basis.apl;
 assert.equal((await read(request('underlag',{kind:'programplan',planId:id}))).status,500);
 reset();const bad={...command(),contractVersion:'legacy'};assert.equal((await change(request('andra',bad))).status,400);assert.equal(state.calls.length,0);
});

test('new vocational decisions cannot omit APL or disguise missing confirmation as readiness',async()=>{
 for(const tamper of [r=>{delete r.apl;},r=>{r.apl=null;},r=>{r.apl.ready=false;},r=>{r.apl.detail.contentHash=`sha256:${'b'.repeat(64)}`;},r=>{r.apl.detail.capabilities.canConfirm=true;},r=>{r.apl.currentConfirmationId=null;}]){
  const input=await vocationalReply('BF25','timplan');tamper(state.reply);
  assert.equal((await change(request('andra',input))).status,500);assert.equal(state.mutations.length,0);
 }
 for(const action of ['submit','approve']){
  const input={...await vocationalReply('BF25','timplan'),action};
  if(action==='approve'){state.fn='huvudman';state.reply.stage='approved';state.reply.actions=[];}
  await attachApl(state.reply,{legacy:true});
  assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
 }
});

test('legacy vocational return and withdrawal remain available, historical approval stays readable',async()=>{
 for(const [action,stage,fn] of [['return','returned','huvudman'],['withdraw','draft','rektor']]){
  const input={...await vocationalReply('BF25','timplan'),action,comment:'Komplettera APL.'};
  state.fn=fn;state.reply.stage=stage;state.reply.actions=[];await attachApl(state.reply,{legacy:true});
  assert.equal((await change(request('andra',input))).status,200);
 }
 await vocationalReply('BF25','timplan');state.fn='huvudman';state.reply.stage='approved';state.reply.actions=[];await attachApl(state.reply,{legacy:true});state.basis=state.reply;
 const response=await read(request('underlag',{kind:'timplan',planId}));assert.equal(response.status,200);const body=await response.json();
 assert.deepEqual(body.blockers,[]);assert.equal(body.apl.ready,false);assert.equal(body.apl.detail.plan,null);
});

async function rehashApl(){
 const {context}=await projectAplFrozenBasis(state.aplBasis,planId), apl=state.reply.apl;
 apl.detail.contentHash=await aplContentHash(context,apl.detail.plan);
 for(const event of apl.detail.confirmations)event.contentHash=apl.detail.contentHash;
 return context;
}
test('individually valid frozen snapshots must still be identical across decision and APL',async()=>{
 for(const field of ['hours','source']){
  const input=await vocationalReply('BF25','timplan');
  if(field==='hours'){const hours=Object.values(state.aplBasis.gymTimplan.hours)[0];hours[hours.findIndex(v=>v!==null)]++;}
  else{state.aplBasis.gymTimplan.source.education.name='Annan giltig fryst benämning';state.aplBasis.gymTimplan.currentSourceBasis.education.name='Annan giltig fryst benämning';}
  await rehashApl();
  const {projectAplFrozenRead}=await import('./apl-plan.ts');
  await projectAplFrozenRead(state.reply.apl.detail,state.aplBasis,planId,authority());
  assert.equal((await change(request('andra',input))).status,500);assert.equal(state.mutations.length,0);
 }
});
test('correctly hashed but impossible APL allocation rolls back independently of SQL',async()=>{
 const input=await vocationalReply('BF25','timplan'), allocation=state.reply.apl.detail.plan.periods[0].allocations[0];
 allocation.gutMinutes=state.aplBasis.gymTimplan.hours[allocation.rowKey][allocation.termIndex]*60+1;
 await rehashApl();assert.equal((await change(request('andra',input))).status,500);assert.equal(state.mutations.length,0);
});
test('large duplicated raw blocker lists are compared exactly before presentation deduplication',async()=>{
 await vocationalReply('BF25','timplan');state.reply.stage='draft';state.reply.actions=['submit'];await attachApl(state.reply,{confirm:false});
 const apl=state.reply.apl,template=apl.detail.plan.periods[0];
 apl.detail.plan.periods=Array.from({length:100},(_,i)=>({...structuredClone(template),id:`55402000-0000-4000-8000-${String(1000+i).padStart(12,'0')}`,startsOn:null,endsOn:null,schoolYear:null,contents:[],allocations:[],extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''}}));
 const context=await rehashApl();apl.blockers=projectAplPlan(context,apl.detail.plan).issues.filter(i=>i.level==='blocker').map(i=>i.message);
 apl.blockers.push('Rektor behöver bekräfta APL-förläggningen för det aktuella innehållet.');state.reply.blockers=[...apl.blockers];state.basis=state.reply;
 assert.ok(apl.blockers.length>100);assert.ok(new Set(apl.blockers).size<apl.blockers.length);
 const response=await read(request('underlag',{kind:'timplan',planId}));assert.equal(response.status,200);const body=await response.json();
 assert.deepEqual(body.apl.blockers,apl.blockers);assert.equal(body.blockers.length,new Set(state.reply.blockers).size);
 apl.blockers=apl.blockers.slice(1);state.reply.blockers=[...apl.blockers];assert.equal((await read(request('underlag',{kind:'timplan',planId}))).status,500);
});
test('new frozen replay survives current APL changes without reinterpreting a completed command',async()=>{
 const input=await vocationalReply('BF25','timplan');state.replayed=true;
 const before=structuredClone(envelope(state.reply)), projected=await projectPlanDecision(before,input,authority(),input);
 assert.equal(projected.apl.ready,true);assert.deepEqual(before,envelope(state.reply));
 assert.equal((await change(request('andra',input))).status,200);
 // Replay still verifies its frozen APL proof; a replay flag cannot mask tampering.
 state.reply.apl.detail.plan.periods[0].allocations[0].gutMinutes++;
 assert.equal((await change(request('andra',input))).status,500);assert.equal(state.mutations.length,1);
});

async function separateTimetableReply() {
 const input=await vocationalReply('BF25','timplan'),r=state.reply;
 r.contractVersion='timetable_decision_v2';r.apl=null;r.blockers=[];state.aplBasis=null;
 r.checks=r.checks.map(c=>c.id==='apl'?{id:'apl-budget',label:'Årsram granskas nu, perioder senare'}:c);
 r.timeModel='school_terms_annual_apl_v2';r.timeCopyReview=[];
 r.timeRows=Object.fromEntries(r.hours.map(row=>[row.rowKey,{schoolMinutes:row.hours.map(n=>n===null?null:n*60),annualAplMinutes:[0,1,2].map(i=>row.hours[i*2]!==null||row.hours[i*2+1]!==null?0:null)}]));delete r.hours;
 state.envelopeOverride={contractVersion:'apl_decision_sql_v1',resultContract:'timetable_decision_v2',replayed:false,result:r,aplBasis:null};
 return{...input,confirmedChecks:r.checks.map(c=>c.id)};
}
test('new timetable decision approves table without APL periods or rector event',async()=>{
 const input=await separateTimetableReply();assert.equal((await change(request('andra',input))).status,200);
 assert.equal(state.mutations.length,1);
});
test('time-copy losses still block table approval when period planning is separate',async()=>{
 const input=await separateTimetableReply(),key=Object.keys(state.reply.timeRows)[0];
 state.reply.timeCopyReview=[{id:unit,resolution:null,contractVersion:'time_copy_review_v2',sourcePlanId:planId,sourceVersion:1,rowKey:key,reason:'missing_row',row:state.reply.timeRows[key]}];
 assert.equal((await change(request('andra',input))).status,409);assert.equal(state.mutations.length,0);
});
test('new timetable contract cannot smuggle period snapshots or select old server verifier',async()=>{
 for(const mutate of [s=>s.envelopeOverride.aplBasis={},s=>s.envelopeOverride.resultContract='apl_decision_v1',s=>s.reply.apl={},s=>delete s.reply.timeCopyReview]){
  const input=await separateTimetableReply();mutate(state);assert.equal((await change(request('andra',input))).status,500);assert.equal(state.mutations.length,0);
 }
});
