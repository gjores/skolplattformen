import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
const id='55101000-0000-4000-8000-000000000001', unit='55101000-0000-4000-8000-000000000002';
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
const artifact=JSON.parse(await readFile(new URL('../programplan-catalog.generated.json',import.meta.url),'utf8'));
let state;
const fixture=globalThis.__programplanEducationTest={
 env:{APP_MODE:'protected',DATABASE_URL:'postgres://synthetic@127.0.0.1:56322/postgres',SUPABASE_URL:'http://127.0.0.1:56321',OIDC_ISSUER:issuer,OIDC_CLIENT_ID:clientId,MFA_MAX_AGE_SECONDS:'28800',SESSION_SECRET:'synthetic-workspace-only'},
 session(){const future=new Date(Date.now()+60000);return{session:{id,identityId:id,membershipId:id,assignmentId:id,customerId:id,expiresAt:future,absoluteExpiresAt:future,epoch:1}};},
 async login(_corr,fn){return fn(fixture.tx);},
 async context(_ctx,fn){const eventCount=state.events.length;try{return await fn(fixture.tx,{sessionId:id,identityId:id,membershipId:id,assignmentId:id,customerId:id,identity:{issuer,subject:'synthetic'},correlationId:id,accessFunction:state.fn,epoch:1,mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:'1',amr:['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date()}});}catch(error){state.events.length=eventCount;throw error;}},
 tx:async(strings,...values)=>{const sql=strings.join('?');if(sql.includes('select i.auth_user_id'))return[{function:state.fn}];if(sql.includes('insert into public.security_events')){if(state.auditFails)throw new Error('private audit content');state.events.push({action:values[8],objectType:values[9],objectId:values[10],outcome:values[11],details:values[12]});return[];}state.calls.push({sql,values});if(state.sqlError)throw state.sqlError;return[{result:sql.includes('phase5_programplan_selection')?state.selection:state.result}];},
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__programplanEducationTest.login(...a);export const withSessionContext=(...a)=>globalThis.__programplanEducationTest.context(...a);`;if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__programplanEducationTest.session();';if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__programplanEducationTest.env;';return source?{format:'module',source,shortCircuit:true}:next(url,context);}});
const {POST:selection}=await import('../../app/api/programplaner/val/route.ts');
const {POST:create}=await import('../../app/api/programplaner/utbildning/skapa/route.ts');
const {POST:status}=await import('../../app/api/programplaner/utbildning/status/route.ts');
const routes={val:selection,'utbildning/skapa':create,'utbildning/status':status};
const basis=()=>({catalogId:artifact.catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:'2026-08-01',specializationRefs:[],choiceBlocks:[{id:'mosp',kind:'modernLanguage',points:200,name:'Moderna språk'},{id:'iv1',kind:'individualChoice',points:200,name:'Individuellt val'}]});
const createInput=()=>({commandId:id,unitId:unit,name:'Syntetisk',localCode:null,cohort:'Kull',basisReference:basis()});
const selectionInput=()=>({unitId:unit,catalogId:artifact.catalogId,programRef:{code:'SA25',version:4}});
function reset(route='val'){
 const{catalogId,...payload}=structuredClone(artifact);
 const education={id,unitId:unit,schoolName:'Syntetisk skola',kind:'gymnasium',name:'Syntetisk',localCode:null,cohort:'Kull',startYear:2026,status:'planerad',programCode:'SA25',orientationCode:'SABEP',latestVersion:1,draftId:id};
 const plan={id,offeringId:id,unitId:unit,schoolName:'Syntetisk skola',education:{name:'Syntetisk',cohort:'Kull',programCode:'SA25',orientationCode:'SABEP'},version:1,revision:0,status:'utkast',decidedOn:null,catalogId,basisReference:basis(),resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[],decisionReady:false}};
 state={fn:'huvudman',selection:{units:[{id:unit,name:'Syntetisk skola'}],canCreateEducation:true,catalogs:[{catalogId,source:artifact.source}],selection:selectionInput(),payload,decisionReady:false},result:route==='utbildning/status'?{commandId:id,status:'created',education,plan}:{commandId:id,education,plan,replayed:false},calls:[],events:[]};
}
function request(route,body=route==='val'?selectionInput():route==='utbildning/skapa'?createInput():{commandId:id},origin='http://localhost'){return new Request(`http://localhost/api/programplaner/${route}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
// Test proof profile is strong only for explicit create tests.
const originalContext=fixture.context.bind(fixture);const baseContext=(...args)=>originalContext(...args);fixture.context=async(...args)=>{const[ctx,fn]=args;return baseContext(ctx,(tx,c)=>{if(state.mfa){c.mfa.acr='2';c.mfa.amr=['pwd','otp'];}return fn(tx,c);});};
for(const route of Object.keys(routes))test(`${route}: exact SQL result and required Worker audit`,async()=>{reset(route);state.mfa=true;const r=await routes[route](request(route));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');const body=await r.json();assert.equal(state.events.filter(e=>e.outcome==='ok').length,1);assert.equal(body.commandId??body.selection.programRef.code,route==='val'?'SA25':id);if(route==='val'){assert.ok(body.projection.subjects.length<artifact.subjects.length);assert.equal('payload'in body,false);}else if(route==='utbildning/skapa'){assert.equal(state.calls.length,2);assert.deepEqual(state.calls[1].values,[id,unit,'Syntetisk',null,'Kull',basis()]);}else assert.equal(body.status,'created');});
for(const route of Object.keys(routes))test(`${route}: denied authority, origin, epoch, malformed input and audit rollback`,async()=>{
 for(const fn of ['larare','it','kundadmin','support',...(route==='val'?[]:['rektor','administrator'])]){reset(route);state.fn=fn;state.mfa=true;const r=await routes[route](request(route));assert.equal(r.status,403);assert.equal(state.calls.length,0);}
 reset(route);state.mfa=true;const stale=request(route);stale.headers.set('X-Context-Epoch','2');assert.equal((await routes[route](stale)).status,409);assert.equal(state.calls.length,0);
 reset(route);state.mfa=true;assert.equal((await routes[route](request(route,undefined,'https://foreign.test'))).status,403);assert.equal(state.calls.length,0);
 reset(route);state.mfa=true;const invalid=request(route);const body=JSON.parse(await invalid.text());body.role='huvudman';assert.equal((await routes[route](request(route,body))).status,400);assert.equal(state.calls.length,0);
 for(const[code,expected]of[['42501',403],['22023',400],['40001',409],['55000',500]]){reset(route);state.mfa=true;state.sqlError={code,message:'private SQL'};const r=await routes[route](request(route));assert.equal(r.status,expected);assert.equal(JSON.stringify(await r.json()).includes('private'),false);}
 reset(route);state.mfa=true;state.auditFails=true;const r=await routes[route](request(route));assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.events.filter(e=>e.outcome==='ok').length,0);
});
test('new education needs MFA; rektor selection is read only; null selection sends SQL null',async()=>{reset('utbildning/skapa');assert.equal((await create(request('utbildning/skapa'))).status,403);assert.equal(state.calls.length,0);for(const fn of ['rektor','administrator']){reset();state.fn=fn;state.selection.canCreateEducation=false;const read=await selection(request('val'));assert.equal(read.status,200);assert.equal((await read.json()).canCreateEducation,false);}reset();const input={unitId:unit,catalogId:null,programRef:null};state.selection.selection=input;state.selection.payload=null;const r=await selection(request('val',input));assert.equal(r.status,200);assert.equal((await r.json()).projection,null);assert.equal(state.calls[0].values[2],null);});
test('whole catalogue tamper, extra metadata, mismatched pin or command cannot return success',async()=>{
 for(const mutate of [()=>state.selection.payload.programs[0].name='Tampered',()=>state.selection.private='secret',()=>state.result.plan.basisReference.startedOn='2026-08-02',()=>state.result.commandId=unit]){reset('utbildning/skapa');state.mfa=true;mutate();const r=await create(request('utbildning/skapa'));assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.events.filter(e=>e.outcome==='ok').length,0);}
 reset();state.selection.selection.programRef={code:'SA25',version:3};assert.equal((await selection(request('val'))).status,500);
 reset('utbildning/status');state.result={commandId:id,status:'not_found'};assert.deepEqual(await(await status(request('utbildning/status'))).json(),{commandId:id,status:'not_found'});
});
