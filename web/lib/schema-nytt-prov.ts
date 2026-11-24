/** Provplaneringen kan följa ett nytt förslag. Skrivningen har ett eget, revisionsbundet kvitto. */
import { SchemaContractError, parseSchemaForslag, type SchemaForslag, type SchemaForslagRequest } from './schema-contract.ts';
import { parseSchemaDatumAndringar, SCHEMA_DATUM_LIMIT, schemaDatumDate, type SchemaDatumAndring } from './schema-datum.ts';
import { parseSchemaAktivitetsForslag, type SchemaAktivitetsForslag, type SchemaDateradAktivitetInput } from './schema-daterad-aktivitet.ts';
import { parseSchemaDraftSave, parseSchemaDraftScope, type SchemaDraftSave, type SchemaDraftScope } from './schema-draft-contract.ts';
import type { SchemaLastVaktHinder, SchemaProvBerakningResultat } from './schema-provberakning.ts';
import { SCHEMA_PROV_PROBLEM_CODES, type SchemaProvProblem } from './schema-provforslag.ts';

type Provgrund = { provrevision: number; sourceHash: string; resultHash: string };
export type SchemaNyttProvPlanering = Provgrund & { draftId: string | null; expectedRevision: number; bookings: number; moveCount: number; replacedMinutes: number;
  dateradAktivitet?: SchemaAktivitetsForslag; undervisning?: SchemaProvBerakningResultat['bortfall']; bevaradeDatum?: SchemaDatumAndring[] };
export type SchemaNyttProvSave = { save: SchemaDraftSave; prov: Provgrund };
export type SchemaNyttProvSaveReply = SchemaDraftScope & { draftId: string; commandId: string; revision: number };
export type SchemaNyttProvProblem = SchemaProvProblem | SchemaLastVaktHinder;
export type SchemaNyttProvBokningshinder = { id: string; namn: string; datum: string; deltagarnamn: string; problem: SchemaNyttProvProblem[] };
export type SchemaNyttProvHinder = { bookings: number; resourceIssues: number; remainingMinutes: number; dateIssues: number;
  unplaced?: number; bokningarMedHinder?: SchemaNyttProvBokningshinder[] };

const bad = (): never => { throw new SchemaContractError(); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
function keys(value: unknown, expected: string[]) {
  const r = object(value);
  return Object.keys(r).length === expected.length && expected.every(key => Object.hasOwn(r, key)) ? r : bad();
}
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : bad();
const hash = (value: unknown) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value) ? value : bad();
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value) ? value : bad();
const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max && !/\p{Cc}/u.test(value) ? value : bad();
const problemCodes = new Set<SchemaNyttProvProblem>([...SCHEMA_PROV_PROBLEM_CODES, 'last_vakt_skoluppdrag_saknas', 'last_vakt_tid_sparrad']);

function parseBokningarMedHinder(value: unknown, bookings: number): SchemaNyttProvBokningshinder[] | undefined {
  if (!Array.isArray(value) || value.length > bookings) return undefined;
  try {
    const seen = new Set<string>();
    return value.map(raw => {
      const row = keys(raw, ['id', 'namn', 'datum', 'deltagarnamn', 'problem']), id = uuid(row.id);
      if (seen.has(id) || !Array.isArray(row.problem) || !row.problem.length || row.problem.length > problemCodes.size) return bad();
      const problem = row.problem.map(p => problemCodes.has(p as SchemaNyttProvProblem) ? p as SchemaNyttProvProblem : bad());
      if (new Set(problem).size !== problem.length) return bad();
      seen.add(id);
      return { id, namn: text(row.namn, 160), datum: schemaDatumDate(row.datum), deltagarnamn: text(row.deltagarnamn, 500), problem };
    });
  } catch { return undefined; }
}

export function parseSchemaNyttProvHinder(value: unknown): SchemaNyttProvHinder | null {
  try {
    const h = object(value), bookings = int(h.bookings, 0, 200);
    const bokningarMedHinder = parseBokningarMedHinder(h.bokningarMedHinder, bookings);
    return { bookings, resourceIssues: int(h.resourceIssues, 0, 20_000), remainingMinutes: int(h.remainingMinutes, 0, 12_000_000),
      dateIssues: int(h.dateIssues, 0, 20_000), ...(h.unplaced === undefined ? {} : { unplaced: int(h.unplaced, 0, 20_000) }),
      ...(bokningarMedHinder === undefined ? {} : { bokningarMedHinder }) };
  } catch { return null; }
}

const provKeys = ['provrevision', 'sourceHash', 'resultHash'];
function parseProv(r: Record<string, unknown>): Provgrund {
  return { provrevision: int(r.provrevision, 1, 2147483647), sourceHash: hash(r.sourceHash), resultHash: hash(r.resultHash) };
}

function parseUndervisning(value: unknown): SchemaProvBerakningResultat['bortfall'] {
  if (!Array.isArray(value) || value.length > SCHEMA_DATUM_LIMIT) return bad();
  const seen = new Set<string>();
  return value.map(raw => {
    const row = keys(raw, ['ref', 'title', 'bortfallMin', 'ersattMin', 'kvarMin']);
    const ref = text(row.ref, 2000), bortfallMin = int(row.bortfallMin, 1, 12_000_000), ersattMin = int(row.ersattMin, 0, bortfallMin);
    if (seen.has(ref) || row.kvarMin !== bortfallMin - ersattMin) return bad();
    seen.add(ref);
    return { ref, title: text(row.title, 2000), bortfallMin, ersattMin, kvarMin: bortfallMin - ersattMin };
  });
}

export function parseSchemaNyttProvForslag(value: unknown, expected: SchemaForslagRequest, aktivitet?: SchemaDateradAktivitetInput):
  { forslag: SchemaForslag; provplanering?: SchemaNyttProvPlanering } {
  const { provplanering, ...raw } = object(value);
  const forslag = parseSchemaForslag(raw, expected);
  if (provplanering === undefined) return { forslag };
  const data = object(provplanering);
  const optional = ['dateradAktivitet', 'undervisning', 'bevaradeDatum'].filter(key => Object.hasOwn(data, key));
  const p = keys(data, [...provKeys, 'draftId', 'expectedRevision', 'bookings', 'moveCount', 'replacedMinutes', ...optional]);
  const draftId = p.draftId === null ? null : uuid(p.draftId), expectedRevision = int(p.expectedRevision, 0, 2147483646);
  if ((draftId === null) !== (expectedRevision === 0)) return bad();
  if (Object.hasOwn(p, 'dateradAktivitet') !== Boolean(aktivitet)) return bad();
  return { forslag, provplanering: { ...parseProv(p), draftId, expectedRevision, bookings: int(p.bookings, 1, 200),
    moveCount: int(p.moveCount, 0, 20000), replacedMinutes: int(p.replacedMinutes, 0, 12000000),
    ...(aktivitet && { dateradAktivitet: parseSchemaAktivitetsForslag(p.dateradAktivitet, aktivitet) }),
    ...(Object.hasOwn(p, 'undervisning') && { undervisning: parseUndervisning(p.undervisning) }),
    ...(Object.hasOwn(p, 'bevaradeDatum') && { bevaradeDatum: parseSchemaDatumAndringar(p.bevaradeDatum) }) } };
}

export function parseSchemaNyttProvSave(value: unknown): SchemaNyttProvSave {
  const r = keys(value, ['save', 'prov']), save = parseSchemaDraftSave(r.save);
  if (!save.basisVillkor || !save.grundFingerprint || !save.placements.length || save.datedOverrides.length || save.intentional.length) return bad();
  return { save, prov: parseProv(keys(r.prov, provKeys)) };
}

export function parseSchemaNyttProvSaveReply(value: unknown, input: SchemaNyttProvSave): SchemaNyttProvSaveReply {
  const r = object(value), scope = parseSchemaDraftScope(r, ['draftId', 'commandId', 'revision']);
  const { save } = input, draftId = uuid(r.draftId);
  if (scope.unitId !== save.unitId || scope.schoolYear !== save.schoolYear || scope.period !== save.period
    || r.commandId !== save.commandId || r.revision !== save.expectedRevision + 1 || save.draftId !== null && draftId !== save.draftId) return bad();
  return { ...scope, draftId, commandId: save.commandId, revision: save.expectedRevision + 1 };
}
