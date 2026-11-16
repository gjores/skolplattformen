/** Prövade ändringar av EN egen tidsregel (C12). Ett förslag ändrar eller sparar aldrig schemat. */
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, parseSchemaKontroll, parseSchemaKontrollRequest, parseSchemaVillkor, villkorNyckel,
  type SchemaKontroll, type SchemaKontrollRequest, type SchemaProblem, type SchemaRegel, type SchemaRegelSlag, type SchemaVillkor } from './schema-contract.ts';
import { parseSchemaPlacering, type SchemaPlaceringsforslag } from './schema-placering.ts';

export const SCHEMA_VILLKORSFORSLAG_LIMITS = { candidates: 12, suggestions: 3, timeMs: 8_000 } as const;
export type SchemaVillkorsforslagRequest = SchemaKontrollRequest & { lesson: string; depth: 1 | 2 | 3 };
export type SchemaVillkorsandring = { ruleIndex: number; resource: { slag: SchemaRegelSlag; ref: string; name: string };
  before: SchemaRegel; after: SchemaRegel | null; message: string };
export type SchemaVillkorsalternativ = { id: string; change: SchemaVillkorsandring; placement: SchemaPlaceringsforslag; kontroll: SchemaKontroll };
export type SchemaVillkorsforslag = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; grundFingerprint: string; fingerprint: string; inputFingerprint: string;
  lesson: string; depth: 1 | 2 | 3; timedOut: boolean; elapsedMs: number; testedCandidates: number; newGrundCandidates: number; explanation: string; suggestions: SchemaVillkorsalternativ[] };
export type SchemaVillkorsforslagFailure = 'schema_underlag_changed' | 'schema_villkorsforslag_not_parked' | 'schema_placement_locked_lesson' | 'schema_placement_invalid_baseline';
export class SchemaVillkorsforslagError extends SchemaContractError {
  public reason: SchemaVillkorsforslagFailure;
  constructor(reason: SchemaVillkorsforslagFailure) { super(); this.reason = reason; this.name = 'SchemaVillkorsforslagError'; }
}
const FINGERPRINT = /^[0-9a-f]{28}$/u;
function bad(): never { throw new SchemaContractError(); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) bad(); return value as Record<string, unknown>; }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const r = record(value); if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad(); return r;
}
function int(value: unknown, max: number): number { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > max) bad(); return value; }
function text(value: unknown, max = 2000): string { if (typeof value !== 'string' || !value.trim() || value.length > max) bad(); return value; }
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !FINGERPRINT.test(value)) bad(); return value; }
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) bad(); return value; }

export function parseSchemaVillkorsforslagRequest(value: unknown): SchemaVillkorsforslagRequest {
  const { lesson, depth, ...rest } = record(value), base = parseSchemaKontrollRequest(rest);
  if (typeof lesson !== 'string' || !/^pass-\d{1,10}$/u.test(lesson) || depth !== 1 && depth !== 2 && depth !== 3) bad();
  const seen = new Set<string>();
  for (const p of base.placements) { if (seen.has(p.lesson)) bad(); seen.add(p.lesson); }
  if (seen.has(lesson)) throw new SchemaVillkorsforslagError('schema_villkorsforslag_not_parked');
  return { ...base, lesson, depth };
}

/** Enbart driftkontroll mellan begäran och svar, inget säkerhetsbevis. Ordningen på placeringar saknar betydelse; regelradernas index bevaras. */
export function schemaVillkorsforslagInputFingerprint(input: SchemaVillkorsforslagRequest): string {
  const at = (placements: SchemaKontrollRequest['placements']) => [...placements].sort((a, b) => a.lesson.localeCompare(b.lesson));
  const canonical = villkorNyckel({ ...input, placements: at(input.placements), ...(input.locks ? { locks: { ...input.locks, placements: at(input.locks.placements) } } : {}) });
  let a = 2166136261, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
  for (let i = 0; i < canonical.length; i++) {
    const n = canonical.charCodeAt(i); a = Math.imul(a ^ n, 16777619); b = Math.imul(b ^ n, 2246822507);
    c = Math.imul(c ^ n, 3266489909); d = Math.imul(d ^ n, 668265263);
  }
  return [a, b, c, d].map(x => (x >>> 0).toString(16).padStart(8, '0')).join('').slice(0, 28);
}

/** Fast, begränsad policy: ta bort en egen spärr/marginal eller utöka EN tillåten-tid-rad. Nationella/källhärledda villkor ändras aldrig. */
export function schemaVillkorsandring(villkor: SchemaVillkor, ruleIndex: number, name: string): SchemaVillkorsandring | null {
  const before = villkor.egna[ruleIndex]; if (!before) return null;
  let after: SchemaRegel | null, message: string;
  if (before.typ === 'sparrad') { after = null; message = `Ta bort spärrad tid för ${name}.`; }
  else if (before.typ === 'marginal') { after = null; message = `Ta bort marginalen ”${before.label}” för ${name}.`; }
  else if (before.typ === 'tillaten') {
    after = { ...before, days: villkor.days.map((_, day) => day), startMin: Math.min(...villkor.days.map(d => d.startMin)), endMin: Math.max(...villkor.days.map(d => d.endMin)) };
    // Flera tillåtna tider är en union. En rad utökas, den tas aldrig bort så att en annan rad råkar begränsa veckan.
    if (villkorNyckel(before) === villkorNyckel(after)) return null;
    message = `Utöka tillåten tid för ${name} till hela skolveckan.`;
  } else return null;
  return { ruleIndex, resource: { slag: before.slag, ref: before.ref, name }, before, after, message };
}

/** Tillämpa först efter ny serverkontroll. Nekar gammal rad, andra regeltyper och en större förändring än den uttryckliga policyn. */
export function tillampaSchemaVillkorsandring(villkor: SchemaVillkor, change: SchemaVillkorsandring): SchemaVillkor {
  if (!Number.isSafeInteger(change.ruleIndex) || change.ruleIndex < 0) bad();
  const wanted = schemaVillkorsandring(villkor, change.ruleIndex, change.resource.name);
  if (!wanted || villkorNyckel(wanted) !== villkorNyckel(change)) bad();
  const egna = villkor.egna.flatMap((r, i) => i !== change.ruleIndex ? [r] : change.after === null ? [] : [change.after]);
  return parseSchemaVillkor({ ...villkor, egna });
}

/** Klienten binder förslaget till hela utgångspunkten och prövar före/efter/lås även innan användaren begär sin nya kontroll. */
export function parseSchemaVillkorsforslag(value: unknown, expected: SchemaVillkorsforslagRequest, lessonIds?: readonly string[], links?: SchemaProblem['links']): SchemaVillkorsforslag {
  const r = exact(value, ['contractVersion', 'grundFingerprint', 'fingerprint', 'inputFingerprint', 'lesson', 'depth', 'timedOut', 'elapsedMs', 'testedCandidates', 'newGrundCandidates', 'explanation', 'suggestions']);
  if (r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.grundFingerprint !== expected.grundFingerprint || r.inputFingerprint !== schemaVillkorsforslagInputFingerprint(expected)
    || r.lesson !== expected.lesson || r.depth !== expected.depth || typeof r.timedOut !== 'boolean') bad();
  const testedCandidates = int(r.testedCandidates, SCHEMA_VILLKORSFORSLAG_LIMITS.candidates), newGrundCandidates = int(r.newGrundCandidates, SCHEMA_VILLKORSFORSLAG_LIMITS.candidates);
  if (testedCandidates + newGrundCandidates > SCHEMA_VILLKORSFORSLAG_LIMITS.candidates) bad();
  const seen = new Set<number>();
  const suggestions = list(r.suggestions, SCHEMA_VILLKORSFORSLAG_LIMITS.suggestions).map(raw => {
    const s = exact(raw, ['id', 'change', 'placement', 'kontroll']), c = exact(s.change, ['ruleIndex', 'resource', 'before', 'after', 'message']);
    const ruleIndex = int(c.ruleIndex, expected.villkor.egna.length - 1), resource = exact(c.resource, ['slag', 'ref', 'name']);
    const change = schemaVillkorsandring(expected.villkor, ruleIndex, text(resource.name));
    if (!change || villkorNyckel(change) !== villkorNyckel(c) || seen.has(ruleIndex) || s.id !== `regel-${ruleIndex + 1}`) bad();
    seen.add(ruleIndex);
    const villkor = tillampaSchemaVillkorsandring(expected.villkor, change);
    const placement = parseSchemaPlacering({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: expected.grundFingerprint, depth: expected.depth,
      timedOut: false, elapsedMs: 0, suggestions: [s.placement] }, { ...expected, villkor, mode: 'lesson', target: null }, lessonIds, links).suggestions[0];
    const kontroll = parseSchemaKontroll(s.kontroll, expected.grundFingerprint);
    if (kontroll.total !== 0 || kontroll.violations.length || kontroll.fingerprint === r.fingerprint || kontroll.metrics.placed !== placement.placements.length
      || kontroll.metrics.placed + kontroll.metrics.unplaced !== kontroll.metrics.lessons || lessonIds && kontroll.metrics.lessons !== lessonIds.length) bad();
    const rooms = Object.fromEntries(placement.placements.flatMap(p => p.room === null ? [] : [[p.lesson, p.room]]));
    if (villkorNyckel(rooms) !== villkorNyckel(kontroll.rooms)) bad();
    return { id: s.id as string, change, placement, kontroll };
  });
  if (suggestions.length > testedCandidates) bad();
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: expected.grundFingerprint, fingerprint: fingerprint(r.fingerprint), inputFingerprint: fingerprint(r.inputFingerprint),
    lesson: expected.lesson, depth: expected.depth, timedOut: r.timedOut, elapsedMs: int(r.elapsedMs, 60_000), testedCandidates, newGrundCandidates, explanation: text(r.explanation), suggestions };
}
