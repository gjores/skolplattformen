import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseClassCohortCreateRequest } from '../../../../../lib/class-cohort.ts';
import { createClassCohort, classCohortRequest } from '../../../../../lib/server/class-cohort.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'class_cohort_created', {
    mutating: true, mfa: true, audit: 'required', functions: ['rektor', 'administrator'],
  }, async (_ctx, tx) => {
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    return createClassCohort(tx, classCohortRequest(parseClassCohortCreateRequest, body));
  });
}
