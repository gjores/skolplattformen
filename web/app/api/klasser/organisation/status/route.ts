import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseClassCohortStatusRequest } from '../../../../../lib/class-cohort.ts';
import { readClassCohortStatus, classCohortRequest } from '../../../../../lib/server/class-cohort.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'class_cohort_status_read', {
    mutating: false, audit: 'required', functions: ['rektor', 'administrator'],
  }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return readClassCohortStatus(tx, classCohortRequest(parseClassCohortStatusRequest, body));
  });
}
