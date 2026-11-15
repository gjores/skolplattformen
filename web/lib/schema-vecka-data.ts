/** Säker klientkalender: appens klass-ID ersätts med samma löpnummer som förslagets pass. Inga namn eller elev-ID tillkommer. */
import type { SchemaDatedCalendar, SchemaTime } from './schema-contract.ts';

export function schemaDatedCalendar(time: SchemaTime, classIds: string[], groups: { id: string; classIds: string[] }[] = []): SchemaDatedCalendar | null {
  if (time.source !== 'kalender' || !time.dates?.length) return null;
  const ids = new Map(classIds.map((id, i) => [id, `grupp-${i + 1}`]));
  const days = time.dates.map(d => ({ ...d, classes: Object.fromEntries([
    ...Object.entries(d.classes).flatMap(([id, value]) => { const client = ids.get(id); return client ? [[client, value]] : []; }),
    // Samma princip som undervisningens veckotid: samtliga klasser som faktiskt ingår ska ha undervisning den dagen.
    ...groups.flatMap(g => { const off = g.classIds.map(id => d.classes[id]).find(x => x && !x.schoolDay); return off ? [[g.id, off]] : []; }),
  ]) }));
  return { start: days[0].date, end: days.at(-1)!.date, days };
}
