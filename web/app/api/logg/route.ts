import { CSV_HEADER, csvRow } from '../../../lib/audit-export.ts';
import { protectedRoute } from '../../../lib/server/authz.ts';
import { Deny } from '../../../lib/server/db.ts';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const DAY = 24 * 60 * 60 * 1000;

type EventRow = {
  id: string;
  occurred_at: Date;
  correlation_id: string;
  source: string;
  actor_issuer: string | null;
  actor_subject: string | null;
  actor_identity_id: string | null;
  session_id: string | null;
  membership_id: string | null;
  assignment_id: string | null;
  customer_id: string;
  assignment_function: string | null;
  action: string;
  object_type: string | null;
  object_id: string | null;
  outcome: string;
  details: Record<string, unknown>;
};

function parseDate(value: string | null, fallback: Date): Date {
  if (value === null) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Deny('bad_request', 400);
  }
  return parsed;
}

function queryValues(request: Request): {
  from: Date;
  to: Date;
  action: string | null;
  limit: number;
  format: 'json' | 'csv';
} {
  const url = new URL(request.url);
  const to = parseDate(url.searchParams.get('to'), new Date());
  const from = parseDate(url.searchParams.get('from'), new Date(to.getTime() - 30 * DAY));
  if (from >= to) throw new Deny('bad_request', 400);
  const rawLimit = url.searchParams.get('limit');
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Deny('bad_request', 400);
  }
  const action = url.searchParams.get('action');
  if (action !== null && (action.length === 0 || action.length > 80)) {
    throw new Deny('bad_request', 400);
  }
  const format = url.searchParams.get('format') ?? 'json';
  if (format !== 'json' && format !== 'csv') throw new Deny('bad_request', 400);
  return { from, to, action, limit, format };
}

function eventView(row: EventRow) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
    source: row.source,
    actorIssuer: row.actor_issuer,
    actorSubject: row.actor_subject,
    actorIdentityId: row.actor_identity_id,
    sessionId: row.session_id,
    membershipId: row.membership_id,
    assignmentId: row.assignment_id,
    customerId: row.customer_id,
    assignmentFunction: row.assignment_function,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    outcome: row.outcome,
    details: row.details,
  };
}

function csvResponse(rows: EventRow[], customerId: string, to: Date): Response {
  const body = [
    csvRow(CSV_HEADER),
    ...rows.map((row) =>
      csvRow([
        row.occurred_at.toISOString(),
        row.correlation_id,
        row.source,
        row.actor_issuer,
        row.actor_subject,
        row.assignment_function,
        row.action,
        row.object_type,
        row.object_id,
        row.outcome,
        JSON.stringify(row.details),
      ]),
    ),
  ].join('\r\n');
  const date = to.toISOString().slice(0, 10).replaceAll('-', '');
  return new Response(`\ufeff${body}\r\n`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sakerhetslogg-${customerId}-${date}.csv"`,
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'log_read',
    { mutating: false, functions: ['granskare'] },
    async (ctx, tx) => {
      const values = queryValues(request);
      const rows = await tx<EventRow[]>`select
          e.id::text,
          e.occurred_at,
          e.correlation_id,
          e.source,
          e.actor_issuer,
          e.actor_subject,
          e.actor_identity_id,
          e.session_id,
          e.membership_id,
          e.assignment_id,
          e.customer_id,
          coalesce(e.details->>'accessFunction', a.function::text) as assignment_function,
          e.action,
          e.object_type,
          e.object_id,
          e.outcome,
          jsonb_strip_nulls(jsonb_build_object(
            'code', e.details->'code',
            'path', e.details->'path',
            'grants', e.details->'grants',
            'reason', e.details->'reason',
            'from', e.details->'from',
            'stepUp', e.details->'stepUp',
            'emailMismatch', e.details->'emailMismatch',
            'name', e.details->'name',
            'proof', case when jsonb_typeof(e.details->'proof') = 'object' then
              jsonb_strip_nulls(jsonb_build_object(
                'policyId', e.details->'proof'->'policyId',
                'policyVersion', e.details->'proof'->'policyVersion',
                'profileId', e.details->'proof'->'profileId',
                'profileVersion', e.details->'proof'->'profileVersion',
                'issuer', e.details->'proof'->'issuer',
                'method', e.details->'proof'->'method',
                'authTime', e.details->'proof'->'authTime',
                'checkedAt', e.details->'proof'->'checkedAt',
                'result', e.details->'proof'->'result',
                'sourceCorrelationId', e.details->'proof'->'sourceCorrelationId'
              ))
            end
          )) as details
        from public.security_events e
        left join public.access_assignments a on a.id = e.assignment_id
        where e.customer_id = current_customer_id()
          and e.occurred_at >= ${values.from}
          and e.occurred_at < ${values.to}
          and (${values.action}::text is null or e.action = ${values.action})
        order by e.occurred_at desc, e.id desc
        limit ${values.limit}`;

      if (values.format === 'csv') {
        if (!ctx.customerId) throw new Deny('not_found', 404);
        return {
          response: csvResponse(rows, ctx.customerId, values.to),
          event: {
            action: 'log_exported',
            details: {
              from: values.from.toISOString(),
              to: values.to.toISOString(),
              count: rows.length,
              format: 'csv',
            },
          },
        };
      }

      // JSON-läsning loggas inte, eftersom varje uppdatering av vyn annars fyller loggen med sig själv.
      return {
        body: {
          events: rows.map(eventView),
          from: values.from.toISOString(),
          to: values.to.toISOString(),
          count: rows.length,
          truncated: rows.length === values.limit,
        },
        event: null,
      };
    },
  );
}
