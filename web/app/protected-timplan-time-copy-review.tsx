'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GymTimplanV2 } from '@/lib/gym-timplan.ts';
import { formatTimplanMinutes } from '@/lib/timplan-time.ts';

/** The parent owns the single durable command journal and current mandate. */
export default function TimplanTimeCopyReview({ plan, disabled, onResolve }: {
  plan: GymTimplanV2; disabled: boolean; onResolve: (reviewId: string, note: string) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const pending = plan.timeCopyReview.filter(item => item.resolution === null);
  if (!plan.timeCopyReview.length) return null;
  return <details className="gt-explanation" open={pending.length > 0}>
    <summary>Granska kopierad undervisningstid{pending.length ? ` (${pending.length} kvar)` : ' – klart'}</summary>
    <p>Tid från ett ändrat eller borttaget ämnesunderlag kunde inte följa med. Fördela tiden i den nya tabellen eller beskriv varför den ska utgå. Originalets uppgifter bevaras.</p>
    {plan.timeCopyReview.map(item => {
      const row = plan.rows.find(row => row.key === item.rowKey), school = item.row.schoolMinutes.reduce<number>((n, v) => n + (v ?? 0), 0), apl = item.row.annualAplMinutes.reduce<number>((n, v) => n + (v ?? 0), 0);
      return <section key={item.id} className="gt-copy-review-item"><h3>{row ? `${row.name} ${row.levelName}` : 'Ämne som saknas i det nya underlaget'}</h3>
        <p>Källversion {item.sourceVersion} · {item.reason === 'missing_row' ? 'Ämnesraden saknas' : 'Poäng- eller terminsramen har ändrats'}.</p>
        <p>Skola: {formatTimplanMinutes(school)} timmar · APL: {formatTimplanMinutes(apl)} timmar.</p>
        <ul>{[0, 1, 2].map(y => <li key={y}>Årskurs {y + 1}: HT {formatTimplanMinutes(item.row.schoolMinutes[y * 2]) || 'ofördelat'} · VT {formatTimplanMinutes(item.row.schoolMinutes[y * 2 + 1]) || 'ofördelat'} · APL {formatTimplanMinutes(item.row.annualAplMinutes[y]) || 'ofördelat'}</li>)}</ul>
        {item.resolution ? <p>Hanterat: {item.resolution.note}</p> : <><label>Så har tiden hanterats<textarea maxLength={2000} disabled={disabled} value={notes[item.id] ?? ''} onChange={e => setNotes(previous => ({ ...previous, [item.id]: e.target.value }))}/></label>
          <Button disabled={disabled || !(notes[item.id] ?? '').trim()} onClick={() => onResolve(item.id, notes[item.id].trim())}>Markera uppgiften som hanterad</Button></>}
      </section>;
    })}
  </details>;
}
