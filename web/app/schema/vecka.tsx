'use client';
// Veckorutnätet (05.2-SM-YTA): tidsaxel, dagar, pass och lager. Lagren ritas under passen (fält, nedtoning) och intill dem (band).
// Utan lager ritas inget extra och veckan ser ut som före uppdelningen.
import { useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import type { SchemaDatedCalendar, SchemaForslag, SchemaForslagLesson, SchemaTerm, SchemaTrim } from '@/lib/schema-contract.ts';
import { schemaDatumTillfallen, type SchemaDatumAndring, type SchemaDatumTillfalle } from '@/lib/schema-datum.ts';
import { schemaDagStatus, schemaTillfallen, schemaVisningsDagar, type SchemaVeckaVal } from '@/lib/schema-vecka.ts';
import './vecka-val.css';
import './byt.css';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SCHEMA_FALT, markeringMellan, type SchemaBand, type SchemaDimmed, type SchemaFaltTyp, type SchemaMarkering, type SchemaOverlay, type SchemaVerktyg } from '@/lib/schema-utkast.ts';
import { clock, dayName } from './delat.ts';
import { Pass } from './pass.tsx';

/** Fälttypernas namn, i teckenförklaringen och för skärmläsare. */
export const FALT: Record<SchemaFaltTyp, string> = {
  sparrad: 'Spärrad tid', 'tillaten-ute': 'Utanför tillåten tid', lunch: 'Lunchfönster', marginal: 'Marginal', aktivitet: 'Aktivitet', installt: 'Inställt pass',
  fri: 'Fri: passet kan läggas här', 'fri-utan-sal': 'Fri tid, men passet blir utan sal', onskemal: 'Bryter ett önskemål', byte: 'Går med ett byte', brott: 'Regelbrott',
};
/** Bandens namn i teckenförklaringen (Main). */
const BAND: Record<NonNullable<SchemaBand['kind']>, string> = { marginal: 'Omklädning och dusch', restid: 'Restid mellan platser' };

/** Rutnätets första och sista minut och de hela timmarna däremellan. */
export function veckansSpann(days: SchemaForslag['days']) {
  const start = Math.min(...days.map(d => d.startMin)), end = Math.max(...days.map(d => d.endMin));
  const hours = Array.from({ length: Math.floor(end / 60) - Math.ceil(start / 60) + 1 }, (_, i) => (Math.ceil(start / 60) + i) * 60);
  return { start, end, hours };
}

/** Pass som överlappar i tid läggs i spalter bredvid varandra, t.ex. parallella alternativ i ett valbart block. */
export function lanes(lessons: SchemaForslagLesson[]): Map<string, { lane: number; lanes: number }> {
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [], ends: number[] = [], until = -1;
  const close = () => { for (const g of group) result.set(g.id, { lane: g.lane, lanes: ends.length }); group = []; ends = []; };
  for (const l of lessons) {
    if (l.startMin! >= until) close();
    let lane = ends.findIndex(end => end <= l.startMin!);
    if (lane < 0) lane = ends.length;
    ends[lane] = l.startMin! + l.durationMin; until = Math.max(until, ends[lane]);
    group.push({ id: l.id, lane });
  }
  close();
  return result;
}

export type VeckaProps = {
  days: SchemaForslag['days'];
  /** Passen som visas, med tid. */
  lessons: SchemaForslagLesson[];
  picked: string | null;
  /** Passet som dras och var det hamnar om det släpps. */
  drop: { lesson: string; to: { day: number | null; startMin: number | null } | null; length: number } | null;
  flagged: Set<string>;
  disabled: boolean;
  length: (l: SchemaForslagLesson) => number;
  detail: (l: SchemaForslagLesson) => string;
  onGrab: (e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) => void;
  onPick: (l: SchemaForslagLesson, utoka?: boolean) => void;
  datum?: { forslag: SchemaForslag; overrides: SchemaDatumAndring[] };
  onOccurrence?: (o: SchemaDatumTillfalle) => void;
  selected?: string[];
  onSelect?: (ids: string[]) => void;
  onLockDay?: (day: number, locked?: boolean) => void;
  overlays?: SchemaOverlay[];
  bands?: SchemaBand[];
  dimmed?: SchemaDimmed[];
  gridRef?: Ref<HTMLDivElement>;
  /** Fler rader i passrutan: justerad längd, kortning vissa veckor, salskrav (05.2-SM-VILLKOR-SYNS). */
  extra?: (l: SchemaForslagLesson) => string[];
  /** Låsta pass (lås kommer i SM-BYT). */
  locked?: (l: SchemaForslagLesson) => boolean;
  /**
   * Gör ett fält med källa valbart: får fältets text och dess namn för skärmläsare och lägger den i en knapp som visar villkoret (05.2-SM-VILLKOR-SYNS).
   * Utan värde, eller när fältet saknar källa, är fältet bara en markering.
   */
  falt?: (o: SchemaOverlay, label: string, content: ReactNode) => ReactNode;
  /** Egna namn på fälttyper och band, i teckenförklaringen och för skärmläsare. Nyckel: fälttyp eller `band-marginal`/`band-restid`. */
  namn?: Partial<Record<string, string>>;
  /** Valt verktyg (05.2-SM-MENY). Med Spärra och Tillåt bara markeras tid genom att dra över en dag. */
  verktyg?: SchemaVerktyg;
  /** Markerad tid. `tom`: ingen tid är vald än; markeringen syns bara när den har fokus (tangentbordets startpunkt). */
  markering?: (SchemaMarkering & { tom?: boolean }) | null;
  /** Namn för skärmläsare och vilken hjälptext markeringen beskrivs av. */
  markeringNamn?: (m: SchemaMarkering) => string;
  markeringHjalp?: string;
  /** Tid markeras med musen: under draget (`klar` false) och när det är slut. */
  onMarkera?: (m: SchemaMarkering, klar: boolean) => void;
  /** Läsande datumvy av samma grundschema. Utan kalender eller i grundschemat bevaras veckans vanliga beteende. */
  kalender?: SchemaDatedCalendar | null;
  visning?: SchemaVeckaVal;
  trims?: SchemaTrim[];
  term?: SchemaTerm;
  classId?: string | null;
  pickedOccurrence?: string;
};

/** Minuten i rutnätet under en punkt i en dags kolumn. */
export function minutVid(ol: HTMLElement, clientY: number): number {
  const box = ol.getBoundingClientRect(), start = Number(ol.dataset.start), span = Number(ol.dataset.span);
  return start + (clientY - box.top) * span / box.height;
}
/** Veckan visas som rutnät (inte staplad lista på smal yta). Menyer och verktyg finns bara då. */
export const somRutnat = (week: HTMLElement | null) => !!week?.querySelector<HTMLElement>('.schema-hours')?.offsetParent;

const at = (from: number, to: number, origin: number) => ({ '--start': from - origin, '--length': to - from }) as CSSProperties;

export function Vecka({ days, lessons: all, picked, pickedOccurrence, drop, flagged, disabled, length, detail, onGrab, onPick, overlays = [], bands = [], dimmed = [], gridRef, extra, locked, falt, namn = {},
  selected = [], onSelect, onLockDay, verktyg = 'markera', markering = null, markeringNamn, markeringHjalp, onMarkera, kalender, visning, trims = [], classId = null, datum, onOccurrence }: VeckaProps) {
  const { start, end, hours } = veckansSpann(days);
  const [ram, setRam] = useState<{ left: number; top: number; width: number; height: number; lessons: string[] } | null>(null);
  const daterad = !!kalender && !!visning && visning.mode !== 'grundschema';
  const datedDays = daterad ? schemaVisningsDagar(kalender, visning!) : [];
  const occasions = daterad ? datum ? schemaDatumTillfallen(datum.forslag, visning!, datum.overrides).filter(o => all.some(l => l.id === o.lesson.id)) : schemaTillfallen({ lessons: all, trims, time: { calendar: kalender } }, visning!).map(o => ({ ...o, originalDate: o.date, changed: false })) : [];
  const columns = daterad ? datedDays.map(d => ({ day: d.weekday, heading: d.heading, date: d.date, ...schemaDagStatus(d, classId) }))
    : days.map((_, day) => ({ day, heading: dayName(day), date: null, schoolDay: true, reason: null }));
  // Dra över tom tid med Spärra eller Tillåt bara (05.2-SM-MENY): från punkten där musen trycktes ned till där den släpps, på 5-minutersrutnätet.
  const markera = (e: ReactPointerEvent<HTMLOListElement>, day: number) => {
    if ((!onMarkera && !onSelect) || (verktyg !== 'sparra' && verktyg !== 'tillat' && verktyg !== 'markera') || e.button !== 0 || e.pointerType === 'touch' || disabled) return;
    if ((e.target as HTMLElement).closest('.schema-lesson') || !somRutnat(e.currentTarget.closest('.schema-week'))) return;
    const ol = e.currentTarget, from = minutVid(ol, e.clientY);
    if (verktyg === 'markera' && onSelect) {
      const begin = { x: e.clientX, y: e.clientY };
      const rectangle = (ev: PointerEvent, commit: boolean) => {
        if (Math.hypot(begin.x - ev.clientX, begin.y - ev.clientY) < 6) return;
        const left = Math.min(begin.x, ev.clientX), right = Math.max(begin.x, ev.clientX), top = Math.min(begin.y, ev.clientY), bottom = Math.max(begin.y, ev.clientY);
        const grid = ol.closest('.schema-week');
        const b = grid?.getBoundingClientRect();
        const ids = [...grid?.querySelectorAll<HTMLElement>('[data-lesson]') ?? []].flatMap(el => { const b = el.getBoundingClientRect(); return b.left < right && b.right > left && b.top < bottom && b.bottom > top ? [el.dataset.lesson!] : []; });
        const lessons = e.shiftKey ? [...new Set([...selected, ...ids])] : ids;
        // Håll verktygsraden på plats medan förhandsmarkeringen dras över rutnätet.
        if (commit) onSelect(lessons);
        else if (b) setRam({ left: left - b.left, top: top - b.top, width: right - left, height: bottom - top, lessons });
      };
      const choose = (ev: PointerEvent) => rectangle(ev, false);
      const end = (ev: PointerEvent) => { window.removeEventListener('pointermove', choose); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); if (ev.type === 'pointerup') rectangle(ev, true); setRam(null); };
      window.addEventListener('pointermove', choose); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
      return;
    }
    if (!onMarkera) return;
    e.preventDefault();
    const at = (y: number) => markeringMellan(days, day, from, minutVid(ol, y));
    onMarkera(at(e.clientY), false);
    const move = (ev: PointerEvent) => { ev.preventDefault(); onMarkera(at(ev.clientY), false); };
    const done = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
      if (ev.type === 'pointerup') onMarkera(at(ev.clientY), true);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
  };
  const clip = <T extends { startMin: number; endMin: number }>(x: T) => ({ ...x, startMin: Math.max(start, x.startMin), endMin: Math.min(end, x.endMin) });
  const grid = <div ref={gridRef} className={`schema-week verktyg-${daterad ? 'markera' : verktyg}`} style={{ '--days': columns.length || 1, '--span': end - start, '--first-hour': (hours[0] ?? start) - start } as CSSProperties}>
    <div className="schema-hours" aria-hidden="true">{hours.map(h => <span key={h} style={{ '--at': h - start } as CSSProperties}>{clock(h)}</span>)}</div>
    {columns.map(({ day, date, heading, schoolDay, reason }) => {
      const actual = new Map(occasions.filter(o => o.date === date).map(o => [o.key, o]));
      const lessons = (daterad ? [...actual.values()].map(o => ({ ...o.lesson, id: o.key })) : all.filter(l => l.day === day && l.startMin !== null)).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id));
      const shownLength = (l: SchemaForslagLesson) => daterad ? actual.get(l.id)?.length ?? l.durationMin : length(l);
      const lane = lanes(lessons.map(l => ({ ...l, durationMin: shownLength(l) })));
      // Lunchfönstret ligger underst, så att spärrad tid och andra fält syns ovanpå det (Main).
      const fields = overlays.filter(o => o.day === day && (!daterad || schoolDay)).map(clip).filter(o => o.startMin < o.endMin).sort((a, b) => Number(b.kind === 'lunch') - Number(a.kind === 'lunch'));
      const dim = dimmed.filter(x => x.day === day && (!daterad || schoolDay)).map(clip).filter(x => x.startMin < x.endMin);
      const beside = bands.flatMap(b => b.minutes > 0 ? lessons.filter(x => (actual.get(x.id)?.lesson.id ?? x.id) === b.lesson).map(l => ({ b, l })) : []);
      const typ = (kind: SchemaFaltTyp) => namn[kind] ?? FALT[kind];
      // Passen står först i dagen, så att tangentbordet når dem före fälten; fälten ritas ändå under passen (z-index i schema.css).
      return <section className={`schema-day${daterad && !schoolDay ? ' schema-utan-undervisning' : ''}`} key={date ?? day} aria-label={heading} data-date={date ?? undefined}>
        <h3>{!daterad && onLockDay ? <DropdownMenu><DropdownMenuTrigger className="schema-daglas" aria-label={`Åtgärder för ${heading.toLowerCase()}`}>{heading}</DropdownMenuTrigger><DropdownMenuContent><DropdownMenuItem onClick={() => onLockDay(day)}>Lås hela dagen</DropdownMenuItem><DropdownMenuItem onClick={() => onLockDay(day, false)}>Lås upp hela dagen</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : heading}{daterad && !schoolDay && <span className="schema-dagorsak">{reason ?? 'Ingen undervisning'}</span>}</h3>
        <ol data-day={day} data-start={start} data-span={end - start} onPointerDown={e => { if (!daterad) markera(e, day); }}>
          {!daterad && markering?.day === day && <li className={`schema-markering${markering.tom ? ' tom' : ''}`} style={at(markering.startMin, markering.endMin, start)}>
            <button type="button" data-markering="" aria-label={markeringNamn?.(markering) ?? `Markerad tid ${dayName(day).toLowerCase()} ${clock(markering.startMin)}–${clock(markering.endMin)}`}
              aria-describedby={markeringHjalp}><span>{clock(markering.startMin)}–{clock(markering.endMin)}</span></button></li>}
          {lessons.map(l => {
            const o = actual.get(l.id), original = o?.lesson ?? l;
            const rader = daterad ? [...(shownLength(l) !== l.durationMin ? [`${shownLength(l)} min · ${l.durationMin} i grundschemat`] : []),
              ...(o?.changed ? ['Ändrat tillfälle'] : []),
              ...(extra?.(original) ?? []).filter(x => !x.startsWith('kortare ') && !x.includes('i grundschemat')),
              ...('egenAktivitet' in l && l.egenAktivitet ? ['Grundschemaaktivitet'] : [])] : extra?.(l);
            return <Pass key={l.id} lesson={l} origin={start} length={shownLength(l)} lane={lane.get(l.id)!} picked={o && pickedOccurrence ? o.key === pickedOccurrence : picked === original.id || (ram?.lessons ?? selected).includes(original.id)} flagged={flagged.has(original.id)}
              dragging={!daterad && drop?.lesson === l.id} disabled={disabled} detail={detail(original)} rader={rader} occurrence={o} locked={locked?.(original)} onGrab={daterad ? () => undefined : onGrab} onPick={o && onOccurrence ? () => onOccurrence(o) : onPick}/>;
          })}
          {beside.map(({ b, l }, i) => {
            const from = b.side === 'fore' ? l.startMin! - b.minutes : l.startMin! + shownLength(l), place = lane.get(l.id)!;
            return <li key={`b${i}`} className={`schema-band falt-${b.kind ?? 'marginal'}`} style={{ ...at(from, from + b.minutes, start), '--lane': place.lane, '--lanes': place.lanes } as CSSProperties}>
              <span className="sr-only">{b.side === 'fore' ? 'Före' : 'Efter'} {l.title}: </span>{b.label}</li>;
          })}
          {!daterad && drop && drop.to?.day === day && drop.to.startMin !== null && <li className="schema-lesson schema-drop" aria-hidden="true" style={{ '--start': drop.to.startMin - start, '--length': drop.length } as CSSProperties}>
            <time>{clock(drop.to.startMin)}–{clock(drop.to.startMin + drop.length)}</time></li>}
          {dim.map((x, i) => <li key={`d${i}`} className="schema-falt falt-tillaten-ute" style={at(x.startMin, x.endMin, start)}>
            <span className="sr-only">{typ('tillaten-ute')}, {clock(x.startMin)}–{clock(x.endMin)}</span></li>)}
          {fields.map((o, i) => {
            const content = <><span className="sr-only">{typ(o.kind)}: </span><span>{o.label}</span><span className="sr-only">, {clock(o.startMin)}–{clock(o.endMin)}</span></>;
            const interactive = falt && o.sourceId ? falt(o, `${typ(o.kind)}: ${o.label}, ${clock(o.startMin)}–${clock(o.endMin)}`, content) : null;
            return <li key={`f${i}`} className={`schema-falt falt-${o.kind}${interactive ? ' kalla' : ''}`} style={at(o.startMin, o.endMin, start)} data-source={o.sourceId}>{interactive ?? content}</li>;
          })}
          {lessons.length === 0 && <li className="schema-free">{daterad && !schoolDay ? reason ?? 'Ingen undervisning' : 'Inga pass'}</li>}</ol>
      </section>;
    })}
    {ram && <span aria-hidden="true" className="schema-urvalsram" style={{ left: ram.left, top: ram.top, width: ram.width, height: ram.height }}/>}
  </div>;
  return daterad ? <div className="schema-daterad-ram" style={{ '--date-days': columns.length } as CSSProperties}>{grid}</div> : grid;
}

/** Teckenförklaring under veckan (Main), byggd av samma klasser som fälten och passen. Visar bara det som syns i veckan. */
export function Teckenforklaring({ lessons, picked, flagged, overlays = [], bands = [], dimmed = [], namn = {} }: Pick<VeckaProps, 'lessons' | 'picked' | 'flagged' | 'overlays' | 'bands' | 'dimmed' | 'namn'>) {
  const kinds = new Set<SchemaFaltTyp>(overlays.map(o => o.kind));
  if (dimmed.length) kinds.add('tillaten-ute');
  const bandKinds = new Set(bands.map(b => b.kind ?? 'marginal'));
  const items: { key: string; swatch: string; text: string }[] = [
    ...SCHEMA_FALT.filter(k => kinds.has(k)).map(k => ({ key: k, swatch: `falt-${k}`, text: namn[k] ?? FALT[k] })),
    ...(['marginal', 'restid'] as const).filter(k => bandKinds.has(k)).map(k => ({ key: `band-${k}`, swatch: `falt-${k}`, text: namn[`band-${k}`] ?? BAND[k] })),
    ...lessons.some(l => l.locked) ? [{ key: 'locked', swatch: 'schema-sw-pass', text: 'Låst pass' }] : [],
    ...lessons.some(l => l.vacant) ? [{ key: 'vacant', swatch: 'schema-sw-pass vacant', text: 'Pass utan lärare' }] : [],
    ...lessons.some(l => flagged.has(l.id)) ? [{ key: 'deviation', swatch: 'schema-sw-pass deviation', text: 'Regelavvikelse' }] : [],
    ...picked !== null && lessons.some(l => l.id === picked) ? [{ key: 'picked', swatch: 'schema-sw-pass picked', text: 'Markerat pass' }] : [],
  ];
  if (items.length === 0) return null;
  return <ul className="schema-legend" aria-label="Teckenförklaring">
    {items.map(x => <li key={x.key}><span className={`schema-sw ${x.swatch}`} aria-hidden="true"/>{x.text}</li>)}
  </ul>;
}
