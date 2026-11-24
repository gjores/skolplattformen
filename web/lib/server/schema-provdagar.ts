import { SchemaContractError } from '../schema-contract.ts';
import { SchemaDatumError } from '../schema-datum.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { schemaProvdagProjektion } from '../schema-provdag-projektion.ts';
import { parseSchemaProvdagarRequest, schemaProvdagarScope, type SchemaProvdagarSvar } from '../schema-provdagar.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin } from './authz.ts';
import { Deny } from './db.ts';
import { logEvent } from './events.ts';
import { readNationellaProv } from './nationella-prov.ts';
import { readSchemaDatedBasis } from './schema-datum-read.ts';
import { schemaDatumGrund } from './schema-datum.ts';
import { readSchemaBasis, schemaBegaran } from './schema-read.ts';

export async function schemaProvdagarRoute(request: Request): Promise<Response> {
  return protectedRoute(request, 'schema_provdagar_read', { mutating: false, mfa: true, audit: 'required', functions: ['rektor', 'administrator'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaBegaran(request, parseSchemaProvdagarRequest), { unitId, schoolYear } = input;
    const provplan = await readNationellaProv(tx, ctx, unitId, schoolYear);
    if (!provplan || provplan.revision !== input.provrevision) throw new Deny('conflict', 409, { reason: 'nationella_prov_conflict' });
    const source = await readSchemaBasis(request, tx, ctx, input), { body: datedBasis, event } = await readSchemaDatedBasis(tx, ctx, input);
    try {
      await logEvent(tx, { ...ctx, request }, { ...source.event, outcome: 'ok' });
      await logEvent(tx, { ...ctx, request }, { ...event, outcome: 'ok' });
    } catch { throw new AuditUnavailable(); }
    try {
      const { underlag, forslag } = schemaDatumGrund(source, input);
      if (!forslag.time.calendar) throw new SchemaDatumError('schema_datum_calendar_missing');
      const projection = schemaProvdagProjektion({ plan: source.plan, underlag, forslag, datedBasis, datedOverrides: input.datedOverrides,
        bokningar: provplan.document.bokningar, salar: source.basis.skolsalar?.salar ?? [] }, input.dates);
      const body: SchemaProvdagarSvar = { ...schemaProvdagarScope(input), ...projection };
      return { body, event: { action: 'schema_provdagar_read', objectType: 'school', objectId: unitId, details: { unitId, schoolYear } } };
    } catch (error) {
      if (error instanceof SchemaDatumError) throw new Deny('conflict', 409, { reason: error.reason });
      if (error instanceof SchemaFordelningError) throw new Deny('bad_request', 400, { issues: error.issues.slice(0, 20) });
      if (error instanceof SchemaContractError) throw new Deny('bad_request', 400);
      throw error;
    }
  });
}
