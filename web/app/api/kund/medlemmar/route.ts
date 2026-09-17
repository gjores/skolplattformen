import { assignmentState, todayInStockholm, type AccessFunction } from '../../../../lib/access-rules.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';

type MemberRow = {
  membership_id: string;
  display_name: string | null;
  email: string | null;
  issuer: string;
  status: 'active' | 'blocked';
  blocked_at: Date | null;
  assignment_id: string | null;
  function: AccessFunction | null;
  organizer_name: string | null;
  unit_name: string | null;
  valid_from: string | null;
  valid_to: string | null;
  ended_at: Date | null;
};

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'member_list',
    { mutating: false, functions: ['kundadmin', 'granskare'] },
    async (_ctx, tx) => {
      const rows = await tx<MemberRow[]>`select
          m.id as membership_id, i.display_name, i.email, i.issuer,
          m.status, m.blocked_at,
          a.id as assignment_id, a.function, o.name as organizer_name,
          u.name as unit_name, a.valid_from::text, a.valid_to::text, a.ended_at
        from public.memberships m
        join public.identities i on i.id = m.identity_id
        left join public.access_assignments a
          on a.membership_id = m.id and a.customer_id = m.customer_id
        left join public.organizers o on o.id = a.organizer_id
        left join public.school_units u on u.id = a.unit_id
        where m.customer_id = current_customer_id()
        order by i.display_name nulls last, i.id, a.created_at, a.id`;
      const today = todayInStockholm();
      const members = new Map<string, {
        membershipId: string;
        displayName: string | null;
        email: string | null;
        issuer: string;
        status: 'active' | 'blocked';
        blockedAt: Date | null;
        assignments: Array<{
          id: string;
          function: AccessFunction;
          organizerName: string | null;
          unitName: string | null;
          validFrom: string;
          validTo: string | null;
          endedAt: Date | null;
          state: 'giltigt' | 'kommande' | 'avslutat';
        }>;
      }>();
      for (const row of rows) {
        let member = members.get(row.membership_id);
        if (!member) {
          member = {
            membershipId: row.membership_id,
            displayName: row.display_name,
            email: row.email,
            issuer: row.issuer,
            status: row.status,
            blockedAt: row.blocked_at,
            assignments: [],
          };
          members.set(row.membership_id, member);
        }
        if (row.assignment_id && row.function && row.valid_from) {
          member.assignments.push({
            id: row.assignment_id,
            function: row.function,
            organizerName: row.organizer_name,
            unitName: row.unit_name,
            validFrom: row.valid_from,
            validTo: row.valid_to,
            endedAt: row.ended_at,
            state: assignmentState(
              {
                validFrom: row.valid_from,
                validTo: row.valid_to,
                endedAt: row.ended_at?.toISOString() ?? null,
              },
              today,
            ),
          });
        }
      }
      return { body: { members: [...members.values()] }, event: null };
    },
  );
}
