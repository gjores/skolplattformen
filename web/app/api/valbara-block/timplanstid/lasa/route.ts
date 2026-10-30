import { protectedRoute,requireSameOrigin } from '../../../../../lib/server/authz.ts';
import { parseElectiveTimeScope } from '../../../../../lib/elective-timplan-time.ts';
import { electiveTimeRequest,readElectiveTimplanTime } from '../../../../../lib/server/elective-timplan-time.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return readElectiveTimplanTime(tx,ctx,await electiveTimeRequest(request,parseElectiveTimeScope));});}
