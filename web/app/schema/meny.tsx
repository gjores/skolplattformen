'use client';
// Snabbmenyn, verktygen och tangentbordet i veckan (05.2-SM-MENY, Main och Sparra). Allt som går att göra med ett pass eller en tid
// nås på tre likvärdiga vägar: högerklick, verktygsfält och tangentbord. En spärr blir ett vanligt eget villkor, via utkastet så att den kan ångras.
// Menypunkter för funktioner som kommer i senare planer (Följ passet, Varför inte här, Föreslå placering, Lås, Byt, Gemensam ledig tid) finns inte än.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Kbd } from '@/components/ui/kbd';
import type { SchemaForslag, SchemaForslagLesson, SchemaRegel, SchemaVillkor } from '@/lib/schema-contract.ts';
import type { SchemaKalla } from '@/lib/schema-lager.ts';
import { flyttaMarkering, laggAldrigHar, markeringVid, nyaVillkorBrott, passPaVillkor, sparrRegel, sparrResurser, stegMal, villkorSteg,
  type SchemaMarkering, type SchemaPil, type SchemaUtkast, type SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { PERIOD, startTimes } from './delat.ts';
import { kallaText, visaVillkor } from './lager.tsx';
import { SparrPanel, passText, tidText, type SparrTyp } from './sparr.tsx';
import { HJALP_ID, Verktygsfalt } from './verktyg.tsx';
import { minutVid, somRutnat, type VeckaProps } from './vecka.tsx';

type Flytt = Extract<SchemaUtkastAtgard, { type: 'move' | 'park' }>;
/** Vad menyn öppnades för: ett pass, en markerad tid eller ett fält med villkor. */
/** Ett fält med villkor har också tiden som högerklickades, så att tom tid under ett fält (lunch, sena pass) kan spärras. */
type Mal = { typ: 'pass'; lesson: string } | { typ: 'tid'; markering: SchemaMarkering } | { typ: 'falt'; kalla: SchemaKalla; markering: SchemaMarkering | null };
const PILAR: Record<string, SchemaPil> = { ArrowUp: 'upp', ArrowDown: 'ner', ArrowLeft: 'vanster', ArrowRight: 'hoger' };

export type MenyVal = {
  forslag: SchemaForslag | null;
  /** Öppnar Följ passet för ett pass (05.2-SM-FOLJ); utan den finns ingen menypunkt. */
  folj?: (lesson: string) => void;
  utkast: SchemaUtkast;
  dispatch: (action: SchemaUtkastAtgard) => void;
  villkor: SchemaVillkor;
  setVillkor: (next: SchemaVillkor) => void;
  /** Passen som visas i veckan, med utkastets placeringar. */
  shown: SchemaForslagLesson[];
  /** Alla pass i terminen som visas, för att räkna vad ett villkor berör. */
  alla: SchemaForslagLesson[];
  /** Den klass eller lärare som visas (förslagets löpnummer). */
  visad: string;
  unplaced: SchemaForslagLesson[];
  kallor: Record<string, SchemaKalla>;
  /** Passets längd som den visas i veckan. */
  length: (l: SchemaForslagLesson) => number;
  checking: boolean;
  week: RefObject<HTMLDivElement | null>;
  andra: (action: Flytt) => void;
  pick: (l: SchemaForslagLesson) => void;
  taBort: (k: Extract<SchemaKalla, { typ: 'egen' }>) => void;
};

/** Villkoren för ett ämne i villkorsformuläret: rutan fälls ut och fokus läggs på ämnets första villkor, eller på formuläret för nya villkor. */
function visaVillkorFor(title: string): void {
  const box = document.querySelector<HTMLDetailsElement>('details.schema-villkor');
  if (!box) return;
  box.open = true;
  const rad = [...box.querySelectorAll<HTMLElement>('ul[aria-label="Egna villkor"] > li')].find(li => li.textContent?.startsWith(`Ämne ${title}:`));
  const target = rad ?? [...box.querySelectorAll('fieldset')].find(f => f.querySelector('legend')?.textContent === 'Egna villkor')?.querySelector<HTMLElement>('select, input, button');
  if (!target) return;
  if (rad) rad.tabIndex = -1;
  target.scrollIntoView({ block: 'center' });
  target.focus({ preventScroll: true });
}

export function useSchemaMeny({ forslag, utkast, dispatch, villkor, setVillkor, shown, alla, visad, unplaced, kallor, length, checking, week, andra, pick, taBort, folj }: MenyVal) {
  const text = (l: SchemaForslagLesson) => passText(l, length(l));
  const tool = utkast.tool, markerar = tool === 'sparra' || tool === 'tillat';
  const [markering, setMarkering] = useState<SchemaMarkering | null>(null);
  const [ny, setNy] = useState<{ typ: SparrTyp; markering: SchemaMarkering; vald: number } | null>(null);
  const [mal, setMal] = useState<Mal | null>(null), [open, setOpen] = useState(false), [status, setStatus] = useState('');
  const [rutnat, setRutnat] = useState(true);
  // Fokus efter en ändring: markeringen (efter piltangent), ett fält eller ett pass (css-väljare). `menyFokus` hindrar menyn från att ta tillbaka fokus.
  const fokus = useRef<string | null>(null), menyFokus = useRef(false), tangentbord = useRef(false);
  useEffect(() => {
    const el = week.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setRutnat(somRutnat(el)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [week, forslag]);
  useEffect(() => {
    if (!fokus.current) return;
    const el = week.current?.querySelector<HTMLElement>(fokus.current) ?? document.querySelector<HTMLElement>(fokus.current);
    if (el) { el.focus(); fokus.current = null; }
  });
  // Ett nytt förslag eller en annan vy tömmer markering och panel.
  const vy = `${forslag?.fingerprint ?? ''}|${visad}`, [visadVy, setVisadVy] = useState(vy);
  if (visadVy !== vy) { setVisadVy(vy); setMarkering(null); setNy(null); }

  const days = forslag?.days ?? [];
  const brott = forslag ? nyaVillkorBrott(forslag, villkor.egna, forslag.villkor.egna, alla) : new Map<string, SchemaRegel['typ']>();
  const visadMarkering = markering ?? (markerar && days.length ? { ...markeringVid(days, 0, days[0].startMin), tom: true } : null);

  function laggTill(rule: SchemaRegel, text: string, berorda: SchemaForslagLesson[], efterFokus: string | null) {
    const fore = villkor.egna, efter = [...fore, rule];
    setVillkor({ ...villkor, egna: efter });
    dispatch({ type: 'villkor', fore, efter, text });
    setStatus(`${text}: tillagt som eget villkor ${efter.length}. ${berorda.length ? `${berorda.length} pass ligger fel och märks som regelavvikelse.` : 'Inga pass ligger fel.'} Villkoret gäller nästa förslag.`);
    fokus.current = efterFokus;
  }
  /** Ångra eller gör om ett villkor som lades till i veckan. Ger false när nästa steg är en flytt, som arbetsytan kontrollerar som vanligt. */
  function angra(which: 'undo' | 'redo'): boolean {
    const step = utkast[which].at(-1);
    if (!villkorSteg(step)) return false;
    setVillkor({ ...villkor, egna: which === 'undo' ? step.villkor : step.efter });
    dispatch({ type: which });
    setStatus(`${which === 'undo' ? 'Ångrat' : 'Gjort om'}: ${step.text}.`);
    return true;
  }

  // Panelen Ny spärr.
  const panelResurser = forslag && ny ? sparrResurser(forslag, visad, shown, ny.markering) : [];
  const panelRegel = ny && panelResurser[ny.vald] ? sparrRegel(ny.typ, panelResurser[ny.vald], ny.markering) : null;
  const panelBerorda = forslag && panelRegel ? passPaVillkor(forslag, [...villkor.egna, panelRegel], villkor.egna.length, alla) : [];
  function oppnaPanel(typ: SparrTyp, m: SchemaMarkering, vald = 0) { setMarkering(m); setNy({ typ, markering: m, vald }); menyFokus.current = true; }
  function laggTillSparr() {
    if (!ny || !panelRegel) return;
    const r = panelResurser[ny.vald], text = `${ny.typ === 'sparrad' ? 'Spärrad' : 'Tillåten tid'} · ${r.namn} · ${tidText(ny.markering).toLowerCase()}`;
    laggTill(panelRegel, text, panelBerorda, `[data-source="egna:${villkor.egna.length}"] button`);
    setNy(null); setMarkering(null);
  }
  function avbryt() { setNy(null); fokus.current = '[data-markering]'; }

  function laggAldrig(l: SchemaForslagLesson) {
    const rule = laggAldrigHar(l);
    if (!forslag || !rule) return;
    laggTill(rule, `Lägg aldrig här · ${text(l)}`, passPaVillkor(forslag, [...villkor.egna, rule], villkor.egna.length, alla), `[data-lesson="${l.id}"]`);
  }
  function laggUt(l: SchemaForslagLesson, m: SchemaMarkering) {
    if (!forslag) return;
    const starts = startTimes(forslag, m.day, l.durationMin + l.marginMin);
    const start = starts.find(s => s >= m.startMin) ?? starts.at(-1);
    if (start !== undefined) andra({ type: 'move', lesson: l.id, day: m.day, startMin: start });
  }
  function visaBerorda(k: SchemaKalla) {
    if (!forslag || k.typ !== 'egen') return;
    const berorda = passPaVillkor(forslag, villkor.egna, k.index, shown);
    setStatus(berorda.length ? `Berörda pass: ${berorda.map(text).join(', ')}.` : 'Inga pass i veckan berörs av villkoret.');
    if (berorda[0]) { fokus.current = `[data-lesson="${berorda[0].id}"]`; menyFokus.current = true; }
  }

  /** Vad menyn gäller, ur elementet som högerklickades eller har fokus. Null: ingen meny (webbläsarens egen). */
  function malFor(el: HTMLElement, y: number | null): Mal | null {
    const lesson = el.closest<HTMLElement>('[data-lesson]')?.dataset.lesson;
    if (lesson) return shown.some(l => l.id === lesson) ? { typ: 'pass', lesson } : null;
    if (el.closest('[data-markering]') && visadMarkering) return { typ: 'tid', markering: { day: visadMarkering.day, startMin: visadMarkering.startMin, endMin: visadMarkering.endMin } };
    const source = el.closest<HTMLElement>('[data-source]')?.dataset.source, kalla = source ? kallor[source] : undefined;
    const ol = el.closest<HTMLElement>('ol[data-day]');
    const day = ol ? Number(ol.dataset.day) : 0, minute = ol && y !== null ? minutVid(ol, y) : null;
    const m = minute === null || !days.length ? null
      : markering && markering.day === day && minute >= markering.startMin && minute <= markering.endMin ? markering : markeringVid(days, day, minute);
    if (kalla && (el.closest('.schema-falt-knapp') || !markerar)) return { typ: 'falt', kalla, markering: tangentbord.current ? null : m };
    return m ? { typ: 'tid', markering: m } : null;
  }
  function onContextMenu(e: ReactMouseEvent<HTMLDivElement> & { preventBaseUIHandler?: () => void }) {
    const next = forslag && rutnat && !checking ? malFor(e.target as HTMLElement, e.clientY) : null;
    if (!next) { e.preventBaseUIHandler?.(); return; }
    if (next.typ !== 'pass' && next.markering) setMarkering(next.markering);
    setMal(next); setStatus('');
  }
  /** Skift+F10 och menytangenten: samma meny som högerklick, vid elementet som har fokus. */
  function oppnaMed(el: HTMLElement) {
    const box = el.getBoundingClientRect();
    tangentbord.current = true;
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + Math.min(box.width / 2, 24), clientY: box.top + Math.min(box.height / 2, 16) }));
  }
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!forslag || !rutnat || e.defaultPrevented) return;
    const el = e.target as HTMLElement, plain = !e.altKey && !e.ctrlKey && !e.metaKey;
    if (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey) { e.preventDefault(); oppnaMed(el); return; }
    const lessonId = el.matches('[data-lesson]') ? el.dataset.lesson : undefined, l = shown.find(x => x.id === lessonId);
    if (l && plain && !e.shiftKey) {
      if (e.key === 'p' || e.key === 'P') { e.preventDefault(); andra({ type: 'park', lesson: l.id }); return; }
      const pil = PILAR[e.key];
      if (pil) {
        e.preventDefault();
        const to = stegMal(forslag, l, pil);
        if (to) andra({ type: 'move', lesson: l.id, day: to.day, startMin: to.startMin });
        else setStatus(`${l.title} kan inte flyttas längre åt det hållet: ${pil === 'upp' || pil === 'ner' ? 'dagens gräns är nådd' : 'tiden ryms inte där'}.`);
      }
      return;
    }
    if (!el.matches('[data-markering]') || !visadMarkering || !plain) return;
    const pil = PILAR[e.key];
    if (pil) {
      e.preventDefault();
      setMarkering(flyttaMarkering(days, visadMarkering, pil, e.shiftKey)); fokus.current = '[data-markering]';
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const m = { day: visadMarkering.day, startMin: visadMarkering.startMin, endMin: visadMarkering.endMin };
      if (markerar) oppnaPanel(tool === 'sparra' ? 'sparrad' : 'tillaten', m); else oppnaMed(el);
    } else if (e.key === 'Escape' && markering) {
      e.preventDefault();
      setMarkering(null); setNy(null);
      fokus.current = markerar ? '[data-markering]' : `ol[data-day="${markering.day}"] [data-lesson]`;
    }
  }

  const veckaProps: Pick<VeckaProps, 'verktyg' | 'markering' | 'markeringNamn' | 'markeringHjalp' | 'onMarkera'> = {
    verktyg: tool, markering: rutnat ? visadMarkering : null, markeringHjalp: HJALP_ID,
    markeringNamn: m => `${'tom' in m && m.tom ? 'Välj tid' : 'Markerad tid'} ${tidText(m).toLowerCase()}`,
    onMarkera: (m, klar) => { setMarkering(m); if (klar) oppnaPanel(tool === 'sparra' ? 'sparrad' : 'tillaten', m); },
  };

  const pass = mal?.typ === 'pass' ? shown.find(l => l.id === mal.lesson) ?? null : null;
  const tid = mal && mal.typ !== 'pass' ? mal.markering : null;
  const tidResurser = forslag && tid ? sparrResurser(forslag, visad, shown, tid) : [];
  const kalla = mal?.typ === 'falt' ? mal.kalla : null, kallaRubrik = kalla && forslag ? kallaText(kalla, villkor, forslag.resurser).title : '';
  const tidRegel = (k: SchemaKalla) => k.typ === 'egen' && (villkor.egna[k.index]?.typ === 'sparrad' || villkor.egna[k.index]?.typ === 'tillaten');
  /** En menypunkt som flyttar fokus själv (panel, flyttpanel, formulär): menyn lämnar inte tillbaka fokus. */
  const flyttarFokus = (action: () => void) => () => { menyFokus.current = true; action(); };
  const resursLista = (typ: SparrTyp, m: SchemaMarkering) => tidResurser.length === 0
    ? <ContextMenuItem disabled>Inget att välja</ContextMenuItem>
    : tidResurser.map((r, i) => <ContextMenuItem key={`${r.slag}|${r.ref}`} onClick={() => oppnaPanel(typ, m, i)}>{r.namn}</ContextMenuItem>);

  const meny = <ContextMenuContent className="schema-meny" finalFocus={() => { const keep = !menyFokus.current; menyFokus.current = false; return keep; }}>
    {pass && pass.day !== null && pass.startMin !== null && <>
      <ContextMenuGroup><ContextMenuLabel>{pass.title} · {text(pass).slice(pass.title.length + 1)}</ContextMenuLabel></ContextMenuGroup>
      <ContextMenuItem onClick={flyttarFokus(() => pick(pass))}>Flytta…<ContextMenuShortcut><Kbd>Enter</Kbd></ContextMenuShortcut></ContextMenuItem>
      {folj && <ContextMenuItem onClick={flyttarFokus(() => folj(pass.id))}>Följ passet<ContextMenuShortcut><Kbd>F</Kbd></ContextMenuShortcut></ContextMenuItem>}
      <ContextMenuItem onClick={() => andra({ type: 'park', lesson: pass.id })}>Lägg på viloytan<ContextMenuShortcut><Kbd>P</Kbd></ContextMenuShortcut></ContextMenuItem>
      <ContextMenuSeparator/>
      <ContextMenuItem onClick={() => laggAldrig(pass)}>Lägg aldrig här</ContextMenuItem>
      <ContextMenuSeparator/>
      <ContextMenuItem onClick={flyttarFokus(() => visaVillkorFor(pass.title))}>Villkor för {pass.title}…</ContextMenuItem>
    </>}
    {kalla && <>
      <ContextMenuGroup><ContextMenuLabel>{kallaRubrik}</ContextMenuLabel></ContextMenuGroup>
      <ContextMenuItem onClick={flyttarFokus(() => visaVillkor(kalla))}>Ändra</ContextMenuItem>
      {kalla.typ === 'egen' && <ContextMenuItem onClick={flyttarFokus(() => taBort(kalla))}>Ta bort</ContextMenuItem>}
      {tidRegel(kalla) && <ContextMenuItem onClick={() => visaBerorda(kalla)}>Visa berörda pass</ContextMenuItem>}
      {tid && <ContextMenuSeparator/>}
    </>}
    {tid && <>
      <ContextMenuGroup><ContextMenuLabel>{tidText(tid)}</ContextMenuLabel></ContextMenuGroup>
      <ContextMenuSub><ContextMenuSubTrigger>Spärra för</ContextMenuSubTrigger>
        <ContextMenuSubContent className="schema-meny">{resursLista('sparrad', tid)}</ContextMenuSubContent></ContextMenuSub>
      <ContextMenuSub><ContextMenuSubTrigger>Tillåt bara här för</ContextMenuSubTrigger>
        <ContextMenuSubContent className="schema-meny">{resursLista('tillaten', tid)}</ContextMenuSubContent></ContextMenuSub>
      <ContextMenuSub><ContextMenuSubTrigger>Lägg ut pass från viloytan här</ContextMenuSubTrigger>
        <ContextMenuSubContent className="schema-meny">{unplaced.length === 0 ? <ContextMenuItem disabled>Viloytan är tom</ContextMenuItem>
          : unplaced.map(l => <ContextMenuItem key={l.id} disabled={startTimes(forslag!, tid.day, l.durationMin + l.marginMin).length === 0}
            onClick={() => laggUt(l, tid)}>{l.title}, {l.durationMin} min</ContextMenuItem>)}</ContextMenuSubContent></ContextMenuSub>
    </>}
  </ContextMenuContent>;

  const wrap = (vecka: ReactNode) => <ContextMenu open={open} disabled={!rutnat || !forslag}
    onOpenChange={next => { setOpen(next); if (!next) tangentbord.current = false; }}
    onOpenChangeComplete={next => {
      // Öppnad med tangentbordet: första menypunkten får fokus, som i en vanlig meny.
      if (next && tangentbord.current) document.querySelector<HTMLElement>('.schema-meny [role="menuitem"]:not([data-disabled])')?.focus();
    }}>
    <ContextMenuTrigger className="schema-meny-yta" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>{vecka}</ContextMenuTrigger>
    {meny}
  </ContextMenu>;

  const panel = forslag && ny ? <SparrPanel typ={ny.typ} markering={ny.markering} resurser={panelResurser} vald={Math.min(ny.vald, Math.max(0, panelResurser.length - 1))}
    berorda={panelBerorda} beskriv={text} nummer={villkor.egna.length + 1} period={PERIOD[forslag.period]} full={villkor.egna.length >= 200}
    onVald={vald => setNy({ ...ny, vald })} onLagg={laggTillSparr} onAvbryt={avbryt}/> : null;

  const verktyg = <Verktygsfalt tool={tool} disabled={checking} onTool={next => {
    dispatch({ type: 'tool', tool: next });
    if (next !== 'sparra' && next !== 'tillat') { setNy(null); setMarkering(null); } else if (ny) setNy({ ...ny, typ: next === 'sparra' ? 'sparrad' : 'tillaten' });
  }}/>;

  return {
    verktyg, wrap, panel, veckaProps, angra,
    meddelande: <output aria-live="polite" className="schema-note">{status}</output>,
    /** Pass som ligger på ett villkor som har lagts till efter förslaget, och raden i passrutan. */
    brott,
    rad: (l: SchemaForslagLesson) => { const typ = brott.get(l.id); return typ === 'sparrad' ? 'Ligger på ny spärr' : typ === 'tillaten' ? 'Utanför ny tillåten tid' : null; },
    /** Klick på ett pass: med verktyget Viloyta läggs passet på viloytan, annars väljs det för flytt. */
    onPick: (l: SchemaForslagLesson) => { if (tool === 'viloyta' && l.day !== null) andra({ type: 'park', lesson: l.id }); else pick(l); },
  };
}
