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
    const mapped = mandateSqlFailure(error);
    if (mapped) throw new Deny(mapped.code, mapped.status);
    throw error;
  }
}
