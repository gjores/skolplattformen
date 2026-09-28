import type { HistoryRequest } from '../../../../lib/pupil-register-model.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parsePupilCardQuery, readPupilHistory } from '../../../../lib/server/pupil-register.ts';
export async function GET(request:Request):Promise<Response>{
 return protectedRoute(request,'pupil_history_read',{mutating:false,audit:'required',functions:['administrator']},async(ctx,tx)=>readPupilHistory(tx,ctx,parsePupilCardQuery(new URL(request.url).searchParams,true) as HistoryRequest));
}
