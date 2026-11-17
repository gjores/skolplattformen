/**
 * Aktivitet per klass som serie (05.2-SM-UXF-52, designvyn AktivitetFlera). En per klass skapar en egen aktivitet för varje vald klass,
 * med samma typ, längd, veckor och tid. Aktiviteterna hålls ihop med samma `serie` så att hela serien kan tas bort, men varje rad är en egen
 * aktivitet med egen identitet och kan ändras för sig. Ansvarig väljs per klass; utan val står raden som Saknar ansvarig.
 */
import { AKTIVITET_LIMIT, nyAktivitetId, type SchemaAktivitet } from './schema-aktiviteter.ts';

export type SerieRad = { classRef: string; klass: string; teacherRef: string | null };
export const SERIE_ID = /^serie-[1-9]\d{0,4}$/u;
export const nySerieId = (activities: SchemaAktivitet[]) => `serie-${Math.max(0, ...activities.flatMap(a => a.serie ? [Number(a.serie.slice(6))] : [])) + 1}`;

/** Aktiviteterna som serien skulle skapa, i klassernas ordning. Namnet får klassens namn efter sig. */
export function serieAktiviteter(mall: SchemaAktivitet, rader: SerieRad[], activities: SchemaAktivitet[]): SchemaAktivitet[] {
  const serie = nySerieId(activities), result: SchemaAktivitet[] = [];
  for (const r of rader) {
    const id = nyAktivitetId([...activities, ...result]);
    result.push({ ...mall, id, serie, name: `${mall.name} ${r.klass}`.slice(0, 120), classRefs: [r.classRef], groupRefs: [], teacherRefs: r.teacherRef ? [r.teacherRef] : [] });
  }
  return result;
}
/** Krockar och gränser i serien före sparning, i klartext. Bara fast tid kan krocka säkert före beräkning; motorn placerar övriga. */
export function serieKontroll(nya: SchemaAktivitet[], rader: SerieRad[], activities: SchemaAktivitet[], larare: Map<string, string>): { fel: string | null; krockar: Record<string, string> } {
  const krockar: Record<string, string> = {};
  if (activities.length + nya.length > AKTIVITET_LIMIT) return { fel: `Serien ger ${nya.length} aktiviteter. Skolan har ${activities.length} av högst ${AKTIVITET_LIMIT}.`, krockar };
  if (nya.length < 2) return { fel: 'Välj minst två klasser för en per klass.', krockar };
  const fast = nya[0].tid.typ === 'fast';
  for (const r of rader) if (r.teacherRef) {
    const andra = rader.filter(x => x !== r && x.teacherRef === r.teacherRef);
    if (fast && andra.length) krockar[r.classRef] = `${larare.get(r.teacherRef) ?? 'Läraren'} är ansvarig för ${[r, ...andra].map(x => x.klass).join(' och ')} på samma tid.`;
  }
  return { fel: null, krockar };
}
