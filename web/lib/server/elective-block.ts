import { ElectiveBlockError, createElectiveCommandRef, electiveShape, electiveUuid,
  parseElectiveRead, parseElectiveReceipt, parseElectiveStatusReply,
  type ElectiveScope, type ElectiveCommand, type ElectiveCommandRef } from '../elective-block-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { tjanstRequest } from './tjanst.ts';
export type ElectiveAuthority = Pick<SessionContext,'identityId'|'assignmentId'|'accessFunction'>;
const conflicts=new Set(['elective_revision_conflict','elective_command_conflict','elective_stale_source','elective_block_in_use','elective_group_in_use','elective_stale_offer','elective_choice_conflict','elective_policy_conflict','elective_round_closed','elective_round_conflict','elective_policy_missing','elective_confirmation_required','elective_confirmation_conflict','elective_duplicate_course','elective_time_conflict','elective_self_conflict','elective_placement_conflict','elective_frame_conflict']);
const inputs=new Set(['elective_invalid','elective_time_missing','elective_time_conflict','elective_option_not_allowed','elective_alternative_time_missing','elective_action_unavailable','elective_round_closed','elective_policy_missing','elective_guardian_missing','elective_guardian_required','elective_choice_invalid','elective_placement_invalid']);
export async function electiveOperation<T>(fn:()=>Promise<T>):Promise<T>{
  try{return await fn();}catch(error){
    const e=error as {code?:unknown;hint?:unknown};
    if(e?.code==='42501')throw new Deny('forbidden',403);
    if(e?.code==='55000')throw new AuditUnavailable();
    if(e?.code==='40001'&&typeof e.hint==='string'&&conflicts.has(e.hint))throw new Deny('conflict',409,{reason:e.hint});
    if(e?.code==='22023')throw new Deny('bad_request',400,typeof e.hint==='string'&&inputs.has(e.hint)?{reason:e.hint}:undefined);
    if(['08001','08003','08006','57P01','57P02','57P03','ECONNREFUSED','CONNECTION_CLOSED','CONNECT_TIMEOUT'].includes(String(e?.code)))throw new Deny('db_unreachable',503);
    throw new AuditUnavailable();
  }
}
function authority(ctx:ElectiveAuthority):void{if(!['rektor','administrator'].includes(ctx.accessFunction??'')||!ctx.identityId||!ctx.assignmentId)throw new Deny('forbidden',403);}
export function electiveResult(rows:{result:unknown}[],ctx:ElectiveAuthority):unknown{
  try{if(rows.length!==1)throw new AuditUnavailable();const r=electiveShape(rows[0].result,['contractVersion','actor','result']),actor=electiveShape(r.actor,['identityId','assignmentId']);
    if(r.contractVersion!=='elective_sql_v1'||electiveUuid(actor.identityId)!==ctx.identityId.toLowerCase()||electiveUuid(actor.assignmentId)!==ctx.assignmentId!.toLowerCase())throw new AuditUnavailable();return r.result;
  }catch{throw new AuditUnavailable();}
}
export function electiveProjected<T>(parse:()=>T):T{try{return parse();}catch{throw new AuditUnavailable();}}
export async function electiveRequest<T>(request:Request,parse:(v:unknown)=>T):Promise<T>{
  return tjanstRequest(request,v=>{try{return parse(v);}catch(e){if(e instanceof ElectiveBlockError)throw new Deny('bad_request',400);throw e;}});
}
export async function readElectiveBlocks(tx:Tx,ctx:ElectiveAuthority,input:ElectiveScope){
  authority(ctx);const rows=await electiveOperation(()=>tx<{result:unknown}[]>`select public.elective_block_read(${tx.json(input)}) as result`);
  const body=electiveProjected(()=>parseElectiveRead(electiveResult(rows,ctx),input));
  return {body,event:{action:'elective_read',objectType:'school',objectId:input.unitId,details:{unitId:input.unitId}}};
}
export async function commandElectiveBlock(tx:Tx,ctx:ElectiveAuthority,input:ElectiveCommand){
  authority(ctx);const ref=await createElectiveCommandRef(input),rows=await electiveOperation(()=>tx<{result:unknown}[]>`select public.elective_block_command(${tx.json(input)}) as result`);
  const body=electiveProjected(()=>parseElectiveReceipt(electiveResult(rows,ctx),ref));
  return {body,event:{action:'elective_command',objectType:'elective_command',objectId:input.commandId,details:{unitId:input.unitId}}};
}
export async function statusElectiveBlock(tx:Tx,ctx:ElectiveAuthority,input:ElectiveCommandRef){
  authority(ctx);const rows=await electiveOperation(()=>tx<{result:unknown}[]>`select public.elective_block_status(${tx.json(input)}) as result`);
  const body=electiveProjected(()=>parseElectiveStatusReply(electiveResult(rows,ctx),input));
  return {body,event:{action:'elective_status',objectType:'elective_command',objectId:input.commandId,details:{unitId:input.unitId}}};
}
