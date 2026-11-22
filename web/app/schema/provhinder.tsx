'use client';

import { useEffect, useRef, useState, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseSchemaForslag, type SchemaForslag, type SchemaForslagRequest } from '@/lib/schema-contract.ts';
import type { SchemaSolveTimeMs } from '@/lib/schema-fortsatt.ts';
import type { SchemaNyttProvHinder, SchemaNyttProvProblem } from '@/lib/schema-nytt-prov.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { clock } from './delat.ts';
import { schemaDateText } from '@/lib/schema-vecka.ts';

const PROBLEM: Record<SchemaNyttProvProblem, string> = {
  deltagare_saknas: 'Deltagarna saknas i aktuellt underlag.',
  datum_utan_undervisning: 'Datumet är ingen undervisningsdag i vald period.',
  provkrock: 'Eleverna har ett annat prov samtidigt.',
  sal_saknas: 'Ingen ledig sal rymmer deltagarna.',
  last_sal_olamplig: 'Den valda salen är upptagen, saknas eller rymmer för få elever.',
  vakt_saknas: 'Ingen ledig provvakt hittades för hela provtiden.',
  last_vakt_skoluppdrag_saknas: 'Den valda provvakten saknar giltigt skoluppdrag på provdagen.',
  last_vakt_tid_sparrad: 'Den valda provvakten har ett tidsvillkor som hindrar hela provtiden.',
  last_vakt_upptagen: 'Den valda provvakten krockar med kvarvarande undervisning eller ett annat prov.',
  aktivitet_krock: 'En aktivitet krockar med provet.',
  last_pass_krock: 'Ett låst undervisningspass krockar med provet.',
  provtid_utanfor_skoltid: 'Provtiden ligger utanför skolans tider.',
};

type Visning = { status: 'laddar' | 'fel' } | { status: 'klar'; forslag: SchemaForslag };
const dagar = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];

export function Provhinder({ hinder, request, solveTimeMs, disabled, headingRef, onBookings, onBooking, onBasis, onSessionLost }: {
  hinder: SchemaNyttProvHinder; request: SchemaForslagRequest; solveTimeMs: SchemaSolveTimeMs; disabled: boolean;
  headingRef: Ref<HTMLHeadingElement>; onBookings: () => void;
  onBooking: (ref: string, resurs?: 'sal' | 'provvakt') => void; onBasis: () => void; onSessionLost: () => void;
}) {
  const [visning, setVisning] = useState<Visning | null>(null);
  const controller = useRef<AbortController | null>(null);
  const previewButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const foreProv = hinder.unplaced !== undefined;

  function stang() {
    controller.current?.abort();
    controller.current = null;
    setVisning(null);
  }

  async function forhandsgranska() {
    if (disabled || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setVisning({ status: 'laddar' });
    try {
      const raw = await api.post<unknown>('/api/schema/forslag', { ...request, solveTimeMs }, abort.signal);
      if (!abort.signal.aborted) setVisning({ status: 'klar', forslag: parseSchemaForslag(raw, request) });
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) { stang(); onSessionLost(); }
      else setVisning({ status: 'fel' });
    } finally {
      if (controller.current === abort) controller.current = null;
    }
  }

  return <section className="valplan-alert min-w-0 space-y-3">
    <div role="alert" className="space-y-2">
      <h3 ref={headingRef} tabIndex={-1} className="font-semibold">{foreProv ? 'Grundschemat behöver ses över' : 'Provplaneringen behöver ses över'}</h3>
      {foreProv ? <p>{hinder.unplaced
        ? `${hinder.unplaced} pass saknar tid. Provbokningarna prövas när undervisningspassen har fått tider.`
        : 'Underlaget gav inga undervisningspass att placera. Kontrollera tjänstefördelningen och valda villkor.'}</p> : <>
        <p>Grundschemat gick att lägga.</p>
        <ul className="list-disc space-y-1 pl-5">
          {hinder.resourceIssues > 0 && <li>{hinder.resourceIssues} av {hinder.bookings} provbokningar behöver ses över.</li>}
          {hinder.remainingMinutes > 0 && <li>{hinder.remainingMinutes} minuter undervisning återstår att ersätta.</li>}
          {hinder.dateIssues > 0 && <li>{hinder.dateIssues} {hinder.dateIssues === 1 ? 'datumavvikelse återstår' : 'datumavvikelser återstår'} efter kontrollen.</li>}
        </ul>
      </>}
      <p>Beräkningen stannade före sparandet.</p>
    </div>
    <div className="flex flex-wrap gap-2">
      {foreProv
        ? <Button type="button" disabled={disabled} onClick={onBasis}>Kontrollera schemaunderlaget</Button>
        : <>
          <Button type="button" disabled={disabled} onClick={onBookings}>Granska provbokningarna</Button>
          <Button type="button" ref={previewButton} variant="outline" disabled={disabled} onClick={() => void forhandsgranska()}>Förhandsgranska grundschemat</Button>
        </>}
    </div>
    {!!hinder.bokningarMedHinder?.length && <ul aria-label="Provbokningar som behöver ses över" className="divide-y divide-border rounded-md border border-border bg-card text-foreground">
      {hinder.bokningarMedHinder.map(bokning => <li key={bokning.id} className="space-y-1 px-3 py-2">
        <p className="font-medium">{bokning.namn} · {bokning.deltagarnamn} · <time dateTime={bokning.datum}>{schemaDateText(bokning.datum)}</time></p>
        <ul className="list-disc space-y-1 pl-5 text-sm">{bokning.problem.map(problem => <li key={problem}>{PROBLEM[problem]}</li>)}</ul>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => {
          const sal = bokning.problem.some(problem => problem === 'sal_saknas' || problem === 'last_sal_olamplig');
          const vakt = bokning.problem.some(problem => problem === 'vakt_saknas' || problem.startsWith('last_vakt_'));
          onBooking(bokning.id, sal ? 'sal' : vakt ? 'provvakt' : undefined);
        }}>Öppna provbokningen<span className="sr-only"> {bokning.namn} för {bokning.deltagarnamn}</span></Button>
      </li>)}
    </ul>}
    <Dialog open={visning !== null} onOpenChange={open => { if (!open) stang(); }}>
      <DialogContent finalFocus={previewButton} showCloseButton={false} className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Förhandsgranskning av grundschemat</DialogTitle>
          <DialogDescription>Här visas undervisningspassen före provdagarnas ändringar. Förhandsgranskningen sparar inget.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto">
          {visning?.status === 'laddar' && <output>Räknar på grundschemat…</output>}
          {visning?.status === 'fel' && <p role="alert">Grundschemat kunde inte förhandsgranskas. Stäng och försök igen.</p>}
          {visning?.status === 'klar' && <Grundschema forslag={visning.forslag}/>}
        </div>
        <DialogFooter><DialogClose render={<Button type="button" variant="outline"/>}>Stäng</DialogClose></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}

function Grundschema({ forslag }: { forslag: SchemaForslag }) {
  const klassnamn = new Map(forslag.classes.map(klass => [klass.id, klass.name]));
  const pass = forslag.lessons.filter(l => l.day !== null && l.startMin !== null)
    .sort((a, b) => a.day! - b.day! || a.startMin! - b.startMin! || a.title.localeCompare(b.title, 'sv'));
  return <>
    <output>{forslag.metrics.placed} av {forslag.metrics.lessons} pass har fått en tid.</output>
    {pass.length > 0 && <Table aria-label="Undervisningspass i grundschemat">
      <TableHeader><TableRow><TableHead>Dag</TableHead><TableHead>Tid</TableHead><TableHead>Undervisning</TableHead></TableRow></TableHeader>
      <TableBody>{pass.map(l => <TableRow key={l.id}>
        <TableCell>{dagar[l.day!]}</TableCell>
        <TableCell>{clock(l.startMin!)}–{clock(l.startMin! + l.durationMin)}</TableCell>
        <TableCell className="whitespace-normal"><p>{l.title}</p>
          <p className="text-muted-foreground">{l.classIds.map(id => klassnamn.get(id)).filter(Boolean).join(', ')}</p></TableCell>
      </TableRow>)}</TableBody>
    </Table>}
  </>;
}
