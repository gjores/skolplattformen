import { protectedRoute, requireMfa } from '../../../../../lib/server/authz.ts';
import { parsePersonalCommand, personalCommand, tjanstRequest } from '../../../../../lib/server/tjanst.ts';

/** D-23: huvudmannens personaländringar kräver engångskod; rektorns utkastlärare (create_draft_teacher) gör det inte. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'tjanst_personal_command', { mutating: true, audit: 'required', functions: ['huvudman', 'rektor'] }, async (ctx, tx) => {
    if (ctx.accessFunction === 'huvudman') requireMfa(ctx);
    return personalCommand(tx, await tjanstRequest(request, parsePersonalCommand), ctx);
  });
}
