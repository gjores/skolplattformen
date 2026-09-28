import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { readPupilSelection } from '../../../../lib/server/pupil-register.ts';
export async function GET(request: Request): Promise<Response> {
  return protectedRoute(request, 'pupil_selection_read', { mutating: false, audit: 'required', functions: ['rektor','administrator','larare','elevhalsa','support'] }, async (_ctx, tx) => {
    if (new URL(request.url).search) throw new Deny('bad_request', 400);
    return { body: await readPupilSelection(tx), event: { action: 'pupil_selection_read', objectType: 'pupil_register' } };
  });
}
