import { protectedRoute, requireMfa, requireSameOrigin } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { exportPupils, parsePupilExportPost, pupilExportFile } from '../../../../lib/server/pupil-register.ts';

/** Uttryckligt elevurval. Förhandsvisning och nedladdning prövas var för sig i SQL;
 * nedladdning kräver MFA och räknar om urvalet. CSV-filen byggs i minnet och
 * lämnas först när protectedRoute har skrivit huvudhändelsen och committat –
 * ingen streaming och ingen tempfil med elevdata. */
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'pupil_export', { mutating: false, audit: 'required', functions: ['administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    let body: unknown;
    try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
    const { mode, export: input } = parsePupilExportPost(body);
    if (mode === 'download') requireMfa(ctx);
    const result = await exportPupils(tx, ctx, input, mode === 'preview');
    if (mode === 'preview') return result;
    const file = pupilExportFile(input, result.body);
    return {
      event: result.event,
      response: new Response(file.csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'X-Content-Type-Options': 'nosniff',
        },
      }),
    };
  });
}
