import { Deny } from './db.ts';
import { serverEnv } from './env.ts';
import { isLocalMandateTarget, mandateSqlFailure } from './mandates.ts';

export function requireSyntheticMandates(): void {
  const env = serverEnv();
  if (!isLocalMandateTarget(env.DATABASE_URL, env.SUPABASE_URL))
    throw new Deny('forbidden', 403);
}
export async function mandateOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  requireSyntheticMandates();
  try {
    return await operation();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '42501'
      && 'hint' in error && error.hint === 'programplan_submitted') throw new Deny('programplan_submitted', 409);
    if (error && typeof error === 'object' && 'code' in error && error.code === '40001' && 'hint' in error) {
      if (error.hint === 'class_name_year_conflict' || error.hint === 'class_cohort_start_locked')
        throw new Deny(error.hint, 409);
      if (error.hint === 'class_cohort_source_invalid') throw new Deny('class_plan_not_ready', 409);
    }
    const mapped = mandateSqlFailure(error);
    // SQL-undantag är enbart minimerade kod/status. Fältkonflikter hör till
    // ett projicerat och auditerat resultat i registertransaktionen (04-05/04-10).
    if (mapped) throw new Deny(mapped.code, mapped.status);
    throw error;
  }
}
