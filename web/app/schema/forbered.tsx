'use client';
import { useId, useState, type ReactNode } from 'react';
import { ArrowUpRightIcon, CalendarDaysIcon, ClipboardListIcon, Clock3Icon, DoorOpenIcon, LayersIcon, ListChecksIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { genomgangsStatus, parseGenomgang, type ForberedOmrade, type ForberedPunkt, type Genomgang } from '@/lib/schema-forbered.ts';

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
  el?.scrollIntoView({ block: 'start' }); el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
}

export const FORBERED_GRUPPER = [
  { id: 'underlag', namn: 'Underlag', ikon: LayersIcon, omraden: ['underlag'] },
  { id: 'pass', namn: 'Pass och salar', ikon: DoorOpenIcon, omraden: ['lektioner', 'salar'] },
  { id: 'tider', namn: 'Lärartider och regler', ikon: Clock3Icon, omraden: ['larartider', 'regler', 'mal'] },
  { id: 'prov', namn: 'Prov och aktiviteter', ikon: ClipboardListIcon, omraden: ['aktiviteter'] },
] as const;

export type ForberedGrupp = typeof FORBERED_GRUPPER[number]['id'];
export type ForberedMal = { omrade: ForberedOmrade; ref?: string; resurs?: 'sal' | 'provvakt' };
export type ForberedAtgard = { mal: ForberedMal; text: string; knapp: string; detalj?: string };
type Val = { ref: string; namn: string };
type Genvagsval = Record<'salar' | 'larartider' | 'aktiviteter', readonly Val[]>;
const GENVAR = [
  { omrade: 'salar', namn: 'Salbehov', etikett: 'Undervisning för salbehov', knapp: 'Öppna salbehov', tomt: 'Inga undervisningar att välja' },
  { omrade: 'larartider', namn: 'Lärartid', etikett: 'Lärare för lärartid', knapp: 'Öppna lärartid', tomt: 'Inga lärare att välja' },
  { omrade: 'aktiviteter', namn: 'Provbokning', etikett: 'Provbokning att öppna', knapp: 'Öppna provbokning', tomt: 'Inga provbokningar att välja' },
] as const;

export function gruppForOmrade(omrade: ForberedOmrade): ForberedGrupp {
  return FORBERED_GRUPPER.find(g => g.omraden.some(id => id === omrade))!.id;
}

export function ForberedOmradesval({ grupp, onGrupp }: { grupp: ForberedGrupp; onGrupp: (grupp: ForberedGrupp) => void }) {
  return <nav aria-label="Förbered arbetsområden" className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2">
    {FORBERED_GRUPPER.map(({ id, namn, ikon: Ikon }) =>
      <Button key={id} type="button" variant={grupp === id ? 'secondary' : 'ghost'}
        className={grupp === id ? 'border-primary/30 text-primary' : 'text-muted-foreground'}
        aria-current={grupp === id ? 'page' : undefined} onClick={() => onGrupp(id)}>
        <Ikon aria-hidden="true"/>{namn}
      </Button>)}
  </nav>;
}

export function ForberedOversikt({ kalla, kontroll, primar, alternativ, uppgifter, genvagar, onOppna }: {
  kalla: string; kontroll: string; primar: ReactNode; alternativ: ReactNode;
  uppgifter: readonly ForberedAtgard[]; genvagar: Genvagsval; onOppna: (mal: ForberedMal) => void;
}) {
  const [val, setVal] = useState<Partial<Record<keyof Genvagsval, string>>>({});
  const rubrik = useId();
  const visaUppgifter = (rader: readonly ForberedAtgard[]) => <ul className="divide-y divide-border">
    {rader.map(({ mal, text, detalj, knapp }) => <li key={JSON.stringify([mal, text])} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">{text}</p>
        {detalj && <p className="text-sm text-muted-foreground">{detalj}</p>}
      </div>
      <Button type="button" variant="ghost" className="text-primary" onClick={() => onOppna(mal)}>{knapp}<ArrowUpRightIcon aria-hidden="true"/></Button>
    </li>)}
  </ul>;

  return <div className="space-y-3">
    <section aria-labelledby={rubrik} className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-secondary/50 px-4 py-4 lg:px-5">
        <div className="min-w-0 flex-1 basis-72 space-y-1">
          <h2 id={rubrik} className="text-xl font-semibold tracking-tight">Förbered schemat</h2>
          <p className="text-sm text-muted-foreground">{kalla}</p>
          <output className="block text-sm font-medium">{kontroll}</output>
        </div>
        <div className="flex flex-wrap items-start gap-2">{primar}{alternativ}</div>
      </div>
      {uppgifter.length > 0 && <div className="border-t border-border px-4 py-3 lg:px-5">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Att åtgärda</h3>
          <span className="status-badge warning">{uppgifter.length}</span>
        </div>
        {visaUppgifter(uppgifter.slice(0, 3))}
        {uppgifter.length > 3 && <details className="pt-1 text-sm">
          <summary className="w-fit cursor-pointer rounded-sm py-2 font-medium text-primary">Visa ytterligare {uppgifter.length - 3}</summary>
          {visaUppgifter(uppgifter.slice(3))}
        </details>}
      </div>}
    </section>

    <section aria-label="Gå direkt till" className="min-w-0 rounded-lg border border-border bg-card">
      <h3 className="border-b border-border px-4 py-2.5 font-semibold lg:px-5">Gå direkt till</h3>
      <div className="grid gap-3 p-4 md:grid-cols-3 lg:px-5">
        {GENVAR.map(({ omrade, namn, etikett, knapp, tomt }) => {
          const alternativ = genvagar[omrade];
          const aktuell = alternativ.some(x => x.ref === val[omrade]) ? val[omrade]! : '';
          const id = rubrik + '-' + omrade;
          return <form key={omrade} className="grid min-w-0 gap-2" onSubmit={e => { e.preventDefault(); if (aktuell) onOppna({ omrade, ref: aktuell }); }}>
            <label htmlFor={id} className="text-sm font-medium">{namn}</label>
            <div className="grid min-w-0 gap-1.5 2xl:grid-cols-[minmax(0,1fr)_auto]">
              <select id={id} aria-label={etikett} disabled={!alternativ.length}
                className="min-h-(--control-height) w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm"
                value={aktuell} onChange={e => setVal(state => ({ ...state, [omrade]: e.target.value }))}>
                <option value="">{alternativ.length ? 'Välj …' : tomt}</option>
                {alternativ.map(x => <option key={x.ref} value={x.ref}>{x.namn}</option>)}
              </select>
              <Button type="submit" variant="outline" disabled={!aktuell} className="h-auto min-h-11 justify-self-start whitespace-normal">{knapp}</Button>
            </div>
          </form>;
        })}
      </div>
    </section>
  </div>;
}

const datum = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

export function Omradesgenomgang({ punkt, genomgang, disabled, onGenomgang }: {
  punkt: ForberedPunkt; genomgang: Genomgang; disabled: boolean; onGenomgang: (id: ForberedOmrade, avtryck: string | null) => void;
}) {
  const status = genomgangsStatus(punkt, genomgang);
  const reviewed = genomgang[punkt.id];
  return <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm"
    data-punkt={punkt.id} data-status={status}>
    <div className="min-w-0 space-y-1">
      <p>{punkt.varden.join(' · ')}</p>
      <p className="text-muted-foreground">{punkt.kontroll.join(' ')}</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="schema-val"><input type="checkbox" disabled={disabled} checked={status === 'genomgangen'}
        onChange={e => onGenomgang(punkt.id, e.target.checked ? punkt.avtryck : null)}/>Genomgånget<span className="sr-only">: {punkt.titel}</span></label>
      {status === 'genomgangen' && reviewed && <span className="text-muted-foreground">{datum(reviewed.at)}</span>}
      {status === 'andrat' && <span className="status-badge warning">Ändrat sedan genomgången</span>}
    </div>
  </div>;
}

export function Omrade({ id, titel, hidden, genomgang, children }: { id: ForberedOmrade; titel: string; hidden: boolean; genomgang: ReactNode; children: ReactNode }) {
  return <section id={forberedAnkare(id)} aria-labelledby={forberedAnkare(id) + '-rubrik'} className="min-w-0 space-y-3 scroll-mt-20" hidden={hidden} data-omrade={id}>
    <div className="section-heading"><h2 id={forberedAnkare(id) + '-rubrik'} tabIndex={-1}>{titel}</h2></div>
    {genomgang}
    {children}
  </section>;
}
