import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const id=n=>`73110500-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),pupilId:id(2),participant:'pupil'};
let state;
const fixture=globalThis.__electiveAuthorityTest={
 env:{APP_MODE:'protected',DATABASE_URL:'postgres://synthetic@127.0.0.1:56322/postgres',SUPABASE_URL:'http://127.0.0.1:56321',OIDC_ISSUER:'http://host.docker.internal:8180/realms/skolplattform-test',OIDC_CLIENT_ID:'skolplattform-worker',MFA_MAX_AGE_SECONDS:'28800',SESSION_SECRET:'synthetic-elective-only',SESSION_IDLE_SECONDS:'1800'},
 session(){if(state.noSession)return null;const future=new Date(Date.now()+60000);return{token:'synthetic-browser-token',session:{id:id(3),identityId:id(4),membershipId:null,assignmentId:null,customerId:null,issuer:'https://synthetic.example.test',subject:'synthetic-pupil',epoch:1,expiresAt:state.expired?new Date(0):future,absoluteExpiresAt:future,revokedAt:state.revoked?new Date():null}};},
 async login(_corr,fn){const before=state.effects,events=state.events.length;try{return await fn(fixture.tx);}catch(e){state.effects=before;state.events.length=events;throw e;}},
 async tx(strings,...values){const sql=strings.join('?');if(sql.includes('insert into public.security_events')){if(state.auditFails&&values[11]==='ok')throw new Error('private-audit-failure');state.events.push({outcome:values[11]});return[];}
  if(sql.includes('elective_participant_touch')){state.touches++;return[];}
  if(sql.includes('elective_participant_contexts')){if(state.sqlError)throw state.sqlError;return[{result:state.index}];}
  if(sql.includes('elective_participant_scope')){state.scopes++;if(state.sqlError)throw state.sqlError;return[{result:state.authority}];}
  throw new Error('unexpected synthetic query');}
};fixture.tx.json=x=>x;
registerHooks({load(url,context,next){let source;
 if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__electiveAuthorityTest.login(...a);export const withSessionContext=()=>{throw Error('staff context must not be used');};`;
 if(url===new URL('./session.ts',import.meta.url).href)source=`export const readSession=async()=>globalThis.__electiveAuthorityTest.session();export const tokenHash=async()=>new Uint8Array(32).fill(1);`;
 if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__electiveAuthorityTest.env;';
 return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {participantRoute,participantIndexRoute}=await import('./elective-participant-route.ts');
const {POST:staffBindings}=await import('../../app/api/valbara-block/bindningar/lasa/route.ts');
function reset(){state={effects:0,events:[],scopes:0,touches:0,authority:{...scope,identityId:id(4),bindingId:id(5),bindingRevision:1,customerId:id(6),organizerId:id(7),epoch:1,confirmationRequired:false},index:{contractVersion:'elective_self_v1',epoch:1,participants:[]}};}
const req=(extra={})=>new Request('http://localhost:3012/api/valbara-block/egen/kommando',{method:'POST',headers:{Origin:'http://localhost:3012',...extra}});
const handler=async(ctx)=>{assert.equal(ctx.assignmentId,null);assert.equal(ctx.appRole,null);assert.equal(ctx.accessFunction,null);state.effects++;return{body:{saved:true},event:{action:'elective_choice_submitted',objectType:'elective_choice',objectId:id(8)}};};
async function response(request=req(),opts={mutating:true,scope}){const r=await participantRoute(request,'elective_choice_submitted',opts,handler);return{status:r.status,body:await r.json()};}
test('true participant without any staff assignment can use scoped path',async()=>{reset();assert.equal((await response()).status,200);assert.equal(state.effects,1);assert.equal(state.scopes,1);assert.equal(state.touches,1);});
test('cookie absent, expired and revoked stop before handler',async()=>{for(const flag of ['noSession','expired','revoked']){reset();state[flag]=true;const r=await response();assert.equal(r.status,401);assert.equal(state.effects,0);assert.equal(state.scopes,0);}});
test('cross origin and old epoch stop before SQL and business logic',async()=>{reset();assert.equal((await response(req({Origin:'https://outside.example.test'}))).status,403);assert.equal(state.scopes,0);reset();assert.equal((await response(req({'X-Context-Epoch':'2'}))).status,409);assert.equal(state.effects,0);});
test('live SQL revocation, another child and binding denial are enforced',async()=>{for(const error of [{code:'42501',hint:'elective_session_revoked'},{code:'42501',hint:'elective_session_expired'},{code:'42501'},{code:'40001',hint:'elective_context_changed'}]){reset();state.sqlError=error;assert.ok([401,403,409].includes((await response()).status));assert.equal(state.effects,0);}});
test('malformed or wrong authority cannot release data',async()=>{for(const change of [{identityId:id(9)},{pupilId:id(9)},{unitId:id(9)},{epoch:2},{participant:'guardian'},{unexpected:'private'}]){reset();Object.assign(state.authority,change);assert.equal((await response()).status,500);assert.equal(state.effects,0);}});
test('changed binding revision stops before command',async()=>{reset();const r=await response(req(),{mutating:true,scope,expectedBindingRevision:2});assert.equal(r.status,409);assert.equal(state.effects,0);});
test('audit failure rolls back participant business effect',async()=>{reset();state.auditFails=true;assert.equal((await response()).status,500);assert.equal(state.effects,0);assert.equal(state.touches,0);});
test('unknown SQL detail is never exposed',async()=>{reset();state.sqlError={code:'XX999',message:'private pupil secret'};const r=await response();assert.equal(r.status,500);assert.ok(!JSON.stringify(r.body).includes('private pupil'));assert.equal(state.effects,0);});
test('own contexts can be listed without personal role and strict projection',async()=>{reset();let r=await participantIndexRoute(new Request('http://localhost:3012/api/valbara-block/egen/urval'));assert.equal(r.status,200);assert.deepEqual((await r.json()).participants,[]);state.index.email='private';r=await participantIndexRoute(new Request('http://localhost:3012/api/valbara-block/egen/urval'));assert.equal(r.status,500);});
test('participant session still cannot reach ordinary staff binding route',async()=>{reset();const r=await staffBindings(req());assert.equal(r.status,403);assert.equal((await r.json()).code,'no_context');assert.equal(state.effects,0);});
