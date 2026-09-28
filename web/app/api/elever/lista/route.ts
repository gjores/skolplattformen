import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { listPupils, parsePupilListRequest } from '../../../../lib/server/pupil-register.ts';
export async function POST(request:Request):Promise<Response>{
 return protectedRoute(request,'pupil_list_read',{mutating:false,audit:'required',functions:['rektor','administrator','larare','elevhalsa','support']},async(ctx,tx)=>{
  requireSameOrigin(request);let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}
  return listPupils(tx,ctx,parsePupilListRequest(body,ctx.accessFunction??null));
 });
}
