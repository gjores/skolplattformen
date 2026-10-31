import{protectedRoute}from'../../../../../lib/server/authz.ts';
import{electiveFail,parseElectiveCommandRef}from'../../../../../lib/elective-block-contract.ts';
import{electiveRequest,statusElectiveBlock}from'../../../../../lib/server/elective-block.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'elective_status',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>statusElectiveBlock(tx,ctx,await electiveRequest(request,v=>{const c=parseElectiveCommandRef(v);if(c.action!=='save_placement'&&c.action!=='end_placement')electiveFail();return c;})));}
