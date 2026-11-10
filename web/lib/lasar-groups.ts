// Grupper med stabila ID:n (LASAR-04). Gränssnitt; genomförandet kommer i nästa steg.
import type { StudentGroup } from './lasar-model.ts';

type GroupKind = StudentGroup['kind'];
export type LasarGroupRef =
  | { scope: 'arskurs'; offeringId: string; columnId: string; label: string; educationName: string; kind: GroupKind }
  | { scope: 'klass'; classId: string; offeringId: string; columnId: string | null; label: string; educationName: string; kind: GroupKind };

export function groupsFromRefs(_refs: LasarGroupRef[]): StudentGroup[] { return []; }
