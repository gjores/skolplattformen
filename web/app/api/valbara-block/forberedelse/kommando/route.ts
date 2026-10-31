import { protectedRoute,requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseElectivePreparationCommand } from '../../../../../lib/elective-preparation.ts';
import { electivePreparationRequest,commandElectivePreparation } from '../../../../../lib/server/elective-preparation.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return commandElectivePreparation(tx,ctx,await electivePreparationRequest(request,parseElectivePreparationCommand));});}
