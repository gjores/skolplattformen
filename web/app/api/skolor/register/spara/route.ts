import { protectedRoute } from '../../../../../lib/server/authz.ts';
import { Deny } from '../../../../../lib/server/db.ts';
import { parseSchoolRegistryCommand } from '../../../../../lib/school-registry.ts';
import { saveSchoolRegistry, schoolRegistryRequest } from '../../../../../lib/server/school-registry.ts';
export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request,'school_registry_saved',{mutating:true,mfa:true,audit:'required',functions:['huvudman']},async (_ctx,tx) => {
    let body: unknown; try { body = await request.json(); } catch { throw new Deny('bad_request',400); }
    return saveSchoolRegistry(tx,schoolRegistryRequest(parseSchoolRegistryCommand,body),false);
  });
}
