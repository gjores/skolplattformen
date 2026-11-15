/** Serverns säkra ändring av aktivitetslistan utan att undervisningens pass flyttas. */
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, checkSchemaPlacements, parseSchemaKontrollRequest, parseSchemaVillkor, type SchemaForslag, type SchemaKontroll,
  type SchemaKontrollRequest, type SchemaPlacement, type SchemaSolution, type SchemaVillkor } from './schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll, type SchemaBasis, type SchemaUnderlag } from './schema-underlag.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

export type SchemaAktiviteterRequest = SchemaKontrollRequest & { previousVillkor: SchemaVillkor };
export type SchemaAktiviteterSvar = { forslag: SchemaForslag; kontroll: SchemaKontroll };
export function parseSchemaAktiviteterRequest(value: unknown): SchemaAktiviteterRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 8 || !Object.hasOwn(value, 'previousVillkor')) throw new SchemaContractError();
  const { previousVillkor, ...base } = value as Record<string, unknown>;
  return { ...parseSchemaKontrollRequest(base), previousVillkor: parseSchemaVillkor(previousVillkor) };
}
export type SchemaAktivitetsAndring = { fore: SchemaUnderlag; efter: SchemaUnderlag; preserved: SchemaPlacement[]; added: string[]; solver: SchemaUnderlag['problem'] };
export function schemaAktivitetsAndring(plan: TjanstPlanRead, input: SchemaAktiviteterRequest, basis?: SchemaBasis): SchemaAktivitetsAndring | null {
  const fore = buildSchemaUnderlag(plan, { ...input, villkor: input.previousVillkor }, basis);
  if (fore.grundFingerprint !== input.grundFingerprint) return null;
  // Bara aktivitetslistan får ändras. Övriga villkor måste redan vara prövade som nuvarande underlag.
  const without = (v: SchemaVillkor) => { const { aktiviteter: _, ...rest } = v; return JSON.stringify(rest); };
  if (without(input.previousVillkor) !== without(input.villkor)) throw new SchemaContractError();
  const efter = buildSchemaUnderlag(plan, input, basis), previous = checkSchemaPlacements(input.placements, fore.problem);
  const ids = new Set(efter.problem.lessons.map(l => l.id)), preserved = previous.filter(p => ids.has(p.lesson));
  const old = new Map(fore.problem.lessons.map(l => [l.id, l])), added = efter.problem.lessons.filter(l => !old.has(l.id) || JSON.stringify(l) !== JSON.stringify(old.get(l.id))).map(l => l.id);
  // En ändrad aktivitets fasta tid får en ny placering; undervisningar påverkas aldrig.
  const keep = preserved.filter(p => !added.includes(p.lesson)), at = new Map(keep.map(p => [p.lesson, p]));
  const solver = { ...efter.problem, lessons: efter.problem.lessons.map(l => {
    const p = at.get(l.id);
    return p ? { ...l, locked: { day: p.day, start_min: p.startMin, ...(p.room ? { rooms: [p.room] } : {}) } } : l;
  }) };
  return { fore, efter, preserved: keep, added, solver };
}
/** Resultatets placeringar för gamla pass ersätter aldrig de bevarade placeringarna. */
export function schemaAktivitetsPlaceringar(change: SchemaAktivitetsAndring, solution: SchemaSolution | null): SchemaPlacement[] {
  const added = new Set(change.added), next = [...change.preserved];
  for (const l of change.efter.problem.lessons) {
    if (!added.has(l.id)) continue;
    const p = l.locked ? { lesson: l.id, day: l.locked.day, startMin: l.locked.start_min, room: l.rooms?.allowed[0] ?? null }
      : solution?.placements.find(p => p.lesson === l.id);
    if (p) next.push(p);
  }
  return checkSchemaPlacements(next, change.efter.problem);
}
export function schemaAktivitetsSvar(plan: TjanstPlanRead, input: SchemaAktiviteterRequest, change: SchemaAktivitetsAndring, placements: SchemaPlacement[], check: Parameters<typeof schemaKontroll>[2], solution: SchemaSolution | null): SchemaAktiviteterSvar {
  const ids = new Set(placements.map(p => p.lesson)), unplaced = change.efter.problem.lessons.filter(l => !ids.has(l.id)).map(l => l.id);
  const svar = schemaKontroll(change.efter, placements, check);
  return { forslag: schemaForslag(plan, input, change.efter, { status: solution?.status ?? 'complete', placements, unplaced,
    diagnoses: solution?.diagnoses ?? [], elapsedMs: solution?.elapsedMs ?? 0, metrics: check.metrics }), kontroll: { ...svar, contractVersion: SCHEMA_CONTRACT_VERSION } };
}
