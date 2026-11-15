// Villkor per resurs i tabell (05.2-SM-VILLKORSTABELL, Q121–Q127). Ren modell utan React: flikar, rader, celler och deras sammanfattning, tidsrutnätet
// i cellredigeraren och ändringar för flera rader på en gång. Villkoren är dagens egna villkor i `villkor.egna`; tabellen är en ny vy av dem och lagrar
// inget eget. Ändringar läggs i utkastet som ett villkorssteg (`{ type: 'villkor' }`), så att de kan ångras och prövas direkt (05.2-SM-VILLKOR-DIREKT).
import { SCHEMA_GRUND_TYPER, SCHEMA_REGEL_TYPER, SCHEMA_VILLKOR_LIMITS, schemaTerms, type SchemaForslag, type SchemaForslagLesson, type SchemaKontroll, type SchemaRegel,
  type SchemaRegelTyp, type SchemaVillkor } from './schema-contract.ts';
import { upptarText } from './schema-marginal.ts';
import { passPaVillkor, resursRefs, type SchemaUtkastAtgard } from './schema-utkast.ts';

export const VT_FLIKAR = [
  { id: 'skola', namn: 'Hela skolan' }, { id: 'klass', namn: 'Klasser' }, { id: 'grupp', namn: 'Grupper' },
  { id: 'larare', namn: 'Lärare' }, { id: 'sal', namn: 'Salar' }, { id: 'amne', namn: 'Ämnen' },
] as const;
export type VtFlik = typeof VT_FLIKAR[number]['id'];
/** Resurstyperna som har en rad per resurs. Enskilda pass har bara marginal och redigeras i Marginaler. */
export type VtSlag = Exclude<VtFlik, 'skola'>;
export const VT_TYP_NAMN: Record<SchemaRegelTyp, string> = { sparrad: 'Spärrad tid', tillaten: 'Tillåten tid', marginal: 'Marginal', langd: 'Längsta pass', antal: 'Antal pass',
  sal: 'Salskrav', dag: 'Längsta dag' };
/** Kolumnen med vem resursen undervisar eller undervisas av. */
export const VT_VEM: Record<VtSlag, string> = { klass: 'Lärare', grupp: 'Lärare', larare: 'Klasser', amne: 'Klasser', sal: 'Ämnen' };
/** Villkorstyperna resurstypen kan ha, i kontraktets ordning. */
export const vtTyper = (slag: VtSlag): SchemaRegelTyp[] => SCHEMA_REGEL_TYPER[slag];
/** Grundvillkor ändrar vilka pass som finns och kräver ett nytt förslag (05.2-SM-VILLKOR-DIREKT). */
export const vtGrund = (typ: SchemaRegelTyp) => SCHEMA_GRUND_TYPER.includes(typ);
/** Typer där en resurs har högst ett värde: ett nytt villkor ersätter det gamla. Tid och marginal läggs till. */
const ETT_VARDE: readonly SchemaRegelTyp[] = ['langd', 'antal', 'sal', 'dag'];

export type VtUnderlag = Pick<SchemaForslag, 'days' | 'classes' | 'teachers' | 'rooms' | 'resurser' | 'lessons' | 'period' | 'startGridMin'>;
export type VtCell = { typ: SchemaRegelTyp; index: number[]; text: string };
export type VtRad = {
  slag: VtSlag; ref: string; namn: string;
  /** Antal pass resursen har i förslaget, veckotid per termin och vem resursen undervisar eller undervisas av. */
  pass: number; veckotidMin: number[]; veckotid: string; vem: string; aktiviteter: string;
  celler: Partial<Record<SchemaRegelTyp, VtCell>>;
  /** Villkoren träffar inget pass i förslaget (resursen har inga pass); villkoret används då inte, som i dag. */
  utanTraff: boolean;
  /** Pass som kontrollen har hittat som bryter mot radens villkor. */
  brott: number;
};

const DAG = ['mån', 'tis', 'ons', 'tor', 'fre', 'lör', 'sön'];
const WEEKDAY = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'];
const pad = (n: number) => String(n).padStart(2, '0');
/** Klockslag kort: hela timmar utan minuter ("08", "12"), annars "08:30". */
const kort = (m: number) => m % 60 ? `${pad(Math.floor(m / 60))}:${pad(m % 60)}` : pad(m / 60);
const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
/** Tid som "4 h 40 min", "45 min" eller "5 h". */
export function vtTid(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}
const timmar = (min: number) => `${(min / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;

/** Veckodagar kort, med följande dagar som spann: "mån–ons, fre". */
export function vtDagar(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b), runs: number[][] = [];
  for (const d of sorted) { const last = runs.at(-1); if (last && last.at(-1) === d - 1) last.push(d); else runs.push([d]); }
  return runs.map(r => r.length > 2 ? `${DAG[r[0]]}–${DAG[r.at(-1)!]}` : r.map(d => DAG[d]).join(', ')).join(', ');
}
type Tid = Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>;
const arTid = (r: SchemaRegel): r is Tid => r.typ === 'sparrad' || r.typ === 'tillaten';
/** En tid i cellen: hela dagen, eftermiddag (från 12 till dagens slut, "em") eller klockslag. Skoldagens gränser är de valda dagarnas. */
function tidDel(r: Tid, days: SchemaVillkor['days']): string {
  const own = r.days.map(d => days[d]).filter(Boolean), from = Math.min(...own.map(d => d.startMin)), to = Math.max(...own.map(d => d.endMin));
  const tid = r.startMin <= from && r.endMin >= to ? 'hela dagen' : r.startMin === 720 && r.endMin >= to ? 'em' : `${kort(r.startMin)}–${kort(r.endMin)}`;
  return `${vtDagar(r.days)} ${tid}`;
}
/** Cellens text ("mån 08–12, fre em", "10/15 min, eleverna", "högst 60 min"). Flera villkor av samma typ skiljs med komma. */
export function vtCellText(rules: SchemaRegel[], days: SchemaVillkor['days']): string {
  return rules.map(r => arTid(r) ? tidDel(r, days)
    : r.typ === 'marginal' ? `${r.beforeMin}/${r.afterMin} min, ${upptarText(r.occupies).toLocaleLowerCase('sv-SE')}`
    : r.typ === 'langd' ? `högst ${r.maxMin} min` : r.typ === 'antal' ? `${r.count} pass/vecka` : r.typ === 'dag' ? `högst ${timmar(r.maxMin)}`
    : r.typ === 'sal' ? r.rooms.join(' eller ') : '').join(', ');
}

/** Resursens rader i tabellen: namn och ref ur förslaget, salarna ur villkoren. */
export function vtResurser(slag: VtSlag, villkor: SchemaVillkor, f: VtUnderlag | null): { ref: string; namn: string }[] {
  if (slag === 'sal') return villkor.salar.map(x => ({ ref: x, namn: x }));
  return f ? f.resurser[slag].map(x => ({ ref: x.ref, namn: x.name })) : [];
}

/**
 * Passen ett villkor för resursen gäller, med samma koppling som lagren och underlaget: klassens och lärarens pass via förslagets löpnummer, ämnets pass på
 * undervisningens namn och salens pass som får ligga i salen. En grupps pass känns igen på undervisningens namn, också i ett valbart block där alternativen
 * går samtidigt ("Valbart block: Spanska, Tyska").
 */
export function vtPass(slag: VtSlag, ref: string, namn: string, f: VtUnderlag): SchemaForslagLesson[] {
  const refs = resursRefs(f), mine = (ids: string[]) => ids.some(id => { const x = refs.get(id); return x?.slag === slag && x.ref === ref; });
  const block = (title: string) => title.startsWith('Valbart block: ') && title.slice(15).split(', ').includes(namn);
  const rooms = new Set(f.rooms.filter(r => r.name === ref).map(r => r.id));
  return f.lessons.filter(l => slag === 'amne' ? l.title === ref : slag === 'sal' ? l.roomIds.some(id => rooms.has(id)) : slag === 'larare' ? mine(l.teacherIds)
    : slag === 'grupp' ? l.title === namn || block(l.title) : mine(l.classIds));
}

/** Kontrollens koder och de villkorstyper de kan komma från. Avvikelser utan pass (längsta dag) känns igen på lärarens namn i texten. */
const KOD: Record<string, SchemaRegelTyp[]> = { outside_allowed: ['sparrad', 'tillaten'], room_unavailable: ['sparrad', 'tillaten'], room_unfit: ['sal'], room_unwanted: ['sal'],
  teacher_day_too_long: ['dag'] };
function brott(rad: Pick<VtRad, 'slag' | 'ref' | 'namn'>, typer: SchemaRegelTyp[], lessons: SchemaForslagLesson[], egna: SchemaRegel[], f: VtUnderlag, kontroll: SchemaKontroll | null): number {
  if (!kontroll) return 0;
  const own = new Map(lessons.map(l => [l.id, l])), hit = new Set<string>();
  const tid = egna.flatMap((r, i) => r.slag === rad.slag && r.ref === rad.ref && arTid(r) ? [i] : []);
  for (const v of kontroll.violations) {
    const kan = (KOD[v.code] ?? []).filter(t => typer.includes(t));
    // Spärrad tid för en sal redovisas som `room_unavailable`, för övriga som `outside_allowed`.
    if (!kan.length || v.code === 'room_unavailable' && rad.slag !== 'sal' || v.code === 'outside_allowed' && rad.slag === 'sal') continue;
    if (v.code === 'teacher_day_too_long') {
      // "Lärare {namn} har 300 min undervisning måndag, …": lärarens pass den dagen.
      const day = WEEKDAY.findIndex(d => v.message.includes(` ${d}`));
      if (rad.slag === 'larare' && v.message.startsWith(`Lärare ${rad.namn} har `)) for (const l of lessons) if (l.day === day) hit.add(l.id);
      continue;
    }
    for (const id of v.lessons) {
      const l = own.get(id);
      if (!l) continue;
      if (kan.includes('sparrad') && !tid.some(i => passPaVillkor(f, egna, i, [l]).length)) continue;
      hit.add(id);
    }
  }
  return hit.size;
}

/** Namn i en kolumn: högst tre, sedan antalet. */
function namnLista(values: string[]): string {
  const u = [...new Set(values)].filter(Boolean);
  return u.length > 3 ? `${u.slice(0, 3).join(', ')} +${u.length - 3}` : u.join(', ');
}

/** Egna aktiviteter som uttryckligen upptar resursen. Läsande fakta, aldrig ett ämnesvillkor. */
export function vtAktiviteter(slag: VtSlag, ref: string, villkor: SchemaVillkor): string {
  if (slag === 'amne') return '';
  return (villkor.aktiviteter ?? []).filter(a => slag === 'klass' ? a.classRefs.includes(ref) : slag === 'grupp' ? a.groupRefs.includes(ref)
    : slag === 'larare' ? a.teacherRefs.includes(ref) : a.rooms.includes(ref)).map(a => `${a.name} (${a.typ})`).join(', ');
}

/** Tabellens rader för en resurstyp: en rad per resurs, med fakta, en cell per villkorstyp och pass på villkoret. Tom utan förslag (utom salar). */
export function vtRader(slag: VtSlag, villkor: SchemaVillkor, f: VtUnderlag | null, kontroll: SchemaKontroll | null = null): VtRad[] {
  const typer = vtTyper(slag), terms = f ? schemaTerms(f.period) : [];
  return vtResurser(slag, villkor, f).map(({ ref, namn }) => {
    const lessons = f ? vtPass(slag, ref, namn, f) : [];
    const veckotidMin = terms.map(t => lessons.filter(l => l.term === null || l.term === t).reduce((n, l) => n + l.durationMin, 0));
    const veckotid = !veckotidMin.length ? '' : veckotidMin.every(x => x === veckotidMin[0]) ? vtTid(veckotidMin[0]) : terms.map((t, i) => `${t.toUpperCase()} ${vtTid(veckotidMin[i])}`).join(' · ');
    const vem = !f ? '' : slag === 'klass' || slag === 'grupp' ? namnLista(lessons.flatMap(l => l.teacherIds.map(id => f.teachers.find(t => t.id === id)?.name ?? '')))
      : slag === 'sal' ? namnLista(lessons.map(l => l.title)) : namnLista(lessons.flatMap(l => l.classIds.map(id => f.classes.find(c => c.id === id)?.name ?? '')));
    const celler: VtRad['celler'] = {};
    for (const typ of typer) {
      const index = villkor.egna.flatMap((r, i) => r.slag === slag && r.ref === ref && r.typ === typ ? [i] : []);
      if (index.length) celler[typ] = { typ, index, text: vtCellText(index.map(i => villkor.egna[i]), villkor.days) };
    }
    // Ett villkor för en sal träffar alltid i underlaget (salen finns bland salarna); övriga träffar när resursen har pass.
    const utanTraff = f !== null && slag !== 'sal' && lessons.length === 0 && Object.keys(celler).length > 0;
    const rad = { slag, ref, namn };
    return { ...rad, pass: lessons.length, veckotidMin, veckotid, vem, aktiviteter: vtAktiviteter(slag, ref, villkor), celler, utanTraff, brott: f ? brott(rad, typer, lessons, villkor.egna, f, kontroll) : 0 };
  });
}

export type VtFilter = 'alla' | 'har' | 'saknar' | 'utanTraff';
export const VT_FILTER: Record<VtFilter, string> = { alla: 'Alla', har: 'Har villkor', saknar: 'Saknar villkor', utanTraff: 'Träffar inget' };
/** Kolumnerna som går att sortera: namn, fakta, en villkorstyp eller pass på villkoret. */
export type VtKolumn = 'namn' | 'pass' | 'veckotid' | 'vem' | 'aktiviteter' | 'brott' | SchemaRegelTyp;
export function vtFiltrera(rader: VtRad[], sok: string, filter: VtFilter): VtRad[] {
  const q = sok.trim().toLocaleLowerCase('sv-SE'), har = (r: VtRad) => Object.keys(r.celler).length > 0;
  return rader.filter(r => (!q || r.namn.toLocaleLowerCase('sv-SE').includes(q))
    && (filter === 'alla' || filter === 'har' && har(r) || filter === 'saknar' && !har(r) || filter === 'utanTraff' && r.utanTraff));
}
/** Sortering på kolumnrubrik. Tomma celler står sist i båda riktningarna; lika rader behåller sin ordning. */
export function vtSortera(rader: VtRad[], kolumn: VtKolumn, riktning: 'asc' | 'desc'): VtRad[] {
  const sv = (a: string, b: string) => a.localeCompare(b, 'sv', { numeric: true });
  const value = (r: VtRad): string | number | null => kolumn === 'namn' ? r.namn : kolumn === 'pass' ? r.pass : kolumn === 'veckotid' ? Math.max(0, ...r.veckotidMin)
    : kolumn === 'vem' ? r.vem || null : kolumn === 'aktiviteter' ? r.aktiviteter || null : kolumn === 'brott' ? r.brott : r.celler[kolumn]?.text ?? null;
  const sign = riktning === 'asc' ? 1 : -1;
  return rader.map((r, i) => ({ r, i, v: value(r) })).sort((a, b) => a.v === null || b.v === null ? (a.v === null ? 1 : 0) - (b.v === null ? 1 : 0) || a.i - b.i
    : (typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : sv(String(a.v), String(b.v))) * sign || a.i - b.i).map(x => x.r);
}

// Ändringar. Alla ger en ny lista med egna villkor; arbetsytan lägger den i utkastet som ett villkorssteg.

/** En regel utan vem den gäller: det som läggs på en eller flera rader. */
export type VtMall = SchemaRegel extends infer R ? R extends SchemaRegel ? Omit<R, 'slag' | 'ref'> : never : never;
const sammaCell = (slag: VtSlag, ref: string, typ: SchemaRegelTyp) => (r: SchemaRegel) => r.slag === slag && r.ref === ref && r.typ === typ;
const med = (slag: VtSlag, ref: string, m: VtMall): SchemaRegel => ({ slag, ref, ...m } as SchemaRegel);
/** Cellens villkor byts mot `nya` (tom lista tar bort dem). De nya står där cellens första villkor stod, annars sist. */
export function vtErsattCell(egna: SchemaRegel[], slag: VtSlag, ref: string, typ: SchemaRegelTyp, nya: VtMall[]): SchemaRegel[] {
  const same = sammaCell(slag, ref, typ), at = egna.findIndex(same), kvar = egna.filter(r => !same(r)), pos = at < 0 ? kvar.length : at;
  return [...kvar.slice(0, pos), ...nya.map(m => med(slag, ref, m)), ...kvar.slice(pos)];
}
/**
 * "Lägg villkor på valda": samma villkor för varje vald resurs, ett villkor per resurs och mall. Längsta pass, antal, salskrav och längsta dag har ett värde
 * per resurs och ersätter det som fanns; spärrad och tillåten tid och marginal läggs till.
 */
export function vtLaggPaValda(egna: SchemaRegel[], slag: VtSlag, refs: string[], mallar: VtMall[]): SchemaRegel[] {
  let out = egna;
  for (const ref of refs) {
    const typer = [...new Set(mallar.map(m => m.typ))];
    for (const typ of typer) {
      const egnaAvTyp = mallar.filter(m => m.typ === typ);
      out = ETT_VARDE.includes(typ) ? vtErsattCell(out, slag, ref, typ, egnaAvTyp) : [...out, ...egnaAvTyp.map(m => med(slag, ref, m))];
    }
  }
  return out;
}
/** "Ta bort {typ} för valda". */
export function vtTaBortTyp(egna: SchemaRegel[], slag: VtSlag, refs: string[], typ: SchemaRegelTyp): SchemaRegel[] {
  return egna.filter(r => !(r.slag === slag && r.typ === typ && refs.includes(r.ref)));
}
/** "Kopiera villkoren från …": de valda raderna får samma egna villkor som raden det kopieras från; deras tidigare villkor ersätts. */
export function vtKopiera(egna: SchemaRegel[], slag: VtSlag, fran: string, till: string[]): SchemaRegel[] {
  const kalla = egna.filter(r => r.slag === slag && r.ref === fran).map(({ slag: _s, ref: _r, ...m }) => m as VtMall);
  const mottagare = till.filter(ref => ref !== fran);
  return [...egna.filter(r => !(r.slag === slag && mottagare.includes(r.ref))), ...mottagare.flatMap(ref => kalla.map(m => med(slag, ref, m)))];
}
/** Utkastets villkorssteg för en ändring i tabellen: ångra sätter tillbaka `fore` i ett steg, hur många rader ändringen än gällde. */
export const vtSteg = (fore: SchemaRegel[], efter: SchemaRegel[], text: string): Extract<SchemaUtkastAtgard, { type: 'villkor' }> => ({ type: 'villkor', fore, efter, text });
/** Ändringen ryms inte bland de egna villkoren (högst 200). */
export const vtForManga = (egna: SchemaRegel[]) => egna.length > SCHEMA_VILLKOR_LIMITS.egna;

// Tidsrutnätet i cellredigeraren: dagar × tid i startrutnätet.

export type VtRutnat = { from: number; to: number; step: number; days: number };
/** Rutnätet för villkoren: skoldagens tidigaste början till senaste slut, i startrutnätets steg. */
export function vtRutnat(villkor: SchemaVillkor): VtRutnat {
  const from = Math.min(...villkor.days.map(d => d.startMin)), step = villkor.startGridMin;
  const to = from + Math.ceil((Math.max(...villkor.days.map(d => d.endMin)) - from) / step) * step;
  return { from, to, step, days: villkor.days.length };
}
export const vtRutor = (g: VtRutnat) => (g.to - g.from) / g.step;
/** Markerade rutor per dag ur villkoren: en ruta är markerad när någon del av den ligger i ett av villkoren. */
export function vtMarkerade(rules: SchemaRegel[], g: VtRutnat): boolean[][] {
  return Array.from({ length: g.days }, (_, day) => Array.from({ length: vtRutor(g) }, (_, i) => {
    const a = g.from + i * g.step, b = a + g.step;
    return rules.some(r => arTid(r) && r.days.includes(day) && r.startMin < b && a < r.endMin);
  }));
}
/** Markerade rutor som villkor: sammanhängande rutor en dag blir en tid, och samma tid flera dagar ett villkor med de dagarna. */
export function vtTillRegler(marked: boolean[][], g: VtRutnat, typ: 'sparrad' | 'tillaten'): VtMall[] {
  const spans = new Map<string, { startMin: number; endMin: number; days: number[] }>();
  marked.forEach((row, day) => {
    for (let i = 0; i < row.length; i++) {
      if (!row[i] || row[i - 1]) continue;
      let j = i;
      while (row[j + 1]) j++;
      const startMin = g.from + i * g.step, endMin = g.from + (j + 1) * g.step, key = `${startMin}-${endMin}`;
      const s = spans.get(key) ?? { startMin, endMin, days: [] };
      s.days.push(day); spans.set(key, s);
    }
  });
  return [...spans.values()].sort((a, b) => a.days[0] - b.days[0] || a.startMin - b.startMin).map(s => ({ typ, days: s.days, startMin: s.startMin, endMin: s.endMin }));
}
/** Ruta och tid i klartext, för skärmläsare och rubriker. */
export const vtRutaText = (g: VtRutnat, day: number, i: number) => `${WEEKDAY[day]} ${clock(g.from + i * g.step)}–${clock(g.from + (i + 1) * g.step)}`;

// Hela skolan: dagens övergripande villkor som rader.

export type VtSkolaFalt = 'days' | 'breakMin' | 'startGridMin' | 'lunch' | 'maxLessonMin' | 'minLessonMin' | 'sameDay' | 'lateAfterMin' | 'studentMaxMinPerDay' | 'teacherMaxMinPerDay';
/** Fälten, om de är grund och kontrollens koder för avvikelser mot dem. */
export const VT_SKOLA: { falt: VtSkolaFalt; namn: string; grund: boolean; koder: string[] }[] = [
  { falt: 'days', namn: 'Skoldag', grund: false, koder: ['outside_day'] },
  { falt: 'breakMin', namn: 'Rast mellan pass', grund: false, koder: [] },
  { falt: 'startGridMin', namn: 'Pass får börja', grund: false, koder: ['off_grid'] },
  { falt: 'lunch', namn: 'Lunch', grund: false, koder: ['student_no_lunch', 'teacher_no_lunch'] },
  { falt: 'maxLessonMin', namn: 'Längsta pass', grund: true, koder: [] },
  { falt: 'minLessonMin', namn: 'Kortaste pass', grund: true, koder: [] },
  { falt: 'sameDay', namn: 'Samma ämne samma dag', grund: false, koder: ['same_day'] },
  { falt: 'lateAfterMin', namn: 'Sena pass', grund: false, koder: [] },
  { falt: 'studentMaxMinPerDay', namn: 'Längsta dag, elever', grund: false, koder: ['student_day_too_long'] },
  { falt: 'teacherMaxMinPerDay', namn: 'Längsta dag, lärare', grund: false, koder: ['teacher_day_too_long'] },
];
const SAMMA: Record<SchemaVillkor['sameDay'], string> = { avoid: 'Undvik', forbid: 'Förbjud', allow: 'Tillåt' };
export function vtSkolaText(falt: VtSkolaFalt, v: SchemaVillkor): string {
  switch (falt) {
    case 'days': return v.days.every(d => d.startMin === v.days[0].startMin && d.endMin === v.days[0].endMin) ? `${clock(v.days[0].startMin)}–${clock(v.days[0].endMin)} mån–fre`
      : v.days.map((d, i) => `${DAG[i]} ${clock(d.startMin)}–${clock(d.endMin)}`).join(', ');
    case 'breakMin': return `${v.breakMin} min`;
    case 'startGridMin': return `var ${v.startGridMin}:e minut`;
    case 'lunch': return v.lunch ? `${v.lunch.lengthMin} min mellan ${clock(v.lunch.startMin)} och ${clock(v.lunch.endMin)}${v.lunch.teachers ? ', även lärare' : ''}` : 'Ingen lunch';
    case 'maxLessonMin': return `${v.maxLessonMin} min`;
    case 'minLessonMin': return `${v.minLessonMin} min`;
    case 'sameDay': return SAMMA[v.sameDay];
    case 'lateAfterMin': return v.lateAfterMin === null ? 'Undviks inte' : `Undviks efter ${clock(v.lateAfterMin)}`;
    case 'studentMaxMinPerDay': case 'teacherMaxMinPerDay': return v[falt] === null ? 'Ingen gräns' : `Högst ${timmar(v[falt]!)}`;
  }
}
export type VtSkolaRad = { falt: VtSkolaFalt; namn: string; grund: boolean; text: string; avvikelser: number };
/** Raderna för Hela skolan, med antal avvikelser kontrollen har hittat mot varje fält. */
export function vtSkolaRader(v: SchemaVillkor, kontroll: SchemaKontroll | null = null): VtSkolaRad[] {
  return VT_SKOLA.map(x => ({ falt: x.falt, namn: x.namn, grund: x.grund, text: vtSkolaText(x.falt, v), avvikelser: kontroll?.violations.filter(w => x.koder.includes(w.code)).length ?? 0 }));
}
