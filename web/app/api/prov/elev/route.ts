import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { readProbePupils, requireProbeQuery, readProbeScope } from '../../../../lib/server/pupil-probe.ts';

const ACTIONS = { list: 'pupil_probe_listed', pupil: 'pupil_probe_read', case: 'pupil_probe_case_read' } as const;

// Syntetiskt elevprov: lista/sökning inom scope, direkt elev-ID och exakt ärende.
// Svaret lämnas först när säkerhetshändelsen skrivits i samma transaktion.
export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'pupil_probe_read',
    {
      mutating: false,
      audit: 'required',
      functions: ['rektor', 'larare', 'administrator', 'elevhalsa', 'support'],
    },
    async (_ctx, tx) => {
      const read = requireProbeQuery(request.url);
      const scope = await readProbeScope(tx);
      const pupils = await readProbePupils(tx, read);
      // Främmande och obefintliga ID ger samma svar; inget antal utanför scope.
      if (read.form !== 'list' && pupils.length === 0) throw new Deny('not_found', 404);
      return {
        body: { scope, pupils },
        event: {
          action: ACTIONS[read.form],
          objectType: read.form === 'case' ? 'phase3_probe_case' : 'phase3_probe_pupil',
          objectId: read.form === 'case' ? read.caseId : read.form === 'pupil' ? read.pupilId : null,
          details: { count: pupils.length, readForm: read.form },
        },
      };
    },
  );
}
