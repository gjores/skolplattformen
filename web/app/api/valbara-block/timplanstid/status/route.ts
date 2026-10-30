import { protectedRoute,requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseElectiveTimeRef } from '../../../../../lib/elective-timplan-time.ts';
import { electiveTimeRequest,statusElectiveTimplanTime } from '../../../../../lib/server/elective-timplan-time.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_status',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return statusElectiveTimplanTime(tx,ctx,await electiveTimeRequest(request,parseElectiveTimeRef));});}
