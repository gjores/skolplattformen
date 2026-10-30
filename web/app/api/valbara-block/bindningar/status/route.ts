import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { tjanstRequest } from '../../../../../lib/server/tjanst.ts';
import { parseBindingCommand } from '../../../../../lib/elective-self-contract.ts';
import { statusElectiveBinding } from '../../../../../lib/server/elective-bindings.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_binding_status',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>statusElectiveBinding(tx,await tjanstRequest(request,parseBindingCommand),ctx));}
