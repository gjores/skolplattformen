'use client';
// Möjlighetskartan (05.2-SM-FOLJ): översta raden i Följ passet. Var passet kan ligga i veckan och varför inte, ur motorns lägen (05.2-SM-LAGEN).
// Raden är ett tabbstopp; piltangenterna går mellan starttiderna. Pekning eller fokus visar "Varför inte …?". En fri tid flyttar passet dit.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { SchemaForslag } from '@/lib/schema-contract.ts';
import { lagesStrackor } from '@/lib/schema-folj.ts';
import { varfor, type SchemaLage, type SchemaLagen, type SchemaLagenKontext, type SchemaLagenPosition } from '@/lib/schema-lagen.ts';
import { clock, dayName } from './delat.ts';

/** Lägenas namn i teckenförklaringen och för skärmläsare (Samlingsvy). */
export const LAGE: Record<SchemaLage, string> = { fri: 'Fri: passet kan läggas här', onskemal: 'Bryter ett önskemål (håltid, sen dag)', byte: 'Går med ett byte', brott: 'Regelbrott', sparrad: 'Spärrad tid' };
const KORT: Record<SchemaLage, string> = { fri: 'fri', onskemal: 'bryter ett önskemål', byte: 'går med ett byte', brott: 'regelbrott', sparrad: 'spärrad tid' };
/** Fältklassen för läget, samma mönster som i veckan (05.2-SM-YTA). */
export const LAGE_KLASS: Record<SchemaLage, string> = { fri: 'falt-fri', onskemal: 'falt-onskemal', byte: 'falt-byte', brott: 'falt-brott', sparrad: 'falt-sparrad' };

type Props = {
  days: SchemaForslag['days']; span: { start: number; end: number }; step: number;
  lesson: string; title: string; lengthMin: number;
  lagen: SchemaLagen | null; loading: boolean; kontext: SchemaLagenKontext;
  /** En flytt pågår eller kan inte göras just nu. */
  disabled: boolean;
  /** Utkastet har salregister: ett läge utan sal betyder att passets egen sal inte är ledig där (05.2-SM-UXF-43). */
  medSalregister?: boolean;
  onMove: (p: SchemaLagenPosition) => void;
};

export function Mojligt({ days, span, step, lesson, title, lengthMin, lagen, loading, kontext, disabled, medSalregister = false, onMove }: Props) {
  const tip = useId();
  const positions = [...lagen?.positions ?? []].sort((a, b) => a.day - b.day || a.startMin - b.startMin);
  const here = kontext.placements.find(p => p.lesson === lesson);
  const start = Math.max(0, positions.findIndex(p => here ? p.day === here.day && p.startMin === here.startMin : p.state === 'fri'));
  const [focus, setFocus] = useState<number | null>(null), [aktiv, setAktiv] = useState<number | null>(null), [inne, setInne] = useState(false);
  const [pinned, setPinned] = useState<number | null>(null), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null), moveButton = useRef<HTMLButtonElement | null>(null);
  const keepOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); closeTimer.current = null; };
  const closeLater = () => { keepOpen(); closeTimer.current = setTimeout(() => { if (!inne && pinned === null) setAktiv(null); }, 180); };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const current = focus !== null && focus < positions.length ? focus : start;
  // Med salregister (05.2-SM-UXF-43): en fri tid där passets egen sal inte är ledig ger ett lättare fält, och passet blir utan sal där.
  const utanSal = (p: SchemaLagenPosition) => medSalregister && !!here?.room && p.room === null, salNamn = here?.room ? kontext.rooms.find(r => r.id === here.room)?.name || 'Salen' : '';
  const strackor = lagesStrackor(positions.map(p => ({ ...p, state: p.state === 'fri' && utanSal(p) ? 'fri-utan-sal' as const : p.state })), step);
  const pos = (from: number, to: number) => ({ '--at': from - span.start, '--length': to - from }) as CSSProperties;
  const shown = aktiv !== null && aktiv < positions.length ? aktiv : null;

  function go(i: number, e: KeyboardEvent<HTMLElement>) {
    e.preventDefault();
    const next = Math.max(0, Math.min(positions.length - 1, i));
    setFocus(next); setAktiv(next);
    (e.currentTarget.closest('.folj-mojligt')?.querySelector(`[data-start="${next}"]`) as HTMLElement | null)?.focus();
  }
  function key(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const p = positions[i], sameDay = positions.flatMap((x, j) => x.day === p.day ? [j] : []);
    const nearest = (day: number) => {
      const own = positions.flatMap((x, j) => x.day === day ? [j] : []);
      return own.reduce((best, j) => Math.abs(positions[j].startMin - p.startMin) < Math.abs(positions[best].startMin - p.startMin) ? j : best, own[0]);
    };
    const dayAfter = (dir: 1 | -1) => { for (let d = p.day + dir; d >= 0 && d < days.length; d += dir) if (positions.some(x => x.day === d)) return d; return null; };
    if (e.key === 'ArrowRight') go(i + 1, e);
    else if (e.key === 'ArrowLeft') go(i - 1, e);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { const d = dayAfter(e.key === 'ArrowDown' ? 1 : -1); if (d !== null) go(nearest(d), e); else e.preventDefault(); }
    else if (e.key === 'Home') go(sameDay[0], e);
    else if (e.key === 'End') go(sameDay.at(-1)!, e);
    else if (e.key === 'Tab' && !e.shiftKey && shown !== null) { e.preventDefault(); moveButton.current?.focus(); }
    else if (e.key === 'Escape' && shown !== null) { e.preventDefault(); setPinned(null); setAktiv(null); }
  }

  return <div className="folj-rad folj-mojligt" onPointerLeave={closeLater}
    onFocus={() => setInne(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !(e.relatedTarget as HTMLElement | null)?.closest('[data-schema-why]')) { setInne(false); closeLater(); } }}>
    <div className="folj-namn"><b>Möjliga starttider</b><small>{title}, {lengthMin} min</small></div>
    {days.map((_, day) => <div key={day} className="folj-dag">
      {strackor.filter(s => s.day === day).map(s => <span key={s.from} aria-hidden="true" className={`folj-lage ${s.state === 'fri-utan-sal' ? 'falt-fri-utan-sal' : LAGE_KLASS[s.state]}`} style={pos(s.from, s.to)}/>)}
      {positions.map((p, i) => p.day !== day ? null : <button key={i} type="button" data-start={i} className="folj-start" style={pos(p.startMin, p.startMin + step)}
        tabIndex={i === current ? 0 : -1} aria-disabled={disabled} data-aktiv={shown === i ? '' : undefined}
        aria-haspopup="dialog" aria-expanded={shown === i} aria-controls={shown === i ? tip : undefined}
        aria-label={`${dayName(day)} ${clock(p.startMin)}: ${KORT[p.state]}${utanSal(p) ? ', passet blir utan sal' : ''}${p.state === 'fri' && !utanSal(p) ? '. Välj för att flytta passet hit.' : ''}`}
        onPointerEnter={() => { keepOpen(); setPinned(null); setAktiv(i); }} onFocus={() => { keepOpen(); setFocus(i); setAktiv(i); }} onKeyDown={e => key(e, i)}
        onClick={() => { if (p.state === 'fri' && !utanSal(p) && !disabled) onMove(p); else { setPinned(i); setAktiv(i); } }}/>)}
      {shown !== null && positions[shown].day === day && <Popover open onOpenChange={open => { if (!open) { setPinned(null); setAktiv(null); } }}>
        <PopoverTrigger nativeButton={false} render={<span aria-hidden="true" tabIndex={-1} className="folj-ankare" style={pos(positions[shown].startMin, positions[shown].startMin + step)}/>}/>
        <PopoverContent id={tip} data-schema-why aria-label={`Varför inte ${dayName(day)} ${clock(positions[shown].startMin)}?`} initialFocus={false} finalFocus={false}
          side="bottom" className="folj-varfor" onPointerEnter={keepOpen} onPointerLeave={closeLater}>
          {varfor(lesson, positions[shown], kontext).map((line, n, all) => <span key={n} className={n === 0 ? 'rubrik' : n === all.length - 1 ? 'lage' : undefined}>{line}</span>)}
          {utanSal(positions[shown]) && <span>{salNamn} är inte ledig då. Passet blir utan sal.</span>}
          <p className="text-sm text-muted-foreground">Flytten kontrolleras. Eventuella regelavvikelser visas i utkastet.</p>
          <Button ref={moveButton} type="button" disabled={disabled} className="min-h-(--control-height) whitespace-normal" onClick={() => { onMove(positions[shown]); setPinned(null); setAktiv(null); }}>Lägg här</Button>
        </PopoverContent>
      </Popover>}
      {!positions.some(p => p.day === day) && !loading && lagen && <span className="folj-tom">Ingen starttid</span>}
    </div>)}
    {(loading || !lagen) && <p className="folj-laddar schema-note" aria-hidden="true">{loading ? 'Räknar möjliga starttider…' : ''}</p>}
  </div>;
}
