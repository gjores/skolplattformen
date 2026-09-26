import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { probeCsv, readProbePupils } from '../../../../lib/server/pupil-probe.ts';

// Buffrad syntetisk export av samma kontrollerade urval. Endast skoladministratör
// enligt provmatrisen; SQL nekar övriga även om funktionslistan skulle ändras.
export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'pupil_probe_export',
    { mutating: false, audit: 'required', functions: ['administrator'] },
    async (_ctx, tx) => {
      if (new URL(request.url).search !== '') throw new Deny('bad_request', 400);
      const pupils = await readProbePupils(tx, { form: 'list' }, true);
      return {
        response: new Response(probeCsv(pupils), {
          status: 200,
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="syntetiskt-elevprov.csv"',
          },
        }),
        event: {
          action: 'pupil_probe_exported',
          objectType: 'phase3_probe_pupil',
          details: { count: pupils.length, format: 'csv', readForm: 'export' },
        },
      };
    },
  );
}
