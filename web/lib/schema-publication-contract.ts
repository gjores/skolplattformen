import { SCHEMA_DRAFT_VERSION, parseSchemaDraftScope, SchemaDraftError } from './schema-draft-contract.ts';
import type { SchemaPeriod } from './schema-contract.ts';

export type SchemaPublicationScope = { unitId: string; schoolYear: number; period: SchemaPeriod };
export type SchemaPublication = SchemaPublicationScope & {
  id: string;
  draftId: string;
  revision: number;
  contentHash: string;
  publishedAt: string;
};
export type SchemaPublicationRequest =
  | (SchemaPublicationScope & { action: 'status' })
  | (SchemaPublicationScope & { action: 'publish'; draftId: string; revision: number; contentHash: string; commandId: string });
export type SchemaPublicationReply = { publication: SchemaPublication | null };
export type SchemaPublicationTrack = {
  kind: 'class' | 'group';
  targetId: string;
  subjectCode: string;
  subjectVersion: number;
  itemCode: string;
  languageCode: string | null;
  term: 'ht' | 'vt';
  days: string[];
};

function invalid(): never { throw new SchemaDraftError(); }
function shape(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || !fields.every(field => Object.hasOwn(row, field))) invalid();
  return row;
}
function uuid(value: unknown): string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value) ? value : invalid();
}
function revision(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value < 2147483647 ? value : invalid();
}
function hash(value: unknown): string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value) ? value : invalid();
}
function scope(row: Record<string, unknown>): SchemaPublicationScope {
  const { unitId, schoolYear, period } = parseSchemaDraftScope({
    contractVersion: SCHEMA_DRAFT_VERSION, unitId: row.unitId, schoolYear: row.schoolYear, period: row.period,
  });
  return { unitId, schoolYear, period };
}
const scopeFields = ['unitId', 'schoolYear', 'period'] as const;

export function parseSchemaPublicationRequest(value: unknown): SchemaPublicationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const action = (value as Record<string, unknown>).action;
  if (action === 'status') return { action, ...scope(shape(value, ['action', ...scopeFields])) };
  if (action !== 'publish') invalid();
  const row = shape(value, ['action', ...scopeFields, 'draftId', 'revision', 'contentHash', 'commandId']);
  return { action, ...scope(row), draftId: uuid(row.draftId), revision: revision(row.revision), contentHash: hash(row.contentHash), commandId: uuid(row.commandId) };
}

export function parseSchemaPublicationReply(value: unknown, expected: SchemaPublicationScope | SchemaPublicationRequest): SchemaPublicationReply {
  const { publication } = shape(value, ['publication']);
  if (publication === null) return { publication };
  const row = shape(publication, [...scopeFields, 'id', 'draftId', 'revision', 'contentHash', 'publishedAt']);
  const publishedAt = row.publishedAt;
  if (typeof publishedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(publishedAt)
    || !Number.isFinite(Date.parse(publishedAt)) || new Date(publishedAt).toISOString() !== publishedAt) invalid();
  const result = { ...scope(row), id: uuid(row.id), draftId: uuid(row.draftId), revision: revision(row.revision), contentHash: hash(row.contentHash), publishedAt };
  if (result.unitId !== expected.unitId || result.schoolYear !== expected.schoolYear || result.period !== expected.period) invalid();
  if ('action' in expected && expected.action === 'publish'
    && (result.draftId !== expected.draftId || result.revision !== expected.revision || result.contentHash !== expected.contentHash)) invalid();
  return { publication: result };
}
