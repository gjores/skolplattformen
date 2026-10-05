import {parseProgramplanUnitPackages,parseProgramplanValpaket,parseProgramplanValpaketList,type ProgramplanValpaketWriteRequest,type ProgramplanValpaketListRequest,type ProgramplanPackageReadRequest,type ProgramplanPackageWriteRequest} from '../programplan-packages.ts';
import {AuditUnavailable} from './authz.ts';
import type {Tx} from './db.ts';
import {lifecycleOperation} from './programplan-lifecycle.ts';
function result(rows:{result:unknown}[],input:ProgramplanPackageReadRequest,write?:ProgramplanPackageWriteRequest){try{if(rows.length!==1)throw new AuditUnavailable();const body=parseProgramplanUnitPackages(rows[0].result);if(body.planId!==input.planId)throw new AuditUnavailable();if(write){const unit=body.units.find(u=>u.unitId===write.unitId);const selection=unit?.selections.find(s=>s.blockId===write.blockId);if(!unit||unit.revision!==write.expectedRevision+1||JSON.stringify(selection?.entries??[])!==JSON.stringify(write.entries))throw new AuditUnavailable();}return{body,event:{action:write?'programplan_unit_packages_changed':'programplan_unit_packages_read',objectType:'programplan',objectId:body.planId,...(write?{details:{unitId:write.unitId,blockId:write.blockId,packageRevision:write.expectedRevision+1,count:write.entries.length}}:{})}};}catch{throw new AuditUnavailable();}}
export async function readProgramplanUnitPackages(tx:Tx,input:ProgramplanPackageReadRequest){return result(await lifecycleOperation(()=>tx<{result:unknown}[]>`select public.phase5_read_programplan_unit_packages(${input.planId}) as result`),input);}
export async function writeProgramplanUnitPackages(tx:Tx,input:ProgramplanPackageWriteRequest){return result(await lifecycleOperation(()=>tx<{result:unknown}[]>`select public.phase5_write_programplan_unit_packages(${input.planId},${input.unitId},${input.expectedRevision},${input.blockId},${tx.json(input.entries)}::jsonb) as result`),input,input);}

export async function saveProgramplanValpaket(tx:Tx,input:ProgramplanValpaketWriteRequest){
  const rows=await lifecycleOperation(()=>tx<{result:unknown}[]>`select public.phase5_save_programplan_package(${input.packageId},${input.expectedVersion},${tx.json(input.details)}::jsonb) as result`);
  try{
    if(rows.length!==1)throw new AuditUnavailable();
    const body=parseProgramplanValpaket(rows[0].result);
    if((input.packageId!==null&&body.packageId!==input.packageId)||body.version!==input.expectedVersion+1||JSON.stringify({unitId:body.unitId,kind:body.kind,name:body.name,levels:body.levels})!==JSON.stringify(input.details))throw new AuditUnavailable();
    return{body,event:{action:'programplan_package_saved',objectType:'programplan_package',objectId:body.packageId,details:{unitId:body.unitId,packageVersion:body.version,count:body.levels.length}}};
  }catch{throw new AuditUnavailable();}
}
export async function listProgramplanValpaket(tx:Tx,input:ProgramplanValpaketListRequest){
  const rows=await lifecycleOperation(()=>tx<{result:unknown}[]>`select public.phase5_list_programplan_packages(${input.unitId}) as result`);
  try{
    if(rows.length!==1)throw new AuditUnavailable();
    const body=parseProgramplanValpaketList(rows[0].result);
    if(body.unitId!==input.unitId)throw new AuditUnavailable();
    return{body,event:{action:'programplan_packages_read',objectType:'school_unit',objectId:body.unitId,details:{count:body.packages.length}}};
  }catch{throw new AuditUnavailable();}
}
