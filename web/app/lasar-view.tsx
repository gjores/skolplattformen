'use client';
import { classesWithBindings, type ClassTimplan } from '@/lib/cohort-model.ts';
import { Fragment, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CircleCheck,
  ExternalLink,
  History,
  Info,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  Undo2,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuGroup,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import {
  summarize,
  weekRows,
  dayInfo,
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
  causeLabel,
  setNote,
  setNotes,
  editableRange,
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
  definitions,
  formatDate,
  formatLong,
  weekdayNames,
  weekdayShort,
  statusLabel,
  roleLabel,
  minSchoolDays,
  minHolidays,
  maxStudyDays,
  gymnasiumWeeks,
  schoolWeeks,
  requiredWeeklyMinutes,
  hoursPerSchoolDay,
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

const num = (n: number, digits = 0) => n.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const statusText: Record<DayInfo['status'], string> = {
  skoldag: 'Skoldag',
  lovdag: 'Lovdag',
  studiedag: 'Studiedag',
  helgdag: 'Helgdag',
  helg: 'Helg',
  utanför: 'Utanför läsåret',
};
/** Läsårets korta beteckning. Id:t är databasens och visas inte. */
const shortLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
const statusPlural: Record<DayInfo['status'], string> = {
  skoldag: 'skoldagar',
  lovdag: 'lovdagar',
  studiedag: 'studiedagar',
  helgdag: 'helgdagar',
  helg: 'helger',
  utanför: 'dagar utanför läsåret',
};
const toolCopy: Record<Planned, { label: string; hint: string }> = {
  skoldag: { label: 'Skoldag', hint: 'Klicka på en lov- eller studiedag för att göra den till skoldag igen.' },
  lovdag: { label: 'Lovdag', hint: 'Klicka på dagar eller på ett veckonummer. Skift-klicka för ett intervall.' },
  studiedag: { label: 'Studiedag', hint: 'Högst fem per läsår. Skriv vad personalen gör så syns det i planen.' },
};
type Action = 'submit' | 'approve' | 'return' | 'reopen';
const actionCopy: Record<Action, { title: string; description: string; button: string; placeholder: string; label: string }> = {
  submit: { title: 'Skicka förslag till huvudmannen', description: 'Terminernas början och slut beslutas av huvudmannen. Förslaget låses tills huvudmannen fastställer det eller återsänder det med skäl.', button: 'Skicka förslag', placeholder: 'Beskriv lov, studiedagar och vad huvudmannen särskilt bör se.', label: 'Meddelande till huvudmannen' },
  approve: { title: 'Fastställ läsårstiderna', description: 'Beslutet dokumenteras med datum. Skoldagarna blir grund för timplanens riktvärden och schemat.', button: 'Fastställ', placeholder: 'Dokumentera beslutet, till exempel styrelse eller nämnd, datum och diarienummer.', label: 'Beslut' },
  return: { title: 'Återsänd för ändring', description: 'Rektorn kan därefter ändra förslaget och skicka det på nytt. Skälet blir en del av historiken.', button: 'Återsänd', placeholder: 'Ange vad som behöver ändras och varför.', label: 'Skäl' },
  reopen: { title: 'Öppna läsåret för ändring', description: 'Det fastställda beslutet ligger kvar i historiken. Rektorn kan ändra och skicka ett nytt förslag.', button: 'Öppna', placeholder: 'Ange skälet, till exempel ändrade lovdagar i kommunen.', label: 'Skäl' },
};

export type ScheduleSource = {
  groups: { id: string; name: string; subject: string; teacher: string }[];
  slots: { groupId: string; day: number; duration: number }[];
  classes: ClassRef[];
};

export function StatusPill({ status }: { status: SchoolYear['status'] }) {
  return <span className={`tp-status tp-status-${status}`}>{statusLabel[status]}</span>;
}

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
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [action, setAction] = useState<Action | null>(null);
  const [comment, setComment] = useState('');
  const [talk, setTalk] = useState('');
  const [showDefinitions, setShowDefinitions] = useState(false);
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
    setAnchor(null);
    setSelection([]);
    clearError();
  }
  const noteText = () => note.trim() || undefined;

  /**
   * Ett klick sätter dagen till valt slag. Skift markerar ett intervall och
   * kommando eller ctrl lägger till en dag i markeringen, båda utan att ändra
   * något; markerade dagar redigeras sedan med högerklick eller knapparna.
   */
  function onDayClick(date: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (!sy) return;
    if (event.metaKey || event.ctrlKey) {
      setSelection((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
      setAnchor(date);
      return;
    }
    if (event.shiftKey && anchor) {
      const range = editableRange(sy, anchor, date);
      setSelection(range.length ? range : [date]);
      return;
    }
    setSelection([date]);
    setAnchor(date);
    if (!editable) return;
    if (group) {
      apply((s) => setGroupDays(s, sy.id, group, [date], cause, noteText()));
      return;
    }
    // Ett klick på en låst dag förklarar varför den är låst.
    apply((s) => setDay(s, sy.id, date, tool, noteText()));
  }
  function onWeekClick(days: DayInfo[], event: { metaKey: boolean; ctrlKey: boolean }) {
    if (!sy) return;
    const weekdays = days
      .filter((d) => (group ? d.status === 'skoldag' : d.editable))
      .map((d) => d.date);
    if (!weekdays.length) return;
    if (event.metaKey || event.ctrlKey) {
      setSelection((prev) => [...prev.filter((d) => !weekdays.includes(d)), ...weekdays]);
      setAnchor(weekdays[0]);
      return;
    }
    setSelection(weekdays);
    setAnchor(weekdays[0]);
    if (!editable) return;
    if (group) {
      apply((s) => setGroupDays(s, sy.id, group, weekdays, cause, noteText()));
      return;
    }
    apply((s) => setDays(s, sy.id, weekdays, tool, noteText()));
  }
  /** Högerklick redigerar markeringen; en omarkerad dag markeras först. */
  function onDayContextMenu(date: string) {
    if (!selection.includes(date)) {
      setSelection([date]);
      setAnchor(date);
    }
  }
  const selectedDays = sy ? selection.map((d) => dayInfo(sy, d)) : [];
  const changeable = selectedDays.filter((d) => d.editable);
  /** Dagar i markeringen som är skolans skoldagar; bara de kan gälla en grupp. */
  const groupChangeable = selectedDays.filter((d) => d.status === 'skoldag');
  const groupMarked = groupChangeable.filter((d) => groupCalendar.get(d.date)?.off);
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

  function dayCell(d: DayInfo, i: number) {
    const dayNumber = Number(d.date.slice(8));
    const off = groupCalendar.get(d.date)?.off;
    const title =
      d.status === 'utanför'
        ? `${formatLong(d.date)} · utanför läsåret`
        : `${formatLong(d.date)} · ${d.holiday ?? statusText[d.status]}${d.note ? ` · ${d.note}` : ''}${d.part === 'jullov' ? ' · mellan terminerna' : ''}${off ? ` · ingen undervisning för ${off.from}: ${causeLabel[off.cause]}${off.note ? `, ${off.note}` : ''}` : ''}`;
    const marked = selection.includes(d.date);
    const className = `ly-day ly-${d.status}${off ? ' ly-off' : ''}${d.part === 'jullov' ? ' ly-between' : ''}${marked ? ' ly-selected' : ''}${anchor === d.date && marked && selection.length > 1 ? ' ly-anchor' : ''}${d.date === sy?.ht.start || d.date === sy?.vt.start ? ' ly-term-start' : ''}${d.date === sy?.ht.end || d.date === sy?.vt.end ? ' ly-term-end' : ''}`;
    if (d.status === 'utanför')
      return (
        <td key={d.date} className={className}>
          <span aria-hidden="true">{dayNumber}</span>
        </td>
      );
    return (
      <td key={d.date} className={className}>
        <button
          type="button"
          aria-label={marked ? `${title} · markerad` : title}
          aria-pressed={marked}
          title={title}
          onClick={(e) => onDayClick(d.date, e)}
          onContextMenu={() => onDayContextMenu(d.date)}
        >
          {dayNumber}
          {d.note && <i className="ly-note-dot" aria-hidden="true" />}
          {d.holiday && i < 5 && <i className="ly-holiday-mark" aria-hidden="true" />}
        </button>
      </td>
    );
  }

  function half(part: 'ht' | 'vt') {
    if (!sy || !summary) return null;
    const rows = weekRows(sy, part);
    const term = summary.terms[part];
    return (
      <div className="ly-half">
        <div className="ly-half-heading">
          <h3>{part === 'ht' ? 'Höstterminen' : 'Vårterminen'}</h3>
          <span>
            {formatDate(sy[part].start)} – {formatDate(sy[part].end)} · {num(summary.weeks[part])} veckor · {num(term.skoldagar)} skoldagar
          </span>
        </div>
        <table className="ly-grid" aria-label={part === 'ht' ? 'Höstterminens kalender' : 'Vårterminens kalender'}>
          <thead>
            <tr>
              <th scope="col" className="ly-month-head"><span className="sr-only">Månad</span></th>
              <th scope="col" className="ly-week-head" title="Vecka">v.</th>
              {weekdayShort.map((w, i) => (
                <th scope="col" key={w} className={i >= 5 ? 'ly-weekend-head' : ''}>{w}</th>
              ))}
              <th scope="col" className="ly-count-head" title="Skoldagar i veckan">
                <CalendarCheck size={13} aria-hidden="true" />
                <span className="sr-only">Skoldagar i veckan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const paintable = row.days.some((d) => d.editable);
              return (
                <tr key={`${row.year}-${row.week}`} className={row.monthLabel ? 'ly-month-start' : ''}>
                  <th scope="row" className="ly-month">{row.monthLabel ?? ''}</th>
                  <td className="ly-week">
                    {paintable ? (
                      <button type="button" aria-label={`Vecka ${row.week}: sätt måndag–fredag som ${toolCopy[tool].label.toLocaleLowerCase('sv')}`} title={`Vecka ${row.week} · klicka för att sätta hela veckan som ${toolCopy[tool].label.toLocaleLowerCase('sv')}, kommando- eller ctrl-klicka för att markera veckan`} onClick={(e) => onWeekClick(row.days, e)}>
                        {row.week}
                      </button>
                    ) : (
                      <button type="button" aria-label={`Vecka ${row.week}: markera måndag–fredag`} title={`Vecka ${row.week} · klicka för att markera veckan`} onClick={(e) => onWeekClick(row.days, e)}>
                        {row.week}
                      </button>
                    )}
                  </td>
                  {row.days.map(dayCell)}
                  <td className={`ly-count ${row.schoolDays === 0 ? 'ly-count-zero' : row.schoolDays < 5 ? 'ly-count-short' : ''}`}>
                    {row.days.some((d) => d.status !== 'utanför') ? row.schoolDays : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

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
        <div className="tp-cover">
          <div>
            <span className="admin-kicker">LÄSÅR OCH SKOLDAGAR · {unitName.toLocaleUpperCase('sv')}</span>
            <h2>{sy ? sy.label : 'Inget läsår planerat'}</h2>
            <p>Rektorn föreslår skoldagar, lov och studiedagar. Huvudmannen fastställer terminernas början och slut.</p>
          </div>
          {sy && summary && (
            <div className="tp-cover-side">
              <StatusPill status={sy.status} />
              {sy.decidedOn && <span>Fastställt {sy.decidedOn}</span>}
              <span>{num(summary.skoldagar)} skoldagar · {num(summary.weeks.total)} veckor</span>
            </div>
          )}
        </div>
        <div className="tp-frame-line">
          <span><Info size={14} /> Skolförordningen 3 kap. 2–4 §§{gy ? ' · Gymnasieförordningen 3 kap. 1–3 §§' : ''} · Lagen om allmänna helgdagar</span>
          <a href="https://lagen.nu/2011:185#K3" target="_blank" rel="noreferrer">Källa <ExternalLink size={13} /></a>
          <fieldset className="tp-versions">
            <legend className="sr-only">Läsår</legend>
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
          </fieldset>
        </div>
        {error && (
          <div className="validation-warning tp-inline-error">
            <p><AlertTriangle size={16} /><span>{error}</span></p>
          </div>
        )}
        {!sy || !summary ? (
          <div className="admin-empty">
            <CalendarCheck size={28} />
            <h2>Inget läsår ännu</h2>
            <p>Rektorn skapar ett förslag utifrån helgdagarna och vanliga lov.</p>
          </div>
        ) : (
          <>
            <div className="tp-workflow">
              <div className="tp-workflow-text">
                {sy.status === 'utkast' && (editable ? 'Utkastet är rektorns arbetsyta. Välj vad du vill markera och klicka på dagar eller veckonummer. Skicka när kontrollerna är gröna.' : 'Rektorn arbetar med utkastet.')}
                {sy.status === 'återsänd' && 'Huvudmannen har återsänt förslaget. Se skälet i historiken, ändra och skicka igen.'}
                {sy.status === 'förslag' && 'Förslaget väntar på huvudmannens beslut om terminernas början och slut. Rektorn kan ta tillbaka det.'}
                {sy.status === 'fastställd' && 'Fastställda läsårstider. Skoldagarna ligger till grund för timplanens riktvärden och schemat.'}
              </div>
              <div className="tp-workflow-actions">
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
              </div>
            </div>

            <div className="ly-terms">
              {(['ht', 'vt'] as const).map((part) => (
                <fieldset key={part} className="ly-term">
                  <legend>{part === 'ht' ? 'Hösttermin' : 'Vårtermin'}</legend>
                  {(['start', 'end'] as const).map((edge) => (
                    <div key={edge} className="ly-term-field">
                      <label className="ly-field-label" htmlFor={`ly-${part}-${edge}`}>
                        {edge === 'start' ? 'Börjar' : 'Slutar'}
                      </label>
                      {editable ? (
                        <Input id={`ly-${part}-${edge}`} type="date" value={sy[part][edge]} onChange={(e) => { if (e.target.value) apply((s) => setTerm(s, sy.id, part, edge, e.target.value)); }} />
                      ) : (
                        <strong id={`ly-${part}-${edge}`}>{formatLong(sy[part][edge])}</strong>
                      )}
                    </div>
                  ))}
                  <span className="ly-term-facts">{num(summary.weeks[part])} veckor · {num(summary.terms[part].skoldagar)} skoldagar · {num(summary.terms[part].lovdagar)} lov · {num(summary.terms[part].studiedagar)} studiedagar · {num(summary.terms[part].helgdagar)} helgdagar</span>
                </fieldset>
              ))}
              <div className="ly-term ly-term-note">
                <span className="cell-secondary">Terminernas början och slut beslutas av huvudmannen. Läsåret börjar i augusti och slutar i juni. Vardagarna mellan terminerna är jullov.</span>
              </div>
            </div>

            <div className="ly-scope">
              <label className="ly-field-label" htmlFor="ly-group">Visar</label>
              <select
                id="ly-group"
                className="og-select"
                value={groupId}
                onChange={(e) => {
                  setGroupId(e.target.value);
                  setSelection([]);
                  setAnchor(null);
                  clearError();
                }}
              >
                <option value="">Hela skolan · skoldagar, lov och studiedagar</option>
                {[...new Map(groups.map((g) => [g.educationId, g.educationName])).entries()].map(([id, name]) => (
                  <optgroup key={id} label={name}>
                    {groups
                      .filter((g) => g.educationId === id)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.scope === 'klass' ? `Klass ${g.name}` : g.name}
                          {g.pupils ? ` · ${num(g.pupils)} elever` : ''}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              {group && gSummary && (
                <span className="ly-scope-facts">
                  {num(gSummary.days)} undervisningsdagar
                  {gSummary.fewer ? `, ${num(gSummary.fewer)} färre än skolan` : ', samma som skolan'}
                  {group.parentId ? ` · ärver ${groups.find((g) => g.id === group.parentId)?.name ?? ''}` : ''}
                </span>
              )}
            </div>

            {group ? (
              <fieldset className="ly-tools">
                <legend className="ly-tools-label">{group.name} saknar undervisning</legend>
                <div className="ly-note-field">
                  <label className="ly-field-label" htmlFor="ly-cause">Orsak</label>
                  <select id="ly-cause" className="og-select" value={cause} disabled={!editable} onChange={(e) => setCause(e.target.value as Cause)}>
                    {(Object.keys(causeLabel) as Cause[]).map((c) => (
                      <option key={c} value={c}>{causeLabel[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="ly-note-field">
                  <label className="ly-field-label" htmlFor="ly-note">Anteckning</label>
                  <Input id="ly-note" value={note} disabled={!editable} placeholder={cause === 'annat' ? 'Krävs när orsaken är annat' : 't.ex. Lärarna är provvakter'} onChange={(e) => setNoteText(e.target.value)} />
                </div>
                <span className="ly-tools-hint">
                  {editable
                    ? `Klicka på en skoldag så saknar ${group.name} undervisning den dagen. Skift- eller kommando-klicka för att markera flera och högerklicka för att ändra dem. Skolans lov och studiedagar gäller redan alla.`
                    : 'Läsåret kan inte ändras nu. Klicka för att läsa en dag.'}
                </span>
                {canShortWeek && (
                  <div className="ly-shortweek">
                    <span className="ly-field-label">Fyra skoldagar i veckan</span>
                    {gSummary?.shortWeek ? (
                      <>
                        <strong>Ledig {weekdayNames[gSummary.shortWeek.weekday]} · {gSummary.shortWeek.from}</strong>
                        <span className="ly-marking-text">{gSummary.shortWeek.reason}</span>
                        {editable && (
                          <Button variant="outline" size="sm" onClick={() => apply((s) => clearShortWeek(s, sy.id, group), `${group.name} läser fem dagar i veckan igen.`)}>
                            Ta bort
                          </Button>
                        )}
                      </>
                    ) : (
                      editable && (
                        <>
                          <select className="og-select" aria-label="Ledig veckodag" value={shortDay} onChange={(e) => setShortDay(Number(e.target.value))}>
                            {[0, 1, 2, 3, 4].map((d) => (
                              <option key={d} value={d}>{weekdayNames[d]}</option>
                            ))}
                          </select>
                          <Input aria-label="Särskilda skäl" value={shortReason} placeholder="Särskilda skäl" onChange={(e) => setShortReason(e.target.value)} />
                          <Button variant="outline" size="sm" onClick={() => { if (apply((s) => setShortWeek(s, sy.id, group, shortDay, shortReason), `${group.name} läser fyra dagar i veckan.`)) setShortReason(''); }}>
                            Lägg in
                          </Button>
                        </>
                      )
                    )}
                    <span className="cell-secondary">Skolförordningen 3 kap. 4 § andra stycket tillåter fyra skoldagar i veckan för en grupp elever i årskurs 1 eller 2, om det finns särskilda skäl.</span>
                  </div>
                )}
              </fieldset>
            ) : (
            <fieldset className="ly-tools">
              <legend className="ly-tools-label">Markera som</legend>
              {(['skoldag', 'lovdag', 'studiedag'] as Planned[]).map((t) => (
                <button key={t} type="button" className={`ly-tool ly-tool-${t}`} aria-pressed={tool === t} disabled={!editable} onClick={() => setTool(t)}>
                  <i aria-hidden="true" /> {toolCopy[t].label}
                </button>
              ))}
              <div className="ly-note-field">
                <label className="ly-field-label" htmlFor="ly-note">Anteckning</label>
                <Input id="ly-note" value={note} disabled={!editable || tool === 'skoldag'} placeholder={tool === 'studiedag' ? 'Vad personalen gör, t.ex. Fortbildning' : tool === 'lovdag' ? 't.ex. Höstlov' : ''} onChange={(e) => setNoteText(e.target.value)} />
              </div>
              <span className="ly-tools-hint">
                {editable
                  ? `${toolCopy[tool].hint} Skift-klicka för att markera ett intervall, kommando- eller ctrl-klicka för att markera flera. Högerklicka på markeringen för att ändra den.`
                  : state.role === 'rektor'
                    ? 'Bara ett utkast eller en återsänd version kan ändras. Klicka för att läsa en dag, skift- eller kommando-klicka för att markera flera.'
                    : 'Huvudmannen läser förslaget och beslutar. Klicka på en dag för detaljer, skift- eller kommando-klicka för att markera flera.'}
              </span>
            </fieldset>
            )}

            <ContextMenu>
              <ContextMenuTrigger
                render={
                  <div className="ly-calendar">
                    {half('ht')}
                    {half('vt')}
                  </div>
                }
              />
              <ContextMenuContent className="ly-menu">
                <ContextMenuGroup>
                <ContextMenuLabel>
                  {changeable.length === 1
                    ? formatLong(changeable[0].date)
                    : changeable.length
                      ? `${num(changeable.length)} dagar markerade`
                      : selection.length
                        ? 'Markerade dagar är låsta'
                        : 'Ingen dag markerad'}
                </ContextMenuLabel>
                <ContextMenuSeparator />
                {editable && group ? (
                  groupChangeable.length > 0 ? (
                    <>
                      <ContextMenuItem onClick={applyToGroup}>
                        Ingen undervisning för {group.name}
                        {groupChangeable.length > 1 ? ` (${num(groupChangeable.length)})` : ''}
                      </ContextMenuItem>
                      <ContextMenuItem disabled={!groupMarked.length} onClick={followSchool}>
                        Följ skolans dag
                        {groupMarked.length > 1 ? ` (${num(groupMarked.length)})` : ''}
                      </ContextMenuItem>
                    </>
                  ) : (
                    <ContextMenuItem disabled>Bara skolans skoldagar kan gälla en grupp</ContextMenuItem>
                  )
                ) : editable && changeable.length > 0 ? (
                  (['skoldag', 'lovdag', 'studiedag'] as Planned[]).map((t) => (
                    <ContextMenuItem key={t} onClick={() => applyToSelection(t)}>
                      Gör till{' '}
                      {changeable.length > 1
                        ? `${statusPlural[t]} (${num(changeable.length)})`
                        : toolCopy[t].label.toLocaleLowerCase('sv')}
                    </ContextMenuItem>
                  ))
                ) : (
                  <ContextMenuItem disabled>
                    {!editable
                      ? 'Läsåret kan inte ändras nu'
                      : 'Helger, helgdagar och dagarna mellan terminerna är låsta'}
                  </ContextMenuItem>
                )}
                </ContextMenuGroup>
                <ContextMenuSeparator />
                <ContextMenuItem disabled={!selection.length} onClick={() => setSelection([])}>
                  Avmarkera
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>

            <div className="ly-legend">
              {(['skoldag', 'lovdag', 'studiedag', 'helgdag', 'helg'] as DayInfo['status'][]).map((s) => (
                <span key={s} className={`ly-legend-item ly-${s}`}>
                  <i aria-hidden="true" />
                  {statusText[s]}
                  {s === 'skoldag' && <small>{num(summary.skoldagar)}</small>}
                  {s === 'lovdag' && <small>{num(summary.lovdagar)}</small>}
                  {s === 'studiedag' && <small>{num(summary.studiedagar)}</small>}
                  {s === 'helgdag' && <small>{num(summary.helgdagar.length)}</small>}
                </span>
              ))}
              <span className="ly-legend-item"><i className="ly-note-dot ly-legend-dot" aria-hidden="true" /> Har anteckning</span>
              <button type="button" className="text-link" aria-expanded={showDefinitions} onClick={() => setShowDefinitions((v) => !v)}>
                <BookOpen size={14} /> {showDefinitions ? 'Dölj definitionerna' : 'Vad räknas som skoldag, lovdag och studiedag?'}
              </button>
            </div>
            {showDefinitions && (
              <dl className="ly-definitions">
                {definitions.map((d) => (
                  <div key={d.id}>
                    <dt>{d.term}</dt>
                    <dd>
                      {d.text}
                      <small>{d.source}</small>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {selection.length > 0 && (
              <div className="ly-marking">
                <div className="ly-marking-what">
                  <strong>
                    {selectedInfo
                      ? formatLong(selectedInfo.date)
                      : `${num(selection.length)} dagar markerade`}
                  </strong>
                  <span>
                    {selectedInfo ? (
                      <>
                        {selectedInfo.holiday ?? statusText[selectedInfo.status]}
                        {selectedInfo.part === 'jullov' ? ' · mellan terminerna' : selectedInfo.part ? ` · ${selectedInfo.part === 'ht' ? 'höstterminen' : 'vårterminen'}` : ''}
                        {selectedInfo.status === 'helgdag' && ' · allmän helgdag, kan inte vara skoldag'}
                        {selectedInfo.status === 'helg' && ' · skolarbetet förläggs måndag–fredag'}
                      </>
                    ) : (
                      <>
                        {(['skoldag', 'lovdag', 'studiedag', 'helgdag', 'helg'] as DayInfo['status'][])
                          .map((k) => ({ k, n: selectedDays.filter((d) => d.status === k).length }))
                          .filter((x) => x.n > 0)
                          .map((x) => `${num(x.n)} ${x.n > 1 ? statusPlural[x.k] : statusText[x.k].toLocaleLowerCase('sv')}`)
                          .join(' · ')}
                        {changeable.length < selection.length ? ` · ${num(selection.length - changeable.length)} låsta` : ''}
                        {group && groupMarked.length ? ` · ${num(groupMarked.length)} utan undervisning för ${group.name}` : ''}
                      </>
                    )}
                  </span>
                </div>
                {editable && !group && changeable.some((d) => d.status !== 'skoldag') && (
                  <div className="ly-marking-note">
                    <label className="ly-field-label" htmlFor="ly-day-note">Anteckning</label>
                    <Input
                      id="ly-day-note"
                      value={selectedInfo ? selectedInfo.note ?? '' : ''}
                      placeholder={selectedInfo ? (selectedInfo.status === 'studiedag' ? 'Vad personalen gör' : 'Lovets namn') : 'Samma anteckning på alla markerade lov- och studiedagar'}
                      onChange={(e) =>
                        selectedInfo
                          ? apply((s) => setNote(s, sy.id, selectedInfo.date, e.target.value))
                          : apply((s) => setNotes(s, sy.id, changeable.map((d) => d.date), e.target.value))
                      }
                    />
                  </div>
                )}
                {!editable && selectedInfo?.note && <span className="ly-marking-text">{selectedInfo.note}</span>}
                <div className="ly-marking-actions">
                  {editable && group && groupChangeable.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={applyToGroup}>
                        Ingen undervisning för {group.name}
                        {groupChangeable.length > 1 ? ` (${num(groupChangeable.length)})` : ''}
                      </Button>
                      {groupMarked.length > 0 && (
                        <Button variant="outline" size="sm" onClick={followSchool}>
                          Följ skolans dag
                          {groupMarked.length > 1 ? ` (${num(groupMarked.length)})` : ''}
                        </Button>
                      )}
                    </>
                  )}
                  {editable &&
                    !group &&
                    changeable.length > 0 &&
                    (['skoldag', 'lovdag', 'studiedag'] as Planned[])
                      .filter((t) => !selectedInfo || t !== selectedInfo.status)
                      .map((t) => (
                        <Button key={t} variant="outline" size="sm" onClick={() => applyToSelection(t)}>
                          Gör till{' '}
                          {changeable.length > 1
                            ? `${statusPlural[t]} (${num(changeable.length)})`
                            : toolCopy[t].label.toLocaleLowerCase('sv')}
                        </Button>
                      ))}
                  <button type="button" className="text-link ly-clear" onClick={() => setSelection([])}>
                    Avmarkera
                  </button>
                </div>
              </div>
            )}

            <section className="ly-teaching">
              <div className="section-heading">
                <h3>Undervisning som läsåret rymmer</h3>
                <span className="cell-secondary">
                  {num(summary.skoldagar)} skoldagar = {num(schoolWeeks(summary.skoldagar), 1)} skolveckor om fem dagar
                </span>
              </div>
              <div className="ly-teaching-grid">
                <div>
                  <h4>Skoldagar per veckodag</h4>
                  <ol className="ly-weekdays">
                    {summary.perWeekday.map((n, i) => {
                      const max = Math.max(...summary.perWeekday);
                      const min = Math.min(...summary.perWeekday);
                      return (
                        <li key={weekdayNames[i]} className={n === min && max - min >= 4 ? 'ly-weekday-low' : ''}>
                          <span>{weekdayNames[i]}</span>
                          <i aria-hidden="true" style={{ width: `${(n / Math.max(1, max)) * 100}%` }} />
                          <strong>{num(n)}</strong>
                        </li>
                      );
                    })}
                  </ol>
                  <p className="cell-secondary">
                    En lektion om 60 minuter som ligger varje {weekdayNames[summary.perWeekday.indexOf(Math.min(...summary.perWeekday))]} ger {num(Math.min(...summary.perWeekday))} timmar under läsåret; varje {weekdayNames[summary.perWeekday.indexOf(Math.max(...summary.perWeekday))]} ger {num(Math.max(...summary.perWeekday))}. Skoldagarna ska vara så jämnt fördelade som möjligt.
                  </p>
                </div>
                <div>
                  <h4>Timplanens timmar med läsårets skoldagar</h4>
                  {teachingRows.length === 0 && !introPlan ? (
                    <p className="cell-secondary">Ingen fastställd timplan att räkna på. Fastställ en timplan under Timplaner.</p>
                  ) : (
                    <div className="tp-grid-scroll">
                      <table className="tp-grid ly-teaching-table">
                        <thead>
                          <tr>
                            <th scope="col">Utbildning</th>
                            <th scope="col">Timmar per läsår</th>
                            <th scope="col">Undervisningsdagar</th>
                            <th scope="col">Kräver per vecka</th>
                            <th scope="col">Per skoldag</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teachingRows.map((r, i) => {
                            const minutes = requiredWeeklyMinutes(r.hours, r.days);
                            const first = i === 0 || teachingRows[i - 1].education !== r.education;
                            return (
                              <Fragment key={r.id}>
                                {first && (
                                  <tr className="tp-block-row">
                                    <th scope="rowgroup" colSpan={5}>{r.education}</th>
                                  </tr>
                                )}
                                <tr>
                                  <th scope="row" className="tp-row-head">
                                    <span className="tp-row-name">{r.column}</span>
                                  </th>
                                  <td>{num(r.hours)}</td>
                                  <td className={r.fewer ? 'ly-fewer' : ''}>
                                    {num(r.days)}
                                    {r.fewer ? <small className="tp-minutes">{num(r.fewer)} färre än skolan</small> : null}
                                  </td>
                                  <td>{num(minutes)} min<small className="tp-minutes">{num(minutes / 60, 1)} timmar</small></td>
                                  <td>{num(hoursPerSchoolDay(r.hours, r.days), 1)} timmar</td>
                                </tr>
                              </Fragment>
                            );
                          })}
                          {intro && introPlan && (
                            <>
                              <tr className="tp-block-row">
                                <th scope="rowgroup" colSpan={5}>{intro.name}</th>
                              </tr>
                            <tr>
                              <th scope="row" className="tp-row-head">
                                <span className="tp-row-name">Per läsår</span>
                                <span className="tp-row-meta"><em>utbildningsplan, {num(introWeekly)} timmar per vecka</em></span>
                              </th>
                              <td>{num(Math.round(introWeekly * schoolWeeks(summary.skoldagar)))}</td>
                              <td>{num(summary.skoldagar)}</td>
                              <td>{num(introWeekly * 60)} min<small className="tp-minutes">minst 23 timmar</small></td>
                              <td>{num(introWeekly / 5, 1)} timmar</td>
                            </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="cell-secondary">
                    Timplanen anger timmar om 60 minuter per läsår. Här fördelas de på läsårets skolveckor; raster ingår inte. Undervisning som ställs in måste läggas ut igen för att timmarna ska nås.
                  </p>
                </div>
              </div>
              {classRows.length > 0 && (
                <div className="ly-schedule">
                  <h4>Lärotider per klass</h4>
                  <div className="tp-grid-scroll">
                    <table className="tp-grid ly-teaching-table">
                      <thead>
                        <tr>
                          <th scope="col">Klass</th>
                          <th scope="col">Elever</th>
                          <th scope="col">Undervisningsdagar</th>
                          <th scope="col">Skäl till avvikelse</th>
                          <th scope="col">Per skoldag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {classRows.map(({ group: g, own, hours }) => (
                          <tr key={g.id} data-state={groupId === g.id ? 'selected' : undefined}>
                            <th scope="row" className="tp-row-head">
                              <button
                                type="button"
                                className="pupil-link"
                                aria-label={`Visa lärotider för klass ${g.name}`}
                                onClick={() => { setGroupId(g.id); setSelection([]); setAnchor(null); clearError(); }}
                              >
                                <span>
                                  <strong>{g.name}</strong>
                                  <small>{g.educationName}{g.columnId ? '' : ' · utanför timplanens årskurser'}</small>
                                </span>
                              </button>
                            </th>
                            <td>{g.pupils ? num(g.pupils) : <span className="tp-zero">–</span>}</td>
                            <td className={own.fewer ? 'ly-fewer' : ''}>
                              {num(own.days)}
                              {own.fewer ? <small className="tp-minutes">{num(own.fewer)} färre än skolan</small> : null}
                            </td>
                            <td className="ly-causes">
                              {own.shortWeek && (
                                <span>Fyra dagar i veckan, ledig {weekdayNames[own.shortWeek.weekday]}</span>
                              )}
                              {own.byCause.filter((c) => !c.recurring).map((c) => (
                                <span key={c.cause}>{causeLabel[c.cause]} · {num(c.days)} dagar</span>
                              ))}
                              {!own.shortWeek && own.byCause.length === 0 && <span className="tp-zero">följer skolans dagar</span>}
                            </td>
                            <td>{hours ? `${num(hoursPerSchoolDay(hours, own.days), 1)} timmar` : <span className="tp-zero">–</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="cell-secondary">
                    Klasserna kommer ur elevregistret och ärver sin årskurs avvikelser. Timmarna per skoldag är
                    timplanens timmar för klassens årskurs fördelade på klassens egna undervisningsdagar. En klass
                    med färre dagar behöver längre dagar för samma garanterade undervisningstid.
                  </p>
                </div>
              )}
              {scheduleRows.length > 0 && (
                <div className="ly-schedule">
                  <h4>Schemats pass under läsåret</h4>
                  <div className="tp-grid-scroll">
                    <table className="tp-grid ly-teaching-table">
                      <thead>
                        <tr>
                          <th scope="col">Grupp</th>
                          <th scope="col">Per vecka</th>
                          {weekdayShort.slice(0, 5).map((w) => (
                            <th scope="col" key={w}>{w}</th>
                          ))}
                          <th scope="col">Tillfällen</th>
                          <th scope="col" className="tp-total-head">Timmar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scheduleRows.map((g) => (
                          <tr key={g.id}>
                            <th scope="row" className="tp-row-head">
                              <span className="tp-row-name">{g.name}</span>
                              <span className="tp-row-meta"><em>{g.subject} · {g.teacher}</em></span>
                            </th>
                            <td>{num(g.weekly)} min<small className="tp-minutes">{g.slots} pass</small></td>
                            {g.planned.perDay.map((h, i) => (
                              <td key={weekdayShort[i]}>{h ? num(h, 1) : <span className="tp-zero">–</span>}</td>
                            ))}
                            <td>{num(g.planned.occasions)}</td>
                            <td className="tp-total">{num(g.planned.hours, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="cell-secondary">
                    Exempelveckan under Schema &amp; resurser, upprepad över skolans skoldagar. Undervisningsgrupperna är
                    inte knutna till klass eller årskurs i exemplet, så en grupps egna lärotider kan inte räknas in här;
                    den jämförelsen finns per klass i tabellen ovan. Jämförelsen mot timplanens timmar per ämne kräver
                    dessutom att varje grupp knyts till en rad i timplanen.
                  </p>
                </div>
              )}
            </section>
            <div className="plan-boundary">
              <BookOpen size={17} />
              <p>
                Kontrollerna prövar antalet skoldagar, lovdagar, studiedagar och veckor mot förordningarna samt att läsåret börjar i augusti och slutar i juni. Andra lärotider för enskilda elever (Skolförordningen 3 kap. 4 a–5 §§, Gymnasieförordningen 3 kap. 3 a §), arbetsplatsförlagt lärande och kommunens gemensamma lovdagar hanteras inte här. Ett fastställt beslut i exemplet är ingen handling i verklig mening.
              </p>
            </div>
          </>
        )}
      </section>

      {sy && summary && (
        <aside className="ly-side">
          <div className="og-card">
            <div className="section-heading">
              <h3>Kontroll mot ramen</h3>
              <span className={errors.length ? 'a-status amber' : 'a-status'}>
                <span />
                {errors.length ? `${errors.length} avvikelse${errors.length > 1 ? 'r' : ''}` : 'Inom ramen'}
              </span>
            </div>
            <dl className="ly-counters">
              <div className={summary.skoldagar < minSchoolDays ? 'ly-bad' : ''}>
                <dt>Skoldagar</dt>
                <dd><strong>{num(summary.skoldagar)}</strong><small>minst {minSchoolDays}</small></dd>
              </div>
              <div className={summary.lovdagar < minHolidays ? 'ly-bad' : ''}>
                <dt>Lovdagar</dt>
                <dd><strong>{num(summary.lovdagar)}</strong><small>minst {minHolidays} · {num(summary.lovdagarJullov)} i jullovet</small></dd>
              </div>
              <div className={summary.studiedagar > maxStudyDays ? 'ly-bad' : ''}>
                <dt>Studiedagar</dt>
                <dd><strong>{num(summary.studiedagar)}</strong><small>högst {maxStudyDays}</small></dd>
              </div>
              <div className={gy && summary.weeks.total !== gymnasiumWeeks ? 'ly-bad' : ''}>
                <dt>Veckor</dt>
                <dd><strong>{num(summary.weeks.total)}</strong><small>{gy ? `gymnasieskolan ${gymnasiumWeeks}` : 'inget krav i grundskolan'}</small></dd>
              </div>
              <div>
                <dt>Helgdagar på vardag</dt>
                <dd><strong>{num(summary.helgdagar.length)}</strong><small>räknas inte som lov</small></dd>
              </div>
            </dl>
            <p className={`ly-margin ${summary.margin < 0 ? 'ly-bad' : ''}`}>
              {summary.margin >= 0
                ? `${num(summary.margin)} skoldag${summary.margin === 1 ? '' : 'ar'} över minsta antal. ${summary.studiedagarKvar ? `${num(Math.min(summary.studiedagarKvar, summary.margin))} studiedag${Math.min(summary.studiedagarKvar, summary.margin) === 1 ? '' : 'ar'} kan läggas ut utan att gå under ${minSchoolDays}.` : 'Alla fem studiedagar är utlagda.'}`
                : `${num(-summary.margin)} skoldag${summary.margin === -1 ? '' : 'ar'} saknas.`}
            </p>
            {errors.length > 0 && (
              <div className="validation-warning">
                {errors.map((i) => (
                  <p key={i.text}><AlertTriangle size={16} /><span>{i.text}</span></p>
                ))}
              </div>
            )}
            {errors.length === 0 && (
              <div className="validation-success"><CircleCheck size={17} /> Läsåret uppfyller förordningens antal skoldagar, lovdagar och studiedagar.</div>
            )}
            {warnings.length > 0 && (
              <ul className="tp-warnings">
                {warnings.map((i) => (
                  <li key={i.text}><Info size={14} /> {i.text}</li>
                ))}
              </ul>
            )}
            {groupIssues.length > 0 && group && (
              <div className="ly-group-issues">
                <h4>{group.name}</h4>
                {groupIssues.filter((i) => i.level === 'error').length > 0 && (
                  <div className="validation-warning">
                    {groupIssues.filter((i) => i.level === 'error').map((i) => (
                      <p key={i.text}><AlertTriangle size={16} /><span>{i.text}</span></p>
                    ))}
                  </div>
                )}
                <ul className="tp-warnings">
                  {groupIssues.filter((i) => i.level === 'warning').map((i) => (
                    <li key={i.text}><Info size={14} /> {i.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="og-card">
            <div className="section-heading">
              <h3>Helgdagar inom läsåret</h3>
            </div>
            <ul className="ly-holidays">
              {summary.helgdagar.map((h) => (
                <li key={h.date}><span>{h.name}</span><small>{formatLong(h.date)}</small></li>
              ))}
            </ul>
            <p className="cell-secondary">Lagen (1989:253) om allmänna helgdagar. Söndagar och lördagshelgdagar visas inte.</p>
          </div>
          <div className="og-card">
            <div className="section-heading">
              <h3><History size={16} /> Samtal och beslut</h3>
            </div>
            <div className="tp-comment-box">
              <Textarea aria-label="Ny kommentar" rows={2} value={talk} placeholder={`Kommentera som ${roleLabel[state.role].toLocaleLowerCase('sv')}…`} onChange={(e) => setTalk(e.target.value)} />
              <Button variant="outline" onClick={() => { if (apply((s) => addComment(s, sy.id, talk))) setTalk(''); }}>
                <MessageSquareText size={15} /> Kommentera
              </Button>
            </div>
            <div className="admin-history tp-entries">
              {sy.history.map((h) => (
                <div key={h.id}>
                  <span>{roleLabel[h.role]} · {h.time}</span>
                  <strong>{h.action}</strong>
                  <p>{h.comment}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      <Dialog open={action !== null} onOpenChange={(open) => { if (!open) setAction(null); }}>
        <DialogContent className="admin-dialog" showCloseButton={false}>
          {action && sy && summary && (
            <>
              <div className="dialog-eyebrow">
                <span>{sy.label.toLocaleUpperCase('sv')}</span>
                <span>{unitName.toLocaleUpperCase('sv')}</span>
              </div>
              <DialogTitle>{actionCopy[action].title}</DialogTitle>
              <DialogDescription>{actionCopy[action].description}</DialogDescription>
              {(action === 'submit' || action === 'approve') && (
                <div className="review-summary">
                  <span>Kontroll mot ramen</span>
                  <strong>{errors.length ? `${errors.length} avvikelser` : 'Inom ramen'}</strong>
                  <p>
                    Hösttermin {formatDate(sy.ht.start)} – {formatDate(sy.ht.end)}, vårtermin {formatDate(sy.vt.start)} – {formatDate(sy.vt.end)}. {num(summary.skoldagar)} skoldagar, {num(summary.lovdagar)} lovdagar, {num(summary.studiedagar)} studiedagar, {num(summary.weeks.total)} veckor.
                  </p>
                </div>
              )}
              <label className="field-label" htmlFor="ly-action-comment">{actionCopy[action].label}</label>
              <Textarea id="ly-action-comment" rows={4} placeholder={actionCopy[action].placeholder} value={comment} onChange={(e) => setComment(e.target.value)} />
              {error && (
                <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>
              )}
              <div className="dialog-actions">
                <Button variant="ghost" onClick={() => setAction(null)}>Avbryt</Button>
                <Button onClick={runAction}>{actionCopy[action].button}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
