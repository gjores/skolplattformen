import type { TjanstNeedSharing, TjanstPlanRead, TjanstRow } from './tjanst-contract.ts';
import { jointHasMixedTeachers, needTeachers, sharedNeedState } from './tjanst-model.ts';

export type BlockerTarget =
  | { kind: 'row'; rowId: string; sourceKey: string; label: string }
  | { kind: 'sharing'; sourceKey: string; label: string }
  | { kind: 'joint'; jointId: string; label: string }
  | { kind: 'allocation'; label: string }
  | { kind: 'teachers'; label: string }
  | { kind: 'review'; label: string }
  | { kind: 'elective_blocks'; label: string };
export type BlockerActions = { targets: BlockerTarget[]; guidance: string };

const review = (): BlockerTarget => ({ kind: 'review', label: 'Samlad granskning' });
const fallback = 'Meddelandet pekar inte ut en viss rad. Hämta aktuellt läge och granska fördelningen.';
const targetKey = (target: BlockerTarget): string => target.kind === 'row' ? `row:${target.rowId}`
  : target.kind === 'sharing' ? `sharing:${target.sourceKey}` : target.kind === 'joint' ? `joint:${target.jointId}` : target.kind;

/** Navigation for a server-reported blocker, never an alternative publish validator.
 * Labels are display text. Identity always comes from rowId/sourceKey/jointId.
 * Membership and sharing predicates follow 20261028100000_tjanst_need_sharing.sql.
 */
export function blockerActions(data: TjanstPlanRead, code: string): BlockerActions {
  if (!data.blockers.some(blocker => blocker.code === code)) return { targets: [], guidance: '' };
  if (code === 'organization_pending' || code === 'group_sources_changed') return { targets: [{ kind: 'elective_blocks', label: 'Valbara block' }], guidance: code === 'organization_pending' ? 'Organisera återstående timplansutrymmen i undervisningsgrupper och tillämpa dem.' : 'Granska timplansunderlaget för blockets grupper och tillämpa den aktuella organisationen.' };
  const needs = new Map(data.classes.flatMap(cls => cls.needs.map(need => [need.sourceKey, { cls, need }] as const)));
  const rowsBySource = new Map<string, TjanstRow[]>(), rowsByJoint = new Map<string, TjanstRow[]>();
  for (const row of data.rows) {
    const sourceRows = rowsBySource.get(row.sourceKey);
    if (sourceRows) sourceRows.push(row); else rowsBySource.set(row.sourceKey, [row]);
    if (row.jointGroupId !== null) {
      const members = rowsByJoint.get(row.jointGroupId);
      if (members) members.push(row); else rowsByJoint.set(row.jointGroupId, [row]);
    }
  }
  const sharingBySource = new Map<string, TjanstNeedSharing>();
  for (const sharing of data.sharing ?? []) if (!sharingBySource.has(sharing.sourceKey)) sharingBySource.set(sharing.sourceKey, sharing);
  const targets: BlockerTarget[] = [];
  let unresolved = false;
  const sourceLabel = (sourceKey: string) => {
    const source = needs.get(sourceKey);
    const group = data.groups?.find(group => group.sourceKey === sourceKey);
    return source ? `${source.need.label} · ${source.cls.name}` : group ? `${group.label} · ${group.name}` : null;
  };
  const addSharing = (sourceKey: string) => {
    const label = sourceLabel(sourceKey);
    if (label) targets.push({ kind: 'sharing', sourceKey, label });
    else unresolved = true;
  };
  let guidance: string;
  switch (code) {
    case 'empty_draft':
      targets.push({ kind: 'allocation', label: 'Ofördelade behov' });
      guidance = 'Fördela undervisning på minst en tjänsterad före publicering.';
      break;
    case 'stale_rows':
      for (const row of data.rows.filter(value => value.stale)) {
        if (row.sourceKind === 'teaching_group' && data.groups?.some(group => group.sourceKey === row.sourceKey)) { targets.push({ kind: 'elective_blocks', label: 'Valbara block' }); continue; }
        const source = needs.get(row.sourceKey);
        if (!source || source.cls.classId !== row.classId || row.jointGroupId !== null) { unresolved = true; continue; }
        const person = row.personId === null ? 'Vakant' : data.teachers.find(teacher => teacher.personId === row.personId)?.displayName ?? 'Tilldelning';
        targets.push({ kind: 'row', rowId: row.id, sourceKey: row.sourceKey, label: `${person} · ${source.need.label} · ${source.cls.name}` });
      }
      guidance = 'Granska de berörda raderna mot aktuellt timplansunderlag. Inget underlag eller någon tilldelning ändras när du öppnar raden.';
      break;
    case 'shared_need_unspecified':
      for (const [sourceKey, rows] of rowsBySource) {
        const sharing = sharingBySource.get(sourceKey);
        if (sharedNeedState(sourceKey, rows, sharing ? [sharing] : []) === 'unspecified') addSharing(sourceKey);
      }
      guidance = 'Ange om lärarna undervisar en i taget eller samtidigt och vilka som sätter betyg för varje berört behov.';
      break;
    case 'grader_missing':
      for (const sharing of data.sharing ?? []) {
        const people = needTeachers(sharing.sourceKey, rowsBySource.get(sharing.sourceKey) ?? []);
        if (people.length > 1 && !sharing.graderPersonIds.some(personId => people.includes(personId))) addSharing(sharing.sourceKey);
      }
      guidance = 'Välj betygssättare bland de lärare som har en egen tilldelning på det berörda behovet.';
      break;
    case 'joint_invalid':
    case 'joint_mixed_teachers':
      for (const joint of data.joints) {
        const members = rowsByJoint.get(joint.id) ?? [];
        const invalid = new Set(members.map(row => row.classId)).size < 2
          || joint.teachers.some(teacher => !members.some(row => row.personId === teacher.personId));
        if (code === 'joint_invalid' ? invalid : jointHasMixedTeachers(joint, members)) {
          targets.push({ kind: 'joint', jointId: joint.id, label: `Samläsning: ${joint.name}` });
        }
      }
      guidance = 'Granska samläsningens klasser, medlemsrader och lärare. Ändra eller lös upp gruppen där det behövs; inga ändringar görs automatiskt.';
      break;
    case 'person_not_at_school':
      targets.push({ kind: 'teachers', label: 'Lärare i fördelningen' });
      guidance = 'Hindret anger inte vilken lärare det gäller. Granska lärarna och deras giltiga skoluppdrag för läsåret. Andel eller markeringen Ny lärare visar inte vem som saknar uppdrag.';
      break;
    default:
      return { targets: [review()], guidance: fallback };
  }
  if (!targets.length || unresolved) targets.push(review());
  if (unresolved || targets.length === 1 && targets[0].kind === 'review') guidance += ` ${fallback}`;

  const unique = [...new Map(targets.map(target => [targetKey(target), target])).values()];
  // Homonyms remain separate targets. Ordinals distinguish equal display labels without exposing IDs.
  const labels = new Map<string, number>();
  for (const target of unique) labels.set(target.label, (labels.get(target.label) ?? 0) + 1);
  const occurrences = new Map<string, number>();
  return { targets: unique.map(target => {
    if (labels.get(target.label)! < 2) return target;
    const n = (occurrences.get(target.label) ?? 0) + 1; occurrences.set(target.label, n);
    return { ...target, label: `${target.label} · alternativ ${n}` };
  }), guidance };
}
