'use client';
// Veckorutnätet (05.2-SM-YTA): tidsaxel, dagar, pass och lager. Lagren ritas under passen (fält, nedtoning) och intill dem (band).
// Utan lager ritas inget extra och veckan ser ut som före uppdelningen.
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, Ref } from 'react';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { SCHEMA_FALT, markeringMellan, type SchemaBand, type SchemaDimmed, type SchemaFaltTyp, type SchemaMarkering, type SchemaOverlay, type SchemaVerktyg } from '@/lib/schema-utkast.ts';
import { clock, dayName } from './delat.ts';
import { Pass } from './pass.tsx';

/** Fälttypernas namn, i teckenförklaringen och för skärmläsare. */
export const FALT: Record<SchemaFaltTyp, string> = {
  sparrad: 'Spärrad tid', 'tillaten-ute': 'Utanför tillåten tid', lunch: 'Lunchfönster', marginal: 'Marginal', aktivitet: 'Aktivitet', installt: 'Inställt pass',
  fri: 'Fri: passet kan läggas här', onskemal: 'Bryter ett önskemål', byte: 'Går med ett byte', brott: 'Regelbrott',
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
  onPick: (l: SchemaForslagLesson) => void;
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
};

/** Minuten i rutnätet under en punkt i en dags kolumn. */
export function minutVid(ol: HTMLElement, clientY: number): number {
  const box = ol.getBoundingClientRect(), start = Number(ol.dataset.start), span = Number(ol.dataset.span);
  return start + (clientY - box.top) * span / box.height;
}
/** Veckan visas som rutnät (inte staplad lista på smal yta). Menyer och verktyg finns bara då. */
export const somRutnat = (week: HTMLElement | null) => !!week?.querySelector<HTMLElement>('.schema-hours')?.offsetParent;

const at = (from: number, to: number, origin: number) => ({ '--start': from - origin, '--length': to - from }) as CSSProperties;

export function Vecka({ days, lessons: all, picked, drop, flagged, disabled, length, detail, onGrab, onPick, overlays = [], bands = [], dimmed = [], gridRef, extra, locked, falt, namn = {},
  verktyg = 'markera', markering = null, markeringNamn, markeringHjalp, onMarkera }: VeckaProps) {
  const { start, end, hours } = veckansSpann(days);
  // Dra över tom tid med Spärra eller Tillåt bara (05.2-SM-MENY): från punkten där musen trycktes ned till där den släpps, på 5-minutersrutnätet.
  const markera = (e: ReactPointerEvent<HTMLOListElement>, day: number) => {
    if (!onMarkera || (verktyg !== 'sparra' && verktyg !== 'tillat') || e.button !== 0 || e.pointerType === 'touch' || disabled) return;
    if ((e.target as HTMLElement).closest('.schema-lesson') || !somRutnat(e.currentTarget.closest('.schema-week'))) return;
    const ol = e.currentTarget, from = minutVid(ol, e.clientY);
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
  return <div ref={gridRef} className={`schema-week verktyg-${verktyg}`} style={{ '--days': days.length, '--span': end - start, '--first-hour': (hours[0] ?? start) - start } as CSSProperties}>
    <div className="schema-hours" aria-hidden="true">{hours.map(h => <span key={h} style={{ '--at': h - start } as CSSProperties}>{clock(h)}</span>)}</div>
    {days.map((_, day) => {
      const lessons = all.filter(l => l.day === day && l.startMin !== null).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id));
      const lane = lanes(lessons);
      // Lunchfönstret ligger underst, så att spärrad tid och andra fält syns ovanpå det (Main).
      const fields = overlays.filter(o => o.day === day).map(clip).filter(o => o.startMin < o.endMin).sort((a, b) => Number(b.kind === 'lunch') - Number(a.kind === 'lunch'));
      const dim = dimmed.filter(x => x.day === day).map(clip).filter(x => x.startMin < x.endMin);
      const beside = bands.flatMap(b => { const l = lessons.find(x => x.id === b.lesson); return l && b.minutes > 0 ? [{ b, l }] : []; });
      const typ = (kind: SchemaFaltTyp) => namn[kind] ?? FALT[kind];
      // Passen står först i dagen, så att tangentbordet når dem före fälten; fälten ritas ändå under passen (z-index i schema.css).
      return <section className="schema-day" key={day} aria-label={dayName(day)}>
        <h3>{dayName(day)}</h3>
        <ol data-day={day} data-start={start} data-span={end - start} onPointerDown={e => markera(e, day)}>
          {markering?.day === day && <li className={`schema-markering${markering.tom ? ' tom' : ''}`} style={at(markering.startMin, markering.endMin, start)}>
            <button type="button" data-markering="" aria-label={markeringNamn?.(markering) ?? `Markerad tid ${dayName(day).toLowerCase()} ${clock(markering.startMin)}–${clock(markering.endMin)}`}
              aria-describedby={markeringHjalp}><span>{clock(markering.startMin)}–{clock(markering.endMin)}</span></button></li>}
          {lessons.map(l => <Pass key={l.id} lesson={l} origin={start} length={length(l)} lane={lane.get(l.id)!} picked={picked === l.id} flagged={flagged.has(l.id)}
            dragging={drop?.lesson === l.id} disabled={disabled} detail={detail(l)} rader={extra?.(l)} locked={locked?.(l)} onGrab={onGrab} onPick={onPick}/>)}
          {beside.map(({ b, l }, i) => {
            const from = b.side === 'fore' ? l.startMin! - b.minutes : l.startMin! + length(l), place = lane.get(l.id)!;
            return <li key={`b${i}`} className={`schema-band falt-${b.kind ?? 'marginal'}`} style={{ ...at(from, from + b.minutes, start), '--lane': place.lane, '--lanes': place.lanes } as CSSProperties}>
              <span className="sr-only">{b.side === 'fore' ? 'Före' : 'Efter'} {l.title}: </span>{b.label}</li>;
          })}
          {drop && drop.to?.day === day && drop.to.startMin !== null && <li className="schema-lesson schema-drop" aria-hidden="true" style={{ '--start': drop.to.startMin - start, '--length': drop.length } as CSSProperties}>
            <time>{clock(drop.to.startMin)}–{clock(drop.to.startMin + drop.length)}</time></li>}
          {dim.map((x, i) => <li key={`d${i}`} className="schema-falt falt-tillaten-ute" style={at(x.startMin, x.endMin, start)}>
            <span className="sr-only">{typ('tillaten-ute')}, {clock(x.startMin)}–{clock(x.endMin)}</span></li>)}
          {fields.map((o, i) => {
            const content = <><span className="sr-only">{typ(o.kind)}: </span><span>{o.label}</span><span className="sr-only">, {clock(o.startMin)}–{clock(o.endMin)}</span></>;
            const interactive = falt && o.sourceId ? falt(o, `${typ(o.kind)}: ${o.label}, ${clock(o.startMin)}–${clock(o.endMin)}`, content) : null;
            return <li key={`f${i}`} className={`schema-falt falt-${o.kind}${interactive ? ' kalla' : ''}`} style={at(o.startMin, o.endMin, start)} data-source={o.sourceId}>{interactive ?? content}</li>;
          })}
          {lessons.length === 0 && <li className="schema-free">Inga pass</li>}</ol>
      </section>;
    })}
  </div>;
}

/** Teckenförklaring under veckan (Main), byggd av samma klasser som fälten och passen. Visar bara det som syns i veckan. */
export function Teckenforklaring({ lessons, picked, flagged, overlays = [], bands = [], dimmed = [], namn = {} }: Pick<VeckaProps, 'lessons' | 'picked' | 'flagged' | 'overlays' | 'bands' | 'dimmed' | 'namn'>) {
  const kinds = new Set<SchemaFaltTyp>(overlays.map(o => o.kind));
  if (dimmed.length) kinds.add('tillaten-ute');
  const bandKinds = new Set(bands.map(b => b.kind ?? 'marginal'));
  const items: { key: string; swatch: string; text: string }[] = [
    ...SCHEMA_FALT.filter(k => kinds.has(k)).map(k => ({ key: k, swatch: `falt-${k}`, text: namn[k] ?? FALT[k] })),
    ...(['marginal', 'restid'] as const).filter(k => bandKinds.has(k)).map(k => ({ key: `band-${k}`, swatch: `falt-${k}`, text: namn[`band-${k}`] ?? BAND[k] })),
    ...lessons.some(l => l.vacant) ? [{ key: 'vacant', swatch: 'schema-sw-pass vacant', text: 'Pass utan lärare' }] : [],
    ...lessons.some(l => flagged.has(l.id)) ? [{ key: 'deviation', swatch: 'schema-sw-pass deviation', text: 'Regelavvikelse' }] : [],
    ...picked !== null && lessons.some(l => l.id === picked) ? [{ key: 'picked', swatch: 'schema-sw-pass picked', text: 'Markerat pass' }] : [],
  ];
  if (items.length === 0) return null;
  return <ul className="schema-legend" aria-label="Teckenförklaring">
    {items.map(x => <li key={x.key}><span className={`schema-sw ${x.swatch}`} aria-hidden="true"/>{x.text}</li>)}
  </ul>;
}
