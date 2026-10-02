import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { programplanRequest } from '../../../../../lib/server/programplan-planning.ts';
import { createProgramplanEducation } from '../../../../../lib/server/programplan-education.ts';
import { parseProgramplanEducationCreate } from '../../../../../lib/programplan-education-contract.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'programplan_education_created',{mutating:true,mfa:true,audit:'required',functions:['huvudman']},async(_ctx,tx)=>{
 let body:unknown;try{body=await request.json();}catch{throw new Deny('bad_request',400);}return createProgramplanEducation(tx,programplanRequest(parseProgramplanEducationCreate,body));});}
