import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { tjanstRequest } from '../../../../../lib/server/tjanst.ts';
import { parseBindingScope } from '../../../../../lib/elective-self-contract.ts';
import { readElectiveBindings } from '../../../../../lib/server/elective-bindings.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_bindings_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(_ctx,tx)=>readElectiveBindings(tx,await tjanstRequest(request,parseBindingScope)));}
