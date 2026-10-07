import {
  parsePlanningList,
  parsePlanningOverview,
  parsePlanningSelection,
  parsePlanningSetup,
  type PlanningSelection,
  type PlanningSetup,
} from '../planning-year-contract.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { logEvent } from './events.ts';
import { mandateOperation } from './mandate-route.ts';

type Action = 'planning_year_selection_read' | 'planning_year_list_read' | 'planning_year_overview_read';
const event = (action: Action) => ({ action, objectType: 'planning_year_collection', objectId: null });

/** Keep this read family's availability status local to its new routes. */
export async function planningProtectedRoute(
  request: Request,
  action: Action,
  handler: Parameters<typeof protectedRoute>[3],
): Promise<Response> {
  const response = await protectedRoute(request, action, {
    mutating: false,
    audit: 'required',
    functions: ['huvudman', 'rektor', 'administrator'],
  }, handler);
  if (response.status === 500) {
    const failure: unknown = await response.clone().json();
    if (failure && typeof failure === 'object' && 'code' in failure && failure.code === 'audit_unavailable') {
      return new Response(response.body, { status: 503, headers: response.headers });
    }
  }
  return response;
}

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  return mandateOperation(async () => {
    try { return await fn(); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === '55000') throw new AuditUnavailable();
        if (error.code === '40001') throw new Deny('conflict', 409, { reloadSelection: true });
      }
      throw error;
    }
  });
}

function one(rows: { result: unknown }[]): unknown {
  if (rows.length !== 1) throw new AuditUnavailable();
  return rows[0].result;
}

export function planningRequest(value: unknown, overview = false): PlanningSelection {
  try {
    const input = parsePlanningSelection(value);
    if (overview && input.page !== 1) throw new TypeError();
    return input;
  } catch { throw new Deny('bad_request', 400); }
}

export async function planningJsonRequest(request: Request, overview = false): Promise<PlanningSelection> {
  requireSameOrigin(request);
  if (new URL(request.url).search || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers.get('Content-Type') ?? '')) {
    throw new Deny('bad_request', 400);
  }
  let body: unknown;
  try { body = await request.json(); } catch { throw new Deny('bad_request', 400); }
  return planningRequest(body, overview);
}

export async function readPlanningSetup(tx: Tx, ctx: Pick<Context, 'customerId'>) {
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_planning_year_selection() as result`));
  let body: PlanningSetup;
  try {
    body = parsePlanningSetup(raw);
    if (body.customerId !== ctx.customerId) throw new TypeError();
  } catch { throw new AuditUnavailable(); }
  return { body, event: event('planning_year_selection_read') };
}

async function readScope(tx: Tx, ctx: Context): Promise<PlanningSetup> {
  // The SQL selection is the real live school scope, never client metadata.
  // Both reads and both Worker events share the protected route transaction.
  const setup = await readPlanningSetup(tx, ctx);
  try { await logEvent(tx, ctx, { ...setup.event, outcome: 'ok' }); }
  catch { throw new AuditUnavailable(); }
  return setup.body;
}

export async function readPlanningList(tx: Tx, ctx: Context, input: PlanningSelection) {
  const setup = await readScope(tx, ctx);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_planning_year_list(${tx.json(input)}) as result`));
  try {
    // The foundation authenticates frozen catalog inventory before projecting.
    // Recheck source identity, canonical rows, year slice and scope at the API boundary.
    const body = parsePlanningList(raw, input, setup);
    return { body, event: event('planning_year_list_read') };
  } catch { throw new AuditUnavailable(); }
}

export async function readPlanningOverview(tx: Tx, ctx: Context, input: PlanningSelection) {
  const setup = await readScope(tx, ctx);
  const raw = one(await operation(() => tx<{ result: unknown }[]>`select public.phase5_planning_year_overview(${tx.json(input)}) as result`));
  try {
    const body = parsePlanningOverview(raw, input, setup);
    return { body, event: event('planning_year_overview_read') };
  } catch { throw new AuditUnavailable(); }
}
