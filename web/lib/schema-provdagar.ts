import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { parseSchemaDatumRequest, schemaDatumDate, schemaDatumNyckel, SchemaDatumError, type SchemaDatumNyckel, type SchemaDatumRequest } from './schema-datum.ts';

export type SchemaProvdagarRequest = SchemaDatumRequest & { provrevision: number };
export type SchemaProvdagPass = SchemaDatumNyckel & { date: string };
export type SchemaProvdagProjection = {
  installda: SchemaProvdagPass[];
  ersatta: SchemaProvdagPass[];
  deltagare: { provId: string; refs: string[] }[];
};
export type SchemaProvdagarSvar = Pick<SchemaProvdagarRequest, 'contractVersion' | 'unitId' | 'schoolYear' | 'period' | 'grundFingerprint' | 'provrevision' | 'dates'> & SchemaProvdagProjection;

const bad = (): never => { throw new SchemaDatumError(); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();

export function parseSchemaProvdagarRequest(raw: unknown): SchemaProvdagarRequest {
  const { provrevision, ...datum } = object(raw), request = parseSchemaDatumRequest(datum);
  if (typeof provrevision !== 'number' || !Number.isSafeInteger(provrevision) || provrevision < 1 || !request.dates.length || request.dates.length > 28) return bad();
  return { ...request, provrevision };
}

export function schemaProvdagarScope({ unitId, schoolYear, period, grundFingerprint, provrevision, dates }: SchemaProvdagarRequest) {
  return { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, provrevision, dates };
}

export function parseSchemaProvdagarSvar(raw: unknown, input: SchemaProvdagarRequest, bookingIds: ReadonlySet<string>): SchemaProvdagarSvar {
  const r = object(raw), scope = schemaProvdagarScope(input);
  if (Object.keys(r).sort().join() !== 'contractVersion,dates,deltagare,ersatta,grundFingerprint,installda,period,provrevision,schoolYear,unitId'
      || Object.entries(scope).some(([key, value]) => JSON.stringify(r[key]) !== JSON.stringify(value))) return bad();
  const lessons = new Set(input.placements.map(p => p.lesson)), dates = new Set(input.dates);
  const andringar = new Map(input.datedOverrides.map(a => [schemaDatumNyckel(a), a.date]));
  const passlist = (value: unknown, ersatt: boolean) => {
    if (!Array.isArray(value) || value.length > 20_000) return bad();
    const rows = value.map(item => {
      const row = object(item);
      if (Object.keys(row).sort().join() !== 'date,lesson,originalDate' || typeof row.lesson !== 'string' || !lessons.has(row.lesson)) return bad();
      const result = { lesson: row.lesson, originalDate: schemaDatumDate(row.originalDate), date: schemaDatumDate(row.date) };
      if (ersatt ? andringar.get(schemaDatumNyckel(result)) !== result.date || !dates.has(result.originalDate) && !dates.has(result.date) : !dates.has(result.date)) return bad();
      return result;
    });
    if (new Set(rows.map(schemaDatumNyckel)).size !== rows.length) return bad();
    return rows;
  };
  if (!Array.isArray(r.deltagare) || r.deltagare.length > bookingIds.size) return bad();
  const deltagare = r.deltagare.map(item => {
    const row = object(item);
    if (Object.keys(row).sort().join() !== 'provId,refs' || typeof row.provId !== 'string' || !bookingIds.has(row.provId)
        || !Array.isArray(row.refs) || row.refs.length > 20_000 || new Set(row.refs).size !== row.refs.length
        || row.refs.some(ref => typeof ref !== 'string' || !uuid.test(ref))) return bad();
    return { provId: row.provId, refs: row.refs as string[] };
  });
  if (new Set(deltagare.map(rad => rad.provId)).size !== deltagare.length) return bad();
  return { ...scope, installda: passlist(r.installda, false), ersatta: passlist(r.ersatta, true), deltagare };
}
