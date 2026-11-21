'use client';

import { useId, useState, type ReactNode, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { VOCATIONAL_GY25_CODES } from '@/lib/programplan-profile.ts';
import type { StudyPlanCalendarYear, StudyPlanCommand, StudyPlanDraftEdit, StudyPlanEvent } from '@/lib/study-plan-contract.ts';
import {
  parsePlannedStudyDate, parseStudyPlanCompulsorySubjects, parseStudyPlanDecision, parseStudyPlanDistanceTeaching,
  studyPlanDate, studyPlanLevelKey, studyPlanUuid, validPlannedStudyPeriod,
  type PlannedStudyDate, type StudyPlanAttempt, type StudyPlanCatalogLevel, type StudyPlanChoice,
  type StudyPlanCompulsorySubject, type StudyPlanDecision, type StudyPlanLevel, type StudyPlanLevelRef, type StudyPlanSnapshot,
} from '@/lib/study-plan-model.ts';

const control = 'min-h-[var(--control-height)] w-full min-w-0 text-base sm:text-sm';
const selectClass = 'w-full min-w-0 [&>select]:min-h-[var(--control-height)] [&>select]:text-base sm:[&>select]:text-sm';
const action = 'min-h-[var(--control-height)] h-auto max-w-full whitespace-normal py-2 text-left';
const detail = 'rounded-lg border border-border bg-card px-3';
const summary = 'min-h-[var(--control-height)] cursor-pointer py-3 text-sm font-medium wrap-anywhere focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring';

function Labelled({ id, label, children, planField }: { id: string; label: string; children: ReactNode; planField?: string }) {
  return <div className="grid min-w-0 gap-2" data-study-plan-field={planField} tabIndex={planField ? -1 : undefined}>
    <Label className="leading-snug" htmlFor={id}>{label}</Label>{children}</div>;
}

function CheckLine({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return <div className="flex items-center gap-2">
    <Checkbox id={id} aria-labelledby={id + '-label'} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    <Label id={id + '-label'} htmlFor={id} className="min-h-[var(--control-height)] min-w-0 cursor-pointer leading-snug wrap-anywhere">{label}</Label>
  </div>;
}

function FormError({ message }: { message: string | null }) {
  return message ? <p className="validation-warning" role="alert">{message}</p> : null;
}

type DateValues = { precision: 'missing' | 'term' | 'day'; day: string; term: 'HT' | 'VT'; year: string };
export type StudyPlanPeriodEdit = { start: DateValues; end: DateValues };

function dateValues(date: PlannedStudyDate): DateValues {
  return {
    precision: date?.kind ?? 'missing', day: date?.kind === 'day' ? date.date : '',
    term: date?.kind === 'term' ? date.term : 'HT',
    year: date?.kind === 'term' ? String(date.schoolYear + (date.term === 'VT' ? 1 : 0)) : '',
  };
}
function plannedDate(value: DateValues): PlannedStudyDate {
  if (value.precision === 'missing') return null;
  if (value.precision === 'day') return parsePlannedStudyDate({ kind: 'day', date: value.day });
  if (!/^\d{4}$/.test(value.year)) throw new Error('Invalid planned year');
  return parsePlannedStudyDate({ kind: 'term', schoolYear: Number(value.year) - (value.term === 'VT' ? 1 : 0), term: value.term });
}

export function studyPlanPeriodValues(attempt: Pick<StudyPlanAttempt, 'plannedStart' | 'plannedEnd'>): StudyPlanPeriodEdit {
  return { start: dateValues(attempt.plannedStart), end: dateValues(attempt.plannedEnd) };
}

export function parseStudyPlanPeriodEdit(value: StudyPlanPeriodEdit) {
  const plannedStart = plannedDate(value.start);
  const plannedEnd = plannedDate(value.end);
  if (!validPlannedStudyPeriod(plannedStart, plannedEnd)) throw new Error('Invalid planned period');
  return { plannedStart, plannedEnd };
}

export function StudyPlanPeriodFields({ value, calendar, disabled, onChange }: {
  value: StudyPlanPeriodEdit; calendar: readonly StudyPlanCalendarYear[]; disabled: boolean;
  onChange: (value: StudyPlanPeriodEdit) => void;
}) {
  return <div className="grid min-w-0 gap-3 @sm/study-plan:grid-cols-2">
    <DateFields edge="start" value={value.start} onChange={start => onChange({ ...value, start })} disabled={disabled} calendar={calendar} />
    <DateFields edge="end" value={value.end} onChange={end => onChange({ ...value, end })} disabled={disabled} calendar={calendar} />
  </div>;
}

function DateFields({ edge, value, onChange, calendar, disabled }: {
  edge: 'start' | 'end'; value: DateValues; disabled: boolean;
  onChange: (value: DateValues) => void; calendar: readonly StudyPlanCalendarYear[];
}) {
  const id = useId();
  const schoolYear = Number(value.year) - (value.term === 'VT' ? 1 : 0);
  const schoolCalendar = value.precision === 'term' ? calendar.find(y => y.schoolYear === schoolYear) : undefined;
  const suggestion = value.term === 'HT'
    ? (edge === 'start' ? schoolCalendar?.htStart : schoolCalendar?.htEnd)
    : (edge === 'start' ? schoolCalendar?.vtStart : schoolCalendar?.vtEnd);
  const exactLabel = edge === 'start' ? 'Startdatum' : 'Slutdatum';
  return <FieldSet className="min-w-0 gap-3">
    <FieldLegend>{edge === 'start' ? 'Planerad start' : 'Planerat slut'}</FieldLegend>
    <Labelled id={id} label="Precision">
      <NativeSelect id={id} className={selectClass} value={value.precision} disabled={disabled}
        onChange={event => onChange({ ...value, precision: event.target.value as DateValues['precision'] })}>
        <NativeSelectOption value="missing">Ej planerat</NativeSelectOption>
        <NativeSelectOption value="term">Termin</NativeSelectOption>
        <NativeSelectOption value="day">Exakt datum</NativeSelectOption>
      </NativeSelect>
    </Labelled>
    {value.precision === 'term' && <div className="grid min-w-0 grid-cols-2 gap-3">
      <Labelled id={id + '-term'} label="Termin">
        <NativeSelect id={id + '-term'} className={selectClass} value={value.term} disabled={disabled}
          onChange={event => onChange({ ...value, term: event.target.value === 'VT' ? 'VT' : 'HT' })}>
          <NativeSelectOption value="HT">HT</NativeSelectOption><NativeSelectOption value="VT">VT</NativeSelectOption>
        </NativeSelect>
      </Labelled>
      <Labelled id={id + '-year'} label="År">
        <Input id={id + '-year'} className={control + ' px-1.5 tabular-nums'} type="text" maxLength={4}
          inputMode="numeric" value={value.year} disabled={disabled} onChange={event => onChange({ ...value, year: event.target.value })} />
      </Labelled>
    </div>}
    {suggestion && <Button type="button" variant="outline" className={action + ' justify-self-start'}
      onClick={() => onChange({ ...value, precision: 'day', day: suggestion })} disabled={disabled}>
      Använd {suggestion} som {exactLabel.toLocaleLowerCase('sv-SE')}
    </Button>}
    {value.precision === 'day' && <Labelled id={id + '-day'} label={exactLabel}>
      <DatePicker id={id + '-day'} value={value.day} disabled={disabled} onValueChange={day => onChange({ ...value, day })} />
    </Labelled>}
  </FieldSet>;
}

type Selection = NonNullable<StudyPlanDraftEdit['selections']>[number];
function levelRef(level: StudyPlanCatalogLevel): StudyPlanLevelRef {
  return { subjectCode: level.subjectCode, subjectVersion: level.subjectVersion, itemCode: level.itemCode, languageCode: level.languageCode };
}
function StudyChoiceFields({
  choice, options, chosen, locked, confirmed, disabled, canAdd, blocked, onAdd, onRemove, onConfirm,
}: {
  choice: StudyPlanChoice; options: StudyPlanCatalogLevel[]; chosen: StudyPlanCatalogLevel[]; locked: StudyPlanLevel[];
  confirmed: boolean; disabled: boolean; canAdd: boolean; blocked: ReadonlySet<string>;
  onAdd: (level: StudyPlanCatalogLevel) => void; onRemove: (level: StudyPlanCatalogLevel) => void; onConfirm: (confirmed: boolean) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState('');
  const search = query.trim().toLocaleLowerCase('sv-SE');
  const rendered = options.filter(level => !blocked.has(studyPlanLevelKey(level))
    && `${level.label} ${level.itemCode}`.toLocaleLowerCase('sv-SE').includes(search));
  const active = rendered.slice(0, 30);
  const selected = active.find(level => studyPlanLevelKey(level) === pick);
  const points = [...locked, ...chosen].reduce((sum, level) => sum + level.points, 0);
  return <details id={`study-plan-choice-${choice.id}`} className={detail} data-study-plan-field={choice.id}>
    <summary className={summary}>{choice.label}</summary>
    <div className="min-w-0 space-y-3 pb-3">
      {(locked.length > 0 || chosen.length > 0)
        && <ul className="min-w-0 divide-y divide-border text-sm" aria-label="Valda nivåer">
          {locked.map(level => <li key={level.id} className="min-h-[var(--control-height)] py-2 wrap-anywhere">{level.label} · {level.points} p</li>)}
          {chosen.map(level => <li key={studyPlanLevelKey(level)} className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 wrap-anywhere">{level.label} · {level.points} p</span>
            <Button type="button" variant="ghost" className={action} aria-label={`Ta bort ${level.label}`}
              disabled={disabled} onClick={() => onRemove(level)}>Ta bort</Button>
          </li>)}
        </ul>}
      <p className="text-sm text-muted-foreground">{points} poäng valda</p>
      <Labelled id={id + '-query'} label="Sök ämne eller nivåkod">
        <Input id={id + '-query'} className={control} type="search" value={query} disabled={disabled}
          onChange={event => { setQuery(event.target.value); setPick(''); }} />
      </Labelled>
      {active.length ? <div className="flex min-w-0 flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <Labelled id={id + '-pick'} label="Välj nivå">
            <NativeSelect id={id + '-pick'} className={selectClass} value={pick} disabled={disabled}
              onChange={event => setPick(event.target.value)} aria-describedby={rendered.length > active.length ? id + '-more' : undefined}>
              <NativeSelectOption value="">Välj ur katalogen</NativeSelectOption>
              {active.map(level => <NativeSelectOption key={studyPlanLevelKey(level)} value={studyPlanLevelKey(level)}>
                {level.label} · {level.points} p
              </NativeSelectOption>)}
            </NativeSelect>
          </Labelled>
        </div>
        <Button type="button" className={action} variant="outline" disabled={!selected || disabled || !canAdd}
          onClick={() => { if (selected) { onAdd(selected); setPick(''); setQuery(''); } }}>Lägg till nivå</Button>
      </div> : <p className="text-sm text-muted-foreground">Inga nivåer matchar sökningen.</p>}
      {rendered.length > active.length && <p id={id + '-more'} className="text-sm text-muted-foreground">
        {rendered.length} nivåer matchar. Begränsa sökningen för att hitta rätt nivå.
      </p>}
      {choice.id === 'extra'
        ? <p className="text-sm text-muted-foreground">Registrera ett befintligt beslut om nivåerna och spara utkastet igen inför granskning.</p>
        : <CheckLine label="Bekräfta valet" checked={confirmed} disabled={disabled || points === 0} onChange={onConfirm} />}
    </div>
  </details>;
}

type EditorProps = {
  snapshot: StudyPlanSnapshot; availableLevels: readonly StudyPlanCatalogLevel[];
  disabled: boolean;
  onSave: (payload: StudyPlanDraftEdit) => void; onCancel: () => void;
};
export function StudyPlanEditor({ snapshot, availableLevels, disabled, onSave, onCancel }: EditorProps) {
  const id = useId();
  const { content } = snapshot;
  const [apprenticeship, setApprenticeship] = useState(content.path.apprenticeship === null ? '' : content.path.apprenticeship ? 'yes' : 'no');
  const [subjectsMode, setSubjectsMode] = useState(!content.compulsorySchoolSubjects ? 'unknown' : content.compulsorySchoolSubjects.length ? 'applies' : 'none');
  const [subjects, setSubjects] = useState<StudyPlanCompulsorySubject[]>(content.compulsorySchoolSubjects ?? []);
  const [distance, setDistance] = useState(content.distanceTeaching.kind);
  const [minutes, setMinutes] = useState(content.distanceTeaching.minutes?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [selectionsChanged, setSelectionsChanged] = useState(false);
  const [confirmations, setConfirmations] = useState(() => new Set(content.choices.filter(choice => choice.state === 'confirmed').map(choice => choice.id)));
  const available = new Map(availableLevels.map(level => [studyPlanLevelKey(level), level]));
  const levelById = new Map(content.levels.map(level => [level.id, level]));
  const editableOptions = new Map<string, StudyPlanCatalogLevel[]>();
  for (const level of availableLevels) {
    for (const choiceId of level.choiceIds ?? []) {
      const options = editableOptions.get(choiceId) ?? [];
      if (!editableOptions.has(choiceId)) editableOptions.set(choiceId, options);
      options.push(level);
    }
  }
  const [selections, setSelections] = useState<Selection[]>(() => content.choices.flatMap(choice => choice.levelIds.flatMap(levelId => {
    const level = levelById.get(levelId);
    const option = level ? available.get(studyPlanLevelKey(level)) : undefined;
    return option?.choiceIds?.includes(choice.id) ? [{ choiceId: choice.id, level: levelRef(option) }] : [];
  })));

  function changeSelection(next: Selection[], choiceId: string) {
    setSelections(next);
    setSelectionsChanged(true);
    setConfirmations(previous => new Set([...previous].filter(value => value !== choiceId)));
  }

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    let compulsorySchoolSubjects: StudyPlanDraftEdit['compulsorySchoolSubjects'];
    try {
      compulsorySchoolSubjects = parseStudyPlanCompulsorySubjects(subjectsMode === 'unknown' ? null
        : subjectsMode === 'none' ? [] : subjects.length ? subjects.map(subject => ({ code: subject.code.trim(), label: subject.label.trim() })) : null);
    } catch {
      setError('Grundskoleämnen behöver ha en ämneskod och ett ämnesnamn. Använd varje kod en gång.');
      return;
    }
    let distanceTeaching: StudyPlanDraftEdit['distanceTeaching'];
    try {
      distanceTeaching = parseStudyPlanDistanceTeaching({ kind: distance, minutes: distance === 'applies' && minutes !== '' ? Number(minutes) : null });
    } catch {
      setError('Ange fjärrundervisningens omfattning i hela minuter.');
      return;
    }
    onSave({
      dates: [], compulsorySchoolSubjects, distanceTeaching,
      ...(apprenticeship ? { apprenticeship: apprenticeship === 'yes' } : {}),
      ...(selectionsChanged ? { selections } : {}),
      confirmedChoiceIds: [...confirmations].filter(choiceId => editableOptions.has(choiceId) && choiceId !== 'extra'),
    });
  }

  const blocked = new Set(selections.map(item => studyPlanLevelKey(item.level)));
  return <form aria-label="Redigera studieplan" onSubmit={submit} noValidate className="min-w-0 space-y-6">
    <section aria-labelledby={id + '-details'} className="min-w-0 space-y-3">
      <h3 className="section-heading" id={id + '-details'}>Studieväg och undervisning</h3>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
        <Labelled id={id + '-apprentice'} label="Lärlingsutbildning" planField="path">
          <NativeSelect id={id + '-apprentice'} className={selectClass} value={apprenticeship} disabled={disabled}
            onChange={event => setApprenticeship(event.target.value)}>
            {content.path.apprenticeship === null && <NativeSelectOption value="">Uppgift saknas</NativeSelectOption>}
            <NativeSelectOption value="no">Nej</NativeSelectOption>
            {VOCATIONAL_GY25_CODES.some(code => code === content.path.programCode) && <NativeSelectOption value="yes">Ja</NativeSelectOption>}
          </NativeSelect>
        </Labelled>
        <Labelled id={id + '-school-subjects'} label="Grundskoleämnen" planField="compulsorySchoolSubjects">
          <NativeSelect id={id + '-school-subjects'} className={selectClass} value={subjectsMode} disabled={disabled}
            onChange={event => setSubjectsMode(event.target.value)}>
            <NativeSelectOption value="unknown">Uppgift saknas</NativeSelectOption><NativeSelectOption value="none">Inga grundskoleämnen</NativeSelectOption>
            <NativeSelectOption value="applies">Grundskoleämnen ingår</NativeSelectOption>
          </NativeSelect>
        </Labelled>
        {subjectsMode === 'applies' && <div className="space-y-3 lg:col-span-2">
          {subjects.map((subject, index) => <div key={index} className="flex min-w-0 flex-wrap items-end gap-3">
            <div className="min-w-0 grow basis-28">
              <Labelled id={id + '-code-' + index} label="Ämneskod">
                <Input id={id + '-code-' + index} className={control} maxLength={96} value={subject.code} disabled={disabled}
                  onChange={event => setSubjects(subjects.map((entry, i) => i === index ? { ...entry, code: event.target.value } : entry))} />
              </Labelled>
            </div>
            <div className="min-w-0 grow basis-40">
              <Labelled id={id + '-name-' + index} label="Ämnesnamn">
                <Input id={id + '-name-' + index} className={control} maxLength={240} value={subject.label} disabled={disabled}
                  onChange={event => setSubjects(subjects.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry))} />
              </Labelled>
            </div>
            <Button type="button" variant="outline" className={action} disabled={disabled}
              aria-label={`Ta bort grundskoleämne ${index + 1}`} onClick={() => setSubjects(subjects.filter((_, i) => i !== index))}>Ta bort</Button>
          </div>)}
          <Button type="button" variant="outline" className={action} disabled={disabled || subjects.length >= 50}
            onClick={() => setSubjects([...subjects, { code: '', label: '' }])}>Lägg till grundskoleämne</Button>
        </div>}
        <Labelled id={id + '-distance'} label="Fjärrundervisning" planField={distance === 'applies' ? undefined : 'distanceTeaching'}>
          <NativeSelect id={id + '-distance'} className={selectClass} value={distance} disabled={disabled}
            onChange={event => setDistance(event.target.value as typeof distance)}>
            <NativeSelectOption value="unknown">Uppgift saknas</NativeSelectOption><NativeSelectOption value="none">Ingen fjärrundervisning</NativeSelectOption>
            <NativeSelectOption value="applies">Fjärrundervisning ingår</NativeSelectOption>
          </NativeSelect>
        </Labelled>
        {distance === 'applies' && <Labelled id={id + '-minutes'} label="Omfattning i minuter" planField="distanceTeaching">
          <Input id={id + '-minutes'} className={control} value={minutes} type="number" min={1} max={1000000} step={1}
            inputMode="numeric" disabled={disabled} onChange={event => setMinutes(event.target.value)} />
        </Labelled>}
      </div>
    </section>

    {editableOptions.size > 0 && <section aria-labelledby={id + '-choices'} className="min-w-0 space-y-2" data-study-plan-field="levels">
      <h3 className="section-heading" id={id + '-choices'}>Val av nivåer</h3>
      {content.choices.map(choice => {
        const options = editableOptions.get(choice.id), chosen = selections.flatMap(selection => {
          const level = selection.choiceId === choice.id ? available.get(studyPlanLevelKey(selection.level)) : undefined;
          return level ? [level] : [];
        });
        if (!options?.length) return null;
        const locked = choice.levelIds.flatMap(levelId => {
          const level = levelById.get(levelId);
          return level && !options.some(option => studyPlanLevelKey(option) === studyPlanLevelKey(level)) ? [level] : [];
        });
        return <StudyChoiceFields key={choice.id} choice={choice} options={options} chosen={chosen} locked={locked}
          blocked={blocked} confirmed={confirmations.has(choice.id)} disabled={disabled} canAdd={selections.length < 150}
          onAdd={level => changeSelection([...selections, { choiceId: choice.id, level: levelRef(level) }], choice.id)}
          onRemove={level => changeSelection(selections.filter(sel => studyPlanLevelKey(sel.level) !== studyPlanLevelKey(level)), choice.id)}
          onConfirm={checked => setConfirmations(previous => new Set([...previous].filter(value => value !== choice.id).concat(checked ? [choice.id] : [])))} />;
      })}
    </section>}

    <FormError message={error} />
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className={action} disabled={disabled}>Spara utkast</Button>
      <Button type="button" variant="outline" className={action} disabled={disabled} onClick={onCancel}>Avbryt</Button>
    </div>
  </form>;
}

type ActualPayload = Extract<StudyPlanCommand, { action: 'record_actual' }>['payload'];
export function StudyPlanActualForm({ level, attempt, today, disabled, onRecord }: {
  level: StudyPlanLevel; attempt: StudyPlanAttempt; today: string; disabled: boolean; onRecord: (payload: ActualPayload) => void;
}) {
  const id = useId();
  const canEnd = attempt.actual.start !== null || attempt.actual.certainty === 'unknown';
  const [kind, setKind] = useState<StudyPlanEvent['kind']>(canEnd ? 'completed' : 'started');
  const [on, setOn] = useState(today);
  const [sourceKind, setSourceKind] = useState<StudyPlanEvent['source']['kind']>('school_record');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    let sourceId: string;
    try {
      sourceId = reference.trim() ? studyPlanUuid(reference.trim()) : sourceKind === 'school_record' ? crypto.randomUUID() : studyPlanUuid('');
    } catch {
      setError('Ange källans referens som ett giltigt UUID.');
      return;
    }
    try {
      studyPlanDate(on);
      if (on > today || (kind === 'started' && attempt.actual.end && on > attempt.actual.end.on)
        || (kind !== 'started' && attempt.actual.start && on < attempt.actual.start.on)) throw new Error();
    } catch {
      setError('Kontrollera datumet mot den registrerade studietiden och dagens datum.');
      return;
    }
    onRecord({ levelId: level.id, attemptId: attempt.id, event: { kind, on, source: { kind: sourceKind, id: sourceId } } });
  }

  return <form className="min-w-0 space-y-3" aria-label="Registrera studiehändelse" onSubmit={submit} noValidate>
    <Labelled id={id + '-kind'} label="Händelse">
      <NativeSelect id={id + '-kind'} className={selectClass} value={kind} disabled={disabled}
        onChange={event => setKind(event.target.value as typeof kind)}>
        <NativeSelectOption value="started">Faktisk start</NativeSelectOption>
        {canEnd && <><NativeSelectOption value="completed">Faktiskt avslut</NativeSelectOption><NativeSelectOption value="interrupted">Avbrott</NativeSelectOption></>}
      </NativeSelect>
    </Labelled>
    <Labelled id={id + '-date'} label="Datum för studiehändelse">
      <DatePicker id={id + '-date'} value={on} max={today} required disabled={disabled} onValueChange={setOn} />
    </Labelled>
    <Labelled id={id + '-source'} label="Uppgiftskälla">
      <NativeSelect id={id + '-source'} className={selectClass} value={sourceKind} disabled={disabled}
        onChange={event => setSourceKind(event.target.value as typeof sourceKind)}>
        <NativeSelectOption value="school_record">Skolans registrering</NativeSelectOption>
        <NativeSelectOption value="previous_school">Tidigare skola</NativeSelectOption>
      </NativeSelect>
    </Labelled>
    <Labelled id={id + '-ref'} label="Källreferens">
      <Input id={id + '-ref'} className={control} value={reference} maxLength={36} autoComplete="off" spellCheck={false}
        aria-describedby={id + '-ref-hint'} disabled={disabled} onChange={event => setReference(event.target.value)} />
    </Labelled>
    <p id={id + '-ref-hint'} className="text-sm text-muted-foreground">
      {sourceKind === 'school_record' ? 'Lämna tomt för att skapa en referens för skolans registrering.' : 'Ange tidigare skolans referens (UUID).'}
    </p>
    <FormError message={error} />
    <Button type="submit" className={action} disabled={disabled}>Registrera studiehändelse</Button>
  </form>;
}

const decisionLabels: Record<StudyPlanDecision['kind'], string> = {
  reduced: 'Reducerat program', eligibility_opt_out: 'Bortval för behörighet', extended: 'Utökat program',
  adapted: 'Individuellt anpassat program', replaced: 'Ersatt nivå',
};

export function StudyPlanDecisionForm({ levels, today, disabled, onRecord }: {
  levels: readonly StudyPlanLevel[]; today: string; disabled: boolean; onRecord: (decision: StudyPlanDecision) => void;
}) {
  const id = useId();
  const [kind, setKind] = useState<StudyPlanDecision['kind']>('reduced');
  const [reference, setReference] = useState('');
  const [decidedOn, setDecidedOn] = useState(today);
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');
  const [scopePoints, setScopePoints] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [replacements, setReplacements] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reduced = kind === 'reduced';
  const canReplace = kind === 'adapted' || kind === 'replaced';
  const check = (current: string[], levelId: string, checked: boolean) => checked ? [...current, levelId] : current.filter(id => id !== levelId);

  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setError(null);
    let referenceId: string;
    try {
      referenceId = studyPlanUuid(reference.trim());
    } catch {
      setError('Ange det befintliga beslutets referens som ett giltigt UUID.');
      return;
    }
    try {
      const decision = parseStudyPlanDecision({
        id: crypto.randomUUID(), kind, reference: { kind: reduced ? 'action_programme_decision' : 'school_decision', id: referenceId },
        decidedOn, effectiveOn, endsOn: endsOn || null, scopePoints: reduced ? Number(scopePoints) : null,
        levelIds: selected, replacementLevelIds: canReplace ? replacements : [],
      });
      if (decidedOn > today) throw new Error();
      onRecord(decision);
    } catch {
      setError('Kontrollera beslutets datum, omfattning och vilka nivåer beslutet gäller.');
    }
  }

  return <form className="min-w-0 space-y-3" aria-label="Registrera beslut" onSubmit={submit} noValidate>
    <Labelled id={id + '-kind'} label="Typ av beslut">
      <NativeSelect id={id + '-kind'} className={selectClass} value={kind} disabled={disabled}
        onChange={event => { setKind(event.target.value as typeof kind); setReplacements([]); }}>
        {Object.entries(decisionLabels).map(([value, text]) => <NativeSelectOption key={value} value={value}>{text}</NativeSelectOption>)}
      </NativeSelect>
    </Labelled>
    <Labelled id={id + '-reference'} label="Beslutsreferens">
      <Input id={id + '-reference'} className={control} value={reference} maxLength={36} autoComplete="off" spellCheck={false}
        disabled={disabled} aria-describedby={id + '-reference-description'} onChange={event => setReference(event.target.value)} />
    </Labelled>
    <p id={id + '-reference-description'} className="text-sm text-muted-foreground">
      {reduced ? 'Ange referensen (UUID) till det befintliga beslutet inom åtgärdsprogrammet.' : 'Ange referensen (UUID) till det befintliga skolbeslutet.'}
    </p>
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <Labelled id={id + '-decided'} label="Beslutsdatum">
        <DatePicker id={id + '-decided'} value={decidedOn} required max={today} disabled={disabled} onValueChange={setDecidedOn} />
      </Labelled>
      <Labelled id={id + '-effective'} label="Gäller från">
        <DatePicker id={id + '-effective'} value={effectiveOn} required min={decidedOn} disabled={disabled} onValueChange={setEffectiveOn} />
      </Labelled>
      <Labelled id={id + '-end'} label="Gäller till">
        <DatePicker id={id + '-end'} value={endsOn} min={effectiveOn} disabled={disabled} onValueChange={setEndsOn} />
      </Labelled>
    </div>
    {reduced && <Labelled id={id + '-scope'} label="Beslutets omfattning i poäng">
      <Input id={id + '-scope'} className={control} type="number" min={1} max={10000} step={1} inputMode="numeric" value={scopePoints}
        disabled={disabled} onChange={event => setScopePoints(event.target.value)} />
    </Labelled>}
    {levels.length > 0 && <details className={detail}>
      <summary className={summary}>Berörda nivåer{selected.length ? ` · ${selected.length} valda` : ''}</summary>
      {reduced && <p className="pb-2 text-sm text-muted-foreground">Du kan lämna listan tom om beslutet bara anger omfattningen.</p>}
      <div className="pb-3">{levels.map(level => <CheckLine key={level.id} label={level.label} checked={selected.includes(level.id)} disabled={disabled}
        onChange={checked => { setSelected(check(selected, level.id, checked)); if (checked) setReplacements(check(replacements, level.id, false)); }} />)}</div>
    </details>}
    {canReplace && levels.length > 0 && <details className={detail}>
      <summary className={summary}>Ersättande nivåer{replacements.length ? ` · ${replacements.length} valda` : ''}</summary>
      <div className="pb-3">{levels.filter(level => !selected.includes(level.id)).map(level =>
        <CheckLine key={level.id} label={level.label} checked={replacements.includes(level.id)} disabled={disabled}
          onChange={checked => setReplacements(check(replacements, level.id, checked))} />)}</div>
    </details>}
    <FormError message={error} />
    <Button type="submit" className={action} disabled={disabled}>Registrera beslut</Button>
  </form>;
}
