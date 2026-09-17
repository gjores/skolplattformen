import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'assignment_end',
    { mutating: true, mfa: true, functions: ['kundadmin'] },
    async (ctx, tx) => {
      const body = (await request.json().catch(() => null)) as { assignmentId?: unknown } | null;
      if (!body || typeof body.assignmentId !== 'string' || !UUID.test(body.assignmentId)) {
        throw new Deny('bad_request', 400);
      }
      const rows = await tx<{ id: string; membership_id: string; ended_at: Date }[]>`update public.access_assignments
        set ended_at = now(), ended_by = ${ctx.membershipId}
        where id = ${body.assignmentId}
          and customer_id = current_customer_id()
          and ended_at is null
        returning id, membership_id, ended_at`;
      const ended = rows[0];
      if (!ended) {
        const existing = await tx<{ ended_at: Date | null }[]>`select ended_at
          from public.access_assignments
          where id = ${body.assignmentId} and customer_id = current_customer_id()`;
        if (existing[0]?.ended_at) throw new Deny('conflict', 409);
        throw new Deny('not_found', 404);
      }
      return {
        body: {
          assignmentId: ended.id,
          endedAt: ended.ended_at,
          selfEnded: ended.id === ctx.assignmentId,
        },
        event: {
          action: 'assignment_ended',
          objectType: 'access_assignment',
          objectId: ended.id,
          details: { assignmentId: ended.id },
        },
      };
    },
  );
}
