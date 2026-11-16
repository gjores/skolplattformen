'use client';
// Villkor i tabell (05.2-SM-VILLKORSTABELL, Q121–Q127): en flik per resurstyp, en rad per resurs och en kolumn per villkorstyp. Samma egna villkor som
// i formuläret och i veckan; en ändring läggs i utkastet som ett villkorssteg, så att den kan ångras, och tidsvillkor prövas direkt av kontrollen.
// Tabellen är ett rutnät (role="grid"): piltangenter mellan cellerna, Enter eller dubbelklick redigerar, Esc avbryter och lämnar fokus på cellen.
// Inget sparas på servern; villkoren finns i webbläsaren som i dag.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SCHEMA_MARGINAL_DELAR, SCHEMA_VILLKOR_LIMITS, type SchemaForslag, type SchemaKontroll, type SchemaMarginalDel, type SchemaRegel, type SchemaRegelTyp,
  type SchemaVillkor } from '@/lib/schema-contract.ts';
import { MARGINAL_DEL_NAMN, SCHEMA_MARGINAL_ETIKETTER } from '@/lib/schema-marginal.ts';
import type { SchemaKalla } from '@/lib/schema-lager.ts';
import type { SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { VT_FILTER, VT_FLIKAR, VT_SKOLA, VT_TYP_NAMN, VT_VEM, vtErsattCell, vtFiltrera, vtForManga, vtGrund, vtKopiera, vtLaggPaValda, vtMarkerade, vtRader, vtRutnat,
  vtSkolaRader, vtSortera, vtSteg, vtTaBortTyp, vtTillRegler, vtTyper, type VtFilter, type VtFlik, type VtKolumn, type VtMall, type VtRad, type VtSkolaFalt,
  type VtSlag } from '@/lib/schema-villkorstabell.ts';
import { DAYS, SAME_DAY, clock, hoursText, minutesOf, steps } from './delat.ts';
import { Tidsrutnat } from './tidsrutnat.tsx';

/** Var tabellen ska öppnas, till exempel från "Ändra" på ett fält i veckan: fliken, raden och kolumnen. `nr` gör att samma mål kan öppnas igen. */
export type VillkorstabellMal = { flik: VtFlik; ref?: string; typ?: SchemaRegelTyp; falt?: VtSkolaFalt; nr: number };
/** Raden och cellen för ett fält i veckan ("Ändra"). Null för villkor som inte har en rad (marginal för ett enskilt pass): de ändras i formuläret. */
export function villkorstabellMal(k: SchemaKalla, villkor: SchemaVillkor): Omit<VillkorstabellMal, 'nr'> | null {
  if (k.typ !== 'egen') return { flik: 'skola', falt: k.typ === 'skoldag' ? 'days' : k.typ === 'lunch' ? 'lunch' : 'lateAfterMin' };
  const r = villkor.egna[k.index];
  return r && r.slag !== 'pass' ? { flik: r.slag, ref: r.ref, typ: r.typ } : null;
}
import { OppnaFonster } from './fonster';

type Props = {
  villkor: SchemaVillkor; setVillkor: (next: SchemaVillkor) => void; dispatch: (action: SchemaUtkastAtgard) => void;
  forslag: SchemaForslag | null; kontroll: SchemaKontroll | null; disabled: boolean; mal: VillkorstabellMal | null; onOpen?: () => void;
};
type Kol = { id: VtKolumn | 'val'; namn: string; grund?: boolean };
type Redigera = { ref: string; typ: SchemaRegelTyp } | { falt: VtSkolaFalt };
const GRUND_TEXT = 'Kräver nytt förslag: längsta pass, kortaste pass och antal pass avgör vilka pass som finns.';
const FLIK_ORD: Record<VtSlag, [string, string]> = { klass: ['klass', 'klasser'], grupp: ['grupp', 'grupper'], larare: ['lärare', 'lärare'], sal: ['sal', 'salar'], amne: ['ämne', 'ämnen'] };

/** Listan Regelavvikelser under veckan: rubriken får fokus. */
function visaAvvikelser(): void {
  const h = [...document.querySelectorAll<HTMLElement>('.schema-workspace h2')].find(x => x.textContent?.startsWith('Regelavvikelser'));
  if (!h) return;
  h.tabIndex = -1; h.scrollIntoView({ block: 'center' }); h.focus({ preventScroll: true });
}

export function Villkorstabell({ villkor, setVillkor, dispatch, forslag, kontroll, disabled, mal, onOpen }: Props) {
  const id = useId();
  const [flik, setFlik] = useState<VtFlik>('skola'), [sok, setSok] = useState(''), [filter, setFilter] = useState<VtFilter>('alla');
  const [sort, setSort] = useState<{ kol: VtKolumn; dir: 'asc' | 'desc' } | null>(null);
  const [valda, setValda] = useState<Record<string, string[]>>({}), [aktiv, setAktiv] = useState({ r: 0, c: 1 });
  const [redigera, setRedigera] = useState<Redigera | null>(null), [status, setStatus] = useState('');
  const [laggPa, setLaggPa] = useState(false), [laggTyp, setLaggTyp] = useState<SchemaRegelTyp | null>(null);
  const [fran, setFran] = useState(''), [bortTyp, setBortTyp] = useState<SchemaRegelTyp | null>(null);
  const grid = useRef<HTMLTableElement | null>(null), fokus = useRef(false);
  const slag: VtSlag | null = flik === 'skola' ? null : flik;

  const rader = useMemo(() => slag ? vtRader(slag, villkor, forslag, kontroll) : [], [slag, villkor, forslag, kontroll]);
  const visade = useMemo(() => { const f = vtFiltrera(rader, sok, filter); return sort ? vtSortera(f, sort.kol, sort.dir) : f; }, [rader, sok, filter, sort]);
  const skola = useMemo(() => vtSkolaRader(villkor, kontroll), [villkor, kontroll]);
  const typer = useMemo(() => slag ? vtTyper(slag) : [], [slag]);
  const kolumner = useMemo((): Kol[] => slag ? [{ id: 'val', namn: 'Välj' }, { id: 'namn', namn: 'Namn' }, { id: 'pass', namn: slag === 'sal' ? 'Pass i salen' : 'Pass' },
    { id: 'veckotid', namn: 'Veckotid' }, { id: 'vem', namn: VT_VEM[slag] }, ...(slag === 'amne' ? [] : [{ id: 'aktiviteter' as const, namn: 'Aktiviteter' }]), ...typer.map(t => ({ id: t, namn: VT_TYP_NAMN[t], grund: vtGrund(t) })), { id: 'brott', namn: 'Pass på villkoret' }]
    : [{ id: 'namn', namn: 'Villkor' }, { id: 'vem', namn: 'Värde' }, { id: 'pass', namn: 'Slag' }, { id: 'brott', namn: 'Avvikelser' }], [slag, typer]);
  const antalRader = slag ? visade.length : skola.length;
  const mina = slag ? valda[slag] ?? [] : [], valdaRader = rader.filter(r => mina.includes(r.ref));
  const ord = slag ? FLIK_ORD[slag] : ['', ''], antal = (n: number) => `${n} ${n === 1 ? ord[0] : ord[1]}`;

  // Fokus följer den aktiva cellen när den flyttas med tangentbordet eller när en redigerare stängs.
  useEffect(() => {
    if (!fokus.current || redigera) return;
    fokus.current = false;
    const cell = grid.current?.querySelector<HTMLElement>(`[data-vt="${aktiv.r}:${aktiv.c}"]`);
    (cell?.querySelector<HTMLElement>('[data-vt-fokus]') ?? cell)?.focus();
  });
  // "Ändra" i veckan: fliken väljs, sök och filter släpps så att raden syns, och cellen öppnas när raderna för fliken finns (nästa rendering).
  const [sett, setSett] = useState<VillkorstabellMal | null>(null), [vantar, setVantar] = useState<VillkorstabellMal | null>(null), [rulla, setRulla] = useState(0);
  if (mal !== sett) {
    setSett(mal);
    if (mal) { setVantar(mal); setFlik(mal.flik); setSok(''); setFilter('alla'); setLaggPa(false); }
  }
  if (vantar && vantar.flik === flik && sok === '' && filter === 'alla') {
    setVantar(null);
    const r = vantar.falt ? skola.findIndex(x => x.falt === vantar.falt) : visade.findIndex(x => x.ref === vantar.ref);
    const c = vantar.falt ? 1 : Math.max(1, kolumner.findIndex(k => k.id === vantar.typ));
    if (r >= 0) {
      setAktiv({ r, c }); setRulla(n => n + 1);
      setRedigera(vantar.falt ? { falt: vantar.falt } : vantar.typ && vantar.ref ? { ref: vantar.ref, typ: vantar.typ } : null);
    }
  }
  // Bara när ett mål har öppnats rullas cellen fram, inte när den aktiva cellen flyttas.
  const rullat = useRef(0);
  useEffect(() => {
    if (rulla === rullat.current) return;
    rullat.current = rulla;
    grid.current?.querySelector(`[data-vt="${aktiv.r}:${aktiv.c}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [rulla, aktiv]);

  function andra(efter: SchemaRegel[], text: string, grund: boolean): boolean {
    if (JSON.stringify(efter) === JSON.stringify(villkor.egna)) { setStatus('Ingen ändring.'); return true; }
    if (vtForManga(efter)) { setStatus(`Det blir fler än ${SCHEMA_VILLKOR_LIMITS.egna} egna villkor. Ta bort några först.`); return false; }
    const fore = villkor.egna;
    setVillkor({ ...villkor, egna: efter }); dispatch(vtSteg(fore, efter, text));
    setStatus(`${text}. ${grund ? 'Ändringen kräver ett nytt förslag.' : 'Kontrollen prövar villkoren direkt.'} Ångra med Ångra senaste villkor.`);
    return true;
  }
  function stang() { setRedigera(null); fokus.current = true; }
  const valj = (refs: string[], on: boolean) => slag && setValda(v => ({ ...v, [slag]: on ? [...new Set([...(v[slag] ?? []), ...refs])] : (v[slag] ?? []).filter(x => !refs.includes(x)) }));

  function onKeyDown(e: ReactKeyboardEvent<HTMLTableElement>) {
    // Händelser från redigeraren (i en portal) bubblar hit i React-trädet; de hör inte till rutnätet.
    if (!e.currentTarget.contains(e.target as Node) || redigera || e.altKey || e.metaKey) return;
    const sista = kolumner.length - 1, flytta = (r: number, c: number) => { e.preventDefault(); fokus.current = true; setAktiv({ r: Math.min(antalRader - 1, Math.max(-1, r)), c: Math.min(sista, Math.max(0, c)) }); };
    const { r, c } = aktiv;
    if (e.key === 'ArrowRight') return flytta(r, c + 1);
    if (e.key === 'ArrowLeft') return flytta(r, c - 1);
    if (e.key === 'Home') return flytta(e.ctrlKey ? 0 : r, 0);
    if (e.key === 'End') return flytta(e.ctrlKey ? antalRader - 1 : r, sista);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const to = r + (e.key === 'ArrowDown' ? 1 : -1);
      // Skift+pil markerar raderna man går över.
      if (e.shiftKey && slag && to >= 0 && to < visade.length) valj([visade[Math.max(0, r)].ref, visade[to].ref], true);
      return flytta(to, c);
    }
    // Mellanslag på en rad väljer den (kryssrutan och knappar sköter sitt eget Mellanslag).
    if (e.key === ' ' && slag && r >= 0 && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement)) {
      e.preventDefault(); valj([visade[r].ref], !mina.includes(visade[r].ref)); return;
    }
    if ((e.key === 'Enter' || e.key === 'F2') && r >= 0) {
      const k = kolumner[c];
      if (slag && typer.includes(k.id as SchemaRegelTyp)) { e.preventDefault(); setRedigera({ ref: visade[r].ref, typ: k.id as SchemaRegelTyp }); }
      else if (!slag && c === 1) { e.preventDefault(); setRedigera({ falt: skola[r].falt }); }
    }
  }

  const cellProps = (r: number, c: number) => ({ 'data-vt': `${r}:${c}`, onClick: () => setAktiv({ r, c }),
    tabIndex: aktiv.r === r && aktiv.c === c ? 0 : -1 });
  /** Fokus i en cell med en kontroll (kryssruta, sorteringsknapp, länk) står på kontrollen. */
  const kontrollFokus = (r: number, c: number) => ({ 'data-vt-fokus': true, tabIndex: aktiv.r === r && aktiv.c === c ? 0 : -1 });

  const sortera = (kol: VtKolumn) => setSort(s => s?.kol === kol ? (s.dir === 'asc' ? { kol, dir: 'desc' } : null) : { kol, dir: 'asc' });
  const rubrik = (k: Kol, c: number) => {
    const sorted = sort?.kol === k.id ? sort.dir : null;
    if (k.id === 'val') return <TableHead key={k.id} scope="col" className="vt-val" data-vt={`-1:${c}`} onClick={() => setAktiv({ r: -1, c })}>
      <input type="checkbox" aria-label={`Välj alla ${ord[1]} som visas`} {...kontrollFokus(-1, c)} disabled={!visade.length}
        checked={visade.length > 0 && visade.every(r => mina.includes(r.ref))} onChange={e => valj(visade.map(r => r.ref), e.target.checked)}/></TableHead>;
    return <TableHead key={k.id} scope="col" aria-sort={slag ? sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none' : undefined}
      className={k.id === 'namn' ? 'vt-namn' : undefined} {...cellProps(-1, c)} {...(slag ? { tabIndex: undefined } : {})}>
      {slag ? <button type="button" className="vt-sortera" {...kontrollFokus(-1, c)} onClick={() => sortera(k.id as VtKolumn)}>
        {k.namn}{sorted === 'asc' ? <ArrowUpIcon aria-hidden="true"/> : sorted === 'desc' ? <ArrowDownIcon aria-hidden="true"/> : null}</button> : k.namn}
      {k.grund && <span className="vt-grund">kräver nytt förslag</span>}
    </TableHead>;
  };

  const brottCell = (n: number, r: number, c: number, text: string) => n > 0
    ? <Button type="button" variant="link" size="sm" className="vt-lank" {...kontrollFokus(r, c)} aria-label={`${text}. Visa Regelavvikelser`} onClick={visaAvvikelser}>{n}</Button>
    : <span className="schema-note">{kontroll ? '0' : '–'}</span>;

  const editor = (r: VtRad, typ: SchemaRegelTyp) => {
    const rules = (r.celler[typ]?.index ?? []).map(i => villkor.egna[i]);
    return <VillkorRedigerare typ={typ} rules={rules} villkor={villkor} rubrik={`${VT_TYP_NAMN[typ]} för ${r.namn}`} onAvbryt={stang}
      onSpara={mallar => { if (andra(vtErsattCell(villkor.egna, r.slag, r.ref, typ, mallar), `${VT_TYP_NAMN[typ]} · ${r.namn}`, vtGrund(typ))) stang(); }}/>;
  };
  const redigeras = (ref: string, typ: SchemaRegelTyp) => redigera !== null && 'ref' in redigera && redigera.ref === ref && redigera.typ === typ;

  return <section className="villkorstabell schema-wide" aria-labelledby={`${id}-rubrik`}>
    <div className="vt-huvud">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id={`${id}-rubrik`}>Villkor i tabell</h2><OppnaFonster onOpen={onOpen} label="Villkor i tabell"/></div>
      <p className="schema-note">Samma egna villkor som i Villkor för schemat och i veckan. Välj en cell och tryck Enter, eller dubbelklicka, för att ändra. Ändringar kan ångras med Ångra senaste villkor och prövas direkt mot schemat.</p>
    </div>
    <Tabs value={flik} onValueChange={v => { setFlik(v as VtFlik); setAktiv({ r: 0, c: 1 }); setRedigera(null); setLaggPa(false); setSort(null); }}>
      <TabsList className="vt-flikar" aria-label="Resurstyp">{VT_FLIKAR.map(x => <TabsTrigger key={x.id} value={x.id}>{x.namn}</TabsTrigger>)}</TabsList>
      <TabsContent value={flik} className="vt-flik">

    {slag && <div className="vt-verktyg">
      <label>Sök på namn<input type="search" value={sok} onChange={e => setSok(e.target.value)}/></label>
      <label>Visa<select value={filter} onChange={e => setFilter(e.target.value as VtFilter)}>{(Object.keys(VT_FILTER) as VtFilter[]).map(x => <option key={x} value={x}>{VT_FILTER[x]}</option>)}</select></label>
      <p className="schema-note" aria-live="polite">Visar {visade.length} av {antal(rader.length)}{mina.length ? ` · ${mina.length} valda` : ''}.</p>
    </div>}
    {slag && mina.length > 0 && <fieldset className="vt-valda"><legend className="sr-only">Ändra {antal(mina.length)} på en gång</legend>
      <Popover open={laggPa} onOpenChange={setLaggPa}>
        <PopoverTrigger render={<Button type="button" disabled={disabled}/>}>Lägg villkor på valda…</PopoverTrigger>
        <PopoverContent side="bottom" align="start" className="vt-redigera">
          <label className="vt-falt">Villkor<select value={laggTyp && typer.includes(laggTyp) ? laggTyp : typer[0]} onChange={e => setLaggTyp(e.target.value as SchemaRegelTyp)}>
            {typer.map(t => <option key={t} value={t}>{VT_TYP_NAMN[t]}</option>)}</select></label>
          {(() => {
            const typ = laggTyp && typer.includes(laggTyp) ? laggTyp : typer[0];
            return <VillkorRedigerare key={typ} typ={typ} rules={[]} villkor={villkor} rubrik={`${VT_TYP_NAMN[typ]} för ${antal(mina.length)}`} ny onAvbryt={() => setLaggPa(false)}
              onSpara={mallar => { if (andra(vtLaggPaValda(villkor.egna, slag, mina, mallar), `${VT_TYP_NAMN[typ]} på ${antal(mina.length)}: ${valdaRader.map(r => r.namn).join(', ')}`, vtGrund(typ))) setLaggPa(false); }}/>;
          })()}
        </PopoverContent>
      </Popover>
      <span className="vt-par">
        <label>Kopiera villkoren från<select value={fran} onChange={e => setFran(e.target.value)}><option value="">Välj …</option>{rader.map(r => <option key={r.ref} value={r.ref}>{r.namn}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={disabled || !fran} onClick={() => {
          const kalla = rader.find(r => r.ref === fran);
          if (kalla && andra(vtKopiera(villkor.egna, slag, fran, mina), `Villkoren från ${kalla.namn} kopierade till ${antal(mina.filter(x => x !== fran).length)}`, Object.keys(kalla.celler).some(t => vtGrund(t as SchemaRegelTyp)))) setFran('');
        }}>Kopiera till valda</Button>
      </span>
      <span className="vt-par">
        <label>Villkor att ta bort<select value={bortTyp ?? typer[0]} onChange={e => setBortTyp(e.target.value as SchemaRegelTyp)}>{typer.map(t => <option key={t} value={t}>{VT_TYP_NAMN[t]}</option>)}</select></label>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => { const typ = bortTyp && typer.includes(bortTyp) ? bortTyp : typer[0];
          andra(vtTaBortTyp(villkor.egna, slag, mina, typ), `${VT_TYP_NAMN[typ]} borttagen för ${antal(mina.length)}`, vtGrund(typ)); }}>
          Ta bort {VT_TYP_NAMN[bortTyp && typer.includes(bortTyp) ? bortTyp : typer[0]].toLocaleLowerCase('sv-SE')} för valda</Button>
      </span>
      <Button type="button" variant="outline" onClick={() => valj(mina, false)}>Avmarkera alla</Button>
    </fieldset>}
    <output aria-live="polite" className="schema-note">{status}</output>

    {slag && !forslag && slag !== 'sal' ? <p className="empty-state">Ta fram ett första förslag för att se {ord[1]} och deras villkor.</p>
      : slag && rader.length === 0 ? <p className="empty-state">{slag === 'sal' ? 'Inga salar än. Lägg till salar i Villkor för schemat.' : `Underlaget har inga ${ord[1]}.`}</p>
      : <div className="vt-ram">
        <Table ref={grid} role="grid" aria-labelledby={`${id}-rubrik`} aria-rowcount={antalRader + 1} aria-colcount={kolumner.length} onKeyDown={onKeyDown}
          aria-describedby={`${id}-hjalp`} className="vt-tabell" data-vt-scope={slag ?? 'skola'}>
          <TableHeader><TableRow>{kolumner.map(rubrik)}</TableRow></TableHeader>
          <TableBody>
            {slag ? visade.map((rad, r) => <TableRow key={rad.ref} aria-selected={mina.includes(rad.ref)} data-state={mina.includes(rad.ref) ? 'selected' : undefined}>
              {kolumner.map((k, c) => {
                if (k.id === 'val') return <TableCell key={k.id} className="vt-val" data-vt={`${r}:${c}`} onClick={() => setAktiv({ r, c })}>
                  <input type="checkbox" aria-label={`Välj ${rad.namn}`} {...kontrollFokus(r, c)} checked={mina.includes(rad.ref)} onChange={e => valj([rad.ref], e.target.checked)}/></TableCell>;
                if (k.id === 'namn') return <TableHead key={k.id} scope="row" className="vt-namn" {...cellProps(r, c)}>{rad.namn}</TableHead>;
                if (k.id === 'pass') return <TableCell key={k.id} {...cellProps(r, c)}>{rad.pass}</TableCell>;
                if (k.id === 'veckotid') return <TableCell key={k.id} className="vt-tid" {...cellProps(r, c)}>{rad.veckotid}</TableCell>;
                if (k.id === 'vem') return <TableCell key={k.id} className="vt-vem" {...cellProps(r, c)}>{rad.vem}</TableCell>;
                if (k.id === 'aktiviteter') return <TableCell key={k.id} {...cellProps(r, c)} aria-readonly="true">{rad.aktiviteter || '–'}</TableCell>;
                if (k.id === 'brott') return <TableCell key={k.id} data-vt={`${r}:${c}`} onClick={() => setAktiv({ r, c })} tabIndex={rad.brott > 0 ? undefined : aktiv.r === r && aktiv.c === c ? 0 : -1}>
                  {brottCell(rad.brott, r, c, `${rad.brott} pass bryter mot villkoren för ${rad.namn}`)}</TableCell>;
                const typ = k.id as SchemaRegelTyp, cell = rad.celler[typ], oppen = redigeras(rad.ref, typ);
                return <TableCell key={k.id} className={`vt-villkor${cell ? ' har' : ''}`} {...cellProps(r, c)}
                  onDoubleClick={() => { if (!disabled) { setAktiv({ r, c }); setRedigera({ ref: rad.ref, typ }); } }}>
                  {cell ? <span>{cell.text}{cell.index.length > 1 && <span className="schema-note"> ({cell.index.length})</span>}</span> : <span className="sr-only">Inget villkor</span>}
                  {cell && rad.utanTraff && <span className="status-badge warning vt-badge">Träffar inget</span>}
                  {oppen && <Anker onClose={stang} label={`${VT_TYP_NAMN[typ]} för ${rad.namn}`}>{editor(rad, typ)}</Anker>}
                </TableCell>;
              })}
            </TableRow>)
            : skola.map((x, r) => <TableRow key={x.falt}>
              <TableHead scope="row" className="vt-namn" {...cellProps(r, 0)}>{x.namn}</TableHead>
              <TableCell className="vt-villkor har" {...cellProps(r, 1)} onDoubleClick={() => { if (!disabled) { setAktiv({ r, c: 1 }); setRedigera({ falt: x.falt }); } }}>
                {x.text}
                {redigera && 'falt' in redigera && redigera.falt === x.falt && <Anker onClose={stang} label={x.namn}>
                  <SkolaRedigerare falt={x.falt} villkor={villkor} onAvbryt={stang} onSpara={patch => {
                    // Hela skolans fält är villkoren för schemat, inte egna villkor: de ändras som i formuläret, utan eget ångra-steg.
                    setVillkor({ ...villkor, ...patch });
                    setStatus(`${x.namn} ändrad. ${x.grund ? 'Ändringen kräver ett nytt förslag.' : 'Kontrollen prövar villkoren direkt.'}`); stang();
                  }}/></Anker>}
              </TableCell>
              <TableCell {...cellProps(r, 2)}>{x.grund ? <span className="vt-grund">Grund · kräver nytt förslag</span> : 'Tidsvillkor'}</TableCell>
              <TableCell data-vt={`${r}:3`} onClick={() => setAktiv({ r, c: 3 })} tabIndex={x.avvikelser > 0 ? undefined : aktiv.r === r && aktiv.c === 3 ? 0 : -1}>
                {brottCell(x.avvikelser, r, 3, `${x.avvikelser} avvikelser mot ${x.namn.toLocaleLowerCase('sv-SE')}`)}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>}
      </TabsContent>
    </Tabs>
    <p id={`${id}-hjalp`} className="schema-note vt-hjalp">Med tangentbord: piltangenterna flyttar mellan cellerna, Enter ändrar cellen, Esc avbryter. {slag ? 'Mellanslag väljer en rad, Skift+pil upp eller ned väljer flera.' : ''} Hela skolans villkor ändras som i formuläret och har inget eget ångra-steg.</p>
  </section>;
}

/** Redigeraren som popover vid cellen. Cellen står kvar i tabellen; ankaret är ett osynligt element i den. Esc och klick utanför stänger. */
function Anker({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  return <Popover open onOpenChange={open => { if (!open) onClose(); }}>
    <PopoverTrigger nativeButton={false} render={<span className="vt-anker" aria-hidden="true"/>}/>
    <PopoverContent side="bottom" align="start" className="vt-redigera" finalFocus={false} aria-label={label}>{children}</PopoverContent>
  </Popover>;
}

const minuter = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Redigerare för en villkorstyp, med samma fält och gränser som formuläret. Ger cellens nya villkor (tom lista: inget villkor). */
function VillkorRedigerare({ typ, rules, villkor, rubrik, ny = false, onSpara, onAvbryt }: { typ: SchemaRegelTyp; rules: SchemaRegel[]; villkor: SchemaVillkor; rubrik: string; ny?: boolean;
  onSpara: (mallar: VtMall[]) => void; onAvbryt: () => void }) {
  const L = SCHEMA_VILLKOR_LIMITS, g = useMemo(() => vtRutnat(villkor), [villkor]);
  const [rutor, setRutor] = useState(() => vtMarkerade(rules, g)), [rord, setRord] = useState(false);
  const forsta = rules[0];
  const [varde, setVarde] = useState<number | null>(forsta && (forsta.typ === 'langd' || forsta.typ === 'dag') ? forsta.maxMin : forsta?.typ === 'antal' ? forsta.count : ny ? (typ === 'langd' ? 60 : typ === 'antal' ? 2 : 360) : null);
  const [salar, setSalar] = useState<string[]>(forsta?.typ === 'sal' ? forsta.rooms : []);
  const marg = forsta?.typ === 'marginal' ? forsta : null;
  const [m, setM] = useState({ beforeMin: marg?.beforeMin ?? 0, afterMin: marg?.afterMin ?? 10, occupies: marg?.occupies ?? ['elever'] as SchemaMarginalDel[], label: marg?.label ?? 'Övergång' });
  const tid = typ === 'sparrad' || typ === 'tillaten';
  const mallar = (): VtMall[] | null => {
    if (tid) return rord || ny ? vtTillRegler(rutor, g, typ) : rules.map(({ slag: _s, ref: _r, ...x }) => x as VtMall);
    if (typ === 'langd' || typ === 'dag') return varde === null ? [] : [{ typ, maxMin: varde }];
    if (typ === 'antal') return varde === null ? [] : [{ typ, count: varde }];
    if (typ === 'sal') return salar.length ? [{ typ, rooms: villkor.salar.filter(x => salar.includes(x)) }] : [];
    // Ingen tid före eller efter betyder att den redigerade marginalen tas bort.
    // Övriga marginaler i samma cell står kvar, precis som vid en vanlig ändring.
    if (m.beforeMin + m.afterMin === 0) return rules.slice(1).map(({ slag: _s, ref: _r, ...x }) => x as VtMall);
    if (!m.occupies.length) return null;
    // Marginal: den första ändras; fler marginaler för resursen står kvar och ändras i Marginaler.
    const egen: VtMall = { typ: 'marginal', beforeMin: m.beforeMin, afterMin: m.afterMin, occupies: SCHEMA_MARGINAL_DELAR.filter(d => m.occupies.includes(d)), label: m.label,
      visibleFor: marg?.visibleFor ?? ['elever'], when: 'alltid' };
    return [egen, ...rules.slice(1).map(({ slag: _s, ref: _r, ...x }) => x as VtMall)];
  };
  const resultat = mallar(), tom = resultat !== null && resultat.length === 0;
  const spara = () => { if (resultat && !(ny && tom)) onSpara(resultat); };
  /** Enter i ett val sparar, som i ett formulär. */
  const enter = (e: ReactKeyboardEvent<HTMLSelectElement>) => { if (e.key === 'Enter') { e.preventDefault(); spara(); } };
  const val = (label: string, options: number[], text: (n: number) => string, none: string) => <label className="vt-falt">{label}
    <select value={varde ?? ''} onKeyDown={enter} onChange={e => setVarde(e.target.value === '' ? null : Number(e.target.value))}>
      {!ny && <option value="">{none}</option>}{options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  return <form className="vt-redigerare" onSubmit={e => { e.preventDefault(); spara(); }}>
    <PopoverHeader><PopoverTitle>{rubrik}</PopoverTitle>
      {vtGrund(typ) && <PopoverDescription className="vt-grund">{GRUND_TEXT}</PopoverDescription>}</PopoverHeader>
    {tid && <>
      <p className="schema-note">{typ === 'sparrad' ? 'Markera tiden då inga pass får ligga.' : 'Markera tiden då pass får ligga; omarkerad tid är utanför tillåten tid.'} Dra över rutorna, eller använd piltangenterna: Mellanslag markerar en ruta och Skift+pil markerar vidare. Rutorna följer startrutnätet ({villkor.startGridMin} min).</p>
      <Tidsrutnat rutnat={g} typ={typ} value={rutor} label={`${rubrik}, ${DAYS[0].toLowerCase()}–${DAYS[4].toLowerCase()}`} onEnter={spara} onChange={next => { setRutor(next); setRord(true); }}/>
    </>}
    {(typ === 'langd') && val('Längsta pass', minuter(L.maxLesson[0], L.maxLesson[1], 5), n => `${n} min`, 'Inget villkor')}
    {typ === 'antal' && val('Pass per vecka', minuter(L.antal[0], L.antal[1], 1), String, 'Inget villkor')}
    {typ === 'dag' && <>{val('Högst undervisning per dag', steps(L.perDay[0], L.perDay[1], 30, varde), hoursText, 'Ingen egen gräns')}
      <p className="schema-note">{villkor.teacherMaxMinPerDay === null ? 'Skolan har ingen gräns för lärare.' : `Skolans gräns för lärare är ${hoursText(villkor.teacherMaxMinPerDay)}; den lägsta gäller.`}</p></>}
    {typ === 'sal' && (villkor.salar.length === 0 ? <p className="schema-note">Lägg till salar i Villkor för schemat först.</p>
      : <fieldset className="vt-falt"><legend>Får bara ligga i</legend>{villkor.salar.map(x => <label key={x} className="schema-check">
        <input type="checkbox" checked={salar.includes(x)} onChange={e => setSalar(e.target.checked ? [...salar, x] : salar.filter(y => y !== x))}/>{x}</label>)}</fieldset>)}
    {typ === 'marginal' && <div className="vt-marginal">
      <label className="vt-falt">Före passet<select value={m.beforeMin} onKeyDown={enter} onChange={e => setM({ ...m, beforeMin: Number(e.target.value) })}>{minuter(0, L.marginal[1], 5).map(n => <option key={n} value={n}>{n ? `${n} min` : 'Ingen'}</option>)}</select></label>
      <label className="vt-falt">Efter passet<select value={m.afterMin} onKeyDown={enter} onChange={e => setM({ ...m, afterMin: Number(e.target.value) })}>{minuter(0, L.marginal[1], 5).map(n => <option key={n} value={n}>{n ? `${n} min` : 'Ingen'}</option>)}</select></label>
      <label className="vt-falt">Etikett<select value={m.label} onKeyDown={enter} onChange={e => setM({ ...m, label: e.target.value })}>{[...new Set([...SCHEMA_MARGINAL_ETIKETTER, m.label])].map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <fieldset className="vt-falt"><legend>Upptar</legend>{SCHEMA_MARGINAL_DELAR.map(d => <label key={d} className="schema-check"><input type="checkbox" checked={m.occupies.includes(d)}
        onChange={e => setM({ ...m, occupies: e.target.checked ? [...m.occupies, d] : m.occupies.filter(x => x !== d) })}/>{MARGINAL_DEL_NAMN[d]}</label>)}</fieldset>
      {rules.length > 1 && <p className="schema-note">Raden har {rules.length} marginaler. Här ändras den första; övriga ändras i Marginaler.</p>}
    </div>}
    {resultat === null && <p className="schema-note" role="alert">Välj minst en part under Upptar: eleverna, läraren eller salen.</p>}
    {typ === 'marginal' && m.beforeMin + m.afterMin === 0 && rules.length > 0 && <p className="schema-note">Ingen tid före eller efter. Spara tar bort den här marginalen{rules.length > 1 ? '; övriga marginaler i cellen står kvar' : ''}.</p>}
    <div className="vt-knappar">
      <Button type="submit" disabled={resultat === null || ny && tom}>{ny ? 'Lägg på valda' : 'Spara'}</Button>
      {!ny && rules.length > 0 && <Button type="button" variant="outline" onClick={() => onSpara([])}>{rules.length > 1 ? 'Ta bort villkoren i cellen' : 'Ta bort villkoret'}</Button>}
      {tid && <Button type="button" variant="outline" onClick={() => { setRutor(vtMarkerade([], g)); setRord(true); }}>Rensa</Button>}
      <Button type="button" variant="outline" onClick={onAvbryt}>Avbryt</Button>
    </div>
  </form>;
}

/** Redigerare för ett fält för hela skolan, med formulärets gränser. */
function SkolaRedigerare({ falt, villkor: v, onSpara, onAvbryt }: { falt: VtSkolaFalt; villkor: SchemaVillkor; onSpara: (patch: Partial<SchemaVillkor>) => void; onAvbryt: () => void }) {
  const L = SCHEMA_VILLKOR_LIMITS, [x, setX] = useState<SchemaVillkor>(v), namn = VT_SKOLA.find(s => s.falt === falt)!;
  const time = (label: string, minutes: number, change: (n: number) => void) => <label className="vt-falt">{label}
    <input type="time" step={300} value={clock(minutes)} onChange={e => { const n = minutesOf(e.target.value); if (n !== null) change(n); }}/></label>;
  const select = (label: string, value: number | null, options: number[], text: (n: number) => string, change: (n: number | null) => void, none?: string) => <label className="vt-falt">{label}
    <select value={value ?? ''} onChange={e => change(e.target.value === '' ? null : Number(e.target.value))}>{none !== undefined && <option value="">{none}</option>}
      {options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  const min = (n: number) => `${n} min`, lunch = x.lunch ?? { startMin: 630, endMin: 810, lengthMin: 40, teachers: true };
  return <div className="vt-redigerare">
    <PopoverHeader><PopoverTitle>{namn.namn} för hela skolan</PopoverTitle>{namn.grund && <PopoverDescription className="vt-grund">{GRUND_TEXT}</PopoverDescription>}</PopoverHeader>
    {falt === 'days' && <div className="vt-dagar">{x.days.map((d, i) => <fieldset key={i} className="vt-falt"><legend>{DAYS[i]}</legend>
      {time('Börjar', d.startMin, startMin => setX({ ...x, days: x.days.map((y, at) => at === i ? { ...y, startMin } : y) }))}
      {time('Slutar', d.endMin, endMin => setX({ ...x, days: x.days.map((y, at) => at === i ? { ...y, endMin } : y) }))}</fieldset>)}</div>}
    {falt === 'breakMin' && select('Rast mellan pass', x.breakMin, steps(L.breakMin[0], L.breakMin[1], 5, x.breakMin), min, n => setX({ ...x, breakMin: n ?? x.breakMin }))}
    {falt === 'startGridMin' && select('Pass får börja', x.startGridMin, [...L.startGrid], n => `var ${n}:e minut`, n => setX({ ...x, startGridMin: n ?? x.startGridMin }))}
    {falt === 'maxLessonMin' && select('Längsta pass', x.maxLessonMin, steps(L.maxLesson[0], L.maxLesson[1], 5, x.maxLessonMin), min, n => setX({ ...x, maxLessonMin: n ?? x.maxLessonMin }))}
    {falt === 'minLessonMin' && select('Kortaste pass', x.minLessonMin, steps(L.minLesson, Math.max(L.minLesson, Math.floor(x.maxLessonMin / 10) * 5), 5, x.minLessonMin), min, n => setX({ ...x, minLessonMin: n ?? x.minLessonMin }))}
    {falt === 'studentMaxMinPerDay' && select('Högst undervisning per dag, elever', x.studentMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, x.studentMaxMinPerDay), hoursText, n => setX({ ...x, studentMaxMinPerDay: n }), 'Ingen gräns')}
    {falt === 'teacherMaxMinPerDay' && select('Högst undervisning per dag, lärare', x.teacherMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, x.teacherMaxMinPerDay), hoursText, n => setX({ ...x, teacherMaxMinPerDay: n }), 'Ingen gräns')}
    {falt === 'sameDay' && <label className="vt-falt">Samma ämne flera gånger samma dag<select value={x.sameDay} onChange={e => setX({ ...x, sameDay: e.target.value as SchemaVillkor['sameDay'] })}>
      {(['avoid', 'forbid', 'allow'] as const).map(s => <option key={s} value={s}>{SAME_DAY[s]}</option>)}</select></label>}
    {falt === 'lunch' && <>
      <label className="schema-check"><input type="checkbox" checked={x.lunch !== null} onChange={e => setX({ ...x, lunch: e.target.checked ? lunch : null })}/>Lägg in lunch varje dag</label>
      {x.lunch && <>{time('Lunch tidigast', lunch.startMin, startMin => setX({ ...x, lunch: { ...lunch, startMin } }))}{time('Lunch slut senast', lunch.endMin, endMin => setX({ ...x, lunch: { ...lunch, endMin } }))}
        {select('Lunchens längd', lunch.lengthMin, steps(L.lunchLength[0], L.lunchLength[1], 5, lunch.lengthMin), min, n => setX({ ...x, lunch: { ...lunch, lengthMin: n ?? lunch.lengthMin } }))}
        <label className="schema-check"><input type="checkbox" checked={lunch.teachers} onChange={e => setX({ ...x, lunch: { ...lunch, teachers: e.target.checked } })}/>Lärare ska också få lunch</label></>}</>}
    {falt === 'lateAfterMin' && <>
      <label className="schema-check"><input type="checkbox" checked={x.lateAfterMin !== null} onChange={e => setX({ ...x, lateAfterMin: e.target.checked ? 930 : null })}/>Undvik sena pass</label>
      {x.lateAfterMin !== null && time('Sent räknas efter', x.lateAfterMin, lateAfterMin => setX({ ...x, lateAfterMin }))}</>}
    <div className="vt-knappar">
      <Button type="button" onClick={() => onSpara({ [falt]: x[falt] } as Partial<SchemaVillkor>)}>Spara</Button>
      <Button type="button" variant="outline" onClick={onAvbryt}>Avbryt</Button>
    </div>
  </div>;
}
