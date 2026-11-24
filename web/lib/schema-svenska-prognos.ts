import type { TjanstTeachingGroup } from './tjanst-contract.ts';

/** Anonyma krockresurser för grupporganisation där de faktiska deltagarna ännu inte är kända. */
export function schemaSvenskaPrognosKluster(groups: TjanstTeachingGroup[], classIds: ReadonlySet<string>) {
  const svenskaPerKlass = new Map<string, TjanstTeachingGroup[]>();
  for (const group of groups) {
    if (!group.svenska || group.stale) continue;
    for (const classId of group.classIds) {
      if (!classIds.has(classId)) continue;
      const branches = svenskaPerKlass.get(classId) ?? [];
      branches.push(group);
      svenskaPerKlass.set(classId, branches);
    }
  }

  const clusters: { classId: string; groupIds: string[] }[] = [];
  const prognos = (group: TjanstTeachingGroup) => group.svenska?.forecast != null;
  for (const [classId, groups] of svenskaPerKlass) {
    for (const group of groups) {
      if (prognos(group)) clusters.push({ classId, groupIds: [group.groupId] });
    }
    // Olika nivåer kan ha samma elever. Samma nivå i samma klass är den planerade alternativa uppdelningen.
    for (const [index, first] of groups.entries()) {
      for (const second of groups.slice(index + 1)) {
        if ((prognos(first) || prognos(second)) && first.levelCode?.slice(4) !== second.levelCode?.slice(4)) {
          clusters.push({ classId, groupIds: [first.groupId, second.groupId] });
        }
      }
    }
  }
  return clusters;
}
