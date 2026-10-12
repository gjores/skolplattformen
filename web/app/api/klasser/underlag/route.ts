import {protectedRoute} from '../../../../lib/server/authz.ts';
import {Deny} from '../../../../lib/server/db.ts';
import {parseClassPlanUnderlagRequest} from '../../../../lib/class-timplan.ts';
import {readClassPlan,classPlanRequest} from '../../../../lib/server/class-timplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'class_plan_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return readClassPlan(tx,classPlanRequest(parseClassPlanUnderlagRequest,body));});}
