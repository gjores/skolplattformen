'use client';
// Sök i samlingsvyn (05.2-SM-SAMLINGSVY): "Lägg till klass, grupp, lärare, sal eller elev" (I51) och "Sök ledig lärare eller sal" (I58).
// Elever finns bara i sökningen när servern har gett elevlistan, alltså för den som får se elever. Inget sparas.
import { useEffect, useId, useRef } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { SAMLING_SLAG, ledigaLarare, ledigaSalar, samlingKandidater, samlingNyckel, type SamlingKandidat, type SamlingResurs, type SamlingSlag, type SamlingTid } from '@/lib/schema-samling.ts';
import { clock, dayName, steps } from './delat.ts';

const ORDNING: SamlingSlag[] = ['klass', 'grupp', 'larare', 'sal', 'elev'];
const ETT: Record<SamlingSlag, string> = { klass: 'klass', grupp: 'grupp', larare: 'lärare', sal: 'sal', elev: 'elev' };

/** Varje ord i sökningen inleder något ord i texten, utan hänsyn till stora och små bokstäver. */
export function traff(search: string, texter: string[]): boolean {
  const ord = texter.join(' ').toLocaleLowerCase('sv-SE').split(/\s+/u);
  return search.trim().toLocaleLowerCase('sv-SE').split(/\s+/u).every(s => ord.some(o => o.startsWith(s)));
}

/** Sökrutan: skriv för att hitta, pil upp och ned mellan träffarna, Enter lägger till. Det som redan visas står inte med. */
export function LaggTill({ open, onOpenChange, forslag, valda, elever, onValj }: {
  open: boolean; onOpenChange: (open: boolean) => void; forslag: SchemaForslag;
  /** Nycklar (`samlingNyckel`) för rader som redan visas. */
  valda: Set<string>;
  /** Elever som går att lägga till. `null`: användaren får inte se elever, eller ingen klass eller grupp visas än. */
  elever: SamlingKandidat[] | null;
  onValj: (r: SamlingResurs, name: string) => void;
}) {
  const alla = [...samlingKandidater(forslag), ...elever ?? []].filter(k => !valda.has(samlingNyckel(k)));
  return <CommandDialog open={open} onOpenChange={onOpenChange} title="Lägg till i samlingsvyn" description="Sök bland klasser, grupper, lärare, salar och elever." className="samling-sok">
    {/* Träff: varje ord i sökningen ska inleda ett ord i namnet eller slaget (klass, grupp, lärare, sal, elev), så att "Klass 1" inte ger Klass 21. */}
    <Command filter={(_, search, keywords) => traff(search, keywords ?? []) ? 1 : 0}>
    <CommandInput placeholder={elever ? 'Sök klass, grupp, lärare, sal eller elev' : 'Sök klass, grupp, lärare eller sal'} aria-label="Sök klass, grupp, lärare, sal eller elev"/>
    <CommandList>
      <CommandEmpty>Ingen träff.</CommandEmpty>
      {ORDNING.map(slag => {
        const egna = alla.filter(k => k.slag === slag);
        return egna.length === 0 ? null : <CommandGroup key={slag} heading={SAMLING_SLAG[slag]}>
          {egna.map(k => <CommandItem key={samlingNyckel(k)} value={samlingNyckel(k)} keywords={[k.name, ETT[slag]]} onSelect={() => { onValj({ slag: k.slag, id: k.id, via: k.via }, k.name); onOpenChange(false); }}>
            {k.name}<span className="samling-sok-slag">{ETT[slag]}</span></CommandItem>)}
        </CommandGroup>;
      })}
    </CommandList>
    </Command>
  </CommandDialog>;
}

/**
 * Panelen Sök ledig lärare eller sal: en tid (vald i en rad eller i fälten) ger lärare och salar utan pass då. Med ett ämne står lärare som har
 * ämnet i tjänstefördelningen först. Salar visas med namn; typ och storlek väntar på salsregistret.
 */
export function LedigSok({ forslag, lessons, tid, amne, valda, onTid, onAmne, onLaggTill, onStang }: {
  forslag: SchemaForslag;
  /** Alla lagda pass i terminen som visas, utan ämnesfilter. */
  lessons: SchemaForslagLesson[];
  tid: SamlingTid; amne: string | null; valda: Set<string>;
  onTid: (tid: SamlingTid) => void; onAmne: (amne: string | null) => void; onLaggTill: (r: SamlingResurs, name: string) => void; onStang: () => void;
}) {
  const id = useId(), rubrik = useRef<HTMLHeadingElement | null>(null), section = useRef<HTMLElement | null>(null);
  useEffect(() => { rubrik.current?.focus(); }, []);
  // Esc i panelen stänger den, som Stäng sökningen.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onStang(); } };
    el.addEventListener('keydown', key);
    return () => el.removeEventListener('keydown', key);
  }, [onStang]);
  const dag = forslag.days[tid.day] ?? forslag.days[0], amnen = [...new Set(forslag.lessons.map(l => l.title))].sort((a, b) => a.localeCompare(b, 'sv'));
  const larare = ledigaLarare(forslag, lessons, tid, amne), salar = ledigaSalar(forslag, lessons, tid);
  const fran = steps(dag.startMin, dag.endMin - 5, 5, tid.startMin), till = steps(tid.startMin + 5, dag.endMin, 5, tid.endMin);
  const visa = (slag: 'larare' | 'sal', x: { id: string; name: string }) => valda.has(samlingNyckel({ slag, id: x.id }))
    ? <span className="schema-note">visas</span>
    : <Button type="button" variant="link" size="sm" aria-label={`Lägg till ${x.name} i samlingsvyn`} onClick={() => onLaggTill({ slag, id: x.id }, x.name)}>Lägg till som rad</Button>;
  return <section ref={section} className="samling-ledig" aria-labelledby={`${id}-rubrik`}>
    <div className="samling-ledig-huvud">
      <h3 id={`${id}-rubrik`} ref={rubrik} tabIndex={-1}>Sök ledig lärare eller sal</h3>
      <Button type="button" variant="outline" onClick={onStang}><XIcon aria-hidden="true"/>Stäng sökningen</Button>
    </div>
    <div className="samling-ledig-falt">
      <label>Dag<select value={tid.day} onChange={e => { const day = Number(e.target.value), d = forslag.days[day], startMin = Math.min(Math.max(tid.startMin, d.startMin), d.endMin - 5);
        onTid({ day, startMin, endMin: Math.min(Math.max(tid.endMin, startMin + 5), d.endMin) }); }}>
        {forslag.days.map((_, d) => <option key={d} value={d}>{dayName(d)}</option>)}</select></label>
      <label>Från<select value={tid.startMin} onChange={e => { const startMin = Number(e.target.value); onTid({ ...tid, startMin, endMin: Math.min(dag.endMin, Math.max(tid.endMin, startMin + 5)) }); }}>
        {fran.map(m => <option key={m} value={m}>{clock(m)}</option>)}</select></label>
      <label>Till<select value={tid.endMin} onChange={e => onTid({ ...tid, endMin: Number(e.target.value) })}>
        {till.map(m => <option key={m} value={m}>{clock(m)}</option>)}</select></label>
      <label>Ämne<select value={amne ?? ''} onChange={e => onAmne(e.target.value || null)}>
        <option value="">Inget ämne valt</option>{amnen.map(a => <option key={a} value={a}>{a}</option>)}</select></label>
    </div>
    <p className="schema-note">Klicka på en tom tid i en rad för att välja tiden där. Lediga är de som inte har något pass {dayName(tid.day).toLowerCase()} {clock(tid.startMin)}–{clock(tid.endMin)} i terminen som visas.
      {amne ? ` Lärare som har ${amne} i tjänstefördelningen står först.` : ' Välj ett ämne för att få lärarna som har ämnet i tjänstefördelningen först.'}</p>
    <div className="samling-ledig-listor">
      <div><h4 id={`${id}-larare`}>Lediga lärare ({larare.length})</h4>
        {larare.length === 0 ? <p className="schema-note">Ingen lärare är ledig hela tiden.</p>
          : <ul aria-labelledby={`${id}-larare`}>{larare.map(t => <li key={t.id}><span>{t.name}</span>{t.harAmnet && <span className="status-badge success">Har {amne}</span>}{visa('larare', t)}</li>)}</ul>}</div>
      <div><h4 id={`${id}-salar`}>Lediga salar ({salar.length})</h4>
        {forslag.rooms.length === 0 ? <p className="schema-note">Skolan har inga salar i villkoren för schemat.</p>
          : salar.length === 0 ? <p className="schema-note">Ingen sal är ledig hela tiden.</p>
          : <ul aria-labelledby={`${id}-salar`}>{salar.map(r => <li key={r.id}><span>{r.name}</span>{visa('sal', r)}</li>)}</ul>}
        <p className="schema-note">Salens typ och storlek visas när salsregistret finns.</p></div>
    </div>
  </section>;
}
