'use client';
/** Fördiagnos och sökstatistik enligt Regelavvikelser-listans mönster (SM-DIAGNOS). */
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import { FLASKHALS, type SchemaDiagnosAction, type SchemaDiagnosFynd, type SchemaDiagnosResurs, type SchemaSearchStatistics } from '@/lib/schema-diagnos.ts';

export function ForeBerakning({ findings, busy, onContinue, onTarget }: {
  findings: SchemaDiagnosFynd[]; busy: boolean; onContinue: () => void; onTarget: (action: SchemaDiagnosAction) => void;
}) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { if (findings.length) { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'center' }); } }, [findings]);
  if (!findings.length) return null;
  return <section aria-label="Före beräkning" className="rounded-lg border border-border bg-card p-4 space-y-3" aria-busy={busy}>
    <h2 ref={heading} tabIndex={-1} className="section-heading">Före beräkning</h2>
    <p className="schema-note">Underlaget har {findings.length} {findings.length === 1 ? 'punkt' : 'punkter'} att se över. Du kan rätta villkoren eller ta fram ett förslag där vissa pass saknar tid.</p>
    <ul className="divide-y divide-border">
      {findings.map((f, i) => <li key={`${f.code}-${i}`} className="py-3 space-y-2">
        <span className="status-badge">{f.proof ? 'Går inte ihop' : 'Att kontrollera'}</span>
        <p>{f.message}</p>
        <Button type="button" variant="outline" disabled={busy} onClick={() => onTarget(f.action)}>{f.action.label}</Button>
      </li>)}
    </ul>
    <Button type="button" disabled={busy} onClick={onContinue}>Ta fram förslag ändå</Button>
  </section>;
}

export function SvarastAttLagga({ statistics, onFollow, onCondition }: {
  statistics: SchemaSearchStatistics | undefined; onFollow: (lessonId: string) => void; onCondition: (resource: SchemaDiagnosResurs) => void;
}) {
  if (!statistics) return null;
  return <details className="schema-list">
    <summary><h2>Svårast att lägga</h2><span className="schema-note">Visa sökstatistik och hinder</span></summary>
    <section aria-label="Svårast att lägga" className="space-y-3">
    <p className="schema-note">De högst 20 pass som oftast nekades, flyttades tillbaka eller trängdes undan i beräkningen. Antalen gäller motorns sökförsök; de ändrar inte ditt utkast.</p>
    {!statistics.lessons.length ? <p className="empty-state">Inga sökhändelser registrerades. Det kan ske när inga pass behöver placeras eller alla pass är låsta.</p> : <ol className="divide-y divide-border">
      {statistics.lessons.map(l => <li key={l.lesson} className="py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 grow"><b>{l.title}</b><p className="schema-note">{l.attempts} starttidsförsök · {l.moves} flyttförsök · {l.backtracks} nekanden eller återgångar · {l.ejections} undanträngningar</p></div>
        <Button type="button" variant="outline" onClick={() => onFollow(l.lesson)}>Följ passet</Button>
      </li>)}
    </ol>}
    <h3 className="section-heading">Villkor och resurser som stod i vägen</h3>
    {!statistics.bottlenecks.length ? <p className="empty-state">Inga hinder registrerades under sökningen.</p> : <ul className="divide-y divide-border">
      {statistics.bottlenecks.map((b, i) => <li key={`${b.code}-${b.resource?.id ?? ''}-${i}`} className="py-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 grow">{FLASKHALS[b.code] ?? 'Villkor'}{b.resource ? `: ${b.resource.label}` : ''} · {b.count} sökförsök</p>
        {b.resource && <Button type="button" variant="outline" onClick={() => onCondition(b.resource!)}>{b.resource.id.startsWith('kluster-') ? 'Visa grupperna' : 'Visa villkoren'}</Button>}
      </li>)}
    </ul>}
    </section>
  </details>;
}
