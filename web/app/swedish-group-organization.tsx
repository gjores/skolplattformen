'use client';

import { useEffect, useEffectEvent, useId, useRef, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseStudyGroupCommand, parseStudyGroupRead, parseStudyGroupReply, type StudyGroupCommand, type StudyGroupRead } from '@/lib/study-group-contract.ts';
import type { StudyGroup } from '@/lib/study-group-model.ts';
import { formatTimplanMinutes } from '@/lib/timplan-time.ts';
import { useRequestDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';
import './valplaner.css';

const SUBJECTS = { SVEN: 'Svenska', SVEA: 'Svenska som andraspråk' } as const;
type Subject = keyof typeof SUBJECTS;
type Source = NonNullable<StudyGroupRead['svenskaSources']>[number];
type Level = Source['level'];
type GroupDraft = {
  groupId: string; expectedRevision: number; name: string; forecast: string | null; subjectCode: Subject; classIds: string[];
};
type Draft = { level: Level; classIds: string[]; groups: GroupDraft[] };
type Failure = { message: string; reload?: true };
type Props = { unitId: string; schoolYear: number; initialClassId?: string; initialGroupId?: string; onClose: () => void;
  onSaved: (read: StudyGroupRead) => void; onSessionLost?: () => void };

const sourceTimes = (source: Source) => `HT ${formatTimplanMinutes(source.needHt) || '0'} h · VT ${formatTimplanMinutes(source.needVt) || '0'} h`;
const levelSources = (read: StudyGroupRead, level: Level) => (read.svenskaSources ?? []).filter(source => source.level === level);
const subjectOf = (group: StudyGroup): Subject => group.course?.subjectCode === 'SVEA' ? 'SVEA' : 'SVEN';
const isSubjectAtLevel = (group: StudyGroup, level: Level, subject: Subject) => group.course?.subjectCode === subject && group.course.itemCode === `${subject}${level}000X`;
const className = (read: StudyGroupRead, classId: string) => read.classes.find(item => item.id === classId)?.name ?? 'Klass';

function fromGroup(group: StudyGroup, fallbackClassIds: string[]): GroupDraft {
  return { groupId: group.id, expectedRevision: group.revision, name: group.name,
    forecast: group.svenska?.forecast == null ? null : String(group.svenska.forecast), subjectCode: subjectOf(group),
    classIds: group.classIds.length ? group.classIds : fallbackClassIds };
}

function newGroup(read: StudyGroupRead, level: Level, subjectCode: Subject, classIds: string[]): GroupDraft {
  const selection = classIds.length === 1 ? className(read, classIds[0]) : `${classIds.length} klasser`;
  return { groupId: crypto.randomUUID(), expectedRevision: 0, subjectCode, classIds,
    name: `${SUBJECTS[subjectCode]} nivå ${level} · ${selection}`.slice(0, 200), forecast: '' };
}

function includeLinkedClasses(read: StudyGroupRead, draft: Draft, selectedClassIds: string[]): Draft {
  const sources = levelSources(read, draft.level);
  const classIds = new Set(selectedClassIds), groupIds = new Set<string>();
  // A group shared by classes has one identity and must be edited along with all its linked classes.
  let foundClass = true;
  while (foundClass) {
    foundClass = false;
    for (const source of sources) if (classIds.has(source.classId)) for (const id of source.groupIds) groupIds.add(id);
    for (const source of sources) if (!classIds.has(source.classId) && source.groupIds.some(id => groupIds.has(id))) {
      classIds.add(source.classId);
      foundClass = true;
    }
  }
  return { ...draft, classIds: [...classIds], groups: [
    ...draft.groups.map(group => ({ ...group, classIds: group.classIds.filter(id => classIds.has(id)) })),
    ...read.groups.filter(group => group.active && groupIds.has(group.id) && !draft.groups.some(value => value.groupId === group.id)).map(group => fromGroup(group, [])),
  ] };
}

function newDraft(read: StudyGroupRead, level: Level, initialClassId?: string): Draft {
  const sources = levelSources(read, level);
  const initialSource = sources.find(source => initialClassId === source.classId) ?? (sources.length === 1 ? sources[0] : undefined);
  return includeLinkedClasses(read, { level, classIds: [], groups: [] }, initialSource ? [initialSource.classId] : []);
}

function validate(draft: Draft, sources: Source[]): string | null {
  if (!draft.classIds.length) return 'Välj minst en klass.';
  if (draft.classIds.length > 500 || draft.groups.length > 500) return 'Spara högst 500 klasser och 500 grupper åt gången.';
  if (draft.classIds.some(id => !draft.groups.some(group => group.classIds.includes(id)))) return 'Varje vald klass behöver minst en grupp.';
  for (const group of draft.groups) {
    if (!group.name.trim() || !group.classIds.length) return 'Ange namn och välj klasser för varje grupp.';
    if (group.forecast !== null && (!/^\d+$/u.test(group.forecast) || Number(group.forecast) < 1 || Number(group.forecast) > 999)) return 'Ange ett beräknat elevantal mellan 1 och 999 för varje prognosgrupp.';
    const needs = sources.filter(source => group.classIds.includes(source.classId));
    if (new Set(needs.map(s => `${s.needHt}/${s.needVt}`)).size > 1) return 'Klasser med olika undervisningstid behöver skilda grupper.';
  }
  return null;
}

function saveError(error: unknown): Failure {
  if (error instanceof ApiError) {
    if (error.status === 409 || error.reason === 'study_group_swedish_sources' || error.reason === 'study_group_swedish_complete') {
      return { message: 'Underlaget har ändrats. Hämta aktuellt läge och granska organisationen igen.', reload: true };
    }
    if (error.reason === 'study_group_swedish_course') return { message: 'Välj en aktiv grupp i rätt ämne och nivå.' };
    if (error.reason === 'study_group_swedish_time') return { message: 'Klasser med olika undervisningstid behöver skilda grupper.' };
    if (error.reason === 'study_group_swedish_period') return { message: 'Gruppens period behöver täcka terminerna med undervisning. Ändra perioden i Undervisningsgrupper och försök igen.' };
    if (error.status === 403) return { message: 'Ditt uppdrag tillåter inte den här åtgärden.' };
    if (error.status === 400) return { message: 'Organisationen kunde inte sparas. Kontrollera gruppernas klasser, nivå och undervisningstid.' };
  }
  return { message: 'Sparandet kunde inte bekräftas. Kontrollera sparstatus.' };
}

export default function SwedishGroupOrganization({ unitId, schoolYear, initialClassId, initialGroupId, onClose, onSaved, onSessionLost }: Props) {
  const id = useId();
  const [read, setRead] = useState<StudyGroupRead | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [loadKey, setLoadKey] = useState(0), [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState(false), [error, setError] = useState<Failure | null>(null), [mfa, setMfa] = useState(false);
  const [pending, setPending] = useState<StudyGroupCommand | null>(null), [busy, setBusy] = useState(false);
  const requestDiscard = useRequestDiscard();
  const running = useRef(false);
  useUnsavedChanges('svenska-organisation', dirty || Boolean(pending));

  const handleRead = useEffectEvent((value: unknown) => {
    const data = parseStudyGroupRead(value, { unitId, schoolYear });
    const sources = data.svenskaSources ?? [];
    const groupSource = sources.find(source => initialGroupId && source.groupIds.includes(initialGroupId));
    const initial = groupSource ?? sources.find(source => source.classId === initialClassId) ?? sources[0];
    setRead(data);
    setDraft(initial ? newDraft(data, initial.level, groupSource?.classId ?? initialClassId) : null);
  });
  const failedRead = useEffectEvent((caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 401) onSessionLost?.();
    else if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true);
    else setLoadError(true);
  });
  useEffect(() => {
    const controller = new AbortController();
    api.post('/api/undervisningsgrupper/lasa', { unitId, schoolYear }, controller.signal)
      .then(handleRead).catch(caught => { if (!controller.signal.aborted) failedRead(caught); });
    return () => controller.abort();
  }, [unitId, schoolYear, loadKey]);

  const close = async () => { if (!running.current && (!dirty && !pending || await requestDiscard())) onClose(); };
  const update = (next: Draft) => { setDraft(next); setError(null); setDirty(true); };
  const reload = async () => {
    if (dirty && !await requestDiscard()) return;
    setRead(null); setDraft(null); setError(null); setLoadError(false); setDirty(false); setMfa(false); setLoadKey(current => current + 1);
  };
  async function save(command: StudyGroupCommand) {
    if (running.current) return;
    running.current = true;
    setBusy(true); setPending(command); setError(null); setMfa(false);
    try {
      const reply = parseStudyGroupReply(await api.post('/api/undervisningsgrupper/kommando', command), command);
      setPending(null); setDirty(false); onSaved(reply.read);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) onSessionLost?.();
      if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true);
      if (caught instanceof ApiError && caught.status >= 400 && caught.status < 500) setPending(null);
      setError(saveError(caught));
    } finally { running.current = false; setBusy(false); }
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !read || pending) return;
    const sources = levelSources(read, draft.level);
    const problem = validate(draft, sources);
    if (problem) { setError({ message: problem }); return; }
    try {
      const command = parseStudyGroupCommand({ contractVersion: 'study_group_v1', commandId: crypto.randomUUID(), unitId, schoolYear, action: 'organize_swedish', payload: {
        sources: sources.filter(source => draft.classIds.includes(source.classId)).map(({ classId, sourceKey }) => ({ classId, sourceKey })),
        groups: draft.groups.map(group => ({ ...group, name: group.name.trim(), forecast: group.forecast === null ? null : Number(group.forecast) })),
      } });
      void save(command);
    } catch { setError({ message: 'Klassernas underlag gick inte att kontrollera. Hämta aktuellt läge och försök igen.', reload: true }); }
  }

  const levels = [...new Set(read?.svenskaSources?.map(source => source.level) ?? [])].sort((a, b) => a - b);
  const sources = read && draft ? levelSources(read, draft.level) : [];
  const locked = busy || Boolean(pending);
  const linked = new Set(sources.flatMap(source => source.groupIds));
  const knownGroups = read?.groups.filter(group => group.active && group.origin.kind !== 'valplan' && !linked.has(group.id)
    && !draft?.groups.some(value => value.groupId === group.id) && draft && (isSubjectAtLevel(group, draft.level, 'SVEN') || isSubjectAtLevel(group, draft.level, 'SVEA'))
    && group.classIds.every(id => draft.classIds.includes(id))) ?? [];
  const groupCount = (groupId: string) => new Set(read?.memberships.filter(m => m.groupId === groupId).map(m => m.pupilId)).size;
  const classesWithoutSwedish = draft?.classIds.filter(id => !draft.groups.some(group => group.subjectCode === 'SVEN' && group.classIds.includes(id))) ?? [];
  function addGroup(subjectCode: Subject, classIds: string[]) {
    if (!draft || !read) return;
    update({ ...draft, groups: [...draft.groups, newGroup(read, draft.level, subjectCode, classIds)] });
  }

  return <Dialog open onOpenChange={open => { if (!open) void close(); }}>
    <DialogContent className="valplan-workspace max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={false}>
      <DialogTitle>Organisera Svenska/SvA</DialogTitle>
      <DialogDescription>Planera undervisningsgrupper för en nivå. Använd beräknat elevantal när eleverna ännu inte är placerade.</DialogDescription>
      {!read && !loadError && !mfa && <output>Hämtar undervisningsunderlag…</output>}
      {loadError && <div className="valplan-alert" role="alert"><p>Undervisningsunderlaget kunde inte hämtas.</p><Button variant="outline" onClick={() => void reload()}>Försök igen</Button></div>}
      {read && !draft && <p className="empty-state">Läsåret saknar klasser med en kopplad Svenska/SvA-rad i timplanen.</p>}
      {mfa && <MfaStepUpNotice message="Verifiera inloggningen för att fortsätta."/>}
      {read && draft && <form className="grid min-w-0 gap-4" onSubmit={submit}>
        <fieldset disabled={locked} className="grid min-w-0 gap-4">
          <div className="grid gap-1"><label htmlFor={`${id}-level`}>Nivå</label><NativeSelect id={`${id}-level`} className="[&_select]:bg-none" value={draft.level} onChange={async event => {
            const level = Number(event.target.value) as Level;
            if (!dirty || await requestDiscard()) { setDraft(newDraft(read, level, initialClassId)); setError(null); setDirty(false); }
          }}>{levels.map(level => <NativeSelectOption key={level} value={level}>Nivå {level}</NativeSelectOption>)}</NativeSelect></div>
          <fieldset className="grid min-w-0 gap-1">
            <legend className="font-semibold">Klasser</legend>
            <div className="grid gap-1 sm:grid-cols-2">{sources.map(source => <label key={source.sourceKey} className="valplan-check">
              <input type="checkbox" checked={draft.classIds.includes(source.classId)} disabled={draft.classIds.includes(source.classId) && source.groupIds.length > 0} onChange={event => {
                const ids = event.target.checked ? [...draft.classIds, source.classId] : draft.classIds.filter(id => id !== source.classId);
                update(includeLinkedClasses(read, draft, ids));
              }}/><span>{className(read, source.classId)}<small>{sourceTimes(source)}{source.groupIds.length > 0 ? ' · Organiserad' : ''}</small></span>
            </label>)}</div>
          </fieldset>
          {draft.classIds.length > 0 && <fieldset className="grid min-w-0 gap-3">
            <legend className="font-semibold">Undervisningsgrupper att bemanna</legend>
            <div className="valplan-actions">
              <Button type="button" variant="outline" onClick={() => addGroup('SVEN', draft.classIds)}>Lägg till svenskgrupp</Button>
              {classesWithoutSwedish.length > 1 && <Button type="button" variant="outline" onClick={() => update({ ...draft,
                groups: [...draft.groups, ...classesWithoutSwedish.map(id => newGroup(read, draft.level, 'SVEN', [id]))],
              })}>Lägg till Svenska per klass</Button>}
              <Button type="button" variant="outline" onClick={() => addGroup('SVEA', draft.classIds)}>Lägg till SvA-grupp</Button>
            </div>
            {knownGroups.length > 0 && <div className="grid gap-1"><label htmlFor={`${id}-existing`}>Använd befintlig grupp</label><NativeSelect id={`${id}-existing`} className="[&_select]:bg-none" value="" onChange={event => {
              const group = knownGroups.find(candidate => candidate.id === event.target.value);
              if (group) update({ ...draft, groups: [...draft.groups, fromGroup(group, draft.classIds)] });
            }}><NativeSelectOption value="">Välj grupp</NativeSelectOption>{knownGroups.map(group => <NativeSelectOption key={group.id} value={group.id}>{group.name} · {groupCount(group.id)} placerade</NativeSelectOption>)}</NativeSelect></div>}
            <div className="valplan-group-board">{draft.groups.map(group => {
              const field = `${id}-${group.groupId}`;
              const placed = groupCount(group.groupId);
              const change = (values: Partial<GroupDraft>) => update({ ...draft, groups: draft.groups.map(value => value.groupId === group.groupId ? { ...value, ...values } : value) });
              return <fieldset key={group.groupId} className="valplan-group">
                <legend className="font-semibold">{SUBJECTS[group.subjectCode]}</legend>
                <label htmlFor={`${field}-name`}>Namn<Input id={`${field}-name`} value={group.name} maxLength={200} onChange={event => change({ name: event.target.value })}/></label>
                <fieldset className="grid min-w-0">
                  <legend>Klasser i gruppen</legend>
                  {draft.classIds.map(id => <label key={id} className="valplan-check"><input type="checkbox" checked={group.classIds.includes(id)} onChange={event => change({ classIds: event.target.checked ? [...group.classIds, id] : group.classIds.filter(value => value !== id) })}/><span>{className(read, id)}</span></label>)}
                </fieldset>
                <div className="grid gap-1"><label htmlFor={`${field}-basis`}>Elevunderlag</label><NativeSelect id={`${field}-basis`} className="[&_select]:bg-none" value={group.forecast === null ? 'known' : 'forecast'} onChange={event => change({ forecast: event.target.value === 'known' ? null : String(placed || '') })}>
                  <NativeSelectOption value="forecast">Prognos</NativeSelectOption><NativeSelectOption value="known">Kända deltagare</NativeSelectOption>
                </NativeSelect></div>
                {group.forecast !== null && <label htmlFor={`${field}-forecast`}>Beräknat elevantal<Input id={`${field}-forecast`} type="number" inputMode="numeric" min={1} max={999} value={group.forecast} onChange={event => change({ forecast: event.target.value })}/></label>}
                <p className="valplan-muted">{placed} placerade elever</p>
                {!linked.has(group.groupId) && <Button type="button" variant="outline" onClick={() => update({ ...draft, groups: draft.groups.filter(value => value.groupId !== group.groupId) })}>Ta bort grupp ur förslaget</Button>}
              </fieldset>;
            })}</div>
          </fieldset>}
        </fieldset>
        {error && <div className="valplan-alert" role="alert"><p>{error.message}</p>{pending && <Button type="button" variant="outline" disabled={busy} onClick={() => void save(pending)}>Kontrollera sparstatus</Button>}
          {error.reload && <Button type="button" variant="outline" onClick={() => void reload()}>Hämta aktuellt läge</Button>}</div>}
        <div className="valplan-actions"><Button type="submit" disabled={locked || !draft.classIds.length}>{busy ? 'Sparar…' : 'Spara organisation'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>Avbryt</Button></div>
      </form>}
      {!draft && <div className="valplan-actions"><Button variant="outline" onClick={() => void close()}>Stäng</Button></div>}
    </DialogContent>
  </Dialog>;
}
