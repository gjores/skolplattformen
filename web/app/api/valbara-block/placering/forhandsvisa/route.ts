import{protectedRoute}from'../../../../../lib/server/authz.ts';
import{parsePlacementPreviewRequest}from'../../../../../lib/elective-placement-contract.ts';
import{electiveRequest}from'../../../../../lib/server/elective-block.ts';
import{previewElectivePlacement}from'../../../../../lib/server/elective-placement.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>previewElectivePlacement(tx,ctx,await electiveRequest(request,parsePlacementPreviewRequest)));}
