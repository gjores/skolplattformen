import { ElectiveBlockError, electiveShape, electiveUuid } from '../elective-block-contract.ts';
import { createElectiveTimeRef, assertElectiveTimeReplyCommand, hashElectiveTimeFrame, parseElectiveTimeRead, parseElectiveTimeReply, parseElectiveTimeStatus,
 type ElectiveTimeScope,type ElectiveTimeCommand,type ElectiveTimeRef,type ElectiveTimeRead } from '../elective-timplan-time.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny,type SessionContext,type Tx } from './db.ts';
import { tjanstRequest } from './tjanst.ts';
export type ElectiveTimeAuthority=Pick<SessionContext,'identityId'|'assignmentId'|'accessFunction'>;
async function operation<T>(fn:()=>Promise<T>):Promise<T>{try{return await fn();}catch(error){const e=error as{code?:unknown;hint?:unknown};
 if(e?.code==='42501')throw new Deny('forbidden',403);if(e?.code==='55000')throw new AuditUnavailable();
 if(e?.code==='40001'&&['elective_time_command_conflict','elective_time_parent_conflict','elective_time_revision_conflict'].includes(String(e.hint)))throw new Deny('conflict',409,{reason:String(e.hint)});
 if(e?.code==='22023'&&['elective_time_invalid','elective_time_frame_missing','elective_time_missing','elective_time_total'].includes(String(e.hint)))throw new Deny('bad_request',400,{reason:String(e.hint)});
 if(['08001','08003','08006','57P01','57P02','57P03','ECONNREFUSED','CONNECTION_CLOSED','CONNECT_TIMEOUT'].includes(String(e?.code)))throw new Deny('db_unreachable',503);throw new AuditUnavailable();}}
function authority(ctx:ElectiveTimeAuthority):void{if(!['rektor','administrator'].includes(ctx.accessFunction??'')||!ctx.identityId||!ctx.assignmentId)throw new Deny('forbidden',403);}
function result(rows:{result:unknown}[],ctx:ElectiveTimeAuthority):unknown{try{if(rows.length!==1)throw new Error();const r=electiveShape(rows[0].result,['contractVersion','actor','result']),a=electiveShape(r.actor,['identityId','assignmentId']);
 if(r.contractVersion!=='elective_time_sql_v1'||electiveUuid(a.identityId)!==ctx.identityId.toLowerCase()||electiveUuid(a.assignmentId)!==ctx.assignmentId!.toLowerCase())throw new Error();return r.result;}catch{throw new AuditUnavailable();}}
async function validateRead(read:ElectiveTimeRead):Promise<void>{if(await hashElectiveTimeFrame(read.frame)!==read.frame.parentHash||read.detail&&await hashElectiveTimeFrame(read.detail.frame)!==read.detail.frame.parentHash)throw new AuditUnavailable();}
export async function electiveTimeRequest<T>(request:Request,parse:(value:unknown)=>T):Promise<T>{return tjanstRequest(request,value=>{try{return parse(value);}catch(e){if(e instanceof ElectiveBlockError)throw new Deny('bad_request',400);throw e;}});}
export async function readElectiveTimplanTime(tx:Tx,ctx:ElectiveTimeAuthority,input:ElectiveTimeScope){authority(ctx);
 const rows=await operation(()=>tx<{result:unknown}[]>`select public.elective_timplan_time_read(${tx.json(input)}) as result`);
 try{const body=parseElectiveTimeRead(result(rows,ctx),input);await validateRead(body);return{body,event:{action:'elective_read',objectType:'school',objectId:input.unitId,details:{unitId:input.unitId}}};}catch{throw new AuditUnavailable();}}
export async function commandElectiveTimplanTime(tx:Tx,ctx:ElectiveTimeAuthority,input:ElectiveTimeCommand){authority(ctx);const ref=await createElectiveTimeRef(input);
 const rows=await operation(()=>tx<{result:unknown}[]>`select public.elective_timplan_time_command(${tx.json(input)}) as result`);
 try{const body=parseElectiveTimeReply(result(rows,ctx),ref);assertElectiveTimeReplyCommand(body,input);await validateRead(body.read);return{body,event:{action:'elective_command',objectType:'elective_command',objectId:input.commandId,details:{unitId:input.unitId}}};}catch{throw new AuditUnavailable();}}
export async function statusElectiveTimplanTime(tx:Tx,ctx:ElectiveTimeAuthority,input:ElectiveTimeRef){authority(ctx);
 const rows=await operation(()=>tx<{result:unknown}[]>`select public.elective_timplan_time_status(${tx.json(input)}) as result`);
 try{const body=parseElectiveTimeStatus(result(rows,ctx),input);if(body.state==='found')await validateRead(body.result.read);return{body,event:{action:'elective_status',objectType:'elective_command',objectId:input.commandId,details:{unitId:input.unitId}}};}catch{throw new AuditUnavailable();}}
