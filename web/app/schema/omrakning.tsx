'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaForslagLesson, SchemaKontroll, SchemaKvalitetsrad } from '@/lib/schema-contract.ts';
import type { SchemaOmrakning } from '@/lib/schema-omrakning.ts';
import { PERIOD, clock, dayName, names } from './delat';
import { Kvalitetsjamforelse } from './kvalitet.tsx';

function placering(pass: SchemaForslagLesson | null, sal: string | null) {
  if (!pass) return 'Saknas';
  if (pass.day === null || pass.startMin === null) return 'Utan tid';
  return `${dayName(pass.day)} ${clock(pass.startMin)}–${clock(pass.startMin + pass.durationMin)} · ${sal ?? (pass.roomId ? 'Sal saknas i underlaget' : 'Ingen sal')}`;
}

export function Omrakningsgranskning({ fore, efter, foreKontroll, kontroll, andringar, passregler, avvikelsemarkeringar, stale, saving, error, datumproblem, datumavvikelser, onApply, onKeep, onRetry, retryLabel }: {
  fore: SchemaForslag;
  efter: SchemaForslag;
  foreKontroll: SchemaKontroll | null;
  kontroll: SchemaKontroll;
  andringar: SchemaOmrakning;
  passregler: string[];
  avvikelsemarkeringar: number;
  stale: boolean;
  saving: boolean;
  error?: string;
  datumproblem: boolean;
  datumavvikelser: number;
  onApply: () => void;
  onKeep: () => void;
  onRetry: () => void;
  retryLabel: string;
}) {
  const id = useId(), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'center' }); }, [efter]);
  const gamlaLagda = fore.lessons.filter(l => l.day !== null).length;
  const blirUtanSal = efter.lessons.filter(l => l.day !== null && l.roomIds.length > 0 && !l.roomId).length;
  const timplan = kontroll.teachings.filter(t => t.deviation !== null).length;
  const tid = andringar.pass.filter(p => p.tidAndrad).length, sal = andringar.pass.filter(p => p.salAndrad).length;
  return <section data-schema-omrakning className="schema-list min-w-0 space-y-3 border border-border bg-card p-4" aria-labelledby={id} aria-busy={saving}>
    <h2 id={id} ref={heading} tabIndex={-1} className="section-heading">Granska nytt schemaförslag</h2>
    <p>Ditt sparade schema ligger kvar tills du väljer <strong>Använd förslaget</strong>.</p>
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div><dt className="text-muted-foreground">Pass med tid</dt><dd>{gamlaLagda} → {kontroll.metrics.placed}</dd></div>
      <div><dt className="text-muted-foreground">Pass utan tid</dt><dd>{fore.lessons.length - gamlaLagda} → {kontroll.metrics.unplaced}</dd></div>
      <div><dt className="text-muted-foreground">Regelavvikelser{foreKontroll ? '' : ' i förslaget'}</dt><dd>{foreKontroll && `${foreKontroll.total} → `}{kontroll.total}</dd></div>
      <div><dt className="text-muted-foreground">Timplaneavvikelser{foreKontroll ? '' : ' i förslaget'}</dt><dd>{foreKontroll && `${foreKontroll.teachings.filter(t => t.deviation !== null).length} → `}{timplan}</dd></div>
    </dl>
    <p>{tid} pass har en ändrad tid eller uppdelning. {sal} pass har en ändrad sal. Förslaget har {blirUtanSal} pass som behöver en sal.</p>
    {kontroll.elevkvalitet && <p>Förslaget ger {kontroll.metrics.studentGapMin} elevminuter och {kontroll.metrics.teacherGapMin} lärarminuter håltid per vecka.</p>}
    <Omrakningskvalitet forslag={efter} fore={foreKontroll?.elevkvalitet} efter={kontroll.elevkvalitet}/>
    {efter.status === 'time_limit' && <p className="schema-note">Räknetiden tog slut. En längre omgång kan hitta fler eller bättre placeringar.</p>}
    {kontroll.metrics.unplaced > 0 && <p className="schema-note">Granska passen utan tid. Kontrollera tillgängliga salar och tider för de berörda lärarna och grupperna.</p>}
    {kontroll.violations.length > 0 && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Villkor att se över ({kontroll.total})</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{kontroll.violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
    </details>}
    {efter.diagnoses.length > 0 && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Schemamotorns förklaringar</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{efter.diagnoses.map((d, i) => <li key={i}>{d.message}</li>)}</ul>
    </details>}
    {andringar.pass.length > 0 && <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Ändrade pass ({andringar.pass.length})</summary>
      <div className="mt-2 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Pass</TableHead><TableHead>Nuvarande</TableHead><TableHead>Förslag</TableHead></TableRow></TableHeader>
        <TableBody>{andringar.pass.map(({ fore: a, efter: b, foreSal, efterSal }) => {
          const p = (b ?? a)!;
          return <TableRow key={`${a?.id ?? ''}/${b?.id ?? ''}`}><TableCell><strong>{p.title}</strong><p className="schema-note">{names(p.classIds, b ? efter.classes : fore.classes)}</p></TableCell>
            <TableCell>{placering(a, foreSal)}</TableCell><TableCell>{placering(b, efterSal)}</TableCell></TableRow>;
        })}</TableBody>
      </Table></div>
    </details>}
    {andringar.datum.length > 0 && <details open className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Datumändringar ({andringar.datum.length})</summary>
      <ul className="mt-2 divide-y divide-border">{andringar.datum.map(rad => <li className="py-2" key={`${rad.fore.lesson}/${rad.fore.originalDate}`}>
        <strong>{rad.titel}</strong> · {rad.fore.originalDate} → {rad.fore.date} {clock(rad.fore.startMin)}{rad.foreSal && ` · ${rad.foreSal}`}
        <p className="schema-note">{rad.status === 'bevarad' ? 'Följer med.' : rad.status === 'sal-saknas' ? 'Tiden följer med och behöver en ny sal.' : 'Följer inte med.'} {rad.orsak}</p>
      </li>)}</ul>
      {datumavvikelser > 0 && <p className="schema-note">{datumavvikelser} avvikelser på de ändrade datumen behöver följas upp i kalendern.</p>}
    </details>}
    {andringar.las.length + passregler.length > 0 && <details open className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Lås och passvillkor som påverkas ({andringar.las.length + passregler.length})</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5">{andringar.las.map(rad => <li key={rad.fore.lesson}><strong>{rad.titel}</strong> · {rad.orsak}</li>)}
        {passregler.map((namn, i) => <li key={i}>Villkoret för {namn} följer inte med.</li>)}</ul>
    </details>}
    {avvikelsemarkeringar > 0 && <p className="schema-note">Tidigare godkännanden behöver bedömas på nytt för {avvikelsemarkeringar} regelavvikelser.</p>}
    {datumproblem && <p role="alert" className="valplan-alert">De överförda datumändringarna kunde inte kontrolleras. Försök räkna om igen.</p>}
    {stale && !error && <p role="alert" className="valplan-alert">Utkastet har ändrats sedan beräkningen. Ta fram ett nytt förslag.</p>}
    {error && <p role="alert" className="valplan-alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={saving || stale || !!datumproblem} onClick={onApply}>{saving ? 'Sparar förslaget…' : 'Använd förslaget'}</Button>
      <Button type="button" variant="outline" disabled={saving} onClick={onKeep}>Behåll nuvarande schema</Button>
      {(stale || datumproblem) && <Button type="button" variant="outline" disabled={saving} onClick={onRetry}>{retryLabel}</Button>}
    </div>
  </section>;
}

function Omrakningskvalitet({ forslag, fore, efter }: { forslag: SchemaForslag; fore?: SchemaKvalitetsrad[]; efter?: SchemaKvalitetsrad[] }) {
  const [val, setVal] = useState('');
  const nyckel = (rad: SchemaKvalitetsrad) => JSON.stringify([rad.slag, rad.ref, rad.term]);
  const gamla = new Set(fore?.map(nyckel));
  const rader = (efter ?? []).filter(rad => gamla.has(nyckel(rad))).sort((a, b) => (b.hal?.min ?? 0) - (a.hal?.min ?? 0));
  const aktuell = rader.find(rad => nyckel(rad) === val) ?? rader[0];
  if (!aktuell) return null;
  return <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium">Elevernas skoldagar före och efter</summary>
    <label className="my-2 grid gap-1.5">Klass eller undervisningsgrupp och termin
      <select value={nyckel(aktuell)} onChange={e => setVal(e.target.value)}>
        {rader.map(rad => <option key={nyckel(rad)} value={nyckel(rad)}>{forslag.resurser[rad.slag].find(r => r.ref === rad.ref)?.name} · {PERIOD[rad.term]}</option>)}
      </select>
    </label>
    <Kvalitetsjamforelse forslag={forslag} val={aktuell} fore={fore} efter={efter}/>
  </details>;
}
