import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parseValplanScope } from '../../../../lib/valplan-contract.ts';
import { valplanRequest,readValplaner } from '../../../../lib/server/valplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'valplan_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>readValplaner(tx,ctx,await valplanRequest(request,parseValplanScope)));}
