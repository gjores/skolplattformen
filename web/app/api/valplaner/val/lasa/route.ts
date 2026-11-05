import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { parseValplanChoiceScope } from '../../../../../lib/valplan-choice-contract.ts';
import { valplanChoiceRequest,readValplanChoices } from '../../../../../lib/server/valplan-choice.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'valplan_choice_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>readValplanChoices(tx,ctx,await valplanChoiceRequest(request,parseValplanChoiceScope)));}
