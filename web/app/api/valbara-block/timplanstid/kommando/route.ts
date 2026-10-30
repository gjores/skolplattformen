import { protectedRoute,requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseElectiveTimeCommand } from '../../../../../lib/elective-timplan-time.ts';
import { electiveTimeRequest,commandElectiveTimplanTime } from '../../../../../lib/server/elective-timplan-time.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return commandElectiveTimplanTime(tx,ctx,await electiveTimeRequest(request,parseElectiveTimeCommand));});}
