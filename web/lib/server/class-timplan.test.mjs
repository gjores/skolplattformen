import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id='55402000-0000-4000-8000-000000000001',unit='55402000-0000-4000-8000-000000000002',offering='55402000-0000-4000-8000-000000000003',planId='55402000-0000-4000-8000-000000000004';
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
let state;
const fixture=globalThis.__classTimplanTest={
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
    if(sql.includes('phase5_class_underlag'))return[{result:state.underlag}];
    if(sql.includes('phase5_class_command')){state.mutations.push(values);return[{result:state.reply}];}
    throw new Error('Unexpected synthetic query');
  },
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;
  if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__classTimplanTest.login(...a);export const withSessionContext=(...a)=>globalThis.__classTimplanTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__classTimplanTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__classTimplanTest.env;';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {POST:read}=await import('../../app/api/klasser/underlag/route.ts');
const {POST:create}=await import('../../app/api/klasser/skapa/route.ts');
const {POST:link}=await import('../../app/api/klasser/koppla/route.ts');
const creation={commandId:id,planId,expectedPlanRevision:2,name:'SA27A',startYear:2027};
const binding={commandId:id,classId:id,schoolYear:2027,planId,expectedPlanRevision:2,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
function reset(){state={fn:'rektor',mfa:true,underlag:{plan:{series:{id:unit,name:'Grundfördelning',revision:0},id:planId,offeringId:offering,unitId:unit,schoolName:'Syntetisk skola',educationName:'SA',cohort:'HT2027',startYear:2027,version:1,status:'faststalld',revision:2},schoolYear:2027,canManage:true,blockers:[],classes:[],linkedClasses:[]},reply:{id,name:'SA27A',startYear:2027,replayed:false},events:[],calls:[],mutations:[]};}
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/klasser/${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
test('HM principal admin can read with mandatory audit',async()=>{for(const fn of ['huvudman','rektor','administrator']){reset();state.fn=fn;state.mfa=false;const r=await read(request('underlag',{planId,schoolYear:2027}));assert.equal(r.status,200);assert.equal(state.events[0].action,'class_plan_read');}});
test('activated class projection cannot silently fall back to a legacy unnamed plan',async()=>{reset();delete state.underlag.plan.series;assert.equal((await read(request('underlag',{planId,schoolYear:2027}))).status,500);assert.equal(state.events.some(e=>e.outcome==='ok'),false);});
test('only school planning roles may create and link',async()=>{for(const fn of ['rektor','administrator']){reset();state.fn=fn;assert.equal((await create(request('skapa',creation))).status,200);state.reply={classId:id,schoolYear:2027,planId,columnId:'ar1',revision:0,replayed:false};assert.equal((await link(request('koppla',binding))).status,200);}for(const fn of ['huvudman','larare','kundadmin']){reset();state.fn=fn;assert.equal((await create(request('skapa',creation))).status,403);assert.equal(state.mutations.length,0);}});
test('MFA and CSRF failures cannot issue SQL mutation',async()=>{for(const mode of ['mfa','csrf']){reset();if(mode==='mfa')state.mfa=false;const r=await create(request('skapa',creation,mode==='csrf'?'http://foreign':'http://localhost'));assert.equal(r.status,403);assert.equal(state.mutations.length,0);}});
test('mandatory Worker audit failure rolls back command',async()=>{reset();state.auditFails=true;const r=await create(request('skapa',creation));assert.equal(r.status,500);assert.equal(state.mutations.length,0);});
test('SQL stale revision, scope denial and audit failure are minimized',async()=>{for(const[code,status]of[['40001',409],['42501',403],['55000',500]]){reset();state.sqlError={code,message:'private detail'};const r=await create(request('skapa',creation));assert.equal(r.status,status);assert.ok(!(await r.text()).includes('private detail'));}});
test('invalid payload and unrelated result fail closed',async()=>{reset();assert.equal((await create(request('skapa',{...creation,role:'huvudman'}))).status,400);assert.equal(state.mutations.length,0);reset();state.reply.startYear=2028;assert.equal((await create(request('skapa',creation))).status,500);assert.equal(state.mutations.length,0);});

const {messageText}=await import('../session-channel.ts');
const {sanitizeAuditDetails}=await import('./audit-details.ts');
const {ApiError,api}=await import('../server-client.ts');
const safeClassMessages={
 class_name_year_conflict:'Klassnamnet är redan upptaget på skolan för den berörda kullen eller läsåret. Välj ett annat namn eller kontrollera klasskopplingen.',
 class_cohort_start_locked:'Utbildningsstarten kan inte ändras när klasser finns. Skapa en ny kull om utbildningen ska ha en annan start.',
 class_plan_not_ready:'Utbildningens start eller timplanens underlag behöver kontrolleras. Läs om underlaget innan du fortsätter.',
};
test('specific SQL conflicts reach audited safe client messages without SQL details',async()=>{
 for(const [hint,expectedCode] of [['class_name_year_conflict','class_name_year_conflict'],['class_cohort_start_locked','class_cohort_start_locked'],['class_cohort_source_invalid','class_plan_not_ready']]){
  reset();state.sqlError={code:'40001',hint,message:'private foreign school',detail:'private class identity'};
  const response=await create(request('skapa',creation));assert.equal(response.status,409);
  const body=await response.clone().json();assert.equal(body.code,expectedCode);assert.ok(!JSON.stringify(body).includes('private'));
  assert.equal(state.events.at(-1).details.code,expectedCode);assert.equal(state.events.at(-1).details.path,'/api/klasser');assert.ok(!JSON.stringify(state.events.at(-1).details).includes('private'));
  assert.equal(messageText(expectedCode),safeClassMessages[expectedCode]);
  assert.deepEqual(sanitizeAuditDetails({code:expectedCode,message:'private',className:'private'}),{code:expectedCode});
  const previousFetch=globalThis.fetch;globalThis.fetch=async()=>response;
  try{await assert.rejects(api.post('/api/klasser/skapa',creation),error=>error instanceof ApiError&&error.status===409&&error.code===expectedCode&&error.message===safeClassMessages[expectedCode]&&error.hasExplicitCode);}
  finally{globalThis.fetch=previousFetch;}
 }
});
test('unknown hints remain generic and permissions never reveal class conflicts',async()=>{
 for(const [sqlCode,hint,expectedCode,status] of [['40001',undefined,'conflict',409],['40001','private foreign scope','conflict',409],['42501','class_name_year_conflict','forbidden',403],['42501','class_cohort_start_locked','forbidden',403],['42501','class_cohort_source_invalid','forbidden',403]]){
  reset();state.sqlError={code:sqlCode,hint,message:'private'};const response=await create(request('skapa',creation));
  assert.equal(response.status,status);const body=await response.json();assert.equal(body.code,expectedCode);assert.ok(!JSON.stringify(body).includes('private'));
 }
 assert.deepEqual(sanitizeAuditDetails({code:'private foreign scope'}),{});
});
test('a conflict cannot bypass mandatory failure audit',async()=>{
 for(const hint of ['class_name_year_conflict','class_cohort_start_locked','class_cohort_source_invalid']){
  reset();state.sqlError={code:'40001',hint,message:'private'};state.auditFails=true;
  const response=await create(request('skapa',creation));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);
 }
});
