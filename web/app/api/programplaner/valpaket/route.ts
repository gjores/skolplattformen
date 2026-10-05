import {parseProgramplanValpaketWrite} from '../../../../lib/programplan-packages.ts';
import {protectedRoute} from '../../../../lib/server/authz.ts';
import {Deny} from '../../../../lib/server/db.ts';
import {programplanRequest} from '../../../../lib/server/programplan-planning.ts';
import {saveProgramplanValpaket} from '../../../../lib/server/programplan-packages.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'programplan_package_saved',{mutating:true,mfa:true,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return saveProgramplanValpaket(tx,programplanRequest(parseProgramplanValpaketWrite,body));});}
