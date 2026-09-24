import { mandateOperation } from '../../../../lib/server/mandate-route.ts';
import { parseMandatePayload } from '../../../../lib/server/mandates.ts';
import {
  newInvitationToken,
  parseGrants,
  tokenHashHex,
  ttlToExpiry,
} from '../../../../lib/invitation-rules.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';

const MAX_PERSON_NAME = 200;
const MAX_SUBJECT = 255;

type InvitationBody = {
  personName?: unknown;
  expectedIssuer?: unknown;
  expectedSubject?: unknown;
  expectedEmail?: unknown;
  grants?: unknown;
  mandates?: unknown;
  ttl?: unknown;
};

function bodyValues(body: InvitationBody | null) {
  if (
    !body ||
    typeof body.personName !== 'string' ||
    body.personName.trim().length === 0 ||
    body.personName.trim().length > MAX_PERSON_NAME ||
    typeof body.expectedIssuer !== 'string' ||
    typeof body.expectedSubject !== 'string' ||
    body.expectedSubject.length === 0 ||
    body.expectedSubject.length > MAX_SUBJECT ||
    (body.grants === undefined) === (body.mandates === undefined) ||
    (body.expectedEmail !== undefined &&
      typeof body.expectedEmail !== 'string') ||
    (body.ttl !== undefined && typeof body.ttl !== 'string')
  ) {
    throw new Deny('bad_request', 400);
  }
  try {
    const issuer = new URL(body.expectedIssuer);
    if (issuer.protocol !== 'http:' && issuer.protocol !== 'https:')
      throw new Error('protocol');
    let mandates: Record<string, unknown>[];
    if (body.grants !== undefined) {
      if (
        !Array.isArray(body.grants) ||
        !body.grants.every((v) => typeof v === 'string')
      )
        throw new Error('grants');
      mandates = parseGrants(body.grants.join(',')).map((g) => ({
        function: g.function,
        scopeKind: 'school',
        unitIds: [],
      }));
    } else {
      if (
        !Array.isArray(body.mandates) ||
        body.mandates.length < 1 ||
        body.mandates.length > 10
      )
        throw new Error('mandates');
      mandates = body.mandates.map((value) => {
        if (!value || typeof value !== 'object' || 'membershipId' in value)
          throw new Error('recipient');
        const { membershipId: _unused, ...parsed } = parseMandatePayload({
          ...value,
          membershipId: '33000000-0000-4000-8000-000000000001',
        });
        return parsed;
      });
    }
    const expiresAt = ttlToExpiry(body.ttl ?? '72h', new Date());
    return {
      personName: body.personName.trim(),
      expectedIssuer: issuer.toString().replace(/\/$/u, ''),
      expectedSubject: body.expectedSubject,
      expectedEmail: body.expectedEmail?.trim() || null,
      mandates,
      expiresAt,
    };
  } catch {
    throw new Deny('bad_request', 400);
  }
}

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'invitation_issue',
    {
      mutating: true,
      mfa: true,
      functions: ['kundadmin', 'huvudman', 'rektor', 'elevhalsoansvarig'],
    },
    async (_ctx, tx) => {
      const values = bodyValues(
        (await request.json().catch(() => null)) as InvitationBody | null,
      );
      const token = newInvitationToken(
        crypto.getRandomValues(new Uint8Array(32)),
      );
      const hash = await tokenHashHex(token);
      const payload = {
        ...values,
        expiresAt: values.expiresAt.toISOString(),
        tokenHashHex: hash,
      };
      const rows = await mandateOperation(
        () =>
          tx<
            { id: string }[]
          >`select public.phase3_issue_invitation(${JSON.stringify(payload)}::jsonb) as id`,
      );
      const invitationId = rows[0].id;
      return {
        status: 201,
        body: {
          invitationId,
          link: `${new URL(request.url).origin}/inbjudan#${token}`,
          expiresAt: values.expiresAt.toISOString(),
        },
        event: {
          action: 'invitation_issued',
          objectType: 'invitation',
          objectId: invitationId,
          details: {
            grants: values.mandates.map((grant) => grant.function),
            principalNamed: true,
          },
        },
      };
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'invitation_list',
    { mutating: false, functions: ['kundadmin'] },
    async (_ctx, tx) => {
      const rows = await tx<
        {
          id: string;
          invited_person_name: string;
          expected_issuer: string;
          grants: unknown;
          expires_at: Date;
          used_at: Date | null;
          issued_by: string;
        }[]
      >`select id, invited_person_name, expected_issuer, grants, expires_at, used_at, issued_by
        from public.invitations
        where customer_id = current_customer_id()
        order by created_at desc, id`;
      return {
        body: {
          invitations: rows.map((row) => ({
            id: row.id,
            personName: row.invited_person_name,
            expectedIssuer: row.expected_issuer,
            grants: row.grants,
            expiresAt: row.expires_at,
            usedAt: row.used_at,
            issuedBy: row.issued_by,
          })),
        },
        event: null,
      };
    },
  );
}
