import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parsePlanDecisionCommand } from '../../../../lib/plan-decision.ts';
import { commandPlanDecision, decisionRequest } from '../../../../lib/server/plan-decision.ts';
export async function POST(request:Request):Promise<Response> {
  return protectedRoute(request,'plan_decision_command',{mutating:true,mfa:true,audit:'required',functions:['huvudman','rektor','administrator']},async(ctx,tx)=>{
    let body:unknown;try {body=await request.json();} catch {throw new Deny('bad_request',400);}
    return commandPlanDecision(tx,decisionRequest(parsePlanDecisionCommand,body),ctx);
  });
}
