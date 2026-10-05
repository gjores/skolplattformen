import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '55004000-0000-4000-8000-000000000001';
const other = '55004000-0000-4000-8000-000000000002';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
let state;
const fixture = globalThis.__programplanTest = {
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
    
    if(sql.includes('phase5_read_programplan')) return [{result:state.read}];
    state.mutations.push(values); return [{result:state.result}];
  },
};
fixture.tx.json = v=>v;
registerHooks({load(url, context, next) {
  let source;
  if(url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error {constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=(...a)=>globalThis.__programplanTest.login(...a); export const withSessionContext=(...a)=>globalThis.__programplanTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__programplanTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__programplanTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
}});
const adapter=await import('./programplan-planning.ts');
const contract=await import('../programplan-contract.ts');
const {reference,plan}=await import('../programplan-contract.test.mjs');
const {auditRoute,sanitizeAuditDetails}=await import('./audit-details.ts');
const routes={};for(const name of ['lasa','binda','fordjupning','skapa','klona','block'])routes[name]=(await import(`../../app/api/programplaner/${name}/route.ts`)).POST;
const forms={block:{planId:id,expectedRevision:0,choiceBlocks:reference().choiceBlocks},lasa:{planId:id},binda:{planId:id,expectedRevision:0,basisReference:reference()},fordjupning:{planId:id,expectedRevision:0,specializationRefs:reference().specializationRefs},skapa:{offeringId:id,expectedLatestVersion:0,basisReference:reference()},klona:{sourcePlanId:other,expectedSourceRevision:0,expectedLatestVersion:0,explicitLegacyBasis:reference()}};
function expected(route){return {...plan(),id,offeringId:id,unitId:id,revision:['binda','fordjupning','block'].includes(route)?1:0};}
function reset(route='lasa'){state={fn:'rektor',mfa:true,read:expected(route),result:expected(route),events:[],calls:[],mutations:[]};}
function request(route,body=forms[route],origin='http://localhost'){return new Request(`http://localhost/api/programplaner/${route}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
for(const route of Object.keys(routes))test(`${route}: HM/rektor har parametriserad operation och minimerad audit`,async()=>{
 for(const fn of ['huvudman','rektor']){reset(route);state.fn=fn;if(route==='lasa')state.mfa=false;const response=await routes[route](request(route));assert.equal(response.status,200);assert.deepEqual(await response.json(),expected(route));assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(state.events[0].objectId,id);assert.equal(state.events[0].action,{block:'programplan_blocks_changed',lasa:'programplan_read',binda:'programplan_basis_bound',fordjupning:'programplan_specialization_changed',skapa:'programplan_draft_created',klona:'programplan_draft_cloned'}[route]);assert.equal('basisReference'in state.events[0].details,false);assert.equal(state.calls.length,1);}
});
for(const route of Object.keys(routes))test(`${route}: roll, slutna requests, SQLfel, råsvar och auditfel stoppar`,async()=>{
 for(const fn of ['administrator','larare','support','it','kundadmin','elevhalsa','granskare']){reset(route);state.fn=fn;assert.equal((await routes[route](request(route))).status,403);assert.equal(state.calls.length,0);}
 reset(route);assert.equal((await routes[route](request(route,{...forms[route],actorId:id}))).status,400);assert.equal(state.calls.length,0);
 for(const [code,status]of [['40001',409],['42501',403],['22023',400],['55000',500]]){reset(route);state.sqlError={code,message:'private SQL'};const r=await routes[route](request(route));assert.equal(r.status,status);assert.equal(JSON.stringify(await r.json()).includes('private'),false);}
 reset(route);state.read.private='hidden';state.result.private='hidden';assert.equal((await routes[route](request(route))).status,500);assert.equal(state.mutations.length,0);
 reset(route);state.auditFails=true;const r=await routes[route](request(route));assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);
 if(route!=='lasa'){reset(route);state.mfa=false;assert.equal((await routes[route](request(route))).status,403);assert.equal(state.calls.length,0);reset(route);assert.equal((await routes[route](request(route,forms[route],'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);}
 reset(route);const stale=request(route);stale.headers.set('X-Context-Epoch','2');assert.equal((await routes[route](stale)).status,409);assert.equal(state.calls.length,0);
});
test('operationens ID/revision/version/ordnade val kontrolleras inom transaktionen',async()=>{
 for(const [route,mutations]of Object.entries({block:[p=>p.id=other,p=>p.revision=0,p=>p.basisReference.choiceBlocks.reverse(),p=>p.basisReference.choiceBlocks[0].points=100,p=>p.status='faststalld'],binda:[p=>p.id=other,p=>p.revision=0,p=>p.basisReference.specializationRefs.reverse(),p=>p.status='faststalld'],fordjupning:[p=>p.id=other,p=>p.revision=2,p=>p.basisReference.specializationRefs=[]],skapa:[p=>p.offeringId=other,p=>p.version=2,p=>p.revision=1,p=>p.decidedOn='2026-10-01'],klona:[p=>p.id=other,p=>p.version=2,p=>p.revision=1,p=>p.basisReference.specializationRefs.reverse()]}))for(const mutate of mutations){reset(route);mutate(state.result);const r=await routes[route](request(route));assert.equal(r.status,500);assert.equal(state.mutations.length,0);}
 reset();state.read.id=other;assert.equal((await routes.lasa(request('lasa'))).status,500);
 assert.equal(auditRoute(`http://localhost/api/programplaner/${id}?secret=private`),'/api/programplaner');assert.deepEqual(sanitizeAuditDetails({path:'/api/programplaner',basisReference:reference(),sourcePlanId:id}),{path:'/api/programplaner'});
 assert.throws(()=>adapter.programplanRequest(contract.parseProgramplanRead,{planId:'invalid'}));
});
