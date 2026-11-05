import { protectedRoute,requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseValplanChoiceCommand } from '../../../../../lib/valplan-choice-contract.ts';
import { valplanChoiceRequest,commandValplanChoice } from '../../../../../lib/server/valplan-choice.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'valplan_choice_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return commandValplanChoice(tx,ctx,await valplanChoiceRequest(request,parseValplanChoiceCommand));});}
