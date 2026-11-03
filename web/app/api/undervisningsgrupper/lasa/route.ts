import { protectedRoute } from '../../../../lib/server/authz.ts';
import { parseStudyGroupScope } from '../../../../lib/study-group-contract.ts';
import { studyGroupRequest,readStudyGroups } from '../../../../lib/server/study-groups.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'study_group_read',{mutating:false,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>readStudyGroups(tx,ctx,await studyGroupRequest(request,parseStudyGroupScope)));}
