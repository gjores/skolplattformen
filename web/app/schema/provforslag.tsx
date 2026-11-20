'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { skapaProvId } from '@/lib/nationella-prov.ts';
import { schemaDatumNyckel, type SchemaDatumRequest } from '@/lib/schema-datum.ts';
import { parseSchemaProvforslagSvar, type SchemaProvforslagSvar, type SchemaProvProblem } from '@/lib/schema-provforslag.ts';
import { schemaDateText } from '@/lib/schema-vecka.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { clock } from './delat.ts';

type Props = {
  request: SchemaDatumRequest | null;
  disabled?: boolean;
  personalLookup?: boolean;
  onSessionLost: () => void;
  onOpen?: (lesson: string, originalDate: string) => void;
  onOpenBooking?: (id: string) => void;
  onApply?: (svar: SchemaProvforslagSvar, commandId: string) => Promise<void>;
  canApply?: boolean;
  lessons: SchemaForslagLesson[];
};
type Lage = { fas: 'tom' | 'laddar' | 'avbruten' } | { fas: 'fel'; text: string } | { fas: 'klar'; svar: SchemaProvforslagSvar };

const problemText: Record<SchemaProvProblem, string> = {
  deltagare_saknas: 'Deltagarna saknas i aktuellt underlag.',
  datum_utan_undervisning: 'Provet ligger utanför undervisningsdagarna i den valda perioden.',
  provkrock: 'Deltagare har ett annat prov samtidigt.',
  sal_saknas: 'Ingen ledig sal med tillräcklig kapacitet hittades.',
  last_sal_olamplig: 'Den låsta salen är upptagen, saknas eller rymmer för få elever.',
  vakt_saknas: 'Ingen ledig provvakt hittades.',
  last_vakt_upptagen: 'En låst provvakt är upptagen eller saknas i underlaget.',
  aktivitet_krock: 'En aktivitet överlappar provet för deltagarna.',
  last_pass_krock: 'Ett låst undervisningspass överlappar provet.',
  provtid_utanfor_skoltid: 'Provtiden ligger utanför skolans tider.',
};

function feltext(error: unknown) {
  if (error instanceof ApiError) {
    if (error.reason === 'schema_datum_calendar_missing') return 'En fastställd läsårskalender behövs för att ta fram provförslag.';
    if (error.reason === 'schema_provforslag_unresolved') return 'Provförslaget har fortfarande krockar, saknade resurser eller undervisningstid kvar att ersätta.';
    if (error.status === 409) return 'Schemat eller underlaget har ändrats. Läs det aktuella schemat och ta fram ett nytt provförslag.';
    if (error.status === 403) return 'Ditt aktuella uppdrag ger inte tillgång till provförslaget.';
    if (error.status === 503) return 'Schemamotorn kunde inte svara. Försök igen om en stund.';
  }
  return 'Provförslaget kunde inte tas fram. Försök igen.';
}

/** Ett ändrat schema eller periodbyte får en egen förhandsgranskning. */
export function Provforslag(props: Props) {
  return <ProvforslagInnehall key={JSON.stringify(props.request)} {...props}/>;
}

function ProvforslagInnehall({ request, disabled, personalLookup = false, onSessionLost, onOpen, onOpenBooking, onApply, canApply, lessons }: Props) {
  const heading = useId();
  const [lage, setLage] = useState<Lage>({ fas: 'tom' });
  const anrop = useRef<AbortController | null>(null);
  const applyCommand = useRef<{ svar: SchemaProvforslagSvar; id: string } | null>(null);
  const [applying, setApplying] = useState(false), [applyError, setApplyError] = useState<string | null>(null);
  const raknaKnapp = useRef<HTMLButtonElement>(null);
  useEffect(() => () => {
    anrop.current?.abort();
    anrop.current = null;
  }, []);

  function avbryt() {
    anrop.current?.abort();
    anrop.current = null;
    setLage({ fas: 'avbruten' });
    requestAnimationFrame(() => raknaKnapp.current?.focus());
  }

  async function rakna() {
    if (!request || disabled || anrop.current) return;
    const controller = new AbortController();
    anrop.current = controller;
    setApplyError(null);
    setLage({ fas: 'laddar' });
    const timeout = window.setTimeout(() => {
      if (anrop.current !== controller) return;
      controller.abort();
      anrop.current = null;
      setLage({ fas: 'fel', text: 'Provförslaget tog för lång tid. Försök igen.' });
    }, 30_000);
    try {
      const raw = await api.post<unknown>('/api/schema/provforslag', request, controller.signal);
      if (anrop.current !== controller) return;
      setLage({ fas: 'klar', svar: parseSchemaProvforslagSvar(raw, request) });
    } catch (error) {
      if (anrop.current !== controller) return;
      if (error instanceof ApiError && error.status === 401) { setLage({ fas: 'tom' }); onSessionLost(); }
      else setLage({ fas: 'fel', text: feltext(error) });
    } finally {
      window.clearTimeout(timeout);
      if (anrop.current === controller) anrop.current = null;
    }
  }

  const svar = lage.fas === 'klar' ? lage.svar : null;
  const komplett = !!svar?.provrevision && svar.bokningar.length > 0
    && svar.bokningar.every(b => b.problem.length === 0 && b.sal && b.vakter.length > 0)
    && svar.bortfall.every(b => b.kvarMin === 0);
  async function tillampa() {
    if (!onApply || !svar || !komplett || !canApply || applying || disabled) return;
    if (applyCommand.current?.svar !== svar) applyCommand.current = { svar, id: skapaProvId() };
    setApplying(true); setApplyError(null);
    try { await onApply(svar, applyCommand.current.id); }
    catch (error) {
      if (error instanceof ApiError && error.status === 401) onSessionLost();
      else setApplyError(error instanceof ApiError && error.status === 409 ? feltext(error) : 'Sparandet kunde inte bekräftas. Försök igen för att kontrollera samma ändring.');
    } finally { setApplying(false); }
  }
  const passnamn = svar?.ersattningar.length ? new Map(lessons.map(pass => [pass.id, pass.title])) : null;
  return <section aria-labelledby={heading} className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id={heading} className="font-semibold">Provförslag</h2>
        <p className="text-sm text-muted-foreground">Ta fram förslag på salar, provvakter och ersättningstid. När förslaget sparas flyttas undervisningen som krockar med proven i det här schemautkastet.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button ref={raknaKnapp} type="button" variant="outline" disabled={!request || disabled || applying || lage.fas === 'laddar'} onClick={() => void rakna()}>Ta fram provförslag</Button>
        {lage.fas === 'laddar' && <Button type="button" variant="ghost" onClick={avbryt}>Avbryt provförslaget</Button>}
      </div>
    </div>
    {!request && <p className="text-sm text-muted-foreground">Ta först fram ett aktuellt schemaförslag med undervisningspass.</p>}
    {lage.fas === 'laddar' && <output className="block text-sm text-muted-foreground">Tar fram provförslag…</output>}
    {lage.fas === 'avbruten' && <output className="block text-sm text-muted-foreground">Provförslaget avbröts.</output>}
    {lage.fas === 'fel' && <p role="alert" className="text-sm text-destructive">{lage.text}</p>}
    {applyError && <p role="alert" className="text-sm text-destructive">{applyError}</p>}
    {svar && (svar.bokningar.length === 0 ? <output className="block text-sm text-muted-foreground">Inga provbokningar finns i den valda perioden.</output> : <>
      <div className="space-y-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <output className="status-badge">Förslag · ej sparat</output>
          {onApply && <Button type="button" disabled={!komplett || !canApply || disabled || applying} onClick={() => void tillampa()}>{applying ? 'Sparar provförslaget…' : 'Lägg in provförslaget'}</Button>}
        </div>
        {onApply && (!komplett ? <p className="text-sm text-muted-foreground">Se över återstående resurser, krockar och undervisningstid före sparandet.</p>
          : !canApply ? <p className="text-sm text-muted-foreground">Spara det aktuella schemautkastet innan du lägger in provförslaget.</p> : null)}
      </div>
      {!personalLookup && <p className="text-sm text-muted-foreground">Förslag på provvakter visas för rektor, som kan läsa aktuella skoluppdrag.</p>}
      <Table aria-label="Förslag på provresurser">
        <TableHeader><TableRow>
          <TableHead scope="col">Prov och deltagare</TableHead><TableHead scope="col">Datum och tid</TableHead>
          <TableHead scope="col">{personalLookup ? 'Sal och provvakter' : 'Sal'}</TableHead><TableHead scope="col">Status</TableHead>
        </TableRow></TableHeader>
        <TableBody>{svar.bokningar.map(b => {
          const problem = [...new Set(b.problem.map(kod => !personalLookup && (kod === 'vakt_saknas' || kod === 'last_vakt_upptagen')
            ? 'Provvakt behöver kontrolleras av rektor.' : problemText[kod]))];
          return <TableRow key={b.id}>
            <TableCell className="whitespace-normal [overflow-wrap:anywhere]"><p className="font-medium">{b.namn}</p>
              <p className="text-muted-foreground">{b.deltagarnamn} · {b.deltagare} {b.deltagare === 1 ? 'elev' : 'elever'}</p>
            </TableCell>
          <TableCell className="whitespace-normal"><p>{schemaDateText(b.datum)}</p><p>{clock(b.startMin)}–{clock(b.slutMin)}</p>
            {onOpenBooking && <Button type="button" variant="ghost" disabled={applying} onClick={() => onOpenBooking(b.id)}
              aria-label={`Visa provdagen för ${b.deltagarnamn} ${schemaDateText(b.datum)}`}>Visa provdagen</Button>}</TableCell>
            <TableCell className="space-y-1 whitespace-normal [overflow-wrap:anywhere]">
              <p>{b.sal?.name ?? 'Sal saknar förslag'}</p>
              {personalLookup && <p className="text-muted-foreground">{b.vakter.length === 0 ? 'Provvakt saknar förslag' : b.vakter.map(vakt => vakt.name).join(', ')}</p>}
            </TableCell>
            <TableCell className="whitespace-normal">{problem.length === 0 ? 'Förslag framtaget' : <>
              <span className="status-badge warning">Behöver ses över</span>
              <ul className="mt-1 space-y-1">{problem.map(text => <li key={text}>{text}</li>)}</ul>
            </>}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      <div className="space-y-2">
        <h3 className="font-semibold">Bortfall av undervisningstid</h3>
        <p className="text-sm text-muted-foreground">Provtid redovisas separat. Bortfall och ersättning visas per undervisning.</p>
        {svar.bortfall.length === 0 ? <p className="text-sm text-muted-foreground">Förslaget visar inget bortfall av undervisningstid.</p> : <Table aria-label="Bortfall och ersättning per undervisning">
          <TableHeader><TableRow>
            <TableHead scope="col">Undervisning</TableHead><TableHead scope="col">Bortfall</TableHead>
            <TableHead scope="col">Föreslagen ersättning</TableHead><TableHead scope="col">Återstår</TableHead>
          </TableRow></TableHeader>
          <TableBody>{svar.bortfall.map(b => <TableRow key={b.ref}>
            <TableCell className="whitespace-normal [overflow-wrap:anywhere]">{b.title}</TableCell><TableCell>{b.bortfallMin} min</TableCell>
            <TableCell>{b.ersattMin} min</TableCell><TableCell>{b.kvarMin} min</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
      </div>
      {svar.ersattningar.length > 0 && <div className="space-y-2">
        <h3 className="font-semibold">Föreslagna ersättningstillfällen</h3>
        <ul className="divide-y divide-border">{svar.ersattningar.map(flytt => {
          const titel = passnamn?.get(flytt.lesson) ?? 'Pass i schemat';
          return <li key={schemaDatumNyckel(flytt)} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 break-words"><p className="font-medium">{titel}</p>
              <p className="text-sm text-muted-foreground">Från {schemaDateText(flytt.originalDate)} till {schemaDateText(flytt.date)} kl. {clock(flytt.startMin)}–{clock(flytt.startMin + flytt.durationMin)}</p>
            </div>
            {onOpen && <Button type="button" variant="outline" onClick={() => onOpen(flytt.lesson, flytt.originalDate)} aria-label={`Visa tillfället för ${titel} ${schemaDateText(flytt.originalDate)}`}>Visa tillfället</Button>}
          </li>;
        })}</ul>
      </div>}
    </>)}
  </section>;
}
