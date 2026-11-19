import { nationellaProvSparaRoute } from '../../../../../lib/server/nationella-prov.ts';

export function POST(request: Request): Promise<Response> {
  return nationellaProvSparaRoute(request);
}
