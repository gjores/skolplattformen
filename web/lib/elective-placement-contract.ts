import {electiveArray,electiveBoolean,electiveDate,electiveEnum,electiveFail,electiveInteger,electiveShape,electiveText,electiveUuid,parseElectiveBasisHash,parseElectiveCommand,type ElectiveCommand,type ElectiveScope} from './elective-block-contract.ts';
export type PlacementPayload=Extract<ElectiveCommand,{action:'save_placement'}>['payload'];
export type PlacementPreviewRequest=ElectiveScope & {expectedRevision:number;payload:Omit<PlacementPayload,'expectedBasisHash'>};
type Period={startsOn:string;endsOn:string|null};
export type PlacementPreview=ElectiveScope & {revision:number;basisHash:string;allowed:boolean;issues:string[];
 pupil:{id:string;name:string;version:number};group:Period & {id:string;name:string};period:{startsOn:string;endsOn:string};
 schoolPeriods:Period[];classPeriods:(Period & {classId:string;className:string})[];
 previous:null|(Period & {id:string;groupId:string;groupName:string;revision:number;operation:'end'|'cancel'});warnings:string[]};
const nullableDate=(v:unknown)=>v===null?null:electiveDate(v);
function period(v:unknown):Period{const r=electiveShape(v,['startsOn','endsOn']);return {startsOn:electiveDate(r.startsOn),endsOn:nullableDate(r.endsOn)};}
export function parsePlacementPreviewRequest(v:unknown):PlacementPreviewRequest{
 const r=electiveShape(v,['unitId','schoolYear','expectedRevision','payload']),p=electiveShape(r.payload,['placementId','choiceId','expectedChoiceRevision','groupId','startsOn','endsOn','previousPlacementId']);
 const c=parseElectiveCommand({...r,commandId:'00000000-0000-0000-0000-000000000000',action:'save_placement',payload:{...p,expectedBasisHash:'0'.repeat(64)}});
 if(c.action!=='save_placement')electiveFail();const {expectedBasisHash:_hash,...payload}=c.payload;
 return {unitId:c.unitId,schoolYear:c.schoolYear,expectedRevision:c.expectedRevision,payload};
}
export function parsePlacementPreview(v:unknown,expected:PlacementPreviewRequest):PlacementPreview{
 const r=electiveShape(v,['unitId','schoolYear','revision','basisHash','allowed','issues','pupil','group','period','schoolPeriods','classPeriods','previous','warnings']);
 const unitId=electiveUuid(r.unitId),schoolYear=electiveInteger(r.schoolYear,2000,2100);if(unitId!==expected.unitId||schoolYear!==expected.schoolYear)electiveFail('elective_scope');
 const p=electiveShape(r.pupil,['id','name','version']),g=electiveShape(r.group,['id','name','startsOn','endsOn']),d=period(r.period);
 if(electiveUuid(g.id)!==expected.payload.groupId||d.startsOn!==expected.payload.startsOn||d.endsOn===null||expected.payload.endsOn!==null&&d.endsOn!==expected.payload.endsOn)electiveFail('elective_scope');
 const previous=r.previous===null?null:(()=>{const a=electiveShape(r.previous,['id','groupId','groupName','startsOn','endsOn','revision','operation']);return {id:electiveUuid(a.id),groupId:electiveUuid(a.groupId),groupName:electiveText(a.groupName),startsOn:electiveDate(a.startsOn),endsOn:nullableDate(a.endsOn),revision:electiveInteger(a.revision,1),operation:electiveEnum(a.operation,['end','cancel'] as const)};})();
 if(previous?.id!==expected.payload.previousPlacementId&&!(previous===null&&expected.payload.previousPlacementId===null))electiveFail('elective_scope');
 const issues=electiveArray(r.issues,x=>electiveText(x,80),50),allowed=electiveBoolean(r.allowed);if(allowed!==(issues.length===0))electiveFail();
 return {unitId,schoolYear,revision:electiveInteger(r.revision,1),basisHash:parseElectiveBasisHash(r.basisHash),allowed,issues,pupil:{id:electiveUuid(p.id),name:electiveText(p.name),version:electiveInteger(p.version,1)},group:{id:electiveUuid(g.id),name:electiveText(g.name),startsOn:electiveDate(g.startsOn),endsOn:nullableDate(g.endsOn)},period:{startsOn:d.startsOn,endsOn:d.endsOn},schoolPeriods:electiveArray(r.schoolPeriods,period,500),classPeriods:electiveArray(r.classPeriods,x=>{const a=electiveShape(x,['classId','className','startsOn','endsOn']);return {classId:electiveUuid(a.classId),className:electiveText(a.className),startsOn:electiveDate(a.startsOn),endsOn:nullableDate(a.endsOn)};},500),previous,warnings:electiveArray(r.warnings,x=>electiveText(x,80),50)};
}
