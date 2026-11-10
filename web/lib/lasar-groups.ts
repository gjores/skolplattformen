// Elevgrupper med stabila ID:n för skyddad drift (LASAR-04). Grupp-ID byggs
// bara ur utbildningens och klassens UUID:n och timplanens kolumn, aldrig ur
// klassnamn eller programprefix; namnet är bara en etikett. Demons
// studentGroups i lasar-model.ts används inte här och ändras inte.
//
// SS 12000 (OpenAPI 2.1.0, SS12000:2020): classId motsvarar Group.id med
// groupType=Klass. offeringId är en lokal studieväg per elevkull och inte 1:1
// med Programme. En årskursgrupp (utbildning + kolumn) saknar gruppobjekt i
// standarden och kan vid utbyte bara uttryckas som elevernas årskurs
// (Enrolment.schoolYear).
import type { StudentGroup } from './lasar-model.ts';

type GroupKind = StudentGroup['kind'];
export type LasarGroupRef =
  | { scope: 'arskurs'; offeringId: string; columnId: string; label: string; educationName: string; kind: GroupKind }
  | { scope: 'klass'; classId: string; offeringId: string; columnId: string | null; label: string; educationName: string; kind: GroupKind };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Samma kolumner som tjanst_rows.link_column. */
const COLUMN = /^(ar[1-3]|ak[1-9]|vecka)$/;

function stable(value: string, what: string): string {
  if (!UUID.test(value)) throw new Error(`${what} är inte ett stabilt ID.`);
  return value;
}
function column(value: string, what: string): string {
  if (!COLUMN.test(value)) throw new Error(`${what} har en okänd kolumn.`);
  return value;
}
export const arskursGroupId = (offeringId: string, columnId: string) => `arskurs:${stable(offeringId, 'Utbildningen')}:${column(columnId, 'Årskursen')}`;
export const klassGroupId = (classId: string) => `klass:${stable(classId, 'Klassen')}`;

/** Bygger elevgrupper ur referenser: först årskurserna, sedan klasserna, i given ordning. */
export function groupsFromRefs(refs: LasarGroupRef[]): StudentGroup[] {
  const groups: StudentGroup[] = [];
  const ids = new Set<string>();
  const push = (g: StudentGroup) => {
    if (ids.has(g.id)) throw new Error(`Gruppen ${g.id} finns två gånger.`);
    ids.add(g.id);
    groups.push(g);
  };
  for (const r of refs)
    if (r.scope === 'arskurs')
      push({ id: arskursGroupId(r.offeringId, r.columnId), name: r.label, scope: 'årskurs', kind: r.kind, educationId: r.offeringId, educationName: r.educationName, columnId: r.columnId });
  for (const r of refs) {
    if (r.scope !== 'klass') continue;
    const id = klassGroupId(r.classId);
    stable(r.offeringId, 'Klassens utbildning');
    const parent = r.columnId === null ? undefined : arskursGroupId(r.offeringId, r.columnId);
    // Klassen ärver årskursens avvikelser bara när årskursgruppen finns.
    const known = parent && ids.has(parent) ? r.columnId! : undefined;
    push({
      id,
      name: r.label,
      scope: 'klass',
      kind: r.kind,
      educationId: r.offeringId,
      educationName: r.educationName,
      columnId: known,
      parentId: known ? parent : undefined,
    });
  }
  return groups;
}
