import { protectedRoute } from '../../../lib/server/authz.ts';
import { readSchoolRegistry } from '../../../lib/server/school-registry.ts';
export async function GET(request: Request): Promise<Response> {
  return protectedRoute(request,'school_registry_list_read',{mutating:false,audit:'required',functions:['huvudman']},async (_ctx,tx) => readSchoolRegistry(tx));
}
