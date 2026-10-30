import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parseElectiveCommand } from '../../../../lib/elective-block-contract.ts';
import { electiveRequest, commandElectiveBlock } from '../../../../lib/server/elective-block.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_command',{
  mutating:true,mfa:true,audit:'required',functions:['rektor','administrator'],
},async(ctx,tx)=>commandElectiveBlock(tx,ctx,await electiveRequest(request,parseElectiveCommand)));}
