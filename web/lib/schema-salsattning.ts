/**
 * Tilldela salar och behåll tiderna (05.2-SM-UXF-41, antagande A11). Pass som har tid och ska ha sal men saknar en tillåten sal får en ledig
 * tillåten sal. Detsamma gäller pass vars sal kontrollen har underkänt (`krockar`): kontrollen fyller annars i första tillåtna sal även när den är upptagen.
 * Ingen dag, starttid eller längd ändras, och låsta pass och pass med datumändring rörs inte. De mest begränsade passen väljs först,
 * och bland lediga salar väljs den som minst många andra pass behöver. Resultatet är ett förslag: motorns kontroll prövar det innan det används.
 */
import type { SchemaForslagLesson, SchemaPlacement, SchemaRegel } from './schema-contract.ts';

type Pass = Pick<SchemaForslagLesson, 'id' | 'title' | 'day' | 'startMin' | 'durationMin' | 'roomIds' | 'roomId' | 'marginMin' | 'marginBeforeMin' | 'term' | 'ansvarig'>;
export type SalTilldelning = { lesson: string; title: string; day: number; startMin: number; fran: string | null; till: string };
export type SalHinder = { lesson: string; title: string; day: number; startMin: number; text: string };
export type Salsattning = { tilldelade: SalTilldelning[]; hinder: SalHinder[];
  /** Pass som inte rördes, och varför. */ ororda: { medSal: number; lasta: number; datum: number; utanTid: number; utanSalbehov: number } };
export type SalsattningVal = { rooms: { id: string; name: string }[]; egna: SchemaRegel[]; lasta: Set<string>; datum: Set<string>; /** Pass vars nuvarande sal kontrollen har underkänt. */ krockar?: Set<string> };
/** Kontrollens koder för en sal som krockar, är stängd, saknas eller inte uppfyller kravet. */
export const SALFEL = ['room_clash', 'room_unavailable', 'room_unfit', 'room_count', 'room_unwanted', 'unknown_room', 'activity_room_missing'] as const;

const DAGAR = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const kl = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nummer = (id: string) => Number(/\d+$/u.exec(id)?.[0] ?? 0);

export function tilldelaSalar(lessons: Pass[], { rooms, egna, lasta, datum, krockar = new Set() }: SalsattningVal): Salsattning {
  const namn = new Map(rooms.map(r => [r.id, r.name])), result: Salsattning = { tilldelade: [], hinder: [], ororda: { medSal: 0, lasta: 0, datum: 0, utanTid: 0, utanSalbehov: 0 } };
  // Salens upptagna tid, med passets största marginal åt båda håll. Det är försiktigt: en sal kan räknas som upptagen fast kontrollen hade godtagit den, aldrig tvärtom.
  const span = (l: Pass) => [l.startMin! - l.marginBeforeMin, l.startMin! + l.durationMin + l.marginMin] as const;
  const mots = (a: Pass, b: Pass) => a.day === b.day && (a.term === null || b.term === null || a.term === b.term) && span(a)[0] < span(b)[1] && span(b)[0] < span(a)[1];
  const upptar = new Map<string, Pass[]>(rooms.map(r => [r.id, []]));
  const behover = (l: Pass) => l.roomId === null || !l.roomIds.includes(l.roomId) || krockar.has(l.id);
  const kandidater: Pass[] = [];
  for (const l of lessons) {
    if (l.roomIds.length === 0) { result.ororda.utanSalbehov++; continue; }
    if (l.day === null || l.startMin === null) { result.ororda.utanTid++; continue; }
    if (!behover(l)) { result.ororda.medSal++; upptar.get(l.roomId!)?.push(l); continue; }
    // Ett låst pass eller ett pass med datumändring ändras aldrig här, inte heller dess sal.
    if (lasta.has(l.id)) { result.ororda.lasta++; if (l.roomId) upptar.get(l.roomId)?.push(l); continue; }
    if (datum.has(l.id)) { result.ororda.datum++; if (l.roomId) upptar.get(l.roomId)?.push(l); continue; }
    kandidater.push(l);
  }
  // Salens egna villkor: spärrad tid stänger, och finns tillåten tid måste passet ligga helt i ett tillåtet fönster.
  const stangd = (room: string, l: Pass) => {
    const regler = egna.filter(r => r.slag === 'sal' && r.ref === namn.get(room) && (r.typ === 'sparrad' || r.typ === 'tillaten')) as Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>[];
    const a = l.startMin!, b = l.startMin! + l.durationMin, dag = regler.filter(r => r.days.includes(l.day!));
    if (dag.some(r => r.typ === 'sparrad' && a < r.endMin && r.startMin < b)) return true;
    const tillatna = regler.filter(r => r.typ === 'tillaten');
    return tillatna.length > 0 && !tillatna.some(r => r.days.includes(l.day!) && r.startMin <= a && b <= r.endMin);
  };
  const efterfragan = new Map<string, number>();
  for (const l of kandidater) for (const r of l.roomIds) efterfragan.set(r, (efterfragan.get(r) ?? 0) + 1);
  kandidater.sort((a, b) => a.roomIds.length - b.roomIds.length || a.day! - b.day! || a.startMin! - b.startMin! || nummer(a.id) - nummer(b.id));
  for (const l of kandidater) {
    const lediga = l.roomIds.filter(r => upptar.has(r) && !stangd(r, l) && !upptar.get(r)!.some(o => mots(o, l)));
    for (const r of l.roomIds) efterfragan.set(r, (efterfragan.get(r) ?? 1) - 1);
    if (!lediga.length) {
      const skal = l.roomIds.map(r => { const av = (upptar.get(r) ?? []).filter(o => mots(o, l));
        return `${namn.get(r) ?? r} (${!upptar.has(r) ? 'finns inte längre' : stangd(r, l) ? 'spärrad eller utanför salens tillåtna tid' : `upptagen av ${[...new Set(av.map(o => o.title))].join(', ')}`})`; });
      result.hinder.push({ lesson: l.id, title: l.title, day: l.day!, startMin: l.startMin!, text: `Ingen tillåten sal är ledig ${DAGAR[l.day!]} ${kl(l.startMin!)}: ${skal.join('; ')}.` });
      continue;
    }
    const till = lediga.reduce((best, r) => (efterfragan.get(r) ?? 0) < (efterfragan.get(best) ?? 0) ? r : best);
    upptar.get(till)!.push(l);
    result.tilldelade.push({ lesson: l.id, title: l.title, day: l.day!, startMin: l.startMin!, fran: l.roomId, till });
  }
  result.tilldelade.sort((a, b) => a.day - b.day || a.startMin - b.startMin || nummer(a.lesson) - nummer(b.lesson));
  return result;
}
/** Alla lagda pass med de föreslagna salarna. Dag och starttid kommer oförändrade från passen. */
export function salsattningPlaceringar(lessons: Pass[], tilldelade: Pick<SalTilldelning, 'lesson' | 'till'>[]): SchemaPlacement[] {
  const ny = new Map(tilldelade.map(t => [t.lesson, t.till]));
  return lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: ny.get(l.id) ?? l.roomId, ...(l.ansvarig && { ansvarig: l.ansvarig }) }]);
}
