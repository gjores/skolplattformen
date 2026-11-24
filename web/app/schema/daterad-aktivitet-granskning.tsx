'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaResurs } from '@/lib/schema-contract.ts';
import type { SchemaAktivitetsForslag } from '@/lib/schema-daterad-aktivitet.ts';
import { schemaDayHeading } from '@/lib/schema-vecka.ts';
import { clock } from './delat.ts';

export function DateradAktivitetsgranskning({ forslag, salar, ansvariga, error, stale, busy, onApply, onCancel }: {
  forslag: SchemaAktivitetsForslag; error: string | null; stale: boolean; busy: boolean; onApply: () => void; onCancel: () => void;
  salar?: SchemaResurs[]; ansvariga?: SchemaResurs[];
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [forslag]);
  return <section className="space-y-4 rounded-lg border border-border bg-card p-5" aria-labelledby="schema-aktivitet-forslag">
    <header className="space-y-1">
      <h2 id="schema-aktivitet-forslag" ref={heading} tabIndex={-1} className="section-heading">Förslag med {forslag.activity.name}</h2>
      <p>Det sparade schemat ligger kvar tills du använder förslaget.</p>
    </header>
    <DateradAktivitetsbesked forslag={forslag} salar={salar} ansvariga={ansvariga}/>
    {error && <p className="text-destructive" role="alert">{error}</p>}
    {stale && <p role="alert">Utkastet har ändrats. Räkna om aktiviteten igen innan du använder förslaget.</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy || stale || forslag.blockers.length > 0} onClick={onApply}>{busy ? 'Sparar…' : 'Använd förslaget'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Behåll nuvarande schema</Button>
    </div>
  </section>;
}


export function DateradAktivitetsbesked({ forslag, salar, ansvariga }: {
  forslag: SchemaAktivitetsForslag; salar?: SchemaResurs[]; ansvariga?: SchemaResurs[];
}) {
  const { activity, effects, totals, uncreditedClasses, blockers } = forslag;
  const roomId = activity.resources?.roomId, teacherRef = activity.resources?.teacherRef;
  const roomLocked = activity.resourceLocks?.roomId;
  const teacherLocked = activity.resourceLocks?.teacherRef;
  return <div className="space-y-3" aria-label={activity.name}>
    <p><strong>{activity.name}</strong> · {schemaDayHeading(activity.date)} · {clock(activity.startMin)}–{clock(activity.endMin)} · {activity.classRefs.length} klasser</p>
    {activity.resources && <dl aria-label="Resurser i förslaget" className="grid gap-2 sm:grid-cols-2">
      <div><dt className="text-sm text-muted-foreground">Sal</dt><dd className="flex flex-wrap items-center gap-2">
        {roomLocked === 'ingen' ? 'Ingen sal behövs' : roomId ? salar?.find(sal => sal.ref === roomId)?.name ?? 'Salens namn saknas' : 'Sal saknas'}
        {roomId && roomLocked !== 'ingen' && <span className="status-badge">{roomLocked ? 'Låst' : 'Vald av motorn'}</span>}
      </dd></div>
      <div><dt className="text-sm text-muted-foreground">Ansvarig</dt><dd className="flex flex-wrap items-center gap-2">
        {teacherRef ? ansvariga?.find(person => person.ref === teacherRef)?.name ?? 'Namn på ansvarig saknas' : 'Ansvarig saknas'}
        {teacherRef && <span className="status-badge">{teacherLocked ? 'Låst' : 'Vald av motorn'}</span>}
      </dd></div>
    </dl>}
    {blockers.length > 0 && <ul className="list-disc space-y-1 pl-5 text-destructive" role="alert">{blockers.map((message, index) => <li key={index}>{message}</li>)}</ul>}
    {uncreditedClasses.length > 0 && <p>Ämnestiden räknas inte för {uncreditedClasses.join(', ')} på det valda datumet.</p>}
    {totals.length > 0 && <Table aria-label="Undervisningstid efter aktiviteten">
      <TableHeader><TableRow><TableHead>Undervisning</TableHead><TableHead>Bortfall</TableHead><TableHead>Omlagt</TableHead><TableHead>Från aktiviteten</TableHead><TableHead>Kvar att lägga</TableHead><TableHead>Förändring</TableHead></TableRow></TableHeader>
      <TableBody>{totals.map(row => <TableRow key={row.ref}>
        <TableCell>{row.title}<div className="text-sm text-muted-foreground">{row.classes.join(', ')}</div></TableCell>
        <TableCell>{row.lost} min</TableCell><TableCell>{row.moved} min</TableCell><TableCell>{row.credited} min</TableCell>
        <TableCell>{row.remaining} min</TableCell><TableCell>{row.net > 0 ? '+' : ''}{row.net} min</TableCell>
      </TableRow>)}</TableBody>
    </Table>}
    {effects.length > 0 && <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer font-medium">Berörda lektioner ({effects.length})</summary>
      <ul className="mt-2 divide-y divide-border">{effects.map(row => <li key={row.lesson} className="py-2">
        {row.title} · {row.classes.join(', ')} · {row.minutes} min · {row.target ? `Flyttas till ${schemaDayHeading(row.target.date)} ${clock(row.target.startMin)}`
          : row.status === 'credited' ? 'Ersätts av aktiviteten' : 'Ställs in. Se återstående minuter per ämne.'}
      </li>)}</ul>
    </details>}
  </div>;
}
