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
    !Array.isArray(body.grants) ||
    !body.grants.every((value) => typeof value === 'string') ||
    (body.expectedEmail !== undefined && typeof body.expectedEmail !== 'string') ||
    (body.ttl !== undefined && typeof body.ttl !== 'string')
  ) {
    throw new Deny('bad_request', 400);
  }
  try {
    const issuer = new URL(body.expectedIssuer);
    if (issuer.protocol !== 'http:' && issuer.protocol !== 'https:') throw new Error('protocol');
    const grants = parseGrants(body.grants.join(','));
    const expiresAt = ttlToExpiry(body.ttl ?? '72h', new Date());
    return {
      personName: body.personName.trim(),
      expectedIssuer: issuer.toString().replace(/\/$/u, ''),
      expectedSubject: body.expectedSubject,
      expectedEmail: body.expectedEmail?.trim() || null,
      grants,
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
    { mutating: true, mfa: true, functions: ['kundadmin'] },
    async (ctx, tx) => {
      const values = bodyValues((await request.json().catch(() => null)) as InvitationBody | null);
      const token = newInvitationToken(crypto.getRandomValues(new Uint8Array(32)));
      const hash = await tokenHashHex(token);
      const grants = values.grants.map((grant) => ({ function: grant.function }));
      const rows = await tx<{ id: string }[]>`insert into public.invitations
          (customer_id, token_hash, invited_person_name, expected_issuer, expected_subject,
           expected_email, grants, issued_by, expires_at)
        values (${ctx.customerId}, decode(${hash}, 'hex'), ${values.personName},
          ${values.expectedIssuer}, ${values.expectedSubject}, ${values.expectedEmail},
          ${tx.json(grants)}, ${ctx.membershipId}, ${values.expiresAt})
        returning id`;
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
          details: { grants: values.grants.map((grant) => grant.function), principalNamed: true },
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
      const rows = await tx<{
        id: string;
        invited_person_name: string;
        expected_issuer: string;
        grants: unknown;
        expires_at: Date;
        used_at: Date | null;
        issued_by: string;
      }[]>`select id, invited_person_name, expected_issuer, grants, expires_at, used_at, issued_by
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
