'use client';

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/server-client.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { parseSchemaForslag, type SchemaForslag, type SchemaForslagLesson, type SchemaForslagRequest, type SchemaStatus, type SchemaTerm } from '@/lib/schema-contract.ts';
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
  }
  return 'Schemaförslaget kunde inte tas fram. Försök igen.';
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
const names = (ids: string[], all: { id: string; name: string }[]) => ids.map(id => all.find(x => x.id === id)?.name ?? '').filter(Boolean).join(', ');

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void };
export default function SchemaWorkspace(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace schema-workspace"><div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att ta fram ett schemaförslag.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, onSessionLost }: Props & { unitId: string }) {
  const resultHeading = useId();
  const [term, setTerm] = useState<SchemaTerm>('ht');
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [forslag, setForslag] = useState<SchemaForslag | null>(null);
  const [by, setBy] = useState<'class' | 'teacher'>('class'), [chosen, setChosen] = useState('');
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);

  async function run() {
    if (busy) return;
    const request: SchemaForslagRequest = { unitId, schoolYear, term }, controller = new AbortController();
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
  const deviating = forslag ? [...forslag.teachings].sort((a, b) => Math.abs(b.plannedMin - b.needMin) - Math.abs(a.plannedMin - a.needMin)) : [];

  return <section className="valplan-workspace schema-workspace">
    <div className="page-heading"><div><h1>Schema<span className="heading-dot">.</span></h1><p>Läsår {planningYearLabel(schoolYear)}. Förslaget räknas ur skolans tjänstefördelning. Det sparas inte och publiceras inte.</p></div></div>
    <form className="schema-controls" onSubmit={e => { e.preventDefault(); void run(); }}>
      <label>Termin<select value={term} disabled={busy} onChange={e => setTerm(e.target.value as SchemaTerm)}>
        <option value="ht">{TERM.ht}</option><option value="vt">{TERM.vt}</option></select></label>
      <Button type="submit" disabled={busy}>{busy ? 'Räknar…' : 'Ta fram schemaförslag'}</Button>
      <p className="schema-note" style={{ gridColumn: '1 / -1' }}>Terminens tid räknas ur läsårskalenderns skoldagar. Vilka pass som får gå samtidigt avgörs av elevernas klasser och grupper.</p>
    </form>
    <output aria-live="polite" className="schema-note">{busy ? `Schemamotorn räknar. Det tar upp till ${d.solveTimeMs / 1000} sekunder.` : ''}</output>
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    {!forslag && !busy && !error && <p className="empty-state">Inget förslag ännu. Välj termin och ta fram ett schemaförslag.</p>}

    {forslag && <>
      <div className="schema-summary" aria-labelledby={resultHeading}>
        <h2 id={resultHeading} className="sr-only">Schemaförslag</h2>
        <span className={`status-badge ${STATUS[forslag.status].tone}`}>Förslag · {STATUS[forslag.status].text}</span>
        <p>{TERM[forslag.term]}. {forslag.metrics.placed} av {forslag.metrics.lessons} pass per vecka har fått en tid.</p>
        <p className="schema-note">{forslag.basis ? `Underlag: tjänstefördelning version ${forslag.basis.versionNo} (${BASIS[forslag.basis.status] ?? forslag.basis.status}).` : 'Skolan har ingen tjänstefördelning för läsåret; bara behoven är underlag.'}
          {forslag.time.source === 'kalender'
            ? ` Terminens tid: ${forslag.time.schoolDays} skoldagar enligt läsårskalendern version ${forslag.time.version} (${CALENDAR[forslag.time.status ?? ''] ?? forslag.time.status}${forslag.time.current ? ', gällande' : ''}).`
            : ` Läsårskalender saknas för läsåret: ${forslag.time.weeks} lika veckor har antagits.`}
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
            const lessons = forslag.lessons.filter(l => l.day === day && l.startMin !== null && mine(l)).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id));
            const lane = lanes(lessons);
            return <section className="schema-day" key={day} aria-label={DAYS[day] ?? `Dag ${day + 1}`}>
              <h3>{DAYS[day] ?? `Dag ${day + 1}`}</h3>
              <ol>{lessons.map(l => <li key={l.id} className={`schema-lesson${l.vacant ? ' vacant' : ''}`} style={{ '--start': l.startMin! - start, '--length': l.durationMin, '--lane': lane.get(l.id)!.lane, '--lanes': lane.get(l.id)!.lanes } as CSSProperties}>
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
      {deviating.length > 0 && <details className="schema-list"><summary><h2>Tid över terminen ({deviating.length})</h2>
        <span className="schema-note">Störst skillnad mot behovet: {hoursText(Math.abs(deviating[0].plannedMin - deviating[0].needMin))} ({deviating[0].title}).</span></summary>
        <p className="schema-note">Utlagd tid är passens längd gånger antalet skoldagar på passets veckodag under terminen. Störst skillnad står först.</p>
        <Table><TableHeader><TableRow><TableHead>Undervisning</TableHead><TableHead>Klass</TableHead><TableHead>Behov</TableHead><TableHead>Utlagt</TableHead><TableHead>Skillnad</TableHead></TableRow></TableHeader>
          <TableBody>{deviating.map((t, i) => <TableRow key={i}><TableCell>{t.title}</TableCell><TableCell>{t.classes.join(', ') || '–'}</TableCell><TableCell>{hoursText(t.needMin)}</TableCell>
            <TableCell>{hoursText(t.plannedMin)}{t.unplaced > 0 && ` (${t.unplaced} pass utan tid)`}</TableCell>
            <TableCell>{t.plannedMin > t.needMin ? '+' : t.plannedMin < t.needMin ? '−' : ''}{hoursText(Math.abs(t.plannedMin - t.needMin))}</TableCell></TableRow>)}</TableBody></Table></details>}
      <div className="schema-list"><h2>Elever och grupper</h2>
        {forslag.members.pupils === 0
          ? <p>Inga elever med klass eller grupp kunde läsas för läsåret. Ett valbart block läggs då som ett gemensamt pass och en grupp upptar hela sina klasser.</p>
          : <ul>
            <li>{forslag.members.pupils} elevers klasser och gruppmedlemskap under terminen avgör vilka pass som inte får gå samtidigt.</li>
            {forslag.members.withoutChoice.map((x, i) => <li key={i}>{x.title}: {x.count} {x.count === 1 ? 'elev' : 'elever'} i blockets klasser har ingen grupp och räknas som lediga när blocket går.</li>)}
            {forslag.members.groupsWithoutMembers.length > 0 && <li>Grupper utan elever ({forslag.members.groupsWithoutMembers.length}): {forslag.members.groupsWithoutMembers.join(', ')}. En sådan grupp upptar hela sina klasser, eller ingen elev om den hör till ett block där andra grupper har elever.</li>}
            {forslag.members.classesWithoutPupils.length > 0 && <li>Klasser utan elever i registret: {forslag.members.classesWithoutPupils.join(', ')}. De räknas som odelade klasser.</li>}
          </ul>}</div>
      {forslag.omitted.length > 0 && <div className="schema-list"><h2>Inte med i förslaget ({forslag.omitted.length})</h2>
        <ul>{forslag.omitted.map((o, i) => <li key={i}>{o.title} · {o.classes.join(', ')}: {o.reason === 'too_short' ? `mindre än ${d.minLessonMin} min i veckan` : o.reason === 'no_days' ? 'inga skoldagar under terminen' : 'ingen tid angiven för terminen'}</li>)}</ul></div>}
      <div className="schema-list"><h2>Antaganden i förslaget</h2>
        <ul>
          <li>Skoldag {clock(d.dayStartMin)}–{clock(d.dayEndMin)} måndag–fredag, {d.breakMin} min rast mellan pass och {d.lunch.length_min} min lunch mellan {clock(d.lunch.window_start_min)} och {clock(d.lunch.window_end_min)}.</li>
          <li>Terminens tid delas på skoldagarna räknade som femdagarsveckor och läggs som pass om högst {d.maxLessonMin} min. Samma veckoschema antas gälla hela terminen; därför kan utlagd tid skilja sig från behovet.</li>
          <li>Salar, lärares tillgänglighet och önskemål ingår inte än.</li>
          <li>Pass med streckad kant saknar lärare i tjänstefördelningen.</li>
        </ul></div>
    </>}
  </section>;
}
