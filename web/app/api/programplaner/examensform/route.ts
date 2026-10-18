import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parseProgramplanExaminationWrite, writeProgramplanExamination } from '../../../../lib/server/programplan-examination.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request,'programplan_examination_changed',{mutating:true,mfa:true,audit:'required',functions:['huvudman','rektor']},async (_ctx,tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return writeProgramplanExamination(tx,parseProgramplanExaminationWrite(body));
  });
}
