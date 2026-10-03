import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '55004000-0000-4000-8000-000000000001';
const other = '55004000-0000-4000-8000-000000000002';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
let state;
const fixture = globalThis.__programplanTermTest = {
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

    if(sql.includes('phase5_read_programplan_terms')) return [{result:state.read}];
    state.mutations.push(values); return [{result:state.result}];
  },
};
fixture.tx.json = v=>v;
registerHooks({load(url, context, next) {
  let source;
  if(url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error {constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=(...a)=>globalThis.__programplanTermTest.login(...a); export const withSessionContext=(...a)=>globalThis.__programplanTermTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__programplanTermTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__programplanTermTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
}});
const routes={read:(await import('../../app/api/programplaner/terminer/lasa/route.ts')).POST,write:(await import('../../app/api/programplaner/terminer/route.ts')).POST};
const distribution=[{rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]}];
const forms={read:{planId:id},write:{planId:id,expectedRevision:0,distribution}};
function expected(route){return{planId:id,revision:route==='write'?1:0,status:'utkast',distribution};}
function reset(route='read'){state={fn:'rektor',mfa:true,read:expected(route),result:expected(route),events:[],calls:[],mutations:[]};}
function request(route,body=forms[route],origin='http://localhost'){return new Request(`http://localhost/api/programplaner/terminer${route==='read'?'/lasa':''}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
for(const route of ['read','write'])test(`${route}: HM/rektor receive a closed audited result`,async()=>{
 for(const fn of ['huvudman','rektor']){reset(route);state.fn=fn;if(route==='read')state.mfa=false;const r=await routes[route](request(route));assert.equal(r.status,200);assert.deepEqual(await r.json(),expected(route));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(state.calls.length,1);assert.equal(state.events[0].objectId,id);assert.equal(state.events[0].action,route==='read'?'programplan_terms_read':'programplan_terms_changed');assert.equal('distribution' in state.events[0].details,false);}
});
for(const route of ['read','write'])test(`${route}: real role, SQL error, invalid response and audit failure deny`,async()=>{
 for(const fn of ['administrator','larare','support','it','kundadmin','elevhalsa','granskare']){reset(route);state.fn=fn;assert.equal((await routes[route](request(route))).status,403);assert.equal(state.calls.length,0);}
 reset(route);assert.equal((await routes[route](request(route,{...forms[route],actorId:id}))).status,400);assert.equal(state.calls.length,0);
 for(const [code,status] of [['40001',409],['42501',403],['22023',400],['55000',500]]){reset(route);state.sqlError={code,message:'private SQL'};const r=await routes[route](request(route));assert.equal(r.status,status);assert.equal(JSON.stringify(await r.json()).includes('private'),false);}
 reset(route);state.read.private='secret';state.result.private='secret';assert.equal((await routes[route](request(route))).status,500);assert.equal(state.mutations.length,0);
 reset(route);state.auditFails=true;const r=await routes[route](request(route));assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);
 reset(route);const stale=request(route);stale.headers.set('X-Context-Epoch','2');assert.equal((await routes[route](stale)).status,409);assert.equal(state.calls.length,0);
 if(route==='write'){reset(route);state.mfa=false;assert.equal((await routes[route](request(route))).status,403);reset(route);assert.equal((await routes[route](request(route,forms[route],'https://foreign.test'))).status,403);}
});
test('write verifies returned ID, revision, draft and exact distribution in same transaction',async()=>{
 for(const mutate of [p=>p.planId=other,p=>p.revision=0,p=>p.status='faststalld',p=>p.distribution=[]]){reset('write');mutate(state.result);assert.equal((await routes.write(request('write'))).status,500);assert.equal(state.mutations.length,0);}
 reset();state.read.planId=other;assert.equal((await routes.read(request('read'))).status,500);
});
