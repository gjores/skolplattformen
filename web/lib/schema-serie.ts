/**
 * Aktivitet per klass som serie (05.2-SM-UXF-52, designvyn AktivitetFlera). En per klass skapar en egen aktivitet för varje vald klass,
 * med samma typ, längd och veckor. Aktiviteterna hålls ihop med samma `serie` så att hela serien kan tas bort, men varje rad är en egen
 * aktivitet med egen identitet och kan ändras för sig. Ansvarig väljs per klass; utan val står raden som Saknar ansvarig.
 */
import { AKTIVITET_LIMIT, nyAktivitetId, type SchemaAktivitet } from './schema-aktiviteter.ts';

export type SerieRad = { classRef: string; klass: string; teacherRef: string | null };
export const SERIE_ID = /^serie-[1-9]\d{0,4}$/u;
export const nySerieId = (activities: SchemaAktivitet[]) => `serie-${Math.max(0, ...activities.flatMap(a => a.serie ? [Number(a.serie.slice(6))] : [])) + 1}`;

/** Aktiviteterna som serien skulle skapa, i klassernas ordning. Namnet får klassens namn efter sig. */
export function serieAktiviteter(mall: SchemaAktivitet, rader: SerieRad[], activities: SchemaAktivitet[], mellanrumMin?: number): SchemaAktivitet[] {
  const serie = nySerieId(activities), result: SchemaAktivitet[] = [];
  for (const r of rader) {
    const id = nyAktivitetId([...activities, ...result]);
    const tid = mall.tid.typ === 'fast' && mellanrumMin !== undefined
      ? { ...mall.tid, startMin: mall.tid.startMin + result.length * (mall.durationMin + mellanrumMin) }
      : mall.tid;
    result.push({ ...mall, id, serie, tid, name: `${mall.name} ${r.klass}`.slice(0, 120), classRefs: [r.classRef], groupRefs: [], teacherRefs: r.teacherRef ? [r.teacherRef] : [] });
  }
  return result;
}
/** Krockar och gränser i serien före sparning, i klartext. Bara fast tid kan krocka säkert före beräkning; motorn placerar övriga. */
export function serieKontroll(nya: SchemaAktivitet[], rader: SerieRad[], activities: SchemaAktivitet[], larare: Map<string, string>, rastMin = 0): { fel: string | null; krockar: Record<string, string> } {
  const krockar: Record<string, string> = {};
  if (activities.length + nya.length > AKTIVITET_LIMIT) return { fel: `Serien ger ${nya.length} aktiviteter. Skolan har ${activities.length} av högst ${AKTIVITET_LIMIT}.`, krockar };
  if (nya.length < 2) return { fel: 'Välj minst två klasser för en per klass.', krockar };
  for (const [i, r] of rader.entries()) {
    const a = nya[i], messages = [];
    const ansvariga = rader.filter((x, j) => j !== i && r.teacherRef && x.teacherRef === r.teacherRef && krockarITid(a, nya[j], 'larare', rastMin));
    if (r.teacherRef && ansvariga.length) messages.push(`${larare.get(r.teacherRef) ?? 'Läraren'} är ansvarig för ${[r, ...ansvariga].map(x => x.klass).join(' och ')} på överlappande tider eller med för kort mellanrum.`);
    const sal = a.rooms[0];
    const salKrockar = sal ? rader.filter((_, j) => j !== i && nya[j].rooms.includes(sal) && krockarITid(a, nya[j], 'sal', 0)) : [];
    if (salKrockar.length) messages.push(`${sal} har överlappande bokningar för ${[r, ...salKrockar].map(x => x.klass).join(' och ')}.`);
    if (messages.length) krockar[r.classRef] = messages.join(' ');
  }
  return { fel: null, krockar };
}

function krockarITid(a: SchemaAktivitet, b: SchemaAktivitet, resurs: 'larare' | 'sal', rastMin: number): boolean {
  if (a.tid.typ !== 'fast' || b.tid.typ !== 'fast' || a.tid.day !== b.tid.day) return false;
  const aMargin = a.margin?.occupies.includes(resurs) ? a.margin : null;
  const bMargin = b.margin?.occupies.includes(resurs) ? b.margin : null;
  // Motorn kräver rast och hindrar en marginal från att nå in i det andra passet.
  const efterA = Math.max(rastMin, aMargin?.afterMin ?? 0, bMargin?.beforeMin ?? 0);
  const efterB = Math.max(rastMin, bMargin?.afterMin ?? 0, aMargin?.beforeMin ?? 0);
  return a.tid.startMin < b.tid.startMin + b.durationMin + efterB && b.tid.startMin < a.tid.startMin + a.durationMin + efterA;
}
