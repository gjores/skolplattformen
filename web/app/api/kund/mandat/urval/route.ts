import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { mandateOperation } from '../../../../../lib/server/mandate-route.ts';

// Behörigt urval för tilldelningsformuläret. Rektorns urval innehåller syntetiska
// elevnamn inom egen skola och är därför en auditerad läsning.
export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'mandate_options',
    { mutating: false, audit: 'required', functions: ['huvudman', 'rektor', 'elevhalsoansvarig'] },
    async (_ctx, tx) => {
      const rows = await mandateOperation(
        () => tx<{ options: { pupils: unknown[] } }[]>`select public.phase3_mandate_options() as options`,
      );
      const options = rows[0].options;
      return {
        body: options,
        event: {
          action: 'mandate_options_read',
          objectType: 'access_assignment',
          details: { count: options.pupils.length },
        },
      };
    },
  );
}
