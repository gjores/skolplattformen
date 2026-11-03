import { protectedRoute,requireSameOrigin } from '../../../../lib/server/authz.ts';
import { parseValplanCommand } from '../../../../lib/valplan-contract.ts';
import { valplanRequest,commandValplan } from '../../../../lib/server/valplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'valplan_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return commandValplan(tx,ctx,await valplanRequest(request,parseValplanCommand));});}
