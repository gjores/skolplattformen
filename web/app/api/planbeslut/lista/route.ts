import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parsePlanDecisionQuery } from '../../../../lib/plan-decision.ts';
import { decisionRequest, readPlanDecisionPage } from '../../../../lib/server/plan-decision.ts';
export async function POST(request:Request):Promise<Response> {
  return protectedRoute(request,'plan_decision_inbox_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{
    requireSameOrigin(request);
    if (new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('Content-Type') ?? '')) throw new Deny('bad_request',400);
    let body:unknown;try {body=await request.json();} catch {throw new Deny('bad_request',400);}
    return readPlanDecisionPage(tx,decisionRequest(parsePlanDecisionQuery,body));
  });
}
