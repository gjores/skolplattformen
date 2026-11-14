'use client';
// Tidsrutnätet i villkorstabellens cellredigerare (05.2-SM-VILLKORSTABELL, Q123): veckans dagar × tid i startrutnätet, som tidsönskemålen i Untis.
// Markera genom att dra över rutorna, eller med piltangenterna, Mellanslag och Skift+pil. Spärrad tid ritas med fältmönstret `falt-sparrad`, tid utanför
// tillåten tid med `falt-tillaten-ute`, som i veckan. Rutnätet ger bara markerade rutor; redigeraren gör dem till egna villkor.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { vtRutaText, vtRutor, type VtRutnat } from '@/lib/schema-villkorstabell.ts';

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
type Ruta = { day: number; i: number };

export function Tidsrutnat({ rutnat: g, typ, value, label, onChange, onEnter }: {
  rutnat: VtRutnat; typ: 'sparrad' | 'tillaten'; value: boolean[][]; label: string; onChange: (next: boolean[][]) => void;
  /** Enter i rutnätet: redigeraren sparar. */ onEnter?: () => void;
}) {
  const n = vtRutor(g), [aktiv, setAktiv] = useState<Ruta>({ day: 0, i: 0 });
  const grid = useRef<HTMLTableElement | null>(null), fokus = useRef(false);
  // Ett drag målar en rektangel från rutan där det började, med det läge den rutan fick (markerad eller inte), ovanpå rutorna som de var före draget.
  const drag = useRef<{ from: Ruta; paint: boolean; base: boolean[][] } | null>(null);
  useEffect(() => {
    const end = () => { drag.current = null; };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);
  useEffect(() => {
    if (!fokus.current) return;
    fokus.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-ruta="${aktiv.day}-${aktiv.i}"]`)?.focus();
  }, [aktiv]);

  const satt = (base: boolean[][], a: Ruta, b: Ruta, paint: boolean) => base.map((row, day) => day < Math.min(a.day, b.day) || day > Math.max(a.day, b.day) ? row
    : row.map((x, i) => i >= Math.min(a.i, b.i) && i <= Math.max(a.i, b.i) ? paint : x));
  const flytta = (to: Ruta) => { fokus.current = true; setAktiv(to); };
  function onKeyDown(e: ReactKeyboardEvent<HTMLElement>, r: Ruta) {
    const step: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); return; }
    if (e.key === ' ') { e.preventDefault(); onChange(satt(value, r, r, !value[r.day][r.i])); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); flytta({ day: r.day, i: e.key === 'Home' ? 0 : n - 1 }); return; }
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    const to = { day: Math.min(g.days - 1, Math.max(0, r.day + d[0])), i: Math.min(n - 1, Math.max(0, r.i + d[1])) };
    // Skift+pil markerar vidare: rutan man går till får samma läge som rutan man kommer från.
    if (e.shiftKey) onChange(satt(value, to, to, value[r.day][r.i]));
    flytta(to);
  }

  const any = value.some(row => row.some(Boolean));
  const klass = (on: boolean) => typ === 'sparrad' ? (on ? ' falt-sparrad' : '') : any && !on ? ' falt-tillaten-ute' : on ? ' vt-tillaten' : '';
  return <Table ref={grid} role="grid" aria-label={label} className="tidsrutnat" style={{ '--dagar': g.days } as CSSProperties} onPointerLeave={() => { drag.current = null; }}>
    <TableHeader><TableRow>
      <TableHead scope="col" className="tidsrutnat-horn"><span className="sr-only">Tid</span></TableHead>
      {DAYS.slice(0, g.days).map(d => <TableHead key={d} scope="col">{d.slice(0, 3)}<span className="sr-only">{d.slice(3)}</span></TableHead>)}
    </TableRow></TableHeader>
    <TableBody>{Array.from({ length: n }, (_, i) => {
      const at = g.from + i * g.step, hel = at % 60 === 0;
      return <TableRow key={i} className={hel ? 'hel' : undefined}>
        <TableHead scope="row" className="tidsrutnat-tid"><span className={hel ? undefined : 'sr-only'}>{clock(at)}</span></TableHead>
        {value.map((row, day) => {
          const on = row[i], r = { day, i };
          return <TableCell key={day} data-ruta={`${day}-${i}`} tabIndex={aktiv.day === day && aktiv.i === i ? 0 : -1} aria-selected={on}
            aria-label={`${vtRutaText(g, day, i)}${on ? typ === 'sparrad' ? ', spärrad' : ', tillåten' : ''}`} className={`tidsrutnat-ruta${klass(on)}`}
            onKeyDown={e => onKeyDown(e, r)} onFocus={() => setAktiv(r)}
            onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.focus(); const paint = !on; drag.current = { from: r, paint, base: value }; onChange(satt(value, r, r, paint)); }}
            onPointerEnter={() => { const d = drag.current; if (d) onChange(satt(d.base, d.from, r, d.paint)); }}/>;
        })}
      </TableRow>;
    })}</TableBody>
  </Table>;
}
