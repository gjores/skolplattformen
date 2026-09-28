import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parsePupilCardQuery, readPupil } from '../../../../lib/server/pupil-register.ts';
export async function GET(request:Request):Promise<Response>{
 return protectedRoute(request,'pupil_read',{mutating:false,audit:'required',functions:['rektor','administrator','larare','elevhalsa','support']},async(ctx,tx)=>readPupil(tx,ctx,parsePupilCardQuery(new URL(request.url).searchParams)));
}
