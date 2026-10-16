import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { defaultProgramplanChoiceBlocks } from '../programplan-choice-blocks.ts';
import { programFrame } from '../programplan-table.ts';
import { programplanLevelRanks, programplanTermRows, suggestProgramplanTerms } from '../programplan-terms.ts';

const id='55402000-0000-4000-8000-000000000001',unit='55402000-0000-4000-8000-000000000002',offering='55402000-0000-4000-8000-000000000003',planId='55402000-0000-4000-8000-000000000004';
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
const artifact=JSON.parse(await readFile(new URL('../programplan-catalog.generated.json',import.meta.url),'utf8'));
const program=artifact.programs.find(program=>program.code==='SA25'),orientationCode='SABEP';
const blocks=defaultProgramplanChoiceBlocks(program,orientationCode);
blocks.push({id:'fordj',name:'Programfördjupning',kind:'specialization',points:programFrame(program,orientationCode).specializationRoom});
const basis={catalogId:artifact.catalogId,programRef:{code:program.code,version:program.version},orientationCode,startedOn:'2027-08-01',specializationRefs:[],choiceBlocks:blocks};
const termRows=programplanTermRows(program,basis),distribution=suggestProgramplanTerms(termRows,[],programplanLevelRanks(program));
const key=termRows[0].key;
let state;
const fixture=globalThis.__namedTimplanTest={
  env:{APP_MODE:'protected',DATABASE_URL:'postgres://synthetic@127.0.0.1:56322/postgres',SUPABASE_URL:'http://127.0.0.1:56321',OIDC_ISSUER:issuer,OIDC_CLIENT_ID:clientId,MFA_MAX_AGE_SECONDS:'28800',SESSION_SECRET:'synthetic-gym-only'},
  session(){const future=new Date(Date.now()+60000);return{session:{id,identityId:id,membershipId:id,assignmentId:id,customerId:id,expiresAt:future,absoluteExpiresAt:future,epoch:1}};},
  async login(_corr,fn){return fn(fixture.tx);},
  async context(_ctx,fn){const events=state.events.length,mutations=state.mutations.length;try{return await fn(fixture.tx,{sessionId:id,identityId:id,membershipId:id,assignmentId:id,customerId:id,identity:{issuer,subject:'synthetic'},correlationId:id,accessFunction:state.fn,epoch:1,
    mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:state.mfa?'2':'1',amr:state.mfa?['pwd','otp']:['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date()}});}catch(error){state.events.length=events;state.mutations.length=mutations;throw error;}},
  tx:async(strings,...values)=>{
    const sql=strings.join('?');
    if(sql.includes('select i.auth_user_id'))return[{function:state.fn}];
    if(sql.includes('insert into public.security_events')){if(state.auditFails)throw new Error('private audit failure');state.events.push({action:values[8],objectType:values[9],objectId:values[10],outcome:values[11],details:values[12]});return[];}
    state.calls.push({sql,values});if(state.sqlError)throw state.sqlError;
    if(sql.includes('phase5_gym_timplan_underlag'))return[{result:state.underlag}];
    if(sql.includes('phase5_read_gym_timplan'))return[{result:state.plan}];
    if(sql.includes('phase5_named_timplan_create')){state.mutations.push(values);return[{result:state.created}];}
    if(sql.includes('phase5_named_timplan_rename')){state.mutations.push(values);return[{result:state.renamed}];}
    throw new Error('Unexpected synthetic query');
  },
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;
  if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__namedTimplanTest.login(...a);export const withSessionContext=(...a)=>globalThis.__namedTimplanTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__namedTimplanTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__namedTimplanTest.env;';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {POST:create}=await import('../../app/api/timplaner/gym/planer/skapa/route.ts');
const {POST:rename}=await import('../../app/api/timplaner/gym/planer/namn/route.ts');
const rawSource=()=>({planId:id,offeringId:offering,version:1,revision:3,status:'utkast',catalogId:artifact.catalogId,basisReference:structuredClone(basis),distribution:structuredClone(distribution),
  rows:termRows.map(row=>({key:row.key,points:row.points})),educationRevision:2,education:{name:'Syntetisk SA',cohort:'27/28',programCode:program.code,orientationCode},archived:false});
const catalog=()=>{const{catalogId:_catalogId,...payload}=structuredClone(artifact);return payload;};
const rawPlan=()=>({series:{id:unit,name:'Grundfördelning',revision:0},nameAtCreation:'Grundfördelning',id:planId,offeringId:offering,unitId:unit,schoolName:'Syntetisk skola',version:1,revision:0,status:'utkast',source:rawSource(),catalog:catalog(),
  currentSourceBasis:rawSource(),currentSource:{planId:id,version:1,revision:3,status:'utkast'},hours:Object.fromEntries(termRows.map(row=>[row.key,[null,null,null,null,null,null]])),canPlan:true,archived:false});
const command=()=>({commandId:planId,sourcePlanId:id,expectedSourceRevision:3,expectedEducationRevision:2,unitId:unit,name:'Grundfördelning',copyFromPlanId:null,expectedCopyFromRevision:null});
const renameCommand=()=>({commandId:planId,planId,seriesId:unit,expectedSeriesRevision:0,name:'Utökad matematik'});
function reset(){const p=rawPlan();state={fn:'rektor',mfa:true,plan:p,underlag:{source:rawSource(),catalog:catalog(),units:[{unitId:unit,schoolName:'Syntetisk skola',canPlan:true,plans:[]}]},renamed:{planId,series:{id:unit,name:'Utökad matematik',revision:1},replayed:false},created:{reply:{series:{id:unit,name:'Grundfördelning',revision:0},id:planId,offeringId:offering,unitId:unit,version:1,revision:0,sourcePlanId:id,sourceRevision:3,replayed:false,carriedRows:0,resetRows:termRows.length},plan:structuredClone(p)},events:[],calls:[],mutations:[]};}
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/timplaner/gym/planer/${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}

test('new plan and rename use exact reviewed JSON within school planning roles',async()=>{
  for(const fn of ['rektor','administrator'])for(const[route,path,input,reply,action]of[
    [create,'skapa',command(),'created','named_timplan_created'],[rename,'namn',renameCommand(),'renamed','timplan_renamed']]){
    reset();state.fn=fn;const response=await route(request(path,input));assert.equal(response.status,200);
    assert.deepEqual(await response.json(),reply==='created'?state.created.reply:state.renamed);
    assert.deepEqual(state.calls[0].values,[input]);assert.equal(state.calls.length,1);assert.equal(state.mutations.length,1);
    assert.equal(state.events[0].action,action);assert.equal(state.events[0].details.accessFunction,fn);
    assert.equal('name'in state.events[0].details,false);assert.equal('hours'in state.events[0].details,false);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('new vocational annual plan projects empty minute cells and rejects an incomplete returned matrix',async()=>{
  const vocational=artifact.programs.find(p=>p.code==='BF25'),orientation=vocational.orientations[0].code;
  const choiceBlocks=defaultProgramplanChoiceBlocks(vocational,orientation);
  choiceBlocks.push({id:'fordj',name:'Programfördjupning',kind:'specialization',points:programFrame(vocational,orientation).specializationRoom});
  const reference={catalogId:artifact.catalogId,programRef:{code:vocational.code,version:vocational.version},orientationCode:orientation,
    startedOn:'2027-08-01',specializationRefs:[],choiceBlocks};
  const rows=programplanTermRows(vocational,reference),terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(vocational));
  for(const incomplete of [false,true]){
    reset();const plan=state.created.plan;
    const source={...rawSource(),basisReference:reference,distribution:terms,rows:rows.map(row=>({key:row.key,points:row.points})),
      education:{name:'Syntetisk BF',cohort:'27/28',programCode:vocational.code,orientationCode:orientation}};
    plan.source=source;plan.currentSourceBasis=structuredClone(source);delete plan.hours;
    plan.timeModel='school_terms_annual_apl_v2';plan.timeCopyReview=[];
    plan.timeRows=Object.fromEntries(rows.map(row=>[row.key,{schoolMinutes:[null,null,null,null,null,null],annualAplMinutes:[null,null,null]}]));
    state.created.reply.resetRows=rows.length;
    if(incomplete)delete plan.timeRows[rows[0].key];
    const response=await create(request('skapa',command()));assert.equal(response.status,incomplete?500:200);
    if(incomplete){assert.equal(state.mutations.length,0);assert.equal(state.events.some(e=>e.outcome==='ok'),false);}
    else{assert.deepEqual(await response.json(),state.created.reply);assert.equal(state.mutations.length,1);assert.equal(state.events[0].action,'named_timplan_created');}
  }
});
test('create replay returns frozen receipt after later edits and rename',async()=>{
  reset();state.created.reply.replayed=true;state.created.plan.revision=5;
  state.created.plan.series={id:unit,name:'Nytt namn',revision:3};
  state.created.plan.hours[key]=[0,50,null,null,null,null];
  const response=await create(request('skapa',command()));assert.equal(response.status,200);
  const body=await response.json();assert.equal(body.revision,0);assert.equal(body.series.name,'Grundfördelning');assert.equal(body.series.revision,0);
});
test('rename replay keeps the reviewed name and original next series revision',async()=>{
  reset();state.renamed.replayed=true;
  const response=await rename(request('namn',renameCommand()));assert.equal(response.status,200);assert.deepEqual(await response.json(),state.renamed);
});
test('copy command binds exact source and revision without changing its receipt identity',async()=>{
  reset();const input={...command(),copyFromPlanId:id,expectedCopyFromRevision:4};
  state.created.reply.carriedRows=1;state.created.reply.resetRows--;
  const response=await create(request('skapa',input));assert.equal(response.status,200);assert.deepEqual(state.calls[0].values,[input]);
});
test('malformed creation metadata or frozen source rolls back the command',async()=>{
  for(const mutate of [r=>delete r.plan.series,r=>delete r.plan.nameAtCreation,r=>r.plan.series.id=id,
    r=>r.plan.nameAtCreation='Annat namn',r=>r.reply.series.name='Annat namn',r=>r.reply.series.revision=1,
    r=>r.reply.revision=1,r=>r.reply.version=2,r=>r.reply.unitId=id,r=>r.reply.offeringId=id,
    r=>r.plan.source.educationRevision=3,r=>r.reply.resetRows=1,r=>r.reply.carriedRows=1,
    r=>r.plan.catalog.programs[0].name='Tampered',r=>r.reply.private='private',r=>r.plan.series.revision=2]){
    reset();mutate(state.created);const response=await create(request('skapa',command()));assert.equal(response.status,500);
    assert.equal(state.mutations.length,0);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
});
test('rename receipt is bound to exact plan series revision and requested spelling',async()=>{
  for(const mutate of [r=>r.planId=id,r=>r.series.id=id,r=>r.series.name='ANNAT',r=>r.series.revision=0,
    r=>r.series.revision=2,r=>r.series.extra=true,r=>r.replayed='true',r=>r.private='private']){
    reset();mutate(state.renamed);assert.equal((await rename(request('namn',renameCommand()))).status,500);assert.equal(state.mutations.length,0);
  }
});
test('roles MFA origin and stale assignment context deny both operations before SQL',async()=>{
  for(const[route,path,input]of[[create,'skapa',command()],[rename,'namn',renameCommand()]]){
    for(const fn of ['huvudman','larare','support','it','kundadmin']){reset();state.fn=fn;assert.equal((await route(request(path,input))).status,403);assert.equal(state.calls.length,0);}
    reset();state.mfa=false;assert.equal((await route(request(path,input))).status,403);assert.equal(state.calls.length,0);
    reset();assert.equal((await route(request(path,input,'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
    reset();const stale=request(path,input);stale.headers.set('X-Context-Epoch','0');assert.equal((await route(stale)).status,409);assert.equal(state.calls.length,0);
  }
});
test('strict request parsing rejects hidden authority incomplete copies and invalid names',async()=>{
  for(const {route,path,input,changes} of [
    {route:create,path:'skapa',input:command(),changes:[{actorId:id},{name:' '},{name:'A\nB'},{copyFromPlanId:id},{expectedCopyFromRevision:1}]},
    {route:rename,path:'namn',input:renameCommand(),changes:[{seriesId:'bad'},{expectedSeriesRevision:-1},{expectedSeriesRevision:2147483647},{name:' Mellanslag '},{unitId:unit}]}]){
    for(const change of changes){reset();assert.equal((await route(request(path,{...input,...change}))).status,400);assert.equal(state.calls.length,0);}
  }
});
test('name conflicts have a safe business message; foreign scope stays masked',async()=>{
  const {messageText}=await import('../session-channel.ts');
  for(const[code,hint,status,expected]of[['40001','timplan_name_conflict',409,'timplan_name_conflict'],['42501','timplan_name_conflict',403,'forbidden'],['40001','private',409,'conflict']]){
    reset();state.sqlError={code,hint,message:'private foreign data'};
    const response=await rename(request('namn',renameCommand()));assert.equal(response.status,status);
    const body=await response.json();assert.equal(body.code,expected);assert.ok(!JSON.stringify(body).includes('private'));
    assert.equal(state.events.at(-1).details.code,expected);
  }
  assert.match(messageText('timplan_name_conflict'),/Välj ett annat namn/);
});
test('mandatory Worker audit failure rolls back both new operations',async()=>{
  for(const[route,path,input]of[[create,'skapa',command()],[rename,'namn',renameCommand()]]){
    reset();state.auditFails=true;const response=await route(request(path,input));assert.equal(response.status,500);assert.equal(state.mutations.length,0);
  }
});
