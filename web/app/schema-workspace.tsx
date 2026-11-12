'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { parseSchemaForslag, SCHEMA_LIMITS, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest, type SchemaStatus, type SchemaTerm } from '@/lib/schema-contract.ts';
import { SCHEMA_DEFAULTS } from '@/lib/schema-underlag.ts';
import './valplaner.css';
import './schema.css';

const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'];
const TERM: Record<SchemaTerm, string> = { ht: 'Höstterminen', vt: 'Vårterminen' };
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
    if (error.status === 400) return 'Kontrollera antalet undervisningsveckor.';
  }
  return 'Schemaförslaget kunde inte tas fram. Försök igen.';
}
const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const names = (ids: string[], all: { id: string; name: string }[]) => ids.map(id => all.find(x => x.id === id)?.name ?? '').filter(Boolean).join(', ');

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void };
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, onSessionLost }: Props & { unitId: string }) {
  const weeksHelp = useId(), resultHeading = useId();
  const [term, setTerm] = useState<SchemaTerm>('ht'), [weeks, setWeeks] = useState<string>(String(SCHEMA_DEFAULTS.weeks.ht));
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [forslag, setForslag] = useState<SchemaForslag | null>(null);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  const weekCount = /^\d{1,2}$/u.test(weeks.trim()) ? Number(weeks.trim()) : NaN;
  const weeksValid = weekCount >= SCHEMA_LIMITS.weeksMin && weekCount <= SCHEMA_LIMITS.weeksMax;
  async function run() {
    if (!weeksValid || busy) return;
    const request: SchemaForslagRequest = { unitId, schoolYear, term, weeks: weekCount }, controller = new AbortController();
    running.current = controller;
    setBusy(true); setError(null);
    try {
      const next = parseSchemaForslag(await api.post<unknown>('/api/schema/forslag', request, controller.signal), request);
      setForslag(next); setBy('class'); setChosen(next.classes[0]?.id ?? '');
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { if (running.current === controller) { running.current = null; setBusy(false); } }
  }

  const options = forslag ? (by === 'class' ? forslag.classes : forslag.teachers) : [];
  const selected = options.some(o => o.id === chosen) ? chosen : options[0]?.id ?? '';
  const mine = (l: SchemaForslagLesson) => (by === 'class' ? l.classIds : l.teacherIds).includes(selected);
  const detail = (l: SchemaForslagLesson) => forslag ? (by === 'class' ? (l.vacant && l.teacherIds.length === 0 ? 'Ingen lärare' : names(l.teacherIds, forslag.teachers)) : names(l.classIds, forslag.classes)) : '';
  const unplaced = forslag?.lessons.filter(l => l.day === null) ?? [];
  const start = forslag ? Math.min(...forslag.days.map(d => d.startMin)) : 0, end = forslag ? Math.max(...forslag.days.map(d => d.endMin)) : 0;
  const hours = forslag ? Array.from({ length: Math.floor(end / 60) - Math.ceil(start / 60) + 1 }, (_, i) => (Math.ceil(start / 60) + i) * 60) : [];
  const d = SCHEMA_DEFAULTS;

  return <section className="valplan-workspace schema-workspace">
    <div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1><p>Läsår {planningYearLabel(schoolYear)}. Förslaget räknas ur skolans tjänstefördelning. Det sparas inte och publiceras inte.</p></div></div>
    <form className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Termin<select value={term} disabled={busy} onChange={e => { const next = e.target.value as SchemaTerm; setTerm(next); setWeeks(String(d.weeks[next])); }}>
        <option value="ht">{TERM.ht}</option><option value="vt">{TERM.vt}</option></select></label>
      <label>Undervisningsveckor<input inputMode="numeric" value={weeks} disabled={busy} aria-invalid={!weeksValid} aria-describedby={weeksHelp} onChange={e => setWeeks(e.target.value)}/></label>
      <Button type="submit" disabled={busy || !weeksValid}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>
      <p id={weeksHelp} className={weeksValid ? 'schema-note' : 'valplan-field-error'} style={{ gridColumn: '1 / -1' }}>
        {weeksValid ? 'Terminens tid delas på antalet veckor. Läsårskalenderns veckor läses inte in än.' : `Ange ${SCHEMA_LIMITS.weeksMin}–${SCHEMA_LIMITS.weeksMax} veckor.`}</p>
    </form>
    <output aria-live="polite" className="schema-note">{busy ? `Schemamotorn räknar. Det tar upp till ${d.solveTimeMs / 1000} sekunder.` : ''}</output>
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {!forslag && !busy && !error && <p className="empty-state">Inget förslag ännu. Välj termin och ta fram ett schemaförslag.</p>}

    {forslag && <>
      <div className="schema-summary" aria-labelledby={resultHeading}>
        <h2 id={resultHeading} className="sr-only">Schemaförslag</h2>
        <span className={`status-badge ${STATUS[forslag.status].tone}`}>Förslag · {STATUS[forslag.status].text}</span>
        <p>{TERM[forslag.term]}, {forslag.weeks} veckor. {forslag.metrics.placed} av {forslag.metrics.lessons} pass per vecka har fått en tid.</p>
        <p className="schema-note">{forslag.basis ? `Underlag: tjänstefördelning version ${forslag.basis.versionNo} (${BASIS[forslag.basis.status] ?? forslag.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}
          {forslag.metrics.placed > 0 && ` Håltid per vecka: elever ${forslag.metrics.studentGapMin} min, lärare ${forslag.metrics.teacherGapMin} min.`}</p>
      </div>

      {forslag.metrics.placed > 0 && <>
        <div className="schema-filter">
          <fieldset><legend className="sr-only">Visa schema för</legend>
            <Button type="button" variant={by === 'class' ? 'secondary' : 'outline'} aria-pressed={by === 'class'} onClick={() => setBy('class')}>Klass</Button>
            <Button type="button" variant={by === 'teacher' ? 'secondary' : 'outline'} aria-pressed={by === 'teacher'} disabled={forslag.teachers.length === 0} onClick={() => setBy('teacher')}>Lärare</Button>
          </fieldset>
          <label>{by === 'class' ? 'Klass eller grupp' : 'Lärare'}<select value={selected} onChange={e => setChosen(e.target.value)}>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        </div>
        <div className="schema-week" style={{ '--days': forslag.days.length, '--span': end - start, '--first-hour': (hours[0] ?? start) - start } as CSSProperties}>
          <div className="schema-hours" aria-hidden="true">{hours.map(h => <span key={h} style={{ '--at': h - start } as CSSProperties}>{clock(h)}</span>)}</div>
          {forslag.days.map((_, day) => {
            const lessons = forslag.lessons.filter(l => l.day === day && l.startMin !== null && mine(l)).sort((a, b) => a.startMin! - b.startMin!);
            return <section className="schema-day" key={day} aria-label={DAYS[day] ?? `Dag ${day + 1}`}>
              <h3>{DAYS[day] ?? `Dag ${day + 1}`}</h3>
              <ol>{lessons.map(l => <li key={l.id} className={`schema-lesson${l.vacant ? ' vacant' : ''}`} style={{ '--start': l.startMin! - start, '--length': l.durationMin } as CSSProperties}>
                <time>{clock(l.startMin!)}–{clock(l.startMin! + l.durationMin)}</time><strong>{l.title}</strong><span>{detail(l)}</span></li>)}
                {lessons.length === 0 && <li className="schema-free">Inga pass</li>}</ol>
            </section>;
          })}
        </div>
      </>}

      {unplaced.length > 0 && <div className="schema-list"><h2>Pass utan tid ({unplaced.length})</h2>
        <ul>{unplaced.map(l => <li key={l.id}>{l.title}, {l.durationMin} min · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}</li>)}</ul></div>}
      {forslag.diagnoses.length > 0 && <div className="schema-list"><h2>Schemamotorns förklaring</h2>
        <ul>{forslag.diagnoses.map((x, i) => <li key={i}>{x.message}{x.proof && ' (Bevisat: det går inte med det här underlaget.)'}</li>)}</ul></div>}
      {forslag.omitted.length > 0 && <div className="schema-list"><h2>Inte med i förslaget ({forslag.omitted.length})</h2>
        <ul>{forslag.omitted.map((o, i) => <li key={i}>{o.title} · {o.classes.join(', ')}: {o.reason === 'too_short' ? `mindre än ${d.minLessonMin} min i veckan` : 'ingen tid angiven för terminen'}</li>)}</ul></div>}
      <div className="schema-list"><h2>Antaganden i förslaget</h2>
        <ul>
          <li>Skoldag {clock(d.dayStartMin)}–{clock(d.dayEndMin)} måndag–fredag, {d.breakMin} min rast mellan pass och {d.lunch.length_min} min lunch mellan {clock(d.lunch.window_start_min)} och {clock(d.lunch.window_end_min)}.</li>
          <li>Veckans tid delas i lika långa pass om högst {d.maxLessonMin} min. Alla veckor antas vara lika.</li>
          <li>Salar, lärares tillgänglighet och önskemål ingår inte än.</li>
          <li>Ett valbart block läggs som ett gemensamt pass för blockets klasser och lärare. En grupp över flera klasser upptar hela klasserna.</li>
          <li>Pass med streckad kant saknar lärare i tjänstefördelningen.</li>
        </ul></div>
    </>}
  </section>;
}
