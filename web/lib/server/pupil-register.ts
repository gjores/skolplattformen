import { isValidDate, isValidPeriod, luhnOk, parseConflictDetails, EXPORT_FIELDS, type ListRequest, type CardRequest, type HistoryRequest, type ChangeRequest, type CreatePupilRequest, type ExportSelection } from '../pupil-register-model.ts';
import { AuditUnavailable, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';
import { auditPupilRegisterResult, type PupilAuditOperation, type PupilAuditedResult } from './pupil-register-audit.ts';

type Row = Record<string, unknown>;
type Parser = (value: unknown) => unknown;
const bad = (): never => { throw new Deny('bad_request', 400); };
const object = (v: unknown): Row => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Row : bad();
const shape = (fields: Record<string, Parser>): Parser => value => {
  const row=object(value); if(Object.keys(row).length!==Object.keys(fields).length || Object.keys(row).some(k=>!Object.hasOwn(fields,k))) bad();
  return Object.fromEntries(Object.entries(fields).map(([key,parse])=>[key,parse(row[key])]));
};
const text: Parser = v => typeof v==='string' && v.length>0 && v.length<=10000 ? v : bad();
const displayName: Parser = v => typeof v==='string' && v.trim()===v && v.length>0 && v.length<=240 ? v : bad();
const boolean: Parser = v => typeof v==='boolean' ? v : bad();
const integer = (min: number,max=Number.MAX_SAFE_INTEGER): Parser => v => Number.isSafeInteger(v) && Number(v)>=min && Number(v)<=max ? v : bad();
const nullable = (parse: Parser): Parser => v => v===null ? null : parse(v);
const array = (parse: Parser): Parser => v => Array.isArray(v) ? v.map(parse) : bad();
const enumeration = (values: readonly unknown[]): Parser => v => values.includes(v) ? v : bad();
const uuid: Parser = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v) ? v : bad();
const date: Parser = v => isValidDate(v) ? v : bad();
const time: Parser = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(v) && isValidDate(v.slice(0,10)) && Number.isFinite(Date.parse(v)) ? v : bad();
const year=integer(1,9998), page=integer(1,2147483647), grade=nullable(integer(-9996,9998));
const status=enumeration(['aktuell','framtida','avslutad']);
const municipality: Parser=v=>typeof v==='string' && /^\d{4}$/u.test(v) ? v : bad();
const personalNumber: Parser=v=>typeof v==='string' && /^TEST-\d{8}-\d{4}$/u.test(v) && isValidDate(`${v.slice(5,9)}-${v.slice(9,11)}-${v.slice(11,13)}`) && luhnOk(v.slice(7,13)+v.slice(14)) ? v : bad();
const selection=shape({schoolYear:year,unitId:uuid,classId:nullable(uuid),educationId:nullable(uuid),grade,status:nullable(status),page});
const cardFields={pupilId:uuid,schoolYear:year,caseId:nullable(uuid)};
const periodFields={startsOn:date,endsOn:nullable(date)};
const periodShape=(fields: Record<string,Parser>): Parser=>v=>{const r=shape({...fields,...periodFields})(v) as Row;if(!isValidPeriod(r as {startsOn:string;endsOn:string|null}))bad();return r;};
const search: Parser=v=>typeof v==='string' && v.length<=200 && !v.split('').some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127) ? v : bad();
export function parsePupilListRequest(value: unknown, accessFunction: string | null): ListRequest {
 const parsed=shape({selection,search,caseId:nullable(uuid)})(value) as ListRequest;
 // Identity/date-shaped searches are an administrative function; SQL still owns row visibility.
 if(accessFunction!=='administrator' && /\d{6}|\d{4}-\d{2}-\d{2}|TEST-/iu.test(parsed.search)) bad();
 return parsed;
}
export function parsePupilCardRequest(value:unknown):CardRequest {return shape(cardFields)(value) as CardRequest;}
export function parsePupilCardQuery(query:URLSearchParams, history=false):CardRequest|HistoryRequest {
 const keys=[...query.keys()];if(new Set(keys).size!==keys.length || keys.some(k=>!['pupilId','schoolYear','caseId',...(history?['page']:[])].includes(k)))bad();
 for(const key of ['schoolYear',...(history?['page']:[])]) if(!/^[1-9]\d*$/u.test(query.get(key)??''))bad();
 return shape({...cardFields,...(history?{page}:{})})({pupilId:query.get('pupilId'),schoolYear:Number(query.get('schoolYear')),caseId:query.get('caseId'),...(history?{page:Number(query.get('page'))}:{})}) as CardRequest|HistoryRequest;
}
export function parsePupilChangeRequest(value:unknown):ChangeRequest {
 const r=object(value); const payloads:Record<string,Parser>={
  basics:v=>{const b=object(v),keys=Object.keys(b);if(!keys.length||keys.some(k=>!['displayName','personalNumber','protectedIdentity'].includes(k)))bad();return shape(Object.fromEntries(keys.map(k=>[k,k==='displayName'?displayName:k==='personalNumber'?personalNumber:boolean])))(b);},
  municipality:periodShape({municipalityCode:municipality}), transfer:periodShape({placementId:uuid,unitId:uuid,educationId:uuid}),
  education:shape({placementId:uuid,educationId:uuid,startsOn:date}), 'end-placement':shape({placementId:uuid,endsOn:date}),
  class:periodShape({placementId:uuid,classId:uuid}), 'resolve-source':shape({conflictId:uuid,choice:enumeration(['local','source'])}),
 };
 if(typeof r.kind!=='string'||!Object.hasOwn(payloads,r.kind))bad();
 return shape({...cardFields,expectedVersion:integer(1),kind:enumeration(Object.keys(payloads)),payload:payloads[r.kind as string]})(r) as ChangeRequest;
}
export function parseCreatePupilRequest(value:unknown):CreatePupilRequest {return shape({schoolYear:year,displayName,personalNumber,protectedIdentity:boolean,placement:periodShape({unitId:uuid,educationId:uuid}),classId:uuid,municipality:periodShape({municipalityCode:municipality})})(value) as CreatePupilRequest;}
export function parsePupilExportRequest(value:unknown):ExportSelection {
 const r=object(value); const parsed=shape({schoolYear:year,caseId:nullable(uuid),fields:array(enumeration(EXPORT_FIELDS)),protectedIds:array(uuid),includePersonalNumber:boolean,mode:enumeration(['ids','filter']),...(r.mode==='ids'?{ids:array(uuid)}:{selection,search})})(r) as ExportSelection;
 for(const values of [parsed.fields,parsed.protectedIds,...(parsed.mode==='ids'?[parsed.ids]:[])]) if(new Set(values).size!==values.length)bad();
 if(!parsed.fields.length || (parsed.mode==='ids'&&!parsed.ids.length) || (parsed.mode==='filter'&&parsed.selection.schoolYear!==parsed.schoolYear))bad(); return parsed;
}
const caps={canEdit:boolean,canExport:boolean,canRevealPersonalNumber:boolean,canReadHistory:boolean};
const rowFields={id:uuid,displayName:text,unitId:uuid,unitName:text,classId:nullable(uuid),className:nullable(text),educationId:uuid,educationName:text,grade,status,capabilities:shape(caps)};
const pupilRow:Parser=value=>{const r=object(value);return shape({...rowFields,...(Object.hasOwn(r,'birthDate')?{birthDate:date,municipalityCode:nullable(municipality)}:{})})(r);};
const named={id:uuid,name:text};
const origin=shape({source:enumeration(['manual','ss12000','spar','simulated']),actorId:nullable(uuid),changedAt:time,localCorrection:boolean});
const originFields=['displayName','personalNumber','protectedIdentity','municipality','placement','education','class'];
const safeValue:Parser=v=>v===null||typeof v==='boolean'||(typeof v==='string'&&v.length<=10000)?v:bad();
const sourceConflict:Parser=v=>{const r=object(v);return shape({id:uuid,field:enumeration(originFields),origin,...(r.field==='personalNumber'?{}:{local:safeValue,incoming:safeValue})})(r);};
const cardBody:Parser=v=>{const r=object(v);return shape({...rowFields,...(Object.hasOwn(r,'birthDate')?{birthDate:date,municipalityCode:nullable(municipality)}:{}),version:integer(1),placements:array(periodShape({id:uuid,unitId:uuid,educationId:uuid})),classes:array(periodShape({id:uuid,placementId:uuid,classId:uuid})),...(Object.hasOwn(r,'protectedIdentity')?{protectedIdentity:boolean,municipalities:array(periodShape({id:uuid,municipalityCode:municipality,origin:nullable(origin)})),origins:v=>{const o=object(v);if(Object.keys(o).some(k=>!originFields.includes(k)))bad();return shape(Object.fromEntries(Object.keys(o).map(k=>[k,origin])))(o);},sourceConflicts:array(sourceConflict)}:{})})(r);};
const listBody=shape({pupils:array(pupilRow),scope:shape({schools:array(shape(named)),groups:array(shape({...named,unitId:uuid})),cases:array(shape({...named,unitId:uuid}))}),options:shape({schools:array(shape(named)),classes:array(shape({...named,unitId:uuid,educationId:nullable(uuid)})),educations:array(shape({...named,unitId:uuid,startYear:nullable(year)})),grades:array(integer(-9996,9998)),statuses:array(status)}),capabilities:shape({...caps,canReadProtected:boolean}),count:integer(0),page,pageSize:enumeration([50])});
const historyBody=shape({entries:array(v=>{const r=object(v);return shape({id:uuid,field:enumeration(originFields),before:r.field==='personalNumber'?enumeration([null]):safeValue,after:r.field==='personalNumber'?enumeration([null]):safeValue,changedBy:nullable(uuid),changedAt:time,origin,...(Object.hasOwn(r,'resolution')?{resolution:nullable(enumeration(['local','source']))}:{})})(r);}),count:integer(0),page,pageSize:enumeration([20])});
function projectedResult(value:unknown, body:Parser, allowConflict=false):PupilAuditedResult<unknown> {
 try {const r=object(value);if(r.kind==='conflict'&&allowConflict){shape({kind:enumeration(['conflict']),details:v=>v,auditRefs:v=>v})(r);const details=parseConflictDetails(r.details);if(!details)throw new AuditUnavailable();return {kind:'conflict',details,auditRefs:r.auditRefs as never};}
 return shape({kind:enumeration(['success']),body,auditRefs:v=>v})(r) as PupilAuditedResult<unknown>;
 }catch{throw new AuditUnavailable();}
}
async function auditRows(tx:Tx,ctx:Context,rows:{result:unknown}[],body:Parser,operation:PupilAuditOperation,allowConflict=false){
 if(rows.length!==1)throw new AuditUnavailable(); const result=projectedResult(rows[0].result,body,allowConflict);
 return auditPupilRegisterResult(tx,ctx,result,{...operation,...(result.kind==='success'&&typeof (result.body as Row).count==='number'?{count:(result.body as Row).count as number}:{})});
}
export async function listPupils(tx:Tx,ctx:Context,input:ListRequest){const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_list_pupils(${tx.json(input)}) as result`);return auditRows(tx,ctx,rows,listBody,{action:'pupil_list_read',schoolYear:input.selection.schoolYear});}
export async function readPupil(tx:Tx,ctx:Context,input:CardRequest){const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_pupil_card(${tx.json(input)}) as result`);return auditRows(tx,ctx,rows,cardBody,{action:'pupil_read',pupilId:input.pupilId,schoolYear:input.schoolYear});}
export async function readPupilHistory(tx:Tx,ctx:Context,input:HistoryRequest){const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_pupil_history(${tx.json(input)}) as result`);return auditRows(tx,ctx,rows,historyBody,{action:'pupil_history_read',pupilId:input.pupilId,schoolYear:input.schoolYear});}
export async function revealPupilPersonalNumber(tx:Tx,ctx:Context,input:CardRequest){const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_reveal_personal_number(${tx.json(input)}) as result`);return auditRows(tx,ctx,rows,shape({pupilId:uuid,personalNumber}),{action:'pupil_personal_number_read',pupilId:input.pupilId,schoolYear:input.schoolYear});}
export async function exportPupils(tx:Tx,ctx:Context,input:ExportSelection,preview:boolean){
 const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_export_pupils(${tx.json(input)},${preview}) as result`);
 const fieldParsers:Record<string,Parser>={id:uuid,displayName:text,birthDate:date,unitName:text,className:nullable(text),educationName:text,grade,status,municipalityCode:nullable(municipality),personalNumber};
 const body:Parser=v=>{const r=shape({count:integer(0),fields:array(enumeration(EXPORT_FIELDS)),includePersonalNumber:boolean,...(preview?{}:{rows:array(shape(Object.fromEntries([...input.fields,...(input.includePersonalNumber?['personalNumber']:[])].map(k=>[k,fieldParsers[k]]))))})})(v) as Row;if(JSON.stringify(r.fields)!==JSON.stringify(input.fields)||r.includePersonalNumber!==input.includePersonalNumber)bad();return r;};
 return auditRows(tx,ctx,rows,body,{action:preview?'pupil_export_preview':'pupil_exported',schoolYear:input.schoolYear,fields:input.fields});
}

/** No resolve-source/create dispatch until their SQL is installed by 04-06. */
export async function changePupil(tx:Tx,ctx:Context,input:ChangeRequest){
 if(input.kind==='resolve-source')throw new Deny('bad_request',400);
 const actions={basics:'pupil_updated',municipality:'pupil_municipality_changed',transfer:'pupil_transferred',education:'pupil_education_changed','end-placement':'pupil_placement_ended',class:'pupil_class_changed'} as const;
 const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_change_pupil(${tx.json(input)}) as result`);
 return auditRows(tx,ctx,rows,shape({pupilId:uuid,version:integer(1),warnings:array(enumeration(['class-education-mismatch']))}),{action:actions[input.kind],pupilId:input.pupilId,schoolYear:input.schoolYear},true);
}

/** Reference choices only: no pupil-derived options and no pupil contents. */
export async function readPupilSelection(tx: Tx) {
 const rows=await mandateOperation(()=>tx<{result:unknown}[]>`select public.phase4_register_selection() as result`);
 try {
  if(rows.length!==1)throw new AuditUnavailable();
  const body=shape({schoolYears:array(year),currentSchoolYear:year,scope:shape({schools:array(shape(named)),groups:array(shape({...named,unitId:uuid})),cases:array(shape({...named,unitId:uuid}))}),endsAt:nullable(time),approverName:nullable(text),purposeCode:nullable(text),serverNow:time})(rows[0].result) as {schoolYears:number[];currentSchoolYear:number};
  if(!body.schoolYears.includes(body.currentSchoolYear)||new Set(body.schoolYears).size!==body.schoolYears.length)throw new AuditUnavailable();
  return body;
 }catch{throw new AuditUnavailable();}
}
