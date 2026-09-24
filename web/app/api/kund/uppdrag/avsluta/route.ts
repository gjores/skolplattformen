import { mandateOperation } from '../../../../../lib/server/mandate-route.ts';
import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'assignment_end',
    {
      mutating: true,
      mfa: true,
      functions: ['kundadmin', 'huvudman', 'rektor', 'elevhalsoansvarig'],
    },
    async (ctx, tx) => {
      const body = (await request.json().catch(() => null)) as {
        assignmentId?: unknown;
      } | null;
      if (
        !body ||
        typeof body.assignmentId !== 'string' ||
        !UUID.test(body.assignmentId)
      ) {
        throw new Deny('bad_request', 400);
      }
      await mandateOperation(
        () => tx`select public.phase3_revoke_mandate(${body.assignmentId})`,
      );
      const rows = await tx<{ id: string; ended_at: Date }[]>`
        select id, ended_at from public.access_assignments
        where id=${body.assignmentId}`;
      const ended = rows[0];
      if (!ended) throw new Deny('not_found', 404);
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
