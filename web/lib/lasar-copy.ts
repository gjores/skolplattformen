// Kopiera förra läsåret (D-04). Gränssnitt; genomförandet kommer i nästa steg.
import type { ISODate, SchoolYear, ShortWeek, StudentGroup } from './lasar-model.ts';

export const COPY_REVIEW_REASONS = ['missing_week', 'easter', 'holiday', 'weekend', 'outside_terms', 'jullov', 'term_edge', 'group_offering_missing', 'group_class', 'short_week'] as const;
export type CopyReviewReason = typeof COPY_REVIEW_REASONS[number];
export type CopyReviewKind = 'lovdag' | 'studiedag' | 'termin' | 'gruppdag' | 'kort vecka';
export type TermEdgeKey = 'ht:start' | 'ht:end' | 'vt:start' | 'vt:end';
export type CopyReviewItem = {
  id: string;
  sourceDate: ISODate | null;
  kind: CopyReviewKind;
  note?: string;
  reason: CopyReviewReason;
  suggestedDate?: ISODate;
  targetDate?: ISODate;
  groupId?: string;
  edge?: TermEdgeKey;
  shortWeek?: ShortWeek;
};

export function copySchoolYear(source: SchoolYear, _targetStartYear: number, _targetGroups: StudentGroup[]): { draft: SchoolYear; review: CopyReviewItem[] } {
  return { draft: structuredClone(source), review: [] };
}
