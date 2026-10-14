import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { parseSchoolRegistryLookup } from '../../../../lib/school-registry.ts';
import { lookupSchoolRegistry, schoolRegistryRequest } from '../../../../lib/server/school-registry.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request,'school_registry_lookup_read',{mutating:true,audit:'required',functions:['huvudman']},async (_ctx,tx) => {
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return lookupSchoolRegistry(tx,schoolRegistryRequest(parseSchoolRegistryLookup,body));
  });
}
