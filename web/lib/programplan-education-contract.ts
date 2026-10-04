import { parseProgramplanBasisReference, parseProgramplanCatalog, ProgramplanContractError,
 type CatalogProgram, type CatalogSubject, type CatalogPayload, type ProgramplanBasisReference } from './programplan-catalog.ts';
import { parseProgramplanEducationSummary, type ProgramplanEducationSummary, type ProgramplanCatalogChoice } from './programplan-workspace-contract.ts';
import { parseProgramplan, type Programplan } from './programplan-contract.ts';

function bad(): never { throw new ProgramplanContractError('invalid_programplan_education'); }
function shape(v: unknown, keys: string[]): Record<string,unknown> {
 if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype,null].includes(Object.getPrototypeOf(v))
  || Object.getOwnPropertySymbols(v).length || Object.getOwnPropertyNames(v).length !== keys.length
  || keys.some(k=>!Object.hasOwn(v,k)) || Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>d.get !== undefined || d.set !== undefined)) bad();
 return v as Record<string,unknown>;
}
function list(v: unknown, max: number): unknown[] {
 if (!Array.isArray(v) || Object.getPrototypeOf(v)!==Array.prototype || v.length>max || Object.getOwnPropertySymbols(v).length
  || Object.getOwnPropertyNames(v).length!==v.length+1 || Object.values(Object.getOwnPropertyDescriptors(v)).some(d=>d.get !== undefined || d.set !== undefined)) bad();
 for(let i=0;i<v.length;i++) if(!Object.hasOwn(v,i)) bad(); return v;
}
function text(v: unknown,max: number,trim=false): string { if(typeof v!=='string'||v.length>max) bad();const s=trim?v.trim():v;if(!s)bad();return s; }
function uuid(v: unknown): string {if(typeof v!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v))bad();return v.toLowerCase();}
function hash(v:unknown):string {if(typeof v!=='string'||!/^sha256:[0-9a-f]{64}$/u.test(v))bad();return v;}
function code(v:unknown):string {const s=text(v,96);if(!/^\p{L}[\p{L}\p{N}_-]*$/u.test(s)||['constructor','prototype','__proto__'].includes(s))bad();return s;}
function ref(v:unknown):ProgramplanSelectionRequest['programRef'] {if(v===null)return null;const r=shape(v,['code','version']);if(typeof r.version!=='number'||!Number.isSafeInteger(r.version)||r.version<1||r.version>100000)bad();return{code:code(r.code),version:r.version};}
function source(v:unknown):CatalogPayload['source'] {const r=shape(v,['url','apiVersion','fetched']);return parseProgramplanCatalog({schemaVersion:1,catalogId:'sha256:'+'0'.repeat(64),source:r,programs:[],subjects:[]}).source;}
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export type ProgramplanSelectionRequest={unitId:string|null;catalogId:string|null;programRef:{code:string;version:number}|null};
export type ProgramplanSelection={units:{id:string;name:string}[];canCreateEducation:boolean;catalogs:ProgramplanCatalogChoice[];
 selection:ProgramplanSelectionRequest;programs:{programRef:{code:string;version:number};name:string;orientations:{code:string;name:string}[]}[];
 projection:null|{catalogId:string;source:CatalogPayload['source'];program:CatalogProgram;subjects:CatalogSubject[]};decisionReady:false};
export type ProgramplanEducationCreateRequest={commandId:string;unitId:string;name:string;localCode:string|null;cohort:string;basisReference:ProgramplanBasisReference};
export type ProgramplanEducationStatusRequest={commandId:string};
export type ProgramplanEducationCreated={commandId:string;education:ProgramplanEducationSummary;plan:Programplan;replayed:boolean};
export type ProgramplanEducationStatus={commandId:string;status:'not_found'}|{commandId:string;status:'created';education:ProgramplanEducationSummary;plan:Programplan};
export function parseProgramplanSelectionRequest(v:unknown):ProgramplanSelectionRequest {const r=shape(v,['unitId','catalogId','programRef']);const result={unitId:r.unitId===null?null:uuid(r.unitId),catalogId:r.catalogId===null?null:hash(r.catalogId),programRef:ref(r.programRef)};if((result.catalogId!==null&&result.unitId===null)||(result.programRef!==null&&result.catalogId===null))bad();return result;}
export function parseProgramplanEducationCreate(v:unknown):ProgramplanEducationCreateRequest {const r=shape(v,['commandId','unitId','name','localCode','cohort','basisReference']);return{commandId:uuid(r.commandId),unitId:uuid(r.unitId),name:text(r.name,120,true),localCode:r.localCode===null?null:text(r.localCode,80,true),cohort:text(r.cohort,120,true),basisReference:parseProgramplanBasisReference(r.basisReference)};}
export function parseProgramplanEducationStatusRequest(v:unknown):ProgramplanEducationStatusRequest {return{commandId:uuid(shape(v,['commandId']).commandId)};}
export function parseProgramplanSelection(v:unknown,expectedValue:ProgramplanSelectionRequest):ProgramplanSelection {
 const expected=parseProgramplanSelectionRequest(expectedValue),r=shape(v,['units','canCreateEducation','catalogs','selection','programs','projection','decisionReady']);
 const selection=parseProgramplanSelectionRequest(r.selection);if(!same(selection,expected)||typeof r.canCreateEducation!=='boolean'||r.decisionReady!==false)bad();
 const units=list(r.units,10000).map(v=>{const u=shape(v,['id','name']);return{id:uuid(u.id),name:text(u.name,1000)};});
 if(new Set(units.map(u=>u.id)).size!==units.length||(selection.unitId!==null&&!units.some(u=>u.id===selection.unitId)))bad();
 const catalogs=list(r.catalogs,1000).map(v=>{const c=shape(v,['catalogId','source']);return{catalogId:hash(c.catalogId),source:source(c.source)};});
 if(new Set(catalogs.map(c=>c.catalogId)).size!==catalogs.length||catalogs.some((c,i)=>i>0&&catalogs[i-1].catalogId>=c.catalogId)
  ||(selection.unitId===null&&catalogs.length)||(selection.catalogId!==null&&!catalogs.some(c=>c.catalogId===selection.catalogId)))bad();
 const programs=list(r.programs,1000).map(v=>{const p=shape(v,['programRef','name','orientations']),programRef=ref(p.programRef);if(!programRef)bad();
  const orientations=list(p.orientations,1000).map(v=>{const o=shape(v,['code','name']);return{code:code(o.code),name:text(o.name,1000)};});
  if(new Set(orientations.map(o=>o.code)).size!==orientations.length)bad();return{programRef,name:text(p.name,1000),orientations};});
 if(new Set(programs.map(p=>JSON.stringify(p.programRef))).size!==programs.length||(selection.catalogId===null&&programs.length)
  ||(selection.programRef!==null&&!programs.some(p=>same(p.programRef,selection.programRef))))bad();
 let projection:ProgramplanSelection['projection']=null;
 if(r.projection!==null){const p=shape(r.projection,['catalogId','source','program','subjects']);if(selection.programRef===null||p.catalogId!==selection.catalogId)bad();
  const parsed=parseProgramplanCatalog({schemaVersion:1,catalogId:p.catalogId,source:p.source,programs:[p.program],subjects:p.subjects}),program=parsed.programs[0];
  if(!same({code:program.code,version:program.version},selection.programRef)||!same(parsed.source,catalogs.find(c=>c.catalogId===selection.catalogId)?.source))bad();
  const summary=programs.find(p=>same(p.programRef,selection.programRef));if(!summary||summary.name!==program.name||!same(summary.orientations,program.orientations.map(o=>({code:o.code,name:o.name}))))bad();
  const codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(b=>b.subjectVersion!==null).map(b=>b.code));
  if(parsed.subjects.length!==codes.size||parsed.subjects.some(s=>!codes.has(s.code)))bad();projection={catalogId:parsed.catalogId,source:parsed.source,program,subjects:parsed.subjects};
 }
 if((selection.programRef===null)!==(projection===null))bad();return{units,canCreateEducation:r.canCreateEducation,catalogs,selection,programs,projection,decisionReady:false};
}
function creationData(r:Record<string,unknown>){const education=parseProgramplanEducationSummary(r.education),plan=parseProgramplan(r.plan);
 if(education.id!==plan.offeringId||education.unitId!==plan.unitId||education.schoolName!==plan.schoolName||education.name!==plan.education.name||education.cohort!==plan.education.cohort
  ||education.programCode!==plan.education.programCode||education.orientationCode!==plan.education.orientationCode||education.latestVersion!==1||education.draftId!==plan.id
  ||education.status!=='planerad'||plan.status!=='utkast'||plan.version!==1||plan.revision!==0||plan.decidedOn!==null||plan.basisReference===null||plan.resolution.status!=='resolved'
  ||education.startYear!==Number(plan.basisReference.startedOn.slice(0,4)))bad();return{education,plan};}
export function parseProgramplanEducationCreated(v:unknown,expectedValue:ProgramplanEducationCreateRequest):ProgramplanEducationCreated {const expected=parseProgramplanEducationCreate(expectedValue),r=shape(v,['commandId','education','plan','replayed']);const data=creationData(r);
 if(uuid(r.commandId)!==expected.commandId||typeof r.replayed!=='boolean'||data.education.unitId!==expected.unitId||data.education.name!==expected.name||data.education.localCode!==expected.localCode||data.education.cohort!==expected.cohort||!same(data.plan.basisReference,expected.basisReference))bad();
 return{commandId:expected.commandId,...data,replayed:r.replayed};}
export function parseProgramplanEducationStatus(v:unknown,expectedValue:ProgramplanEducationStatusRequest):ProgramplanEducationStatus {const expected=parseProgramplanEducationStatusRequest(expectedValue);const keys=typeof v==='object'&&v!==null&&Object.getOwnPropertyDescriptor(v,'status')?.value==='not_found'?['commandId','status']:['commandId','status','education','plan'];const r=shape(v,keys);
 if(uuid(r.commandId)!==expected.commandId)bad();if(r.status==='not_found')return{commandId:expected.commandId,status:'not_found'};if(r.status!=='created')bad();return{commandId:expected.commandId,status:'created',...creationData(r)};}
