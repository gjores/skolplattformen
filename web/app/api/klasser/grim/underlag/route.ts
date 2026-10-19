import {protectedRoute,requireSameOrigin} from '../../../../../lib/server/authz.ts';
import {Deny} from '../../../../../lib/server/db.ts';
import {parseGrimClassUnderlagRequest} from '../../../../../lib/grim-class-timplan.ts';
import {readGrimClasses,grimClassRequest} from '../../../../../lib/server/grim-class-timplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'grim_class_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{requireSameOrigin(request);let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return readGrimClasses(tx,grimClassRequest(parseGrimClassUnderlagRequest,body));});}
