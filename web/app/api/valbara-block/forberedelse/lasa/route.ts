import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parseElectivePreparationScope } from '../../../../../lib/elective-preparation.ts';
import { electivePreparationRequest,readElectivePreparation } from '../../../../../lib/server/elective-preparation.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>readElectivePreparation(tx,ctx,await electivePreparationRequest(request,parseElectivePreparationScope)));}
