import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { tjanstRequest } from '../../../../../lib/server/tjanst.ts';
import { parseBindingCommand } from '../../../../../lib/elective-self-contract.ts';
import { commandElectiveBinding } from '../../../../../lib/server/elective-bindings.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_binding_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>commandElectiveBinding(tx,await tjanstRequest(request,parseBindingCommand),ctx));}
