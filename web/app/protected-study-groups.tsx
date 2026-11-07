'use client';

import { useEffect, useEffectEvent, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import artifact from '@/lib/programplan-catalog.generated.json';
import type { ProgramplanCatalog } from '@/lib/programplan-catalog.ts';
import { gyGradeLevels, type CatalogLevel } from '@/lib/catalog-levels.ts';
import { formatTimplanMinutes, parseTimplanMinuteInput } from '@/lib/timplan-time.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { distributeStudyGroupMembers, type StudyGroup, type StudyGroupMembership } from '@/lib/study-group-model.ts';
import { parseStudyGroupCommand, parseStudyGroupRead, parseStudyGroupReply, type StudyGroupCommand, type StudyGroupPayload, type StudyGroupRead } from '@/lib/study-group-contract.ts';
import CatalogLevelSearch from './catalog-level-search';
import LegacyBlockRetirement from './legacy-block-retirement';
import MfaStepUpNotice from './mfa-step-up';
import './valplaner.css';

const catalog = artifact as ProgramplanCatalog;
const SOURCE: Record<StudyGroupMembership['source'], string> = { class: 'Från klass', choice: 'Från val', manual: 'Manuell' };
const ORIGIN: Record<StudyGroup['origin']['kind'], string> = { valplan: 'Från valbart block', classes: 'Från klasser', manual: 'Manuell' };
const REASON: Record<string, string> = {
  study_group_pupil_not_placed: 'Eleven har ingen placering på skolan under hela perioden. Justera datum eller placering.',
  study_group_member_period: 'Datumet ligger utanför gruppens eller medlemskapets period.',
  study_group_member_overlap: 'Eleven finns redan i en parallell grupp den perioden.',
  study_group_in_use: 'Gruppen har pågående eller kommande medlemmar. Flytta eller avsluta dem först.',
  study_group_period: 'Perioden måste ligga inom läsåret.',
  study_group_class: 'Välj minst en klass.',
  study_group_valplan_course: 'Tiden måste vara samma som kursens tid i blocket. Ändra tiden där.',
  study_group_revision_conflict: 'Någon annan har ändrat gruppen. Hämta aktuellt läge.',
};
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason && REASON[error.reason]) return REASON[error.reason];
    if (error.status === 409) return 'Underlaget har ändrats. Hämta aktuellt läge och granska ändringen igen.';
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
    if (error.status === 400) return 'Kontrollera uppgifterna. Ändringen kunde inte sparas.';
  }
  return 'Sparandet kunde inte bekräftas. Kontrollera sparstatus innan du försöker igen.';
}
const courseKey = (g: StudyGroup) => g.course ? `${g.course.subjectCode}:${g.course.itemCode}:${g.course.languageCode ?? ''}` : '';
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const levelLabel = (level: CatalogLevel) => `${level.subjectName} – ${level.itemName.toLocaleLowerCase('sv')}`;
const clamp = (date: string, group: StudyGroup) => date < group.startsOn ? group.startsOn : date > group.endsOn ? group.endsOn : date;
type Draft = { id: string; revision: number; name: string; startsOn: string; endsOn: string; ht: string; vt: string; classIds: string[]; level: CatalogLevel | null; parallelSetId: string; base: StudyGroup | null; fetchPupils: boolean };

type Props = { unitId: string | null; schoolYear: number; scopeKey: string; onSessionLost: () => void };
export default function ProtectedStudyGroups(props: Props) {
  if (!props.unitId) return <section className="valplan-workspace"><div className="page-heading"><div><h1>Undervisningsgrupper<span className="heading-dot">.</span></h1></div></div><p className="empty-state">Välj en skola för att se läsårets grupper.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}
function Workspace({ unitId, schoolYear, onSessionLost }: Props & { unitId: string }) {
  const heading = useId();
  const [data, setData] = useState<StudyGroupRead | null>(null), [loadError, setLoadError] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false), [pending, setPending] = useState<StudyGroupCommand | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null), [on, setOn] = useState(today), [adding, setAdding] = useState<string | null>(null), [courseFilter, setCourseFilter] = useState('');
  useUnsavedChanges(`study-groups-${unitId}-${schoolYear}`, busy || pending !== null || draft !== null);
  const scope = useMemo(() => ({ unitId, schoolYear }), [unitId, schoolYear]);
  const failedRead = useEffectEvent((caught: unknown) => { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); });
  useEffect(() => {
    const controller = new AbortController();
    api.post('/api/undervisningsgrupper/lasa', scope, controller.signal).then(value => { setData(parseStudyGroupRead(value, scope)); setLoadError(false); }).catch(caught => { if (!controller.signal.aborted) failedRead(caught); });
    return () => controller.abort();
  }, [scope]);
  async function refresh() { setError(null); setPending(null); try { setData(parseStudyGroupRead(await api.post('/api/undervisningsgrupper/lasa', scope), scope)); setLoadError(false); } catch (caught) { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); } }
  const command = (action: StudyGroupPayload['action'], payload: unknown) => parseStudyGroupCommand({ contractVersion: 'study_group_v1', commandId: crypto.randomUUID(), action, ...scope, payload });
  /** The same command id is resent after a lost answer, so the database replays instead of acting twice. */
  async function send(value: StudyGroupCommand, done: string): Promise<boolean> {
    setBusy(true); setError(null); setNotice(null); setMfa(false); setPending(value);
    try { const reply = parseStudyGroupReply(await api.post('/api/undervisningsgrupper/kommando', value), value); setData(reply.read); setPending(null); setNotice(done); return true; }
    catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return false; }
      if (caught instanceof ApiError && caught.code === 'mfa_required') { setPending(null); setMfa(true); setError('Verifiera inloggningen för att fortsätta.'); return false; }
      if (caught instanceof ApiError) setPending(null);
      setError(message(caught)); return false;
    } finally { setBusy(false); }
  }

  const groups = useMemo(() => data?.groups.filter(g => g.active) ?? [], [data]);
  const sets = useMemo(() => { const map = new Map<string, StudyGroup[]>(); for (const g of groups) map.set(g.parallelSetId, [...(map.get(g.parallelSetId) ?? []), g]); return [...map.values()]; }, [groups]);
  const courseOptions = useMemo(() => [...new Map(groups.filter(g => g.course).map(g => [courseKey(g), g.course!.itemCode + (g.course!.languageCode ? ` ${g.course!.languageCode}` : '')])).entries()], [groups]);
  const shownSets = sets.filter(set => !courseFilter || courseKey(set[0]) === courseFilter);
  const levels = useMemo(() => gyGradeLevels(catalog, `${schoolYear}-07-01`, code => code !== 'MODE'), [schoolYear]);
  const memberships = (g: StudyGroup) => data?.memberships.filter(m => m.groupId === g.id) ?? [];
  const pupilName = (id: string) => data?.pupils.find(p => p.id === id)?.name ?? 'Elev';
  const classNames = (ids: string[]) => ids.map(id => data?.classes.find(c => c.id === id)?.name).filter(Boolean).join(', ');
  const current = (m: StudyGroupMembership) => m.endsOn >= on;

  function newGroup() {
    setError(null); setNotice(null); setDraft({ id: crypto.randomUUID(), revision: 0, name: '', startsOn: `${schoolYear}-07-01`, endsOn: `${schoolYear + 1}-06-30`, ht: '', vt: '', classIds: [], level: null, parallelSetId: crypto.randomUUID(), base: null, fetchPupils: true });
  }
  function parallel(set: StudyGroup[]) {
    const g = set[0]; setError(null); setNotice(null);
    setDraft({ id: crypto.randomUUID(), revision: 0, name: `${g.name} ${set.length + 1}`, startsOn: g.startsOn, endsOn: g.endsOn, ht: formatTimplanMinutes(g.minutesHt), vt: formatTimplanMinutes(g.minutesVt), classIds: g.classIds, level: null, parallelSetId: g.parallelSetId, base: g, fetchPupils: false });
  }
  function change(g: StudyGroup) {
    setError(null); setNotice(null);
    setDraft({ id: g.id, revision: g.revision, name: g.name, startsOn: g.startsOn, endsOn: g.endsOn, ht: formatTimplanMinutes(g.minutesHt), vt: formatTimplanMinutes(g.minutesVt), classIds: g.classIds, level: null, parallelSetId: g.parallelSetId, base: g, fetchPupils: false });
  }
  async function save() {
    if (!draft) return;
    const ht = parseTimplanMinuteInput(draft.ht), vt = parseTimplanMinuteInput(draft.vt);
    if (!draft.name.trim() || ht === undefined || vt === undefined) { setError('Ange namn och undervisningstid i timmar, till exempel 40 eller 39:30.'); return; }
    const course = draft.base?.course ?? (draft.level ? { subjectCode: draft.level.subjectCode, subjectVersion: draft.level.subjectVersion, itemCode: draft.level.itemCode, points: draft.level.points, languageCode: null } : null);
    const origin = draft.base?.origin ?? (draft.classIds.length ? { kind: 'classes' } : { kind: 'manual' });
    const ok = await send(command('save_group', { id: draft.id, expectedRevision: draft.revision, name: draft.name.trim(), startsOn: draft.startsOn, endsOn: draft.endsOn, course, minutesHt: ht ?? 0, minutesVt: vt ?? 0, parallelSetId: draft.parallelSetId, classIds: draft.classIds, origin }), 'Gruppen är sparad.');
    if (!ok) return;
    const pupils = draft.fetchPupils ? (data?.pupils.filter(p => p.classIds.some(id => draft.classIds.includes(id))) ?? []) : [];
    const groupId = draft.id, startsOn = clamp(on, { startsOn: draft.startsOn, endsOn: draft.endsOn } as StudyGroup), endsOn = draft.endsOn;
    setDraft(null);
    if (pupils.length) await send(command('add_members', { groupId, members: pupils.map(p => ({ pupilId: p.id, startsOn, endsOn, source: 'class', sourceRef: null })) }), `Gruppen är sparad och ${pupils.length} elever är tillagda.`);
  }
  async function distribute(set: StudyGroup[]) {
    const ids = new Set(set.flatMap(g => g.classIds)), date = clamp(on, set[0]);
    const pupils = (data?.pupils ?? []).filter(p => p.classIds.some(id => ids.has(id))).map(p => p.id);
    const drafts = distributeStudyGroupMembers(set, data!.memberships, pupils, date, 'class');
    if (!drafts.length) { setNotice('Alla elever i gruppernas klasser har redan en plats.'); return; }
    for (const g of set) { const own = drafts.filter(d => d.groupId === g.id); if (own.length && !await send(command('add_members', { groupId: g.id, members: own.map(({ pupilId, startsOn, endsOn, source, sourceRef }) => ({ pupilId, startsOn, endsOn, source, sourceRef })) }), `${drafts.length} elever är fördelade.`)) return; }
  }
  function endMember(m: StudyGroupMembership) {
    return m.startsOn > on ? send(command('cancel_member', { membershipId: m.id }), `${pupilName(m.pupilId)} är borttagen ur gruppen.`) : send(command('end_member', { membershipId: m.id, endsOn: on }), `Medlemskapet för ${pupilName(m.pupilId)} avslutas ${on}.`);
  }

  return <section className="valplan-workspace" aria-labelledby={heading}>
    <div className="page-heading"><div><p className="eyebrow">LÄSÅR {planningYearLabel(schoolYear)}</p><h1 id={heading}>Undervisningsgrupper<span className="heading-dot">.</span></h1>
      <p className="page-subtitle">Grupper för undervisning i en kurs. Elevernas klass ändras inte. Grupperna är behov i tjänstefördelningen.</p></div></div>
    {loadError && <div className="valplan-alert" role="alert"><p>Grupperna kunde inte hämtas.</p><Button variant="outline" onClick={() => void refresh()}>Försök igen</Button></div>}
    {!data && !loadError && <p className="valplan-muted">Hämtar grupper…</p>}
    {data && <>
      <div className="valplan-card">
        <div className="valplan-open">
          <div className="protected-date-field"><label htmlFor={`${heading}-on`}>Ändringar gäller från</label><DatePicker id={`${heading}-on`} value={on} disabled={busy} onValueChange={setOn}/></div>
          {courseOptions.length > 0 && <label>Kurs<select value={courseFilter} onChange={e => setCourseFilter(e.target.value)}><option value="">Alla</option>{courseOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          {!draft && <div className="valplan-actions"><Button disabled={busy} onClick={newGroup}>Ny grupp</Button></div>}
        </div>
        {mfa ? <MfaStepUpNotice message={error ?? 'Verifiering med engångskod krävs.'}/> : error && <div className="valplan-alert" role="alert"><p>{error}</p>
          {pending ? <Button disabled={busy} onClick={() => void send(pending, 'Sparandet är bekräftat.')}>Kontrollera sparstatus</Button> : <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Hämta aktuellt läge</Button>}</div>}
        {notice && <output className="valplan-notice">{notice}</output>}
      </div>
      {draft && <fieldset className="valplan-card valplan-group-form"><legend>{draft.revision ? `Ändra ${draft.base?.name}` : draft.base ? 'Ny parallell grupp' : 'Ny grupp'}</legend>
        <label>Namn<input value={draft.name} maxLength={200} disabled={busy} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
        {!draft.base && (draft.level ? <p>Kurs: <strong>{levelLabel(draft.level)}</strong> <Button size="sm" variant="outline" disabled={busy} onClick={() => setDraft({ ...draft, level: null })}>Byt kurs</Button></p>
          : <CatalogLevelSearch levels={levels} searchLabel="Sök kurs (valfritt)" listLabel="Kurser i katalogen" disabled={busy} unavailable={() => false} label={l => `${levelLabel(l)} · ${l.itemCode} · ${l.points} p`} onPick={level => setDraft({ ...draft, level, name: draft.name || levelLabel(level) })}/>)}
        <div className="valplan-open">
          <div className="protected-date-field"><label htmlFor={`${heading}-from`}>Från</label><DatePicker id={`${heading}-from`} value={draft.startsOn} disabled={busy} onValueChange={startsOn => setDraft({ ...draft, startsOn })}/></div>
          <div className="protected-date-field"><label htmlFor={`${heading}-to`}>Till</label><DatePicker id={`${heading}-to`} value={draft.endsOn} disabled={busy} onValueChange={endsOn => setDraft({ ...draft, endsOn })}/></div>
          <label>HT, timmar<input className="valplan-time" value={draft.ht} disabled={busy || draft.base?.origin.kind === 'valplan'} onChange={e => setDraft({ ...draft, ht: e.target.value })}/></label>
          <label>VT, timmar<input className="valplan-time" value={draft.vt} disabled={busy || draft.base?.origin.kind === 'valplan'} onChange={e => setDraft({ ...draft, vt: e.target.value })}/></label>
        </div>
        {draft.base?.origin.kind === 'valplan' && <p className="valplan-muted">Tiden kommer från blocket.</p>}
        <fieldset className="valplan-new"><legend>Klasser</legend>
          {data.classes.map(c => <label key={c.id} className="valplan-check"><input type="checkbox" disabled={busy} checked={draft.classIds.includes(c.id)} onChange={e => setDraft({ ...draft, classIds: e.target.checked ? [...draft.classIds, c.id] : draft.classIds.filter(id => id !== c.id) })}/><span>{c.name}</span></label>)}
          {!data.classes.length && <p className="valplan-muted">Skolan har inga klasser ännu.</p>}</fieldset>
        {!draft.base && <label className="valplan-check"><input type="checkbox" disabled={busy} checked={draft.fetchPupils} onChange={e => setDraft({ ...draft, fetchPupils: e.target.checked })}/><span>Hämta elever från valda klasser</span></label>}
        <div className="valplan-actions"><Button disabled={busy} onClick={() => void save()}>Spara grupp</Button><Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>Avbryt</Button></div>
      </fieldset>}
      {!shownSets.length && <p className="empty-state">{groups.length ? 'Inga grupper matchar filtret.' : 'Inga grupper ännu. Skapa en grupp här eller från elevvalet i ett valbart block.'}</p>}
      {shownSets.map(set => <section className="valplan-card" key={set[0].parallelSetId} aria-label={set[0].course?.itemCode ?? set[0].name}>
        <div className="section-heading"><h2>{set.length > 1 ? `${set[0].course?.itemCode ?? set[0].name} · ${set.length} parallella grupper` : set[0].name}</h2><span className="status-badge">{ORIGIN[set[0].origin.kind]}</span></div>
        <div className="valplan-group-board">{set.map(g => { const members = memberships(g).filter(current), others = set.filter(x => x.id !== g.id); return <article key={g.id} className="valplan-group">
          <header><h3>{g.name}</h3><small>{g.startsOn} – {g.endsOn} · HT {formatTimplanMinutes(g.minutesHt) || '0'} · VT {formatTimplanMinutes(g.minutesVt) || '0'} h{g.classIds.length ? ` · ${classNames(g.classIds)}` : ''}</small><small>{members.length} elever</small></header>
          {members.length ? <ul>{members.map(m => <li key={m.id}><span><strong>{pupilName(m.pupilId)}</strong><small>{SOURCE[m.source]}{m.endsOn < g.endsOn ? ` · till ${m.endsOn}` : ''}</small></span><div className="valplan-actions">
            {others.length > 0 && <label><span className="sr-only">Flytta {pupilName(m.pupilId)}</span><select value="" disabled={busy} onChange={e => { if (e.target.value) void send(command('move_member', { membershipId: m.id, toGroupId: e.target.value, on: clamp(on, others.find(o => o.id === e.target.value)!) }), `${pupilName(m.pupilId)} är flyttad.`); }}><option value="">Flytta till…</option>{others.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
            <Button size="sm" variant="outline" disabled={busy} aria-label={`Avsluta ${pupilName(m.pupilId)}`} onClick={() => void endMember(m)}>Avsluta</Button></div></li>)}</ul> : <p className="valplan-muted">Inga elever ännu.</p>}
          {adding === g.id ? <label>Lägg till elev<select value="" disabled={busy} onChange={e => { const pupilId = e.target.value; if (pupilId) void send(command('add_members', { groupId: g.id, members: [{ pupilId, startsOn: clamp(on, g), endsOn: g.endsOn, source: 'manual', sourceRef: null }] }), `${pupilName(pupilId)} är tillagd.`); }}><option value="">Välj elev</option>
            {data.pupils.filter(p => !set.some(x => memberships(x).some(current) && memberships(x).some(m => m.pupilId === p.id && current(m)))).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : null}
          <div className="valplan-actions">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(adding === g.id ? null : g.id)}>{adding === g.id ? 'Klar' : 'Lägg till elev'}</Button>
            {!draft && <Button size="sm" variant="outline" disabled={busy} onClick={() => change(g)}>Ändra</Button>}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void send(command('retire_group', { groupId: g.id, expectedRevision: g.revision }), 'Gruppen är avvecklad.')}>Avveckla</Button></div>
        </article>; })}</div>
        <div className="valplan-actions">
          {!draft && <Button variant="outline" disabled={busy} onClick={() => parallel(set)}>Ny parallell grupp</Button>}
          <Button variant="outline" disabled={busy || !set.some(g => g.classIds.length)} onClick={() => void distribute(set)}>Fördela jämnt</Button></div>
        {!set.some(g => g.classIds.length) && <p className="valplan-muted">Fördela jämnt hämtar eleverna från klasserna, och gruppen har inga klasser.</p>}
      </section>)}
      <LegacyBlockRetirement unitId={unitId} schoolYear={schoolYear} onSessionLost={onSessionLost}/>
    </>}
  </section>;
}
