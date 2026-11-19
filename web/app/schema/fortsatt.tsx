'use client';
import { useEffect, useId, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import type { SchemaFortsatt, SchemaFortsattRequest } from '@/lib/schema-fortsatt.ts';
import { clock, dayName, names } from './delat';

export type FortsattSokning = { key: string; request: SchemaFortsattRequest; result: SchemaFortsatt | null; loading: boolean; error: string | null };

/** Ett förslag får inte tappa lagda pass eller lägga till hårda regel- eller tidsavvikelser. Önskemål redovisas före valet. */
export function fortsattStopp(result: SchemaFortsatt): string | null {
  if (result.after.metrics.placed < result.before.metrics.placed) return 'Förslaget ger färre pass en tid. Det kan inte ersätta ditt nuvarande schema.';
  if (result.after.total > result.before.total) return 'Förslaget har fler regelavvikelser. Det kan inte ersätta ditt nuvarande schema.';
  const avvikelser = (v: SchemaFortsatt['before']) => v.teachings.filter(t => t.deviation !== null).length;
  if (avvikelser(result.after) > avvikelser(result.before)) return 'Förslaget har fler avvikelser från timplanen. Det kan inte ersätta ditt nuvarande schema.';
  return null;
}

export function FortsattGranskning({ search, forslag, stale, checking, onApply, onClose }: {
  search: FortsattSokning; forslag: SchemaForslag; stale: boolean; checking: boolean; onApply: () => void; onClose: () => void;
}) {
  const heading = useId(), headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'center' }); }, [search.key, search.loading]);
  const result = search.result, after = new Map(result?.forslag.lessons.map(l => [l.id, l]) ?? []);
  const changes = forslag.lessons.flatMap(l => {
    const n = after.get(l.id);
    return n && (n.day !== l.day || n.startMin !== l.startMin || n.roomId !== l.roomId) ? [{ from: l, to: n }] : [];
  });
  const place = (l: SchemaForslagLesson) => l.day === null || l.startMin === null ? 'Utan tid' : `${dayName(l.day)} ${clock(l.startMin)} · ${l.roomId ? forslag.rooms.find(r => r.id === l.roomId)?.name ?? 'Sal saknas i underlaget' : 'Ingen sal'}`;
  const stop = result ? fortsattStopp(result) : null;
  const moved = changes.filter(c => c.from.day !== null && c.to.day !== null).length;
  return <section data-schema-continue-panel className="schema-list min-w-0 border border-border bg-card p-4 space-y-3" aria-labelledby={heading} aria-busy={search.loading || checking}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="folj-overrad">Granska före ändring</p><h2 id={heading} ref={headingRef} tabIndex={-1}>Fortsatt beräkning</h2></div>
      <Button type="button" variant="outline" disabled={checking} onClick={onClose}>Behåll nuvarande schema</Button></div>
    <p className="schema-note">Ditt schema ligger kvar tills du väljer Använd förslaget. Låsta pass och pass med datumändringar ligger kvar. Andra pass kan flyttas för att ge plats eller förbättra schemat.</p>
    <output className="schema-note" aria-live="polite">{search.loading ? `Motorn arbetar vidare från ditt schema, upp till ${search.request.solveTimeMs / 1000} sekunder. Därefter kontrolleras resultatet.` : checking ? 'Kontrollerar förslaget igen innan det används…' : ''}</output>
    {stale && <p className="valplan-alert">Schemat, låsen eller villkoren har ändrats. Fortsätt förbättra igen från det aktuella schemat.</p>}
    {search.error && <p className="valplan-alert" role="alert">{search.error}</p>}
    {result && <>
      <p>{changes.length === 0 ? 'Ingen ändrad placering hittades i den här omgången. Du kan låta motorn fortsätta igen.' : `${changes.filter(c => c.from.day === null).length} pass får en tid. ${moved} redan ${moved === 1 ? 'lagt pass ändras' : 'lagda pass ändras'}. ${changes.filter(c => c.to.day === null).length} pass blir utan tid.`}</p>
      <div className="flex flex-wrap gap-3"><span>Pass med tid: {result.before.metrics.placed} → {result.after.metrics.placed}</span><span>Regelavvikelser: {result.before.total} → {result.after.total}</span><span>Timplaneavvikelser: {result.before.teachings.filter(t => t.deviation !== null).length} → {result.after.teachings.filter(t => t.deviation !== null).length}</span></div>
      <p>Håltid per vecka: {result.before.metrics.studentGapMin} → {result.after.metrics.studentGapMin} elevminuter; {result.before.metrics.teacherGapMin} → {result.after.metrics.teacherGapMin} lärarminuter.</p>
      <p className="schema-note">Elevminuter väger samman håltiden och antalet berörda elever. Lärarminuter summerar lärarnas håltid.</p>
      {result.forslag.status === 'time_limit' && <p className="schema-note">Omgångens räknetid är slut. Det kan fortfarande finnas bättre placeringar. Du kan använda förslaget och fortsätta därifrån.</p>}
      {stop && <p className="valplan-alert" role="alert">{stop}</p>}
      {changes.length > 0 && <div className="min-w-0 overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Pass och berörda scheman</TableHead><TableHead>Från</TableHead><TableHead>Till</TableHead></TableRow></TableHeader>
        <TableBody>{changes.map(({ from, to }) => <TableRow key={from.id}><TableCell><strong>{from.title}</strong><p className="schema-note">{[names(from.classIds, forslag.classes), names(from.teacherIds, forslag.teachers)].filter(Boolean).join(' · ')}</p></TableCell><TableCell>{place(from)}</TableCell><TableCell>{place(to)}</TableCell></TableRow>)}</TableBody></Table></div>}
      <Button type="button" disabled={search.loading || checking || stale || !!stop || changes.length === 0} onClick={onApply}>Använd förslaget</Button>
      <p className="schema-note">Ändringen sparas i samma utkast och kan ångras i ett steg.</p>
    </>}
  </section>;
}
