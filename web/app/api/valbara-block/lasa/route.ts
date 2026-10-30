import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parseElectiveScope } from '../../../../lib/elective-block-contract.ts';
import { electiveRequest, readElectiveBlocks } from '../../../../lib/server/elective-block.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_read',{
  mutating:false,mfa:true,audit:'required',functions:['rektor','administrator'],
},async(ctx,tx)=>readElectiveBlocks(tx,ctx,await electiveRequest(request,parseElectiveScope)));}
