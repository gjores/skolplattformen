import { ProgramplanContractError, verifyProgramplanCatalog } from '../programplan-catalog.ts';
import { parseProgramplanSelection,parseProgramplanSelectionRequest,parseProgramplanEducationCreated,parseProgramplanEducationStatus,
 type ProgramplanSelectionRequest,type ProgramplanSelection,type ProgramplanEducationCreateRequest,type ProgramplanEducationStatusRequest } from '../programplan-education-contract.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny,type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';
async function operation<T>(fn:()=>Promise<T>):Promise<T>{try{return await mandateOperation(fn);}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='55000')throw new AuditUnavailable();throw e;}}
function row(rows:{result:unknown}[]){if(rows.length!==1)throw new AuditUnavailable();return rows[0].result;}
async function selectionData(tx:Tx,input:ProgramplanSelectionRequest):Promise<ProgramplanSelection>{
 const result=row(await operation(()=>tx<{result:unknown}[]>`select public.phase5_programplan_selection(${input.unitId},${input.catalogId},${input.programRef===null?null:tx.json(input.programRef)}::jsonb) as result`));
 try{
  if(!result||typeof result!=='object'||Array.isArray(result))throw new AuditUnavailable();
  const r=result as Record<string,unknown>;
  if(Object.keys(r).length!==6||['units','canCreateEducation','catalogs','selection','payload','decisionReady'].some(k=>!Object.hasOwn(r,k)))throw new AuditUnavailable();
  let programs:ProgramplanSelection['programs']=[],projection:ProgramplanSelection['projection']=null;
  if(input.catalogId===null){if(r.payload!==null)throw new AuditUnavailable();}
  else{
   const payload=r.payload as Record<string,unknown>;
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).length!==4||['schemaVersion','source','subjects','programs'].some(k=>!Object.hasOwn(payload,k)))throw new AuditUnavailable();
   const verified=await verifyProgramplanCatalog({...payload,catalogId:input.catalogId});
   programs=verified.programs.map(p=>({programRef:{code:p.code,version:p.version},name:p.name,orientations:p.orientations.map(o=>({code:o.code,name:o.name}))}));
   if(input.programRef!==null){const program=verified.programs.find(p=>p.code===input.programRef!.code&&p.version===input.programRef!.version);if(!program)throw new ProgramplanContractError('program_not_found');
    const codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(b=>b.subjectVersion!==null).map(b=>b.code));
    projection={catalogId:verified.catalogId,source:verified.source,program,subjects:verified.subjects.filter(s=>codes.has(s.code))};}
  }
  const {payload:_payload,...metadata}=r;return parseProgramplanSelection({...metadata,programs,projection},input);
 }catch(error){if(error instanceof ProgramplanContractError&&error.code==='program_not_found')throw new Deny('bad_request',400);throw new AuditUnavailable();}
}
export async function readProgramplanSelection(tx:Tx,input:ProgramplanSelectionRequest){
 const body=await selectionData(tx,parseProgramplanSelectionRequest(input));return{body,event:{action:'programplan_selection_read',objectType:'education_collection',objectId:null}};
}
export async function createProgramplanEducation(tx:Tx,input:ProgramplanEducationCreateRequest){
 // Whole stored catalog verification precedes the atomic command. A projection
 // is never treated as a verified catalog or used as the source of authority.
 const selection=await selectionData(tx,{unitId:input.unitId,catalogId:input.basisReference.catalogId,programRef:input.basisReference.programRef});
 if(!selection.canCreateEducation)throw new Deny('forbidden',403);
 if(!selection.projection)throw new AuditUnavailable();
 // SQL performs the authoritative complete basis validation too. The projection
 // intentionally has no verifyProgramplanCatalog capability.
 const result=row(await operation(()=>tx<{result:unknown}[]>`select public.phase5_create_programplan_education(${input.commandId},${input.unitId},${input.name},${input.localCode},${input.cohort},${tx.json(input.basisReference)}::jsonb) as result`));
 try{const body=parseProgramplanEducationCreated(result,input);return{body,event:{action:'programplan_education_created',objectType:'education',objectId:body.education.id}};}catch{throw new AuditUnavailable();}
}
export async function readProgramplanEducationStatus(tx:Tx,input:ProgramplanEducationStatusRequest){
 const result=row(await operation(()=>tx<{result:unknown}[]>`select public.phase5_programplan_education_status(${input.commandId}) as result`));
 try{const body=parseProgramplanEducationStatus(result,input);return{body,event:{action:'programplan_education_status_read',objectType:'education_command',objectId:input.commandId}};}catch{throw new AuditUnavailable();}
}
