// Gemensamma texter och små hjälpfunktioner för arbetsytan i Schema (05.2-SM-YTA). Inga React-komponenter här.
import type { SchemaForslag, SchemaPeriod, SchemaRegel, SchemaRegelSlag, SchemaRegelTyp, SchemaTerm, SchemaVillkor } from '@/lib/schema-contract.ts';
import { marginalTider, upptarText } from '@/lib/schema-marginal.ts';

export const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
export const dayName = (day: number) => DAYS[day] ?? `Dag ${day + 1}`;
export const TERM: Record<SchemaTerm, string> = { ht: 'Höstterminen', vt: 'Vårterminen' };
export const PERIOD: Record<SchemaPeriod, string> = { lasar: 'Hela läsåret', ...TERM };
export const SAME_DAY: Record<SchemaVillkor['sameDay'], string> = { avoid: 'Undvik', forbid: 'Förbjud', allow: 'Tillåt' };

export const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const hoursText = (minutes: number) => `${(minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
export const minutesOf = (value: string) => { const [h, m] = value.split(':').map(Number); return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null; };
export const steps = (from: number, to: number, step: number, current: number | null) => { const all = Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step); return current === null || all.includes(current) ? all : [...all, current].sort((a, b) => a - b); };
export const names = (ids: string[], all: { id: string; name: string }[]) => ids.map(id => all.find(x => x.id === id)?.name ?? '').filter(Boolean).join(', ');

/** Starttider på startrutnätet där passet ryms inom skoldagen, med `beforeMin` marginal före passet (05.2-SM-MARGINAL). */
export function startTimes(forslag: SchemaForslag, day: number, durationMin: number, beforeMin = 0): number[] {
  const frame = forslag.days[day], result: number[] = [];
  if (frame) for (let m = frame.startMin; m + durationMin <= frame.endMin; m += forslag.startGridMin) if (m - beforeMin >= frame.startMin) result.push(m);
  return result;
}

/** Skoldagarna i klartext: lika dagar skrivs som ett spann. */
export function daysText(days: SchemaVillkor['days']): string {
  if (days.every(x => x.startMin === days[0].startMin && x.endMin === days[0].endMin)) return `${clock(days[0].startMin)}–${clock(days[0].endMin)} måndag–fredag`;
  return days.map((x, i) => `${DAYS[i].toLowerCase()} ${clock(x.startMin)}–${clock(x.endMin)}`).join(', ');
}

export const SLAG: Record<SchemaRegelSlag, string> = { klass: 'Klass', grupp: 'Grupp', amne: 'Ämne', larare: 'Lärare', sal: 'Sal', pass: 'Pass' };
export const REGEL: Record<SchemaRegelTyp, string> = { sparrad: 'Spärrad tid', tillaten: 'Tillåten tid', marginal: 'Marginal', langd: 'Uppdelning: längsta pass', antal: 'Uppdelning: antal pass per vecka', sal: 'Sal' };
export type Resurser = SchemaForslag['resurser'];
/** Ett eget villkor i klartext. Namn på klass, grupp och lärare finns först när ett förslag har tagits fram. */
export function ruleText(r: SchemaRegel, resurser: Resurser | null): string {
  const name = r.slag === 'sal' || r.slag === 'amne' ? r.ref : resurser === null ? '(namnet visas när ett förslag finns)' : resurser[r.slag].find(x => x.ref === r.ref)?.name ?? '(finns inte i underlaget)';
  const when = (x: { days: number[]; startMin: number; endMin: number }) => `${x.days.length === 5 ? 'alla dagar' : [...x.days].sort((a, b) => a - b).map(i => DAYS[i].toLowerCase()).join(', ')} ${clock(x.startMin)}–${clock(x.endMin)}`;
  const what = r.typ === 'sparrad' ? `spärrad ${when(r)}` : r.typ === 'tillaten' ? `bara ${when(r)}` : r.typ === 'marginal' ? `marginal ${marginalTider(r)} (${r.label}), upptar ${upptarText(r.occupies).toLocaleLowerCase('sv-SE')}`
    : r.typ === 'langd' ? `pass om högst ${r.maxMin} min` : r.typ === 'antal' ? `${r.count} pass per vecka` : 'rooms' in r ? `sal ${r.rooms.join(' eller ')}` : '';
  return `${SLAG[r.slag]} ${name}: ${what}`;
}
