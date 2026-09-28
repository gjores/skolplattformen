import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const id = '33000000-0000-4000-8000-000000000001';
const permissionId = '33000000-0000-4000-8000-000000000002';
const issuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const clientId = 'skolplattform-worker';
const env = { APP_MODE: 'protected', DATABASE_URL: 'postgres://test@127.0.0.1:56322/postgres', SUPABASE_URL: 'http://127.0.0.1:56321', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, MFA_MAX_AGE_SECONDS: '28800', SESSION_SECRET: 'synthetic-test-only-secret' };
let state;
const fixture = globalThis.__permissionTest = {
  env,
  session() { const future = new Date(Date.now() + 60_000); return { session: { id, identityId:id, membershipId:id, assignmentId:id, customerId:id, expiresAt:future, absoluteExpiresAt:future, epoch:1 } }; },
  async login(_corr, fn) { return fn(fixture.tx); },
  async context(_ctx, fn) {
    const before = state.granted;
    const count = state.events.length;
    try { return await fn(fixture.tx, { sessionId:id, identityId:id, assignmentId:id, membershipId:id, customerId:id, correlationId:id, identity:{issuer,subject:'synthetic'}, accessFunction:state.fn, epoch:1, mfa:{issuer,clientId,audience:[clientId],profileId:'local-keycloak-admin',profileVersion:1,acr:'2',amr:state.mfa ? ['pwd','otp'] : ['pwd'],authTime:new Date(Date.now()-1000),checkedAt:new Date(Date.now()-500)} }); }
    catch (error) { state.granted=before; state.events.length=count; throw error; }
  },
  async tx(strings,...values) {
    const sql=strings.join('?');
    if (sql.includes('select i.auth_user_id')) return [{function:state.fn}];
    if (sql.includes('insert into public.security_events')) {
      if (state.auditFails) throw new Error('private audit details');
      state.events.push({action:values[8],outcome:values[11],details:values[12]}); return [];
    }
    state.calls.push({sql,values});
    if (sql.includes('phase4_list_protected_permissions')) return [{permissions:[{assignmentId:id,membershipId:id,displayName:'Syntetisk administratör',unitId:id,schoolName:'Syntetisk skola',permissionId:state.granted ? permissionId:null}]}];
    if (sql.includes('phase4_grant_protected_permission')) { state.granted=true; return [{id:permissionId}]; }
    if (sql.includes('phase4_revoke_protected_permission')) { state.granted=false; return [{id:permissionId}]; }
    throw new Error('unexpected test query');
  },
};
fixture.tx.json = value => value;
registerHooks({ load(url, context, next) {
  let source;
  if (url===new URL('./db.ts',import.meta.url).href) source=`export class Deny extends Error { constructor(code,status=403,details){super(code);this.code=code;this.status=status;this.details=details;} } export const withLoginPhase=(...args)=>globalThis.__permissionTest.login(...args); export const withSessionContext=(...args)=>globalThis.__permissionTest.context(...args);`;
  if (url===new URL('./session.ts',import.meta.url).href) source='export const readSession=async()=>globalThis.__permissionTest.session();';
  if (url===new URL('./env.ts',import.meta.url).href) source='export const serverEnv=()=>globalThis.__permissionTest.env;';
  return source ? {format:'module',source,shortCircuit:true}:next(url,context);
} });
const { GET, POST } = await import('../../app/api/kund/skyddsbehorighet/route.ts');
const { parseProtectedPermission } = await import('./protected-permission.ts');
function reset() { state={fn:'huvudman',mfa:true,granted:false,auditFails:false,calls:[],events:[]}; }
function request(body, origin='http://localhost') { return new Request('http://localhost/api/kund/skyddsbehorighet',{method:body ? 'POST':'GET',headers:{Origin:origin,'Content-Type':'application/json','X-Context-Epoch':'1'},...(body ? {body:JSON.stringify(body)}:{})}); }
const grant=()=>({action:'grant',assignmentId:id,unitId:id});
test('payload tillåter bara uttrycklig tilldelning eller återkallelse, aldrig aktör',()=>{
  assert.deepEqual(parseProtectedPermission(grant()),grant());
  assert.deepEqual(parseProtectedPermission({action:'revoke',permissionId}),{action:'revoke',permissionId});
  for(const body of [null,[],{...grant(),actorId:id},{...grant(),customerId:id},{...grant(),issuedByAssignmentId:id},{...grant(),unitId:'bad'},{action:'revoke',permissionId,assignmentId:id},{action:'other'}]) assert.throws(()=>parseProtectedPermission(body));
});
test('GET ger endast admin/skolalternativ och loggar innan svar',async()=>{
  reset(); const response=await GET(request()); assert.equal(response.status,200);
  const body=await response.json(); assert.equal(body.permissions[0].assignmentId,id);
  assert.deepEqual(Object.keys(body.permissions[0]).sort(),['assignmentId','membershipId','displayName','unitId','schoolName','permissionId'].sort());
  assert.equal(state.events[0].action,'protected_permission_listed'); assert.equal(response.headers.get('cache-control'),'no-store');
});
test('riktig route nekar rektor och övriga roller före SQL',async()=>{
  for(const fn of ['rektor','administrator','it','support']) for(const method of ['GET','POST']) {
    reset(); state.fn=fn; const response=await (method==='GET' ? GET(request()):POST(request(grant())));
    assert.equal(response.status,403); assert.equal(state.calls.length,0); assert.equal(state.granted,false);
  }
});
test('POST kräver same-origin, aktuell epoch och MFA före SQL',async()=>{
  reset(); assert.equal((await POST(request(grant(),'https://foreign.example'))).status,403); assert.equal(state.calls.length,0);
  reset(); state.mfa=false; const mfa=await POST(request(grant())); assert.equal((await mfa.json()).code,'mfa_required'); assert.equal(state.calls.length,0);
  reset(); const stale=request(grant()); stale.headers.set('X-Context-Epoch','0'); assert.equal((await POST(stale)).status,409); assert.equal(state.calls.length,0);
});
test('grant och revoke använder bara mottagar-ID samt loggas i samma simulerade transaktion',async()=>{
  reset(); const response=await POST(request(grant())); assert.equal(response.status,201); assert.equal(state.granted,true);
  assert.deepEqual(state.calls[0].values,[id,id]); assert.equal(state.events[0].action,'protected_permission_granted');
  assert.deepEqual(await response.json(),{permissionId});
  assert.equal((await POST(request({action:'revoke',permissionId}))).status,200); assert.equal(state.granted,false);
  assert.equal(state.events[1].action,'protected_permission_revoked');
});
test('loggfel stoppar listsvaret och återställer grant/revoke utan elev- eller databasdetaljer',async()=>{
  for(const action of ['list','grant','revoke']) {
    reset(); state.auditFails=true; state.granted=action==='revoke'; const before=state.granted;
    const response=await (action==='list'?GET(request()):POST(request(action==='grant'?grant():{action:'revoke',permissionId})));
    assert.equal(response.status,500); const body=await response.json(); assert.equal(body.code,'audit_unavailable');
    assert.equal(state.granted,before); assert.equal(state.events.length,0); assert.equal(JSON.stringify(body).includes('private'),false); assert.equal('permissions' in body,false);
  }
});
test('klientvald aktör nekas i routen innan mutation',async()=>{
  reset(); const response=await POST(request({...grant(),actorId:id})); assert.equal(response.status,400); assert.equal(state.calls.length,0);
});
