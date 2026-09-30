import generatedCatalog from '../programplan-catalog.generated.json' with { type: 'json' };
import { blockedProgramplanBasis, ProgramplanContractError, resolveProgramplanBasis, verifyProgramplanCatalog,
  type ProgramplanBasisResolution, type VerifiedProgramplanCatalog } from '../programplan-catalog.ts';

/** Only catalog integrity is established. This creates no actor or mandate. */
export async function createVerifiedProgramplanCatalog(value: unknown): Promise<VerifiedProgramplanCatalog> {
  return verifyProgramplanCatalog(value);
}
let approvedCatalog: Promise<VerifiedProgramplanCatalog> | null = null;
function currentCatalog(): Promise<VerifiedProgramplanCatalog> {
  // Cache the immutable verified source only. No session/context/user cache.
  approvedCatalog ??= createVerifiedProgramplanCatalog(generatedCatalog);
  return approvedCatalog;
}
/** Internal source validation; never permission to write or decide a plan. */
export async function validateProgramplanCatalogBasis(value: unknown): Promise<ProgramplanBasisResolution> {
  try { return resolveProgramplanBasis(await currentCatalog(),value); }
  catch (error) {
    return blockedProgramplanBasis(error instanceof ProgramplanContractError ? error.code : 'catalog_unavailable');
  }
}
