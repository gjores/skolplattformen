'use client';
// Tilldela salar och behåll tiderna (05.2-SM-UXF-41, designvyn Salsattning): förhandsgranskning, sedan Använd eller Avbryt. Inget ändras före Använd.
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Salsattning } from '@/lib/schema-salsattning.ts';
import { DAYS, clock } from './delat.ts';

export type SalsattningVisning = { resultat: Salsattning; /** Motorns kontroll av hela förslaget med de föreslagna salarna. */ kontroll: { status: 'ok' } | { status: 'avvikelser'; texter: string[] };
  /** Utkastet och villkoren som förhandsgranskningen gäller. */ nyckel: string };
const pass = (n: number) => `${n} pass`;

export function Salsattningspanel({ utanSal, visning, inaktuell, busy, stopp, roomName, onForhandsgranska, onAnvand, onAvbryt }: {
  /** Pass med tid som ska ha sal men saknar en tillåten. */ utanSal: number; visning: SalsattningVisning | null; inaktuell: boolean; busy: boolean; /** Varför tilldelning inte går just nu. */ stopp: string | null;
  roomName: (id: string | null) => string; onForhandsgranska: () => void; onAnvand: () => void; onAvbryt: () => void }) {
  const rubrik = useId(), r = visning?.resultat, o = r?.ororda;
  if (utanSal === 0 && !visning) return null;
  return <section aria-labelledby={rubrik} className="rounded-lg border border-border bg-card p-4 space-y-3" data-salsattning>
    <h2 id={rubrik} className="section-heading">Tilldela salar och behåll tiderna</h2>
    <p>{utanSal > 0 ? `${pass(utanSal)} har tid och ska ha sal, men saknar sal eller har en sal som kontrollen har underkänt.` : 'Alla pass som ska ha sal har en tillåten sal.'} Dag, starttid och längd ändras inte. Låsta pass och pass med datumändring rörs inte.</p>
    {stopp && <p className="schema-note">{stopp}</p>}
    {!visning && <div><Button type="button" variant="outline" disabled={busy || utanSal === 0 || stopp !== null} onClick={onForhandsgranska}>Förhandsgranska salarna</Button></div>}
    {visning && r && o && <div className="space-y-3" data-salsattning-visning={inaktuell ? 'inaktuell' : 'aktuell'}>
      {inaktuell && <output className="block rounded-md border border-border p-3" style={{ background: 'var(--warning-surface)' }}>Schemat eller villkoren har ändrats sedan förhandsgranskningen. Förhandsgranska igen innan du använder salarna.</output>}
      <p className="flex flex-wrap gap-2">
        <span className={`status-badge ${r.tilldelade.length ? 'success' : ''}`} data-antal="far-sal">Får sal · {pass(r.tilldelade.length)}</span>
        <span className={`status-badge ${r.hinder.length ? 'warning' : ''}`} data-antal="hinder">Hinder · {pass(r.hinder.length)}</span>
        <span className="status-badge" data-antal="ororda">Rörs inte · {o.medSal} med sal, {o.lasta} låsta, {o.datum} med datumändring</span>
      </p>
      {r.tilldelade.length > 0 && <div className="max-h-80 overflow-auto rounded-md border border-border">
        <Table><caption className="sr-only">Pass som får sal</caption>
          <TableHeader><TableRow><TableHead>Pass</TableHead><TableHead>Tid (oförändrad)</TableHead><TableHead>Nuvarande sal</TableHead><TableHead>Föreslagen sal</TableHead></TableRow></TableHeader>
          <TableBody>{r.tilldelade.map(t => <TableRow key={t.lesson} data-tilldelad={t.lesson}>
            <TableCell className="whitespace-normal">{t.title}</TableCell><TableCell>{DAYS[t.day]} {clock(t.startMin)}</TableCell>
            <TableCell>{t.fran ? `${roomName(t.fran) || t.fran} (inte längre tillåten)` : 'Ingen'}</TableCell><TableCell className="font-medium">{roomName(t.till) || t.till}</TableCell></TableRow>)}</TableBody></Table></div>}
      {r.hinder.length > 0 && <div className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--warning-surface)' }} data-salsattning-hinder>
        <h3 className="font-semibold">Salarna räcker inte för {pass(r.hinder.length)}</h3>
        <ul className="list-disc pl-5">{r.hinder.map(h => <li key={h.lesson}><strong>{h.title}</strong>: {h.text}</li>)}</ul>
        <p className="schema-note">De passen står kvar utan sal. Att flytta pass för att få plats är ett eget steg och görs inte här: flytta berörda pass i veckan, ändra salbehoven eller lägg till salar.</p>
      </div>}
      {visning.kontroll.status === 'avvikelser'
        ? <div className="valplan-alert" role="alert"><p>Kontrollen godtog inte de föreslagna salarna som de är. Inget har ändrats.</p><ul className="list-disc pl-5">{visning.kontroll.texter.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        : r.tilldelade.length > 0 && <p className="schema-note">Schemamotorns kontroll har prövat hela schemat med de föreslagna salarna: inga nya regelavvikelser.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || inaktuell || !r.tilldelade.length || visning.kontroll.status !== 'ok'} onClick={onAnvand}>Använd salarna för {pass(r.tilldelade.length)}</Button>
        <Button type="button" variant="outline" onClick={onAvbryt}>Avbryt</Button>
        {inaktuell && <Button type="button" variant="outline" disabled={busy || stopp !== null} onClick={onForhandsgranska}>Förhandsgranska igen</Button>}
      </div>
      <p className="schema-note">Använd blir ett steg i Ångra som återställer alla salar på en gång. Avbryt lämnar schemat orört.</p>
    </div>}
  </section>;
}
