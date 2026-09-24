import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { mandateOperation } from '../../../../lib/server/mandate-route.ts';
import { parseMandatePayload } from '../../../../lib/server/mandates.ts';

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'mandate_granted',
    {
      mutating: true,
      mfa: true,
      functions: ['huvudman', 'rektor', 'elevhalsoansvarig'],
    },
    async (_ctx, tx) => {
      let payload;
      try {
        payload = parseMandatePayload(await request.json());
      } catch {
        throw new Deny('bad_request', 400);
      }
      const rows = await mandateOperation(
        () =>
          tx<
            { id: string }[]
          >`select public.phase3_grant_mandate(${tx.json(payload)}) as id`,
      );
      return {
        status: 201,
        body: { assignmentId: rows[0].id },
        event: {
          action: 'mandate_granted',
          objectType: 'access_assignment',
          objectId: rows[0].id,
          details: {},
        },
      };
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'mandate_list',
    { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'elevhalsoansvarig'] },
    async (_ctx, tx) => {
      const rows = await mandateOperation(
        () =>
          tx<
            { mandates: unknown }[]
          >`select public.phase3_list_mandates() as mandates`,
      );
      return { body: { mandates: rows[0].mandates }, event: { action: 'mandate_listed', objectType: 'access_assignment', details: {} } };
    },
  );
}
