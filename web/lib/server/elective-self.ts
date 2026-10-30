import { createSelfCommandRef, parseParticipantScope, parseSelfCommand, parseSelfCommandRef, parseSelfRead, parseSelfReceipt, parseSelfStatus, type SelfCommand, type SelfCommandRef, type SelfParticipant } from '../elective-self-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { participantRoute, participantIndexRoute, electiveAuthorityOperation, type ParticipantContext } from './elective-participant-route.ts';
import { tjanstRequest } from './tjanst.ts';
import { Deny, type Tx } from './db.ts';
function one(rows:{result:unknown}[]):unknown{if(rows.length!==1)throw new AuditUnavailable();return rows[0].result;}
export {participantIndexRoute as electiveSelfIndexRoute};
export async function electiveSelfReadRoute(request:Request):Promise<Response>{
 return participantRoute(request,'elective_self_read',{mutating:false,scope:async()=>tjanstRequest(request,parseParticipantScope)},async(ctx,tx)=>{
  const raw=one(await electiveAuthorityOperation(()=>tx<{result:unknown}[]>`select public.elective_self_read() result`));
  try{const body=parseSelfRead(raw,{unitId:ctx.authority.unitId,pupilId:ctx.authority.pupilId,participant:ctx.authority.participant,bindingId:ctx.authority.bindingId});
   if(body.epoch!==ctx.epoch||body.participant.bindingRevision!==ctx.authority.bindingRevision)throw new Error('authority projection');
   return{body,event:{action:'elective_self_read',objectType:'elective_participant',objectId:ctx.authority.bindingId}};
  }catch{throw new AuditUnavailable();}
 });
}
function scopeOf(q:{unitId:string;pupilId:string;participant:SelfParticipant['participant']}){return{unitId:q.unitId,pupilId:q.pupilId,participant:q.participant};}
async function execute(tx:Tx,ctx:ParticipantContext,input:SelfCommand){
 const ref=await createSelfCommandRef(input),raw=one(await electiveAuthorityOperation(()=>tx<{result:unknown}[]>`select public.elective_self_command(${tx.json(input)}) result`));
 try{return parseSelfReceipt(raw,ref,{identityId:ctx.identityId,bindingId:ctx.authority.bindingId});}catch{throw new AuditUnavailable();}
}
export async function electiveSelfCommandRoute(request:Request):Promise<Response>{
 let input:SelfCommand;
 return participantRoute(request,'elective_self_command',{mutating:true,scope:async()=>{input=await tjanstRequest(request,parseSelfCommand);return scopeOf(input);}},async(ctx,tx)=>{
  if(input.expectedBindingRevision!==ctx.authority.bindingRevision)throw new Deny('conflict',409);
  const body=await execute(tx,ctx,input);return{body,event:{action:input.action==='confirm_guardian'?'elective_guardian_confirmed':'elective_choice_submitted',objectType:'elective_choice',objectId:body.choiceId}};
 });
}
export async function electiveSelfStatusRoute(request:Request):Promise<Response>{
 let input:SelfCommandRef;
 return participantRoute(request,'elective_self_status',{mutating:false,scope:async()=>{input=await tjanstRequest(request,parseSelfCommandRef);return scopeOf(input);}},async(ctx,tx)=>{
  const raw=one(await electiveAuthorityOperation(()=>tx<{result:unknown}[]>`select public.elective_self_status(${tx.json(input)}) result`));
  try{return{body:parseSelfStatus(raw,input,{identityId:ctx.identityId,bindingId:ctx.authority.bindingId}),event:{action:'elective_self_status',objectType:'elective_command',objectId:input.commandId}};}catch{throw new AuditUnavailable();}
 });
}
