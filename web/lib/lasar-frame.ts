// Jämförelse med huvudmannens ram (D-05, D-06). Gränssnitt; genomförandet kommer i nästa steg.
import type { Exception, ISODate, SchoolYear, Term } from './lasar-model.ts';

export type FrameYear = { versionId: string; version: number; terms: { ht: Term; vt: Term }; exceptions: Record<ISODate, Exception> };
export type FrameTermKey = 'term:ht:start' | 'term:ht:end' | 'term:vt:start' | 'term:vt:end';
export type FrameKey = FrameTermKey | `day:${ISODate}`;
export type FrameValue = ISODate | Exception | null;
export type FrameDeviation = { key: FrameKey; school: FrameValue; frame: FrameValue };
export type FrameChange = { key: FrameKey; base: FrameValue; theirs: FrameValue; ours: FrameValue };
export type FrameChanges = { apply: FrameChange[]; conflicts: FrameChange[]; own: FrameChange[] };

export function frameDeviation(_school: SchoolYear, _frame: FrameYear): FrameDeviation[] { return []; }
export function frameChanges(_base: FrameYear, _theirs: FrameYear, _ours: SchoolYear): FrameChanges { return { apply: [], conflicts: [], own: [] }; }
export function applyFrameChanges(ours: SchoolYear, _changes: FrameChanges, _accepted: string[]): SchoolYear { return ours; }
