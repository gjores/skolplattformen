import {protectedRoute} from '../../../../../lib/server/authz.ts';
import {Deny} from '../../../../../lib/server/db.ts';
import {parseGrimClassCreateRequest} from '../../../../../lib/grim-class-timplan.ts';
import {createGrimClass,grimClassRequest} from '../../../../../lib/server/grim-class-timplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'grim_class_created',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(_ctx,tx)=>{let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return createGrimClass(tx,grimClassRequest(parseGrimClassCreateRequest,body));});}
