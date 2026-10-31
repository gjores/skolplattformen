import {parseElectivePreparationScope,type ElectivePreparationScope} from './elective-preparation.ts';
export type PreparationStorage=Pick<Storage,'key'|'getItem'|'length'>;
export function preparationJournalKey(identityKey:string,scope:ElectivePreparationScope):string{
 return `sp:elective-preparation:${identityKey}:${scope.unitId}:${scope.planId}:${scope.schoolYear}:${scope.columnId}`;
}
/** Only scope metadata from this actor's own pending references; never reads or stores the full draft. */
export function pendingPreparationScopes(identityKey:string,storage:PreparationStorage,schoolYear:number,unitIds:readonly string[]):ElectivePreparationScope[]{
 const prefix=`sp:elective-preparation:${identityKey}:`,result:ElectivePreparationScope[]=[];
 for(let index=0;index<storage.length;index++){
  const key=storage.key(index);if(!key?.startsWith(prefix)||storage.getItem(key)===null)continue;
  const [unitId,planId,year,columnId,...extra]=key.slice(prefix.length).split(':');if(extra.length||Number(year)!==schoolYear||!unitIds.includes(unitId))continue;
  try{result.push(parseElectivePreparationScope({unitId,planId,schoolYear:Number(year),columnId}));}catch{/* A malformed foreign key cannot provide an owned scope. Corrupt contents of a valid key are handled by the child. */}
 }
 return result.sort((a,b)=>preparationJournalKey(identityKey,a).localeCompare(preparationJournalKey(identityKey,b)));
}
