'use client';
// Arbetsytan i Schema. Sätter ihop modulerna under ./schema/ och äger hämtning av förslag och kontroll av ändringar (05.2-SM-YTA).
// Var passen ligger för hand hålls i utkastet (lib/schema-utkast.ts) med ångra och gör om i flera steg; en ändring görs först när kontrollen har svarat.
import { useEffect, useId, useMemo, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest,
  type SchemaKontroll, type SchemaKontrollRequest, type SchemaPeriod, type SchemaRegel, type SchemaStatus, type SchemaTerm } from '@/lib/schema-contract.ts';
import { SCHEMA_DEFAULTS } from '@/lib/schema-underlag.ts';
import { medUtkast, schemaUtkast, tomtUtkast, utkastEfter, utkastSteg, villkorSteg, type SchemaOverlay, type SchemaUtkastAtgard } from '@/lib/schema-utkast.ts';
import { schemaLager, type SchemaKalla } from '@/lib/schema-lager.ts';
import { DAYS, PERIOD, TERM, clock, names, ruleText, startTimes } from './schema/delat.ts';
import { FaltKalla, Lagerval, rememberLager, storedLager, visaVillkor } from './schema/lager.tsx';
import { Vecka, Teckenforklaring, veckansSpann } from './schema/vecka.tsx';
import { Viloyta } from './schema/viloyta.tsx';
import { Villkor, rememberVillkor, storedVillkor } from './schema/villkor.tsx';
import { Tid, tidAvvikelser } from './schema/tid.tsx';
import { Forklaring, Regelavvikelser } from './schema/avvikelser.tsx';
import { Flyttpanel, type FlyttMal } from './schema/flytt.tsx';
import { Underlag } from './schema/underlag.tsx';
import { dra, type Mal } from './schema/dra.ts';
import { useSchemaMeny } from './schema/meny.tsx';
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
  if (error instanceof ApiError) {
    if (error.reason && REASON[error.reason]) return REASON[error.reason];
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Schemaförslaget kunde inte tas fram. Försök igen.';
}
function moveMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'schema_underlag_changed') return 'Underlaget har ändrats sedan förslaget togs fram. Passet står kvar. Ta fram ett nytt schemaförslag för att fortsätta.';
    if (error.reason && REASON[error.reason]) return 'Schemamotorn kunde inte kontrollera flytten. Passet står kvar. Försök igen om en stund.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Flytten kunde inte kontrolleras. Passet står kvar.';
}
const CALENDAR: Record<string, string> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void };
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, onSessionLost }: Props & { unitId: string }) {
  const resultHeading = useId();
  const [period, setPeriod] = useState<SchemaPeriod>('lasar'), [villkor, setVillkor] = useState(() => storedVillkor(unitId) ?? defaultSchemaVillkor()), [shownTerm, setShownTerm] = useState<SchemaTerm>('ht');
  const issues = checkSchemaVillkor(villkor);
  // Förslaget som motorn räknade fram; tid och mått uppdateras efter varje kontroll. Var passen ligger står i utkastet.
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [base, setBase] = useState<SchemaForslag | null>(null);
  // Lagren i veckan (05.2-SM-VILLKOR-SYNS) ligger i utkastet och minns i webbläsaren.
  const [utkast, dispatch] = useReducer(schemaUtkast, undefined, () => ({ ...tomtUtkast(), layers: storedLager() }));
  // Ett eget villkor som togs bort från ett fält i veckan, så att det kan ångras.
  const [borttaget, setBorttaget] = useState<{ rule: SchemaRegel; index: number } | null>(null), angraVillkor = useRef<HTMLButtonElement | null>(null), aterFalt = useRef<string | null>(null);
  const forslag = useMemo(() => base && { ...base, lessons: medUtkast(base.lessons, utkast.placements) }, [base, utkast.placements]);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  // Flytt för hand (05.2-SM-FLYTT): en flytt görs först när motorns kontrollant har svarat, och inget sparas.
  const picked = utkast.picked, [target, setTarget] = useState<FlyttMal>({ day: 0, startMin: 0, room: null });
  // Dra och släpp (D1): passet som dras och var det hamnar om det släpps.
  const [drop, setDrop] = useState<{ lesson: string; to: Mal | null } | null>(null);
  const [kontroll, setKontroll] = useState<SchemaKontroll | null>(null), [checking, setChecking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null), [moved, setMoved] = useState('');
  const running = useRef<AbortController | null>(null), week = useRef<HTMLDivElement | null>(null), focus = useRef<string | null>(null), dayField = useRef<HTMLSelectElement | null>(null), rest = useRef<HTMLDivElement | null>(null), skipClick = useRef(false);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => { if (picked) dayField.current?.focus(); }, [picked]);
  // Efter Ta bort står fokus på Ångra; efter Ångra på fältet igen.
  useEffect(() => {
    if (borttaget) { angraVillkor.current?.focus(); return; }
    if (aterFalt.current) week.current?.querySelector<HTMLElement>(`[data-source="${aterFalt.current}"] button`)?.focus();
    aterFalt.current = null;
  }, [borttaget]);
  // Efter flytt eller avbrott går fokus tillbaka till passet, så att tangentbordet inte tappar sin plats.
  useEffect(() => {
    if (!focus.current || picked) return;
    week.current?.querySelector<HTMLButtonElement>(`[data-lesson="${focus.current}"]`)?.focus();
    focus.current = null;
  }, [picked, forslag]);

  async function run() {
    if (busy || issues.length) return;
    const request: SchemaForslagRequest = { unitId, schoolYear, period, villkor }, controller = new AbortController();
    running.current = controller;
    setBusy(true); setError(null);
    try {
      const next = parseSchemaForslag(await api.post<unknown>('/api/schema/forslag', request, controller.signal), request);
      rememberVillkor(unitId, villkor);
      setBase(next); dispatch({ type: 'reset', forslag: next }); setShownTerm('ht'); setBy('class'); setChosen(next.classes[0]?.id ?? '');
      setKontroll(null); setMoveError(null); setMoved('');
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { if (running.current === controller) { running.current = null; setBusy(false); } }
  }

  function pick(l: SchemaForslagLesson) {
    if (!forslag || checking) return;
    if (skipClick.current) return;
    const day = l.day ?? 0, starts = startTimes(forslag, day, l.durationMin + l.marginMin);
    setTarget({ day, startMin: l.startMin !== null && starts.includes(l.startMin) ? l.startMin : starts[0] ?? forslag.days[day].startMin, room: l.roomId });
    dispatch({ type: 'pick', lesson: l.id }); setMoveError(null);
  }
  /**
   * Flyttar ett pass, lägger det på viloytan, ångrar eller gör om. Passet behåller sin sal om ingen annan anges; utan sal väljer servern en ledig.
   * Hela schemat kontrolleras om med placeringarna ändringen ger, och utkastet ändras först när kontrollen har svarat.
   */
  async function andra(action: Extract<SchemaUtkastAtgard, { type: 'move' | 'park' | 'undo' | 'redo' }>) {
    const next = utkastEfter(utkast, action), lessonId = action.type === 'undo' || action.type === 'redo' ? utkastSteg(utkast, action.type) : action.lesson;
    const before = base?.lessons.find(l => l.id === lessonId);
    if (!base || !next || !before || checking || busy) return;
    const lessons = medUtkast(base.lessons, next), controller = new AbortController();
    const request: SchemaKontrollRequest = { unitId, schoolYear, period: base.period, villkor: base.villkor, fingerprint: base.fingerprint,
      placements: lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) };
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = parseSchemaKontroll(await api.post<unknown>('/api/schema/kontroll', request, controller.signal), base.fingerprint);
      setBase({ ...base, teachings: reply.teachings, trims: reply.trims, metrics: reply.metrics });
      dispatch({ ...action, rooms: reply.rooms });
      focus.current = before.id; setKontroll(reply);
      const { day, startMin } = next[before.id];
      setMoved(`${before.title} ${day === null || startMin === null ? 'ligger nu på viloytan' : `ligger nu ${DAYS[day].toLowerCase()} ${clock(startMin)}`}. ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setMoveError(moveMessage(caught));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  const span = forslag ? veckansSpann(forslag.days) : { start: 0, end: 0 };
  function grab(e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) {
    if (!forslag || checking || busy) return;
    dra(e, l, { forslag, grid: week.current, rest: rest.current, start: span.start, end: span.end, skipClick,
      onHover: to => setDrop({ lesson: l.id, to }), onEnd: () => setDrop(null),
      onDrop: to => void andra(to.day === null || to.startMin === null ? { type: 'park', lesson: l.id } : { type: 'move', lesson: l.id, day: to.day, startMin: to.startMin }) });
  }
  const steps = utkast.undo.filter(x => !villkorSteg(x)).length, pickedLesson = forslag?.lessons.find(l => l.id === picked) ?? null;
  const flagged = new Set(kontroll?.violations.flatMap(v => v.lessons));

  const options = forslag ? (by === 'class' ? forslag.classes : forslag.teachers) : [];
  const selected = options.some(o => o.id === chosen) ? chosen : options[0]?.id ?? '';
  const byTerm = forslag?.lessons.some(l => l.term !== null) ?? false, termTag = (l: SchemaForslagLesson) => l.term ? ` · ${l.term.toUpperCase()}` : '';
  const mine = (l: SchemaForslagLesson) => (l.term === null || l.term === shownTerm) && (by === 'class' ? l.classIds : l.teacherIds).includes(selected);
  // Justerad längd (05.2-SM-TIMPLAN-VECKA, W3): det passet kortas alla veckor i den termin som visas syns i veckan; kortning vissa veckor står i text.
  const viewTerm: SchemaTerm = !forslag || forslag.period === 'lasar' ? shownTerm : forslag.period;
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
  const shown = forslag?.lessons.filter(l => l.day !== null && l.startMin !== null && mine(l)) ?? [];
  const d = SCHEMA_DEFAULTS;
  const { deviating, off } = tidAvvikelser(forslag);
  // Villkoren som lager för den klass eller lärare som visas. Lagren följer villkoren i formuläret, så att en ändring syns direkt.
  const allaITerminen = forslag?.lessons.filter(l => l.term === null || l.term === shownTerm) ?? [];
  const lager = forslag ? schemaLager(villkor, forslag, { slag: by === 'class' ? 'klass' : 'larare', ref: selected }, { lessons: shown, alla: allaITerminen, layers: utkast.layers }) : null;
  const egnaSyns = lager ? Object.values(lager.kallor).filter(k => k.typ === 'egen').length : 0;
  const villkorAndrade = forslag !== null && JSON.stringify(villkor) !== JSON.stringify(forslag.villkor);
  const NAMN = { onskemal: 'Sena pass (undviks)', 'band-marginal': 'Marginal efter pass' };
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
    andra: action => void andra(action), pick, taBort });
  const markerade = new Set([...flagged, ...meny.brott.keys()]);
  const falt = (o: SchemaOverlay, label: string, content: ReactNode) => {
    const k = o.sourceId ? lager?.kallor[o.sourceId] : undefined;
    return k && forslag ? <FaltKalla label={label} kalla={k} villkor={villkor} resurser={forslag.resurser} onAndra={visaVillkor} onTaBort={taBort}>{content}</FaltKalla> : null;
  };

  return <section className="valplan-workspace schema-workspace">
    <div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1><p>Läsår {planningYearLabel(schoolYear)}. Förslaget räknas ur skolans tjänstefördelning. Det sparas inte och publiceras inte.</p></div></div>
    <form className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Schemat gäller<select value={period} disabled={busy} onChange={e => setPeriod(e.target.value as SchemaPeriod)}>
        <option value="lasar">{PERIOD.lasar}</option><option value="ht">{PERIOD.ht}</option><option value="vt">{PERIOD.vt}</option></select></label>
      <Button type="submit" disabled={busy || checking || issues.length > 0}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>
      <p className="schema-note schema-wide">Hur mycket tid ett ämne har och vilken termin kommer ur timplanen, via tjänstefördelningens behov. Tiden räknas på läsårskalenderns skoldagar. Vilka pass som får gå samtidigt avgörs av elevernas klasser och grupper.</p>
      <Villkor value={villkor} disabled={busy} issues={issues} resurser={forslag?.resurser ?? null} onChange={setVillkor}/>
    </form>
    <output aria-live="polite" className="schema-note">{busy ? `Schemamotorn räknar. Det tar upp till ${d.solveTimeMs / 1000} sekunder.` : ''}</output>
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {!forslag && !busy && !error && <p className="empty-state">Inget förslag ännu. Välj vad schemat gäller, se över villkoren och ta fram ett schemaförslag.</p>}

    {forslag && <>
      <div className="schema-summary" aria-labelledby={resultHeading}>
        <h2 id={resultHeading} className="sr-only">Schemaförslag</h2>
        <span className={`status-badge ${STATUS[forslag.status].tone}`}>Förslag · {STATUS[forslag.status].text}</span>
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

      {forslag.lessons.length > 0 && <>
        <div className="schema-filter">
          <fieldset><legend className="sr-only">Visa schema för</legend>
            <Button type="button" variant={by === 'class' ? 'secondary' : 'outline'} aria-pressed={by === 'class'} onClick={() => setBy('class')}>Klass</Button>
            <Button type="button" variant={by === 'teacher' ? 'secondary' : 'outline'} aria-pressed={by === 'teacher'} disabled={forslag.teachers.length === 0} onClick={() => setBy('teacher')}>Lärare</Button>
          </fieldset>
          <label>{by === 'class' ? 'Klass eller grupp' : 'Lärare'}<select value={selected} onChange={e => setChosen(e.target.value)}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        </div>
        {byTerm && <div className="schema-filter"><fieldset><legend className="schema-note">Vissa pass går bara en termin. Visa veckan under</legend>
          {forslag.time.terms.map(t => <Button key={t.term} type="button" variant={shownTerm === t.term ? 'secondary' : 'outline'} aria-pressed={shownTerm === t.term} onClick={() => setShownTerm(t.term)}>{TERM[t.term]}</Button>)}</fieldset></div>}
        <div className="schema-moves">
          <p className="schema-note">Dra ett pass till en ny tid eller till viloytan, eller välj passet för att flytta det med flyttpanelen. Varje flytt kontrolleras mot reglerna. Flyttar sparas inte: de försvinner när du lämnar sidan eller tar fram ett nytt förslag.</p>
          <div className="schema-undo">
            <Button type="button" variant="outline" disabled={utkast.undo.length === 0 || checking} onClick={() => meny.angra('undo') || void andra({ type: 'undo' })}>{villkorSteg(utkast.undo.at(-1)) ? 'Ångra senaste villkor' : 'Ångra senaste flytt'}</Button>
            <Button type="button" variant="outline" disabled={utkast.redo.length === 0 || checking} onClick={() => meny.angra('redo') || void andra({ type: 'redo' })}>Gör om</Button>
          </div>
        </div>
        {borttaget && <output className="schema-borttaget"><span className="schema-note">Villkoret är borttaget: {ruleText(borttaget.rule, forslag.resurser)}. Det gäller inte nästa förslag.</span>
          <Button ref={angraVillkor} type="button" variant="outline" onClick={angra}>Ångra borttagningen</Button></output>}
        {villkorAndrade && <p className="schema-note">Villkoren har ändrats sedan förslaget togs fram. Veckan visar de ändrade villkoren; passen och kontrollen följer förslagets villkor tills du tar fram ett nytt förslag.</p>}
        <div className="schema-verktygsrad">{meny.verktyg}
          <Lagerval layers={utkast.layers} onChange={(layer, on) => { dispatch({ type: 'layer', layer, on }); rememberLager({ ...utkast.layers, [layer]: on }); }}/></div>
        {meny.meddelande}
        <div className="schema-vecka-rad">{meny.wrap(<Vecka gridRef={week} days={forslag.days} lessons={shown} picked={picked} drop={drop && dragged ? { ...drop, length: dragged.durationMin } : null} flagged={markerade} disabled={checking}
          length={shownMin} detail={l => `${detail(l)}${termTag(l)}`} extra={l => [...passRader(l), meny.rad(l) ?? ''].filter(Boolean)} onGrab={grab} onPick={meny.onPick}
          overlays={lager?.overlays} bands={lager?.bands} dimmed={lager?.dimmed} falt={falt} namn={NAMN} {...meny.veckaProps}/>)}{meny.panel}</div>
        <Teckenforklaring lessons={shown} picked={picked} flagged={markerade} overlays={lager?.overlays} bands={lager?.bands} dimmed={lager?.dimmed} namn={NAMN}/>
        <Viloyta restRef={rest} lessons={unplaced} forslag={forslag} over={drop?.to?.day === null} dragging={drop?.lesson ?? null} disabled={checking} termTag={termTag} onGrab={grab} onPick={pick}/>
      </>}

      {pickedLesson && <Flyttpanel lesson={pickedLesson} forslag={forslag} target={target} checking={checking} shownMin={shownMin(pickedLesson)}
        extra={{ someWeeks: someWeeks(pickedLesson), termTag: termTag(pickedLesson) }} roomName={roomName} dayRef={dayField} onTarget={setTarget}
        onMove={() => void andra({ type: 'move', lesson: pickedLesson.id, day: target.day, startMin: target.startMin, room: target.room })}
        onPark={() => void andra({ type: 'park', lesson: pickedLesson.id })}
        onCancel={() => { focus.current = pickedLesson.id; dispatch({ type: 'pick', lesson: null }); }}/>}
      <output aria-live="polite" className="schema-note">{checking ? 'Flytten kontrolleras mot reglerna.' : moved}</output>
      {moveError && <div className="valplan-alert" role="alert"><p>{moveError}</p></div>}
      <Regelavvikelser kontroll={kontroll}/>
      <Forklaring diagnoses={forslag.diagnoses}/>
      <Tid forslag={forslag} deviating={deviating} off={off}/>
      <Underlag forslag={forslag}/>
    </>}
  </section>;
}
