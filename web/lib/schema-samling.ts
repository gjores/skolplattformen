/**
 * Samlingsvyn (05.2-SM-SAMLINGSVY, research I51, I54–I59): flera scheman samtidigt, rad för rad med gemensam tidsaxel (`design/Samlingsvy.dc.html`).
 *
 * Rena funktioner utan React. Raderna har samma form som i Följ passet (`FoljRad`), så att de två är lägen av samma vy: i Följ passet kommer
 * raderna från passet, här från det schemaläggaren väljer. Allt räknas ur förslaget med utkastets placeringar. Inget sparas på servern;
 * arbetsvyer (namngivna urval) ligger i webbläsaren per skolenhet. Elevrader finns bara för den som har fått elevlistan av servern och sparas aldrig.
 */
import type { SchemaForslag, SchemaForslagLesson, SchemaTerm, SchemaVillkor } from './schema-contract.ts';
import type { FoljRad, SchemaFoljElev } from './schema-folj.ts';
import { resursRefs } from './schema-utkast.ts';

export type SamlingSlag = 'klass' | 'grupp' | 'larare' | 'sal' | 'elev';
export const SAMLING_SLAG: Record<SamlingSlag, string> = { klass: 'Klasser', grupp: 'Grupper', larare: 'Lärare', sal: 'Salar', elev: 'Elever' };
/** En vald rad. `id` är förslagets löpnummer (`grupp-1`, `larare-3`, `sal-2`) eller, för en elev, elevens ID. `via` är passet elevens schema läses med. */
export type SamlingResurs = { slag: SamlingSlag; id: string; via?: string };
export type SamlingKandidat = SamlingResurs & { name: string };
export const samlingNyckel = (r: Pick<SamlingResurs, 'slag' | 'id'>) => `${r.slag}:${r.id}`;
type Underlag = Pick<SchemaForslag, 'lessons' | 'classes' | 'teachers' | 'rooms' | 'resurser'>;
export type SamlingTid = { day: number; startMin: number; endMin: number };
type Tid = SamlingTid;
type Span = [number, number];
const svensk = (a: string, b: string) => a.localeCompare(b, 'sv', { numeric: true });
const lagd = (l: SchemaForslagLesson) => l.day !== null && l.startMin !== null;
const span = (l: SchemaForslagLesson): Span => [l.startMin!, l.startMin! + l.durationMin];
function union(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0])) { const last = out.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
}
function minus(whole: Span, busy: Span[]): Span[] {
  const out: Span[] = [];
  let at = whole[0];
  for (const [a, b] of union(busy)) { if (b <= at || a >= whole[1]) continue; if (a > at) out.push([at, a]); at = Math.max(at, b); }
  if (at < whole[1]) out.push([at, whole[1]]);
  return out;
}

/** Det som går att lägga till ur förslaget: klasser, grupper (de som förslaget har som egen rad), lärare och salar. Elever kommer från servern. */
export function samlingKandidater(f: Underlag): SamlingKandidat[] {
  const refs = resursRefs(f);
  return [
    ...f.classes.map(c => ({ slag: refs.get(c.id)?.slag === 'grupp' ? 'grupp' as const : 'klass' as const, id: c.id, name: c.name })),
    ...f.teachers.map(t => ({ slag: 'larare' as const, id: t.id, name: t.name })),
    ...f.rooms.map(r => ({ slag: 'sal' as const, id: r.id, name: r.name })),
  ];
}

/** Filter som går att kombinera (I57): ämnen (något av dem) och termin. Årskurs, program och lärarlag finns inte i förslaget än. */
export type SamlingFilter = { amnen: string[]; termin: SchemaTerm | null };
export const tomtFilter = (): SamlingFilter => ({ amnen: [], termin: null });
/** Lagda pass som visas: terminen (filtrets, annars den veckan visar; pass som går hela perioden visas alltid) och ämnena. */
export function filtreraSamling(lessons: SchemaForslagLesson[], filter: SamlingFilter, term: SchemaTerm): SchemaForslagLesson[] {
  const t = filter.termin ?? term, amnen = new Set(filter.amnen);
  return lessons.filter(l => lagd(l) && (l.term === null || l.term === t) && (amnen.size === 0 || amnen.has(l.title)));
}

/** Passen en resurs har bland `lessons`. En elevs pass kommer från servern (Följ passet). */
export function resursPass(r: SamlingResurs, lessons: SchemaForslagLesson[], elever: Record<string, SchemaFoljElev> = {}): SchemaForslagLesson[] {
  if (r.slag === 'elev') { const ids = new Set(elever[r.id]?.lessons ?? []); return lessons.filter(l => ids.has(l.id)); }
  return lessons.filter(l => r.slag === 'larare' ? l.teacherIds.includes(r.id) : r.slag === 'sal' ? l.roomId === r.id : l.classIds.includes(r.id));
}

/**
 * Raderna för de valda resurserna, i vald ordning. `lessons` är passen som visas (se `filtreraSamling`). En resurs som inte finns i förslaget,
 * eller en elev vars schema inte är läst, ger ingen rad.
 */
export function samlingRader(f: Underlag, resurser: SamlingResurs[], lessons: SchemaForslagLesson[], elever: Record<string, SchemaFoljElev> = {}): FoljRad[] {
  const amnen = (own: SchemaForslagLesson[]) => [...new Set(own.map(l => l.title))].slice(0, 3).join(', ');
  return resurser.flatMap((r): FoljRad[] => {
    const own = resursPass(r, lessons, elever), key = samlingNyckel(r);
    if (r.slag === 'elev') {
      const e = elever[r.id];
      return e ? [{ key, slag: 'elev', name: e.name, detail: `elev · ${e.grupper.join(', ')}`, chip: `${e.name} (elev)`, lessons: own, fromGroup: new Set(e.fromGroup) }] : [];
    }
    const name = (r.slag === 'larare' ? f.teachers : r.slag === 'sal' ? f.rooms : f.classes).find(x => x.id === r.id)?.name;
    if (name === undefined) return [];
    const detail = r.slag === 'larare' ? `lärare${amnen(own) ? ` · ${amnen(own)}` : ''}` : r.slag;
    return [{ key, slag: r.slag, name, detail, chip: name, lessons: own }];
  });
}

/**
 * Gemensam ledig tid (I54): tider inom skoldagen då ingen av raderna har ett pass, minst `minMin` långa. Färre än två rader ger ingenting.
 * Marginaler räknas inte: de gäller ett pass och en part, inte raden.
 */
export function gemensamLedigTid(days: SchemaForslag['days'], rader: Pick<FoljRad, 'lessons'>[], minMin = 0): Tid[] {
  if (rader.length < 2) return [];
  return days.flatMap((d, day) => minus([d.startMin, d.endMin], rader.flatMap(r => r.lessons.filter(l => l.day === day).map(span)))
    .filter(([a, b]) => b - a >= Math.max(1, minMin)).map(([startMin, endMin]) => ({ day, startMin, endMin })));
}

/** Håltid (I56): luckor mellan två pass samma dag som är längre än rasten. */
export function haltider(lessons: SchemaForslagLesson[], breakMin: number): Tid[] {
  const out: Tid[] = [];
  for (const day of [...new Set(lessons.filter(lagd).map(l => l.day!))].sort((a, b) => a - b)) {
    const busy = union(lessons.filter(l => lagd(l) && l.day === day).map(span));
    for (let i = 1; i < busy.length; i++) if (busy[i][0] - busy[i - 1][1] > breakMin) out.push({ day, startMin: busy[i - 1][1], endMin: busy[i][0] });
  }
  return out;
}

export type Lunchtryck = Tid & { klasser: number;
  /** Elever i klasserna, när storlekarna är kända. Förslaget till webbläsaren bär inte klassernas storlek än. */
  elever: number | null };
/**
 * Lunchtryck (I56): hur många klasser som har lunchlucka per tid, ur förslaget. En klass har lunchlucka en tid när den har pass den dagen och tiden
 * ligger i en ledig lucka inom lunchfönstret som rymmer lunchen. Tider med samma antal slås ihop; tider utan någon klass tas inte med.
 */
export function lunchtryck(f: Pick<SchemaForslag, 'classes' | 'days'>, lessons: SchemaForslagLesson[], lunch: SchemaVillkor['lunch'], klasser: string[] = f.classes.map(c => c.id),
  storlek: Record<string, number> | null = null, stepMin = 10): Lunchtryck[] {
  if (!lunch) return [];
  const out: Lunchtryck[] = [];
  for (const [day, d] of f.days.entries()) {
    const window: Span = [Math.max(lunch.startMin, d.startMin), Math.min(lunch.endMin, d.endMin)];
    const luckor = klasser.flatMap(id => {
      const busy = lessons.filter(l => lagd(l) && l.day === day && l.classIds.includes(id)).map(span);
      return busy.length ? [{ id, free: minus(window, busy).filter(([a, b]) => b - a >= lunch.lengthMin) }] : [];
    });
    for (let t = window[0]; t + stepMin <= window[1]; t += stepMin) {
      const har = luckor.filter(k => k.free.some(([a, b]) => a <= t && t + stepMin <= b)).map(k => k.id);
      if (!har.length) continue;
      const elever = storlek ? har.reduce((n, id) => n + (storlek[id] ?? 0), 0) : null, last = out.at(-1);
      if (last && last.day === day && last.endMin === t && last.klasser === har.length && last.elever === elever) last.endMin = t + stepMin;
      else out.push({ day, startMin: t, endMin: t + stepMin, klasser: har.length, elever });
    }
  }
  return out;
}

const krockar = (l: SchemaForslagLesson, t: Tid) => l.day === t.day && l.startMin! < t.endMin && t.startMin < l.startMin! + l.durationMin;
/**
 * Lediga lärare en tid (I58): lärare utan pass då, bland `lessons` (passen i terminen). Med ett ämne står de som har ämnet i tjänstefördelningen
 * (något pass i ämnet i förslaget) först. Det säger vad läraren undervisar i här, inte lärarens legitimation.
 */
export function ledigaLarare(f: Pick<SchemaForslag, 'teachers' | 'lessons'>, lessons: SchemaForslagLesson[], tid: Tid, amne: string | null): { id: string; name: string; harAmnet: boolean }[] {
  const upptagna = new Set(lessons.filter(l => lagd(l) && krockar(l, tid)).flatMap(l => l.teacherIds));
  const med = new Set(amne === null ? [] : f.lessons.filter(l => l.title === amne).flatMap(l => l.teacherIds));
  return f.teachers.filter(t => !upptagna.has(t.id)).map(t => ({ id: t.id, name: t.name, harAmnet: med.has(t.id) }))
    .sort((a, b) => Number(b.harAmnet) - Number(a.harAmnet) || svensk(a.name, b.name));
}
/** Lediga salar en tid (I58). Salstyp och storlek väntar på salsregistret, så salen är bara ett namn. */
export function ledigaSalar(f: Pick<SchemaForslag, 'rooms'>, lessons: SchemaForslagLesson[], tid: Tid): { id: string; name: string }[] {
  const upptagna = new Set(lessons.filter(l => lagd(l) && krockar(l, tid)).map(l => l.roomId));
  return f.rooms.filter(r => !upptagna.has(r.id)).sort((a, b) => svensk(a.name, b.name));
}

/** Färgsättning (I59). Lås finns inte förrän pass kan låsas (05.2-SM-BYT), så "låst" finns inte som val än. */
export const SAMLING_FARG = [{ id: 'amne', namn: 'Ämne' }, { id: 'larare', namn: 'Lärare' }, { id: 'sal', namn: 'Sal' }, { id: 'avvikelse', namn: 'Avvikelse' }] as const;
export type SamlingFarg = typeof SAMLING_FARG[number]['id'];
export const SAMLING_TONER = 6;
/** Initialer med siffror: "Provlärare 4" → "P4", "Anna Berg" → "AB". */
export const kortNamn = (name: string) => name.split(/\s+/u).map(w => /^\d/u.test(w) ? w : w.charAt(0).toUpperCase()).join('').slice(0, 4);
/**
 * Färg och text för ett pass. Texten står alltid i rutan, så att färgen aldrig bär betydelsen ensam. `ton` är en av `SAMLING_TONER` toner
 * (samma värde får alltid samma ton inom förslaget), eller `null` för grundfärgen; `avvikelse` ritas med regelbrottets mönster.
 */
export function passFarg(f: Pick<SchemaForslag, 'lessons' | 'teachers' | 'rooms'>, farg: SamlingFarg, l: SchemaForslagLesson, flagged: ReadonlySet<string>): { ton: number | null; avvikelse: boolean; text: string; namn: string } {
  const amne = l.title.slice(0, 2);
  if (farg === 'avvikelse') return flagged.has(l.id) ? { ton: null, avvikelse: true, text: `Avv. ${amne}`, namn: 'Regelavvikelse' } : { ton: null, avvikelse: false, text: amne, namn: 'Ingen avvikelse' };
  if (farg === 'amne') { const alla = [...new Set(f.lessons.map(x => x.title))].sort(svensk); return { ton: alla.indexOf(l.title) % SAMLING_TONER, avvikelse: false, text: amne, namn: l.title }; }
  const lista = farg === 'larare' ? f.teachers : f.rooms, id = farg === 'larare' ? l.teacherIds[0] : l.roomId, i = lista.findIndex(x => x.id === id);
  if (i < 0) return { ton: null, avvikelse: false, text: `– ${amne}`, namn: farg === 'larare' ? 'Ingen lärare' : 'Ingen sal' };
  return { ton: i % SAMLING_TONER, avvikelse: false, text: `${farg === 'larare' ? kortNamn(lista[i].name) : lista[i].name} ${amne}`, namn: lista[i].name };
}

// ── Arbetsvyer: namngivna urval i webbläsaren, per skolenhet ─────────────────────────────────────────────────────────────────

/** En sparad rad: appens referens för klass, grupp och lärare (som egna villkor), salens namn. Elever sparas inte. */
export type ArbetsvyResurs = { slag: Exclude<SamlingSlag, 'elev'>; ref: string };
export type Arbetsvy = { namn: string; resurser: ArbetsvyResurs[]; lager: Record<string, boolean>; filter: SamlingFilter; farg: SamlingFarg };
export const ARBETSVY_GRANS = { vyer: 50, namn: 60, resurser: 60, amnen: 40, text: 200 } as const;
export const arbetsvyNyckel = (unitId: string) => `schema-arbetsvyer:${unitId}`;

/** Urvalet som arbetsvy. Elevrader och rader utan referens i underlaget tas inte med; `utan` säger hur många. */
export function arbetsvyAv(f: Underlag, namn: string, resurser: SamlingResurs[], lager: Record<string, boolean>, filter: SamlingFilter, farg: SamlingFarg): { vy: Arbetsvy; utan: number } {
  const refs = resursRefs(f), sparade: ArbetsvyResurs[] = [];
  for (const r of resurser) {
    if (r.slag === 'elev') continue;
    const ref = r.slag === 'sal' ? f.rooms.find(x => x.id === r.id)?.name : refs.get(r.id)?.ref;
    if (ref && !sparade.some(x => x.slag === r.slag && x.ref === ref)) sparade.push({ slag: r.slag, ref });
  }
  return { vy: { namn: namn.trim().slice(0, ARBETSVY_GRANS.namn), resurser: sparade.slice(0, ARBETSVY_GRANS.resurser), lager: { ...lager },
    filter: { amnen: filter.amnen.slice(0, ARBETSVY_GRANS.amnen), termin: filter.termin }, farg }, utan: resurser.length - sparade.length };
}
/** Arbetsvyns rader i det här förslaget. `saknas`: sparade rader som inte finns i förslaget (en klass eller lärare som har tagits bort). */
export function arbetsvyResurser(f: Underlag, vy: Arbetsvy): { resurser: SamlingResurs[]; saknas: number } {
  const refs = [...resursRefs(f)], resurser = vy.resurser.flatMap((r): SamlingResurs[] => {
    const id = r.slag === 'sal' ? f.rooms.find(x => x.name === r.ref)?.id : refs.find(([, x]) => x.slag === r.slag && x.ref === r.ref)?.[0];
    return id ? [{ slag: r.slag, id }] : [];
  });
  return { resurser, saknas: vy.resurser.length - resurser.length };
}
/** Sparar eller ersätter en arbetsvy med samma namn; nya vyer läggs sist. */
export function medArbetsvy(vyer: Arbetsvy[], vy: Arbetsvy): Arbetsvy[] {
  return (vyer.some(x => x.namn === vy.namn) ? vyer.map(x => x.namn === vy.namn ? vy : x) : [...vyer, vy]).slice(-ARBETSVY_GRANS.vyer);
}
/** Byter namn. Ett tomt namn eller ett namn en annan vy redan har ändrar ingenting. */
export function dopOmArbetsvy(vyer: Arbetsvy[], namn: string, nytt: string): Arbetsvy[] {
  const till = nytt.trim().slice(0, ARBETSVY_GRANS.namn);
  return !till || vyer.some(x => x.namn === till) ? vyer : vyer.map(x => x.namn === namn ? { ...x, namn: till } : x);
}

/** Tolkar det som ligger i webbläsaren. Det som inte har rätt form kastas, så att en gammal eller trasig post aldrig stoppar vyn. */
export function parseArbetsvyer(text: string | null): Arbetsvy[] {
  let raw: unknown;
  try { raw = JSON.parse(text ?? '[]'); } catch { return []; }
  if (!Array.isArray(raw)) return [];
  const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
  const out: Arbetsvy[] = [];
  for (const item of raw.slice(0, ARBETSVY_GRANS.vyer)) {
    if (item === null || typeof item !== 'object') continue;
    const v = item as Record<string, unknown>, filter = (v.filter ?? {}) as Record<string, unknown>;
    if (!str(v.namn, ARBETSVY_GRANS.namn) || !Array.isArray(v.resurser) || out.some(x => x.namn === v.namn)) continue;
    const resurser = v.resurser.slice(0, ARBETSVY_GRANS.resurser).flatMap((r): ArbetsvyResurs[] => {
      const x = (r ?? {}) as Record<string, unknown>;
      return (x.slag === 'klass' || x.slag === 'grupp' || x.slag === 'larare' || x.slag === 'sal') && str(x.ref, ARBETSVY_GRANS.text) ? [{ slag: x.slag, ref: x.ref }] : [];
    });
    const lager = v.lager !== null && typeof v.lager === 'object' ? Object.fromEntries(Object.entries(v.lager as Record<string, unknown>).filter((e): e is [string, boolean] => typeof e[1] === 'boolean').slice(0, 20)) : {};
    out.push({ namn: v.namn, resurser, lager, farg: SAMLING_FARG.find(x => x.id === v.farg)?.id ?? 'amne',
      filter: { amnen: Array.isArray(filter.amnen) ? filter.amnen.filter((a): a is string => str(a, ARBETSVY_GRANS.text)).slice(0, ARBETSVY_GRANS.amnen) : [], termin: filter.termin === 'ht' || filter.termin === 'vt' ? filter.termin : null } });
  }
  return out;
}
