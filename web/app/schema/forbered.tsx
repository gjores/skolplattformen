'use client';
// Förbered-ytan (05.2-SM-UXF-31, designvyerna Forbered och Forutsattningar): ytval, nästa uppgift, checklista med sju punkter och kortet
// Förutsättningar just nu. Människans genomgång sparas i webbläsaren (antagande A9); maskinens kontroll bockar aldrig av något.
import { useId, useState, type ReactNode } from 'react';
import { CalendarDaysIcon, ClipboardListIcon, ListChecksIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { genomgangsStatus, nastaUppgift, parseGenomgang, type ForberedOmrade, type ForberedPunkt, type Genomgang } from '@/lib/schema-forbered.ts';

export type SchemaYta = 'forbered' | 'schema' | 'granska';
const ytaKey = (unitId: string, schoolYear: number) => `schema-yta:${unitId}:${schoolYear}`;
export function storedYta(unitId: string, schoolYear: number): SchemaYta | null {
  try { const v = window.localStorage.getItem(ytaKey(unitId, schoolYear)); return v === 'forbered' || v === 'schema' || v === 'granska' ? v : null; } catch { return null; }
}
export function rememberYta(unitId: string, schoolYear: number, yta: SchemaYta) { try { window.localStorage.setItem(ytaKey(unitId, schoolYear), yta); } catch { /* utan lagring gäller valet tills sidan lämnas */ } }

/** Tre arbetsytor för samma utkast. */
export function Ytval({ yta, onYta }: { yta: SchemaYta; onYta: (yta: SchemaYta) => void }) {
  return <nav aria-label="Arbetsytor" className="schema-ytval" data-ytval>
    {([['forbered', 'Förbered', ClipboardListIcon], ['schema', 'Lägg schema', CalendarDaysIcon], ['granska', 'Granska', ListChecksIcon]] as const).map(([id, namn, Icon]) =>
      <Button key={id} type="button" variant="ghost" aria-current={yta === id ? 'page' : undefined} onClick={() => onYta(id)}><Icon aria-hidden="true"/>{namn}</Button>)}
  </nav>;
}

const genomgangKey = (unitId: string, schoolYear: number) => `schema-genomgang:${unitId}:${schoolYear}`;
/** Genomgångar per skola och läsår, i den här webbläsaren. */
export function useGenomgang(unitId: string, schoolYear: number): [Genomgang, (id: ForberedOmrade, avtryck: string | null) => void] {
  const [value, setValue] = useState<Genomgang>(() => { try { return parseGenomgang(JSON.parse(window.localStorage.getItem(genomgangKey(unitId, schoolYear)) ?? 'null')); } catch { return {}; } });
  const set = (id: ForberedOmrade, avtryck: string | null) => setValue(previous => {
    const next = { ...previous }; if (avtryck === null) delete next[id]; else next[id] = { avtryck, at: new Date().toISOString() };
    try { window.localStorage.setItem(genomgangKey(unitId, schoolYear), JSON.stringify(next)); } catch { /* gäller då bara tills sidan lämnas */ }
    return next;
  });
  return [value, set];
}
export const forberedAnkare = (id: ForberedOmrade) => `forbered-${id}`;
/** Går till området och sätter fokus på dess rubrik, så att tangentbord och skärmläsare följer med. */
export function oppnaOmrade(id: ForberedOmrade) {
  const el = document.getElementById(forberedAnkare(id));
  el?.scrollIntoView({ block: 'start' }); el?.querySelector<HTMLElement>('h2')?.focus();
}
const datum = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
const STATUS = { aterstar: { text: 'Återstår', ton: '' }, genomgangen: { text: 'Genomgånget', ton: 'success' }, andrat: { text: 'Ändrat sedan genomgången', ton: 'warning' } } as const;

export function ForberedOversikt({ punkter, genomgang, disabled, onGenomgang }: { punkter: ForberedPunkt[]; genomgang: Genomgang; disabled: boolean; onGenomgang: (id: ForberedOmrade, avtryck: string | null) => void }) {
  const rubrik = useId(), nasta = nastaUppgift(punkter, genomgang), klara = punkter.filter(p => genomgangsStatus(p, genomgang) === 'genomgangen').length;
  return <>
    <div>
      <div className="section-heading"><h2>Förutsättningar för schemat</h2></div>
      <p>Det som redan finns i timplan, kalender och tjänstefördelning är hämtat. Komplettera det som saknas i valfri ordning; du kan lämna och komma tillbaka.</p>
    </div>
    <section aria-label="Nästa uppgift" className="rounded-lg border border-border p-4 space-y-2" style={{ background: 'var(--info-surface)' }} data-nasta={nasta?.omrade ?? 'klart'}>
      {nasta ? <>
        <h3 className="font-semibold">Nästa uppgift: {nasta.text.charAt(0).toLocaleLowerCase('sv') + nasta.text.slice(1)}</h3>
        <p>{nasta.skal} Övriga områden kan ändras under tiden.</p>
        <Button type="button" onClick={() => oppnaOmrade(nasta.omrade)}>{nasta.atgard === 'Visa' ? `Visa ${punkter.find(p => p.id === nasta.omrade)!.titel.toLocaleLowerCase('sv')}` : nasta.atgard}</Button>
      </> : <><h3 className="font-semibold">Alla områden är genomgångna</h3><p>Inga kända luckor finns i de uppgifter appen kan kontrollera. Det säger inget om att schemat går att lägga; det visar först ett förslag.</p></>}
    </section>
    <section aria-labelledby={rubrik} className="rounded-lg border border-border bg-card p-4 space-y-3" data-checklista>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 id={rubrik} className="font-semibold">Checklista</h3><span data-klara>{klara} av {punkter.length} genomgångna</span></div>
      <p className="schema-note">En bock betyder att en person har gått igenom området. Maskinens kontroll står under och bockar inte av något. Genomgången sparas i den här webbläsaren.</p>
      <ul className="divide-y divide-border">{punkter.map(p => {
        const status = genomgangsStatus(p, genomgang), g = genomgang[p.id];
        return <li key={p.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start" data-punkt={p.id} data-status={status}>
          <div className="space-y-1 min-w-0">
            <p className="flex flex-wrap items-center gap-2"><strong>{p.titel}</strong><span className={`status-badge ${STATUS[status].ton}`}>{STATUS[status].text}{status === 'genomgangen' && g ? ` ${datum(g.at)}` : ''}</span></p>
            <p>{p.varden.join(' · ')}</p>
            <p className="schema-note">Kontroll: {p.kontroll.join(' ')}</p>
            {status === 'andrat' && <p className="schema-note">Innehållet har ändrats sedan {g ? datum(g.at) : 'genomgången'}. Gå igenom området igen och bocka av det.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="schema-val"><input type="checkbox" disabled={disabled} checked={status === 'genomgangen'} onChange={e => onGenomgang(p.id, e.target.checked ? p.avtryck : null)}/>Genomgånget<span className="sr-only">: {p.titel}</span></label>
            <Button type="button" variant="outline" aria-label={`${p.atgard}: ${p.titel}`} onClick={() => oppnaOmrade(p.id)}>{p.atgard}</Button>
          </div>
        </li>; })}</ul>
      <p className="schema-note">Ändras innehållet i ett avbockat område visar raden Ändrat sedan genomgången.</p>
    </section>
  </>;
}

/** `provning`: vad som faktiskt har prövats. Varje besked säger vad det inte visar. */
export type ForberedProvning = { typ: 'inte' } | { typ: 'kontroll'; fynd: number; tid: string | null } | { typ: 'forslag'; status: string; inaktuellt: boolean };
export function ForutsattningarKort({ punkter, provning, kvalitet, kontrollera, taFram, busy }: { punkter: ForberedPunkt[]; provning: ForberedProvning; /** Lägesbild och mått efter ett förslag. */ kvalitet: ReactNode | null;
  kontrollera: () => void; taFram: ReactNode; busy: boolean }) {
  const rubrik = useId(), saknas = punkter.filter(p => p.saknas > 0 && p.nasta), salar = punkter.find(p => p.id === 'salar'), hinder = salar?.kontroll.find(k => k.includes('ingen lämplig sal')) ?? null;
  const fraga = (nr: number, titel: string, besked: string, ton: string, text: ReactNode, grans: string) => <div className="space-y-1" data-fraga={nr}>
    <h4 className="text-sm font-medium text-muted-foreground">{nr}. {titel}</h4>
    <p><span className={`status-badge ${ton}`}>{besked}</span></p>
    <div>{text}</div><p className="schema-note">{grans}</p></div>;
  return <section aria-labelledby={rubrik} className="rounded-lg border border-border bg-card p-4 space-y-4" data-forutsattningar>
    <h3 id={rubrik} className="font-semibold">Förutsättningar just nu</h3>
    <div className="grid gap-4 md:grid-cols-2">
      {fraga(1, 'Finns uppgifterna?', saknas.length ? 'Behöver kompletteras' : 'Inga kända luckor', saknas.length ? 'warning' : 'success',
        saknas.length ? <ul className="list-disc pl-5">{saknas.map(p => <li key={p.id}>{p.nasta}.</li>)}</ul> : <p>Appen hittar inga saknade uppgifter i det den kan kontrollera.</p>,
        'Gå igenom lärarnas tillgänglighet och stäm av provplanen mot Skolverkets provdatum.')}
      {fraga(2, 'Hur stort är utrymmet?', hinder ? 'Hinder' : 'Inte beräknat', hinder ? 'warning' : '',
        <p>{hinder ? `${hinder} ` : ''}Antal möjliga tider och salar räknas inte före ett förslag.</p>, 'Få eller många alternativ säger inte om schemat blir bra.')}
      {fraga(3, 'Vad har prövats?', provning.typ === 'inte' ? 'Inte prövat' : provning.typ === 'kontroll' ? provning.fynd ? `Kontrollerat, ${provning.fynd} fynd` : 'Kontrollerat, inga påvisade hinder' : provning.inaktuellt ? 'Inaktuellt förslag' : 'Förslag beräknat',
        provning.typ === 'kontroll' && provning.fynd ? 'warning' : provning.typ === 'forslag' && provning.inaktuellt ? 'warning' : '',
        <p>{provning.typ === 'inte' ? 'Hela schemat är ännu inte prövat.' : provning.typ === 'kontroll' ? `Kontroll av underlaget före beräkning${provning.tid ? ` ${provning.tid}` : ''}.${provning.fynd ? ' Fynden står under Kontroll före beräkning.' : ''}`
          : provning.inaktuellt ? 'Underlaget har ändrats sedan förslaget togs fram. Förslaget visas bara som jämförelse.' : `Senaste förslaget: ${provning.status}.`}</p>,
        provning.typ === 'kontroll' ? 'Kontrollen bevisar inte att hela schemat går att lägga.' : provning.typ === 'forslag' ? 'En räknetid som tog slut är inget bevis på att kraven är omöjliga.' : 'En kontroll av underlaget söker hinder utan att lägga något schema.')}
      {fraga(4, 'Hur bra blev kandidaten?', kvalitet ? 'Efter senaste förslaget' : 'Kvaliteten är inte prövad', '', kvalitet ?? <p>Mått visas efter ett schemaförslag på aktuellt underlag.</p>,
        'Summerade mått visar inte vem som får en försämring. Önskemål och förflyttningar mäts inte ännu.')}
    </div>
    <div className="rounded-md border border-border p-3 space-y-2" data-ta-fram>
      <h4 className="font-semibold">Ta fram schemaförslag</h4>
      <p>{saknas.length ? `${saknas.map(p => p.nasta).join('. ')}. Ett förslag nu kan ha luckor i underlaget.` : 'Underlaget har inga kända luckor. Förslaget lägger tid och, där salbehov finns, sal.'}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy} onClick={kontrollera}>Kontrollera underlaget</Button>{taFram}</div>
    </div>
  </section>;
}

/** Ett förberedelseområde med fokuserbar rubrik som checklistan och nästa uppgift går till. */
export function Omrade({ id, titel, children }: { id: ForberedOmrade; titel: string; children: ReactNode }) {
  return <section id={forberedAnkare(id)} aria-labelledby={`${forberedAnkare(id)}-rubrik`} className="space-y-3 scroll-mt-4" data-omrade={id}>
    <div className="section-heading"><h2 id={`${forberedAnkare(id)}-rubrik`} tabIndex={-1}>{titel}</h2></div>
    {children}
  </section>;
}
