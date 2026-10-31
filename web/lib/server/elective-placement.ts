import{parsePlacementPreview,type PlacementPreviewRequest}from'../elective-placement-contract.ts';
import{Deny,type Tx}from'./db.ts';
import{electiveOperation,electiveResult,electiveProjected,type ElectiveAuthority}from'./elective-block.ts';
export async function previewElectivePlacement(tx:Tx,ctx:ElectiveAuthority,input:PlacementPreviewRequest){
 if(!ctx.identityId||!ctx.assignmentId||!['rektor','administrator'].includes(ctx.accessFunction??''))throw new Deny('forbidden',403);
 const rows=await electiveOperation(()=>tx<{result:unknown}[]>`select public.elective_placement_preview(${tx.json(input)}) as result`);
 const body=electiveProjected(()=>parsePlacementPreview(electiveResult(rows,ctx),input));
 return{body,event:{action:'elective_read',objectType:'school',objectId:input.unitId,details:{unitId:input.unitId}}};
}
