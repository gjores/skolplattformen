'use client';
import { Button } from '@/components/ui/button';
import type { SchemaForslag } from '@/lib/schema-contract.ts';
import type { SchemaVillkorsforslag, SchemaVillkorsforslagRequest } from '@/lib/schema-villkorsforslag.ts';
import { clock, dayName, names, ruleText } from './delat';

export type VillkorsSokning = { key: string; inputKey: string; request: SchemaVillkorsforslagRequest; result: SchemaVillkorsforslag | null; loading: boolean; error: string | null };
export function Villkorsforslag({ search, forslag: f, stale, disabled, onApply }: {
  search: VillkorsSokning; forslag: SchemaForslag; stale: boolean; disabled: boolean; onApply: (index: number, key: string) => void;
}) {
  return <section aria-label="Förslag på ändrade villkor" className="rounded-lg border border-border bg-card p-4 space-y-3" aria-busy={search.loading}>
    <h3 className="section-heading">Förslag på ändrade villkor</h3>
    <p className="schema-note">Här prövas en egen tidsregel i taget. Varje alternativ visar både villkorsändringen och pass som behöver flyttas. Inget ändras förrän du godkänner.</p>
    {search.loading && <output>Prövar villkorsändringar och placeringar…</output>}
    {search.error && <p role="alert" className="text-destructive">{search.error}</p>}
    {stale && <p className="text-destructive">Utkastet har ändrats. Sök placeringsförslag igen innan du godkänner en villkorsändring.</p>}
    {search.result && <p>{search.result.explanation}</p>}
    {search.result?.suggestions.map((s, i) => <div key={s.id} className="rounded-lg border border-border p-4 space-y-3">
      <h4 className="font-semibold">Alternativ {i + 1}: {s.change.message}</h4>
      <dl className="grid gap-2 text-sm"><div><dt className="font-medium">Nu</dt><dd>{ruleText(s.change.before, f.resurser)}</dd></div><div><dt className="font-medium">Efter godkännande</dt><dd>{s.change.after ? ruleText(s.change.after, f.resurser) : 'Den här regeln tas bort. Övriga regler gäller fortfarande.'}</dd></div></dl>
      <ul className="divide-y divide-border">{s.placement.changes.map(c => {
        const l = f.lessons.find(x => x.id === c.lesson), place = (p: typeof c.from) => p ? `${dayName(p.day)} ${clock(p.startMin)}${p.room ? ` · ${f.rooms.find(r => r.id === p.room)?.name ?? p.room}` : ''}` : 'Viloytan';
        return <li key={c.lesson} className="py-2"><strong>{l?.title}</strong><p>{l ? [names(l.classIds, f.classes), names(l.teacherIds, f.teachers)].filter(Boolean).join(' · ') : ''}</p><p>{place(c.from)} → {place(c.to)}</p></li>;
      })}</ul>
      <p className="text-sm text-muted-foreground">Hela alternativet kontrolleras igen och kan ångras som ett steg.</p>
      <Button className="h-auto min-h-11 whitespace-normal text-left" variant="outline" disabled={disabled || stale || search.loading} onClick={() => onApply(i, search.key)}>Godkänn villkorsändring och placering {i + 1}</Button>
    </div>)}
  </section>;
}
