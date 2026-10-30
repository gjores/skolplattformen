import { parseParticipantAuthority, parseParticipantScope, parseSelfIndex, type ParticipantAuthority, type ParticipantScope } from '../elective-self-contract.ts';
import { AuditUnavailable, denyResponse, requireSameOrigin } from './authz.ts';
import { Deny, withLoginPhase, type SessionContext, type Tx } from './db.ts';
import { logEvent, type EventInput } from './events.ts';
import { correlationId, json } from './http.ts';
import { mandateOperation } from './mandate-route.ts';
import { readSession, tokenHash } from './session.ts';
import { serverEnv } from './env.ts';

/** SQL messages and account data never leave this mapping. */
export async function electiveAuthorityOperation<T>(run:()=>Promise<T>):Promise<T>{return mandateOperation(async()=>{try{return await run();}catch(error){
 const e=error&&typeof error==='object'?error as {code?:unknown;hint?:unknown}:{};
 if(e.code==='55000')throw new AuditUnavailable();
 if(e.code==='42501'&&e.hint==='elective_session_revoked')throw new Deny('session_revoked',401);
 if(e.code==='42501'&&e.hint==='elective_session_expired')throw new Deny('session_expired',401);
 if(e.code==='42501')throw new Deny('forbidden',403);
 if(e.code==='40001'&&e.hint==='elective_context_changed')throw new Deny('context_changed',409);
 if(e.code==='40001'&&typeof e.hint==='string'&&['elective_binding_conflict','elective_self_conflict','elective_stale_offer','elective_round_closed','elective_choice_conflict','elective_round_conflict','elective_policy_missing','elective_confirmation_required','elective_confirmation_conflict','elective_time_conflict','elective_stale_source','elective_duplicate_course'].includes(e.hint))throw new Deny('conflict',409,{reason:e.hint});
 if(e.code==='22023'||e.code==='22P02'||e.code==='22007'||e.code==='22008')throw new Deny('bad_request',400);
 if(typeof e.code==='string'&&['08001','08003','08006','57P01','57P02','57P03','ECONNREFUSED','CONNECTION_CLOSED','CONNECT_TIMEOUT'].includes(e.code))throw new Deny('db_unreachable',503);
 if(error instanceof Deny||error instanceof AuditUnavailable)throw error;
 throw new Error('elective_authority_sql_unmapped');
}});}
function one(rows:{result:unknown}[]):unknown{if(rows.length!==1)throw new AuditUnavailable();return rows[0].result;}
export type ParticipantContext = SessionContext & { epoch:number; authority:ParticipantAuthority; request:Request };
type ParticipantResult={body:unknown;event:EventInput;status?:number};
async function authenticate(request:Request,corr:string){
 const current=await readSession(request,corr);if(!current)throw new Deny('no_session',401);
 const s=current.session;if(s.revokedAt)throw new Deny('session_revoked',401);
 if(new Date(s.expiresAt).getTime()<=Date.now()||new Date(s.absoluteExpiresAt).getTime()<=Date.now())throw new Deny('session_expired',401);
 const header=request.headers.get('X-Context-Epoch'),epoch=header===null?s.epoch:Number(header);
 if(!Number.isSafeInteger(epoch)||epoch<1||epoch!==s.epoch)throw new Deny('context_changed',409);
 const bytes=await tokenHash(current.token),hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return{...current,epoch,hex};
}
async function touch(tx:Tx,live:Awaited<ReturnType<typeof authenticate>>){const seconds=Number(serverEnv().SESSION_IDLE_SECONDS);if(!Number.isSafeInteger(seconds)||seconds<1||seconds>86400)throw new AuditUnavailable();await electiveAuthorityOperation(()=>tx`select public.elective_participant_touch(${live.session.id},${live.session.identityId},${live.hex},${live.epoch},${seconds})`);}
function context(request:Request,corr:string,live:Awaited<ReturnType<typeof authenticate>>,authority:ParticipantAuthority|null):SessionContext&{request:Request}{return{sessionId:live.session.id,identityId:live.session.identityId,membershipId:null,assignmentId:null,customerId:authority?.customerId??null,organizerId:authority?.organizerId??null,unitId:authority?.unitId??null,identity:{issuer:live.session.issuer,subject:live.session.subject,authUserId:null},accessFunction:null,appRole:null,scopeKind:'elective_participant',correlationId:corr,request};}
/** Same cookie, separately locked participant authority. Never an administrative context. */
export async function participantRoute(request:Request,action:string,opts:{mutating:boolean;scope:ParticipantScope|(()=>Promise<ParticipantScope>);expectedBindingRevision?:number},handler:(ctx:ParticipantContext,tx:Tx)=>Promise<ParticipantResult>):Promise<Response>{
 const corr=correlationId();let hint:Partial<SessionContext>|undefined;
 try{
  if(opts.mutating)requireSameOrigin(request);
  const live=await authenticate(request,corr);hint=context(request,corr,live,null);
  const scope=parseParticipantScope(typeof opts.scope==='function'?await opts.scope():opts.scope);
  const result=await withLoginPhase(corr,async tx=>{
   const raw=one(await electiveAuthorityOperation(()=>tx<{result:unknown}[]>`select public.elective_participant_scope(${live.session.id},${live.session.identityId},${live.hex},${live.epoch},${scope.unitId},${scope.pupilId},${scope.participant}) result`));
   let authority:ParticipantAuthority;try{authority=parseParticipantAuthority(raw,scope,live.session.identityId,live.epoch);}catch{throw new AuditUnavailable();}
   if(opts.expectedBindingRevision!==undefined&&opts.expectedBindingRevision!==authority.bindingRevision)throw new Deny('conflict',409);
   const ctx:ParticipantContext={...context(request,corr,live,authority),epoch:live.epoch,authority,request};hint=ctx;
   const value=await handler(ctx,tx);if(!value.event)throw new AuditUnavailable();
   try{await logEvent(tx,ctx,{...value.event,outcome:'ok'});}catch{throw new AuditUnavailable();}await touch(tx,live);return value;
  });return json(result.body,{status:result.status,correlationId:corr,epoch:live.epoch});
 }catch(error){return denyResponse(error,request,corr,action,hint);}
}
/** Own relations are discoverable without any staff assignment or selected personal context. */
export async function participantIndexRoute(request:Request):Promise<Response>{
 const corr=correlationId();let hint:Partial<SessionContext>|undefined;
 try{const live=await authenticate(request,corr),ctx=context(request,corr,live,null);hint=ctx;
  const result=await withLoginPhase(corr,async tx=>{
   const raw=one(await electiveAuthorityOperation(()=>tx<{result:unknown}[]>`select public.elective_participant_contexts(${live.session.id},${live.session.identityId},${live.hex},${live.epoch}) result`));
   let body;try{body=parseSelfIndex(raw);if(body.epoch!==live.epoch)throw new Error('epoch');}catch{throw new AuditUnavailable();}
   try{await logEvent(tx,ctx,{action:'elective_self_contexts_read',objectType:'elective_participant',outcome:'ok',details:{count:body.participants.length}});}catch{throw new AuditUnavailable();}await touch(tx,live);return body;
  });return json(result,{correlationId:corr,epoch:live.epoch});
 }catch(error){return denyResponse(error,request,corr,'elective_self_contexts_read',hint);}
}
