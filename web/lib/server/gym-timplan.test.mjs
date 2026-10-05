import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { canonicalCatalogJson } from '../programplan-catalog.ts';
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
const fixture=globalThis.__gymTimplanTest={
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
    if(sql.includes('phase5_create_gym_timplan')){state.mutations.push(values);return[{result:state.created}];}
    if(sql.includes('phase5_write_gym_timplan_row')){state.mutations.push(values);return[{result:state.saved??{id:values[0],revision:values[1]+1,rowKey:values[2],hours:values[3]}}];}
    throw new Error('Unexpected synthetic query');
  },
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;
  if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__gymTimplanTest.login(...a);export const withSessionContext=(...a)=>globalThis.__gymTimplanTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__gymTimplanTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__gymTimplanTest.env;';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {POST:underlag}=await import('../../app/api/timplaner/gym/underlag/route.ts');
const {POST:read}=await import('../../app/api/timplaner/gym/lasa/route.ts');
const {POST:create}=await import('../../app/api/timplaner/gym/skapa/route.ts');
const {POST:write}=await import('../../app/api/timplaner/gym/rad/route.ts');
const rawSource=()=>({planId:id,offeringId:offering,version:1,revision:3,status:'utkast',catalogId:artifact.catalogId,basisReference:structuredClone(basis),distribution:structuredClone(distribution),
  rows:termRows.map(row=>({key:row.key,points:row.points})),educationRevision:2,education:{name:'Syntetisk SA',cohort:'27/28',programCode:program.code,orientationCode},archived:false});
const catalog=()=>{const{catalogId:_catalogId,...payload}=structuredClone(artifact);return payload;};
const rawPlan=()=>({id:planId,offeringId:offering,unitId:unit,schoolName:'Syntetisk skola',version:1,revision:0,status:'utkast',source:rawSource(),catalog:catalog(),
  currentSource:{planId:id,version:1,revision:3,status:'utkast'},hours:Object.fromEntries(termRows.map(row=>[row.key,[null,null,null,null,null,null]])),canPlan:true,archived:false});
const command=()=>({commandId:planId,sourcePlanId:id,expectedSourceRevision:3,expectedEducationRevision:2,unitId:unit,predecessorPlanId:null,expectedPredecessorRevision:null});
const rowCommand=()=>({planId,expectedRevision:0,rowKey:key,hours:[0,45,null,null,null,null]});
function reset(){const p=rawPlan();state={fn:'rektor',mfa:true,plan:p,underlag:{source:rawSource(),catalog:catalog(),units:[{unitId:unit,schoolName:'Syntetisk skola',canPlan:true,plans:[]}]},created:{reply:{id:planId,offeringId:offering,unitId:unit,version:1,revision:0,sourcePlanId:id,sourceRevision:3,replayed:false,carriedRows:0,resetRows:termRows.length},plan:structuredClone(p)},events:[],calls:[],mutations:[]};}
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/timplaner/gym/${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
test('basis and plan reads allow HM, principal and school administrator without write MFA, with minimal audit',async()=>{
  for(const fn of ['huvudman','rektor','administrator'])for(const[route,path,body,action,objectType,objectId]of[[underlag,'underlag',{sourcePlanId:id},'gym_timplan_basis_read','programplan',id],[read,'lasa',{planId},'gym_timplan_read','timplan',planId]]){
    reset();state.fn=fn;state.mfa=false;const response=await route(request(path,body));assert.equal(response.status,200);const projected=await response.json();
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-context-epoch'),'1');assert.equal(state.calls.length,1);assert.equal(state.events.length,1);
    assert.deepEqual(state.events[0],{action,objectType,objectId,outcome:'ok',details:{accessFunction:fn}});
    assert.equal('catalog'in projected,false);assert.equal('basisReference'in projected.source,false);assert.equal(projected.source.catalogId,artifact.catalogId);
    if(path==='underlag'){assert.equal(projected.readiness.ready,true);assert.equal(projected.rows.reduce((n,r)=>n+r.points,0),2500);}else assert.equal(projected.sourceChanged,false);
  }
});
test('frozen source projection verifies the whole hash and exact ordered source row schema',async()=>{
  for(const mutate of [p=>p.catalog.programs[0].name='Tampered whole artifact',p=>p.catalog.private='private',p=>p.source.rows[0].points=999,
    p=>p.source.rows.reverse(),p=>p.source.basisReference.programRef.version++,p=>p.source.education.programCode='ES25',p=>p.source.actorId=id]){
    reset();mutate(state.plan);const response=await read(request('lasa',{planId}));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
});
test('incomplete terms, unpinned legacy and unknown vocational total remain explicit source limitations',async()=>{
  reset();state.underlag.source.distribution=[];let response=await underlag(request('underlag',{sourcePlanId:id}));assert.equal(response.status,200);let body=await response.json();assert.equal(body.readiness.ready,false);assert.ok(body.readiness.missing.some(text=>text.includes('terminer')));
  reset();Object.assign(state.underlag.source,{catalogId:null,basisReference:null,distribution:[],rows:[]});state.underlag.catalog=null;response=await underlag(request('underlag',{sourcePlanId:id}));assert.equal(response.status,200);body=await response.json();assert.equal(body.source.catalogId,null);assert.equal(body.readiness.ready,false);assert.ok(body.readiness.missing.some(text=>text.includes('äldre')));
  reset();const changed=state.underlag.catalog;changed.programs.find(p=>p.code===program.code).category='VOCATIONAL_PROGRAM';const hash=`sha256:${createHash('sha256').update(canonicalCatalogJson(changed)).digest('hex')}`;state.underlag.source.catalogId=hash;state.underlag.source.basisReference.catalogId=hash;
  response=await underlag(request('underlag',{sourcePlanId:id}));assert.equal(response.status,200);body=await response.json();assert.equal(body.readiness.ready,false);assert.ok(body.readiness.missing.some(text=>text.includes('Yrkesprogrammets')));
});
test('reads reject missing hour rows, non-null inactive cells and extra returned actor fields',async()=>{
  for(const mutate of [p=>delete p.hours[key],p=>p.hours[key][5]=0,p=>p.hours.actor=[null,null,null,null,null,null],p=>p.currentSource.role='rektor',p=>p.canPlan='true',p=>p.id=id]){
    reset();mutate(state.plan);assert.equal((await read(request('lasa',{planId}))).status,500);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
});
test('creation uses exact seven bound values and checks its frozen source before commit',async()=>{
  for(const fn of ['rektor','administrator']){
    reset();state.fn=fn;const response=await create(request('skapa',command()));assert.equal(response.status,200);const body=await response.json();assert.equal(body.id,planId);assert.equal(body.sourceRevision,3);
    assert.deepEqual(state.calls[0].values,[planId,id,3,2,unit,null,null]);assert.equal(state.calls.length,1);assert.equal(state.mutations.length,1);
    assert.equal(state.events[0].action,'gym_timplan_created');assert.equal(state.events[0].objectId,planId);assert.equal('plan'in body,false);assert.equal('hours'in state.events[0].details,false);
  }
});
test('identical replay verifies frozen revision after current source changes and preserves edited hours',async()=>{
  reset();state.created.reply.replayed=true;state.created.reply.revision=2;state.created.plan.revision=2;state.created.plan.currentSource={planId:unit,version:2,revision:5,status:'utkast'};state.created.plan.hours[key]=[0,50,null,null,null,null];
  const response=await create(request('skapa',command()));assert.equal(response.status,200);const body=await response.json();assert.equal(body.replayed,true);assert.equal(body.revision,2);assert.equal(body.sourceRevision,3);assert.equal(state.calls.length,1);
});
test('invalid frozen catalog or mismatched creation receipt rolls back all business changes',async()=>{
  for(const mutate of [r=>r.plan.catalog.programs[0].name='Tampered',r=>r.reply.sourceRevision=4,r=>r.reply.unitId=id,r=>r.reply.offeringId=id,
    r=>r.plan.source.educationRevision=3,r=>r.reply.resetRows=1,r=>r.reply.private='private']){
    reset();mutate(state.created);const response=await create(request('skapa',command()));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
});
test('an unknown national point profile cannot be committed despite otherwise complete terms',async()=>{
  reset();const changed=state.created.plan.catalog;changed.programs.find(p=>p.code===program.code).category='VOCATIONAL_PROGRAM';const hash=`sha256:${createHash('sha256').update(canonicalCatalogJson(changed)).digest('hex')}`;state.created.plan.source.catalogId=hash;state.created.plan.source.basisReference.catalogId=hash;
  const response=await create(request('skapa',command()));assert.equal(response.status,409);assert.equal((await response.json()).code,'gym_timplan_source_not_ready');assert.equal(state.mutations.length,0);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
});
test('row writes preserve explicit zero and null, bind CAS and log no cell values',async()=>{
  for(const fn of ['rektor','administrator']){
    reset();state.fn=fn;const response=await write(request('rad',rowCommand()));assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:planId,revision:1,rowKey:key,hours:rowCommand().hours});
    assert.deepEqual(state.calls[0].values,[planId,0,key,rowCommand().hours]);assert.equal(state.events[0].action,'gym_timplan_row_changed');assert.equal('rowKey'in state.events[0].details,false);assert.equal('hours'in state.events[0].details,false);
  }
});
test('wrong roles, missing MFA, foreign origin and stale context deny before mutation SQL',async()=>{
  for(const[route,path,body]of[[create,'skapa',command()],[write,'rad',rowCommand()]]){
    for(const fn of ['huvudman','larare','support','it','kundadmin']){reset();state.fn=fn;assert.equal((await route(request(path,body))).status,403);assert.equal(state.calls.length,0);}
    reset();state.mfa=false;assert.equal((await route(request(path,body))).status,403);assert.equal(state.calls.length,0);
    reset();assert.equal((await route(request(path,body,'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
    reset();const stale=request(path,body);stale.headers.set('X-Context-Epoch','0');assert.equal((await route(stale)).status,409);assert.equal(state.calls.length,0);
  }
  for(const fn of ['larare','support','it','kundadmin']){reset();state.fn=fn;assert.equal((await underlag(request('underlag',{sourcePlanId:id}))).status,403);assert.equal(state.calls.length,0);}
});
test('malformed JSON, extra command fields and hostile number widths deny before SQL',async()=>{
  for(const changes of [{actorId:id},{unitId:'bad'},{expectedSourceRevision:'3'},{expectedEducationRevision:-1},{predecessorPlanId:id}]){
    reset();assert.equal((await create(request('skapa',{...command(),...changes}))).status,400);assert.equal(state.calls.length,0);
  }
  reset();const malformed=new Request('http://localhost/api/timplaner/gym/rad',{method:'POST',headers:{Origin:'http://localhost'},body:'{'});assert.equal((await write(malformed)).status,400);assert.equal(state.calls.length,0);
  reset();assert.equal((await write(request('rad',{...rowCommand(),hours:[1,2,3]}))).status,400);assert.equal(state.calls.length,0);
});
test('SQL conflict, forbidden and audit failures are minimized; Worker audit failure rolls back mutation',async()=>{
  for(const[code,status,expected]of[['40001',409,'conflict'],['42501',403,'forbidden'],['22023',400,'bad_request'],['55000',500,'audit_unavailable']]){
    reset();state.sqlError={code,message:'private SQL contents'};const response=await write(request('rad',rowCommand()));assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,expected);assert.equal(JSON.stringify(body).includes('private'),false);
  }
  for(const[route,path,body]of[[create,'skapa',command()],[write,'rad',rowCommand()]]){reset();state.auditFails=true;const response=await route(request(path,body));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);}
});
test('specific readiness and archive hints retain the session and disclose only minimized operation codes',async()=>{
  for(const[sqlCode,hint,expected]of[['40001','gym_timplan_source_not_ready','gym_timplan_source_not_ready'],['42501','gym_timplan_archived','gym_timplan_archived']]){
    for(const[route,path,body]of[[create,'skapa',command()],[write,'rad',rowCommand()]]){
      reset();state.sqlError={code:sqlCode,hint,message:'private SQL content',detail:'private values'};
      const response=await route(request(path,body));assert.equal(response.status,409);const result=await response.json();assert.equal(result.code,expected);
      assert.equal(JSON.stringify(result).includes('private'),false);assert.equal('hint'in result,false);assert.equal('detail'in result,false);assert.equal(state.mutations.length,0);
      assert.equal(state.events.at(-1).outcome,'denied');assert.equal(state.events.at(-1).details.code,expected);assert.equal(state.events.at(-1).details.path,'/api/timplaner');
    }
  }
  for(const[code,hint,status,expected]of[['42501','gym_timplan_source_not_ready',403,'forbidden'],['40001','gym_timplan_archived',409,'conflict'],['42501','private unknown hint',403,'forbidden']]){
    reset();state.sqlError={code,hint};const response=await write(request('rad',rowCommand()));assert.equal(response.status,status);assert.equal((await response.json()).code,expected);
  }
});
test('row acknowledgement cannot accept changed values, wrong identity or wrong next revision',async()=>{
  for(const saved of [{id,revision:1,rowKey:key,hours:rowCommand().hours},{id:planId,revision:0,rowKey:key,hours:rowCommand().hours},
    {id:planId,revision:1,rowKey:key,hours:[null,45,null,null,null,null]},{id:planId,revision:1,rowKey:key,hours:rowCommand().hours,private:'private'}]){
    reset();state.saved=saved;assert.equal((await write(request('rad',rowCommand()))).status,500);assert.equal(state.mutations.length,0);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
});
