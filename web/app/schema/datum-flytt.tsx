'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SchemaForslag, SchemaKontrollRequest } from '@/lib/schema-contract.ts';
import { schemaDatumTermTillaten, type SchemaDatumAndring, type SchemaDatumTillfalle } from '@/lib/schema-datum.ts';
import { schemaDateText, schemaWeekday } from '@/lib/schema-vecka.ts';
import { clock } from './delat';
import { SalSok } from './sal-sok';

export function DatumFlytt({ occurrence: o, forslag: f, busy, error, salScope, datedOverrides, onSessionLost, onSave, onClose, onBase }: {
  occurrence: SchemaDatumTillfalle; forslag: SchemaForslag; busy: boolean; error: string | null;
  onSave: (change: SchemaDatumAndring | null) => void; onClose: () => void; onBase: () => void;
  salScope: SchemaKontrollRequest | null; datedOverrides: SchemaDatumAndring[]; onSessionLost: () => void;
}) {
  const id = useId(), [date, setDate] = useState(o.date), [time, setTime] = useState(clock(o.lesson.startMin!));
  const [room, setRoom] = useState(o.lesson.roomId ?? ''), [localError, setLocalError] = useState('');
  const calendar = f.time.calendar!;
  const periodDays = calendar.days.filter(d => schemaDatumTermTillaten(f.period, d.term));
  const minDate = periodDays[0]?.date ?? calendar.start, maxDate = periodDays.at(-1)?.date ?? calendar.end;
  const minuteParts = time.split(':').map(Number), startMin = minuteParts[0] * 60 + minuteParts[1];
  function save() {
    const day = calendar.days.find(d => d.date === date);
    if (!day || !schemaDatumTermTillaten(f.period, day.term)) { setLocalError(f.period === 'lasar' ? 'Välj ett datum inom läsårets terminer.' : 'Välj ett datum inom den valda terminen. För att flytta mellan terminer behöver du ett utkast för hela läsåret.'); return; }
    const parts = time.split(':').map(Number), startMin = parts[0] * 60 + parts[1];
    if (!date || !Number.isSafeInteger(startMin) || startMin % 5 || startMin < 0 || startMin + o.length > 1440) { setLocalError('Välj ett datum och en starttid i steg om fem minuter där hela lektionen ryms.'); return; }
    setLocalError(''); onSave({ lesson: o.lesson.id, originalDate: o.originalDate, date, startMin, room: room || null, durationMin: o.length });
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="admin-dialog max-h-[90dvh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Ändra ett tillfälle</DialogTitle><DialogDescription>{o.lesson.title} · {schemaDateText(o.date)}. Ändringen gäller bara detta tillfälle. Grundschemat behåller sin tid.</DialogDescription></DialogHeader>
    <form noValidate className="grid gap-4" onSubmit={e => { e.preventDefault(); save(); }}>
      <div className="grid gap-3 sm:grid-cols-2"><label htmlFor={`${id}-date`} className="grid gap-1">Datum<Input id={`${id}-date`} type="date" min={minDate} max={maxDate} value={date} disabled={busy} onChange={e => setDate(e.target.value)}/></label>
        <label htmlFor={`${id}-time`} className="grid gap-1">Starttid<Input id={`${id}-time`} type="time" step={300} value={time} disabled={busy} onChange={e => setTime(e.target.value)}/></label></div>
      <label className="grid gap-1">Sal<select className="min-h-(--control-height) rounded-md border border-input bg-background px-3" disabled={busy} value={room} onChange={e => setRoom(e.target.value)}><option value="">Ingen sal</option>{f.rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {salScope && <SalSok scope={{ ...salScope, datedTarget: { originalDate: o.originalDate, date }, datedOverrides }} lesson={o.lesson.id} target={{ day: schemaWeekday(date), startMin, room: room || null }} rooms={f.rooms} disabled={busy || !date || date < minDate || date > maxDate || !Number.isSafeInteger(startMin) || startMin % 5 !== 0} onSelect={setRoom} onSessionLost={onSessionLost} confirmLabel="Spara ändringen för detta tillfälle"/>}
      <p>Lektionens längd: {o.length} minuter. Tillfället hör ursprungligen till {schemaDateText(o.originalDate)}.</p>
      {(localError || error) && <p role="alert" className="text-destructive">{localError || error} Dina val står kvar.</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{busy ? 'Kontrollerar tillfället…' : 'Spara ändringen för detta tillfälle'}</Button>
        {o.changed && <Button type="button" variant="outline" disabled={busy} onClick={() => onSave(null)}>Återställ ordinarie tillfälle</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Avbryt</Button></div>
      <Button type="button" variant="ghost" disabled={busy} onClick={onBase}>Ändra grundschemat för alla veckor…</Button>
    </form>
  </DialogContent></Dialog>;
}
