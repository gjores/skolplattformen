import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {auditRoute} from './audit-details.ts';
const id='55101400-0000-4000-8000-000000000001',unit='55101400-0000-4000-8000-000000000002',hash='a'.repeat(64);
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
let state;
const fixture=globalThis.__schoolRegistryTest={
 env:{APP_MODE:'protected',DATABASE_URL:'postgres://synthetic@127.0.0.1:56322/postgres',SUPABASE_URL:'http://127.0.0.1:56321',OIDC_ISSUER:issuer,OIDC_CLIENT_ID:clientId,MFA_MAX_AGE_SECONDS:'28800',SESSION_SECRET:'synthetic-workspace-only'},
 session(){const future=new Date(Date.now()+60000);return{session:{id,identityId:id,membershipId:id,assignmentId:id,customerId:id,expiresAt:future,absoluteExpiresAt:future,epoch:1}};},
 async login(_corr,fn){return fn(fixture.tx);},
 async context(_ctx,fn){const eventCount=state.events.length;try{return await fn(fixture.tx,{sessionId:id,identityId:id,membershipId:id,assignmentId:id,customerId:id,organizerId:id,identity:{issuer,subject:'synthetic'},correlationId:id,accessFunction:state.fn,epoch:1,mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:state.mfa?'2':'1',amr:state.mfa?['pwd','otp']:['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date()}});}catch(error){state.events.length=eventCount;throw error;}},
 tx:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('select i.auth_user_id'))return[{function:state.fn,organizer_id:id}];if(sql.includes('insert into public.security_events')){if(state.auditFails)throw new Error('private audit');state.events.push({action:values[8],outcome:values[11]});return[];}state.calls.push({sql,values});if(state.sqlError)throw state.sqlError;if(sql.includes('phase5_school_registry_list'))return[{result:state.list}];if(sql.includes('phase5_school_registry_save'))return[{result:sql.includes('null, null, true')?state.status:state.saved}];throw new Error('Unexpected SQL');}
};fixture.tx.json=v=>v;
registerHooks({load(url,context,next){let source;if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__schoolRegistryTest.login(...a);export const withSessionContext=(...a)=>globalThis.__schoolRegistryTest.context(...a);`;if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__schoolRegistryTest.session();';if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__schoolRegistryTest.env;';return source?{format:'module',source,shortCircuit:true}:next(url,context);}});
const {GET:listRoute}=await import('../../app/api/skolor/route.ts');
const {POST:lookupRoute}=await import('../../app/api/skolor/register/route.ts');
const {POST:saveRoute}=await import('../../app/api/skolor/register/spara/route.ts');
const {POST:statusRoute}=await import('../../app/api/skolor/register/status/route.ts');
const {fetchSchoolRegistryUnit}=await import('./school-registry-upstream.ts');
const payload={meta:{modified:'2026-10-14'},data:{schoolUnitCode:'99999901',attributes:{displayName:'Syntetisk skola',status:'AKTIV',municipalityCode:'0000',schoolTypes:['GY'],schoolTypeProperties:{GY:{programmes:['SA']}}}},included:[{type:'organizer',organizationNumber:'9999999999',attributes:{displayName:'Syntetisk',municipalities:[{municipalityCode:'0000',displayName:'Testkommun'}]}}]};
const source=await fetchSchoolRegistryUnit('99999901',async()=>Response.json(payload));
const input=()=>({commandId:id,code:'99999901',operation:'import',expectedRevision:null,registryFingerprint:source.unit.registryFingerprint});
const lookup=()=>({kind:'code',value:'99999901'});
function reset(){state={fn:'huvudman',mfa:true,list:{organizer:{id,name:'Syntetisk',organizationNumber:'9999999999'},units:[]},status:{commandId:id,status:'not_found'},saved:{commandId:id,status:'saved',unitId:unit,code:'99999901',operation:'import',revision:hash,replayed:false},calls:[],events:[],fetches:[],payload:structuredClone(payload)};}
const realFetch=globalThis.fetch;
globalThis.fetch=async(url)=>{state.fetches.push(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);if(state.upstreamFails)throw new Error('private upstream');return Response.json(state.payload);};
test.after(()=>{globalThis.fetch=realFetch;delete globalThis.__schoolRegistryTest;});
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/skolor${path}`,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
const cases=[['',listRoute,()=>undefined],['/register',lookupRoute,lookup],['/register/spara',saveRoute,input],['/register/status',statusRoute,input]];
for(const[path,route,body]of cases){
 test(`${typeof path === 'string' && path ? path : 'list'}: role/epoch/body/SQL failures have no upstream or success`,async()=>{
  for(const role of ['rektor','administrator','kundadmin','larare','support']){reset();state.fn=role;assert.equal((await route(request(path,body()))).status,403);assert.equal(state.calls.length,0);assert.equal(state.fetches.length,0);}
  reset();const req=request(path,body());req.headers.set('X-Context-Epoch','2');assert.equal((await route(req)).status,409);assert.equal(state.calls.length,0);
  if(path){reset();assert.equal((await route(request(path,body(),'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);reset();assert.equal((await route(request(path,{...body(),role:'huvudman'}))).status,400);assert.equal(state.calls.length,0);}
  for(const[code,http]of[['42501',403],['40001',409],['22023',400],['23505',409],['P0002',404],['55000',500]]){reset();state.sqlError={code,message:'private SQL'};const response=await route(request(path,body()));assert.equal(response.status,http);assert.equal(JSON.stringify(await response.json()).includes('private'),false);}
 });
 test(`${typeof path === 'string' && path ? path : 'list'}: required audit and no-store; audit failure exposes no data`,async()=>{
  reset();let response=await route(request(path,body()));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(state.events.filter(e=>e.outcome==='ok').length,1);
  reset();state.auditFails=true;response=await route(request(path,body()));assert.equal(response.status,500);assert.equal((await response.json()).code,'audit_unavailable');assert.equal(state.events.filter(e=>e.outcome==='ok').length,0);
 });
}
test('save/status MFA required while audited reads available without step-up',async()=>{
 for(const[path,route,body]of cases){reset();state.mfa=false;assert.equal((await route(request(path,body()))).status,path.includes('/spara')||path.includes('/status')?403:200);}
});
test('new save checks receipt then own organization, compares fresh fingerprint, one final SQL write',async()=>{
 reset();const body=await(await saveRoute(request('/register/spara',input()))).json();assert.equal(body.unitId,unit);assert.equal(state.calls.length,3);assert.deepEqual(state.calls[0].values,[input()]);assert.equal(state.calls[0].sql.includes('null, null, true'),true);assert.deepEqual(state.calls[2].values.at(-1),payload);assert.equal(state.calls[2].sql.includes('false'),true);assert.equal(state.calls[2].values[1].organizationNumber,'9999999999');assert.equal(state.calls[2].values[1].registryFingerprint,input().registryFingerprint);assert.equal(state.fetches.length,1);assert.equal(state.events.find(e=>e.outcome==='ok').action,'school_registry_imported');
});
test('saved replay and missing status never fetch upstream or write even while upstream down',async()=>{
 for(const route of [saveRoute,statusRoute]){reset();state.status={...state.saved,replayed:true};state.upstreamFails=true;const response=await route(request('/register/status',input()));assert.equal(response.status,200);assert.equal((await response.json()).replayed,true);assert.equal(state.calls.length,1);assert.equal(state.fetches.length,0);}
 reset();state.upstreamFails=true;assert.deepEqual(await(await statusRoute(request('/register/status',input()))).json(),{commandId:id,status:'not_found'});assert.equal(state.fetches.length,0);assert.equal(state.calls.length,1);
});
test('changed source and foreign organizer stop before write; unavailable upstream is explicit',async()=>{
 for(const[mutate,expected]of[[()=>state.payload.data.attributes.displayName='Changed',409],[()=>state.payload.included[0].organizationNumber='8888888888',403],[()=>state.list.organizer.organizationNumber=null,403],[()=>state.upstreamFails=true,503]]){reset();mutate();const r=await saveRoute(request('/register/spara',input()));assert.equal(r.status,expected);assert.equal(state.calls.some(c=>c.sql.includes('false')),false);}
 reset();const r=await lookupRoute(request('/register',{kind:'organizationNumber',value:'8888888888'}));assert.equal(r.status,403);assert.equal(state.fetches.length,0);
});
test('organization lookup requires caller own number, returns strictly checked list',async()=>{
 reset();state.payload={data:{attributes:[{schoolUnitCode:'99999901',name:'Syntetisk',status:'AKTIV'}]}};const r=await lookupRoute(request('/register',{kind:'organizationNumber',value:'9999999999'}));assert.equal(r.status,200);assert.deepEqual(await r.json(),{kind:'organizationNumber',organizationNumber:'9999999999',units:[{code:'99999901',name:'Syntetisk',status:'AKTIV'}]});
});
test('malformed SQL and cross-command receipt fail closed; audit class strips code/query',async()=>{
 reset();state.list.units=[{hidden:'private'}];assert.equal((await listRoute(request(''))).status,500);
 reset();state.status={...state.saved,commandId:unit};assert.equal((await statusRoute(request('/register/status',input()))).status,500);
 assert.equal(auditRoute('https://example.test/api/skolor/register/99999901?name=private'),'/api/skolor');
});
