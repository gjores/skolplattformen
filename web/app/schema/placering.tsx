'use client';
// Förslag visas före ändring. Varje berört pass redovisas från → till, med skolans namn på resurserna.
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaPlacement } from '@/lib/schema-contract.ts';
import type { SchemaPlacering, SchemaPlaceringRequest } from '@/lib/schema-placering.ts';
import { clock, dayName, names } from './delat';

export type PlaceringSokning = { request: SchemaPlaceringRequest; key: string; inputKey: string; result: SchemaPlacering | null; loading: boolean; error: string | null };
export function Placeringsforslag({ search, forslag, stale, checking, onDepth, onApply, onClose, children }: {
  search: PlaceringSokning; forslag: SchemaForslag; stale: boolean; checking: boolean;
  onDepth: (depth: 1 | 2 | 3) => void; onApply: (index: number, key: string) => void; onClose: () => void; children?: ReactNode;
}) {
  const heading = useId(), headingRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { headingRef.current?.focus(); headingRef.current?.scrollIntoView({ block: 'start' }); }, [search.key]);
  const lesson = forslag.lessons.find(l => l.id === search.request.lesson);
  const place = (p: SchemaPlacement | null) => p ? `${dayName(p.day)} ${clock(p.startMin)}${p.room ? ` · ${forslag.rooms.find(r => r.id === p.room)?.name ?? 'Sal saknas i underlaget'}` : ' · Ingen sal'}` : 'Viloytan';
  const suggestions = search.result?.suggestions ?? [], blocked = search.loading || checking || stale;
  return <section data-schema-placement-panel className="schema-list min-w-0 border border-border bg-card p-4" aria-labelledby={heading} aria-busy={search.loading || checking}>
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="folj-overrad">Granska före ändring</p><h2 id={heading} ref={headingRef} tabIndex={-1}>Placeringsförslag{lesson ? ` för ${lesson.title}` : search.request.mode === 'rest' ? ' för hela viloytan' : ''}</h2></div>
      <Button variant="outline" disabled={checking} onClick={onClose}>Stäng placeringsförslagen</Button></div>
    <p className="schema-note">{search.request.mode === 'rest' ? 'Varje förslag lägger alla pass från viloytan. Inga halvfärdiga förslag genomförs.' : search.request.mode === 'target' ? 'Passet läggs på den valda tiden. Andra pass flyttas bara i det förslag du godkänner.' : 'Jämför placeringarna och vilka scheman som berörs.'} Inget ändras före Godkänn. Hela förslaget kontrolleras på nytt innan det genomförs, som ett steg i ångra.</p>
    {search.request.target && <p>Önskad plats: {place({ lesson: search.request.lesson ?? '', ...search.request.target })}.</p>}
    <div className="flex flex-wrap items-center gap-3"><span className="status-badge">Sökdjup {search.request.depth} av 3</span>
      {search.request.depth < 3 && <Button variant="outline" disabled={search.loading || checking} onClick={() => onDepth((search.request.depth + 1) as 2 | 3)}>Öka sökdjupet</Button>}
      {stale && <Button variant="outline" disabled={search.loading || checking} onClick={() => onDepth(search.request.depth)}>Sök igen med aktuellt utkast</Button>}</div>
    <output className="schema-note" aria-live="polite">{search.loading ? 'Söker placeringsförslag, högst två sekunder i motorn…' : checking ? 'Kontrollerar hela förslaget. Passen står kvar tills kontrollen är klar.' : ''}</output>
    {stale && <p className="schema-note">Utkastet, låsen eller villkoren har ändrats. Förslagen gäller det tidigare läget och kan inte godkännas. Sök igen.</p>}
    {search.error && <p className="valplan-alert" role="alert">{search.error}</p>}
    {search.result?.timedOut && <p className="schema-note">Söktiden tog slut. Det kan finnas fler lösningar än de som visas här.</p>}
    {!search.loading && search.result && suggestions.length === 0 && <p className="empty-state">Inget fullständigt förslag hittades på detta sökdjup. {search.request.depth < 3 ? 'Öka sökdjupet eller se över reglerna och de låsta passen.' : 'Se över reglerna och de låsta passen.'}</p>}
    {children}
    <ol className="grid min-w-0 gap-4">{suggestions.slice(0, 5).map((suggestion, index) => <li key={index} className="min-w-0 rounded-lg border border-border bg-card p-4">
      <h3 className="section-heading">Förslag {index + 1} · {suggestion.changes.length} pass ändras</h3>
      <p>{suggestion.changes.filter(c => c.from === null).length} {suggestion.changes.filter(c => c.from === null).length === 1 ? 'ny placering' : 'nya placeringar'} · {suggestion.changes.filter(c => c.from !== null).length} {suggestion.changes.filter(c => c.from !== null).length === 1 ? 'redan lagt pass flyttas' : 'redan lagda pass flyttas'}.</p>
      <p>Elevernas håltid: {suggestion.metricsBefore.studentGapMin} → {suggestion.metricsAfter.studentGapMin} elevminuter. Lärarnas håltid: {suggestion.metricsBefore.teacherGapMin} → {suggestion.metricsAfter.teacherGapMin} lärarminuter.</p>
      <p className="schema-note">Elevminuter väger samman tiden och antalet berörda elever. Samlad påverkan: {suggestion.metricsBefore.cost} → {suggestion.metricsAfter.cost}. Lägre värde är bättre; måttet omfattar håltid, önskemål och flyttningar.</p>
      <div className="min-w-0 overflow-x-auto rounded-md border border-border"><Table><TableHeader><TableRow><TableHead>Pass och berörda scheman</TableHead><TableHead>Från</TableHead><TableHead>Till</TableHead></TableRow></TableHeader>
        <TableBody>{suggestion.changes.map(change => { const l = forslag.lessons.find(p => p.id === change.lesson); return <TableRow key={change.lesson}><TableCell><strong>{l?.title ?? 'Passet saknas i underlaget'}</strong><p className="schema-note">{l ? [names(l.classIds, forslag.classes), names(l.teacherIds, forslag.teachers)].filter(Boolean).join(' · ') : ''}</p></TableCell><TableCell>{place(change.from)}</TableCell><TableCell>{place(change.to)}</TableCell></TableRow>; })}</TableBody></Table></div>
      <Button variant={index === 0 ? 'default' : 'outline'} disabled={blocked} onClick={() => onApply(index, search.key)}>Godkänn förslag {index + 1}</Button>
    </li>)}</ol>
  </section>;
}
