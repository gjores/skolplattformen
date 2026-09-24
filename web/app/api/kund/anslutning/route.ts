import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { mandateOperation } from '../../../../lib/server/mandate-route.ts';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
async function handle(
  request: Request,
  operation: 'read' | 'update' | 'test',
): Promise<Response> {
  return protectedRoute(
    request,
    `connection_${operation}`,
    {
      mutating: operation !== 'read',
      mfa: operation !== 'read',
      functions: ['it'],
    },
    async (_ctx, tx) => {
      const body = (
        operation === 'read'
          ? { unitId: new URL(request.url).searchParams.get('unitId') }
          : await request.json().catch(() => null)
      ) as {
        unitId?: unknown;
        action?: unknown;
        enabled?: unknown;
        expectedVersion?: unknown;
      } | null;
      if (!body || typeof body.unitId !== 'string' || !UUID.test(body.unitId))
        throw new Deny('bad_request', 400);
      const keys =
        operation === 'update'
          ? ['unitId', 'enabled', 'expectedVersion']
          : operation === 'test'
            ? ['unitId', 'action']
            : ['unitId'];
      if (Object.keys(body).some((k) => !keys.includes(k)))
        throw new Deny('bad_request', 400);
      if (operation === 'test' && body.action !== 'test')
        throw new Deny('bad_request', 400);
      if (
        operation === 'update' &&
        (typeof body.enabled !== 'boolean' ||
          typeof body.expectedVersion !== 'number' ||
          !Number.isInteger(body.expectedVersion) ||
          body.expectedVersion < 0)
      )
        throw new Deny('bad_request', 400);
      const unitId = body.unitId;
      const enabled = operation === 'update' ? (body.enabled as boolean) : null;
      const version =
        operation === 'update' ? (body.expectedVersion as number) : null;
      const rows = await mandateOperation(
        () =>
          tx<
            { result: unknown }[]
          >`select public.phase3_connection(${unitId},${operation},${enabled},${version}) as result`,
      );
      return {
        body: rows[0].result,
        event:
          operation === 'read'
            ? null
            : {
                action: `connection_${operation}`,
                objectType: 'school_unit',
                objectId: body.unitId,
                details: {},
              },
      };
    },
  );
}
export const GET = (request: Request) => handle(request, 'read');
export const PATCH = (request: Request) => handle(request, 'update');
export const POST = (request: Request) => handle(request, 'test');
