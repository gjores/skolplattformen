// Dra ett pass med mus eller penna till en ny tid eller till viloytan (05.2-SM-FLYTT, D1). Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
// Pekskärm och staplad vy använder flyttpanelen.
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { startTimes } from './delat.ts';

export type Mal = { day: number | null; startMin: number | null };
export type DraVal = {
  forslag: SchemaForslag;
  grid: HTMLElement | null;
  rest: HTMLElement | null;
  start: number; end: number;
  /** Var passet hamnar om det släpps nu (null: ingen giltig plats). */
  onHover: (to: Mal | null) => void;
  /** Draget är slut, släppt eller avbrutet. */
  onEnd: () => void;
  /** Passet släpptes på en ny plats. */
  onDrop: (to: Mal) => void;
  /** Sätts kort efter ett drag så att släppet inte också räknas som ett klick på passet. */
  skipClick: { current: boolean };
};

export function dra(e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson, { forslag: f, grid, rest, start, end, onHover, onEnd, onDrop, skipClick }: DraVal) {
  if (!grid || e.pointerType === 'touch' || e.button !== 0 || !grid.querySelector<HTMLElement>('.schema-hours')?.offsetParent) return;
  const columns = [...grid.querySelectorAll<HTMLElement>('ol[data-day]')], span = end - start, own = e.currentTarget.closest('ol[data-day]')?.getBoundingClientRect();
  // Var i passet pekaren håller, i minuter från passets början.
  const held = own ? (e.clientY - e.currentTarget.getBoundingClientRect().top) * span / own.height : Math.min(15, l.durationMin / 2);
  const at = (x: number, y: number): Mal | null => {
    const r = rest?.getBoundingClientRect();
    if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { day: null, startMin: null };
    for (const column of columns) {
      const box = column.getBoundingClientRect(), day = Number(column.dataset.day);
      if (x < box.left || x > box.right || y < box.top - 24 || y > box.bottom + 24) continue;
      const starts = startTimes(f, day, l.durationMin + l.marginMin), wanted = start + (y - box.top) * span / box.height - held;
      return starts.length ? { day, startMin: starts.reduce((best, m) => Math.abs(m - wanted) < Math.abs(best - wanted) ? m : best) } : null;
    }
    return null;
  };
  const origin = { x: e.clientX, y: e.clientY };
  let active = false;
  const move = (ev: PointerEvent) => {
    if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return;
    active = true; ev.preventDefault();
    onHover(at(ev.clientX, ev.clientY));
  };
  const done = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
    onEnd();
    if (!active) return;
    skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0);
    const to = ev.type === 'pointerup' ? at(ev.clientX, ev.clientY) : null;
    if (to && (to.day !== l.day || to.startMin !== l.startMin)) onDrop(to);
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
}
