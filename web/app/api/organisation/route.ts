import { protectedRoute } from '../../../lib/server/authz.ts';
import { Deny } from '../../../lib/server/db.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type OrganizerRow = { id: string; name: string; type: string };
type UnitRow = {
  id: string;
  code: string;
  name: string;
  municipality_name: string | null;
  status: string;
};
type UnitTypeRow = { unit_id: string; school_type: string };
type StaffRow = { id: string; name: string; role: 'rektor' | 'larare' };
type StaffUnitRow = { assignment_id: string; unit_id: string };

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'organization_read',
    { mutating: false, functions: ['kundadmin', 'granskare'] },
    async (_ctx, tx) => {
      const organizerId = new URL(request.url).searchParams.get('huvudman');
      if (!organizerId || !UUID.test(organizerId)) throw new Deny('not_found', 404);
      const visible = await tx<OrganizerRow[]>`select id, name, type
        from public.organizers
        where id = ${organizerId} and customer_id = current_customer_id()`;
      const organizer = visible[0];
      if (!organizer) throw new Deny('not_found', 404);

      await tx`select set_config('app.organizer_id', ${organizerId}, true)`;
      const [units, unitTypes, staff, staffUnits] = await Promise.all([
        tx<UnitRow[]>`select id, code, name, municipality_name, status
          from public.school_units
          where organizer_id = ${organizerId}
          order by name, id`,
        tx<UnitTypeRow[]>`select t.unit_id, t.school_type
          from public.school_unit_types t
          join public.school_units u on u.id = t.unit_id
          where u.organizer_id = ${organizerId}
          order by t.unit_id, t.school_type`,
        tx<StaffRow[]>`select id, name, role
          from public.assignments
          where organizer_id = ${organizerId}
          order by name, id`,
        tx<StaffUnitRow[]>`select au.assignment_id, au.unit_id
          from public.assignment_units au
          join public.assignments a on a.id = au.assignment_id
          where a.organizer_id = ${organizerId}
          order by au.assignment_id, au.unit_id`,
      ]);

      const typesByUnit = new Map<string, string[]>();
      for (const row of unitTypes) {
        const current = typesByUnit.get(row.unit_id) ?? [];
        current.push(row.school_type);
        typesByUnit.set(row.unit_id, current);
      }
      const unitIdsByStaff = new Map<string, string[]>();
      for (const row of staffUnits) {
        const current = unitIdsByStaff.get(row.assignment_id) ?? [];
        current.push(row.unit_id);
        unitIdsByStaff.set(row.assignment_id, current);
      }
      const principalByUnit = new Map<string, StaffRow>();
      for (const member of staff) {
        if (member.role !== 'rektor') continue;
        for (const unitId of unitIdsByStaff.get(member.id) ?? []) {
          if (!principalByUnit.has(unitId)) principalByUnit.set(unitId, member);
        }
      }

      return {
        body: {
          organizer,
          units: units.map((unit) => {
            const principal = principalByUnit.get(unit.id);
            return {
              id: unit.id,
              code: unit.code,
              name: unit.name,
              municipalityName: unit.municipality_name,
              status: unit.status,
              schoolTypes: typesByUnit.get(unit.id) ?? [],
              principal: principal ? { assignmentId: principal.id, name: principal.name } : null,
            };
          }),
          staff: staff.map((member) => ({
            id: member.id,
            name: member.name,
            role: member.role,
            unitIds: unitIdsByStaff.get(member.id) ?? [],
          })),
        },
        event: null,
      };
    },
  );
}
