import {protectedRoute} from '../../../../../lib/server/authz.ts';
import {Deny} from '../../../../../lib/server/db.ts';
import {parseGrimClassLinkRequest} from '../../../../../lib/grim-class-timplan.ts';
import {linkGrimClass,grimClassRequest} from '../../../../../lib/server/grim-class-timplan.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'grim_class_linked',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(_ctx,tx)=>{let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return linkGrimClass(tx,grimClassRequest(parseGrimClassLinkRequest,body));});}
