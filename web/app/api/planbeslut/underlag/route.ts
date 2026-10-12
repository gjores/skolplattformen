import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parsePlanDecisionRead } from '../../../../lib/plan-decision.ts';
import { decisionRequest, readPlanDecision } from '../../../../lib/server/plan-decision.ts';
export async function POST(request:Request):Promise<Response> {
  return protectedRoute(request,'plan_decision_basis_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{
    let body:unknown;try {body=await request.json();} catch {throw new Deny('bad_request',400);}
    return readPlanDecision(tx,decisionRequest(parsePlanDecisionRead,body));
  });
}
