/** Fortsatt beräkning är en läsning och ett granskningsförslag, aldrig en skrivning av utkastet. */
import {
  SchemaContractError, checkSchemaPlacements, parseSchemaForslag, parseSchemaForslagRequest, parseSchemaKontroll,
  parseSchemaKontrollRequest, type SchemaForslag, type SchemaForslagRequest, type SchemaKontroll,
  type SchemaKontrollRequest, type SchemaPlacement, type SchemaProblem,
} from './schema-contract.ts';
import { motorProblem } from './schema-utan-sal.ts';

/** Matchar tjänstens hårda tak på 60 sekunder. Varken godtycklig budget eller tyst kapning tillåts. */
export const SCHEMA_SOLVE_TIMES = [10_000, 30_000, 60_000] as const;
export const SCHEMA_SOLVE_DEFAULT_MS = 30_000;
export type SchemaSolveTimeMs = typeof SCHEMA_SOLVE_TIMES[number];
export type SchemaSolveRequest = SchemaForslagRequest & { solveTimeMs: SchemaSolveTimeMs };
export type SchemaFortsattRequest = SchemaKontrollRequest & { solveTimeMs: SchemaSolveTimeMs };
export type SchemaFortsatt = { forslag: SchemaForslag; before: SchemaKontroll; after: SchemaKontroll };

const bad = (): never => { throw new SchemaContractError(); };
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
export function schemaSolveTime(value: unknown = SCHEMA_SOLVE_DEFAULT_MS): SchemaSolveTimeMs {
  return typeof value === 'number' && SCHEMA_SOLVE_TIMES.includes(value as SchemaSolveTimeMs) ? value as SchemaSolveTimeMs : bad();
}
/** Tid är ett kommandoalternativ, inte ett villkor och inte en ny schemagrund. Äldre klienter utan fältet fungerar. */
export function parseSchemaSolveRequest(value: unknown): SchemaSolveRequest {
  const { solveTimeMs, ...request } = record(value);
  return { ...parseSchemaForslagRequest(request), solveTimeMs: schemaSolveTime(solveTimeMs) };
}
export function parseSchemaFortsattRequest(value: unknown): SchemaFortsattRequest {
  const { solveTimeMs, ...request } = record(value);
  return { ...parseSchemaKontrollRequest(request), solveTimeMs: schemaSolveTime(solveTimeMs) };
}

/**
 * Referensen är de aktuella placeringarna, inte det ursprungliga motorkörningens förslag. Motorn sätter lås först och använder sedan referensen
 * som startläge och flyttkostnad. Med salregister förblir alla pass utan vald sal salfria, även de som ännu ligger på viloytan (UXF-43).
 * Namn och externa identiteter följer inte med; bara underlagets interna löpnummer används.
 */
export function schemaFortsattProblem(problem: SchemaProblem, placements: SchemaPlacement[], salregister: boolean): SchemaProblem {
  const checked = checkSchemaPlacements(placements, problem, false), placed = new Set(checked.map(p => p.lesson));
  const at = new Map(checked.map(p => [p.lesson, p]));
  for (const l of problem.lessons) if (l.locked?.rooms?.length && at.get(l.id)?.room !== l.locked.rooms[0]) bad();
  const motor = salregister ? motorProblem(problem, checked, problem.lessons.filter(l => !placed.has(l.id)).map(l => l.id)) : problem;
  return { ...motor, reference: checked.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) };
}

/** Svar binds till samma läsning, passuppsättning, lås och kontrollmått innan det får visas för godkännande. */
export function parseSchemaFortsatt(value: unknown, expected: SchemaFortsattRequest): SchemaFortsatt {
  const r = record(value);
  if (Object.keys(r).length !== 3) bad();
  const forslag = parseSchemaForslag(r.forslag, expected);
  if (forslag.grundFingerprint !== expected.grundFingerprint) bad();
  const known = new Map(forslag.lessons.map(l => [l.id, l]));
  const teachings = new Set(forslag.fordelning.map(f => f.ref));
  if (known.size !== forslag.lessons.length || expected.placements.some(p => !known.has(p.lesson))) bad();
  const before = parseSchemaKontroll(r.before, expected.grundFingerprint), after = parseSchemaKontroll(r.after, expected.grundFingerprint);
  const placements = forslag.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
  for (const [control, positions] of [[before, expected.placements], [after, placements]] as const) {
    if (control.fingerprint !== forslag.fingerprint || control.metrics.lessons !== known.size || control.metrics.placed !== positions.length
      || control.metrics.unplaced !== known.size - positions.length) bad();
    const placed = new Map(positions.map(p => [p.lesson, p]));
    if (control.violations.some(v => v.lessons.some(id => !known.has(id))) || control.trims.some(t => !known.has(t.lesson))
      || control.teachings.some(t => !teachings.has(t.ref))) bad();
    for (const [id, room] of Object.entries(control.rooms)) if (!placed.has(id) || !known.get(id)?.roomIds.includes(room)) bad();
  }
  for (const p of placements) if ((after.rooms[p.lesson] ?? null) !== p.room) bad();
  for (const locked of expected.locks?.placements ?? []) {
    const p = placements.find(p => p.lesson === locked.lesson);
    if (!p || p.day !== locked.day || p.startMin !== locked.startMin || p.room !== locked.room) bad();
  }
  for (const key of ['lessons', 'placed', 'unplaced', 'studentGapMin', 'teacherGapMin'] as const) if (forslag.metrics[key] !== after.metrics[key]) bad();
  return { forslag, before, after };
}
