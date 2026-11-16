/**
 * Underlaget utan beräknat förslag (05.2-SM-UXF-11). Samma serverhärledda resurser, undervisningar och pass som i ett förslag,
 * men inget pass har tid eller sal och motorn har inte anropats. Läsningen blir aldrig utkastets bas och sparas inte som förslag.
 */
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, parseSchemaForslag, type SchemaForslag, type SchemaForslagRequest, type SchemaSolution } from './schema-contract.ts';
import { schemaForslag, type SchemaUnderlag } from './schema-underlag.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

export type SchemaUnderlagslasning = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; beraknat: false; forslag: SchemaForslag };

/** `status` är bara formens krav: `input_missing` när underlaget saknar pass, annars `cancelled` (ingen beräkning har körts). Vyn visar den aldrig. */
export function schemaUnderlagslasning(plan: TjanstPlanRead, request: SchemaForslagRequest, underlag: SchemaUnderlag): SchemaUnderlagslasning {
  const ids = underlag.problem.lessons.map(l => l.id);
  const olost: SchemaSolution = { status: ids.length ? 'cancelled' : 'input_missing', placements: [], unplaced: ids, diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 0 };
  const { locks: _locks, ...utanLas } = request;
  return { contractVersion: SCHEMA_CONTRACT_VERSION, beraknat: false, forslag: schemaForslag(plan, utanLas, underlag, olost) };
}

/** Klientens tolkning. Ett svar med lagda pass eller annan märkning är inte en underlagsläsning och nekas. */
export function parseSchemaUnderlagslasning(value: unknown, expected: SchemaForslagRequest): SchemaForslag {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaContractError();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== 3 || r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.beraknat !== false) throw new SchemaContractError();
  const { locks: _locks, ...utanLas } = expected;
  const forslag = parseSchemaForslag(r.forslag, utanLas);
  if (forslag.metrics.placed !== 0 || forslag.lessons.some(l => l.day !== null || l.startMin !== null || l.roomId !== null) || forslag.locks?.length) throw new SchemaContractError();
  return forslag;
}
