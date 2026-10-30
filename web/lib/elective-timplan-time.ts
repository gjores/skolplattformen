import { electiveArray, electiveEnum, electiveInteger, electiveShape, electiveText, electiveUuid, electiveFail } from './elective-block-contract.ts';
import { tjanstHashCanonical } from './tjanst-contract.ts';
export const ELECTIVE_TIMPLAN_TIME_VERSION='elective_timplan_time_v1' as const;
export type ElectiveTimeScope={unitId:string;schoolYear:number;frameSourceKey:string};
export type ElectiveTimeFrame={timplanId:string;timplanVersion:number;timplanRevision:number;rowKey:string;column:string;schoolYear:number;
  pointsHt:number;pointsVt:number;needHt:number;needVt:number;needBasis:'terms'|'even_split';parentHash:string};
export type ElectiveTimePosition={id:string;name:string;pointsHt:number;pointsVt:number;needHt:number;needVt:number};
export type ElectiveTimeDetail={id:string;revision:number;appliedRevision:number|null;frame:ElectiveTimeFrame;positions:ElectiveTimePosition[]};
export type ElectiveTimeRead=ElectiveTimeScope&{contractVersion:typeof ELECTIVE_TIMPLAN_TIME_VERSION;classId:string;linkRevision:number;label:string;frame:ElectiveTimeFrame;detail:ElectiveTimeDetail|null};
export type ElectiveTimeCommand=ElectiveTimeScope&{contractVersion:typeof ELECTIVE_TIMPLAN_TIME_VERSION;action:'save'|'apply';commandId:string;detailId:string;
 expectedRevision:number;expectedParentHash:string;expectedLinkRevision:number;positions:ElectiveTimePosition[]};
export type ElectiveTimeRef=ElectiveTimeScope&{commandId:string;action:ElectiveTimeCommand['action'];payloadHash:string};
export type ElectiveTimeReceipt=ElectiveTimeRef&{detailId:string;revision:number;appliedRevision:number|null;replayed:boolean};
export type ElectiveTimeReply={receipt:ElectiveTimeReceipt;read:ElectiveTimeRead};
export type ElectiveTimeStatus={state:'not_found';result:null}|{state:'found';result:ElectiveTimeReply};
const keys=['unitId','schoolYear','frameSourceKey'];
const frameKeys=['timplanId','timplanVersion','timplanRevision','rowKey','column','schoolYear','pointsHt','pointsVt','needHt','needVt','needBasis','parentHash'];
const revision=(v:unknown)=>electiveInteger(v,1,2147483646);
const hash=(v:unknown)=>{if(typeof v!=='string'||!/^([0-9a-f]{64})$/u.test(v))electiveFail('elective_time_hash');return v as string;};
export function parseElectiveTimeScope(value:unknown):ElectiveTimeScope{
 const r=electiveShape(value,keys),schoolYear=electiveInteger(r.schoolYear,2000,2100),frameSourceKey=electiveText(r.frameSourceKey,250);
 const match=/^class_timplan:([0-9a-f-]{36}):(\d{4}):(.+)$/u.exec(frameSourceKey);
 if(!match||electiveUuid(match[1])!==match[1]||Number(match[2])!==schoolYear||match[3].includes(':position:'))electiveFail('elective_time_scope');
 return{unitId:electiveUuid(r.unitId),schoolYear,frameSourceKey};
}
function scopeFrom(r:Record<string,unknown>):ElectiveTimeScope{return parseElectiveTimeScope(Object.fromEntries(keys.map(k=>[k,r[k]])));}
function sameScope(a:ElectiveTimeScope,b:ElectiveTimeScope){if(a.unitId!==b.unitId||a.schoolYear!==b.schoolYear||a.frameSourceKey!==b.frameSourceKey)electiveFail('elective_time_scope');}
export function parseElectiveTimeFrame(value:unknown):ElectiveTimeFrame{
 const r=electiveShape(value,frameKeys),column=electiveText(r.column,10),rowKey=electiveText(r.rowKey,160);
 if(!/^ar[1-3]$/u.test(column)||!rowKey.startsWith('block:'))electiveFail('elective_time_frame');
 return{timplanId:electiveUuid(r.timplanId),timplanVersion:revision(r.timplanVersion),timplanRevision:electiveInteger(r.timplanRevision),rowKey,column,
 schoolYear:electiveInteger(r.schoolYear,2000,2100),pointsHt:electiveInteger(r.pointsHt,0,10000),pointsVt:electiveInteger(r.pointsVt,0,10000),
 needHt:electiveInteger(r.needHt,0,6000000),needVt:electiveInteger(r.needVt,0,6000000),needBasis:electiveEnum(r.needBasis,['terms','even_split']),parentHash:hash(r.parentHash)};
}
export async function hashElectiveTimeFrame(frame:ElectiveTimeFrame):Promise<string>{const {parentHash:_hash,...content}=frame;return (await tjanstHashCanonical(content)).slice('sha256:'.length);}
export function parseElectiveTimePosition(value:unknown):ElectiveTimePosition{
 const r=electiveShape(value,['id','name','pointsHt','pointsVt','needHt','needVt']);
 const p={id:electiveUuid(r.id),name:electiveText(r.name,160),pointsHt:electiveInteger(r.pointsHt,0,10000),pointsVt:electiveInteger(r.pointsVt,0,10000),needHt:electiveInteger(r.needHt,0,6000000),needVt:electiveInteger(r.needVt,0,6000000)};
 if(!p.name.trim()||p.name!==p.name.trim()||p.pointsHt+p.pointsVt<=0||p.needHt+p.needVt<=0||(p.pointsHt===0&&p.needHt!==0)||(p.pointsVt===0&&p.needVt!==0))electiveFail('elective_time_position');return p;
}
export function parseElectiveTimePositions(value:unknown):ElectiveTimePosition[]{const positions=electiveArray(value,parseElectiveTimePosition,32);
 if(!positions.length||new Set(positions.map(p=>p.id)).size!==positions.length)electiveFail('elective_time_position');return positions;}
export function validateElectiveTimePositions(frame:ElectiveTimeFrame,positions:readonly ElectiveTimePosition[]):void{
 const fields=['pointsHt','pointsVt','needHt','needVt'] as const;
 if(fields.some(k=>positions.reduce((sum,p)=>sum+p[k],0)!==frame[k]))electiveFail('elective_time_total');
}
export function parseElectiveTimeRead(value:unknown,expected:ElectiveTimeScope):ElectiveTimeRead{
 const r=electiveShape(value,[...keys,'contractVersion','classId','linkRevision','label','frame','detail']),scope=scopeFrom(r);sameScope(scope,expected);
 if(r.contractVersion!==ELECTIVE_TIMPLAN_TIME_VERSION)electiveFail('elective_time_version');const frame=parseElectiveTimeFrame(r.frame),classId=electiveUuid(r.classId);
 if(frame.schoolYear!==scope.schoolYear||scope.frameSourceKey!==`class_timplan:${classId}:${scope.schoolYear}:${frame.rowKey}`)electiveFail('elective_time_scope');
 let detail:ElectiveTimeDetail|null=null;
 if(r.detail!==null){const d=electiveShape(r.detail,['id','revision','appliedRevision','frame','positions']),positions=parseElectiveTimePositions(d.positions),detailFrame=parseElectiveTimeFrame(d.frame);
  validateElectiveTimePositions(detailFrame,positions);detail={id:electiveUuid(d.id),revision:revision(d.revision),appliedRevision:d.appliedRevision===null?null:revision(d.appliedRevision),frame:detailFrame,positions};
  if(detail.appliedRevision!==null&&detail.appliedRevision>detail.revision||detailFrame.timplanId!==frame.timplanId||detailFrame.rowKey!==frame.rowKey||detailFrame.column!==frame.column||detailFrame.schoolYear!==frame.schoolYear)electiveFail('elective_time_detail');
 }
 return{...scope,contractVersion:ELECTIVE_TIMPLAN_TIME_VERSION,classId,linkRevision:electiveInteger(r.linkRevision),label:electiveText(r.label,300),frame,detail};
}
export function parseElectiveTimeCommand(value:unknown):ElectiveTimeCommand{
 const r=electiveShape(value,[...keys,'contractVersion','action','commandId','detailId','expectedRevision','expectedParentHash','expectedLinkRevision','positions']);
 if(r.contractVersion!==ELECTIVE_TIMPLAN_TIME_VERSION)electiveFail('elective_time_version');return{...scopeFrom(r),contractVersion:ELECTIVE_TIMPLAN_TIME_VERSION,
 action:electiveEnum(r.action,['save','apply']),commandId:electiveUuid(r.commandId),detailId:electiveUuid(r.detailId),expectedRevision:electiveInteger(r.expectedRevision,0,2147483645),
 expectedParentHash:hash(r.expectedParentHash),expectedLinkRevision:electiveInteger(r.expectedLinkRevision),positions:parseElectiveTimePositions(r.positions)};
}
export function parseElectiveTimeRef(value:unknown):ElectiveTimeRef{const r=electiveShape(value,[...keys,'commandId','action','payloadHash']);return{...scopeFrom(r),commandId:electiveUuid(r.commandId),action:electiveEnum(r.action,['save','apply']),payloadHash:hash(r.payloadHash)};}
export async function createElectiveTimeRef(input:ElectiveTimeCommand):Promise<ElectiveTimeRef>{const command=parseElectiveTimeCommand(input);return{unitId:command.unitId,schoolYear:command.schoolYear,frameSourceKey:command.frameSourceKey,commandId:command.commandId,action:command.action,payloadHash:(await tjanstHashCanonical(command)).slice('sha256:'.length)};}
export function parseElectiveTimeReply(value:unknown,ref:ElectiveTimeRef):ElectiveTimeReply{
 const r=electiveShape(value,['receipt','read']),rc=electiveShape(r.receipt,[...keys,'commandId','action','payloadHash','detailId','revision','appliedRevision','replayed']);
 const actual=parseElectiveTimeRef(Object.fromEntries([...keys,'commandId','action','payloadHash'].map(k=>[k,rc[k]])));sameScope(actual,ref);
 if(actual.commandId!==ref.commandId||actual.action!==ref.action||actual.payloadHash!==ref.payloadHash||typeof rc.replayed!=='boolean')electiveFail('elective_time_receipt');
 const receipt:ElectiveTimeReceipt={...actual,detailId:electiveUuid(rc.detailId),revision:revision(rc.revision),appliedRevision:rc.appliedRevision===null?null:revision(rc.appliedRevision),replayed:rc.replayed};
 const read=parseElectiveTimeRead(r.read,ref);
 if(!read.detail||read.detail.id!==receipt.detailId||read.detail.revision!==receipt.revision||read.detail.appliedRevision!==receipt.appliedRevision||(receipt.action==='apply'&&receipt.appliedRevision!==receipt.revision))electiveFail('elective_time_receipt');return{receipt,read};
}
export function parseElectiveTimeStatus(value:unknown,ref:ElectiveTimeRef):ElectiveTimeStatus{const r=electiveShape(value,['state','result']);if(r.state==='not_found'&&r.result===null)return{state:'not_found',result:null};if(r.state==='found')return{state:'found',result:parseElectiveTimeReply(r.result,ref)};electiveFail('elective_time_status');}

/** A correct actor/hash echo must also contain the exact object and positions the command requested. */
export function assertElectiveTimeReplyCommand(reply:ElectiveTimeReply,command:ElectiveTimeCommand):void{
 if(reply.receipt.detailId!==command.detailId||reply.receipt.revision!==command.expectedRevision+1||reply.read.frame.parentHash!==command.expectedParentHash||reply.read.linkRevision!==command.expectedLinkRevision||JSON.stringify(reply.read.detail?.positions)!==JSON.stringify(command.positions))electiveFail('elective_time_receipt');
}
