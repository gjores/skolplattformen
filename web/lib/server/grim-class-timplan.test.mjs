import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id='55402100-0000-4000-8000-000000000001',unit='55402100-0000-4000-8000-000000000002',offering='55402100-0000-4000-8000-000000000003',planId='55402100-0000-4000-8000-000000000004';
const issuer='http://host.docker.internal:8180/realms/skolplattform-test',clientId='skolplattform-worker';
let state;
const fixture=globalThis.__grimClassTest={
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
    if(sql.includes('phase51_grim_class_underlag'))return[{result:state.underlag}];
    if(sql.includes('phase51_grim_class_command')){state.mutations.push(values);return[{result:state.reply}];}
    throw new Error('Unexpected synthetic query');
  },
};fixture.tx.json=value=>value;
registerHooks({load(url,context,next){let source;
  if(url===new URL('./db.ts',import.meta.url).href)source=`export class Deny extends Error{constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;}}export const withLoginPhase=(...a)=>globalThis.__grimClassTest.login(...a);export const withSessionContext=(...a)=>globalThis.__grimClassTest.context(...a);`;
  if(url===new URL('./session.ts',import.meta.url).href)source='export const readSession=async()=>globalThis.__grimClassTest.session();';
  if(url===new URL('./env.ts',import.meta.url).href)source='export const serverEnv=()=>globalThis.__grimClassTest.env;';
  return source?{format:'module',source,shortCircuit:true}:next(url,context);
}});
const {POST:read}=await import('../../app/api/klasser/grim/underlag/route.ts');
const {POST:create}=await import('../../app/api/klasser/grim/skapa/route.ts');
const {POST:link}=await import('../../app/api/klasser/grim/koppla/route.ts');
const series={id:unit,name:'Grundfördelning',revision:0};
const creation={commandId:id,planId,expectedPlanRevision:2,name:'7A'};
const binding={commandId:id,classId:id,planId,expectedPlanRevision:2,columnId:'ak7',expectedLinkRevision:null,previousPlanId:null};
function reset(){state={fn:'rektor',mfa:true,underlag:{plan:{id:planId,offeringId:offering,unitId:unit,schoolName:'Syntetisk skola',educationName:'GR 7–9',kind:'grundskola',series,version:1,status:'faststalld',revision:2},
 schoolYear:2026,columns:[{id:'ak7',label:'Åk 7'}],canManage:true,blockers:[],classes:[],legacyRows:[]},reply:{id,name:'7A',startYear:2026,replayed:false},events:[],calls:[],mutations:[]};}
function request(path,body,origin='http://localhost'){return new Request(`http://localhost/api/klasser/grim/${path}`,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
test('huvudman, rektor och administratör läser med obligatorisk audit och samma ursprung',async()=>{for(const fn of ['huvudman','rektor','administrator']){reset();state.fn=fn;state.mfa=false;const r=await read(request('underlag',{planId}));assert.equal(r.status,200);assert.equal(state.events[0].action,'grim_class_read');assert.match(state.calls[0].sql,/phase51_grim_class_underlag/);}
 reset();assert.equal((await read(request('underlag',{planId},'http://foreign'))).status,403);assert.equal(state.calls.length,0);});
test('koppla-rutten anropar phase51_grim_class_command och skriver exakt en security_events-rad',async()=>{reset();state.reply={classId:id,schoolYear:2026,planId,columnId:'ak7',revision:0,adopted:false,replayed:false};
 const r=await link(request('koppla',binding));assert.equal(r.status,200);assert.equal(state.mutations.length,1);assert.match(state.calls[0].sql,/phase51_grim_class_command/);
 assert.equal(state.calls[0].values[0].action,'link');assert.equal(state.events.length,1);assert.equal(state.events[0].action,'grim_class_linked');assert.equal(state.events[0].objectId,id);});
test('bara rektor och administratör skapar och kopplar',async()=>{for(const fn of ['rektor','administrator']){reset();state.fn=fn;assert.equal((await create(request('skapa',creation))).status,200);
 state.reply={classId:id,schoolYear:2026,planId,columnId:'ak7',revision:0,adopted:false,replayed:false};assert.equal((await link(request('koppla',binding))).status,200);}
 for(const fn of ['huvudman','larare','kundadmin']){reset();state.fn=fn;assert.equal((await create(request('skapa',creation))).status,403);assert.equal((await link(request('koppla',binding))).status,403);assert.equal(state.mutations.length,0);}});
test('MFA och CSRF stoppar skrivning innan SQL',async()=>{for(const mode of ['mfa','csrf']){reset();if(mode==='mfa')state.mfa=false;const r=await create(request('skapa',creation,mode==='csrf'?'http://foreign':'http://localhost'));assert.equal(r.status,403);assert.equal(state.mutations.length,0);}});
test('inaktuell revision ger 409 och auditfel rullar tillbaka',async()=>{reset();state.sqlError=Object.assign(new Error('stale'),{code:'40001',hint:'grim_class_link_revision'});const r=await link(request('koppla',binding));assert.equal(r.status,409);assert.equal((await r.json()).code,'grim_class_link_revision');
 reset();state.sqlError=Object.assign(new Error('dup'),{code:'22023',hint:'grim_class_duplicate'});const d=await create(request('skapa',creation));assert.equal(d.status,400);assert.equal((await d.json()).code,'grim_class_duplicate');
 reset();state.auditFails=true;assert.equal((await create(request('skapa',creation))).status,500);assert.equal(state.mutations.length,0);
 reset();state.sqlError=Object.assign(new Error('audit'),{code:'55000'});assert.equal((await create(request('skapa',creation))).status,500);});
test('svar som inte motsvarar begäran godtas inte',async()=>{reset();state.reply={classId:id,schoolYear:2026,planId,columnId:'ak8',revision:0,adopted:false,replayed:false};assert.equal((await link(request('koppla',binding))).status,500);
 reset();assert.equal((await link(request('koppla',{...binding,columnId:'ar1'}))).status,400);assert.equal(state.mutations.length,0);});
