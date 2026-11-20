/** Provplaneringen kan följa ett nytt förslag. Skrivningen har ett eget, revisionsbundet kvitto. */
import { SchemaContractError, parseSchemaForslag, type SchemaForslag, type SchemaForslagRequest } from './schema-contract.ts';
import { parseSchemaDraftSave, parseSchemaDraftScope, type SchemaDraftSave, type SchemaDraftScope } from './schema-draft-contract.ts';

type Provgrund = { provrevision: number; sourceHash: string; resultHash: string };
export type SchemaNyttProvPlanering = Provgrund & { draftId: string | null; expectedRevision: number; bookings: number; moveCount: number; replacedMinutes: number };
export type SchemaNyttProvSave = { save: SchemaDraftSave; prov: Provgrund };
export type SchemaNyttProvSaveReply = SchemaDraftScope & { draftId: string; commandId: string; revision: number };

const bad = (): never => { throw new SchemaContractError(); };
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : bad();
function keys(value: unknown, expected: string[]) {
  const r = object(value);
  return Object.keys(r).length === expected.length && expected.every(key => Object.hasOwn(r, key)) ? r : bad();
}
const int = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : bad();
const hash = (value: unknown) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value) ? value : bad();
const uuid = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value) ? value : bad();
const provKeys = ['provrevision', 'sourceHash', 'resultHash'];
function parseProv(r: Record<string, unknown>): Provgrund {
  return { provrevision: int(r.provrevision, 1, 2147483647), sourceHash: hash(r.sourceHash), resultHash: hash(r.resultHash) };
}

export function parseSchemaNyttProvForslag(value: unknown, expected: SchemaForslagRequest): { forslag: SchemaForslag; provplanering?: SchemaNyttProvPlanering } {
  const { provplanering, ...raw } = object(value);
  const forslag = parseSchemaForslag(raw, expected);
  if (provplanering === undefined) return { forslag };
  const p = keys(provplanering, [...provKeys, 'draftId', 'expectedRevision', 'bookings', 'moveCount', 'replacedMinutes']);
  const draftId = p.draftId === null ? null : uuid(p.draftId), expectedRevision = int(p.expectedRevision, 0, 2147483646);
  if ((draftId === null) !== (expectedRevision === 0)) return bad();
  return { forslag, provplanering: { ...parseProv(p), draftId, expectedRevision, bookings: int(p.bookings, 1, 200),
    moveCount: int(p.moveCount, 0, 20000), replacedMinutes: int(p.replacedMinutes, 0, 12000000) } };
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
