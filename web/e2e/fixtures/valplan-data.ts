// Syntetiska valplansdata; ingen verklig skola, elev eller databas.
import catalog from '../../lib/programplan-catalog.generated.json' with { type: 'json' };
export const id = (n: number) => `5a000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const unitId = id(1), schoolYear = 2027, catalogId = catalog.catalogId;
export const version = (code: string) => catalog.subjects.find(s => s.code === code && s.schoolTypes.includes('GY'))!.version;
const row = (n: number, planName: string, classes: { id: string; name: string }[], extra = {}) => ({ timplanId: id(10 + n), timplanVersion: 1, rowKey: 'block:iv1', year: 2 as const, rowKind: 'block' as const,
  blockKind: 'individualChoice' as const, points: 100, minutesHt: 2700, minutesVt: 2700, classIds: classes.map(c => c.id), allowedLevelKeys: null, blocks: [] as { valplanId: string; classIds: string[] }[],
  planName, rowLabel: 'Individuellt val', classes, ...extra });
export function read() {
  return { contractVersion: 'valplan_v1' as const, unitId, schoolYear, valplans: [] as { catalogId: string; valplan: unknown; choiceCounts: { classId: string; pupils: number }[] }[],
    rows: [row(1, 'SA26 – samhälle', [{ id: id(20), name: 'SA26A' }, { id: id(21), name: 'SA26B' }]), row(2, 'NA26', [{ id: id(22), name: 'NA26A' }]),
      row(3, 'EK26', [{ id: id(23), name: 'EK26A' }], { blocks: [{ valplanId: id(99), classIds: [id(23)] }] }), { ...row(4, 'SA26 – samhälle', [{ id: id(20), name: 'SA26A' }]), rowKey: 'block:mosp', blockKind: 'modernLanguage' as const, rowLabel: 'Moderna språk' }] };
}
export const otherValplan = { catalogId, choiceCounts: [] as { classId: string; pupils: number }[], valplan: { id: id(99), unitId, schoolYear, kind: 'individualChoice', name: 'IV för EK', revision: 1, courses: [], rows: [{ timplanId: id(13), timplanVersion: 1, rowKey: 'block:iv1', year: 2, excludedClassIds: [] as string[] }] } };
