/**
 * Läsårets tid per termin ur läsårskalendern (05.2-SM-ELEVER-KALENDER, E4): skoldagar per veckodag för skolan och för varje klass,
 * med klassens och årskursens egna dagar utan undervisning borträknade. Utan kalender eller utan skoldagar gäller förvalet.
 */
import type { LasarReadReply } from './lasar-contract.ts';
import { lasarSchoolYear } from './lasar-contract.ts';
import { groupsFromRefs, klassGroupId } from './lasar-groups.ts';
import { groupYearDays, isoWeek, monday, weekday, yearDays, type GroupDay } from './lasar-model.ts';
import { SCHEMA_TERMS, type SchemaTerm, type SchemaTime } from './schema-contract.ts';
import { defaultSchemaTime } from './schema-underlag.ts';

export function schemaTime(read: LasarReadReply | null, classIds: string[]): SchemaTime {
  const sy = read ? lasarSchoolYear(read) : null;
  if (!read?.calendar || !sy) return defaultSchemaTime();
  const count = (days: GroupDay[], term: SchemaTerm) => [0, 1, 2, 3, 4].map(w => days.filter(d => d.part === term && d.status === 'skoldag' && !d.off && weekday(d.date) === w).length);
  const school = yearDays(sy), groups = groupsFromRefs(read.groups), c = read.calendar;
  if (SCHEMA_TERMS.every(term => count(school, term).every(n => n === 0))) return defaultSchemaTime();
  const own = classIds.flatMap(classId => { const group = groups.find(g => g.id === klassGroupId(classId)); return group ? [{ classId, days: groupYearDays(sy, group, groups) }] : []; });
  // Skoldagar per vecka och veckodag (05.2-SM-TIMPLAN-VECKA, W1): veckan heter efter sin måndag.
  const perWeek = (days: GroupDay[], t: SchemaTerm) => {
    const by = new Map<string, number[]>();
    for (const d of days) {
      const w = weekday(d.date);
      if (d.part !== t || d.status !== 'skoldag' || d.off || w > 4) continue;
      const key = monday(d.date), row = by.get(key) ?? [0, 0, 0, 0, 0];
      row[w] += 1;
      by.set(key, row);
    }
    return by;
  };
  const weeks = (t: SchemaTerm) => {
    const all = perWeek(school, t), mine = own.map(x => [x.classId, perWeek(x.days, t)] as const);
    return [...new Set([...all.keys(), ...mine.flatMap(([, m]) => [...m.keys()])])].sort().map(key => ({ monday: key, label: `v. ${isoWeek(key).week}`,
      perWeekday: all.get(key) ?? [0, 0, 0, 0, 0], classes: Object.fromEntries(mine.map(([id, m]) => [id, m.get(key) ?? [0, 0, 0, 0, 0]])) }));
  };
  const term = (t: SchemaTerm) => ({ span: { ...c.terms[t] }, perWeekday: count(school, t), classes: Object.fromEntries(own.map(x => [x.classId, count(x.days, t)])), weeks: weeks(t) });
  return { source: 'kalender', version: c.version, status: c.status, current: read.versions.some(v => v.current && v.versionId === c.versionId), terms: { ht: term('ht'), vt: term('vt') } };
}
