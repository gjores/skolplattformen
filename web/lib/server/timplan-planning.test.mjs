import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '55004000-0000-4000-8000-000000000001';
const other = '55004000-0000-4000-8000-000000000002';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
let state;
const fixture = globalThis.__timplanTest = {
  env: { APP_MODE:'protected', DATABASE_URL:'postgres://test@127.0.0.1:56322/postgres',
    SUPABASE_URL:'http://127.0.0.1:56321', OIDC_ISSUER:issuer, OIDC_CLIENT_ID:clientId,
    MFA_MAX_AGE_SECONDS:'28800', SESSION_SECRET:'synthetic-only-test-secret' },
  session() { const future = new Date(Date.now()+60000); return { session:{id,identityId:id,membershipId:id,
    assignmentId:id,customerId:id,expiresAt:future,absoluteExpiresAt:future,epoch:1} }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const events = state.events.length, mutations = state.mutations.length;
    try { return await fn(fixture.tx, {sessionId:id,identityId:id,membershipId:id,assignmentId:id,customerId:id,
      identity:{issuer,subject:'synthetic'},correlationId:id,accessFunction:state.fn,epoch:1,
      mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,
        acr:state.mfa?'2':'1',amr:state.mfa?['pwd','otp']:['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date(Date.now()-500)}}); }
    catch(error) {state.events.length=events;state.mutations.length=mutations;throw error;}
  },
  tx: async (strings, ...values) => {
    const sql = strings.join('?');
    if(sql.includes('select i.auth_user_id')) return [{function:state.fn}];
    if(sql.includes('insert into public.security_events')) {
      if(state.auditFails) throw new Error('private audit failure');
      state.events.push({action:values[8],objectId:values[10],outcome:values[11],details:values[12]});return [];
    }
    state.calls.push({sql,values});
    if(state.sqlError) throw state.sqlError;
    if(sql.includes('phase5_list_timplans')) return [{result:state.list}];
    if(sql.includes('phase5_read_timplan')) return [{result:state.read}];
    if(sql.includes('phase5_change_timplan_cell')) {
      state.mutations.push(values);
      return [{result:state.change ?? {id:values[0],revision:values[1]+1,rowId:values[2],hours:[values[4],20,30]}}];
    }
    throw new Error('Unexpected synthetic query');
  },
};
fixture.tx.json = v=>v;
registerHooks({load(url, context, next) {
  let source;
  if(url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error {constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=(...a)=>globalThis.__timplanTest.login(...a); export const withSessionContext=(...a)=>globalThis.__timplanTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__timplanTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__timplanTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
}});
const adapter = await import('./timplan-planning.ts');
const {POST:read} = await import('../../app/api/timplaner/lasa/route.ts');
const {POST:list} = await import('../../app/api/timplaner/lista/route.ts');
const {POST:change} = await import('../../app/api/timplaner/cell/route.ts');
const {auditRoute,sanitizeAuditDetails} = await import('./audit-details.ts');
const cell = ()=>({planId:id,expectedRevision:0,rowId:'matematik',columnIndex:0,hours:100});
const plan = ()=>({id,offeringId:id,unitId:id,version:1,revision:0,status:'utkast',basis:'Syntetisk grund',
  catalogFetched:null,decidedOn:null,schoolName:'Syntetisk skola',education:{name:'Syntetisk utbildning',cohort:'Syntetiskt prov',kind:'grundskola',grades:[9,1,4]},cells:{matematik:[10,20,30]}});
const selection = ()=>({plans:[{id,offeringId:id,unitId:id,schoolName:'Syntetisk skola',educationName:'Syntetisk utbildning',cohort:'Syntetiskt prov',kind:'grundskola',version:1,revision:0,status:'utkast'}],count:1,page:1,pageSize:50});
function reset(){state={fn:'rektor',mfa:true,read:plan(),list:selection(),events:[],calls:[],mutations:[]};}
function request(body, path='cell', origin='http://localhost') {return new Request(`http://localhost/api/timplaner/${path}`,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
test('closed requests reject client actor, role, extra fields, malformed identifiers and numbers',()=>{
  assert.deepEqual(adapter.parseTimplanRead({planId:id}),{planId:id});
  assert.deepEqual(adapter.parseTimplanCell(cell()),cell());
  for(const value of [null,[],{planId:'bad'},{planId:id,actorId:id},{planId:id,role:'rektor'}]) assert.throws(()=>adapter.parseTimplanRead(value));
  for(const value of [{...cell(),actor:id},{...cell(),expectedRevision:-1},{...cell(),expectedRevision:'0'},
    {...cell(),expectedRevision:2147483647},{...cell(),hours:1.5},{...cell(),hours:-1},{...cell(),hours:2001},
    {...cell(),rowId:'__proto__'},{...cell(),rowId:'constructor'},{...cell(),columnIndex:12},{...cell(),columnIndex:null}]) assert.throws(()=>adapter.parseTimplanCell(value));
});
test('HM and principal read with audit and no-store; read does not require write MFA',async()=>{
  for(const fn of ['huvudman','rektor']) {
    reset();state.fn=fn;state.mfa=false;
    const response=await read(request({planId:id},'lasa'));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),plan());
    assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-context-epoch'),'1');
    assert.deepEqual(state.calls[0].values,[id]);assert.equal(state.events[0].action,'timplan_read');assert.equal(state.events[0].objectId,id);
  }
});
test('cell command binds only operation values and logs no cell values',async()=>{
  reset();const response=await change(request(cell()));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{id,revision:1,rowId:'matematik',hours:[100,20,30]});
  assert.deepEqual(state.calls[0].values,[id,0,'matematik',0,100]);
  assert.equal(state.events[0].action,'timplan_cell_changed');assert.equal(state.events[0].objectId,id);
  assert.equal('hours' in state.events[0].details,false);assert.equal('rowId' in state.events[0].details,false);
});
test('wrong role, missing MFA, foreign origin and stale context deny before SQL',async()=>{
  for(const fn of ['huvudman','administrator','larare','support','it','kundadmin']) {
    reset();state.fn=fn;assert.equal((await change(request(cell()))).status,403);assert.equal(state.calls.length,0);
  }
  reset();state.mfa=false;const noMfa=await change(request(cell()));assert.equal(noMfa.status,403);assert.equal((await noMfa.json()).code,'mfa_required');assert.equal(state.calls.length,0);
  reset();assert.equal((await change(request(cell(),'cell','https://foreign.example'))).status,403);assert.equal(state.calls.length,0);
  reset();const stale=request(cell());stale.headers.set('X-Context-Epoch','0');assert.equal((await change(stale)).status,409);assert.equal(state.calls.length,0);
  for(const fn of ['administrator','larare','support','it']) {reset();state.fn=fn;assert.equal((await read(request({planId:id},'lasa'))).status,403);assert.equal(state.calls.length,0);}
});
test('SQL conflict and forbidden errors are minimized and committed as denial',async()=>{
  for(const [code,status,expected] of [['40001',409,'conflict'],['42501',403,'forbidden'],['22023',400,'bad_request']]) {
    reset();state.sqlError={code,message:'private SQL values'};const response=await change(request(cell()));
    assert.equal(response.status,status);const result=await response.json();assert.equal(result.code,expected);
    assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(state.events.at(-1).outcome,'denied');
    assert.equal(state.events.at(-1).details.path,'/api/timplaner');assert.equal(state.events.at(-1).details.code,expected);
  }
});
test('DB or Worker audit failure returns no data and rolls back the command',async()=>{
  reset();state.sqlError={code:'55000',message:'private audit'};const failedRead=await read(request({planId:id},'lasa'));
  assert.equal(failedRead.status,500);assert.equal((await failedRead.json()).code,'audit_unavailable');
  reset();state.auditFails=true;const failedWrite=await change(request(cell()));
  assert.equal(failedWrite.status,500);assert.equal((await failedWrite.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);
});
test('unknown/raw response fields and wrong object/revision cannot leave server',async()=>{
  for(const mutate of [p=>p.actorId='private',p=>p.id=other,p=>p.status=['utkast'],p=>p.catalogFetched='2026-02-30',
    p=>p.cells.matematik=[null],p=>p.cells.constructor=[1]]) {
    reset();mutate(state.read);const response=await read(request({planId:id},'lasa'));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');
  }
  for(const response of [{id:other,revision:1,rowId:'matematik',hours:[100]},
    {id,revision:0,rowId:'matematik',hours:[100]},{id,revision:1,rowId:'no',hours:[100]},
    {id,revision:1,rowId:'matematik',hours:[999]},{id,revision:1,rowId:'matematik',hours:[100],secret:'private'}]) {
    reset();state.change=response;assert.equal((await change(request(cell()))).status,500);assert.equal(state.mutations.length,0);
  }
});
test('malformed JSON and extra input are denied without executing SQL',async()=>{
  reset();const malformed=new Request('http://localhost/api/timplaner/cell',{method:'POST',headers:{Origin:'http://localhost'},body:'{'});
  assert.equal((await change(malformed)).status,400);assert.equal(state.calls.length,0);
  reset();assert.equal((await change(request({...cell(),unitId:other}))).status,400);assert.equal(state.calls.length,0);
});
test('audit route is classified without retaining path identifiers or values',()=>{
  assert.equal(auditRoute(`http://localhost/api/timplaner/${id}?secret=private`),'/api/timplaner');
  assert.deepEqual(sanitizeAuditDetails({path:'/api/timplaner',hours:100,rowId:'matematik',planId:id}),{path:'/api/timplaner'});
});

test('closed list request rejects client selection filters and malformed pages',()=>{
  assert.deepEqual(adapter.parseTimplanList({page:1}),{page:1});
  for(const value of [null,[],{page:0},{page:100001},{page:1.5},{page:'1'},{page:1,unitId:id},{page:1,customerId:id},{page:1,function:'rektor'}]) assert.throws(()=>adapter.parseTimplanList(value));
});
test('list uses server scope, has collection audit even when empty and does not require write MFA',async()=>{
  for(const fn of ['huvudman','rektor']) {
    reset();state.fn=fn;state.mfa=false;
    const response=await list(request({page:1},'lista'));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),selection());
    assert.deepEqual(state.calls[0].values,[1]);assert.equal(state.events[0].action,'timplan_list_read');assert.equal(state.events[0].objectId,null);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal('plans' in state.events[0].details,false);
  }
  reset();state.list={plans:[],count:0,page:1,pageSize:50};
  const response=await list(request({page:1},'lista'));
  assert.equal(response.status,200);assert.equal(state.events.length,1);
});
test('list wrong role, bad body and audit outage yield no planning content',async()=>{
  for(const fn of ['administrator','larare','support','it','kundadmin']) {
    reset();state.fn=fn;assert.equal((await list(request({page:1},'lista'))).status,403);assert.equal(state.calls.length,0);
  }
  reset();assert.equal((await list(request({page:1,organizerId:id},'lista'))).status,400);assert.equal(state.calls.length,0);
  reset();state.auditFails=true;const failed=await list(request({page:1},'lista'));
  assert.equal(failed.status,500);assert.equal((await failed.json()).code,'audit_unavailable');assert.equal(state.events.length,0);
  reset();state.sqlError={code:'55000'};assert.equal((await list(request({page:1},'lista'))).status,500);
});
test('closed list response rejects duplicate IDs, raw fields, unsupported kind and inconsistent pagination',async()=>{
  for(const mutate of [p=>p.secret='private',p=>p.page=2,p=>p.pageSize=49,p=>p.count=-1,p=>p.count=2,
    p=>p.count=Number.MAX_SAFE_INTEGER+1,p=>p.plans[0].kind='gymnasium',p=>p.plans[0].revision=-1,
    p=>p.plans[0].customerId=id,p=>{p.plans.push({...p.plans[0]});p.count=2;}]) {
    reset();mutate(state.list);const response=await list(request({page:1},'lista'));
    assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
  reset();state.list={plans:[],count:1,page:2,pageSize:50};assert.equal((await list(request({page:2},'lista'))).status,200);
});
test('read preserves GR grade order and fails closed on invalid columns, width and education fields',async()=>{
  reset();const success=await read(request({planId:id},'lasa'));
  assert.deepEqual((await success.json()).education.grades,[9,1,4]);
  for(const mutate of [p=>p.education.grades=[1,1,4],p=>p.education.grades=[],p=>p.education.grades=[0,1,4],
    p=>p.education.grades=[[1],4,9],p=>p.education.secret='private',p=>p.education.kind='unknown',
    p=>p.cells.matematik=[1,2],p=>p.schoolName=null,p=>p.education.cohort=null]) {
    reset();mutate(state.read);assert.equal((await read(request({planId:id},'lasa'))).status,500);assert.equal(state.events.some(e=>e.outcome==='ok'),false);
  }
  reset();state.read.education={...state.read.education,kind:'introduktionsprogram',grades:[]};state.read.cells={'im-ma':[1]};
  assert.equal((await read(request({planId:id},'lasa'))).status,200);
  reset();state.read.education={...state.read.education,kind:'gymnasium',grades:[]};
  assert.equal((await read(request({planId:id},'lasa'))).status,200);
});
