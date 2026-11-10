'use client';
// Demovyn Läsår & skoldagar (exempelläget). Presentationsdelarna ligger i
// lasar-parts.tsx och kalendern i lasar-calendar.tsx och delas med den
// skyddade vyn (plan 05.1.1-03); här finns demons lokala tillstånd och
// arbetsflöde med rollen ur exemplets rollväxlare.
import { classesWithBindings, type ClassTimplan } from '@/lib/cohort-model.ts';
import { useState } from 'react';
import { CalendarCheck, CircleCheck, Plus, RotateCcw, Send, Undo2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LasarActionDialog,
  LasarControlCard,
  LasarCover,
  LasarCoverSide,
  LasarFrameLine,
  LasarGroupTools,
  LasarHolidaysCard,
  LasarInlineError,
  LasarLegend,
  LasarMarking,
  LasarSchoolTools,
  LasarScope,
  LasarTalkCard,
  LasarTeaching,
  LasarTerms,
  LasarWorkflow,
  PlanBoundary,
  type LasarAction,
} from './lasar-parts.tsx';
import { LasarCalendar, selectionFacts, statusPlural, useCalendarSelection, type ClickModifiers } from './lasar-calendar.tsx';
import {
  summarize,
  canEdit,
  setDay,
  setDays,
  setGroupDays,
  clearGroupDays,
  setShortWeek,
  clearShortWeek,
  groupSummary,
  groupYearDays,
  studentGroups,
  setNote,
  setNotes,
  setTerm,
  resetToProposal,
  submit,
  withdraw,
  requestChanges,
  approve,
  reopen,
  addComment,
  addSchoolYear,
  unitYears,
  statusLabel,
  roleLabel,
  plannedHours,
  type Cause,
  type ClassRef,
  type DayInfo,
  type GroupDay,
  type GroupSummary,
  type LasarState,
  type Planned,
  type SchoolYear,
} from '@/lib/lasar-model.ts';
import {
  currentPlan,
  columnTotals,
  type TimplanState,
} from '@/lib/timplan-model.ts';

/** Läsårets korta beteckning. Id:t är databasens och visas inte. */
const shortLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
export type ScheduleSource = {
  groups: { id: string; name: string; subject: string; teacher: string }[];
  slots: { groupId: string; day: number; duration: number }[];
  classes: ClassRef[];
};

export { StatusPill } from './lasar-parts.tsx';

/** Det läsår som gäller nu, eller det senast fastställda. */
export function activeSchoolYear(state: LasarState, unitId: string, today: string): SchoolYear | undefined {
  const fixed = unitYears(state, unitId).filter((y) => y.status === 'fastställd');
  return fixed.find((y) => today >= y.ht.start && today <= y.vt.end) ?? fixed.at(-1);
}

export default function LasarView({
  state,
  apply,
  unitId,
  unitName,
  schoolTypes,
  timplans,
  classes,
  bindings = [],
  schedule,
  error,
  clearError,
}: {
  state: LasarState;
  apply: (fn: (s: LasarState) => LasarState, message?: string) => boolean;
  unitId: string;
  unitName: string;
  schoolTypes: string[];
  timplans: TimplanState;
  /** Klasserna ur elevregistret. Årskurserna kommer ur timplanen. */
  classes: ClassRef[];
  bindings?: ClassTimplan[];
  schedule?: ScheduleSource;
  error: string;
  clearError: () => void;
}) {
  const years = unitYears(state, unitId);
  const [yearId, setYearId] = useState<string | null>(null);
  const [tool, setTool] = useState<Planned>('lovdag');
  const [note, setNoteText] = useState('');
  const calendar = useCalendarSelection();
  const { selection } = calendar;
  const [action, setAction] = useState<LasarAction | null>(null);
  const [comment, setComment] = useState('');
  const [groupId, setGroupId] = useState('');
  const [cause, setCause] = useState<Cause>('nationellt prov');
  const [shortDay, setShortDay] = useState(4);
  const [shortReason, setShortReason] = useState('');

  const sy = years.find((y) => y.id === yearId) ?? years.find((y) => y.status !== 'fastställd') ?? years.at(-1);
  const editable = sy ? canEdit(state, sy) : false;
  const summary = sy ? summarize(sy, schoolTypes) : undefined;
  const errors = summary?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = summary?.issues.filter((i) => i.level === 'warning') ?? [];
  const gy = schoolTypes.includes('GY') || schoolTypes.includes('GYAN');
  const nextStartYear = (years.at(-1)?.startYear ?? 2025) + 1;

  // Vald elevgrupp lägger ett eget lager ovanpå skolans läsår.
  const groups = sy ? studentGroups(timplans.educations, classesWithBindings(classes, bindings, timplans.plans, timplans.educations, sy.startYear), sy.startYear) : [];
  const group = groups.find((g) => g.id === groupId);
  const groupCalendar: Map<string, GroupDay> = new Map(
    sy && group ? groupYearDays(sy, group, groups).map((d) => [d.date, d]) : [],
  );
  const gSummary: GroupSummary | undefined = sy && group ? groupSummary(sy, group, groups) : undefined;
  const canShortWeek = Boolean(group && group.kind === 'grundskola' && (group.columnId === 'ak1' || group.columnId === 'ak2'));
  const groupIssues = gSummary?.issues ?? [];

  function choose(id: string) {
    setYearId(id);
    calendar.clear();
    clearError();
  }
  const noteText = () => note.trim() || undefined;

  /**
   * Ett klick sätter dagen till valt slag. Skift markerar ett intervall och
   * kommando eller ctrl lägger till en dag i markeringen, båda utan att ändra
   * något; markerade dagar redigeras sedan med högerklick eller knapparna.
   */
  function onDayClick(date: string, event: ClickModifiers) {
    if (!sy) return;
    if (!calendar.dayClick(sy, date, event) || !editable) return;
    if (group) {
      apply((s) => setGroupDays(s, sy.id, group, [date], cause, noteText()));
      return;
    }
    // Ett klick på en låst dag förklarar varför den är låst.
    apply((s) => setDay(s, sy.id, date, tool, noteText()));
  }
  function onWeekClick(days: DayInfo[], event: Pick<ClickModifiers, 'metaKey' | 'ctrlKey'>) {
    if (!sy) return;
    const weekdays = days
      .filter((d) => (group ? d.status === 'skoldag' : d.editable))
      .map((d) => d.date);
    if (!calendar.weekClick(weekdays, event) || !editable) return;
    if (group) {
      apply((s) => setGroupDays(s, sy.id, group, weekdays, cause, noteText()));
      return;
    }
    apply((s) => setDays(s, sy.id, weekdays, tool, noteText()));
  }
  const { selectedDays, changeable, groupChangeable, groupMarked } = selectionFacts(sy, selection, groupCalendar);
  function applyToGroup() {
    if (!sy || !group || !groupChangeable.length) return;
    apply(
      (s) => setGroupDays(s, sy.id, group, groupChangeable.map((d) => d.date), cause, noteText()),
      groupChangeable.length > 1 ? `${groupChangeable.length} dagar utan undervisning för ${group.name}.` : undefined,
    );
  }
  function followSchool() {
    if (!sy || !group || !groupChangeable.length) return;
    apply(
      (s) => clearGroupDays(s, sy.id, group, groupChangeable.map((d) => d.date)),
      `${group.name} följer skolans dagar igen.`,
    );
  }
  function applyToSelection(kind: Planned) {
    if (!sy || !changeable.length) return;
    apply(
      (s) => setDays(s, sy.id, changeable.map((d) => d.date), kind, noteText()),
      changeable.length > 1 ? `${changeable.length} dagar är nu ${statusPlural[kind]}.` : undefined,
    );
  }
  function runAction() {
    if (!sy || !action) return;
    const done =
      action === 'submit'
        ? apply((s) => submit(s, sy.id, comment, schoolTypes, groups), 'Förslaget är skickat till huvudmannen.')
        : action === 'approve'
          ? apply((s) => approve(s, sy.id, comment, schoolTypes, groups), `${sy.label} är fastställt.`)
          : action === 'return'
            ? apply((s) => requestChanges(s, sy.id, comment), 'Förslaget är återsänt till rektorn.')
            : apply((s) => reopen(s, sy.id, comment), `${sy.label} är öppnat för ändring.`);
    if (done) {
      setAction(null);
      setComment('');
    }
  }

  const selectedInfo = selectedDays.length === 1 ? selectedDays[0] : undefined;

  // Timmarna räknas på varje årskurs egna undervisningsdagar, inte på skolans.
  const teachingRows = timplans.educations.flatMap((e) => {
    const plan = currentPlan(timplans, e.id);
    if (!plan || !summary || e.kind === 'introduktionsprogram') return [];
    const totals = columnTotals(e, plan);
    return e.columns.map((c, i) => {
      const id = `${e.id}:${c.id}`;
      const g = groups.find((x) => x.id === id);
      const own = sy && g ? groupSummary(sy, g, groups) : undefined;
      return { id, education: e.name, column: c.label, hours: totals[i], days: own?.days ?? summary.skoldagar, fewer: own?.fewer ?? 0 };
    });
  });
  const classRows = sy
    ? groups
        .filter((g) => g.scope === 'klass')
        .map((g) => {
          const own = groupSummary(sy, g, groups);
          const education = timplans.educations.find((e) => e.id === g.educationId);
          const binding = bindings.find(b=>b.startYear===sy.startYear&&b.className===g.name.toLocaleUpperCase('sv'));
          const plan = binding ? timplans.plans.find(p=>p.id===binding.timplanId) : education ? currentPlan(timplans, education.id) : undefined;
          const index = education && g.columnId ? education.columns.findIndex((c) => c.id === g.columnId) : -1;
          const hours = education && plan && index >= 0 ? columnTotals(education, plan)[index] : undefined;
          return { group: g, own, hours };
        })
    : [];
  const intro = timplans.educations.find((e) => e.kind === 'introduktionsprogram');
  const introPlan = intro ? currentPlan(timplans, intro.id) : undefined;
  const introWeekly = intro && introPlan ? columnTotals(intro, introPlan)[0] : 0;
  const scheduleRows = schedule && summary
    ? schedule.groups
        .map((g) => {
          const slots = schedule.slots.filter((s) => s.groupId === g.id);
          const weekly = slots.reduce((n, s) => n + s.duration, 0);
          return { ...g, slots: slots.length, weekly, planned: plannedHours(summary, slots) };
        })
        .filter((g) => g.slots > 0)
        .sort((a, b) => b.planned.hours - a.planned.hours)
    : [];

  return (
    <div className="ly-layout">
      <section className="tp-canvas ly-canvas">
        <LasarCover
          kicker={<span className="admin-kicker">LÄSÅR OCH SKOLDAGAR · {unitName.toLocaleUpperCase('sv')}</span>}
          title={sy ? sy.label : 'Inget läsår planerat'}
          side={sy && summary && <LasarCoverSide sy={sy} summary={summary} />}
        />
        <LasarFrameLine gy={gy}>
          {years.map((y) => (
            <button key={y.id} type="button" aria-pressed={sy?.id === y.id} onClick={() => choose(y.id)}>
              {shortLabel(y.startYear)} · {statusLabel[y.status].split(' ')[0]}
            </button>
          ))}
          {state.role === 'rektor' && (
            <button type="button" className="ly-add-year" onClick={() => { if (apply((s) => addSchoolYear(s, unitId, nextStartYear, schoolTypes), `Ett förslag för läsåret ${nextStartYear}/${String(nextStartYear + 1).slice(2)} är skapat.`)) setYearId(`${nextStartYear}/${String(nextStartYear + 1).slice(2)}`); }}>
              <Plus size={13} /> {nextStartYear}/{String(nextStartYear + 1).slice(2)}
            </button>
          )}
        </LasarFrameLine>
        {error && <LasarInlineError message={error} />}
        {!sy || !summary ? (
          <div className="admin-empty">
            <CalendarCheck size={28} />
            <h2>Inget läsår ännu</h2>
            <p>Rektorn skapar ett förslag utifrån helgdagarna och vanliga lov.</p>
          </div>
        ) : (
          <>
            <LasarWorkflow
              text={
                <>
                  {sy.status === 'utkast' && (editable ? 'Utkastet är rektorns arbetsyta. Välj vad du vill markera och klicka på dagar eller veckonummer. Skicka när kontrollerna är gröna.' : 'Rektorn arbetar med utkastet.')}
                  {sy.status === 'återsänd' && 'Huvudmannen har återsänt förslaget. Se skälet i historiken, ändra och skicka igen.'}
                  {sy.status === 'förslag' && 'Förslaget väntar på huvudmannens beslut om terminernas början och slut. Rektorn kan ta tillbaka det.'}
                  {sy.status === 'fastställd' && 'Fastställda läsårstider. Skoldagarna ligger till grund för timplanens riktvärden och schemat.'}
                </>
              }
            >
              {state.role === 'rektor' && editable && (
                <Button variant="ghost" onClick={() => apply((s) => resetToProposal(s, sy.id, schoolTypes), 'Terminer och lov är återställda till förslaget.')}>
                  <RotateCcw size={15} /> Återställ förslaget
                </Button>
              )}
              {state.role === 'rektor' && editable && (
                <Button onClick={() => { setAction('submit'); setComment(''); }} disabled={errors.length > 0}>
                  <Send size={15} /> Skicka förslag
                </Button>
              )}
              {state.role === 'rektor' && sy.status === 'förslag' && (
                <Button variant="outline" onClick={() => apply((s) => withdraw(s, sy.id), 'Förslaget är taget tillbaka.')}>
                  <Undo2 size={15} /> Ta tillbaka
                </Button>
              )}
              {state.role === 'huvudman' && sy.status === 'förslag' && (
                <>
                  <Button variant="outline" onClick={() => { setAction('return'); setComment(''); }}>
                    <Undo2 size={15} /> Återsänd
                  </Button>
                  <Button onClick={() => { setAction('approve'); setComment(''); }} disabled={errors.length > 0}>
                    <CircleCheck size={15} /> Fastställ
                  </Button>
                </>
              )}
              {state.role === 'huvudman' && sy.status === 'fastställd' && (
                <Button variant="outline" onClick={() => { setAction('reopen'); setComment(''); }}>
                  <Unlock size={15} /> Öppna för ändring
                </Button>
              )}
            </LasarWorkflow>

            <LasarTerms sy={sy} summary={summary} editable={editable} onTermChange={(part, edge, value) => apply((s) => setTerm(s, sy.id, part, edge, value))} />

            <LasarScope
              groups={groups}
              groupId={groupId}
              group={group}
              gSummary={gSummary}
              onGroupChange={(id) => {
                setGroupId(id);
                calendar.clear();
                clearError();
              }}
            />

            {group ? (
              <LasarGroupTools
                group={group}
                gSummary={gSummary}
                editable={editable}
                cause={cause}
                onCause={setCause}
                note={note}
                onNote={setNoteText}
                canShortWeek={canShortWeek}
                shortDay={shortDay}
                onShortDay={setShortDay}
                shortReason={shortReason}
                onShortReason={setShortReason}
                onClearShortWeek={() => apply((s) => clearShortWeek(s, sy.id, group), `${group.name} läser fem dagar i veckan igen.`)}
                onSetShortWeek={() => { if (apply((s) => setShortWeek(s, sy.id, group, shortDay, shortReason), `${group.name} läser fyra dagar i veckan.`)) setShortReason(''); }}
              />
            ) : (
              <LasarSchoolTools
                tool={tool}
                onTool={setTool}
                note={note}
                onNote={setNoteText}
                editable={editable}
                readOnlyHint={state.role === 'rektor'
                  ? 'Bara ett utkast eller en återsänd version kan ändras. Klicka för att läsa en dag, skift- eller kommando-klicka för att markera flera.'
                  : 'Huvudmannen läser förslaget och beslutar. Klicka på en dag för detaljer, skift- eller kommando-klicka för att markera flera.'}
              />
            )}

            <LasarCalendar
              sy={sy}
              summary={summary}
              calendar={calendar}
              editable={editable}
              tool={tool}
              group={group}
              groupCalendar={groupCalendar}
              onDayClick={onDayClick}
              onWeekClick={onWeekClick}
              onApplyToSelection={applyToSelection}
              onApplyToGroup={applyToGroup}
              onFollowSchool={followSchool}
            />

            <LasarLegend summary={summary} />

            {selection.length > 0 && (
              <LasarMarking
                selection={selection}
                selectedDays={selectedDays}
                changeable={changeable}
                groupChangeable={groupChangeable}
                groupMarked={groupMarked}
                group={group}
                editable={editable}
                onNote={(text) =>
                  selectedInfo
                    ? apply((s) => setNote(s, sy.id, selectedInfo.date, text))
                    : apply((s) => setNotes(s, sy.id, changeable.map((d) => d.date), text))
                }
                onApplyToGroup={applyToGroup}
                onFollowSchool={followSchool}
                onApplyToSelection={applyToSelection}
                onClear={() => calendar.setSelection([])}
              />
            )}

            <LasarTeaching
              summary={summary}
              teachingRows={teachingRows}
              intro={intro && introPlan ? { name: intro.name, weekly: introWeekly } : undefined}
              classRows={classRows}
              scheduleRows={scheduleRows}
              groupId={groupId}
              onShowClass={(id) => { setGroupId(id); calendar.clear(); clearError(); }}
            />
            <PlanBoundary />
          </>
        )}
      </section>

      {sy && summary && (
        <aside className="ly-side">
          <LasarControlCard summary={summary} gy={gy} errors={errors} warnings={warnings} group={group} groupIssues={groupIssues} />
          <LasarHolidaysCard summary={summary} />
          <LasarTalkCard
            placeholder={`Kommentera som ${roleLabel[state.role].toLocaleLowerCase('sv')}…`}
            history={sy.history}
            historyLabel={(h) => `${roleLabel[h.role]} · ${h.time}`}
            onComment={(text) => apply((s) => addComment(s, sy.id, text))}
          />
        </aside>
      )}

      <LasarActionDialog
        action={action}
        sy={sy}
        summary={summary}
        unitName={unitName}
        errors={errors}
        comment={comment}
        onComment={setComment}
        error={error}
        onClose={() => setAction(null)}
        onRun={runAction}
      />
    </div>
  );
}
