import { protectedRoute } from '../../../../lib/server/authz.ts';
import { lasarDecision, lasarRequest, parseLasarDecisionInput } from '../../../../lib/server/lasar.ts';

/** Beslut om kalendern (skicka, fastställa m.fl.) kräver färsk engångskod (T-05.1.1-17); SQL prövar vem som får besluta. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'lasar_decision', { mutating: true, mfa: true, audit: 'required', functions: ['huvudman', 'rektor', 'administrator'] }, async (ctx, tx) => {
    return lasarDecision(tx, await lasarRequest(request, parseLasarDecisionInput), ctx);
  });
}
