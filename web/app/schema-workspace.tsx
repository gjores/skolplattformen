'use client';
// Arbetsytan i Schema. Sätter ihop modulerna under ./schema/ och äger hämtning av förslag och kontroll av ändringar (05.2-SM-YTA).
// Var passen ligger för hand hålls i utkastet (lib/schema-utkast.ts) med ångra och gör om i flera steg; en ändring görs först när kontrollen har svarat.
import { useEffect, useId, useMemo, useReducer, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, sammaGrund, villkorNyckel, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest,
  SchemaContractError, type SchemaKontroll, type SchemaKontrollRequest, type SchemaPeriod, type SchemaRegel, type SchemaStatus, type SchemaTerm, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { SCHEMA_DEFAULTS } from '@/lib/schema-underlag.ts';
import { aktivitetsSteg, avvikelseRad, medUtkast, resursRefs, schemaUtkast, tomtUtkast, utkastEfter, utkastSteg, utkastLas, bytSalar, villkorSteg, type SchemaOverlay, type SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { fastAktivitet, lastAktivitetAndras, type SchemaAktivitet } from '@/lib/schema-aktiviteter.ts';
import { schemaLager, type SchemaKalla } from '@/lib/schema-lager.ts';
import { DAYS, PERIOD, TERM, clock, names, ruleText, startTimes } from './schema/delat.ts';
import { FaltKalla, Lagerval, rememberLager, storedLager, visaVillkor } from './schema/lager.tsx';
import { Vecka, Teckenforklaring, veckansSpann } from './schema/vecka.tsx';
import { VeckaVal } from './schema/vecka-val.tsx';
import { grundschemaVal, schemaVeckaVal, type SchemaVeckaVal } from '@/lib/schema-vecka.ts';
import { Viloyta } from './schema/viloyta.tsx';
import { Villkor, rememberVillkor, storedVillkor } from './schema/villkor.tsx';
import { Tid, tidAvvikelser } from './schema/tid.tsx';
import { Forklaring, Regelavvikelser } from './schema/avvikelser.tsx';
import { Flyttpanel, type FlyttMal } from './schema/flytt.tsx';
import { Underlag } from './schema/underlag.tsx';
import { dra, type Mal } from './schema/dra.ts';
import { useSchemaBytLagen } from './schema/byt-lagen.ts';
import { parseSchemaDiagnos, type SchemaDiagnosFynd, type SchemaDiagnosAction, type SchemaDiagnosResurs } from '@/lib/schema-diagnos.ts';
import { ForeBerakning, SvarastAttLagga } from './schema/diagnos.tsx';
import { FonsterList, FonsterMeny, useSchemaSynk } from './schema/fonster.tsx';
import { ResursFonster } from './schema/resurs-fonster.tsx';
import { fonsterVyNamn, type SchemaFonsterTarget } from '@/lib/schema-synk.ts';
import { useSchemaMeny } from './schema/meny.tsx';
import { Folj } from './schema/folj.tsx';
import { Samling, type SamlingStart } from './schema/samling.tsx';
import { Aktiviteter } from './schema/aktiviteter.tsx';
import type { NyAktivitetsTid } from './schema/aktivitet-form.tsx';
import { Villkorstabell, villkorstabellMal, type VillkorstabellMal } from './schema/villkorstabell.tsx';
import { Vyval, rememberVy, storedVy, visadVy, type SchemaVy } from './schema/vyval.tsx';
import { Passtabell, tomtTabellVal, type PassTabellVal } from './schema/passtabell.tsx';
import './valplaner.css';
import './schema.css';

const STATUS: Record<SchemaStatus, { text: string; tone: 'success' | 'warning' }> = {
  complete: { text: 'Alla pass lagda', tone: 'success' },
  time_limit: { text: 'Räknetiden tog slut', tone: 'warning' },
  infeasible: { text: 'Går inte att lägga', tone: 'warning' },
  input_missing: { text: 'Underlag saknas', tone: 'warning' },
  cancelled: { text: 'Avbruten', tone: 'warning' },
};
const BASIS: Record<string, string> = { draft: 'utkast', published: 'publicerad', superseded: 'ersatt' };
const REASON: Record<string, string> = {
  schema_engine_unconfigured: 'Schemamotorn är inte ansluten i den här miljön. Inget förslag kan tas fram.',
  schema_engine_unreachable: 'Schemamotorn svarar inte. Försök igen om en stund.',
  schema_engine_busy: 'Schemamotorn räknar redan på andra förslag. Försök igen om en stund.',
  schema_engine_bad_reply: 'Schemamotorns svar kunde inte kontrolleras. Inget förslag visas.',
};
function message(error: unknown): string {
  if (error instanceof SchemaContractError) return 'Schemamotorns svar kunde inte kontrolleras. Läs om sidan och försök igen.';
  if (error instanceof ApiError) {
    if (error.reason && REASON[error.reason]) return REASON[error.reason];
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Schemaförslaget kunde inte tas fram. Försök igen.';
}
function moveMessage(error: unknown, text = 'Flytten'): string {
  if (text === 'Aktiviteten') {
    if (error instanceof ApiError) {
      if (error.reason === 'schema_underlag_changed' || error.code === 'schema_underlag_changed') return 'Underlaget har ändrats. Ta fram ett nytt förslag innan du ändrar aktiviteter.';
      if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
      if (error.status === 503) return 'Schemamotorn kunde inte pröva aktiviteten. Försök igen om en stund.';
    }
    return 'Aktiviteten kunde inte kontrolleras. Försök igen.';
  }
  if (error instanceof ApiError) {
    if (text !== 'Flytten') {
      if (error.reason && REASON[error.reason]) return 'Schemamotorn kunde inte pröva villkoren. Försök igen om en stund.';
      if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
      return 'Villkoren kunde inte prövas mot schemat.';
    }
    if (error.reason === 'schema_underlag_changed') return 'Underlaget har ändrats sedan förslaget togs fram. Passet står kvar. Ta fram ett nytt schemaförslag för att fortsätta.';
    if (error.reason && REASON[error.reason]) return 'Schemamotorn kunde inte kontrollera flytten. Passet står kvar. Försök igen om en stund.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return text === 'Flytten' ? 'Flytten kunde inte kontrolleras. Passet står kvar.' : 'Villkoren kunde inte prövas mot schemat.';
}
const CALENDAR: Record<string, string> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void; fonster?: SchemaFonsterTarget };
type FlyttAtgard = Extract<SchemaUtkastAtgard, { type: 'move' | 'park' | 'swap' | 'lock' | 'undo' | 'redo' }>;
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, scopeKey, onSessionLost, fonster }: Props & { unitId: string }) {
  const resultHeading = useId();
  const [period, setPeriod] = useState<SchemaPeriod>('lasar'), [villkor, setVillkorLocal] = useState(() => storedVillkor(unitId) ?? defaultSchemaVillkor()), [shownTerm, setShownTerm] = useState<SchemaTerm>('ht');
  const [visning, setVisning] = useState<SchemaVeckaVal>(grundschemaVal);
  const issues = checkSchemaVillkor(villkor);
  // Förslaget som motorn räknade fram; tid och mått uppdateras efter varje kontroll. Var passen ligger står i utkastet.
  const [fore, setFore] = useState<{ key: string; findings: SchemaDiagnosFynd[] } | null>(null);
  const [berakningssteg, setBerakningssteg] = useState<'diagnos' | 'solve'>('diagnos');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [base, setBase] = useState<SchemaForslag | null>(null);
  // Lagren i veckan (05.2-SM-VILLKOR-SYNS) ligger i utkastet och minns i webbläsaren.
  const [utkast, dispatchLocal] = useReducer(schemaUtkast, undefined, () => ({ ...tomtUtkast(), layers: storedLager() }));
  // Ett eget villkor som togs bort från ett fält i veckan, så att det kan ångras.
  const [borttaget, setBorttaget] = useState<{ rule: SchemaRegel; index: number } | null>(null), angraVillkor = useRef<HTMLButtonElement | null>(null), aterFalt = useRef<string | null>(null);
  const forslag = useMemo(() => base && { ...base, lessons: medUtkast(base.lessons, utkast.placements, utkast.locked) }, [base, utkast.placements, utkast.locked]);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  const [wantedResource, setWantedResource] = useState(fonster?.resource), [resourceMissing, setResourceMissing] = useState(false);
  // Flytt för hand (05.2-SM-FLYTT): en flytt görs först när motorns kontrollant har svarat, och inget sparas.
  const picked = utkast.picked, [target, setTarget] = useState<FlyttMal>({ day: 0, startMin: 0, room: null });
  // Dra och släpp (D1): passet som dras och var det hamnar om det släpps.
  const [drop, setDrop] = useState<{ lesson: string; to: Mal | null } | null>(null);
  // Kontrollens svar och villkoren det gäller (05.2-SM-VILLKOR-DIREKT): ett svar för andra villkor än de som prövas nu visas inte.
  const [kontrollSvar, setKontroll] = useState<{ svar: SchemaKontroll; villkor: string } | null>(null), [checking, setChecking] = useState(false);
  // Tidsvillkor som servern ändå svarade 409 för (de ändrar vilka pass som finns), och villkor vars prövning misslyckades: prövas inte igen av sig själva.
  const [kraverNytt, setKraverNytt] = useState<string | null>(null), [misslyckat, setMisslyckat] = useState<string | null>(null);
  // Villkoren som kontroll, möjliga starttider och Följ passet prövar (05.2-SM-VILLKOR-DIREKT): nuvarande villkor när grunden är förslagets och villkoren
  // går att använda, annars förslagets. Ett ändrat tidsvillkor prövas alltså direkt; en ändrad grund kräver ett nytt förslag.
  const villkorKey = villkorNyckel(villkor), forslagetsKey = base ? villkorNyckel(base.villkor) : villkorKey;
  const grundAndrad = base !== null && (!sammaGrund(villkor, base.villkor) || kraverNytt === villkorKey);
  const provade = !base || grundAndrad || issues.length ? base?.villkor ?? villkor : villkor, provadeKey = villkorNyckel(provade);
  const kontroll = kontrollSvar && kontrollSvar.villkor === provadeKey ? kontrollSvar.svar : null;
  const [moveError, setMoveError] = useState<string | null>(null), [moved, setMoved] = useState('');
  // Följ passet (05.2-SM-FOLJ): passet panelen visar, och om panelen är låst till det i stället för att följa markeringen.
  // Villkor i tabell (05.2-SM-VILLKORSTABELL) är en vy i vyväljaren; `villkorMal` är raden som "Ändra" på ett fält i veckan öppnar.
  const [villkorMal, setVillkorMal] = useState<VillkorstabellMal | null>(null);
  const [folj, setFolj] = useState<{ lesson: string; locked: boolean } | null>(null), foljRubrik = useRef<HTMLHeadingElement | null>(null), foljFokus = useRef(false);
  // Vyväljaren (05.2-SM-PASSTABELL): veckan och tabellerna visar samma utkast. Tabellens filter och sortering står kvar när man byter vy.
  const [vy, setVy] = useState<SchemaVy>(() => fonster && ['folj', 'samling', 'pass', 'villkor'].includes(fonster.view) ? fonster.view as SchemaVy : fonster ? 'vecka' : storedVy()), [tabellVal, setTabellVal] = useState<PassTabellVal>(tomtTabellVal);
  const [samlingStart, setSamlingStart] = useState<SamlingStart | null>(null), foljFran = useRef<SchemaVy>('vecka');
  const [aktivitetsStart, setAktivitetsStart] = useState<NyAktivitetsTid | null>(null);
  const andraFalt = (k: SchemaKalla) => { const m = villkorstabellMal(k, villkor); if (m) { setVillkorMal({ ...m, nr: Date.now() }); setVy('villkor'); rememberVy('villkor'); } else visaVillkor(k); };
  const tabell = useRef<HTMLDivElement | null>(null), visaFokus = useRef<string | null>(null);
  const resursvy = useRef<HTMLDivElement | null>(null);
  const running = useRef<AbortController | null>(null), week = useRef<HTMLDivElement | null>(null), focus = useRef<string | null>(null), dayField = useRef<HTMLSelectElement | null>(null), rest = useRef<HTMLDivElement | null>(null), skipClick = useRef(false);
  /** Passet att lägga fokus på: knappen i veckan, eller radens aktiva cell i passtabellen. */
  const passElement = (id: string): HTMLElement | null => {
    const rad = tabell.current?.querySelector<HTMLElement>(`tr[data-lesson="${id}"]`);
    return week.current?.querySelector<HTMLElement>(`[data-lesson="${id}"]`) ?? rad?.querySelector<HTMLElement>('[tabindex="0"]') ?? rad?.querySelector<HTMLElement>('[data-col="1"]')
      ?? resursvy.current?.querySelector<HTMLElement>(`[data-schema-pass="${id}"]`) ?? null;
  };

  // Huvudfönstret äger reducer, nätanrop och ångring. Elevlistor och lokala resursval ingår inte i det delade tillståndet.
  type Delat = { base: typeof base; utkast: typeof utkast; villkor: typeof villkor; kontrollSvar: typeof kontrollSvar; period: SchemaPeriod;
    busy: boolean; checking: boolean; error: typeof error; moveError: typeof moveError; moved: string; kraverNytt: typeof kraverNytt; misslyckat: typeof misslyckat; fore: typeof fore };
  type SynkAtgard = { typ: 'utkast'; action: SchemaUtkastAtgard } | { typ: 'andra'; action: FlyttAtgard } | { typ: 'villkor'; value: SchemaVillkor }
    | { typ: 'run'; continueAnyway: boolean } | { typ: 'pick'; id: string };
  const synk = useSchemaSynk<Delat, SynkAtgard>({ unitId, schoolYear, scopeKey, fonster,
    state: { base, utkast, villkor, kontrollSvar, period, busy, checking, error, moveError, moved, kraverNytt, misslyckat, fore },
    blocked: busy || checking,
    onState: state => {
      if (state.base && (state.base.unitId !== unitId || state.base.schoolYear !== schoolYear)) return;
      if (state.base && wantedResource) {
        const match = [...resursRefs(state.base)].find(([, ref]) => `${ref.slag}:${ref.ref}` === wantedResource);
        setResourceMissing(!match);
        if (match) { setBy(match[1].slag === 'larare' ? 'teacher' : 'class'); setChosen(match[0]); }
      }
      setBase(state.base); dispatchLocal({ type: 'hydrate', state: state.utkast }); setVillkorLocal(state.villkor); setKontroll(state.kontrollSvar);
      setPeriod(state.period); setBusy(state.busy); setChecking(state.checking); setError(state.error); setMoveError(state.moveError); setMoved(state.moved);
      setKraverNytt(state.kraverNytt); setMisslyckat(state.misslyckat); setFore(state.fore);
      if (fonster?.view === 'folj' && state.utkast.picked) setFolj(f => f?.locked ? f : { lesson: state.utkast.picked!, locked: false });
      if (fonster && state.base && state.utkast.picked && state.utkast.picked !== picked) {
        const lesson = medUtkast(state.base.lessons, state.utkast.placements).find(l => l.id === state.utkast.picked);
        if (lesson) { const day = lesson.day ?? 0, starts = startTimes(state.base, day, lesson.durationMin + lesson.marginMin, lesson.marginBeforeMin);
          setTarget({ day, startMin: lesson.startMin ?? starts[0] ?? state.base.days[day].startMin, room: lesson.roomId }); }
      }
    },
    onAction: action => {
      if (running.current) return;
      if (action.typ === 'utkast') {
        const change = action.action;
        if (['pick', 'select', 'tool', 'layer', 'villkor'].includes(change.type) ||
          (change.type === 'undo' || change.type === 'redo') && villkorSteg(utkast[change.type].at(-1))) dispatchLocal(change);
      }
      else if (action.typ === 'villkor') setVillkorLocal(action.value);
      else if (action.typ === 'andra') void andra(action.action);
      else if (action.typ === 'run') void run(action.continueAnyway);
      else if (action.typ === 'pick') { const lesson = forslag?.lessons.find(l => l.id === action.id); if (lesson) pick(lesson); }
    } });
  function dispatch(action: SchemaUtkastAtgard) { if (fonster) { synk.send({ typ: 'utkast', action }); return; } dispatchLocal(action); }
  function setVillkor(value: SchemaVillkor) { if (fonster) { synk.send({ typ: 'villkor', value }); return; } setVillkorLocal(value); }

  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => { if (picked && !visaFokus.current) dayField.current?.focus(); }, [picked]);
  // Visa i veckan (05.2-SM-PASSTABELL): när veckan är ritad får passet fokus och rullas fram.
  useEffect(() => {
    const el = visaFokus.current ? week.current?.querySelector<HTMLElement>(`[data-lesson="${visaFokus.current}"]`) : null;
    if (!el) return;
    visaFokus.current = null; el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'center' });
  });
  useEffect(() => { if (folj && foljFokus.current) { foljFokus.current = false; foljRubrik.current?.focus(); } }, [folj]);
  // Efter Ta bort står fokus på Ångra; efter Ångra på fältet igen.
  useEffect(() => {
    if (borttaget) { angraVillkor.current?.focus(); return; }
    if (aterFalt.current) week.current?.querySelector<HTMLElement>(`[data-source="${aterFalt.current}"] button`)?.focus();
    aterFalt.current = null;
  }, [borttaget]);
  // Efter flytt eller avbrott går fokus tillbaka till passet, så att tangentbordet inte tappar sin plats.
  useEffect(() => {
    if (!focus.current || picked) return;
    passElement(focus.current)?.focus();
    focus.current = null;
  }, [picked, forslag]);

  async function run(continueAnyway = false) {
    if (fonster) { synk.send({ typ: 'run', continueAnyway }); return; }
    if (busy || issues.length || running.current) return;
    const locks = utkastLas(utkast);
    if (locks.length && base && (period !== base.period || !sammaGrund(villkor, base.villkor))) {
      setError('Låsen hör till det tidigare underlaget. Lås upp passen innan du ändrar perioden eller passens uppdelning.'); return;
    }
    const request: SchemaForslagRequest = { unitId, schoolYear, period, villkor, ...(base && locks.length ? { locks: { grundFingerprint: base.grundFingerprint, placements: locks } } : {}) }, controller = new AbortController();
    running.current = controller;
    setBusy(true); setError(null);
    try {
      const key = JSON.stringify(request);
      if (!continueAnyway || fore?.key !== key) {
        setBerakningssteg('diagnos');
        const findings = parseSchemaDiagnos(await api.post<unknown>('/api/schema/diagnos', request, controller.signal));
        if (controller.signal.aborted) return;
        setFore({ key, findings });
        if (findings.length) return;
      }
      setBerakningssteg('solve');
      const next = parseSchemaForslag(await api.post<unknown>('/api/schema/forslag', request, controller.signal), request);
      rememberVillkor(unitId, villkor);
      setBase(next); dispatch({ type: 'reset', forslag: next }); setFolj(null); setShownTerm('ht'); setBy('class'); setChosen(next.classes[0]?.id ?? '');
      setVisning(grundschemaVal());
      setKontroll(null); setKraverNytt(null); setMisslyckat(null); setMoveError(null); setMoved('');
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { if (running.current === controller) { running.current = null; setBusy(false); } }
  }

  function pick(l: SchemaForslagLesson) {
    if (fonster) { synk.send({ typ: 'pick', id: l.id }); return; }
    if (!forslag || checking) return;
    if (skipClick.current) return;
    if (fastAktivitet(l, provade)) { setMoveError('Aktiviteten har fast tid. Ändra eller ta bort den i aktivitetslistan.'); return; }
    const day = l.day ?? 0, starts = startTimes(forslag, day, l.durationMin + l.marginMin, l.marginBeforeMin);
    setTarget({ day, startMin: l.startMin !== null && starts.includes(l.startMin) ? l.startMin : starts[0] ?? forslag.days[day].startMin, room: l.roomId });
    dispatch({ type: 'pick', lesson: l.id }); setMoveError(null);
    // Följ passet följer markeringen tills panelen låses.
    setFolj(f => f && !f.locked ? { ...f, lesson: l.id } : f);
  }
  /**
   * Flyttar ett pass, lägger det på viloytan, ångrar eller gör om. Passet behåller sin sal om ingen annan anges; utan sal väljer servern en ledig.
   * Hela schemat kontrolleras om med placeringarna ändringen ger, och utkastet ändras först när kontrollen har svarat.
   */
  async function andra(action: FlyttAtgard) {
    if (fonster) { synk.send({ typ: 'andra', action }); return; }
    if (checking || busy || running.current) return;
    if (action.type === 'lock') {
      dispatch(action); setMoveError(null); setMoved(action.locked ? 'Passens tider är låsta inför nästa beräkning.' : 'Passens lås är borttagna.'); return;
    }
    if ((action.type === 'move' || action.type === 'park' || action.type === 'swap') && forslag?.lessons.some(l =>
      (l.id === action.lesson || (action.type === 'swap' ? l.id === action.other : action.fler?.includes(l.id))) && fastAktivitet(l, provade))) {
      setMoveError('Aktiviteten har fast tid. Ändra eller ta bort den i aktivitetslistan.'); return;
    }
    if (action.type === 'undo' || action.type === 'redo') {
      const step = utkast[action.type].at(-1);
      if (aktivitetsSteg(step)) {
        if (!base || checking || busy) return;
        const snapshot = action.type === 'undo' ? step.aktiviteter.fore : step.aktiviteter.efter;
        // Ett senare val i det vanliga villkorsformuläret hör inte till aktivitetssteget.
        const restoredVillkor = { ...villkor, aktiviteter: snapshot.villkor.aktiviteter ?? [] };
        if (!sammaGrund(restoredVillkor, snapshot.villkor) || checkSchemaVillkor(restoredVillkor).length > 0) {
          setMoveError('Villkoren för passens uppdelning har ändrats eller innehåller fel. Återställ dem för att kunna ångra eller göra om aktivitetsändringen.'); return;
        }
        const controller = new AbortController();
        running.current = controller; setChecking(true); setMoveError(null);
        try {
          const reply = await kontrollera(snapshot.forslag, snapshot.forslag.lessons, controller, restoredVillkor);
          if (controller.signal.aborted) return;
          setBase({ ...snapshot.forslag, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
          setVillkor(restoredVillkor); dispatch({ ...action, rooms: reply.rooms }); setFolj(null);
          setKontroll({ svar: reply, villkor: villkorNyckel(restoredVillkor) }); setKraverNytt(null); setMisslyckat(null);
          setMoved(`${action.type === 'undo' ? 'Ångrat' : 'Gjort om'}: ${step.text}.`);
        } catch (caught) {
          if (controller.signal.aborted) return;
          if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
          setMoveError(moveMessage(caught));
        } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
        return;
      }
    }
    const next = utkastEfter(utkast, action), lessonId = action.type === 'undo' || action.type === 'redo' ? utkastSteg(utkast, action.type) : action.lesson;
    const before = base?.lessons.find(l => l.id === lessonId);
    if (!next && (action.type === 'move' || action.type === 'park' || action.type === 'swap')) { setMoveError('Ändringen kan inte göras. Lås upp berörda pass och välj tider inom veckan.'); return; }
    if (!base || !next || !before || checking || busy) return;
    const kontrollerade = action.type === 'swap' ? bytSalar(base, next, [action.lesson, action.other]) : next;
    const lessons = medUtkast(base.lessons, kontrollerade), controller = new AbortController(), key = provadeKey;
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = await kontrollera(base, lessons, controller);
      setBase({ ...base, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
      dispatch({ ...action, rooms: reply.rooms });
      focus.current = before.id; setKontroll({ svar: reply, villkor: key });
      const { day, startMin } = next[before.id], fler = action.type === 'park' ? action.fler?.length ?? 0 : 0;
      setMoved(action.type === 'swap' ? `Passen har bytt dag och starttid. ${reply.total ? `${reply.total} regelavvikelser.` : 'Inga regelavvikelser.'}` : `${fler ? `${fler + 1} pass ligger nu på viloytan` : `${before.title} ${day === null || startMin === null ? 'ligger nu på viloytan' : `ligger nu ${DAYS[day].toLowerCase()} ${clock(startMin)}`}`}. ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (kraver(caught)) return;
      setMoveError(moveMessage(caught));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** Kontrollen av placeringarna med villkoren som prövas och förslagets grund. */
  async function kontrollera(f: SchemaForslag, lessons: SchemaForslagLesson[], controller: AbortController, villkoren = provade): Promise<SchemaKontroll> {
    const request: SchemaKontrollRequest = { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: f.period, villkor: villkoren, grundFingerprint: f.grundFingerprint,
      ...(utkastLas(utkast).length ? { locks: { grundFingerprint: f.grundFingerprint, placements: utkastLas(utkast) } } : {}),
      placements: lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) };
    return parseSchemaKontroll(await api.post<unknown>('/api/schema/kontroll', request, controller.signal), f.grundFingerprint);
  }
  /** Aktiviteter ändrar bara utkastet; servern bevarar befintliga undervisningspass och prövar samtliga placeringar. */
  async function andraAktiviteter(aktiviteter: SchemaAktivitet[], text: string): Promise<boolean> {
    if (fonster || !base || !forslag || checking || busy || running.current) return false;
    if (grundAndrad || issues.length) { setMoveError('Ta fram ett nytt förslag med de ändrade villkoren innan du ändrar aktiviteter.'); return false; }
    if (lastAktivitetAndras(villkor.aktiviteter ?? [], aktiviteter, Object.keys(utkast.locked))) {
      setMoveError('Lås upp aktiviteten innan du ändrar eller tar bort den.'); return false;
    }
    const nextVillkor = { ...villkor, aktiviteter }, controller = new AbortController();
    running.current = controller; setChecking(true); setMoveError(null); setMoved('');
    try {
      const raw = await api.post<unknown>('/api/schema/aktiviteter', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period: base.period,
        villkor: nextVillkor, previousVillkor: villkor, grundFingerprint: base.grundFingerprint, placements: placeringar }, controller.signal);
      if (controller.signal.aborted) return false;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 2 || !('forslag' in raw) || !('kontroll' in raw)) throw new SchemaContractError();
      const next = parseSchemaForslag(raw.forslag, { unitId, schoolYear, period: base.period, villkor: nextVillkor });
      const checked = parseSchemaKontroll(raw.kontroll, next.grundFingerprint);
      dispatch({ type: 'aktiviteter', fore: { forslag, villkor }, efter: { forslag: next, villkor: nextVillkor }, text });
      setBase(next); setVillkor(nextVillkor); setKontroll({ svar: checked, villkor: villkorNyckel(nextVillkor) });
      setKraverNytt(null); setMisslyckat(null); setFolj(null);
      setMoved(`${text}. ${checked.total === 0 ? 'Inga regelavvikelser.' : `${checked.total} regelavvikelser.`}`);
      return true;
    } catch (caught) {
      if (controller.signal.aborted) return false;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return false; }
      setMoveError(moveMessage(caught, 'Aktiviteten')); return false;
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** 409 för ändrade tidsvillkor: de ändrar ändå vilka pass som finns, så kontrollen går tillbaka till förslagets villkor tills ett nytt förslag tas fram. */
  function kraver(caught: unknown): boolean {
    if (!(caught instanceof ApiError && caught.reason === 'schema_underlag_changed') || !base || provadeKey === forslagetsKey) return false;
    setKraverNytt(villkorKey); setMoveError(null);
    return true;
  }
  /**
   * Ändrade villkor (en ny spärr, ångra och gör om av ett villkor, en ändring i formuläret) prövas direkt: kontrollen körs om med nuvarande placeringar
   * och de villkor som prövas. Inget pass flyttas; salarna följer kontrollens val.
   */
  async function provaVillkor() {
    if (!base || checking || busy) return;
    const controller = new AbortController(), key = provadeKey;
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = await kontrollera(base, medUtkast(base.lessons, utkast.placements), controller);
      setBase({ ...base, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
      dispatch({ type: 'salar', rooms: reply.rooms }); setKontroll({ svar: reply, villkor: key });
      setMoved(`Villkoren är prövade mot schemat. ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (kraver(caught)) return;
      setMisslyckat(key); setMoveError(moveMessage(caught, 'Villkoren'));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  // Kontrollen gäller förslagets villkor tills den har körts om; körs om en stund efter att villkoren som prövas har ändrats (formuläret ändras tecken för tecken).
  const provat = kontrollSvar?.villkor ?? forslagetsKey;
  useEffect(() => {
    if (fonster || !base || checking || busy || provat === provadeKey || misslyckat === provadeKey) return;
    const timer = setTimeout(() => void provaVillkor(), 300);
    return () => clearTimeout(timer);
  });
  const span = forslag ? veckansSpann(forslag.days) : { start: 0, end: 0 };
  function grab(e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) {
    if (!forslag || checking || busy) return;
    if (fastAktivitet(l, provade) || utkast.locked[l.id] || utkast.tool === 'las' || e.shiftKey) return;
    dra(e, l, { forslag, grid: week.current, rest: rest.current, start: span.start, end: span.end, skipClick,
      onHover: to => setDrop({ lesson: l.id, to }), onEnd: () => setDrop(null),
      onDrop: to => {
        if (utkast.tool === 'byt') { if (to.other) void andra({ type: 'swap', lesson: l.id, other: to.other }); else setMoveError('Släpp på det pass som ska byta plats.'); return; }
        const fler = utkast.selected.includes(l.id) ? utkast.selected.filter(id => id !== l.id) : [];
        void andra(to.day === null || to.startMin === null ? { type: 'park', lesson: l.id, fler } : { type: 'move', lesson: l.id, day: to.day, startMin: to.startMin, fler });
      } });
  }
  /** Öppnar Följ passet för ett pass (knappen vid markerat pass, dubbelklick, tangenten F). Låst panel låses till det nya passet. */
  function foljPass(id: string) {
    const lesson = forslag?.lessons.find(l => l.id === id);
    if (!lesson) return;
    if (fastAktivitet(lesson, provade)) dispatch({ type: 'pick', lesson: id });
    else pick(lesson);
    if (vy !== 'folj') foljFran.current = vy;
    setVy('folj');
    foljFokus.current = true; setFolj(f => ({ lesson: id, locked: f?.locked ?? false }));
  }
  const foljHandelser = {
    onDoubleClick: (e: { target: EventTarget }) => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson; if (id) foljPass(id); },
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      const id = (e.target as HTMLElement).closest<HTMLElement>('[data-lesson]')?.dataset.lesson;
      if (id) { e.preventDefault(); foljPass(id); }
    },
  };
  const steps = utkast.undo.filter(x => !villkorSteg(x) && !aktivitetsSteg(x)).length, pickedLesson = forslag?.lessons.find(l => l.id === picked) ?? null;
  const flagged = new Set(kontroll?.violations.flatMap(v => v.lessons));
  /** Varför passet avviker, ur kontrollens svar (05.2-SM-VILLKOR-DIREKT). */
  const avvikelse = (l: SchemaForslagLesson) => forslag && flagged.has(l.id) ? avvikelseRad(forslag, provade.egna, kontroll!.violations.filter(v => v.lessons.includes(l.id)).map(v => v.code), l) : null;
  const foljtId = folj ? !folj.locked && picked ? picked : folj.lesson : null;
  const foljt = foljtId ? forslag?.lessons.find(l => l.id === foljtId) ?? null : null;
  const placeringar = forslag?.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) ?? [];

  const bytLagen = useSchemaBytLagen({ forslag, villkor: provade, lesson: drop?.lesson ?? picked, placements: placeringar, userLocks: utkastLas(utkast), unitId, schoolYear, onSessionLost });
  const options = forslag ? (by === 'class' ? forslag.classes : forslag.teachers) : [];
  const selected = options.some(o => o.id === chosen) ? chosen : options[0]?.id ?? '';
  const selectedRef = forslag ? resursRefs(forslag).get(selected) : undefined;
  const windowResource = selectedRef ? `${selectedRef.slag}:${selectedRef.ref}` : undefined;
  const byTerm = forslag?.lessons.some(l => l.term !== null) ?? false, termTag = (l: SchemaForslagLesson) => l.term ? ` · ${l.term.toUpperCase()}` : '';
  const mine = (l: SchemaForslagLesson) => (l.term === null || l.term === shownTerm) && (by === 'class' ? l.classIds : l.teacherIds).includes(selected);
  // Justerad längd (05.2-SM-TIMPLAN-VECKA, W3): det passet kortas alla veckor i den termin som visas syns i veckan; kortning vissa veckor står i text.
  const viewTerm: SchemaTerm = !forslag || forslag.period === 'lasar' ? shownTerm : forslag.period;
  const datumVal = forslag ? schemaVeckaVal(forslag, viewTerm, visning) : visning;
  const trimOf = (l: SchemaForslagLesson) => forslag?.trims.find(x => x.lesson === l.id && x.term === (l.term ?? viewTerm)) ?? null;
  const shownMin = (l: SchemaForslagLesson) => l.durationMin - (trimOf(l)?.fixedMin ?? 0);
  const someWeeks = (l: SchemaForslagLesson) => { const n = trimOf(l)?.extraCount ?? 0; return n ? ` · kortare ${n === 1 ? 'en vecka' : `${n} veckor`}` : ''; };
  const roomName = (id: string | null) => forslag?.rooms.find(r => r.id === id)?.name ?? '';
  // Passets egna villkor med text (05.2-SM-VILLKOR-SYNS): justerad längd mot grundschemat (W6), kortning vissa veckor och salskrav.
  const passRader = (l: SchemaForslagLesson) => {
    const trim = trimOf(l), n = trim?.extraCount ?? 0, rooms = l.roomIds.map(roomName).filter(Boolean);
    return [trim?.fixedMin ? `${shownMin(l)} min · ${l.durationMin} i grundschemat` : '', n ? `kortare ${n === 1 ? 'en vecka' : `${n} veckor`}` : '',
      rooms.length && (l.roomId === null || rooms.length > 1) ? `Salskrav: ${rooms.join(' eller ')}` : ''].filter(Boolean);
  };
  const detail = (l: SchemaForslagLesson) => forslag ? [by === 'class' ? (l.vacant && l.teacherIds.length === 0 ? 'Ingen lärare' : names(l.teacherIds, forslag.teachers)) : names(l.classIds, forslag.classes), roomName(l.roomId)].filter(Boolean).join(' · ') : '';
  const dragged = drop ? forslag?.lessons.find(l => l.id === drop.lesson) ?? null : null;
  const unplaced = forslag?.lessons.filter(l => l.day === null) ?? [];
  const shown = forslag?.lessons.filter(l => l.day !== null && l.startMin !== null && (datumVal.mode === 'grundschema' ? mine(l) : (by === 'class' ? l.classIds : l.teacherIds).includes(selected))) ?? [];
  const d = SCHEMA_DEFAULTS;
  const { deviating, off } = tidAvvikelser(forslag);
  // Villkoren som lager för den klass eller lärare som visas. Lagren följer villkoren i formuläret, så att en ändring syns direkt.
  const allaITerminen = forslag?.lessons.filter(l => l.term === null || l.term === shownTerm) ?? [];
  const lager = forslag ? schemaLager(villkor, forslag, { slag: by === 'class' ? 'klass' : 'larare', ref: selected }, { lessons: shown, alla: allaITerminen, layers: utkast.layers }) : null;
  const egnaSyns = lager ? Object.values(lager.kallor).filter(k => k.typ === 'egen').length : 0;
  const villkorAndrade = forslag !== null && villkorKey !== forslagetsKey;
  const NAMN = { onskemal: 'Sena pass (undviks)', 'band-marginal': 'Marginal före eller efter pass' };
  function taBort(k: Extract<SchemaKalla, { typ: 'egen' }>) {
    const rule = villkor.egna[k.index];
    if (!rule) return;
    setVillkor({ ...villkor, egna: villkor.egna.filter((_, i) => i !== k.index) }); setBorttaget({ rule, index: k.index });
  }
  function angra() {
    if (!borttaget) return;
    setVillkor({ ...villkor, egna: [...villkor.egna.slice(0, borttaget.index), borttaget.rule, ...villkor.egna.slice(borttaget.index)] });
    aterFalt.current = `egna:${borttaget.index}`; setBorttaget(null);
  }
  // Verktygsfält, snabbmeny, spärrar och tangentbord i veckan (05.2-SM-MENY).
  const meny = useSchemaMeny({ forslag, utkast, dispatch, villkor, setVillkor, shown, alla: allaITerminen, visad: selected, unplaced, kallor: lager?.kallor ?? {}, length: shownMin, checking, week,
    synlig: visadVy(vy, true, true, foljt !== null) === 'vecka', andra: action => void andra(action), pick, taBort, folj: foljPass, andraVillkor: andraFalt,
    gemensam: time => { setSamlingStart({ nr: Date.now(), resources: [selected], time, common: true }); setVy('samling'); rememberVy('samling'); },
    onOpenWindow: l => { if (fastAktivitet(l, provade)) dispatch({ type: 'pick', lesson: l.id }); else pick(l); synk.open({ view: 'folj' }); },
    nyAktivitet: fonster ? undefined : time => { const ref = forslag ? resursRefs(forslag).get(selected) : undefined;
      const resurs = ref && (ref.slag === 'klass' || ref.slag === 'grupp' || ref.slag === 'larare' || ref.slag === 'sal') ? { slag: ref.slag, ref: ref.ref } : undefined;
      setAktivitetsStart({ day: time.day, startMin: time.startMin, nr: Date.now(), resurs }); } });
  /** Visa i veckan (05.2-SM-PASSTABELL): veckan för passets klass (eller lärare) och termin, med passet markerat och i fokus. */
  function visaIVeckan(l: SchemaForslagLesson) {
    if (!forslag) return;
    if (!mine(l) || l.term !== null && l.term !== shownTerm) {
      const klass = l.classIds.find(id => forslag.classes.some(c => c.id === id));
      if (klass) { setBy('class'); setChosen(klass); } else if (l.teacherIds[0]) { setBy('teacher'); setChosen(l.teacherIds[0]); }
      if (l.term) setShownTerm(l.term);
    }
    setVy('vecka'); rememberVy('vecka');
    visaFokus.current = l.id;
    if (picked !== l.id) pick(l);
  }
  function diagnosVillkor(resource?: SchemaDiagnosResurs) {
    if (resource?.id.startsWith('kluster-')) { diagnosMal({ target: 'grupper', label: 'Öppna undervisningsgrupper' }); return; }
    if (forslag && resource) {
      const flik = resource.typ === 'undervisning' ? 'amne' : resource.typ;
      setVillkorMal({ flik, ref: resource.id, nr: Date.now() }); setVy('villkor');
    } else {
      const box = document.querySelector<HTMLDetailsElement>('details.schema-villkor');
      if (box) { box.open = true; box.scrollIntoView({ block: 'center' }); box.querySelector<HTMLElement>('input,select,button')?.focus(); }
    }
  }
  function diagnosMal(action: SchemaDiagnosAction) {
    if (action.target === 'villkor') { diagnosVillkor(action.resource); return; }
    const view = { tjanst: 'tjanst', grupper: 'undervisningsgrupper', timplan: 'timplaner' }[action.target];
    window.open(`/?${new URLSearchParams({ vy: view, planeringsskola: unitId, planeringslasar: String(schoolYear) })}`, '_blank', 'noopener');
  }
  const tabellAtgarder = (l: SchemaForslagLesson) => ({ ...meny.passAtgarder(l), visaIVeckan: l.day !== null ? () => visaIVeckan(l) : undefined });
  const tabellRubrik = (l: SchemaForslagLesson) => l.day === null ? `${l.title} · på viloytan` : `${l.title} · ${meny.text(l).slice(l.title.length + 1)}`;
  const markerade = flagged;
  const falt = (o: SchemaOverlay, label: string, content: ReactNode) => {
    const k = o.sourceId ? lager?.kallor[o.sourceId] : undefined;
    return k && forslag ? <FaltKalla label={label} kalla={k} villkor={villkor} resurser={forslag.resurser} onAndra={andraFalt} onTaBort={taBort}>{content}</FaltKalla> : null;
  };

  // Ångra, gör om, Följ passet och beskeden om ändrade villkor gäller utkastet och står i både veckan och tabellen (05.2-SM-PASSTABELL).
  const gemensamt = forslag && <>
    <div className="schema-moves">
      <p className="schema-note">Dra ett pass till en ny tid eller till viloytan, eller välj passet för att flytta det med flyttpanelen. Varje flytt kontrolleras mot reglerna. Flyttar sparas inte: de försvinner när du lämnar sidan eller tar fram ett nytt förslag.</p>
      <div className="schema-undo">
        <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || checking} onClick={() => meny.angra('undo') || void andra({ type: 'undo' })}>{aktivitetsSteg(utkast.undo.at(-1)) ? 'Ångra senaste aktivitet' : villkorSteg(utkast.undo.at(-1)) ? 'Ångra senaste villkor' : 'Ångra senaste flytt'}</Button>
        <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || checking} onClick={() => meny.angra('redo') || void andra({ type: 'redo' })}>Gör om</Button>
        {/* Följ passet (05.2-SM-FOLJ) vid markerat pass; även dubbelklick eller tangenten F på ett pass. */}
        {pickedLesson && vy !== 'folj' && <Button type="button" variant="outline" title="Även dubbelklick eller tangenten F på ett pass" onClick={() => foljPass(pickedLesson.id)}>Följ passet</Button>}
      </div>
    </div>
    {borttaget && <output className="schema-borttaget"><span className="schema-note">Villkoret är borttaget: {ruleText(borttaget.rule, forslag.resurser)}. Det gäller inte nästa förslag.</span>
      <Button ref={angraVillkor} type="button" variant="outline" onClick={angra}>Ångra borttagningen</Button></output>}
    {villkorAndrade && <p className="schema-note" data-villkor-andrade={grundAndrad ? 'grund' : issues.length ? 'fel' : 'tid'}>{grundAndrad
      ? kraverNytt === villkorKey
        ? 'Ändringen kräver ett nytt förslag: villkoren ändrar hur passen kan delas på veckans dagar. Flytt, kontroll och möjliga starttider följer förslagets villkor tills du tar fram ett nytt förslag.'
        : 'Ändringen kräver ett nytt förslag. Längsta och kortaste pass, passlängd, antal pass och salarna avgör vilka pass som finns. Flytt, kontroll och möjliga starttider följer förslagets villkor tills du tar fram ett nytt förslag.'
      : issues.length
        ? 'Villkoren har ändrats men har fel. Kontrollen följer förslagets villkor tills felen är rättade.'
        : 'Villkoren har ändrats sedan förslaget togs fram. Kontrollen, möjliga starttider och Följ passet prövar de ändrade villkoren direkt. Passen ligger kvar tills du flyttar dem eller tar fram ett nytt förslag.'}</p>}
  </>;
  // Villkor i tabell (05.2-SM-VILLKORSTABELL): samma villkor och utkast som veckan, med ångra och beskeden ovanför.
  const villkorsvy: ReactNode | undefined = forslag ? <>
    {gemensamt}
    <Villkorstabell villkor={villkor} setVillkor={setVillkor} dispatch={dispatch} forslag={forslag} kontroll={kontroll} disabled={busy || checking} mal={villkorMal} onOpen={() => synk.open({ view: 'villkor' })}/>
  </> : undefined;
  const samlingsvy = forslag ? <div ref={resursvy}>
    {gemensamt}
    <Samling forslag={forslag} villkor={provade} placements={placeringar} layers={utkast.layers} term={viewTerm} picked={picked}
      violations={[...flagged]} locked={Object.keys(utkast.locked)} windows={synk.opened} onOpenWindows={synk.openSet} onOpen={() => synk.open({ view: 'samling' })} start={samlingStart} onSessionLost={onSessionLost}
      onLayer={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}
      onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }}/>
  </div> : undefined;
  const foljvy = forslag && foljt ? <div ref={resursvy}>
    {gemensamt}
    <Folj key={foljt.id} forslag={forslag} lesson={foljt} placements={placeringar} villkor={provade} userLocks={utkastLas(utkast)} locked={folj!.locked} checking={checking || busy} headingRef={foljRubrik} term={shownTerm}
      onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }}
      onLock={locked => setFolj(f => f && { ...f, lesson: foljt.id, locked })} onOpen={() => synk.open({ view: 'folj' })} onClose={() => {
        setFolj(null); setVy(foljFran.current === 'folj' ? 'vecka' : foljFran.current);
        requestAnimationFrame(() => passElement(foljt.id)?.focus());
      }} onSessionLost={onSessionLost}
      onMove={p => void andra({ type: 'move', lesson: foljt.id, day: p.day, startMin: p.startMin, room: p.room })}/>
  </div> : undefined;
  const aktivaLas = utkastLas(utkast);
  const diagnosAktuell = fore?.key === JSON.stringify({ unitId, schoolYear, period, villkor, ...(base && aktivaLas.length ? { locks: { grundFingerprint: base.grundFingerprint, placements: aktivaLas } } : {}) }) ? fore : null;
  if (fonster && !synk.live) return <section className="valplan-workspace schema-workspace"><FonsterList synk={synk} title={fonsterVyNamn[fonster.view]}/><p className="empty-state">Väntar på huvudfönstret. Inga ändringar kan göras innan kontakten är tillbaka.</p></section>;
  return <section className="valplan-workspace schema-workspace">
    <FonsterList synk={synk} title={fonster ? fonsterVyNamn[fonster.view] : 'Arbetsytan'}><FonsterMeny synk={synk} disabled={!forslag} resource={windowResource}/></FonsterList>
    {!fonster && <div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1><p>Läsår {planningYearLabel(schoolYear)}. Förslaget räknas ur skolans tjänstefördelning. Det sparas inte och publiceras inte.</p></div></div>}
    {!fonster && <form className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Schemat gäller<select value={period} disabled={busy} onChange={e => setPeriod(e.target.value as SchemaPeriod)}>
        <option value="lasar">{PERIOD.lasar}</option><option value="ht">{PERIOD.ht}</option><option value="vt">{PERIOD.vt}</option></select></label>
      <Button type="submit" variant={diagnosAktuell?.findings.length ? 'outline' : 'default'} disabled={busy || checking || issues.length > 0}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>
      <p className="schema-note schema-wide">Hur mycket tid ett ämne har och vilken termin kommer ur timplanen, via tjänstefördelningens behov. Tiden räknas på läsårskalenderns skoldagar. Vilka pass som får gå samtidigt avgörs av elevernas klasser och grupper.</p>
      <Villkor value={villkor} disabled={busy || checking} issues={issues} resurser={forslag?.resurser ?? null} forslag={forslag} onChange={setVillkor}/>
    </form>}
    <output aria-live="polite" className="schema-note">{busy ? berakningssteg === 'diagnos' ? 'Kontrollerar underlaget före beräkning…' : `Schemamotorn räknar. Det tar upp till ${d.solveTimeMs / 1000} sekunder.` : ''}</output>
    {diagnosAktuell && diagnosAktuell.findings.length > 0 && <ForeBerakning findings={diagnosAktuell.findings} busy={busy || checking} onContinue={() => void run(true)} onTarget={diagnosMal}/>}
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {!forslag && !busy && !error && <p className="empty-state">Inget förslag ännu. Välj vad schemat gäller, se över villkoren och ta fram ett schemaförslag.</p>}

    {forslag && <>
      <div className="schema-summary" aria-labelledby={resultHeading}>
        <h2 id={resultHeading} className="sr-only">Schemaförslag</h2>
        <span className={`status-badge ${forslag.status === 'complete' && forslag.metrics.unplaced > 0 ? 'warning' : STATUS[forslag.status].tone}`}>Förslag · {forslag.status === 'complete' && forslag.metrics.unplaced > 0 ? 'Pass kvar på viloytan' : STATUS[forslag.status].text}</span>
        <span className={`status-badge ${off ? 'warning' : 'success'}`}>{off ? `Avviker från timplanen · ${off}` : 'Tiden följer timplanen'}</span>
        {steps > 0 && <span className="status-badge warning">Ändrat för hand · {steps} {steps === 1 ? 'flytt' : 'flyttar'}</span>}
        {kontroll && kontroll.total > 0 && <span className="status-badge warning">{kontroll.total} {kontroll.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}</span>}
        {egnaSyns > 0 && <span className="status-badge">{egnaSyns} {egnaSyns === 1 ? 'eget villkor syns' : 'egna villkor syns'} i veckan</span>}
        <p>{PERIOD[forslag.period]}. {forslag.metrics.placed} av {forslag.metrics.lessons} pass har fått en tid.</p>
        <p className="schema-note">{forslag.basis ? `Underlag: tjänstefördelning version ${forslag.basis.versionNo} (${BASIS[forslag.basis.status] ?? forslag.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}
          {forslag.time.source === 'kalender'
            ? ` Tid: ${forslag.time.schoolDays} skoldagar${forslag.time.terms.length > 1 ? ` (${forslag.time.terms.map(t => `${t.term.toUpperCase()} ${t.schoolDays}`).join(', ')})` : ''} enligt läsårskalendern version ${forslag.time.version} (${CALENDAR[forslag.time.status ?? ''] ?? forslag.time.status}${forslag.time.current ? ', gällande' : ''}).`
            : ` Läsårskalender saknas för läsåret: ${forslag.time.weeks} lika veckor har antagits.`}
          {forslag.metrics.placed > 0 && ` Håltid per vecka: elever ${forslag.metrics.studentGapMin} min, lärare ${forslag.metrics.teacherGapMin} min.`}</p>
      </div>

      {fonster && ['larare', 'sal', 'elev', 'viloyta', 'avvikelser', 'tid', 'veckor'].includes(fonster.view) && gemensamt}
      {fonster && ['larare', 'sal', 'elev'].includes(fonster.view) && <ResursFonster forslag={forslag} villkor={provade} placements={placeringar} layers={utkast.layers} term={viewTerm} picked={picked} slag={fonster.view === 'larare' ? 'larare' : fonster.view === 'sal' ? 'sal' : 'elev'} initialResource={fonster.resource} onPick={id => { const l = forslag.lessons.find(x => x.id === id); if (l) pick(l); }} onLayer={(layer, on) => dispatch({ type: 'layer', layer, on })} onSessionLost={onSessionLost} onTerm={setShownTerm}/>}
      {fonster?.view === 'viloyta' && <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={false} dragging={null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick}/>}
      {fonster?.view === 'vecka' && resourceMissing && <div className="empty-state"><p>Resursen i arbetsvyn finns inte i det här underlaget. Välj aktivt vilken klass eller grupp du vill visa.</p><label>Välj klass eller grupp<select value="" onChange={e => { setBy('class'); setChosen(e.target.value); setWantedResource(undefined); setResourceMissing(false); }}><option value="">Välj resurs</option>{forslag.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>}
      {forslag.lessons.length > 0 && !(fonster?.view === 'vecka' && resourceMissing) && (!fonster || ['vecka', 'folj', 'samling', 'pass', 'villkor'].includes(fonster.view)) && <>
        {['vecka', 'pass'].includes(visadVy(vy, villkorsvy !== undefined, samlingsvy !== undefined, foljvy !== undefined)) &&
          <VeckaVal forslag={forslag} term={viewTerm} value={visning} onChange={setVisning}/>}
        {/* Vyväljaren (05.2-SM-PASSTABELL): veckan och tabellerna visar samma utkast. Ångra, flyttpanelen och Följ passet är gemensamma. */}
        <Vyval utlyft={!!fonster} vy={vy} onVy={setVy} villkor={villkorsvy} samling={samlingsvy} folj={foljvy} veckaVal={<>
            <fieldset><legend className="sr-only">Visa schema för</legend>
              <Button type="button" variant={by === 'class' ? 'secondary' : 'outline'} aria-pressed={by === 'class'} onClick={() => { setBy('class'); setWantedResource(undefined); }}>Klass</Button>
              <Button type="button" variant={by === 'teacher' ? 'secondary' : 'outline'} aria-pressed={by === 'teacher'} disabled={forslag.teachers.length === 0} onClick={() => { setBy('teacher'); setWantedResource(undefined); }}>Lärare</Button>
            </fieldset>
            <label>{by === 'class' ? 'Klass eller grupp' : 'Lärare'}<select value={selected} onChange={e => { setChosen(e.target.value); setWantedResource(undefined); }}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          </>} vecka={<>
          {byTerm && <div className="schema-filter"><fieldset><legend className="schema-note">Vissa pass går bara en termin. Visa veckan under</legend>
            {forslag.time.terms.map(t => <Button key={t.term} type="button" variant={shownTerm === t.term ? 'secondary' : 'outline'} aria-pressed={shownTerm === t.term} onClick={() => setShownTerm(t.term)}>{TERM[t.term]}</Button>)}</fieldset></div>}
          {gemensamt}
          <div className="schema-verktygsrad">{meny.verktyg}
            <Lagerval layers={utkast.layers} onChange={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}/></div>
          {meny.meddelande}
          <output aria-live="polite" className="schema-note schema-drag-status">{drop || picked ? bytLagen.loading ? 'Läser möjliga starttider…' : bytLagen.error ?? bytLagen.status(drop?.to ?? target) : ''}</output>
          <div className="schema-folj-lyssnare" {...foljHandelser}>
          <div className="schema-vecka-rad">{meny.wrap(<Vecka gridRef={week} days={forslag.days} lessons={shown} picked={picked} drop={drop && dragged ? { ...drop, length: dragged.durationMin } : null} flagged={markerade} disabled={checking}
            locked={l => fastAktivitet(l, provade) || !!utkast.locked[l.id]}
            length={shownMin} detail={l => `${detail(l)}${termTag(l)}`} extra={l => [...passRader(l), avvikelse(l) ?? ''].filter(Boolean)} onGrab={grab} onPick={meny.onPick}
            overlays={[...(lager?.overlays ?? []), ...bytLagen.overlays]} bands={lager?.bands} dimmed={lager?.dimmed} falt={falt} namn={NAMN} {...meny.veckaProps}
            kalender={forslag.time.calendar} visning={datumVal} trims={forslag.trims} classId={by === 'class' ? selected : null}/>)}{meny.panel}</div>
          </div>
          <Teckenforklaring lessons={shown} picked={picked} flagged={markerade} overlays={[...(lager?.overlays ?? []), ...bytLagen.overlays]} bands={lager?.bands} dimmed={lager?.dimmed} namn={NAMN}/>
        </>} pass={<>
          {gemensamt}
          {meny.meddelande}
          <div className="schema-folj-lyssnare" {...foljHandelser}>
            <Passtabell forslag={forslag} violations={kontroll?.violations ?? null} egna={provade.egna} term={viewTerm} visning={datumVal} picked={picked} checking={checking || busy}
              val={tabellVal} onVal={setTabellVal} atgarder={tabellAtgarder} rubrik={tabellRubrik} tabellRef={tabell}
              onParkera={ids => void andra({ type: 'park', lesson: ids[0], fler: ids.slice(1) })}
              onLas={(ids, locked) => { if (ids[0]) void andra({ type: 'lock', lesson: ids[0], fler: ids.slice(1), locked }); }}
              onAvbryt={() => { if (pickedLesson) { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); } }}/>
          </div>
        </>}/>
        {visadVy(vy, villkorsvy !== undefined, true, foljvy !== undefined) === 'vecka' && <>
          <div className="schema-folj-lyssnare" {...foljHandelser}>
          <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={drop?.to?.day === null} dragging={drop?.lesson ?? null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick} onOpen={() => synk.open({ view: 'viloyta' })}/>
          </div>
        </>}
      </>}

      {pickedLesson && <Flyttpanel lesson={pickedLesson} forslag={forslag} target={target} checking={checking || busy} locked={fastAktivitet(pickedLesson, provade) ? 'Aktiviteten har fast tid. Ändra den i aktivitetslistan.' : utkast.locked[pickedLesson.id] ? 'Passet är låst. Lås upp det innan du flyttar det.' : undefined} shownMin={shownMin(pickedLesson)}
        extra={{ someWeeks: someWeeks(pickedLesson), termTag: termTag(pickedLesson) }} roomName={roomName} dayRef={dayField} onTarget={setTarget}
        onMove={() => void andra({ type: 'move', lesson: pickedLesson.id, day: target.day, startMin: target.startMin, room: target.room, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onPark={() => void andra({ type: 'park', lesson: pickedLesson.id, fler: utkast.selected.includes(pickedLesson.id) ? utkast.selected.filter(id => id !== pickedLesson.id) : [] })}
        onCancel={() => { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); }}/>}
      <output aria-live="polite" className="schema-note">{checking ? 'Schemat kontrolleras mot reglerna.' : moved}</output>
      {moveError && <div className="valplan-alert" role="alert"><p>{moveError}</p></div>}
      {(!fonster || fonster.view === 'avvikelser') && <Regelavvikelser kontroll={kontroll} onOpen={() => synk.open({ view: 'avvikelser' })}/>}
      {fonster?.view === 'avvikelser' && !kontroll && <p className="empty-state">Kontrollen körs när förslaget ändras. Inga kontrollresultat finns ännu.</p>}
      {!fonster && <><Forklaring diagnoses={forslag.diagnoses}/>
      <SvarastAttLagga statistics={forslag.statistics} onFollow={foljPass} onCondition={diagnosVillkor}/></>}
      {(!fonster || fonster.view === 'tid' || fonster.view === 'veckor') && <Tid forslag={forslag} deviating={deviating} off={off} mode={fonster?.view === 'veckor' ? 'veckor' : fonster?.view === 'tid' ? 'tid' : 'all'} onOpen={() => synk.open({ view: 'tid' })} onOpenWeeks={() => synk.open({ view: 'veckor' })}/>}
      {!fonster && <><Underlag forslag={forslag}/>
      <Aktiviteter forslag={forslag} villkor={villkor} lessons={forslag.lessons} busy={busy || checking} onChange={andraAktiviteter} saveError={moveError}
        start={aktivitetsStart} onStartHandled={() => setAktivitetsStart(null)}/></>}
    </>}
  </section>;
}
