import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parseElectivePreparationRef } from '../../../../../lib/elective-preparation.ts';
import { electivePreparationRequest,statusElectivePreparation } from '../../../../../lib/server/elective-preparation.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_status',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>statusElectivePreparation(tx,ctx,await electivePreparationRequest(request,parseElectivePreparationRef)));}
