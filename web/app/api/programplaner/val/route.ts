import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { assertSameOrigin } from '../../../../lib/server/http.ts';
import { programplanRequest } from '../../../../lib/server/programplan-planning.ts';
import { readProgramplanSelection } from '../../../../lib/server/programplan-education.ts';
import { parseProgramplanSelectionRequest } from '../../../../lib/programplan-education-contract.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'programplan_selection_read',{mutating:false,audit:'required',functions:['huvudman','rektor','administrator']},async(_ctx,tx)=>{
 if(!assertSameOrigin(request))throw new Deny('csrf',403);let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return readProgramplanSelection(tx,programplanRequest(parseProgramplanSelectionRequest,body));});}
