import { protectedRoute } from '../../../../lib/server/authz.ts';
import { readPlanDecisionInbox } from '../../../../lib/server/plan-decision.ts';
export async function GET(request:Request):Promise<Response> {
  return protectedRoute(request,'plan_decision_inbox_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>readPlanDecisionInbox(tx));
}
