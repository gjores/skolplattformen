import { contextLabel } from '../../../../lib/access-rules.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { protectedRoute } from '../../../../lib/server/authz.ts';

type OverviewRow = {
  customer_id: string;
  customer_name: string;
  membership_id: string;
  membership_status: 'active' | 'blocked';
  assignment_id: string;
  function: 'kundadmin' | 'granskare';
  organizer_name: string | null;
  unit_name: string | null;
  memberships: string;
  assignments: string;
  invitations_open: string;
};

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'kund_oversikt',
    { mutating: false, functions: ['kundadmin', 'granskare'] },
    async (ctx, tx) => {
      const rows = await tx<OverviewRow[]>`select
          c.id as customer_id,
          c.name as customer_name,
          m.id as membership_id,
          m.status as membership_status,
          a.id as assignment_id,
          a.function,
          o.name as organizer_name,
          u.name as unit_name,
          (select count(*)::text from public.memberships cm
            where cm.customer_id = public.current_customer_id()) as memberships,
          (select count(*)::text from public.access_assignments ca
            where ca.customer_id = public.current_customer_id()) as assignments,
          (select count(*)::text from public.invitations ci
            where ci.customer_id = public.current_customer_id()
              and ci.used_at is null and ci.expires_at > now()) as invitations_open
        from public.customers c
        join public.memberships m on m.id = ${ctx.membershipId}
        join public.access_assignments a on a.id = ${ctx.assignmentId}
        left join public.organizers o on o.id = a.organizer_id
        left join public.school_units u on u.id = a.unit_id
        where c.id = public.current_customer_id()`;
      const row = rows[0];
      if (!row) throw new Deny('not_found', 404);
      return {
        body: {
          customer: { id: row.customer_id, name: row.customer_name },
          membership: { id: row.membership_id, status: row.membership_status },
          assignment: {
            id: row.assignment_id,
            function: row.function,
            label: contextLabel({
              customerName: row.customer_name,
              organizerName: row.organizer_name,
              unitName: row.unit_name,
              function: row.function,
            }),
          },
          counts: {
            memberships: Number(row.memberships),
            assignments: Number(row.assignments),
            invitationsOpen: Number(row.invitations_open),
          },
        },
        event: null,
      };
    },
  );
}
