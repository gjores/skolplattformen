'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { SchemaForslag, SchemaForslagLesson, SchemaKontroll, SchemaKvalitetsrad, SchemaKvalitetsval, SchemaTerm, SchemaTimplanDeviation, SchemaViolation } from '@/lib/schema-contract.ts';
import { schemaDatumNyckel, type SchemaDatumAndring, type SchemaDatumSvar } from '@/lib/schema-datum.ts';
import { avvikelseNyckel, medvetenKrock } from '@/lib/schema-utkast.ts';
import { clock, dayName, PERIOD } from './delat.ts';
import { Lagesstatus } from './lagesstatus.tsx';
import { Schemakvalitet } from './kvalitet.tsx';
import { tidAvvikelser } from './tid.tsx';

export type GranskaMal = { lesson: string; originalDate?: string; term?: SchemaTerm };

const kategorier = [
  { id: 'placering', label: 'Pass utan tid' },
  { id: 'larare', label: 'Obemannade pass' },
  { id: 'sal', label: 'Salbehov och sal' },
  { id: 'regler', label: 'Regelavvikelser' },
  { id: 'timplan', label: 'Timplan' },
  { id: 'kapacitet', label: 'Salkapacitet' },
  { id: 'datum', label: 'Datumändringar' },
] as const;
type Kategori = (typeof kategorier)[number]['id'];
const atgardsordning = [
  { id: 'regler', text: 'Gå igenom regelavvikelserna och öppna berörda pass för att rätta krockar eller villkor.', knapp: 'Visa regelavvikelser' },
  { id: 'placering', text: 'Öppna ett pass utan tid och använd Föreslå placering för att pröva en plats.', knapp: 'Visa pass utan tid' },
  { id: 'timplan', text: 'Kontrollera passlängder och antal pass där undervisningstiden avviker från timplanen.', knapp: 'Visa avvikelser från timplanen' },
  { id: 'larare', text: 'Gå igenom obemannade pass och tilldela lärare i tjänstefördelningen.', knapp: 'Visa obemannade pass' },
  { id: 'sal', text: 'Se över salbehoven för undervisning som saknar en lämplig sal eller ett angivet salbehov.', knapp: 'Visa salbehov' },
  { id: 'kapacitet', text: 'Se över salsättningen för pass där gruppen behöver fler platser.', knapp: 'Visa salkapacitet' },
] as const;
type Fynd = {
  key: string;
  kategori: Kategori;
  titel: string;
  besked: string;
  mal: GranskaMal[];
  medveten?: boolean;
  konflikt?: SchemaViolation;
  upplysning?: boolean;
};
type GranskaUnderlag = {
  forslag: SchemaForslag | null;
  lessons: SchemaForslagLesson[];
  kontroll: SchemaKontroll | null;
  datum: SchemaDatumSvar | null;
  datedOverrides: SchemaDatumAndring[];
  intentional: Set<string>;
};
const tidBesked: Record<SchemaTimplanDeviation, string> = {
  unplaced: 'Undervisningen har pass utan tid.',
  weekly: 'De planerade passlängderna ger en annan tid än timplanen.',
  calendar: 'De valda veckodagarna ger en annan tid än timplanen.',
};
const malNyckel = (m: GranskaMal) => m.originalDate ? schemaDatumNyckel({ lesson: m.lesson, originalDate: m.originalDate }) : m.lesson;
const malFranDatum = (key: string): GranskaMal => {
  const [lesson, originalDate] = key.split('@');
  return { lesson, originalDate };
};

function granskaFynd({ forslag, lessons, kontroll, datum, datedOverrides, intentional }: GranskaUnderlag): Fynd[] {
  if (!forslag) return [];
  const fynd: Fynd[] = [];
  const undervisningspass = new Map<string, SchemaForslagLesson[]>();
  const sorteradePass = [...lessons].sort((a, b) => (a.day ?? -1) - (b.day ?? -1) || (a.startMin ?? 0) - (b.startMin ?? 0) || a.title.localeCompare(b.title, 'sv'));
  for (const pass of sorteradePass) {
    if (pass.undervisning) {
      const andra = undervisningspass.get(pass.undervisning) ?? [];
      andra.push(pass);
      undervisningspass.set(pass.undervisning, andra);
    }
    const mal = [{ lesson: pass.id }];
    const lagd = pass.day !== null && pass.startMin !== null;
    if (!lagd) fynd.push({ key: `placering:${pass.id}`, kategori: 'placering', titel: pass.title, besked: 'Passet saknar tid.', mal });
    if (pass.vacant && !pass.egenAktivitet) fynd.push({ key: `larare:${pass.id}`, kategori: 'larare', titel: pass.title, besked: 'Passet har ett obemannat läraruppdrag.', mal });

    let salbesked = pass.sal?.hinder;
    if (!salbesked && pass.roomIds.length === 0 && !pass.egenAktivitet && pass.sal?.lage !== 'ingen') salbesked = 'Undervisningen saknar ett angivet salbehov.';
    if (!salbesked && lagd && pass.roomIds.length > 0) {
      if (pass.roomId === null) salbesked = 'Passet behöver en sal.';
      else if (!pass.roomIds.includes(pass.roomId)) salbesked = 'Salen uppfyller inte passets salbehov.';
    }
    if (salbesked) fynd.push({ key: `sal:${pass.id}`, kategori: 'sal', titel: pass.title, besked: salbesked, mal });

    if (lagd && pass.roomId !== null && pass.roomIds.includes(pass.roomId)) {
      const kapacitet = pass.sal?.kapacitet?.[pass.roomId];
      if (kapacitet !== 'racker') fynd.push({ key: `kapacitet:${pass.id}`, kategori: 'kapacitet', titel: pass.title, mal, upplysning: kapacitet !== 'for_liten',
        besked: kapacitet === 'for_liten' ? 'Salen har för få platser.' : 'Salens kapacitet för passet har inte kunnat kontrolleras.' });
    }
  }

  for (const v of kontroll?.violations ?? []) {
    const key = avvikelseNyckel(v);
    fynd.push({ key: `regel:${key}`, kategori: 'regler', titel: 'Regelavvikelse', besked: v.message,
      mal: [...new Set(v.lessons)].map(lesson => ({ lesson })), medveten: intentional.has(key), konflikt: medvetenKrock(v) ? v : undefined });
  }
  for (const v of datum?.violations ?? []) {
    const tillfallen = [...new Set(v.occurrences)].sort().map(malFranDatum);
    const medTillfalle = new Set(tillfallen.map(t => t.lesson));
    const grundpass = [...new Set(v.lessons)].filter(lesson => !medTillfalle.has(lesson)).map(lesson => ({ lesson }));
    fynd.push({ key: `datumregel:${v.date}:${avvikelseNyckel(v)}:${[...v.occurrences].sort().join(';')}`, kategori: 'regler',
      titel: `Regelavvikelse den ${v.date}`, besked: v.message, mal: [...tillfallen, ...grundpass] });
  }

  const { deviating } = tidAvvikelser(kontroll ? { ...forslag, teachings: kontroll.teachings } : forslag);
  const undervisning = new Map(deviating.map(t => [t.ref, t]));
  for (const t of deviating) {
    if (!t.deviation) continue;
    const berorda = undervisningspass.get(t.ref) ?? [];
    const mal = (t.deviation === 'unplaced' ? berorda.filter(p => p.day === null) : berorda).map(p => ({ lesson: p.id }));
    fynd.push({ key: `timplan:${t.ref}`, kategori: 'timplan', titel: [t.title, t.classes.join(', ')].filter(Boolean).join(' · '),
      besked: `${tidBesked[t.deviation]} ${t.plannedMin} av ${t.needMin} minuter är utlagda.`, mal });
  }
  for (const [index, o] of forslag.omitted.entries()) {
    if (o.reason === 'no_time') continue;
    fynd.push({ key: `utelamnad:${index}`, kategori: 'timplan', titel: [o.title, o.classes.join(', ')].filter(Boolean).join(' · '),
      besked: o.reason === 'no_days' ? 'Undervisningen kunde inte läggas eftersom det saknas skoldagar i perioden.' : 'Undervisningens tid räcker inte för ett pass.', mal: [] });
  }

  const passPerId = new Map(lessons.map(p => [p.id, p]));
  const andringarPerUndervisning = new Map<string, SchemaDatumAndring[]>();
  const skoldagar = new Map(forslag.time.calendar?.days.map(d => [d.date, d.term]));
  const sorteradeAndringar = [...datedOverrides].sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin);
  for (const a of sorteradeAndringar) {
    const pass = passPerId.get(a.lesson);
    if (!pass) continue;
    if (pass.undervisning) {
      const andra = andringarPerUndervisning.get(pass.undervisning) ?? [];
      andra.push(a);
      andringarPerUndervisning.set(pass.undervisning, andra);
    }
    const besked = a.originalDate === a.date ? `Ändrat tillfälle den ${a.date}.` : `Flyttat från ${a.originalDate} till ${a.date}.`;
    fynd.push({ key: `datum:${schemaDatumNyckel(a)}`, kategori: 'datum', titel: pass.title, besked, mal: [a] });
  }
  for (const t of datum?.timeChanges ?? []) {
    const source = undervisning.get(t.ref);
    const andra = andringarPerUndervisning.get(t.ref) ?? [];
    fynd.push({ key: `datumtid:${t.ref}:${t.term}`, kategori: t.deviation ? 'timplan' : 'datum',
      titel: [source?.title ?? 'Tid efter datumändring', source?.classes.join(', '), PERIOD[t.term]].filter(Boolean).join(' · '),
      besked: `Datumändringarna ger ${t.deltaMin > 0 ? '+' : '−'}${Math.abs(t.deltaMin)} minuter. ${t.plannedMin} av ${t.needMin} minuter är utlagda.${t.deviation ? ' Tiden behöver ses över.' : ''}`,
      mal: andra.filter(a => t.term === 'lasar' || skoldagar.get(a.date) === t.term || skoldagar.get(a.originalDate) === t.term) });
  }
  return [...new Map(fynd.map(f => [f.key, f])).values()];
}

type GranskaProps = GranskaUnderlag & {
  checking: boolean;
  stale: boolean;
  active: boolean;
  disabled?: boolean;
  actions?: ReactNode;
  elevkvalitet?: SchemaKvalitetsrad[];
  senGrans: number | null;
  onProva: (val: SchemaKvalitetsval, knapp: HTMLButtonElement) => void;
  onTjanst: () => void;
  kanProva: boolean;
  kanSalsatta: boolean;
  onIntent?: (violation: SchemaViolation, on: boolean) => void;
  onOpen: (mal: GranskaMal) => void;
  onToSchedule: () => void;
};

export function GranskaUtkast({ forslag, lessons, kontroll, checking, stale, datum, datedOverrides, intentional, active, disabled = false, actions,
  elevkvalitet, senGrans, onProva, onTjanst, kanProva, kanSalsatta, onIntent, onOpen, onToSchedule }: GranskaProps) {
  const id = useId();
  const [kategori, setKategori] = useState<Kategori | 'alla'>('alla');
  const [tidigareKategori, setTidigareKategori] = useState<Kategori | null>(null);
  const [kvalitetsval, setKvalitetsval] = useState<SchemaKvalitetsval | null>(null);
  const sektion = useRef<HTMLElement>(null);
  const kvalitetRetur = useRef<string | null>(null);
  const atergang = useRef<{ fynd: string; kategori: Kategori; mal: string; top: number; away: boolean } | null>(null);
  const fynd = useMemo(() => active ? granskaFynd({ forslag, lessons, kontroll, datum, datedOverrides, intentional }) : [], [active, forslag, lessons, kontroll, datum, datedOverrides, intentional]);
  const grupper = kategorier.map(g => ({ ...g, fynd: fynd.filter(f => f.kategori === g.id).sort((a, b) => Number(!!a.upplysning) - Number(!!b.upplysning)) }));
  const synliga = grupper.filter(g => (kategori === 'alla' || kategori === g.id) && g.fynd.length);
  const synligtAntal = synliga.reduce((sum, g) => sum + g.fynd.length, 0);
  const viktigast = atgardsordning.find(a => grupper.some(g => g.id === a.id && g.fynd.some(f => !f.upplysning)));
  const aterkoppling = tidigareKategori ? 'Fyndet finns inte längre i listan.' : '';
  const aterkopplingIGrupp = synliga.some(g => g.id === tidigareKategori);
  const passPerId = useMemo(() => new Map(lessons.map(l => [l.id, l])), [lessons]);
  const klassnamn = useMemo(() => new Map(forslag?.classes.map(k => [k.id, k.name])), [forslag]);
  const lararnamn = useMemo(() => new Map(forslag?.teachers.map(l => [l.id, l.name])), [forslag]);
  const salnamn = useMemo(() => new Map(forslag?.rooms.map(s => [s.id, s.name])), [forslag]);
  const andrPerId = useMemo(() => new Map(datedOverrides.map(a => [schemaDatumNyckel(a), a])), [datedOverrides]);

  useLayoutEffect(() => {
    const till = atergang.current;
    const element = sektion.current;
    if (active && kvalitetRetur.current !== null) {
      const knapp = kvalitetRetur.current;
      kvalitetRetur.current = null;
      const fokus = element?.querySelector<HTMLElement>(`[data-kvalitet-pass="${CSS.escape(knapp)}"]:enabled`)
        ?? element?.querySelector<HTMLElement>('[data-kvalitet-retur] select');
      fokus?.focus({ preventScroll: true });
      fokus?.scrollIntoView({ block: 'nearest' });
    }
    if (!till || !element) return;
    if (!active) { till.away = true; return; }
    if (!till.away) return;
    const rad = element.querySelector<HTMLElement>(`[data-granskafynd="${CSS.escape(till.fynd)}"]`);
    const knapp = rad?.querySelector<HTMLButtonElement>(`[data-granskamal="${CSS.escape(till.mal)}"]`);
    const grupp = element.querySelector<HTMLElement>(`[data-granskagrupp="${till.kategori}"]`);
    const listan = element.querySelector<HTMLElement>('[data-granskalista]');
    const ankare = (knapp && !knapp.matches(':disabled') ? knapp : rad) ?? grupp ?? listan ?? element.querySelector<HTMLElement>('h2');
    ankare?.focus({ preventScroll: true });
    if (!rad) setTidigareKategori(till.kategori);
    atergang.current = null;
    if (!knapp || ankare !== knapp) {
      ankare?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      return;
    }
    const aterstallRullning = () => window.scrollBy({ top: knapp.getBoundingClientRect().top - till.top, behavior: 'instant' });
    knapp.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    aterstallRullning();
    // Statusbesked ovanför fynden kan ändra arbetsytans höjd efter att fokus har satts.
    const storlek = new ResizeObserver(aterstallRullning), lyssnare = new AbortController();
    const avsluta = () => { storlek.disconnect(); lyssnare.abort(); };
    storlek.observe(element.parentElement ?? element);
    knapp.addEventListener('blur', avsluta, { signal: lyssnare.signal });
    for (const event of ['wheel', 'pointerdown', 'keydown']) {
      window.addEventListener(event, avsluta, { capture: true, passive: true, signal: lyssnare.signal });
    }
    return avsluta;
  }, [active]);

  const kontrollBesked = stale ? 'Underlaget eller villkoren har ändrats. Kontrollresultaten kan vara inaktuella.'
    : checking ? 'Kontrollerar grundschemat…'
    : !kontroll ? 'Ingen regelkontroll för grundschemat finns ännu.' : '';
  const avkortat = (kontroll ? kontroll.total - kontroll.violations.length : 0) + (datum ? datum.total - datum.violations.length : 0);
  const harOppnaKontroller = Boolean(kontrollBesked || (datedOverrides.length && !datum));

  function maltext(mal: GranskaMal) {
    const pass = passPerId.get(mal.lesson);
    if (!pass) return '';
    const klass = pass.classIds.map(k => klassnamn.get(k)).filter(Boolean).join(', ');
    const larare = pass.teacherIds.map(l => lararnamn.get(l)).filter(Boolean).join(', ');
    const andring = andrPerId.get(malNyckel(mal));
    const start = andring?.startMin ?? pass.startMin;
    const dag = andring?.date ?? mal.originalDate ?? (pass.day !== null ? dayName(pass.day) : 'Utan tid');
    const rum = andring ? andring.room : pass.roomId;
    return [klass || larare, `${dag}${start === null ? '' : ` ${clock(start)}`}`, rum && salnamn.get(rum), !mal.originalDate && pass.term && PERIOD[pass.term]].filter(Boolean).join(' · ');
  }

  return <section ref={sektion} aria-labelledby={`${id}-rubrik`} hidden={!active}>
    {active && <div className="space-y-4">
      <output className="sr-only">{aterkoppling}</output>
      <header className="rounded-lg border border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id={`${id}-rubrik`} tabIndex={-1} className="text-lg font-semibold tracking-tight">Granska utkastet</h2>
            {forslag && <p className="text-sm text-muted-foreground">{PERIOD[forslag.period]}</p>}
          </div>
          {forslag && <Button type="button" variant="outline" onClick={onToSchedule}>Öppna Lägg schema<ArrowRight aria-hidden="true"/></Button>}
        </div>
        {lessons.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Tid, sal och kapacitet"><Lagesstatus lessons={lessons}/></div>}
      </header>
      {!forslag ? <div className="empty-state rounded-lg border border-border bg-card">
        <ClipboardCheck aria-hidden="true"/><h2>Inget schemaförslag att granska</h2><p>Ta fram ett schemaförslag för att se vad som återstår.</p>
        <Button type="button" className="mt-4" onClick={onToSchedule}>Gå till Lägg schema</Button>
      </div> : <>
        {harOppnaKontroller && <output className="block rounded-lg border border-border bg-card px-5 py-3 text-sm text-muted-foreground">
          {kontrollBesked && <span className="block">{kontrollBesked}</span>}
          {datedOverrides.length > 0 && !datum && <span className="block">Kontrollresultat för datumändringarna saknas. Tillfällena visas i listan.</span>}
        </output>}
        {!stale && viktigast && <section className="rounded-lg border border-border bg-card px-5 py-4 space-y-2" aria-labelledby={`${id}-atgard`}>
          <h3 className="section-heading" id={`${id}-atgard`}>Börja här</h3>
          <p>{viktigast.id === 'sal' && kanSalsatta ? 'Förhandsgranska salar för tidsatta pass som saknar en tillåten sal.' : viktigast.text}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => {
              setKategori(viktigast.id); setTidigareKategori(null);
              const rubrik = sektion.current?.querySelector<HTMLElement>('[data-granskalista]');
              rubrik?.focus({ preventScroll: true }); rubrik?.scrollIntoView({ block: 'center' });
            }}>{viktigast.knapp}</Button>
            {viktigast.id === 'larare' && <Button type="button" variant="outline" onClick={onTjanst}>Öppna tjänstefördelningen</Button>}
            {viktigast.id === 'sal' && kanSalsatta && <Button type="button" variant="outline" onClick={() => {
              const panel = sektion.current?.querySelector<HTMLElement>('[data-salsattning]');
              panel?.focus({ preventScroll: true }); panel?.scrollIntoView({ block: 'start' });
            }}>Till salsättningen</Button>}
          </div>
        </section>}
        {lessons.length > 0 && <div data-kvalitet-retur>
          <Schemakvalitet forslag={forslag} rader={elevkvalitet} val={kvalitetsval} senGrans={senGrans} onVal={setKvalitetsval}
            disabled={checking || disabled} kanProva={kanProva} stale={stale} checking={checking}
            onOpen={(lesson, term, knapp) => { kvalitetRetur.current = knapp.dataset.kvalitetPass ?? ''; onOpen({ lesson, term }); }} onProva={onProva}/>
        </div>}
        {actions}
        <div className="rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
            <div className="space-y-1">
              <h3 className="text-base font-semibold" tabIndex={-1} data-granskalista>Fynd och ändringar</h3>
              <output className="block text-sm text-muted-foreground">{fynd.length > 0 && (kategori === 'alla' ? `${fynd.length} i listan` : `${synligtAntal} av ${fynd.length} i listan`)}</output>
              {!aterkopplingIGrupp && aterkoppling && <p className="text-sm text-muted-foreground">{aterkoppling}</p>}
            </div>
            <div className="grid w-52 max-w-full gap-1.5">
              <label htmlFor={`${id}-filter`} className="text-foreground">Visa fynd</label>
              <select id={`${id}-filter`} value={kategori} onChange={e => { setKategori(e.target.value as Kategori | 'alla'); setTidigareKategori(null); }}>
                <option value="alla">Alla områden</option>
                {grupper.map(g => <option key={g.id} value={g.id}>{g.label} ({g.fynd.length})</option>)}
              </select>
            </div>
          </div>
          {avkortat > 0 && <p className="px-5 pt-4 text-sm text-muted-foreground">Kontrollerna hittade ytterligare {avkortat} regelavvikelser som inte visas i listan.</p>}
          {synliga.length === 0 && <div className="px-5 py-7 text-sm text-muted-foreground">
            {kategori !== 'alla' ? 'Det finns inga fynd att visa för det valda området.'
              : lessons.length === 0 ? 'Schemaförslaget innehåller inga pass.'
              : harOppnaKontroller || avkortat ? 'Inga fynd att visa från de resultat som finns tillgängliga.' : 'De aktuella kontrollerna visar inga fynd eller datumändringar.'}
          </div>}
          {synliga.map(g => <section key={g.id} aria-labelledby={`${id}-${g.id}`}>
            <h4 id={`${id}-${g.id}`} data-granskagrupp={g.id} tabIndex={-1} className="border-y border-border bg-muted/40 px-5 py-2.5 text-sm font-semibold first:border-t-0">{g.label} <span className="ml-1 font-normal tabular-nums text-muted-foreground">{g.fynd.length}</span></h4>
            {tidigareKategori === g.id && <p className="border-b border-border px-5 py-3 text-sm text-muted-foreground">{aterkoppling}</p>}
            <ul className="divide-y divide-border">
              {g.fynd.map((f, i) => {
                const mal = f.mal.filter(m => passPerId.has(m.lesson));
                const konfliktId = `${id}-krock-${i}`, konflikt = f.konflikt;
                return <li key={f.key} data-granskafynd={f.key} tabIndex={-1} className="flex flex-wrap items-start justify-between gap-4 px-5 py-3 focus-visible:bg-muted/40">
                  <div className="min-w-0 flex-1 basis-64 space-y-1">
                    <p className="font-medium">{f.titel}</p>
                    <p className="text-sm text-muted-foreground">{f.besked}</p>
                    {f.medveten && <span className="status-badge warning">Medveten krock · regelavvikelse kvar</span>}
                    {onIntent && konflikt && <div className="flex min-h-11 w-fit items-center gap-2">
                      <Checkbox id={konfliktId} checked={!!f.medveten} disabled={checking || stale} onCheckedChange={on => onIntent(konflikt, on === true)}/>
                      <label htmlFor={konfliktId}>Behåll som medveten krock</label>
                    </div>}
                  </div>
                  {mal.length > 0 && <ul className="grid min-w-0 max-w-full gap-1">
                    {mal.map((m, j) => {
                      const malId = `${id}-${g.id}-${i}-${j}`, title = passPerId.get(m.lesson)?.title;
                      return <li key={malNyckel(m)} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0 flex-1 text-sm" id={malId}>
                          <p className={title === f.titel ? 'sr-only' : 'font-medium'}>{title}</p>
                          <p className="text-muted-foreground">{maltext(m)}</p>
                        </div>
                        <Button type="button" variant="outline" aria-describedby={malId} disabled={disabled} data-granskamal={malNyckel(m)} onClick={e => {
                          atergang.current = { fynd: f.key, kategori: g.id, mal: malNyckel(m), top: e.currentTarget.getBoundingClientRect().top, away: false };
                          setTidigareKategori(null);
                          onOpen(m.originalDate ? { lesson: m.lesson, originalDate: m.originalDate } : { lesson: m.lesson });
                        }}>{m.originalDate ? 'Visa tillfället' : 'Visa passet'}<ArrowRight aria-hidden="true"/></Button>
                      </li>;
                    })}
                  </ul>}
                </li>;
              })}
            </ul>
          </section>)}
        </div>
      </>}
    </div>}
  </section>;
}
