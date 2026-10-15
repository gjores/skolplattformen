import {parseTimplanSeries, type TimplanSeries} from './named-timplan.ts';
import { gymArray, gymInteger, gymShape, gymText, gymUuid } from './gym-timplan.ts';
import { parseClassPlanLinkReply, parseClassPlanLinkRequest, type ClassPlanUnderlag, type ClassPlanLinkRequest, type ClassPlanLinkReply } from './class-timplan.ts';

export type ClassLinkQueueState = 'pending' | 'unknown' | 'receipt' | 'saved' | 'conflict';
export type ClassLinkQueueEntry = { name: string; request: ClassPlanLinkRequest; state: ClassLinkQueueState; receipt: ClassPlanLinkReply | null };
export type ClassLinkQueue = { version: 1; scope: string; planId: string; unitId: string; offeringId: string; schoolYear: number; planVersion: number; series: TimplanSeries | null; entries: ClassLinkQueueEntry[] };
function bad(): never { throw new TypeError('Den sparade klasskopplingen kunde inte kontrolleras.'); }
export function parseClassLinkQueue(value: unknown, scope: string, planId: string, unitId: string, offeringId: string): ClassLinkQueue {
 const r=gymShape(value,['version','scope','planId','unitId','offeringId','schoolYear','planVersion','series','entries']);
 if(r.version!==1||r.scope!==scope||r.planId!==planId||r.unitId!==unitId||r.offeringId!==offeringId)bad();
 const schoolYear=gymInteger(r.schoolYear,2100,2000),planVersion=gymInteger(r.planVersion,2147483647,1),series=r.series===null?null:parseTimplanSeries(r.series);
 const entries=gymArray(r.entries,2000).map(value=>{
  const e=gymShape(value,['name','request','state','receipt']),request=parseClassPlanLinkRequest(e.request),name=gymText(e.name,60);
  if(!name||request.planId!==planId||request.schoolYear!==schoolYear||!['pending','unknown','receipt','saved','conflict'].includes(String(e.state)))bad();
  const state=e.state as ClassLinkQueueState,receipt=e.receipt===null?null:parseClassPlanLinkReply(e.receipt,request);
  if((state==='receipt'||state==='saved')&&!receipt||(state==='pending'||state==='unknown')&&receipt)bad();
  return {name,request,state,receipt};
 });
 if(!entries.length||new Set(entries.map(e=>e.request.classId)).size!==entries.length||new Set(entries.map(e=>e.request.commandId)).size!==entries.length
   ||new Set(entries.map(e=>e.request.expectedPlanRevision)).size!==1||new Set(entries.map(e=>e.request.columnId)).size!==1)bad();
 if(entries.filter(e=>e.state==='unknown'||e.state==='receipt').length>1)bad();
 return {version:1,scope,planId:gymUuid(planId),unitId:gymUuid(unitId),offeringId:gymUuid(offeringId),schoolYear,planVersion,series,entries};
}
export function queueHasUnknown(queue: ClassLinkQueue): boolean { return queue.entries.some(e=>e.state==='unknown'||e.state==='receipt'); }
export function queueComplete(queue: ClassLinkQueue): boolean { return queue.entries.every(e=>e.state==='saved'); }
export function updateQueueEntry(queue: ClassLinkQueue,index: number,change: Partial<Pick<ClassLinkQueueEntry,'state'|'receipt'>>): ClassLinkQueue {
 return {...queue,entries:queue.entries.map((e,i)=>i===index?{...e,...change}:e)};
}
/** Only a receipt AND a matching fresh server read establish a saved link. */
export function reconcileClassLinkQueue(queue: ClassLinkQueue,data: ClassPlanUnderlag): ClassLinkQueue {
 if(data.plan.id!==queue.planId||data.plan.unitId!==queue.unitId||data.plan.offeringId!==queue.offeringId||data.schoolYear!==queue.schoolYear)bad();
 return {...queue,entries:queue.entries.map(e=>{
  if(e.state==='unknown'||e.state==='conflict')return e;
  const klass=data.classes.find(c=>c.id===e.request.classId),link=klass?.link;
  if(e.receipt){
   const matches=link&&link.planId===e.receipt.planId&&link.columnId===e.receipt.columnId&&link.revision===e.receipt.revision&&!link.legacy;
   return {...e,state:matches?'saved':'conflict'};
  }
  const matches=klass&&klass.name===e.name&&data.plan.version===queue.planVersion&&JSON.stringify(data.plan.series??null)===JSON.stringify(queue.series)&&data.canManage&&data.plan.revision===e.request.expectedPlanRevision&&data.plan.status==='faststalld'
    &&(link ? link.planId===e.request.previousPlanId&&link.revision===e.request.expectedLinkRevision : e.request.previousPlanId===null&&e.request.expectedLinkRevision===null);
  return matches?e:{...e,state:'conflict'};
 })};
}
