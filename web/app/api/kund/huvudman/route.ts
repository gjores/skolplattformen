import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';

const TYPES = new Set(['Kommun', 'Enskild', 'Region', 'Staten']);

type OrganizerBody = {
  name?: unknown;
  organizationNumber?: unknown;
  type?: unknown;
};

function organizerValues(body: OrganizerBody | null): {
  name: string;
  organizationNumber: string | null;
  type: 'Kommun' | 'Enskild' | 'Region' | 'Staten';
} {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const organizationNumber = body?.organizationNumber ?? null;
  if (
    name.length < 1 ||
    name.length > 200 ||
    (organizationNumber !== null &&
      (typeof organizationNumber !== 'string' || !/^\d{10}$/u.test(organizationNumber))) ||
    typeof body?.type !== 'string' ||
    !TYPES.has(body.type)
  ) {
    throw new Deny('bad_request', 400);
  }
  return {
    name,
    organizationNumber,
    type: body.type as 'Kommun' | 'Enskild' | 'Region' | 'Staten',
  };
}

function postgresCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

export async function GET(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'organizer_list',
    { mutating: false, functions: ['kundadmin', 'granskare'] },
    async (_ctx, tx) => {
      const rows = await tx<{
        id: string;
        name: string;
        organization_number: string | null;
        type: 'Kommun' | 'Enskild' | 'Region' | 'Staten';
      }[]>`select id, name, organization_number, type
        from public.organizers
        where customer_id = current_customer_id()
        order by name, id`;
      const organizers = [];
      for (const row of rows) {
        await tx`select set_config('app.organizer_id', ${row.id}, true)`;
        const counts = await tx<{ count: string }[]>`select count(*)::text as count
          from public.school_units
          where organizer_id = ${row.id}`;
        organizers.push({
          id: row.id,
          name: row.name,
          organizationNumber: row.organization_number,
          type: row.type,
          unitCount: Number(counts[0].count),
        });
      }
      return { body: { organizers }, event: null };
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(
    request,
    'organizer_created',
    { mutating: true, mfa: true, functions: ['kundadmin'] },
    async (_ctx, tx) => {
      const values = organizerValues(
        (await request.json().catch(() => null)) as OrganizerBody | null,
      );
      let organizerId: string;
      try {
        const rows = await tx<{ id: string }[]>`insert into public.organizers
            (name, organization_number, type, customer_id)
          values (${values.name}, ${values.organizationNumber}, ${values.type}, current_customer_id())
          returning id`;
        organizerId = rows[0].id;
      } catch (error) {
        if (postgresCode(error) === '23505') throw new Deny('conflict', 409);
        throw error;
      }

      // Organisationsnumret är bara en verifierad uppgift. Det används aldrig
      // för att hitta eller koppla ett befintligt huvudmannaobjekt i en annan kund.
      return {
        status: 201,
        body: { organizerId },
        event: {
          action: 'organizer_created',
          objectType: 'organizer',
          objectId: organizerId,
          details: { name: values.name },
        },
      };
    },
  );
}
