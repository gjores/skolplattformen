import { protectedRoute } from '../../../../lib/server/authz.ts';
import { lasarCommand, lasarRequest, parseLasarCommandInput } from '../../../../lib/server/lasar.ts';

/** Utkastarbete utan engångskod. Parsern tar bara kontraktets ops; beslut går via /api/lasar/beslut. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_command', { mutating: true, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    return lasarCommand(tx, await lasarRequest(request, parseLasarCommandInput), ctx);
  });
}
