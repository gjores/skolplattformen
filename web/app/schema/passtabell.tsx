'use client';
// Alla pass i en tabell (05.2-SM-PASSTABELL, research Q128–Q132). En rad per pass i utkastet, också passen på viloytan, med filter, sökning,
// sortering och gruppering per undervisning. Raderna har samma meny som passen i veckan (PassMenypunkter i meny.tsx) och går genom samma flytt,
// kontroll och ångra. Tabellen är ett rutnät med ett tabbstopp: piltangenter mellan celler, Enter ger Flytta…, F Följ passet, P viloytan, Esc avbryter.
// Ingen redigering i cellen och inget sparas. Rader ritas i omgångar, så att 600 pass eller fler visas utan märkbar fördröjning.
import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaForslagLesson, SchemaRegel, SchemaTerm, SchemaViolation } from '@/lib/schema-contract.ts';
import { PASS_FILTER, PASS_KOLUMNER, PASS_STATUS, dagText, filterVal, filtreraPass, grupperaPass, marginalText, passRader, radNamn, sorteraPass, terminText, tidText, veckorText,
  type PassFilter, type PassGrupp, type PassKolumn, type PassRad, type PassSortering } from '@/lib/schema-passtabell.ts';
import { hoursText } from './delat.ts';
import type { SchemaVeckaVal } from '@/lib/schema-vecka.ts';
import { PassMenypunkter, oppnaMenyVid, passMenyHandelser, type PassAtgarder } from './meny.tsx';

/** Tabellens val. Hålls i arbetsytan, så att filter och sortering står kvar när man byter till veckan och tillbaka. */
export type PassTabellVal = { filter: PassFilter[]; sok: string; sortering: PassSortering; gruppera: boolean };
export const tomtTabellVal = (): PassTabellVal => ({ filter: [], sok: '', sortering: { kolumn: 'dag', stigande: true }, gruppera: false });

/** Rader som ritas först, och hur många som läggs till per bildruta tills alla finns. */
const FORSTA = 150, OMGANG = 300;
const SISTA_KOLUMN = PASS_KOLUMNER.length;
const TON: Record<PassRad['status'], string> = { last: 'info', lagd: 'success', viloyta: '', avvikelse: 'warning' };
const lista = (x: { namn: string }[]) => x.map(y => y.namn).join(', ');
/** Var fokus är i rutnätet: en rad (passets id) eller rubrikraden, och kolumnen (0 är valrutan). */
type Aktiv = { id: string; col: number };
const RUBRIK = '', FORSTA_RADEN = '#';

type Props = {
  /** Förslaget med utkastets placeringar. */
  forslag: SchemaForslag;
  /** Kontrollens svar för villkoren som prövas, och de egna villkor som prövas; null när ingen kontroll har körts. */
  violations: SchemaViolation[] | null; egna: SchemaRegel[];
  /** Terminen veckan visar: ett pass som går hela läsåret visas med sin längd den terminen. */
  term: SchemaTerm;
  visning?: SchemaVeckaVal;
  picked: string | null; checking: boolean;
  val: PassTabellVal; onVal: (next: PassTabellVal) => void;
  /** Passmenyns åtgärder för ett pass (samma som i veckan), med Visa i veckan. */
  atgarder: (l: SchemaForslagLesson) => PassAtgarder;
  /** Menyns rubrik för ett pass, som i veckan. */
  rubrik: (l: SchemaForslagLesson) => string;
  /** Lägger flera pass på viloytan i ett ångra-steg. */
  onParkera: (ids: string[]) => void;
  onLas?: (ids: string[], locked: boolean) => void;
  /** Esc utan valda rader: avbryter flytten av markerat pass. */
  onAvbryt: () => void;
  /** Tabellens ram, så att arbetsytan kan lägga fokus på ett pass efter en flytt. */
  tabellRef: RefObject<HTMLDivElement | null>;
};

export function Passtabell({ forslag, violations, egna, term, visning, picked, checking, val, onVal, atgarder, rubrik, onParkera, onLas, onAvbryt, tabellRef }: Props) {
  const id = useId();
  const rader = useMemo(() => passRader(forslag, term, violations, egna, visning), [forslag, term, violations, egna, visning]);
  const val_ = useMemo(() => filterVal(rader), [rader]);
  const synliga = useMemo(() => sorteraPass(filtreraPass(rader, val.filter, val.sok), val.sortering), [rader, val.filter, val.sok, val.sortering]);
  const grupper = useMemo(() => val.gruppera ? grupperaPass(synliga, forslag.teachings) : null, [val.gruppera, synliga, forslag.teachings]);
  // I grupperad visning står raderna i gruppernas ordning; tangentbordet följer ordningen som syns.
  const ordning = useMemo(() => grupper ? grupper.flatMap(g => g.rader) : synliga, [grupper, synliga]);
  const lessons = useMemo(() => new Map(forslag.lessons.map(l => [l.id, l])), [forslag.lessons]);

  const [valda, setValda] = useState<Set<string>>(() => new Set()), senastVald = useRef<string | null>(null);
  const synligaValda = useMemo(() => ordning.filter(r => valda.has(r.id)), [ordning, valda]);
  const [aktiv, setAktiv] = useState<Aktiv>(() => ({ id: picked ?? FORSTA_RADEN, col: 1 }));
  const [antal, setAntal] = useState(FORSTA);
  const vantar = useRef<{ index: number; col: number } | null>(null), rot = tabellRef;
  const [mal, setMal] = useState<string | null>(null), [open, setOpen] = useState(false), tangentbord = useRef(false), menyFokus = useRef(false);

  // En ny sortering, ett filter, en sökning eller gruppering ritar om i omgångar från början, så att resultatet syns direkt: att lägga om 1 000 rader
  // på en gång tar märkbar tid i webbläsarens layout (mått i SUMMARY). Raden med fokus och markerat pass ritas alltid med.
  const ordningsVal = `${JSON.stringify(val.filter)}|${val.sok}|${val.sortering.kolumn}|${val.sortering.stigande}|${val.gruppera}`;
  const [ritatFor, setRitatFor] = useState(ordningsVal), forstaVal = useRef(ordningsVal);
  if (ritatFor !== ordningsVal) {
    setRitatFor(ordningsVal);
    const behov = Math.max(ordning.findIndex(r => r.id === aktiv.id), picked ? ordning.findIndex(r => r.id === picked) : -1) + 1;
    setAntal(Math.min(ordning.length, Math.max(FORSTA, behov + 20)));
  }
  useEffect(() => {
    if (forstaVal.current === ordningsVal) return;
    forstaVal.current = ordningsVal;
    const ram = rot.current?.querySelector('[data-slot="table-container"]');
    if (ram) ram.scrollTop = 0;
  }, [ordningsVal, rot]);
  // Rader i omgångar: första omgången direkt, resten en bildruta i taget.
  useEffect(() => {
    if (antal >= ordning.length) return;
    const frame = requestAnimationFrame(() => setAntal(a => Math.min(ordning.length, a + OMGANG)));
    return () => cancelAnimationFrame(frame);
  }, [antal, ordning.length]);
  // Fokus som väntar på att raden ska ritas (Ctrl+End, PageDown förbi första omgången).
  useEffect(() => {
    const v = vantar.current;
    if (!v || !rot.current) return;
    const id = v.index < 0 ? null : ordning[v.index]?.id, el = rot.current.querySelector<HTMLElement>(id ? `tr[data-passrad="${id}"] [data-col="${v.col}"]` : `thead [data-col="${v.col}"]`);
    if (el) { vantar.current = null; el.focus(); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  });
  // Markerat pass syns när tabellen öppnas.
  useEffect(() => {
    if (picked) rot.current?.querySelector(`tr[data-lesson="${picked}"]`)?.scrollIntoView({ block: 'center' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const aktivIndex = aktiv.id === RUBRIK ? -1 : Math.max(0, ordning.findIndex(r => r.id === aktiv.id));
  const rubrikAktiv = aktiv.id === RUBRIK ? aktiv.col : null;

  function fokusera(index: number, col: number) {
    const i = Math.max(-1, Math.min(ordning.length - 1, index)), c = Math.max(0, Math.min(SISTA_KOLUMN, col));
    setAktiv({ id: i < 0 ? RUBRIK : ordning[i].id, col: c });
    if (i >= antal) setAntal(Math.min(ordning.length, i + OMGANG));
    vantar.current = { index: i, col: c };
  }
  // Ordningen som syns, för val med Skift. Hålls i en ref så att radernas återanrop är detsamma och raderna inte ritas om vid sortering.
  const synligOrdning = useRef(ordning);
  useEffect(() => { synligOrdning.current = ordning; }, [ordning]);
  const valj = useCallback((rid: string, utoka: boolean) => setValda(prev => {
    const next = new Set(prev), from = senastVald.current, on = !prev.has(rid), o = synligOrdning.current;
    if (utoka && from !== null) {
      const a = o.findIndex(r => r.id === from), b = o.findIndex(r => r.id === rid);
      if (a >= 0 && b >= 0) { for (const r of o.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(r.id); senastVald.current = rid; return next; }
    }
    if (on) next.add(rid); else next.delete(rid);
    senastVald.current = rid;
    return next;
  }), []);
  function parkeraValda() {
    const ids = [...new Set(synligaValda.filter(r => r.dag !== null).map(r => r.lessonId ?? r.id))];
    if (!ids.length || checking) return;
    onParkera(ids); setValda(new Set());
  }
  const sortera = (kolumn: PassKolumn) => onVal({ ...val, sortering: { kolumn, stigande: val.sortering.kolumn === kolumn ? !val.sortering.stigande : true } });
  const laggTillFilter = (value: string) => {
    const at = value.indexOf('|'), typ = value.slice(0, at) as PassFilter['typ'], varde = value.slice(at + 1);
    if (!typ || val.filter.some(f => f.typ === typ && f.varde === varde)) return;
    onVal({ ...val, filter: [...val.filter, { typ, varde }] });
  };
  const filterNamn = (f: PassFilter) => `${PASS_FILTER.find(x => x.typ === f.typ)?.namn}: ${val_[f.typ].find(x => x.varde === f.varde)?.namn ?? f.varde}`;

  function onKeyDown(e: ReactKeyboardEvent<HTMLTableElement>) {
    const el = e.target as HTMLElement, cell = el.closest<HTMLElement>('[data-col]'), tr = el.closest<HTMLTableRowElement>('tr');
    if (!cell || !tr || e.altKey) return;
    const col = Number(cell.dataset.col), index = tr.dataset.passrad === undefined ? -1 : ordning.findIndex(r => r.id === tr.dataset.passrad), ctrl = e.ctrlKey || e.metaKey;
    const rad = index >= 0 ? ordning[index] : null, l = rad ? lessons.get(rad.lessonId ?? rad.id) : undefined, checkbox = el instanceof HTMLInputElement;
    const steg: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageDown: [10, 0], PageUp: [-10, 0] };
    if (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey) {
      e.preventDefault();
      if (l && !checking) { tangentbord.current = true; oppnaMenyVid(cell); }
      return;
    }
    if (e.shiftKey && e.key !== ' ') return;
    if (steg[e.key] && !ctrl) {
      e.preventDefault();
      const [dr, dc] = steg[e.key];
      fokusera(e.key.startsWith('Page') ? Math.max(index < 0 ? -1 : 0, index + dr) : index + dr, col + dc);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      fokusera(ctrl ? (e.key === 'Home' ? 0 : ordning.length - 1) : index, e.key === 'Home' ? 0 : SISTA_KOLUMN);
    } else if (e.key === 'Escape') {
      if (synligaValda.length) { e.preventDefault(); setValda(new Set()); } else if (picked) { e.preventDefault(); onAvbryt(); }
    } else if (!l || ctrl) {
      return;
    } else if (e.key === 'Enter' && !checkbox) {
      e.preventDefault();
      atgarder(l).flytta();
    } else if (e.key === ' ' && !checkbox) {
      e.preventDefault();
      valj(rad!.id, e.shiftKey);
    } else if (e.key.toLowerCase() === 'l' && atgarder(l).las) { e.preventDefault(); atgarder(l).las?.();
    } else if (e.key.toLowerCase() === 'b' && atgarder(l).byt) { e.preventDefault(); atgarder(l).byt?.();
    } else if ((e.key === 'p' || e.key === 'P') && l.day !== null) {
      e.preventDefault();
      atgarder(l).parkera();
    }
  }
  function onFocus(e: ReactFocusEvent<HTMLTableElement>) {
    const el = e.target as HTMLElement, cell = el.closest<HTMLElement>('[data-col]'), tr = el.closest<HTMLTableRowElement>('tr');
    if (!cell || !tr) return;
    const next = { id: tr.dataset.passrad ?? RUBRIK, col: Number(cell.dataset.col) };
    if (next.id !== aktiv.id || next.col !== aktiv.col) setAktiv(next);
  }
  function onContextMenu(e: ReactMouseEvent<HTMLDivElement> & { preventBaseUIHandler?: () => void }) {
    const rid = (e.target as HTMLElement).closest<HTMLElement>('tr[data-passrad]')?.dataset.passrad;
    if (!rid || checking) { e.preventBaseUIHandler?.(); return; }
    setMal(rid);
  }
  const flyttarFokus = (action: () => void) => () => { menyFokus.current = true; action(); };
  const malRad = mal ? ordning.find(r => r.id === mal) ?? null : null;
  const malLesson = malRad ? lessons.get(malRad.lessonId ?? malRad.id) ?? null : null;
  const flera = malLesson && malRad && valda.has(malRad.id) ? new Set(synligaValda.filter(r => r.dag !== null).map(r => r.lessonId ?? r.id)).size : 0;

  const allaValda = ordning.length > 0 && synligaValda.length === ordning.length;
  const sortIkon = (k: PassKolumn) => val.sortering.kolumn !== k ? <ChevronsUpDownIcon aria-hidden="true"/> : val.sortering.stigande ? <ArrowUpIcon aria-hidden="true"/> : <ArrowDownIcon aria-hidden="true"/>;
  const ritade = ordning.slice(0, antal);
  const tab = (c: number) => rubrikAktiv === c ? 0 : -1;

  return <section className="passtabell" aria-labelledby={`${id}-rubrik`}>
    <h2 id={`${id}-rubrik`} className="sr-only">Pass i tabell</h2>
    <div className="schema-filter passtabell-verktyg">
      <label htmlFor={`${id}-sok`}>Sök<Input id={`${id}-sok`} type="search" value={val.sok} placeholder="Ämne, klass, lärare, sal …" onChange={e => onVal({ ...val, sok: e.target.value })}/></label>
      <label>Lägg till filter<select value="" onChange={e => { laggTillFilter(e.target.value); e.target.value = ''; }}>
        <option value="">Välj …</option>
        {PASS_FILTER.map(f => val_[f.typ].length > 0 && <optgroup key={f.typ} label={f.namn}>
          {val_[f.typ].map(x => <option key={x.varde} value={`${f.typ}|${x.varde}`} disabled={val.filter.some(y => y.typ === f.typ && y.varde === x.varde)}>{x.namn}</option>)}</optgroup>)}
      </select></label>
      <label className="schema-check"><input type="checkbox" checked={val.gruppera} onChange={e => onVal({ ...val, gruppera: e.target.checked })}/>Gruppera per undervisning</label>
    </div>
    {val.filter.length > 0 && <fieldset className="passtabell-chips">
      <legend className="schema-note">Valda filter:</legend>
      {val.filter.map(f => <Button key={`${f.typ}|${f.varde}`} type="button" variant="outline" className="schema-chip" aria-label={`Ta bort filtret ${filterNamn(f)}`}
        onClick={() => onVal({ ...val, filter: val.filter.filter(x => x !== f) })}>{filterNamn(f)}<XIcon aria-hidden="true"/></Button>)}
      <Button type="button" variant="ghost" onClick={() => onVal({ ...val, filter: [] })}>Rensa filter</Button>
    </fieldset>}
    <div className="passtabell-rad">
      <p className="schema-note" aria-live="polite">Visar {ordning.length} av {rader.length} {visning && visning.mode !== 'grundschema' ? 'tillfällen' : 'pass'}{grupper ? ` i ${grupper.length} ${grupper.length === 1 ? 'undervisning' : 'undervisningar'}` : ''}.
        {synligaValda.length > 0 && ` ${synligaValda.length} ${visning && visning.mode !== 'grundschema' ? synligaValda.length === 1 ? 'tillfälle valt' : 'tillfällen valda' : synligaValda.length === 1 ? 'pass valt' : 'pass valda'}.`}</p>
      {synligaValda.length > 0 && <div className="passtabell-knappar">
        <Button type="button" variant="outline" disabled={checking || !synligaValda.some(r => r.dag !== null)} onClick={parkeraValda}>Lägg valda på viloytan</Button>
        {onLas && <><Button type="button" variant="outline" disabled={checking || !synligaValda.some(r => r.dag !== null)} onClick={() => onLas([...new Set(synligaValda.filter(r => r.dag !== null).map(r => r.lessonId ?? r.id))], true)}>Lås valda</Button>
          <Button type="button" variant="outline" disabled={checking || !synligaValda.some(r => r.last)} onClick={() => onLas([...new Set(synligaValda.filter(r => r.last).map(r => r.lessonId ?? r.id))], false)}>Lås upp valda</Button></>}
        <Button type="button" variant="ghost" onClick={() => setValda(new Set())}>Avmarkera</Button>
      </div>}
    </div>
    <p id={`${id}-hjalp`} className="sr-only">Piltangenter flyttar mellan celler. Enter flyttar passet, F följer passet, P lägger det på viloytan, mellanslag väljer raden och Skift+F10 öppnar menyn. Esc avbryter.</p>
    {ordning.length === 0
      ? <div className="empty-state"><p>Inga pass med de här filtren.</p>{(val.filter.length > 0 || val.sok) && <Button type="button" variant="outline" onClick={() => onVal({ ...val, filter: [], sok: '' })}>Rensa filter och sökning</Button>}</div>
      : <ContextMenu open={open} disabled={checking} onOpenChange={next => { setOpen(next); if (!next) tangentbord.current = false; }}
        onOpenChangeComplete={next => { if (next && tangentbord.current) document.querySelector<HTMLElement>('.schema-meny [role="menuitem"]:not([data-disabled])')?.focus(); }}>
        <ContextMenuTrigger className="passtabell-yta" onContextMenu={onContextMenu}>
          <div ref={tabellRef} className="passtabell-ram">
            <Table role="grid" aria-labelledby={`${id}-rubrik`} aria-describedby={`${id}-hjalp`} aria-multiselectable="true" aria-colcount={SISTA_KOLUMN + 1}
              onKeyDown={onKeyDown} onFocus={onFocus}>
              <TableHeader><TableRow>
                <TableHead className="passtabell-valruta"><input type="checkbox" data-col={0} tabIndex={tab(0)} checked={allaValda} aria-label="Välj alla pass som visas"
                  ref={el => { if (el) el.indeterminate = synligaValda.length > 0 && !allaValda; }}
                  onChange={() => setValda(allaValda ? new Set() : new Set(ordning.map(r => r.id)))}/></TableHead>
                {PASS_KOLUMNER.map((k, i) => <TableHead key={k.id} scope="col" aria-sort={val.sortering.kolumn === k.id ? val.sortering.stigande ? 'ascending' : 'descending' : undefined}>
                  <button type="button" className="passtabell-sort" data-col={i + 1} tabIndex={tab(i + 1)} onClick={() => sortera(k.id)}>{k.namn}{sortIkon(k.id)}</button></TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {grupper ? grupper.map(g => {
                  const forsta = ordning.indexOf(g.rader[0]);
                  if (forsta >= antal) return null;
                  return <Fragment key={g.nyckel}><Grupprad grupp={g}/>{g.rader.map((r, j) => forsta + j < antal ? radFor(r, forsta + j) : null)}</Fragment>;
                }) : ritade.map((r, i) => radFor(r, i))}
              </TableBody>
            </Table>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="schema-meny" finalFocus={() => { const keep = !menyFokus.current; menyFokus.current = false; return keep; }}>
          {malLesson && <PassMenypunkter pass={malLesson} rubrik={rubrik(malLesson)} flyttarFokus={flyttarFokus} {...passMenyHandelser(atgarder(malLesson))}/>}
          {flera > 1 && <><ContextMenuSeparator/><ContextMenuItem onClick={parkeraValda}>Lägg {flera} valda pass på viloytan</ContextMenuItem></>}
        </ContextMenuContent>
      </ContextMenu>}
  </section>;

  function radFor(r: PassRad, index: number) {
    return <Rad key={r.id} rad={r} aktivCol={rubrikAktiv === null && index === aktivIndex ? aktiv.col : null} vald={valda.has(r.id)} markerad={picked === (r.lessonId ?? r.id)} onVald={valj}/>;
  }
}

/** Rubrikrad för en undervisning: antal pass och utlagd tid mot timplanen, samma tal som i Tid över läsåret. */
function Grupprad({ grupp: g }: { grupp: PassGrupp }) {
  const tid = g.tid ? `Utlagt ${hoursText(g.tid.planeradMin)} av timplanens ${hoursText(g.tid.timplanMin)}${g.tid.utanTid ? `, ${g.tid.utanTid} pass utan tid` : ''}` : 'Finns inte i Tid över läsåret';
  return <TableRow className="passtabell-grupp"><th colSpan={SISTA_KOLUMN + 1} scope="colgroup">
    <strong>{g.undervisning}{g.klasser.length ? ` · ${g.klasser.join(', ')}` : ''}</strong><span className="schema-note"> {g.rader.length} pass · {tid}</span></th></TableRow>;
}

// Raden får inte sin plats som prop: vid sortering flyttas raderna utan att ritas om.
const Rad = memo(function Rad({ rad: r, aktivCol, vald, markerad, onVald }: {
  rad: PassRad; aktivCol: number | null; vald: boolean; markerad: boolean; onVald: (id: string, utoka: boolean) => void;
}) {
  const tab = (c: number) => aktivCol === c ? 0 : -1;
  const veckor = veckorText(r), marginal = marginalText(r);
  return <TableRow data-lesson={r.lessonId ?? r.id} data-passrad={r.id} aria-selected={vald} data-state={vald ? 'selected' : undefined}
    className={`${markerad ? 'passtabell-markerad' : ''}${r.status === 'avvikelse' ? ' passtabell-avvikelse' : ''}`}>
    <TableCell className="passtabell-valruta"><input type="checkbox" data-col={0} tabIndex={tab(0)} checked={vald} aria-label={`Välj ${radNamn(r)}`}
      onClick={e => onVald(r.id, e.shiftKey)} onChange={() => undefined}/></TableCell>
    <TableCell data-col={1} tabIndex={tab(1)}><strong>{r.undervisning}</strong>{r.aktivitetTyp && <span className="schema-note"> · {r.aktivitetTyp}{r.datum ? " · Grundschemaaktivitet" : ""}</span>}{markerad && <span className="passtabell-markering"> · Markerat</span>}</TableCell>
    <TableCell data-col={2} tabIndex={tab(2)}>{lista(r.klasser) || '–'}</TableCell>
    <TableCell data-col={3} tabIndex={tab(3)}>{lista(r.grupper) || '–'}</TableCell>
    <TableCell data-col={4} tabIndex={tab(4)}>{r.vakant ? 'Ingen lärare' : lista(r.larare) || '–'}</TableCell>
    <TableCell data-col={5} tabIndex={tab(5)}>{r.sal || '–'}</TableCell>
    <TableCell data-col={6} tabIndex={tab(6)}>{dagText(r)}</TableCell>
    <TableCell data-col={7} tabIndex={tab(7)} className="passtabell-tal">{tidText(r)}</TableCell>
    <TableCell data-col={8} tabIndex={tab(8)} className="passtabell-tal">{r.langd} min{r.langd !== r.grundLangd && <span className="schema-note"> ({r.grundLangd} i grundschemat)</span>}</TableCell>
    <TableCell data-col={9} tabIndex={tab(9)}>{terminText(r)}</TableCell>
    <TableCell data-col={10} tabIndex={tab(10)}>{veckor || '–'}</TableCell>
    <TableCell data-col={11} tabIndex={tab(11)} className="passtabell-tal">{marginal || '–'}</TableCell>
    <TableCell data-col={12} tabIndex={tab(12)}><span className="passtabell-status"><span className={`status-badge ${TON[r.status]}`}>{PASS_STATUS[r.status]}</span>
      {r.orsak && <span className="passtabell-orsak">{r.orsak}</span>}</span></TableCell>
  </TableRow>;
});
