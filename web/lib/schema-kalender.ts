/**
 * Terminens tid ur läsårskalendern (05.2-SM-ELEVER-KALENDER, E4): skoldagar per veckodag för skolan och för varje klass,
 * med klassens och årskursens egna dagar utan undervisning borträknade. Utan kalender eller utan skoldagar gäller förvalet.
 */
import type { LasarReadReply } from './lasar-contract.ts';
import { lasarSchoolYear } from './lasar-contract.ts';
import { groupsFromRefs, klassGroupId } from './lasar-groups.ts';
import { groupYearDays, weekday, yearDays, type GroupDay } from './lasar-model.ts';
import type { SchemaTerm, SchemaTime } from './schema-contract.ts';
import { defaultSchemaTime } from './schema-underlag.ts';

export function schemaTime(read: LasarReadReply | null, term: SchemaTerm, classIds: string[]): SchemaTime {
  const sy = read ? lasarSchoolYear(read) : null;
  if (!read?.calendar || !sy) return defaultSchemaTime(term);
  const count = (days: GroupDay[]) => [0, 1, 2, 3, 4].map(w => days.filter(d => d.part === term && d.status === 'skoldag' && !d.off && weekday(d.date) === w).length);
  const perWeekday = count(yearDays(sy));
  if (perWeekday.every(n => n === 0)) return defaultSchemaTime(term);
  const groups = groupsFromRefs(read.groups), classes: Record<string, number[]> = {};
  for (const classId of classIds) {
    const group = groups.find(g => g.id === klassGroupId(classId));
    if (group) classes[classId] = count(groupYearDays(sy, group, groups));
  }
  const c = read.calendar;
  return { source: 'kalender', version: c.version, status: c.status, current: read.versions.some(v => v.current && v.versionId === c.versionId),
    term: { ...c.terms[term] }, perWeekday, classes };
}
