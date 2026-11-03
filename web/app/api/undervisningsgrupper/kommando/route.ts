import { protectedRoute,requireSameOrigin } from '../../../../lib/server/authz.ts';
import { parseStudyGroupCommand } from '../../../../lib/study-group-contract.ts';
import { studyGroupRequest,commandStudyGroup } from '../../../../lib/server/study-groups.ts';
export async function POST(request:Request):Promise<Response>{return protectedRoute(request,'study_group_command',{mutating:true,mfa:true,audit:'required',functions:['rektor','administrator']},async(ctx,tx)=>{requireSameOrigin(request);return commandStudyGroup(tx,ctx,await studyGroupRequest(request,parseStudyGroupCommand));});}
