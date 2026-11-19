import { nationellaProvLasRoute } from '../../../../../lib/server/nationella-prov.ts';

export function POST(request: Request): Promise<Response> {
  return nationellaProvLasRoute(request);
}
