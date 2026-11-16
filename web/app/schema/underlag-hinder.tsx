'use client';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag } from '@/lib/schema-contract.ts';

/** Ett tomt, lyckat API-svar är fortfarande ett hinder för den som ska lägga schemat. */
export function UnderlagHinder({ forslag, onTeaching, onNeeds }: { forslag: SchemaForslag; onTeaching: () => void; onNeeds: () => void }) {
  const heading = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => { heading.current?.focus(); heading.current?.scrollIntoView({ block: 'center' }); }, [forslag]);
  const missingPlan = forslag.basis === null;
  return <section role="alert" aria-labelledby="schema-underlag-hinder" className="rounded-lg border border-destructive bg-destructive/10 p-4 space-y-3">
    <h2 ref={heading} tabIndex={-1} id="schema-underlag-hinder" className="section-heading">Schemat kan inte läggas ännu</h2>
    <p>{missingPlan
      ? 'Det finns ingen tjänstefördelning för den valda skolan och läsåret. Inga undervisningspass kunde tas fram.'
      : 'Underlaget gav inga undervisningspass för den valda perioden. Kontrollera undervisningsbehoven och deras tid i timplanen.'}</p>
    <p>Välj rätt skola och läsår eller komplettera underlaget. Ta sedan fram ett nytt schemaförslag.</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={onTeaching}>Öppna tjänstefördelningen</Button>
      <Button type="button" variant="outline" onClick={onNeeds}>Öppna timplanerna</Button></div>
  </section>;
}
