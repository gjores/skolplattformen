import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const BUSINESS_ERRORS = new Set([
  'Välj rektor eller ange ett namn.',
  'Välj en rektor hos huvudmannen.',
  'Rektorns namn är för långt.',
  'Skolenheten finns inte.',
]);

function errorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;
  const message = String((error as { message?: unknown }).message);
  return BUSINESS_ERRORS.has(message) ? message : null;
}

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'principal_appointed',
    { mutating: true, mfa: true, functions: ['kundadmin'] }, async (_ctx, tx) => {
      const body = await request.json().catch(() => null) as {
        organizerId?: unknown; unitId?: unknown; principalAssignmentId?: unknown; principalName?: unknown;
      } | null;
      if (typeof body?.organizerId !== 'string' || !UUID.test(body.organizerId) ||
          typeof body.unitId !== 'string' || !UUID.test(body.unitId)) throw new Deny('not_found', 404);
      const principalId = body.principalAssignmentId ?? null;
      const principalName = body.principalName ?? null;
      if (principalId !== null && (typeof principalId !== 'string' || !UUID.test(principalId))) throw new Deny('not_found', 404);
      if (principalName !== null && typeof principalName !== 'string') throw new Deny('bad_request', 400);
      if (typeof principalName === 'string' && principalName.trim().length > 120) {
        throw new Deny('bad_request', 400, { reason: 'Rektorns namn är för långt.' });
      }
      if (!principalId && (typeof principalName !== 'string' || !principalName.trim())) {
        throw new Deny('bad_request', 400, { reason: 'Välj rektor eller ange ett namn.' });
      }
      const organizers = await tx`select id from public.organizers
        where id = ${body.organizerId} and customer_id = current_customer_id()`;
      if (!organizers.length) throw new Deny('not_found', 404);
      await tx`select set_config('app.organizer_id', ${body.organizerId}, true),
        set_config('app.app_role', 'huvudman', true)`;
      const units = await tx`select id from public.school_units
        where id = ${body.unitId} and organizer_id = ${body.organizerId}`;
      if (!units.length) throw new Deny('not_found', 404);
      if (principalId) {
        const principals = await tx`select id from public.assignments
          where id = ${principalId} and organizer_id = ${body.organizerId} and role = 'rektor' for update`;
        if (!principals.length) throw new Deny('not_found', 404);
      }
      let assignmentId: string;
      try {
        const rows = await tx<{ id: string }[]>`select public.appoint_school_principal(
          ${body.unitId}, ${principalId}, ${principalName?.trim() ?? null}) as id`;
        assignmentId = rows[0].id;
      } catch (error) {
        const reason = errorMessage(error);
        if (reason) throw new Deny('bad_request', 400, { reason });
        throw error;
      }
      return {
        body: { assignmentId },
        event: { action: 'principal_appointed', objectType: 'school_unit', objectId: body.unitId,
          details: { assignmentId } },
      };
    });
}
