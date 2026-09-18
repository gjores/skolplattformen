import { protectedRoute } from '../../../../lib/server/authz.ts';
import { Deny } from '../../../../lib/server/db.ts';
import { fetchRegistryUnit, toImportUnitData } from '../../../../lib/server/skolverket.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(request: Request): Promise<Response> {
  return protectedRoute(request, 'school_unit_imported',
    { mutating: true, mfa: true, functions: ['kundadmin'] }, async (_ctx, tx) => {
      const body = await request.json().catch(() => null) as {
        organizerId?: unknown; code?: unknown; principalName?: unknown;
      } | null;
      if (typeof body?.organizerId !== 'string' || !UUID.test(body.organizerId)) throw new Deny('not_found', 404);
      if (typeof body.code !== 'string' || !/^\d{8}$/u.test(body.code)) throw new Deny('bad_request', 400);
      const principalName = body.principalName == null ? null : body.principalName;
      if (principalName !== null && (typeof principalName !== 'string' || !principalName.trim() || principalName.trim().length > 120)) {
        throw new Deny('bad_request', 400);
      }
      const organizers = await tx<{ id: string }[]>`select id from public.organizers
        where id = ${body.organizerId} and customer_id = current_customer_id()`;
      if (!organizers[0]) throw new Deny('not_found', 404);
      await tx`select set_config('app.organizer_id', ${body.organizerId}, true),
        set_config('app.app_role', 'huvudman', true)`;
      const existing = await tx`select id from public.school_units where organizer_id = ${body.organizerId} and code = ${body.code}`;
      if (existing.length) throw new Deny('conflict', 409);
      const registry = await fetchRegistryUnit(body.code).catch(() => {
        throw new Deny('registry_unavailable', 503, { reason: 'registry_unavailable' });
      });
      if (!registry) throw new Deny('not_found', 404, { reason: 'registry_not_found' });
      let unitId: string;
      try {
        const unitData = toImportUnitData(registry.unit, new Date());
        type JsonInput = Parameters<typeof tx.json>[0];
        const rows = await tx<{ id: string }[]>`select public.import_school_unit(
          ${tx.json(unitData as JsonInput)}::jsonb,
          ${tx.json(registry.payload as JsonInput)}::jsonb, null, ${principalName?.trim() ?? null}) as id`;
        unitId = rows[0].id;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new Deny('conflict', 409);
        throw error;
      }
      return {
        status: 201,
        body: { unitId, unit: { code: registry.unit.code, name: registry.unit.name, schoolTypes: registry.unit.schoolTypes } },
        event: { action: 'school_unit_imported', objectType: 'school_unit', objectId: unitId,
          details: { code: body.code, organizerId: body.organizerId, principalNamed: !!principalName } },
      };
    });
}
