import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '33000000-0000-4000-8000-000000000001';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
const env = { APP_MODE: 'protected', DATABASE_URL: 'postgres://test@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-test-only-secret' };
let state;
const fixture = globalThis.__registerTest = {
  env,
  session() { const future = new Date(Date.now() + 60_000); return { session: { id, identityId:id, membershipId:id, assignmentId:id, customerId:id, expiresAt:future, absoluteExpiresAt:future, epoch:1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const before = state.granted;
    const count = state.events.length;
    try { return await fn(fixture.tx, { sessionId:id, identityId:id, assignmentId:id, membershipId:id, customerId:id, correlationId:id, identity:{issuer,subject:'synthetic'}, accessFunction:state.fn, epoch:1, mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:'2',amr:state.mfa ? ['pwd','otp'] : ['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date(Date.now()-500)} }); }
    catch (error) { state.granted=before; state.events.length=count; throw error; }
  },
  tx: async (strings,...values) => {
    const sql=strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{function:state.fn}];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails || state.failAction === values[8] || state.failEventAt===state.events.length+1) throw new Error('private audit details');
      state.events.push({action:values[8],outcome:values[11],details:values[12]}); return [];
    }
    state.calls.push({sql,values});
    if (sql.includes('phase4_')) { if(state.sqlError) throw state.sqlError; return [{result:state.result}]; }
    throw new Error('unexpected test query');
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} } export const withLoginPhase=(...args)=>globalThis.__registerTest.login(...args); export const withSessionContext=(...args)=>globalThis.__registerTest.context(...args);`;
  if (url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__registerTest.session();';
  if (url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__registerTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
} });
const adapter = await import('./pupil-register.ts');
const {POST} = await import('../../app/api/elever/lista/route.ts');
const {GET:card} = await import('../../app/api/elever/elev/route.ts');
const {GET:selectionRoute} = await import('../../app/api/elever/urval/route.ts');
const {GET:history} = await import('../../app/api/elever/historik/route.ts');
const selection={schoolYear:2026,unitId:id,classId:null,educationId:null,grade:null,status:null,page:1};
const input=()=>({selection:{...selection},search:'',caseId:null});
const caps={canEdit:false,canExport:false,canRevealPersonalNumber:false,canReadHistory:false};
const pupil=()=>({id,displayName:'Anonym elev',unitId:id,unitName:'Provskola',classId:null,className:null,educationId:id,educationName:'Provutbildning',grade:1,status:'aktuell',capabilities:{...caps}});
const list=()=>({pupils:[pupil()],scope:{schools:[{id,name:'Provskola'}],groups:[],cases:[]},options:{schools:[{id,name:'Provskola'}],classes:[],educations:[],grades:[1],statuses:['aktuell']},capabilities:{...caps,canReadProtected:false},count:1,page:1,pageSize:50});
function reset(body=list()) { state={fn:'administrator',mfa:true,granted:false,auditFails:false,calls:[],events:[],result:{kind:'success',body,auditRefs:[]}}; }
function req(body=input(),origin='http://localhost') {return new Request('http://localhost/api/elever/lista',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},body:JSON.stringify(body)});}
function get(path='elev',extra='') {return new Request(`http://localhost/api/elever/${path}?pupilId=${id}&schoolYear=2026${extra}`,{headers:{'X-Context-Epoch':'1'}});}
test('closed parsers reject actor, extra nested fields, bad dates/UUID/year/page and duplicate query',()=>{
 assert.deepEqual(adapter.parsePupilListRequest(input(),'administrator'),input());
 for(const value of [{...input(),actorId:id},{...input(),selection:{...selection,actorId:id}},{...input(),selection:{...selection,schoolYear:9999}},{...input(),selection:{...selection,page:0}},{...input(),selection:{...selection,unitId:'bad'}},{...input(),search:3}]) assert.throws(()=>adapter.parsePupilListRequest(value,'administrator'));
 assert.throws(()=>adapter.parsePupilCardQuery(new URL(get().url+'&&pupilId='+id).searchParams));
 assert.throws(()=>adapter.parsePupilCardQuery(new URL(get().url+'&search=secret').searchParams));
 assert.throws(()=>adapter.parsePupilChangeRequest({pupilId:id,schoolYear:2026,caseId:null,expectedVersion:1,kind:'municipality',payload:{municipalityCode:'0180',startsOn:'2026-02-30',endsOn:null}}));
 assert.throws(()=>adapter.parsePupilListRequest({...input(),search:'20090101-1234'},'larare'));
});
test('list route parameterizes selection and commits audit before no-store response',async()=>{
 reset(); const response=await POST(req()); assert.equal(response.status,200); assert.deepEqual(await response.json(),list()); assert.equal(response.headers.get('cache-control'),'no-store'); assert.equal(state.events.at(-1).action,'pupil_list_read'); assert.equal(state.calls.length,1); assert.deepEqual(state.calls[0].values,[input()]);
});
test('closed response projection rejects raw identifiers, personnummer and nested raw history/conflict objects',async()=>{
 for(const change of [b=>b.pupils[0].personalNumber='secret',b=>b.pupils[0].capabilities.canReadProtected=true,b=>b.scope.actorId=id,b=>b.options.classes.push({id,name:'klass',unitId:id,educationId:null,secret:'raw'})]) { reset(); change(state.result.body); const r=await POST(req()); assert.equal(r.status,500); assert.equal(JSON.stringify(await r.json()).includes('secret'),false); }
 reset({entries:[{id,field:'personalNumber',before:'secret',after:null,changedBy:id,changedAt:'2026-09-28T10:00:00Z',origin:{source:'manual',actorId:id,changedAt:'2026-09-28T10:00:00Z',localCorrection:false}}],count:1,page:1,pageSize:20}); assert.equal((await history(get('historik','&page=1'))).status,500);
});
test('card/history emit object audits and protected references never leave body',async()=>{
 reset({...pupil(),version:1,placements:[],classes:[]}); state.result.auditRefs=[{kind:'protected',pupilId:id}]; const r=await card(get()); assert.equal(r.status,200); assert.equal('auditRefs' in await r.json(),false); assert.deepEqual(state.events.map(e=>e.action),['pupil_protected_read','pupil_read']);
 reset({entries:[],count:0,page:2,pageSize:20}); assert.equal((await history(get('historik','&page=2'))).status,200); assert.equal(state.events.at(-1).action,'pupil_history_read');
});
test('same origin, functions, epoch and unknown/foreign SQL errors deny without data',async()=>{
 reset(); assert.equal((await POST(req(input(),'https://foreign.example'))).status,403); assert.equal(state.calls.length,0);
 for(const fn of ['huvudman','it','kundadmin','elevhalsoansvarig']) {reset();state.fn=fn;assert.equal((await POST(req())).status,403);assert.equal(state.calls.length,0);}
 reset(); const stale=req();stale.headers.set('X-Context-Epoch','0');assert.equal((await POST(stale)).status,409);assert.equal(state.calls.length,0);
 for(const code of ['P0002']) {reset();state.sqlError={code,detail:'secret'};const r=await card(get());assert.equal(r.status,404);assert.equal((await r.json()).code,'not_found');}
});
test('extra event and main event failure roll back the simulated transaction with no body',async()=>{
 for(const failAction of ['pupil_protected_read','pupil_list_read']) {reset();state.failAction=failAction;state.result.auditRefs=[{kind:'protected',pupilId:id}]; const r=await POST(req());assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.events.filter(e=>e.outcome==='ok').length,0);}
});
test('mutation adapter returns a typed audited conflict and never dispatches uninstalled resolve SQL',async()=>{
 reset(); const input={pupilId:id,schoolYear:2026,caseId:null,expectedVersion:1,kind:'basics',payload:{displayName:'Ny elev'}};
 const details={kind:'fields',currentVersion:2,changedBy:id,changedAt:'2026-09-28T10:00:00Z',fields:[{field:'displayName',submitted:'Ny elev',current:'Aktuell elev'}]};
 state.result={kind:'conflict',details,auditRefs:[{kind:'protected',pupilId:id}]};
 const result=await fixture.context({},(tx,ctx)=>adapter.changePupil(tx,ctx,adapter.parsePupilChangeRequest(input)));
 assert.equal(result.status,409);assert.deepEqual(result.body,{code:'conflict',details});assert.equal(result.event.action,'pupil_conflict_read');assert.equal(state.events[0].outcome,'denied');assert.equal(state.events[1].action,'pupil_protected_read');
 state.result.details={...details,raw:'secret'};await assert.rejects(()=>fixture.context({},(tx,ctx)=>adapter.changePupil(tx,ctx,input)));
 state.calls=[];await assert.rejects(()=>fixture.context({},(tx,ctx)=>adapter.changePupil(tx,ctx,{...input,kind:'resolve-source',payload:{conflictId:id,choice:'source'}})));assert.equal(state.calls.length,0);
});
test('response source conflicts mask identity and reject arbitrary nested values',async()=>{
 const origin={source:'manual',actorId:id,changedAt:'2026-09-28T10:00:00Z',localCorrection:false};
 const body={...pupil(),version:1,placements:[],classes:[],protectedIdentity:false,municipalities:[],origins:{displayName:origin},sourceConflicts:[{id,field:'personalNumber',origin}]};
 reset(body);assert.equal((await card(get())).status,200);
 for(const conflict of [{id,field:'personalNumber',origin,local:'secret'},{id,field:'displayName',origin,local:null,incoming:{personalNumber:'secret'}}]){reset({...body,sourceConflicts:[conflict]});assert.equal((await card(get())).status,500);}
});
test('export preview parser refuses hidden columns and never accepts rows or identity from SQL',async()=>{
 const input={schoolYear:2026,caseId:null,fields:['displayName'],protectedIds:[],includePersonalNumber:false,mode:'ids',ids:[id]};
 assert.deepEqual(adapter.parsePupilExportRequest(input),input);
 assert.throws(()=>adapter.parsePupilExportRequest({...input,fields:['personalNumber']}));
 assert.throws(()=>adapter.parsePupilExportRequest({...input,ids:[id,id]}));
 reset({count:1,fields:['displayName'],includePersonalNumber:false});const result=await fixture.context({},(tx,ctx)=>adapter.exportPupils(tx,ctx,input,true));assert.equal(result.event.action,'pupil_export_preview');
 state.result.body.rows=[{displayName:'secret'}];await assert.rejects(()=>fixture.context({},(tx,ctx)=>adapter.exportPupils(tx,ctx,input,true)));
});

test('second protected object event failure rolls back the first object event',async()=>{
 reset();state.failEventAt=2;state.result.auditRefs=[{kind:'protected',pupilId:id},{kind:'protected',pupilId:'33000000-0000-4000-8000-000000000002'}];
 const r=await POST(req());assert.equal(r.status,500);assert.equal((await r.json()).code,'audit_unavailable');assert.equal(state.events.filter(e=>e.outcome==='ok').length,0);
});

const bootstrap=()=>({schoolYears:[2025,2026,2027],currentSchoolYear:2026,scope:{schools:[{id,name:'Provskola'}],groups:[],cases:[]},endsAt:null,approverName:null,purposeCode:null,serverNow:'2026-09-28T10:00:00Z'});
test('register selection is closed, audited, no-store and denies other functions and query input',async()=>{
 reset();state.result=bootstrap();
 const request=()=>new Request('http://localhost/api/elever/urval',{headers:{'X-Context-Epoch':'1'}});
 const response=await selectionRoute(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),bootstrap());assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(state.events.at(-1).action,'pupil_selection_read');
 for(const fn of ['huvudman','it','kundadmin','elevhalsoansvarig']){reset();state.fn=fn;assert.equal((await selectionRoute(request())).status,403);assert.equal(state.calls.length,0);}
 reset();state.result={...bootstrap(),pupils:['secret']};assert.equal((await selectionRoute(request())).status,500);
 reset();state.result=bootstrap();state.auditFails=true;const denied=await selectionRoute(request());assert.equal(denied.status,500);assert.equal((await denied.json()).code,'audit_unavailable');
 reset();state.result=bootstrap();assert.equal((await selectionRoute(new Request(request().url+'?schoolYear=2020'))).status,400);assert.equal(state.calls.length,0);
 reset();state.result={...bootstrap(),schoolYears:[2025]};assert.equal((await selectionRoute(request())).status,500);
});

test('system source history carries null actor without fabricated personnel',async()=>{
 const origin={source:'simulated',actorId:null,changedAt:'2026-09-28T10:00:00Z',localCorrection:true};
 const body={entries:[{id,field:'displayName',before:'Lokalt namn',after:'Lokalt namn',changedBy:null,changedAt:origin.changedAt,origin}],count:1,page:1,pageSize:20};
 reset(body);const response=await history(get('historik','&page=1'));assert.equal(response.status,200);assert.deepEqual(await response.json(),body);
});

test('source decision history exposes only the explicit closed resolution value',async()=>{
 const origin={source:'simulated',actorId:id,changedAt:'2026-09-28T10:00:00Z',localCorrection:false};
 for(const resolution of [null,'local','source']) {
  const body={entries:[{id,field:'displayName',before:'Lokalt',after:'Källvärde',changedBy:id,changedAt:origin.changedAt,origin,resolution}],count:1,page:1,pageSize:20};
  reset(body);const response=await history(get('historik','&page=1'));assert.equal(response.status,200);assert.deepEqual(await response.json(),body);
 }
 reset({entries:[{id,field:'displayName',before:null,after:null,changedBy:id,changedAt:origin.changedAt,origin,resolution:'secret'}],count:1,page:1,pageSize:20});
 assert.equal((await history(get('historik','&page=1'))).status,500);
});
