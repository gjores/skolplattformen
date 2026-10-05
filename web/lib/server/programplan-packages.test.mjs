import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '55004000-0000-4000-8000-000000000001';
const other = '55004000-0000-4000-8000-000000000002';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
let state;
const fixture = globalThis.__programplanPackagesTest = {
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

    if(sql.includes('phase5_read_programplan_unit_packages')||sql.includes('phase5_list_programplan_packages')) return [{result:state.read}];
    state.mutations.push(values); return [{result:state.result}];
  },
};
fixture.tx.json = v=>v;
registerHooks({load(url, context, next) {
  let source;
  if(url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error {constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=(...a)=>globalThis.__programplanPackagesTest.login(...a); export const withSessionContext=(...a)=>globalThis.__programplanPackagesTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__programplanPackagesTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__programplanPackagesTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
}});
const routes={read:(await import('../../app/api/programplaner/paketval/lasa/route.ts')).POST,write:(await import('../../app/api/programplaner/paketval/route.ts')).POST};
const {proposeLanguagePackages}=await import('../programplan-packages.ts');
const entries=proposeLanguagePackages({kind:'modernLanguage',points:200});
const forms={read:{planId:id},write:{planId:id,unitId:other,expectedRevision:0,blockId:'mosp',entries}};
function expected(route){return{planId:id,units:[{unitId:other,revision:route==='write'?1:0,selections:route==='write'?[{blockId:'mosp',entries}]:[]}]};}
function reset(route='read'){state={fn:'rektor',mfa:true,read:expected(route),result:expected(route),events:[],calls:[],mutations:[]};}
function request(route,body=forms[route],origin='http://localhost'){return new Request(`http://localhost/api/programplaner/paketval${route==='read'?'/lasa':''}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
for(const route of ['read','write'])test(`${route}: HM/rektor/administrator receive closed audited result`,async()=>{
 for(const fn of ['huvudman','rektor','administrator']){reset(route);state.fn=fn;if(route==='read')state.mfa=false;const r=await routes[route](request(route));assert.equal(r.status,200);assert.deepEqual(await r.json(),expected(route));assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(state.calls.length,1);assert.equal(state.events[0].objectId,id);assert.equal(state.events[0].action,route==='read'?'programplan_unit_packages_read':'programplan_unit_packages_changed');assert.equal('entries' in state.events[0].details,false);if(route==='write'){const {proof,...details}=state.events[0].details;assert.deepEqual(details,{accessFunction:fn,unitId:other,blockId:'mosp',packageRevision:1,count:6});assert.equal(proof.result,'accepted');}}
});
for(const route of ['read','write'])test(`${route}: role, epoch, origin, SQL denial, malformed response and mandatory audit fail closed`,async()=>{
 for(const fn of ['larare','support','it','kundadmin','elevhalsa','granskare']){reset(route);state.fn=fn;assert.equal((await routes[route](request(route))).status,403);assert.equal(state.calls.length,0);}
 reset(route);assert.equal((await routes[route](request(route,{...forms[route],actorId:id}))).status,400);assert.equal(state.calls.length,0);
 for(const [code,status] of [['40001',409],['42501',403],['22023',400],['55000',500]]){reset(route);state.sqlError={code,message:'private SQL'};const r=await routes[route](request(route));assert.equal(r.status,status);assert.equal(JSON.stringify(await r.json()).includes('private'),false);}
 reset(route);state.read.private='secret';state.result.private='secret';assert.equal((await routes[route](request(route))).status,500);assert.equal(state.mutations.length,0);
 reset(route);state.auditFails=true;const r=await routes[route](request(route));assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.mutations.length,0);
 reset(route);const stale=request(route);stale.headers.set('X-Context-Epoch','2');assert.equal((await routes[route](stale)).status,409);assert.equal(state.calls.length,0);
 reset(route);assert.equal((await routes[route](request(route,forms[route],'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
 if(route==='write'){reset(route);state.mfa=false;assert.equal((await routes[route](request(route))).status,403);}
});
test('write verifies plan, exact school, revision, submitted block entries and parameter order',async()=>{
 for(const mutate of [p=>p.planId=other,p=>p.units[0].unitId=id,p=>p.units[0].revision=0,p=>p.units[0].selections=[],p=>p.units[0].selections[0].entries.pop()]){reset('write');state.result=structuredClone(state.result);mutate(state.result);assert.equal((await routes.write(request('write'))).status,500);assert.equal(state.mutations.length,0);}
 reset('write');assert.equal((await routes.write(request('write'))).status,200);assert.deepEqual(state.calls[0].values,[id,other,0,'mosp',entries]);
 reset('read');state.read.planId=other;assert.equal((await routes.read(request('read'))).status,500);
 reset('write');state.result.units[0].selections=[];assert.equal((await routes.write(request('write',{...forms.write,entries:[]}))).status,200);
});

 test('school/block dependency hints become explicit conflict responses with no raw SQL',async()=>{for(const hint of ['programplan_unit_packages_in_use','programplan_block_packages_in_use']){reset('write');state.sqlError={code:'55006',hint,message:'private SQL'};const r=await routes.write(request('write'));assert.equal(r.status,409);assert.equal((await r.json()).code,hint);}});

const genericRoutes={list:(await import('../../app/api/programplaner/valpaket/lista/route.ts')).POST,save:(await import('../../app/api/programplaner/valpaket/route.ts')).POST};
const {default:catalog}=await import('../programplan-catalog.generated.json',{with:{type:'json'}});
const school=id,packageId=other,level={subjectCode:'IDRO',subjectVersion:1,itemCode:'IDRO2000X',points:100};
const definition={packageId,version:1,unitId:school,kind:'individualChoice',name:'Syntetiskt prov',catalogId:catalog.catalogId,levels:[level],points:100};
const genericForms={save:{packageId:null,expectedVersion:0,details:{unitId:school,kind:definition.kind,name:definition.name,levels:definition.levels}},list:{unitId:school}};
function genericReset(route){reset();state.read={unitId:school,packages:[structuredClone(definition)]};state.result=structuredClone(definition);if(route==='list')state.mfa=false;}
function genericRequest(route,body=genericForms[route],origin='http://localhost'){return new Request(`http://localhost/api/programplaner/valpaket${route==='list'?'/lista':''}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
for(const route of ['list','save'])test(`generic ${route}: closed DTO, role and scoped SQL parameters`,async()=>{
 for(const fn of ['huvudman','rektor','administrator']){genericReset(route);state.fn=fn;const r=await genericRoutes[route](genericRequest(route));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),route==='list'?state.read:state.result);assert.equal(state.events[0].action,route==='list'?'programplan_packages_read':'programplan_package_saved');assert.deepEqual(state.calls[0].values,route==='list'?[school]:[null,0,genericForms.save.details]);assert.equal(state.events[0].details.name,undefined);assert.equal(state.events[0].details.levels,undefined);if(route==='save')assert.equal(state.events[0].details.packageVersion,1);}
});
for(const route of ['list','save'])test(`generic ${route}: role/MFA/origin/CAS/audit and invalid replies fail closed`,async()=>{
 for(const fn of ['larare','support','it','kundadmin','granskare']){genericReset(route);state.fn=fn;assert.equal((await genericRoutes[route](genericRequest(route))).status,403);assert.equal(state.calls.length,0);}
 genericReset(route);assert.equal((await genericRoutes[route](genericRequest(route,{...genericForms[route],actorId:id}))).status,400);assert.equal(state.calls.length,0);
 genericReset(route);assert.equal((await genericRoutes[route](genericRequest(route,genericForms[route],'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
 genericReset(route);state.sqlError={code:'40001',message:'private SQL'};assert.equal((await genericRoutes[route](genericRequest(route))).status,409);
 genericReset(route);state.sqlError={code:'42501',message:'private SQL'};const deny=await genericRoutes[route](genericRequest(route));assert.equal(deny.status,403);assert.equal(JSON.stringify(await deny.json()).includes('private'),false);
 genericReset(route);state.auditFails=true;assert.equal((await genericRoutes[route](genericRequest(route))).status,500);assert.equal(state.mutations.length,0);
 genericReset(route);if(route==='list')state.read.unitId=other;else state.result.version=2;assert.equal((await genericRoutes[route](genericRequest(route))).status,500);assert.equal(state.mutations.length,0);
 if(route==='save'){genericReset(route);state.mfa=false;assert.equal((await genericRoutes[route](genericRequest(route))).status,403);assert.equal(state.calls.length,0);}
});
test('generic version save matches exact immutable identity, details and increment',async()=>{
 const update={...genericForms.save,packageId,expectedVersion:1};
 genericReset('save');state.result.version=2;assert.equal((await genericRoutes.save(genericRequest('save',update))).status,200);
 for(const mutate of [p=>p.packageId=id,p=>p.unitId=other,p=>p.version=1,p=>p.name='Forged',p=>p.kind='specialization',p=>p.levels=[],p=>p.extra=true,p=>p.points=200,p=>p.catalogId='sha256:'+'0'.repeat(64)]){genericReset('save');state.result.version=2;mutate(state.result);assert.equal((await genericRoutes.save(genericRequest('save',update))).status,500);assert.equal(state.mutations.length,0);}
 genericReset('list');state.read.packages[0].unitId=other;assert.equal((await genericRoutes.list(genericRequest('list'))).status,500);
});
test('mixed language/package unit selections preserve frozen references with no embedded levels',async()=>{
 const mixed=[entries[0],{ref:{type:'package',packageId,version:1},distribution:[{levelKey:'IDRO:1:IDRO2000X',points:[0,0,0,0,0,100]}]}];reset('write');state.result.units[0].selections[0].entries=mixed;const r=await routes.write(request('write',{...forms.write,entries:mixed}));assert.equal(r.status,200);assert.deepEqual((await r.json()).units[0].selections[0].entries,mixed);assert.deepEqual(state.calls[0].values[4],mixed);
});
