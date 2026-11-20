import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { SCHEMA_DATUM_LIMIT, SchemaDatumError, parseSchemaDatumAndringar, schemaDatumDate, schemaDatumNyckel, type SchemaDatumRequest } from './schema-datum.ts';
import type { SchemaProvBerakningResultat } from './schema-provberakning.ts';

export type SchemaProvforslagSvar = Pick<SchemaDatumRequest, 'contractVersion' | 'unitId' | 'schoolYear' | 'period' | 'grundFingerprint'>
  & { provrevision: number | null } & SchemaProvBerakningResultat;
export type SchemaProvProblem = SchemaProvBerakningResultat['bokningar'][number]['problem'][number];

const problems = new Set<SchemaProvProblem>(['deltagare_saknas', 'datum_utan_undervisning', 'provkrock', 'sal_saknas', 'last_sal_olamplig',
  'vakt_saknas', 'last_vakt_upptagen', 'aktivitet_krock', 'last_pass_krock', 'provtid_utanfor_skoltid']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const fail = (): never => { throw new SchemaDatumError(); };
function record(raw: unknown, keys: string[]): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail();
  const r = raw as Record<string, unknown>;
  return Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r, k)) ? r : fail();
}
const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value) ? value : fail();
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : fail();
const list = (raw: unknown, max: number): unknown[] => Array.isArray(raw) && raw.length <= max ? raw : fail();

export function parseSchemaProvforslagSvar(raw: unknown, expected: SchemaDatumRequest): SchemaProvforslagSvar {
  const r = record(raw, ['contractVersion', 'unitId', 'schoolYear', 'period', 'grundFingerprint', 'provrevision', 'bokningar', 'bortfall', 'ersattningar']);
  const { unitId, schoolYear, period, grundFingerprint } = expected;
  if (r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.unitId !== unitId || r.schoolYear !== schoolYear
    || r.period !== period || r.grundFingerprint !== grundFingerprint) return fail();
  const provrevision = r.provrevision === null ? null : int(r.provrevision, 1, 2147483647);
  const withinYear = (value: unknown) => {
    const date = schemaDatumDate(value);
    return date >= `${schoolYear}-07-01` && date <= `${schoolYear + 1}-06-30` ? date : fail();
  };
  const seen = new Set<string>();
  const bokningar = list(r.bokningar, 1000).map(item => {
    const v = record(item, ['id', 'namn', 'datum', 'startMin', 'slutMin', 'deltagare', 'deltagarnamn', 'sal', 'vakter', 'problem']);
    const id = text(v.id, 36), startMin = int(v.startMin, 0, 1435), slutMin = int(v.slutMin, startMin + 5, 1440);
    if (!uuid.test(id) || seen.has(id) || startMin % 5 || slutMin % 5) return fail();
    seen.add(id);
    const sal = v.sal === null ? null : (() => {
      const s = record(v.sal, ['id', 'name']), room = text(s.id, 13);
      return /^sal-[1-9]\d{0,8}$/u.test(room) ? { id: room, name: text(s.name, 200) } : fail();
    })();
    const vakter = list(v.vakter, 20).map(raw => {
      const guard = record(raw, ['ref', 'name']), ref = text(guard.ref, 36);
      return uuid.test(ref) ? { ref, name: text(guard.name, 500) } : fail();
    });
    const problem = list(v.problem, problems.size).map(p => problems.has(p as SchemaProvProblem) ? p as SchemaProvProblem : fail());
    if (new Set(vakter.map(p => p.ref)).size !== vakter.length || new Set(problem).size !== problem.length) return fail();
    return { id, namn: text(v.namn, 160), datum: withinYear(v.datum), startMin, slutMin, deltagare: int(v.deltagare, 0, 200_000),
      deltagarnamn: text(v.deltagarnamn, 500), sal, vakter, problem };
  });
  const refs = new Set<string>();
  const bortfall = list(r.bortfall, SCHEMA_DATUM_LIMIT).map(item => {
    const t = record(item, ['ref', 'title', 'bortfallMin', 'ersattMin', 'kvarMin']), ref = text(t.ref, 2000);
    const bortfallMin = int(t.bortfallMin, 1, 12_000_000), ersattMin = int(t.ersattMin, 0, bortfallMin);
    if (refs.has(ref) || t.kvarMin !== bortfallMin - ersattMin) return fail();
    refs.add(ref);
    return { ref, title: text(t.title, 2000), bortfallMin, ersattMin, kvarMin: bortfallMin - ersattMin };
  });
  const ersattningar = parseSchemaDatumAndringar(r.ersattningar), locks = new Set(expected.datedOverrides.map(schemaDatumNyckel));
  const placed = new Set(expected.placements.map(p => p.lesson));
  for (const move of ersattningar) if (locks.has(schemaDatumNyckel(move)) || !placed.has(move.lesson) || withinYear(move.date) < withinYear(move.originalDate)) return fail();
  if (provrevision === null && (bokningar.length || bortfall.length || ersattningar.length)) return fail();
  return { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, provrevision, bokningar, bortfall, ersattningar };
}
