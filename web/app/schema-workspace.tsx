'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/server-client.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { SCHEMA_REGEL_SLAG, SCHEMA_REGEL_TYPER, SCHEMA_VILLKOR_LIMITS, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaKontroll, parseSchemaVillkor, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest,
  type SchemaRegel, type SchemaRegelSlag, type SchemaRegelTyp, type SchemaTimplanDeviation, type SchemaKontroll, type SchemaKontrollRequest, type SchemaPeriod, type SchemaStatus, type SchemaTerm, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { SCHEMA_DEFAULTS } from '@/lib/schema-underlag.ts';
import './valplaner.css';
import './schema.css';

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const TERM: Record<SchemaTerm, string> = { ht: 'Höstterminen', vt: 'Vårterminen' };
const PERIOD: Record<SchemaPeriod, string> = { lasar: 'Hela läsåret', ...TERM };
const SAME_DAY: Record<SchemaVillkor['sameDay'], string> = { avoid: 'Undvik', forbid: 'Förbjud', allow: 'Tillåt' };
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
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const hoursText = (minutes: number) => `${(minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`;
const CALENDAR: Record<string, string> = { utkast: 'utkast', forslag: 'förslag', atersand: 'återsänd', faststalld: 'fastställd' };
/** Pass som överlappar i tid läggs i spalter bredvid varandra, t.ex. parallella alternativ i ett valbart block. */
function lanes(lessons: SchemaForslagLesson[]): Map<string, { lane: number; lanes: number }> {
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [], ends: number[] = [], until = -1;
  const close = () => { for (const g of group) result.set(g.id, { lane: g.lane, lanes: ends.length }); group = []; ends = []; };
  for (const l of lessons) {
    if (l.startMin! >= until) close();
    let lane = ends.findIndex(end => end <= l.startMin!);
    if (lane < 0) lane = ends.length;
    ends[lane] = l.startMin! + l.durationMin; until = Math.max(until, ends[lane]);
    group.push({ id: l.id, lane });
  }
  close();
  return result;
}
/** Starttider på startrutnätet där passet ryms inom skoldagen. */
function startTimes(forslag: SchemaForslag, day: number, durationMin: number): number[] {
  const frame = forslag.days[day], result: number[] = [];
  if (frame) for (let m = frame.startMin; m + durationMin <= frame.endMin; m += forslag.startGridMin) result.push(m);
  return result;
}
const minutesOf = (value: string) => { const [h, m] = value.split(':').map(Number); return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null; };
const steps = (from: number, to: number, step: number, current: number | null) => { const all = Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step); return current === null || all.includes(current) ? all : [...all, current].sort((a, b) => a - b); };
/** Skoldagarna i klartext: lika dagar skrivs som ett spann. */
function daysText(days: SchemaVillkor['days']): string {
  if (days.every(x => x.startMin === days[0].startMin && x.endMin === days[0].endMin)) return `${clock(days[0].startMin)}–${clock(days[0].endMin)} måndag–fredag`;
  return days.map((x, i) => `${DAYS[i].toLowerCase()} ${clock(x.startMin)}–${clock(x.endMin)}`).join(', ');
}
const SLAG: Record<SchemaRegelSlag, string> = { klass: 'Klass', grupp: 'Grupp', amne: 'Ämne', larare: 'Lärare', sal: 'Sal' };
const REGEL: Record<SchemaRegelTyp, string> = { sparrad: 'Spärrad tid', tillaten: 'Tillåten tid', marginal: 'Marginal till nästa lektion', langd: 'Uppdelning: längsta pass', antal: 'Uppdelning: antal pass per vecka', sal: 'Sal' };
const TIMPLAN: Record<SchemaTimplanDeviation, string> = { unplaced: 'Pass utan tid', weekly: 'Passen kan inte ge timplanens tid', calendar: 'Passens veckodagar ger annan tid' };
type Resurser = SchemaForslag['resurser'];
/** Ett eget villkor i klartext. Namn på klass, grupp och lärare finns först när ett förslag har tagits fram. */
function ruleText(r: SchemaRegel, resurser: Resurser | null): string {
  const name = r.slag === 'sal' || r.slag === 'amne' ? r.ref : resurser === null ? '(namnet visas när ett förslag finns)' : resurser[r.slag].find(x => x.ref === r.ref)?.name ?? '(finns inte i underlaget)';
  const when = (x: { days: number[]; startMin: number; endMin: number }) => `${x.days.length === 5 ? 'alla dagar' : [...x.days].sort((a, b) => a - b).map(i => DAYS[i].toLowerCase()).join(', ')} ${clock(x.startMin)}–${clock(x.endMin)}`;
  const what = r.typ === 'sparrad' ? `spärrad ${when(r)}` : r.typ === 'tillaten' ? `bara ${when(r)}` : r.typ === 'marginal' ? `${r.minutes} min marginal till nästa lektion`
    : r.typ === 'langd' ? `pass om högst ${r.maxMin} min` : r.typ === 'antal' ? `${r.count} pass per vecka` : 'rooms' in r ? `sal ${r.rooms.join(' eller ')}` : '';
  return `${SLAG[r.slag]} ${name}: ${what}`;
}
/** Senast använda villkor för skolan, i den här webbläsaren. Egna villkor bär appens ID för klass, grupp och lärare, aldrig namn; ämnen och salar står med namn. Inget annat lagras. */
const villkorKey = (unitId: string) => `schema-villkor:${unitId}`;
function storedVillkor(unitId: string): SchemaVillkor | null {
  try {
    const raw = window.localStorage.getItem(villkorKey(unitId)), value = raw === null ? null : JSON.parse(raw) as Record<string, unknown> | null;
    if (value === null || typeof value !== 'object') return null;
    // Villkor sparade före egna villkor får tomma listor. Valet av egna pass per termin finns inte längre (05.2-SM-TIMPLAN-EXAKT, E5).
    const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'termDiffPct'));
    return parseSchemaVillkor('egna' in rest ? rest : { ...rest, salar: [], egna: [] });
  } catch { return null; }
}
function rememberVillkor(unitId: string, villkor: SchemaVillkor): void {
  try { window.localStorage.setItem(villkorKey(unitId), JSON.stringify(villkor)); } catch { /* utan lagring gäller villkoren bara tills sidan lämnas */ }
}
const names = (ids: string[], all: { id: string; name: string }[]) => ids.map(id => all.find(x => x.id === id)?.name ?? '').filter(Boolean).join(', ');

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void };
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, onSessionLost }: Props & { unitId: string }) {
  const resultHeading = useId();
  const [period, setPeriod] = useState<SchemaPeriod>('lasar'), [villkor, setVillkor] = useState(() => storedVillkor(unitId) ?? defaultSchemaVillkor()), [shownTerm, setShownTerm] = useState<SchemaTerm>('ht');
  const issues = checkSchemaVillkor(villkor);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [forslag, setForslag] = useState<SchemaForslag | null>(null);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  // Flytt för hand (05.2-SM-FLYTT): en flytt görs först när motorns kontrollant har svarat, och inget sparas.
  const [picked, setPicked] = useState<string | null>(null), [target, setTarget] = useState<{ day: number; startMin: number; room: string | null }>({ day: 0, startMin: 0, room: null });
  const [history, setHistory] = useState<{ lesson: string; day: number | null; startMin: number | null; room: string | null }[]>([]);
  // Dra och släpp (D1): passet som dras och var det hamnar om det släpps.
  const [drop, setDrop] = useState<{ lesson: string; to: { day: number | null; startMin: number | null } | null } | null>(null);
  const [kontroll, setKontroll] = useState<SchemaKontroll | null>(null), [checking, setChecking] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null), [moved, setMoved] = useState('');
  const running = useRef<AbortController | null>(null), week = useRef<HTMLDivElement | null>(null), focus = useRef<string | null>(null), dayField = useRef<HTMLSelectElement | null>(null), rest = useRef<HTMLDivElement | null>(null), skipClick = useRef(false);
  useEffect(() => () => running.current?.abort(), []);
  useEffect(() => { if (picked) dayField.current?.focus(); }, [picked]);
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
      setForslag(next); setShownTerm('ht'); setBy('class'); setChosen(next.classes[0]?.id ?? '');
      setPicked(null); setHistory([]); setKontroll(null); setMoveError(null); setMoved('');
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
    setPicked(l.id); setMoveError(null);
  }
  /** Flyttar ett pass, eller lägger det på viloytan när `day` är null. Passet behåller sin sal om ingen annan anges; utan sal väljer servern en ledig. Hela schemat kontrolleras om. */
  async function place(lessonId: string, day: number | null, startMin: number | null, undo: boolean, room?: string | null) {
    const before = forslag?.lessons.find(l => l.id === lessonId);
    if (!forslag || !before || checking || busy) return;
    const lessons = forslag.lessons.map(l => l.id === lessonId ? { ...l, day, startMin, roomId: day === null ? null : room === undefined ? l.roomId : room } : l), controller = new AbortController();
    const request: SchemaKontrollRequest = { unitId, schoolYear, period: forslag.period, villkor: forslag.villkor, fingerprint: forslag.fingerprint,
      placements: lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]) };
    running.current = controller;
    setChecking(true); setMoveError(null); setMoved('');
    try {
      const reply = parseSchemaKontroll(await api.post<unknown>('/api/schema/kontroll', request, controller.signal), forslag.fingerprint);
      setForslag({ ...forslag, lessons: lessons.map(l => ({ ...l, roomId: l.day === null ? null : reply.rooms[l.id] ?? null })), teachings: reply.teachings, metrics: reply.metrics });
      focus.current = lessonId; setKontroll(reply); setPicked(null);
      setHistory(undo ? history.slice(0, -1) : [...history, { lesson: lessonId, day: before.day, startMin: before.startMin, room: before.roomId }]);
      setMoved(`${before.title} ${day === null || startMin === null ? 'ligger nu på viloytan' : `ligger nu ${DAYS[day].toLowerCase()} ${clock(startMin)}`}. ${reply.total === 0 ? 'Inga regelavvikelser.' : `${reply.total} ${reply.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}.`}`);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setMoveError(moveMessage(caught));
    } finally { if (running.current === controller) { running.current = null; setChecking(false); } }
  }
  /** Dra ett pass med mus eller penna till en ny tid eller till viloytan. Pekskärm och staplad vy använder flyttpanelen. */
  function grab(e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) {
    const grid = week.current, f = forslag;
    if (!f || !grid || checking || busy || e.pointerType === 'touch' || e.button !== 0 || !grid.querySelector<HTMLElement>('.schema-hours')?.offsetParent) return;
    const columns = [...grid.querySelectorAll<HTMLElement>('ol[data-day]')], span = end - start, own = e.currentTarget.closest('ol[data-day]')?.getBoundingClientRect();
    // Var i passet pekaren håller, i minuter från passets början.
    const held = own ? (e.clientY - e.currentTarget.getBoundingClientRect().top) * span / own.height : Math.min(15, l.durationMin / 2);
    const at = (x: number, y: number) => {
      const r = rest.current?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { day: null, startMin: null };
      for (const column of columns) {
        const box = column.getBoundingClientRect(), day = Number(column.dataset.day);
        if (x < box.left || x > box.right || y < box.top - 24 || y > box.bottom + 24) continue;
        const starts = startTimes(f, day, l.durationMin + l.marginMin), wanted = start + (y - box.top) * span / box.height - held;
        return starts.length ? { day, startMin: starts.reduce((best, m) => Math.abs(m - wanted) < Math.abs(best - wanted) ? m : best) } : null;
      }
      return null;
    };
    const origin = { x: e.clientX, y: e.clientY };
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - origin.x, ev.clientY - origin.y) < 6) return;
      active = true; ev.preventDefault();
      setDrop({ lesson: l.id, to: at(ev.clientX, ev.clientY) });
    };
    const done = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
      setDrop(null);
      if (!active) return;
      // Släppet ska inte också räknas som ett klick på passet.
      skipClick.current = true; window.setTimeout(() => { skipClick.current = false; }, 0);
      const to = ev.type === 'pointerup' ? at(ev.clientX, ev.clientY) : null;
      if (to && (to.day !== l.day || to.startMin !== l.startMin)) void place(l.id, to.day, to.startMin, false);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
  }
  const last = history.at(-1), pickedLesson = forslag?.lessons.find(l => l.id === picked) ?? null;
  const flagged = new Set(kontroll?.violations.flatMap(v => v.lessons));

  const options = forslag ? (by === 'class' ? forslag.classes : forslag.teachers) : [];
  const selected = options.some(o => o.id === chosen) ? chosen : options[0]?.id ?? '';
  const byTerm = forslag?.lessons.some(l => l.term !== null) ?? false, termTag = (l: SchemaForslagLesson) => l.term ? ` · ${l.term.toUpperCase()}` : '';
  const mine = (l: SchemaForslagLesson) => (l.term === null || l.term === shownTerm) && (by === 'class' ? l.classIds : l.teacherIds).includes(selected);
  const roomName = (id: string | null) => forslag?.rooms.find(r => r.id === id)?.name ?? '';
  const detail = (l: SchemaForslagLesson) => forslag ? [by === 'class' ? (l.vacant && l.teacherIds.length === 0 ? 'Ingen lärare' : names(l.teacherIds, forslag.teachers)) : names(l.classIds, forslag.classes), roomName(l.roomId)].filter(Boolean).join(' · ') : '';
  const dragged = drop ? forslag?.lessons.find(l => l.id === drop.lesson) ?? null : null;
  const unplaced = forslag?.lessons.filter(l => l.day === null) ?? [];
  const start = forslag ? Math.min(...forslag.days.map(d => d.startMin)) : 0, end = forslag ? Math.max(...forslag.days.map(d => d.endMin)) : 0;
  const hours = forslag ? Array.from({ length: Math.floor(end / 60) - Math.ceil(start / 60) + 1 }, (_, i) => (Math.ceil(start / 60) + i) * 60) : [];
  const d = SCHEMA_DEFAULTS;
  const order = (t: SchemaForslag['teachings'][number]) => t.deviation === null ? 3 : t.deviation === 'calendar' ? 2 : t.deviation === 'weekly' ? 1 : 0;
  const deviating = forslag ? [...forslag.teachings].sort((a, b) => order(a) - order(b) || Math.abs(b.plannedMin - b.needMin) - Math.abs(a.plannedMin - a.needMin)) : [];
  // Timplanen är ram (T1): tid under timplanen eller över avrundningen uppåt, pass utan tid och utelämnad undervisning är avvikelser (05.2-SM-TIMPLAN-EXAKT).
  const off = forslag ? forslag.teachings.filter(t => t.deviation !== null).length + forslag.omitted.filter(o => o.reason !== 'no_time').length : 0;

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
        {history.length > 0 && <span className="status-badge warning">Ändrat för hand · {history.length} {history.length === 1 ? 'flytt' : 'flyttar'}</span>}
        {kontroll && kontroll.total > 0 && <span className="status-badge warning">{kontroll.total} {kontroll.total === 1 ? 'regelavvikelse' : 'regelavvikelser'}</span>}
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
          <Button type="button" variant="outline" disabled={!last || checking} onClick={() => { if (last) void place(last.lesson, last.day, last.startMin, true, last.room); }}>Ångra senaste flytt</Button>
        </div>
        <div ref={week} className="schema-week" style={{ '--days': forslag.days.length, '--span': end - start, '--first-hour': (hours[0] ?? start) - start } as CSSProperties}>
          <div className="schema-hours" aria-hidden="true">{hours.map(h => <span key={h} style={{ '--at': h - start } as CSSProperties}>{clock(h)}</span>)}</div>
          {forslag.days.map((_, day) => {
            const lessons = forslag.lessons.filter(l => l.day === day && l.startMin !== null && mine(l)).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id));
            const lane = lanes(lessons);
            return <section className="schema-day" key={day} aria-label={DAYS[day] ?? `Dag ${day + 1}`}>
              <h3>{DAYS[day] ?? `Dag ${day + 1}`}</h3>
              <ol data-day={day}>{lessons.map(l => <li key={l.id} className={`schema-lesson${l.vacant ? ' vacant' : ''}${flagged.has(l.id) ? ' deviation' : ''}${picked === l.id ? ' picked' : ''}${drop?.lesson === l.id ? ' dragging' : ''}`} style={{ '--start': l.startMin! - start, '--length': l.durationMin, '--lane': lane.get(l.id)!.lane, '--lanes': lane.get(l.id)!.lanes } as CSSProperties}>
                <button type="button" data-lesson={l.id} aria-pressed={picked === l.id} disabled={checking} title="Flytta passet" onPointerDown={e => grab(e, l)} onClick={() => pick(l)}>
                  <time>{clock(l.startMin!)}–{clock(l.startMin! + l.durationMin)}</time><strong>{l.title}</strong>{flagged.has(l.id) && <em>Regelavvikelse</em>}<span>{detail(l)}{termTag(l)}</span></button></li>)}
                {dragged && drop?.to?.day === day && drop.to.startMin !== null && <li className="schema-lesson schema-drop" aria-hidden="true" style={{ '--start': drop.to.startMin - start, '--length': dragged.durationMin } as CSSProperties}>
                  <time>{clock(drop.to.startMin)}–{clock(drop.to.startMin + dragged.durationMin)}</time></li>}
                {lessons.length === 0 && <li className="schema-free">Inga pass</li>}</ol>
            </section>;
          })}
        </div>
        <div ref={rest} className={`schema-list schema-rest${drop?.to && drop.to.day === null ? ' over' : ''}`}><h2>Viloyta ({unplaced.length})</h2>
          <p className="schema-note">Pass utan tid ligger här. Dra ett pass hit för att ta det ur veckan, och härifrån ut i veckan för att lägga det. Pass på viloytan räknas som avvikelse från timplanen.</p>
          {unplaced.length === 0 ? <p className="schema-note">Inga pass på viloytan.</p>
            : <ul className="schema-unplaced">{unplaced.map(l => <li key={l.id} className={drop?.lesson === l.id ? 'dragging' : undefined} onPointerDown={e => grab(e, l)}><span>{l.title}, {l.durationMin} min{termTag(l)} · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}</span>
              <Button type="button" variant="outline" size="sm" disabled={checking} aria-label={`Lägg ut ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => pick(l)}>Lägg ut</Button></li>)}</ul>}</div>
      </>}

      {pickedLesson && <form className="schema-move" aria-label="Flytta pass" onSubmit={e => { e.preventDefault(); void place(pickedLesson.id, target.day, target.startMin, false, target.room); }}>
        <p><strong>{pickedLesson.title}</strong>, {pickedLesson.durationMin} min{pickedLesson.marginMin > 0 && ` och ${pickedLesson.marginMin} min marginal`}{termTag(pickedLesson)} · {names(pickedLesson.classIds, forslag.classes)}{pickedLesson.teacherIds.length > 0 && ` · ${names(pickedLesson.teacherIds, forslag.teachers)}`}
          <span className="schema-note"> {pickedLesson.day === null || pickedLesson.startMin === null ? 'Ligger på viloytan.' : `Ligger nu ${DAYS[pickedLesson.day].toLowerCase()} ${clock(pickedLesson.startMin)}${pickedLesson.roomId ? ` i ${roomName(pickedLesson.roomId)}` : ''}.`}</span></p>
        <label>Dag<select ref={dayField} value={target.day} disabled={checking} onChange={e => { const day = Number(e.target.value), starts = startTimes(forslag, day, pickedLesson.durationMin + pickedLesson.marginMin); setTarget({ ...target, day, startMin: starts.includes(target.startMin) ? target.startMin : starts[0] ?? target.startMin }); }}>
          {forslag.days.map((_, day) => <option key={day} value={day}>{DAYS[day] ?? `Dag ${day + 1}`}</option>)}</select></label>
        <label>Starttid<select value={target.startMin} disabled={checking} onChange={e => setTarget({ ...target, startMin: Number(e.target.value) })}>
          {startTimes(forslag, target.day, pickedLesson.durationMin + pickedLesson.marginMin).map(m => <option key={m} value={m}>{clock(m)}–{clock(m + pickedLesson.durationMin)}</option>)}</select></label>
        {pickedLesson.roomIds.length > 1 && <label>Sal<select value={target.room ?? ''} disabled={checking} onChange={e => setTarget({ ...target, room: e.target.value || null })}>
          <option value="">Första lediga</option>{pickedLesson.roomIds.map(id => <option key={id} value={id}>{roomName(id)}</option>)}</select></label>}
        <Button type="submit" disabled={checking || target.day === pickedLesson.day && target.startMin === pickedLesson.startMin && target.room === pickedLesson.roomId}>{checking ? 'Kontrollerar…' : 'Flytta hit'}</Button>
        {pickedLesson.day !== null && <Button type="button" variant="outline" disabled={checking} onClick={() => void place(pickedLesson.id, null, null, false)}>Lägg på viloytan</Button>}
        <Button type="button" variant="outline" disabled={checking} onClick={() => { focus.current = pickedLesson.id; setPicked(null); }}>Avbryt</Button>
      </form>}
      <output aria-live="polite" className="schema-note">{checking ? 'Flytten kontrolleras mot reglerna.' : moved}</output>
      {moveError && <div className="valplan-alert" role="alert"><p>{moveError}</p></div>}
      {kontroll && <div className="schema-list"><h2>Regelavvikelser ({kontroll.total})</h2>
        {kontroll.total === 0 ? <p>Inga regler bryts av schemat som det ligger nu.</p> : <>
          <p className="schema-note">Schemat som det ligger nu bryter mot reglerna nedan. Passen är märkta i schemat. Flytta ett pass eller ångra för att rätta.</p>
          <ul>{kontroll.violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
          {kontroll.total > kontroll.violations.length && <p className="schema-note">Visar {kontroll.violations.length} av {kontroll.total}.</p>}</>}</div>}

      {forslag.diagnoses.length > 0 && <div className="schema-list"><h2>Schemamotorns förklaring</h2>
        <ul>{forslag.diagnoses.map((x, i) => <li key={i}>{x.message}{x.proof && ' (Bevisat: det går inte med det här underlaget.)'}</li>)}</ul></div>}
      {deviating.length > 0 && <details className="schema-list"><summary><h2>Tid över {forslag.period === 'lasar' ? 'läsåret' : 'terminen'} ({deviating.length})</h2>
        <span className="schema-note">{off === 0 ? 'All undervisning följer timplanen.' : `${off} av ${deviating.length} skiljer sig från timplanen.`}</span></summary>
        <p className="schema-note">Timplanen bestämmer hur mycket undervisning som läggs; villkor och flytt ändrar bara när och var. Utlagd tid är passens längd gånger antalet skoldagar på passets veckodag under den tid passet går. Den ska vara minst timplanens tid och får bara vara mer genom avrundning uppåt till hela 5 minuter per vecka. Avvikelser står först.</p>
        <Table><TableHeader><TableRow><TableHead>Undervisning</TableHead><TableHead>Klass</TableHead><TableHead>Timplan</TableHead><TableHead>Utlagt</TableHead><TableHead>Skillnad</TableHead><TableHead>Följer timplanen</TableHead></TableRow></TableHeader>
          <TableBody>{deviating.map((t, i) => <TableRow key={i}><TableCell>{t.title}</TableCell><TableCell>{t.classes.join(', ') || '–'}</TableCell><TableCell>{hoursText(t.needMin)}</TableCell>
            <TableCell>{hoursText(t.plannedMin)}{t.unplaced > 0 && ` (${t.unplaced} pass utan tid)`}</TableCell>
            <TableCell>{t.plannedMin > t.needMin ? '+' : t.plannedMin < t.needMin ? '−' : ''}{hoursText(Math.abs(t.plannedMin - t.needMin))}</TableCell>
            <TableCell>{t.deviation ? `Nej: ${TIMPLAN[t.deviation].toLowerCase()}` : 'Ja'}</TableCell></TableRow>)}</TableBody></Table></details>}
      <div className="schema-list"><h2>Elever och grupper</h2>
        {forslag.members.pupils === 0
          ? <p>Inga elever med klass eller grupp kunde läsas för läsåret. Ett valbart block läggs då som ett gemensamt pass och en grupp upptar hela sina klasser.</p>
          : <ul>
            <li>{forslag.members.pupils} elevers klasser och gruppmedlemskap under {forslag.period === 'lasar' ? 'läsåret' : 'terminen'} avgör vilka pass som inte får gå samtidigt.</li>
            {forslag.members.withoutChoice.map((x, i) => <li key={i}>{x.title}: {x.count} {x.count === 1 ? 'elev' : 'elever'} i blockets klasser har ingen grupp och räknas som lediga när blocket går.</li>)}
            {forslag.members.groupsWithoutMembers.length > 0 && <li>Grupper utan elever ({forslag.members.groupsWithoutMembers.length}): {forslag.members.groupsWithoutMembers.join(', ')}. En sådan grupp upptar hela sina klasser, eller ingen elev om den hör till ett block där andra grupper har elever.</li>}
            {forslag.members.classesWithoutPupils.length > 0 && <li>Klasser utan elever i registret: {forslag.members.classesWithoutPupils.join(', ')}. De räknas som odelade klasser.</li>}
          </ul>}</div>
      {forslag.omitted.length > 0 && <div className="schema-list"><h2>Inte med i förslaget ({forslag.omitted.length})</h2>
        <ul>{forslag.omitted.map((o, i) => <li key={i}>{o.title} · {o.classes.join(', ')}: {o.reason === 'too_short' ? `mindre än ${forslag.villkor.minLessonMin} min i veckan` : o.reason === 'no_days' ? 'inga skoldagar' : 'ingen tid angiven'}</li>)}</ul></div>}
      <div className="schema-list"><h2>Villkor och antaganden i förslaget</h2>
        <ul>
          <li>Skoldag {daysText(forslag.villkor.days)}. {forslag.villkor.breakMin} min rast mellan pass, starttider var {forslag.villkor.startGridMin}:e minut.</li>
          <li>{forslag.villkor.lunch ? `Lunch ${forslag.villkor.lunch.lengthMin} min mellan ${clock(forslag.villkor.lunch.startMin)} och ${clock(forslag.villkor.lunch.endMin)} för elever${forslag.villkor.lunch.teachers ? ' och lärare' : ''}.` : 'Ingen lunch läggs in.'}</li>
          <li>Pass om högst {forslag.villkor.maxLessonMin} min. Samma ämne samma dag: {SAME_DAY[forslag.villkor.sameDay].toLowerCase()}.{forslag.villkor.lateAfterMin !== null && ` Pass efter ${clock(forslag.villkor.lateAfterMin)} undviks.`}</li>
          {(forslag.villkor.studentMaxMinPerDay !== null || forslag.villkor.teacherMaxMinPerDay !== null) && <li>Högsta undervisningstid per dag:{forslag.villkor.studentMaxMinPerDay !== null && ` elever ${hoursText(forslag.villkor.studentMaxMinPerDay)}`}{forslag.villkor.studentMaxMinPerDay !== null && forslag.villkor.teacherMaxMinPerDay !== null && ','}{forslag.villkor.teacherMaxMinPerDay !== null && ` lärare ${hoursText(forslag.villkor.teacherMaxMinPerDay)}`}.</li>}
          <li>Timplanens tid läggs alltid ut: varje termin minst timplanens minuter och högst så mycket mer som avrundning uppåt till hela 5 minuter per vecka ger. Motorn väljer veckodagar efter hur många skoldagar varje veckodag har. {forslag.period === 'lasar' ? 'Undervisning med samma veckotid båda terminerna och samma lärare får samma pass hela läsåret; annars egna pass per termin.' : 'Samma veckoschema gäller hela terminen.'}</li>
          {forslag.villkor.egna.map((r, i) => <li key={i}>Eget villkor: {ruleText(r, forslag.resurser)}.{forslag.egnaUtanTraff.includes(i) && ' Träffade inget i underlaget och användes inte.'}</li>)}
          {forslag.villkor.egna.some(r => r.typ === 'marginal') && <li>Marginal till nästa lektion gäller passets lärare och elever. Den räknas in i dagens undervisningstid, och passet måste sluta marginalen före skoldagens slut.</li>}
          <li>{forslag.rooms.length > 0 ? `Salar: ${forslag.rooms.map(r => r.name).join(', ')}. Bara pass med ett salsvillkor får en sal.` : 'Inga salar är angivna; passen läggs utan sal.'}</li>
          <li>Flytt för hand kontrolleras mot samma regler som förslaget. En flytt som bryter en regel görs ändå och visas som regelavvikelse.</li>
          <li>Pass med streckad kant saknar lärare i tjänstefördelningen.</li>
        </ul></div>
    </>}
  </section>;
}

/** Villkoren för schemat (05.2-SM-LASAR-VILLKOR, V2). Värdena prövas här och igen på servern. */
function Villkor({ value: v, disabled, issues, resurser, onChange }: { value: SchemaVillkor; disabled: boolean; issues: string[]; resurser: Resurser | null; onChange: (next: SchemaVillkor) => void }) {
  const L = SCHEMA_VILLKOR_LIMITS, set = (patch: Partial<SchemaVillkor>) => onChange({ ...v, ...patch });
  const time = (label: string, minutes: number, change: (minutes: number) => void, hidden = false) => <label className={hidden ? 'schema-time bare' : 'schema-time'}><span className={hidden ? 'sr-only' : undefined}>{label}</span>
    <input type="time" step={300} required disabled={disabled} value={clock(minutes)} onChange={e => { const next = minutesOf(e.target.value); if (next !== null) change(next); }}/></label>;
  const choice = (label: string, current: number | null, options: number[], change: (next: number | null) => void, text: (n: number) => string, none?: string) => <label>{label}
    <select disabled={disabled} value={current ?? ''} onChange={e => change(e.target.value === '' ? null : Number(e.target.value))}>
      {none !== undefined && <option value="">{none}</option>}{options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  const min = (n: number) => `${n} min`, day = (i: number, patch: Partial<SchemaVillkor['days'][number]>) => set({ days: v.days.map((x, at) => at === i ? { ...x, ...patch } : x) });
  const lunch = v.lunch ?? defaultSchemaVillkor().lunch!, late = v.lateAfterMin ?? defaultSchemaVillkor().lateAfterMin!;
  const changed = JSON.stringify(v) !== JSON.stringify(defaultSchemaVillkor());
  return <details className="schema-list schema-villkor schema-wide">
    <summary><h2>Villkor för schemat</h2><span className="schema-note">{changed ? 'Ändrade' : 'Förval'}: skoldag {daysText(v.days)}, pass högst {v.maxLessonMin} min, {v.lunch ? `lunch ${v.lunch.lengthMin} min` : 'ingen lunch'}{v.egna.length > 0 && `, ${v.egna.length} egna villkor`}.</span></summary>
    <p className="schema-note">Villkoren gäller nästa förslag. De sparas inte i systemet; den här webbläsaren minns dem för skolan när ett förslag har tagits fram.</p>
    {issues.length > 0 && <div className="valplan-alert" role="alert"><p>Rätta villkoren för att kunna ta fram ett förslag:</p><ul>{issues.map(x => <li key={x}>{x}</li>)}</ul></div>}
    <div className="schema-villkor-groups">
      <fieldset disabled={disabled}><legend>Skoldag</legend>
        {v.days.map((x, i) => <div className="schema-villkor-day" key={i}><span>{DAYS[i]}</span>
          {time(`${DAYS[i]} börjar`, x.startMin, startMin => day(i, { startMin }), true)}{time(`${DAYS[i]} slutar`, x.endMin, endMin => day(i, { endMin }), true)}</div>)}
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ days: v.days.map(() => ({ ...v.days[0] })) })}>Samma tider som måndag alla dagar</Button>
      </fieldset>
      <fieldset disabled={disabled}><legend>Pass och raster</legend>
        {choice('Längsta pass', v.maxLessonMin, steps(L.maxLesson[0], L.maxLesson[1], 5, v.maxLessonMin), n => set({ maxLessonMin: n ?? v.maxLessonMin }), min)}
        {choice('Kortaste pass', v.minLessonMin, steps(L.minLesson, Math.max(L.minLesson, Math.floor(v.maxLessonMin / 10) * 5), 5, v.minLessonMin), n => set({ minLessonMin: n ?? v.minLessonMin }), min)}
        {choice('Rast mellan pass', v.breakMin, steps(L.breakMin[0], L.breakMin[1], 5, v.breakMin), n => set({ breakMin: n ?? v.breakMin }), min)}
        {choice('Pass får börja', v.startGridMin, [...L.startGrid], n => set({ startGridMin: n ?? v.startGridMin }), n => `var ${n}:e minut`)}
        <label>Samma ämne flera gånger samma dag<select disabled={disabled} value={v.sameDay} onChange={e => set({ sameDay: e.target.value as SchemaVillkor['sameDay'] })}>
          {(['avoid', 'forbid', 'allow'] as const).map(x => <option key={x} value={x}>{SAME_DAY[x]}</option>)}</select></label>
      </fieldset>
      <fieldset disabled={disabled}><legend>Lunch</legend>
        <label className="schema-check"><input type="checkbox" checked={v.lunch !== null} onChange={e => set({ lunch: e.target.checked ? lunch : null })}/>Lägg in lunch varje dag</label>
        {v.lunch && <>
          {time('Lunch tidigast', lunch.startMin, startMin => set({ lunch: { ...lunch, startMin } }))}
          {time('Lunch slut senast', lunch.endMin, endMin => set({ lunch: { ...lunch, endMin } }))}
          {choice('Lunchens längd', lunch.lengthMin, steps(L.lunchLength[0], L.lunchLength[1], 5, lunch.lengthMin), n => set({ lunch: { ...lunch, lengthMin: n ?? lunch.lengthMin } }), min)}
          <label className="schema-check"><input type="checkbox" checked={lunch.teachers} onChange={e => set({ lunch: { ...lunch, teachers: e.target.checked } })}/>Lärare ska också få lunch</label></>}
      </fieldset>
      <fieldset disabled={disabled}><legend>Dagens längd</legend>
        <label className="schema-check"><input type="checkbox" checked={v.lateAfterMin !== null} onChange={e => set({ lateAfterMin: e.target.checked ? late : null })}/>Undvik sena pass</label>
        {v.lateAfterMin !== null && time('Sent räknas efter', late, lateAfterMin => set({ lateAfterMin }))}
        {choice('Högst undervisning per dag, elever', v.studentMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, v.studentMaxMinPerDay), n => set({ studentMaxMinPerDay: n }), hoursText, 'Ingen gräns')}
        {choice('Högst undervisning per dag, lärare', v.teacherMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, v.teacherMaxMinPerDay), n => set({ teacherMaxMinPerDay: n }), hoursText, 'Ingen gräns')}
      </fieldset>
      <Egna value={v} disabled={disabled} resurser={resurser} onChange={onChange}/>
    </div>
    <div><Button type="button" variant="outline" disabled={disabled || !changed} onClick={() => onChange(defaultSchemaVillkor())}>Återställ förval</Button></div>
  </details>;
}

/** Salar och egna villkor per klass, grupp, ämne, lärare och sal (05.2-SM-VILLKOR-PER-RESURS, R1–R6). */
function Egna({ value: v, disabled, resurser, onChange }: { value: SchemaVillkor; disabled: boolean; resurser: Resurser | null; onChange: (next: SchemaVillkor) => void }) {
  const L = SCHEMA_VILLKOR_LIMITS;
  const [sal, setSal] = useState('');
  const [draft, setDraft] = useState({ slag: 'klass' as SchemaRegelSlag, ref: '', typ: 'sparrad' as SchemaRegelTyp, days: [0, 1, 2, 3, 4], startMin: 480, endMin: 720, minutes: 15, maxMin: 60, count: 2, rooms: [] as string[] });
  const name = sal.trim(), canAddSal = name.length > 0 && name.length <= L.salNamn && v.salar.length < L.salar && !v.salar.some(x => x.toLowerCase() === name.toLowerCase());
  const addSal = () => { if (canAddSal) { onChange({ ...v, salar: [...v.salar, name] }); setSal(''); } };
  // En sal som tas bort tas också bort ur villkoren.
  const removeSal = (room: string) => onChange({ ...v, salar: v.salar.filter(x => x !== room),
    egna: v.egna.flatMap((r): SchemaRegel[] => r.slag === 'sal' && r.ref === room ? [] : !('rooms' in r) ? [r] : r.rooms.some(x => x !== room) ? [{ slag: r.slag, ref: r.ref, typ: 'sal', rooms: r.rooms.filter(x => x !== room) }] : []) });
  // Före första förslaget är bara salarna kända.
  const slagen = SCHEMA_REGEL_SLAG.filter(x => x === 'sal' ? v.salar.length > 0 : resurser !== null && resurser[x].length > 0);
  const slag = slagen.includes(draft.slag) ? draft.slag : slagen[0] ?? null;
  const choices = slag === null ? [] : slag === 'sal' ? v.salar.map(x => ({ ref: x, name: x })) : resurser?.[slag] ?? [];
  const ref = choices.some(c => c.ref === draft.ref) ? draft.ref : choices[0]?.ref ?? '';
  const types = slag === null ? [] : SCHEMA_REGEL_TYPER[slag].filter(t => t !== 'sal' || v.salar.length > 0), typ = types.includes(draft.typ) ? draft.typ : types[0];
  const rooms = draft.rooms.filter(x => v.salar.includes(x));
  const rule: SchemaRegel | null = slag === null || !ref || !typ ? null
    : typ === 'sparrad' || typ === 'tillaten' ? (draft.days.length > 0 && draft.startMin < draft.endMin ? { slag, ref, typ, days: [...draft.days].sort((a, b) => a - b), startMin: draft.startMin, endMin: draft.endMin } : null)
    : typ === 'marginal' ? { slag, ref, typ, minutes: draft.minutes } : typ === 'langd' ? { slag, ref, typ, maxMin: draft.maxMin } : typ === 'antal' ? { slag, ref, typ, count: draft.count }
    : rooms.length > 0 ? { slag, ref, typ, rooms } : null;
  const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const time = (label: string, minutes: number, change: (minutes: number) => void) => <label className="schema-time">{label}
    <input type="time" step={300} required value={clock(minutes)} onChange={e => { const next = minutesOf(e.target.value); if (next !== null) change(next); }}/></label>;
  const number = (label: string, current: number, options: number[], change: (n: number) => void, text: (n: number) => string) => <label>{label}
    <select value={current} onChange={e => change(Number(e.target.value))}>{options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  return <>
    <fieldset disabled={disabled}><legend>Salar</legend>
      <p className="schema-note">Ange de salar som villkor ska kunna gälla, till exempel idrottshallen eller en labbsal. Pass utan salsvillkor läggs utan sal.</p>
      <label>Salens namn<input type="text" maxLength={L.salNamn} value={sal} onChange={e => setSal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSal(); } }}/></label>
      <div><Button type="button" variant="outline" size="sm" disabled={disabled || !canAddSal} onClick={addSal}>Lägg till sal</Button></div>
      {v.salar.length > 0 && <ul className="schema-egna" aria-label="Salar">{v.salar.map(x => <li key={x}><span>{x}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort sal ${x}`} onClick={() => removeSal(x)}>Ta bort</Button></li>)}</ul>}
    </fieldset>
    <fieldset disabled={disabled} className="schema-wide"><legend>Egna villkor</legend>
      <p className="schema-note">Ett eget villkor gäller en klass, en grupp, ett ämne, en lärare eller en sal. Villkoren styr när och var passen läggs och hur veckotiden delas i pass. Hur mycket undervisning som läggs bestäms alltid av timplanen.</p>
      {resurser === null && <p className="schema-note">Ta fram ett första förslag för att kunna välja klass, grupp, ämne och lärare.</p>}
      {slag !== null && <div className="schema-egna-form">
        <label>Gäller<select value={slag} onChange={e => setDraft({ ...draft, slag: e.target.value as SchemaRegelSlag, ref: '' })}>{slagen.map(x => <option key={x} value={x}>{SLAG[x]}</option>)}</select></label>
        <label>{SLAG[slag]}<select value={ref} onChange={e => setDraft({ ...draft, ref: e.target.value })}>{choices.map(c => <option key={c.ref} value={c.ref}>{c.name}</option>)}</select></label>
        <label>Villkor<select value={typ} onChange={e => setDraft({ ...draft, typ: e.target.value as SchemaRegelTyp })}>{types.map(t => <option key={t} value={t}>{REGEL[t]}</option>)}</select></label>
        {(typ === 'sparrad' || typ === 'tillaten') && <>
          <fieldset className="schema-days schema-wide"><legend className="sr-only">Veckodagar</legend>{DAYS.slice(0, 5).map((d, i) => <label key={d} className="schema-check">
            <input type="checkbox" checked={draft.days.includes(i)} onChange={e => setDraft({ ...draft, days: e.target.checked ? [...draft.days, i] : draft.days.filter(x => x !== i) })}/>{d}</label>)}</fieldset>
          {time('Från', draft.startMin, startMin => setDraft({ ...draft, startMin }))}{time('Till', draft.endMin, endMin => setDraft({ ...draft, endMin }))}</>}
        {typ === 'marginal' && number('Marginal', draft.minutes, range(L.marginal[0], L.marginal[1], 5), minutes => setDraft({ ...draft, minutes }), n => `${n} min`)}
        {typ === 'langd' && number('Längsta pass', draft.maxMin, range(L.maxLesson[0], L.maxLesson[1], 5), maxMin => setDraft({ ...draft, maxMin }), n => `${n} min`)}
        {typ === 'antal' && number('Pass per vecka', draft.count, range(L.antal[0], L.antal[1], 1), count => setDraft({ ...draft, count }), n => String(n))}
        {typ === 'sal' && <fieldset className="schema-days schema-wide"><legend className="sr-only">Salar för villkoret</legend>{v.salar.map(x => <label key={x} className="schema-check">
          <input type="checkbox" checked={rooms.includes(x)} onChange={e => setDraft({ ...draft, rooms: e.target.checked ? [...rooms, x] : rooms.filter(y => y !== x) })}/>{x}</label>)}</fieldset>}
        <div><Button type="button" variant="outline" disabled={disabled || rule === null || v.egna.length >= L.egna} onClick={() => { if (rule) onChange({ ...v, egna: [...v.egna, rule] }); }}>Lägg till villkor</Button></div>
      </div>}
      {v.egna.length > 0 && <ul className="schema-egna" aria-label="Egna villkor">{v.egna.map((r, i) => <li key={i}><span>{ruleText(r, resurser)}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort villkoret ${ruleText(r, resurser)}`} onClick={() => onChange({ ...v, egna: v.egna.filter((_, at) => at !== i) })}>Ta bort</Button></li>)}</ul>}
    </fieldset>
  </>;
}
