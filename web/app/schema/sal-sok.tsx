'use client';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SchemaSalRequest, SchemaSalScope, SchemaSalStatus } from '@/lib/schema-salar.ts';
import { clock, dayName } from './delat.ts';
import { useSalSok } from './use-sal-sok.ts';

const STATUS: Record<SchemaSalStatus, string> = { ledig: 'Ledig och tillåten', upptagen: 'Upptagen', hindrad: 'Annat hinder', otillaten: 'Inte tillåten för passet', ej_kontrollerad: 'Ej kontrollerad' };
export function SalSok({ scope, lesson, target, rooms, disabled, onSelect, onSessionLost, confirmLabel = 'Flytta hit' }: {
  scope: SchemaSalScope; lesson: string; target: { day: number; startMin: number; room: string | null }; rooms: { id: string; name: string }[];
  disabled: boolean; onSelect: (room: string) => void; onSessionLost?: () => void; confirmLabel?: string;
}) {
  const request: SchemaSalRequest = { ...scope, lesson, target: { day: target.day, startMin: target.startMin }, datedTarget: scope.datedTarget ?? null, datedOverrides: scope.datedOverrides ?? [] };
  const trigger = useRef<HTMLButtonElement | null>(null);
  const { search, stale, run, cancel } = useSalSok(request, rooms, onSessionLost), [open, setOpen] = useState(false), [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const result = !stale ? search?.result : null;
  const available = result?.rooms.filter(r => r.status === 'ledig').length ?? 0;
  const start = () => { setOpen(true); setSelected(null); void run(); };
  const close = (next: boolean) => { setOpen(next); if (!next) cancel(); };
  return <>
    <Button ref={trigger} type="button" variant="outline" disabled={disabled} onClick={start}>Sök ledig sal</Button>
    {selected?.id === target.room && <output className="basis-full text-sm text-muted-foreground">{selected.name} är vald. Fortsätt med ”{confirmLabel}” för att kontrollera och genomföra ändringen.</output>}
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} finalFocus={trigger} className="admin-dialog max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>Salar vid vald tid</DialogTitle><DialogDescription>
          {request.datedTarget ? request.datedTarget.date : dayName(target.day)} {clock(target.startMin)}. Sökningen prövar hela passet, marginalerna och det övriga schemat. Salvalet förbereder flytten.
        </DialogDescription></DialogHeader>
        <output aria-live="polite">{search?.loading && !stale ? 'Kontrollerar salar…' : result ? available === 1 ? '1 ledig och tillåten sal.' : `${available} lediga och tillåtna salar.` : ''}</output>
        {stale && <output className="text-sm text-muted-foreground">Målet, villkoren eller schemat har ändrats. Sök igen med det aktuella läget.</output>}
        {!stale && search?.error && <p role="alert" className="valplan-alert">{search.error}</p>}
        {result && <>
          <p className="text-sm">Pass {clock(target.startMin)}–{clock(target.startMin + result.durationMin)} · {result.durationMin} min.
            {result.marginBeforeMin + result.marginAfterMin > 0 && ` Marginal före ${result.marginBeforeMin} min och efter ${result.marginAfterMin} min ingår i kontrollen.`}</p>
          <p className="text-sm text-muted-foreground">{result.explanation}</p>
          {result.rooms.length === 0 ? <p className="empty-state">Inga salar finns i schemats underlag. Lägg in skolans salar under Villkor för schemat och ta fram ett nytt förslag.</p>
            : <ul className="grid min-w-0 gap-3" aria-label="Kontrollerade salar">{result.rooms.map(room => <li key={room.id} className="grid min-w-0 gap-2 rounded-lg border border-border bg-card p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{room.name}</strong><span className={`status-badge ${room.status === 'ledig' ? 'success' : room.status === 'ej_kontrollerad' ? 'warning' : ''}`}>{STATUS[room.status]}</span></div>
              {room.reasons.length > 0 && <ul className="grid gap-1 text-sm text-muted-foreground">{room.reasons.slice(0, 3).map((reason, i) => <li key={i}>{reason.message}</li>)}
                {room.total > 3 && <li>Ytterligare {room.total - 3} hinder finns vid denna placering.</li>}</ul>}
              {room.status === 'ledig' && <Button type="button" variant="outline" className="min-h-(--control-height) h-auto max-w-full justify-self-start whitespace-normal" disabled={disabled || stale || search?.loading}
                onClick={() => { onSelect(room.id); setSelected({ id: room.id, name: room.name }); close(false); }}>Välj {room.name}</Button>}
            </li>)}</ul>}
        </>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" className="min-h-(--control-height) h-auto whitespace-normal" disabled={disabled || search?.loading && !stale} onClick={() => { void run(); }}>Sök igen</Button>
          <Button type="button" variant="outline" className="min-h-(--control-height) h-auto whitespace-normal" onClick={() => close(false)}>Stäng salsökningen</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
