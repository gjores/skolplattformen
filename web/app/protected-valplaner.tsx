'use client';

import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges, useRequestDiscard } from '@/lib/unsaved-changes.tsx';
import artifact from '@/lib/programplan-catalog.generated.json';
import type { ProgramplanCatalog } from '@/lib/programplan-catalog.ts';
import { PROGRAMPLAN_LANGUAGES, programplanLanguageName } from '@/lib/programplan-languages.ts';
import { gyGradeLevels, type CatalogLevel } from '@/lib/catalog-levels.ts';
import { formatTimplanMinutes, parseTimplanMinuteInput } from '@/lib/timplan-time.ts';
import { valplanDiagnostics, valplanRowKey, valplanSubjectAllowed, valplanTimeShare, type Valplan, type ValplanCourse, type ValplanDiagnostic, type ValplanKind } from '@/lib/valplan-model.ts';
import { parseValplanCommand, parseValplanRead, parseValplanReply, type ValplanCommand, type ValplanRead, type ValplanRowOption } from '@/lib/valplan-contract.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { formatTime } from './tjanst-service-summary';
import CatalogLevelSearch from './catalog-level-search';
import MfaStepUpNotice from './mfa-step-up';
import ProtectedValplanChoices from './protected-valplan-choices';
import './valplaner.css';

const catalog = artifact as ProgramplanCatalog;
export const VALPLAN_KIND_LABEL: Record<ValplanKind, string> = { individualChoice: 'Individuellt val', modernLanguage: 'Moderna språk', languageSubject: 'Språkämne', naturalScience: 'Naturvetenskapligt ämne', specialization: 'Programfördjupning' };
const MODERN = new Set(['MODY', 'MODG', 'MODO', 'MODF']);
const SUBJECT_LIMIT: Partial<Record<ValplanKind, string>> = {
  languageSubject: 'Här finns moderna språk, engelska, klassisk grekiska och latin, enligt gymnasieförordningen.',
  naturalScience: 'Här finns biologi, bioteknik, fysik, fysik fördjupning och kemi, enligt gymnasieförordningen.',
};
const DIAGNOSTIC: Record<string, string> = {
  duplicate_course: 'Kursen finns redan i valplanen.',
  course_not_in_catalog: 'Kursen finns inte i Skolverkets katalog med de här poängen.',
  course_not_valid: 'Kursen gäller inte när läsåret börjar.',
  language_required: 'Välj språk för kursen.',
  language_not_applicable: 'Språk anges bara för moderna språk.',
  course_kind_mismatch: 'Ämnet är inte tillåtet i den här typen av valplan.',
  course_time_missing: 'Ange undervisningstid för HT eller VT.',
  course_class_not_linked: 'En vald klass läser inte längre någon av de kopplade timplanerna.',
  course_fits_no_row: 'Kursen ryms inte i någon kopplad rad. Kontrollera poängen och klasserna.',
  course_not_allowed_in_row: 'Kursen är inte tillåten i en av de kopplade raderna.',
  row_missing: 'En kopplad timplansrad finns inte längre för läsåret.',
  row_version_changed: 'Timplanen har en ny version. Koppla raden på nytt.',
  row_not_choice_block: 'Raden är inte en valbar rad.',
  row_kind_mismatch: 'Raden gäller en annan typ av val.',
  row_linked_elsewhere: 'Raden fylls redan av en annan valplan.',
  row_without_points: 'Raden har inga poäng läsåret.',
  class_in_several_rows: 'En klass finns i två kopplade rader. Koppla bara en rad per klass.',
};
const newId = () => crypto.randomUUID();
const hours = (minutes: number | null) => minutes === null ? 'Tid okänd' : formatTime(minutes);
const levelLabel = (level: CatalogLevel) => `${level.subjectName} – ${level.itemName.toLocaleLowerCase('sv')}`;
type TimeText = Record<string, { ht: string; vt: string }>;
const noTime = (text = '') => { const value = parseTimplanMinuteInput(text); return value === 0 || value === null; };
function texts(plan: Valplan): TimeText { return Object.fromEntries(plan.courses.map(c => [c.id, { ht: formatTimplanMinutes(c.minutesHt), vt: formatTimplanMinutes(c.minutesVt) }])); }
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'valplan_revision_conflict') return 'Någon annan har ändrat valplanen. Hämta aktuellt läge; dina ändringar finns kvar tills du gör det.';
    if (error.reason === 'valplan_row_conflict') return 'En vald timplansrad fylls redan av en annan valplan eller finns inte längre. Hämta aktuellt läge.';
    if (error.reason?.startsWith('valplan_')) return DIAGNOSTIC[error.reason.slice(8)] ?? 'Kontrollera kurserna och de kopplade timplanerna. Valplanen kunde inte sparas.';
    if (error.status === 409) return 'Underlaget har ändrats. Hämta aktuellt läge och granska ändringen igen.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
    if (error.status === 400) return 'Kontrollera kurserna och de kopplade timplanerna. Valplanen kunde inte sparas.';
  }
  return 'Sparandet kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.';
}

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; initialValplanId?: string | null; onOpenGroups?: () => void; onSessionLost: () => void };
export default function ProtectedValplaner(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace"><div className="page-heading"><div><h1>Valplaner<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att se läsårets valplaner.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}

function Workspace({ unitId, schoolYear, scopeKey, initialValplanId = null, onOpenGroups, onSessionLost }: Props & { unitId: string }) {
  const requestDiscard = useRequestDiscard();
  const heading = useId();
  const [data, setData] = useState<ValplanRead | null>(null), [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<string | null>(initialValplanId), [draft, setDraft] = useState<Valplan | null>(null), [time, setTime] = useState<TimeText>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [adding, setAdding] = useState(false), [language, setLanguage] = useState(''), [tried, setTried] = useState(false);
  const [pending, setPending] = useState<ValplanCommand | null>(null), [uncertain, setUncertain] = useState(false), [choices, setChoices] = useState(false);
  // A new plan is compared with its untouched start, so merely opening one does not block navigation.
  const [start, setStart] = useState<Valplan | null>(null);
  const saved = data?.valplans.find(v => v.valplan.id === draft?.id)?.valplan ?? null;
  const dirty = !!draft && JSON.stringify(withTime(draft, time)) !== JSON.stringify(saved ?? start);
  useUnsavedChanges(`valplan-${unitId}-${schoolYear}`, dirty || busy);

  async function load(): Promise<ValplanRead | null> {
    setLoadError(false);
    try { const value = parseValplanRead(await api.post('/api/valplaner/lasa', { unitId, schoolYear }), { unitId, schoolYear }); setData(value); return value; }
    catch (caught) { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); return null; }
  }

  function open(plan: Valplan) { setChoices(false); setStart(null); setSelected(plan.id); setDraft(structuredClone(plan)); setTime(texts(plan)); setError(null); setNotice(null); setTried(false); setAdding(false); setUncertain(false); setPending(null); }
  const acceptInitial = useEffectEvent((value: ValplanRead) => { setData(value); const first = value.valplans.find(v => v.valplan.id === initialValplanId); if (first) open(first.valplan); });
  const initialFailure = useEffectEvent((caught: unknown) => { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); });
  useEffect(() => {
    const controller = new AbortController(), scope = { unitId, schoolYear };
    api.post('/api/valplaner/lasa', scope, controller.signal).then(value => acceptInitial(parseValplanRead(value, scope))).catch(caught => { if (!controller.signal.aborted) initialFailure(caught); });
    return () => controller.abort();
  }, [unitId, schoolYear]);
  async function choose(plan: Valplan) { if (dirty && !(await requestDiscard())) return; open(plan); }
  async function create(kind: ValplanKind) {
    if (dirty && !(await requestDiscard())) return;
    const plan: Valplan = { id: newId(), unitId, schoolYear, kind, name: `${VALPLAN_KIND_LABEL[kind]} ${planningYearLabel(schoolYear)}`, revision: 1, courses: [], rows: [] };
    setStart(plan); setSelected(plan.id); setDraft(structuredClone(plan)); setTime({}); setError(null); setNotice(null); setTried(false); setAdding(true); setUncertain(false); setPending(null);
  }
  function discardNew() { setStart(null); setSelected(null); setDraft(null); setTime({}); setError(null); setNotice(null); setTried(false); setAdding(false); setPending(null); }
  const update = (change: (plan: Valplan) => Valplan) => { setDraft(value => value && change(structuredClone(value))); setNotice(null); };

  const rows = useMemo(() => data?.rows.filter(r => r.blockKind === draft?.kind) ?? [], [data, draft?.kind]);
  const linkedRows = useMemo(() => rows.filter(r => draft?.rows.some(l => valplanRowKey(l) === valplanRowKey(r))), [rows, draft?.rows]);
  const linkedClasses = useMemo(() => linkedRows.flatMap(r => r.classes).filter((c, i, all) => all.findIndex(x => x.id === c.id) === i), [linkedRows]);
  const timeErrors = draft ? draft.courses.filter(c => parseTimplanMinuteInput(time[c.id]?.ht ?? '') === undefined || parseTimplanMinuteInput(time[c.id]?.vt ?? '') === undefined).map(c => c.id) : [];
  const diagnostics: ValplanDiagnostic[] = draft && data ? valplanDiagnostics(withTime(draft, time), data.rows, catalog) : [];
  const errors = diagnostics.filter(d => d.severity === 'error');
  const kind = draft?.kind;
  const levels = useMemo(() => gyGradeLevels(catalog, `${schoolYear}-07-01`, code => !!kind && code !== 'MODE' && valplanSubjectAllowed(kind, code)), [schoolYear, kind]);

  function addCourse(level: CatalogLevel) {
    if (!draft) return;
    const lang = MODERN.has(level.subjectCode) ? language || null : null;
    if (MODERN.has(level.subjectCode) && !lang) { setError('Välj språk innan du lägger till en kurs i moderna språk.'); return; }
    // Suggest time from the first linked row; the school adjusts it.
    const course: ValplanCourse = { id: newId(), subjectCode: level.subjectCode, subjectVersion: level.subjectVersion, itemCode: level.itemCode, points: level.points, languageCode: lang,
      name: `${levelLabel(level)}${lang ? `, ${programplanLanguageName(lang).toLocaleLowerCase('sv')}` : ''}`, ...valplanTimeShare(level.points, linkedRows[0]), classIds: null };
    update(p => ({ ...p, courses: [...p.courses, course] }));
    setTime(t => ({ ...t, [course.id]: { ht: formatTimplanMinutes(course.minutesHt), vt: formatTimplanMinutes(course.minutesVt) } })); setError(null);
  }
  function toggleRow(row: ValplanRowOption, on: boolean) {
    update(p => ({ ...p, rows: on ? [...p.rows, { timplanId: row.timplanId, timplanVersion: row.timplanVersion, rowKey: row.rowKey, year: row.year }] : p.rows.filter(l => valplanRowKey(l) !== valplanRowKey(row)) }));
    // Courses added before the row get its time now; entered time is never replaced.
    if (on) setTime(t => { const next = { ...t }; for (const c of draft?.courses ?? []) { const { minutesHt, minutesVt } = valplanTimeShare(c.points, row); if (minutesHt + minutesVt > 0 && noTime(t[c.id]?.ht) && noTime(t[c.id]?.vt)) next[c.id] = { ht: formatTimplanMinutes(minutesHt), vt: formatTimplanMinutes(minutesVt) }; } return next; });
  }
  function toggleClass(course: ValplanCourse, classId: string, on: boolean) {
    const all = linkedClasses.map(c => c.id), current = course.classIds ?? all, next = on ? [...current, classId] : current.filter(id => id !== classId);
    update(p => ({ ...p, courses: p.courses.map(c => c.id === course.id ? { ...c, classIds: next.length === all.length && all.every(id => next.includes(id)) ? null : all.filter(id => next.includes(id)) } : c) }));
  }

  async function send(command: ValplanCommand) {
    setBusy(true); setError(null); setMfa(false);
    try {
      const reply = parseValplanReply(await api.post('/api/valplaner/kommando', command), command);
      setPending(null); setUncertain(false); setData(reply.read);
      const fresh = reply.read.valplans.find(v => v.valplan.id === command.valplan.id)?.valplan;
      if (fresh) open(fresh);
      setNotice('Valplanen är sparad.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') { setMfa(true); setError('Verifiera inloggningen för att spara.'); return; }
      if (caught instanceof ApiError) setPending(null); else setUncertain(true);
      setError(message(caught));
    } finally { setBusy(false); }
  }
  function save() {
    setTried(true);
    if (!draft || busy || timeErrors.length || errors.length || !draft.name.trim()) return;
    const plan = withTime(draft, time), command = parseValplanCommand({ contractVersion: 'valplan_v1', commandId: newId(), action: 'save', unitId, schoolYear,
      expectedRevision: saved ? saved.revision : 0, catalogId: catalog.catalogId, valplan: { ...plan, revision: saved ? saved.revision : 1 } });
    setPending(command); void send(command);
  }
  async function refresh() { const value = await load(); const fresh = value?.valplans.find(v => v.valplan.id === draft?.id)?.valplan; if (fresh && (!dirty || await requestDiscard())) open(fresh); }

  const courseErrors = (id: string) => diagnostics.filter(d => d.courseId === id);
  const rowLabel = (r: ValplanRowOption) => `${r.planName} · ${r.rowLabel} · åk ${r.year}`;
  const otherName = (id: string | null) => data?.valplans.find(v => v.valplan.id === id)?.valplan.name ?? 'en annan valplan';

  return <section className="valplan-workspace" aria-labelledby={heading}>
    <div className="page-heading"><div><p className="eyebrow">LÄSÅR {planningYearLabel(schoolYear)}</p><h1 id={heading}>Valplaner<span className="heading-dot">.</span></h1>
      <p className="page-subtitle">Kurser som eleverna väljer mellan. En valplan kan fylla valbara rader i flera timplaner.</p></div></div>
    {loadError && <div className="valplan-alert" role="alert"><p>Valplanerna kunde inte hämtas.</p><Button variant="outline" onClick={() => void load()}>Försök igen</Button></div>}
    {!data && !loadError && <p className="valplan-muted">Hämtar valplaner…</p>}
    {data && <div className="valplan-columns">
      <aside className="valplan-card" aria-label="Läsårets valplaner">
        <div className="section-heading"><h2>Läsårets valplaner</h2></div>
        {data.valplans.length ? <ul className="valplan-list">{data.valplans.map(({ valplan }) => <li key={valplan.id}>
          <button type="button" aria-pressed={selected === valplan.id} onClick={() => choose(valplan)}><strong>{valplan.name}</strong>
            <small>{VALPLAN_KIND_LABEL[valplan.kind]} · {valplan.courses.length} kurser · {valplan.rows.length} timplansrader</small></button></li>)}</ul>
          : <p className="valplan-muted">Inga valplaner ännu. Skapa en valplan för att lägga in läsårets kurser.</p>}
        <fieldset className="valplan-new"><legend>Ny valplan</legend>{(Object.keys(VALPLAN_KIND_LABEL) as ValplanKind[]).map(kind =>
          <Button key={kind} variant="outline" disabled={busy} onClick={() => create(kind)}>{VALPLAN_KIND_LABEL[kind]}</Button>)}</fieldset>
      </aside>
      {draft && choices ? <ProtectedValplanChoices unitId={unitId} schoolYear={schoolYear} valplanId={draft.id} scopeKey={scopeKey} onBack={() => setChoices(false)} onOpenGroups={onOpenGroups} onSessionLost={onSessionLost}/>
      : draft ? <div className="valplan-card valplan-editor">
        <div className="section-heading"><h2>{saved ? draft.name : 'Ny valplan'}</h2><span className={saved && !dirty ? 'status-badge success' : 'status-badge'}>{saved ? dirty ? 'Osparade ändringar' : 'Sparad' : 'Inte sparad'}</span></div>
        <div className="valplan-fields">
          <label>Namn<input value={draft.name} maxLength={200} disabled={busy} aria-invalid={tried && !draft.name.trim()} onChange={e => update(p => ({ ...p, name: e.target.value }))}/></label>
          <p><span className="valplan-muted">Typ</span><br/><strong>{VALPLAN_KIND_LABEL[draft.kind]}</strong></p>
        </div>

        <section aria-labelledby={`${heading}-rows`} className="valplan-section">
          <h3 id={`${heading}-rows`}>Timplaner som valplanen fyller</h3>
          <p className="valplan-muted">Välj de valbara rader i läsårets godkända timplaner där eleverna väljer kurser ur valplanen. Eleverna i radernas klasser får välja.</p>
          {rows.length ? <ul className="valplan-rows">{rows.map(r => {
            const key = valplanRowKey(r), on = draft.rows.some(l => valplanRowKey(l) === key), taken = r.linkedValplanId !== null && r.linkedValplanId !== draft.id;
            return <li key={key}><label className="valplan-check"><input type="checkbox" aria-label={rowLabel(r)} checked={on} disabled={busy || taken && !on} onChange={e => toggleRow(r, e.target.checked)}/>
              <span><strong>{rowLabel(r)}</strong><small>{r.points} p · HT {hours(r.minutesHt)} · VT {hours(r.minutesVt)} · {r.classes.length ? `Klasser: ${r.classes.map(c => c.name).join(', ')}` : `Inga klasser kopplade ${planningYearLabel(schoolYear)}`}
                {taken && ` · Fylls av ${otherName(r.linkedValplanId)}`}</small></span></label></li>;
          })}</ul> : <p className="validation-warning">Inga godkända timplaner har en rad för {VALPLAN_KIND_LABEL[draft.kind].toLocaleLowerCase('sv')} läsåret {planningYearLabel(schoolYear)}.</p>}
          {diagnostics.filter(d => d.rowKey && !d.courseId).map((d, i) => <p key={i} className="valplan-field-error">{DIAGNOSTIC[d.code] ?? d.code}</p>)}
        </section>

        <section aria-labelledby={`${heading}-courses`} className="valplan-section">
          <h3 id={`${heading}-courses`}>Kurser</h3>
          {draft.courses.length ? <div className="valplan-table-wrap"><table className="valplan-table">
            <thead><tr><th scope="col">Kurs</th><th scope="col">Poäng</th><th scope="col">HT, timmar</th><th scope="col">VT, timmar</th><th scope="col">Får läsas av</th><th scope="col"><span className="sr-only">Åtgärd</span></th></tr></thead>
            <tbody>{draft.courses.map(c => {
              const own = courseErrors(c.id), badTime = tried && timeErrors.includes(c.id);
              return <tr key={c.id}>
                <td data-label="Kurs"><input aria-label={`Namn på kursen ${c.itemCode}`} value={c.name} maxLength={200} disabled={busy} onChange={e => update(p => ({ ...p, courses: p.courses.map(x => x.id === c.id ? { ...x, name: e.target.value } : x) }))}/>
                  <small>{c.itemCode}{c.languageCode ? ` · ${programplanLanguageName(c.languageCode)}` : ''}</small>
                  {(tried ? own : own.filter(d => d.severity === 'notice' || d.code === 'duplicate_course')).map((d, i) => <p key={i} className={d.severity === 'error' ? 'valplan-field-error' : 'valplan-muted'}>{DIAGNOSTIC[d.code] ?? d.code}</p>)}
                  {badTime && <p className="valplan-field-error">Ange timmar, till exempel 40, eller timmar:minuter, till exempel 39:30.</p>}</td>
                <td data-label="Poäng">{c.points}</td>
                {(['ht', 'vt'] as const).map(term => <td key={term} data-label={`${term.toUpperCase()}, timmar`}><input className="valplan-time" inputMode="text" aria-label={`${c.name}, ${term.toUpperCase()} timmar`} aria-invalid={badTime} value={time[c.id]?.[term] ?? ''} disabled={busy}
                  onChange={e => setTime(t => ({ ...t, [c.id]: { ...(t[c.id] ?? { ht: '', vt: '' }), [term]: e.target.value } }))}/></td>)}
                <td data-label="Får läsas av"><details className="valplan-classes"><summary>{c.classIds ? `${c.classIds.length} av ${linkedClasses.length} klasser` : linkedClasses.length ? 'Alla klasser' : 'Inga klasser ännu'}</summary>
                  {linkedClasses.length ? linkedClasses.map(k => <label key={k.id} className="valplan-check"><input type="checkbox" disabled={busy} checked={!c.classIds || c.classIds.includes(k.id)} onChange={e => toggleClass(c, k.id, e.target.checked)}/>{k.name}</label>)
                    : <p className="valplan-muted">{linkedRows.length ? `Inga klasser är kopplade till timplanerna ${planningYearLabel(schoolYear)}. Koppla klasser under Klasser och läsår i timplanen.` : 'Kryssa i en timplan ovan för att välja klasser.'}</p>}</details></td>
                <td className="valplan-remove"><Button size="sm" variant="outline" disabled={busy} aria-label={`Ta bort ${c.name}`} onClick={() => update(p => ({ ...p, courses: p.courses.filter(x => x.id !== c.id) }))}>Ta bort</Button></td>
              </tr>;
            })}</tbody></table></div> : <p className="valplan-muted">Inga kurser ännu. Lägg till de kurser som eleverna kan välja.</p>}
          {adding ? <div className="valplan-add">
            {SUBJECT_LIMIT[draft.kind] && <p className="valplan-muted">{SUBJECT_LIMIT[draft.kind]}</p>}
            {levels.some(l => MODERN.has(l.subjectCode)) ? <label>Språk för moderna språk<select value={language} disabled={busy} onChange={e => setLanguage(e.target.value)}>
              <option value="">Välj språk</option>{PROGRAMPLAN_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}</select></label> : null}
            <CatalogLevelSearch levels={levels} searchLabel="Sök kurs att lägga till" listLabel="Kurser i katalogen" disabled={busy}
              unavailable={l => !MODERN.has(l.subjectCode) && draft.courses.some(c => c.subjectCode === l.subjectCode && c.subjectVersion === l.subjectVersion && c.itemCode === l.itemCode)}
              label={l => `${levelLabel(l)} · ${l.itemCode} · ${l.points} p`} onPick={addCourse}/>
            <Button variant="outline" onClick={() => setAdding(false)}>Klar med kurser</Button></div>
            : <Button variant="outline" disabled={busy} onClick={() => setAdding(true)}>Lägg till kurs</Button>}
        </section>

        <div className="valplan-footer">
          {tried && (errors.length > 0 || timeErrors.length > 0 || !draft.name.trim()) && <p className="valplan-field-error" role="alert">Rätta markerade uppgifter innan du sparar.</p>}
          {mfa ? <MfaStepUpNotice message={error ?? 'Verifiering med engångskod krävs.'}/> : error && <p className="valplan-alert" role="alert">{error}</p>}
          {notice && <output className="valplan-notice">{notice}</output>}
          <div className="valplan-actions">
            {uncertain && pending ? <Button disabled={busy} onClick={() => void send(pending)}>Kontrollera sparstatus</Button>
              : <Button disabled={busy || !dirty} onClick={save}>{busy ? 'Sparar…' : 'Spara valplan'}</Button>}
            {saved && dirty && <Button variant="outline" disabled={busy} onClick={() => open(saved)}>Ångra ändringar</Button>}
            {saved && !dirty && <Button variant="outline" disabled={busy} onClick={() => setChoices(true)}>Elevval</Button>}
            {!saved && !uncertain && <Button variant="outline" disabled={busy} onClick={discardNew}>Släng utkastet</Button>}
            {error && !uncertain && <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Hämta aktuellt läge</Button>}
          </div>
        </div>
      </div> : <div className="valplan-card"><p className="valplan-muted">Välj en valplan eller skapa en ny.</p></div>}
    </div>}
  </section>;
}

function withTime(plan: Valplan, time: TimeText): Valplan {
  return { ...plan, courses: plan.courses.map(c => {
    const ht = parseTimplanMinuteInput(time[c.id]?.ht ?? formatTimplanMinutes(c.minutesHt)), vt = parseTimplanMinuteInput(time[c.id]?.vt ?? formatTimplanMinutes(c.minutesVt));
    return { ...c, minutesHt: typeof ht === 'number' ? ht : ht === null ? 0 : c.minutesHt, minutesVt: typeof vt === 'number' ? vt : vt === null ? 0 : c.minutesVt };
  }) };
}
