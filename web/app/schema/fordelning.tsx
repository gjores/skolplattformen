'use client';
import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SCHEMA_VILLKOR_LIMITS, type SchemaForslag, type SchemaKontroll, type SchemaVillkor } from '@/lib/schema-contract.ts';

const hours = (minutes: number) => `${(minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
export function Fordelning({ forslag, villkor, kontroll, disabled, onChange }: {
  forslag: SchemaForslag; villkor: SchemaVillkor; kontroll: SchemaKontroll | null; disabled: boolean; onChange: (value: SchemaVillkor) => void;
}) {
  const [query, setQuery] = useState(''), queryId = useId();
  const rows = forslag.fordelning.filter(row => `${row.title} ${row.classes.join(' ')}`.toLocaleLowerCase('sv-SE').includes(query.trim().toLocaleLowerCase('sv-SE')));
  const change = (ref: string, antal: number | null) => {
    const next = (villkor.fordelning ?? []).filter(row => row.ref !== ref);
    onChange({ ...villkor, fordelning: antal === null ? next : [...next, { ref, antal }] });
  };
  return <section aria-label="Fördela undervisningen på lektioner" className="rounded-lg border border-border bg-card p-4 space-y-3 min-w-0">
    <h2 className="section-heading">Fördela undervisningen på lektioner</h2>
    <p className="schema-note">Välj antal lektioner per vecka för varje undervisningsgrupp. Tiden kommer fortfarande från timplanen. Ändrat antal kräver ett nytt schemaförslag och ändrar inte de redan lagda passen.</p>
    <label htmlFor={queryId} className="grid gap-1 text-sm">Sök undervisning eller grupp<Input id={queryId} value={query} onChange={event => setQuery(event.target.value)} type="search"/></label>
    {!rows.length ? <p className="empty-state">Ingen undervisning matchar sökningen.</p> : <div className="max-h-96 overflow-auto rounded-md border border-border">
      <Table><TableHeader><TableRow><TableHead>Undervisning och grupp</TableHead><TableHead>Lektioner per vecka</TableHead><TableHead>Tid och nuvarande fördelning</TableHead></TableRow></TableHeader>
        <TableBody>{rows.map(row => { const current = kontroll?.teachings.find(item => item.ref === row.ref) ?? forslag.teachings.find(item => item.ref === row.ref);
          const selected = villkor.fordelning?.find(item => item.ref === row.ref)?.antal ?? null;
          return <TableRow key={row.ref}><TableCell className="whitespace-normal min-w-48"><strong>{row.title}</strong><p className="schema-note">{row.classes.join(', ')}</p>
            {row.begransning && <p className="text-sm text-muted-foreground">{row.begransning}</p>}</TableCell>
            <TableCell><select className="rounded-md border border-input bg-background p-2 min-h-(--control-height)" aria-label={`Lektioner per vecka för ${row.title}, ${row.classes.join(', ')}`} value={selected ?? ''} disabled={disabled}
              onChange={event => change(row.ref, event.target.value ? Number(event.target.value) : null)}>
              <option value="">Automatisk fördelning</option>{Array.from({ length: SCHEMA_VILLKOR_LIMITS.antal[1] }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n} {n === 1 ? 'lektion' : 'lektioner'}</option>)}
            </select></TableCell>
            <TableCell className="whitespace-normal min-w-48">{forslag.villkor.timeBasis === 'lasar' && <p>{forslag.period === 'lasar' ? 'Läsåret' : 'Vald termin'}: {hours(current?.plannedMin ?? row.terms.reduce((n, t) => n + t.plannedMin, 0))} utlagt av årsbehovet {hours(current?.needMin ?? row.terms.reduce((n, t) => n + t.needMin, 0))}.</p>}{row.terms.map(term => { const actual = current?.terms.find(item => item.term === term.term);
              const planned = actual?.plannedMin ?? term.plannedMin;
              return <p key={term.term}>{term.term.toUpperCase()}: {term.antalPass} lektioner per vecka · {hours(planned)}{forslag.villkor.timeBasis === 'lasar' ? ' utlagt' : ` av ${hours(term.needMin)} · ${hours(Math.max(0, term.needMin - planned))} kvar`}</p>;
            })}</TableCell></TableRow>;
        })}</TableBody></Table>
    </div>}
  </section>;
}
