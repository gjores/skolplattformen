import { sql } from '../../../../lib/server/db.ts';
import { correlationId, fail, json } from '../../../../lib/server/http.ts';

type HealthRow = { role: string; customers: string | number };

export async function GET(_request: Request): Promise<Response> {
  const corr = correlationId();
  try {
    const rows = await sql()<HealthRow[]>`select current_user as role,
      (select count(*) from public.customers) as customers`;
    return json(
      {
        ok: true,
        role: rows[0]?.role ?? null,
        customers: rows[0]?.customers ?? null,
        runtime:
          typeof navigator !== 'undefined' && navigator.userAgent?.includes('Cloudflare-Workers')
            ? 'workerd'
            : 'node',
      },
      { correlationId: corr },
    );
  } catch (error) {
    console.error('health/db', corr, error instanceof Error ? error.constructor.name : 'UnknownError');
    return fail('db_unreachable', 503, corr);
  }
}
