import { ProgramplanContractError } from './programplan-catalog.ts';
import { gymArray, gymBoolean, gymInteger, gymShape, gymStatus, gymText, gymUuid } from './gym-timplan.ts';
import type { TimplanStatus } from './protected-timplan.ts';
export type ClassPlanColumn = 'ar1' | 'ar2' | 'ar3';
export type ClassPlanLink = {planId:string;version:number;status:TimplanStatus;columnId:ClassPlanColumn;revision:number;legacy:boolean};
export type ClassPlanUnderlagRequest = {planId:string;schoolYear:number};
export type ClassPlanUnderlag = {
 plan:{id:string;offeringId:string;unitId:string;schoolName:string;educationName:string;cohort:string;startYear:number|null;version:number;status:TimplanStatus;revision:number};
 schoolYear:number;canManage:boolean;blockers:string[];
 classes:{id:string;name:string;startYear:number;link:ClassPlanLink|null}[];
 linkedClasses:{classId:string|null;className:string;classStartYear:number|null;schoolYear:number;columnId:ClassPlanColumn;revision:number;legacy:boolean}[];
};
export type ClassPlanCreateRequest = {commandId:string;planId:string;expectedPlanRevision:number;name:string;startYear:number};
export type ClassPlanCreateReply = {id:string;name:string;startYear:number;replayed:boolean};
export type ClassPlanLinkRequest = {commandId:string;classId:string;schoolYear:number;planId:string;expectedPlanRevision:number;columnId:ClassPlanColumn;expectedLinkRevision:number|null;previousPlanId:string|null};
export type ClassPlanLinkReply = {classId:string;schoolYear:number;planId:string;columnId:ClassPlanColumn;revision:number;replayed:boolean};
function bad():never{throw new ProgramplanContractError('invalid_class_plan');}
function year(v:unknown){return gymInteger(v,2100,2000);}
function column(v:unknown):ClassPlanColumn{if(v!=='ar1'&&v!=='ar2'&&v!=='ar3')bad();return v;}
function name(v:unknown){const n=gymText(v,60);if(!n||n!==n.trim().toUpperCase()||/[\p{Cc}\p{Cf}]/u.test(n))bad();return n;}
export function parseClassPlanUnderlagRequest(value:unknown):ClassPlanUnderlagRequest{const r=gymShape(value,['planId','schoolYear']);return{planId:gymUuid(r.planId),schoolYear:year(r.schoolYear)};}
export function parseClassPlanCreateRequest(value:unknown):ClassPlanCreateRequest{const r=gymShape(value,['commandId','planId','expectedPlanRevision','name','startYear']);return{commandId:gymUuid(r.commandId),planId:gymUuid(r.planId),expectedPlanRevision:gymInteger(r.expectedPlanRevision),name:name(r.name),startYear:year(r.startYear)};}
export function parseClassPlanLinkRequest(value:unknown):ClassPlanLinkRequest{
 const r=gymShape(value,['commandId','classId','schoolYear','planId','expectedPlanRevision','columnId','expectedLinkRevision','previousPlanId']);
 if((r.expectedLinkRevision===null)!==(r.previousPlanId===null))bad();
 return{commandId:gymUuid(r.commandId),classId:gymUuid(r.classId),schoolYear:year(r.schoolYear),planId:gymUuid(r.planId),expectedPlanRevision:gymInteger(r.expectedPlanRevision),columnId:column(r.columnId),expectedLinkRevision:r.expectedLinkRevision===null?null:gymInteger(r.expectedLinkRevision),previousPlanId:r.previousPlanId===null?null:gymUuid(r.previousPlanId)};
}
export function parseClassPlanCreateReply(value:unknown,input:ClassPlanCreateRequest):ClassPlanCreateReply{const r=gymShape(value,['id','name','startYear','replayed']);const result={id:gymUuid(r.id),name:name(r.name),startYear:year(r.startYear),replayed:gymBoolean(r.replayed)};if(result.name!==input.name||result.startYear!==input.startYear)bad();return result;}
export function parseClassPlanLinkReply(value:unknown,input:ClassPlanLinkRequest):ClassPlanLinkReply{const r=gymShape(value,['classId','schoolYear','planId','columnId','revision','replayed']);const result={classId:gymUuid(r.classId),schoolYear:year(r.schoolYear),planId:gymUuid(r.planId),columnId:column(r.columnId),revision:gymInteger(r.revision),replayed:gymBoolean(r.replayed)};if(result.classId!==input.classId||result.schoolYear!==input.schoolYear||result.planId!==input.planId||result.columnId!==input.columnId||result.revision!==(input.expectedLinkRevision??-1)+1)bad();return result;}
export function parseClassPlanUnderlag(value:unknown,input:ClassPlanUnderlagRequest):ClassPlanUnderlag{
 const r=gymShape(value,['plan','schoolYear','canManage','blockers','classes','linkedClasses']);
 const p=gymShape(r.plan,['id','offeringId','unitId','schoolName','educationName','cohort','startYear','version','status','revision']);
 const plan={id:gymUuid(p.id),offeringId:gymUuid(p.offeringId),unitId:gymUuid(p.unitId),schoolName:gymText(p.schoolName),educationName:gymText(p.educationName),cohort:gymText(p.cohort),startYear:p.startYear===null?null:year(p.startYear),version:gymInteger(p.version,2147483647,1),status:gymStatus(p.status),revision:gymInteger(p.revision)};
 const classes=gymArray(r.classes,2000).map(v=>{const c=gymShape(v,['id','name','startYear','link']);let link:ClassPlanLink|null=null;if(c.link!==null){const l=gymShape(c.link,['planId','version','status','columnId','revision','legacy']);link={planId:gymUuid(l.planId),version:gymInteger(l.version,2147483647,1),status:gymStatus(l.status),columnId:column(l.columnId),revision:gymInteger(l.revision),legacy:gymBoolean(l.legacy)};}return{id:gymUuid(c.id),name:name(c.name),startYear:gymInteger(c.startYear,9998,1),link};});
 const linkedClasses=gymArray(r.linkedClasses,2000).map(v=>{const c=gymShape(v,['classId','className','classStartYear','schoolYear','columnId','revision','legacy']);const result={classId:c.classId===null?null:gymUuid(c.classId),className:name(c.className),classStartYear:c.classStartYear===null?null:gymInteger(c.classStartYear,9998,1),schoolYear:year(c.schoolYear),columnId:column(c.columnId),revision:gymInteger(c.revision),legacy:gymBoolean(c.legacy)};if(result.legacy!==(result.classId===null)||(result.classId===null)!==(result.classStartYear===null))bad();return result;});
 const result={plan,schoolYear:year(r.schoolYear),canManage:gymBoolean(r.canManage),blockers:gymArray(r.blockers,20).map(v=>gymText(v)),classes,linkedClasses};
 if(plan.id!==input.planId||result.schoolYear!==input.schoolYear||new Set(classes.map(c=>c.id)).size!==classes.length||new Set(linkedClasses.map(c=>`${c.className}:${c.schoolYear}`)).size!==linkedClasses.length||result.canManage&&(plan.status!=='faststalld'||result.blockers.length>0||plan.startYear===null))bad();
 return result;
}
