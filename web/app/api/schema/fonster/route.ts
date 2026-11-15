import { protectedRoute, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { parsePlanReadRequest, planRead, tjanstRequest } from '../../../../lib/server/tjanst.ts';

/** Varje utlyft fönster prövar eget aktuellt mandat, MFA och skolurval innan det ansluter till utkastet. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_plan_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await tjanstRequest(request, parsePlanReadRequest), result = await planRead(tx, input, ctx);
    return { body: { unitId: input.unitId, schoolYear: input.schoolYear, scopeKey: `${ctx.epoch}:${ctx.customerId}:${ctx.assignmentId}` }, event: result.event };
  });
}
