import {protectedRoute} from '../../../../lib/server/authz.ts';
import {Deny} from '../../../../lib/server/db.ts';
import {parseClassPlanLinkRequest} from '../../../../lib/class-timplan.ts';
import {linkClassPlan,classPlanRequest} from '../../../../lib/server/class-timplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'class_plan_linked',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(_ctx,tx)=>{let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return linkClassPlan(tx,classPlanRequest(parseClassPlanLinkRequest,body));});}
