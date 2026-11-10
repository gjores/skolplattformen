'use client';
// Delad läsårskalender för demovyn (lasar-view.tsx) och den skyddade vyn
// (protected-lasar-workspace.tsx), plan 05.1.1-03. Markup och klassnamn är
// demons (UI-SPEC avsnitt 1 rad 9–10 och avsnitt 8) och får inte ändras utan
// att demoregressionen (e2e/lasar-demo.spec.ts) blir röd.
import { CalendarCheck } from 'lucide-react';
import { useRef, useState, type TouchEvent } from 'react';
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
  causeLabel,
  dayInfo,
  editableRange,
  formatDate,
  formatLong,
  weekRows,
  weekdayShort,
  type DayInfo,
  type GroupDay,
  type Planned,
  type SchoolYear,
  type StudentGroup,
  type Summary,
} from '@/lib/lasar-model.ts';

export const num = (n: number, digits = 0) => n.toLocaleString('sv-SE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const statusText: Record<DayInfo['status'], string> = {
  skoldag: 'Skoldag',
  lovdag: 'Lovdag',
  studiedag: 'Studiedag',
  helgdag: 'Helgdag',
  helg: 'Helg',
  utanför: 'Utanför läsåret',
};
export const statusPlural: Record<DayInfo['status'], string> = {
  skoldag: 'skoldagar',
  lovdag: 'lovdagar',
  studiedag: 'studiedagar',
  helgdag: 'helgdagar',
  helg: 'helger',
  utanför: 'dagar utanför läsåret',
};
export const toolCopy: Record<Planned, { label: string; hint: string }> = {
  skoldag: { label: 'Skoldag', hint: 'Klicka på en lov- eller studiedag för att göra den till skoldag igen.' },
  lovdag: { label: 'Lovdag', hint: 'Klicka på dagar eller på ett veckonummer. Skift-klicka för ett intervall.' },
  studiedag: { label: 'Studiedag', hint: 'Högst fem per läsår. Skriv vad personalen gör så syns det i planen.' },
};

export type ClickModifiers = { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };

/**
 * Markeringen i kalendern (UI-SPEC avsnitt 8). Skift markerar ett intervall
 * och kommando eller ctrl lägger till en dag, båda utan att ändra något.
 * `dayClick` och `weekClick` svarar sant när klicket också ska sätta dagarna.
 */
export function useCalendarSelection() {
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  function clear() {
    setSelection([]);
    setAnchor(null);
  }
  function dayClick(sy: SchoolYear, date: string, event: ClickModifiers): boolean {
    if (event.metaKey || event.ctrlKey) {
      setSelection((prev) => (prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]));
      setAnchor(date);
      return false;
    }
    if (event.shiftKey && anchor) {
      const range = editableRange(sy, anchor, date);
      setSelection(range.length ? range : [date]);
      return false;
    }
    setSelection([date]);
    setAnchor(date);
    return true;
  }
  function weekClick(weekdays: string[], event: Pick<ClickModifiers, 'metaKey' | 'ctrlKey'>): boolean {
    if (!weekdays.length) return false;
    if (event.metaKey || event.ctrlKey) {
      setSelection((prev) => [...prev.filter((d) => !weekdays.includes(d)), ...weekdays]);
      setAnchor(weekdays[0]);
      return false;
    }
    setSelection(weekdays);
    setAnchor(weekdays[0]);
    return true;
  }
  /** Högerklick redigerar markeringen; en omarkerad dag markeras först. */
  function contextMenu(date: string) {
    if (!selection.includes(date)) {
      setSelection([date]);
      setAnchor(date);
    }
  }
  return { anchor, selection, setSelection, setAnchor, clear, dayClick, weekClick, contextMenu };
}
export type CalendarSelection = ReturnType<typeof useCalendarSelection>;

/** Samma fördröjning som Base UI:s ContextMenuTrigger (LONG_PRESS_DELAY). */
const LONG_PRESS_MS = 500;
/**
 * Långtryck på en dag (A-13): efter 500 ms markeras dagen, och Base UI öppnar
 * `ly-menu` på samma tryck. Klicket som följer när fingret lyfts ändrar inte
 * dagen. Ett kort tryck är ett vanligt klick.
 */
function useLongPress(onPress: (date: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef<string | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    handlers: (date: string) => ({
      onTouchStart: (e: TouchEvent<HTMLButtonElement>) => {
        cancel();
        pressed.current = null;
        if (e.touches.length !== 1) return;
        start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        timer.current = setTimeout(() => {
          timer.current = null;
          pressed.current = date;
          onPress(date);
        }, LONG_PRESS_MS);
      },
      onTouchMove: (e: TouchEvent<HTMLButtonElement>) => {
        const t = e.touches[0];
        if (start.current && t && (Math.abs(t.clientX - start.current.x) > 10 || Math.abs(t.clientY - start.current.y) > 10)) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    }),
    /** Sant en gång för klicket efter ett långtryck på samma dag. */
    consumed(date: string) {
      if (pressed.current !== date) return false;
      pressed.current = null;
      return true;
    },
  };
}

/**
 * Vad markeringen omfattar: ändringsbara dagar och, för en grupp, skolans
 * skoldagar. `isLocked` (skyddad drift, D-12) räknar passerade dagar som låsta.
 */
export function selectionFacts(sy: SchoolYear | undefined, selection: string[], groupCalendar: Map<string, GroupDay>, isLocked?: (date: string) => boolean) {
  const selectedDays = sy ? selection.map((d) => dayInfo(sy, d)) : [];
  const open = (d: DayInfo) => !isLocked?.(d.date);
  const changeable = selectedDays.filter((d) => d.editable && open(d));
  /** Dagar i markeringen som är skolans skoldagar; bara de kan gälla en grupp. */
  const groupChangeable = selectedDays.filter((d) => d.status === 'skoldag' && open(d));
  const groupMarked = groupChangeable.filter((d) => groupCalendar.get(d.date)?.off);
  return { selectedDays, changeable, groupChangeable, groupMarked };
}

export type LasarCalendarProps = {
  sy: SchoolYear;
  summary: Summary;
  calendar: CalendarSelection;
  editable: boolean;
  tool: Planned;
  group?: StudentGroup;
  groupCalendar?: Map<string, GroupDay>;
  onDayClick: (date: string, event: ClickModifiers) => void;
  onWeekClick: (days: DayInfo[], event: Pick<ClickModifiers, 'metaKey' | 'ctrlKey'>) => void;
  onApplyToSelection: (kind: Planned) => void;
  onApplyToGroup?: () => void;
  onFollowSchool?: () => void;
  /** Skyddad drift (A-07, D-12): passerade dagar får `ly-past` och kan inte ändras. Demon skickar ingen. */
  isLocked?: (date: string) => boolean;
  /** Extra klass på `ly-menu`, som ligger i en portal utanför vyns behållare. */
  menuClassName?: string;
  /** Telefon (A-13): långtryck markerar dagen innan menyn öppnas, och tryckets klick ändrar inte dagen. */
  touchSelect?: boolean;
};

const noGroupDays: Map<string, GroupDay> = new Map();

/** Kalendern med höst- och vårtermin, veckorader och högerklicksmenyn `ly-menu`. */
export function LasarCalendar({
  sy,
  summary,
  calendar,
  editable,
  tool,
  group,
  groupCalendar = noGroupDays,
  onDayClick,
  onWeekClick,
  onApplyToSelection,
  onApplyToGroup,
  onFollowSchool,
  isLocked,
  menuClassName,
  touchSelect = false,
}: LasarCalendarProps) {
  const { selection, anchor } = calendar;
  const { selectedDays, changeable, groupChangeable, groupMarked } = selectionFacts(sy, selection, groupCalendar, isLocked);
  const past = (d: DayInfo) => d.status !== 'utanför' && Boolean(isLocked?.(d.date));
  const press = useLongPress((date) => calendar.contextMenu(date));

  function dayCell(d: DayInfo, i: number) {
    const dayNumber = Number(d.date.slice(8));
    const off = groupCalendar.get(d.date)?.off;
    const locked = past(d);
    const title =
      d.status === 'utanför'
        ? `${formatLong(d.date)} · utanför läsåret`
        : `${formatLong(d.date)} · ${d.holiday ?? statusText[d.status]}${d.note ? ` · ${d.note}` : ''}${d.part === 'jullov' ? ' · mellan terminerna' : ''}${off ? ` · ingen undervisning för ${off.from}: ${causeLabel[off.cause]}${off.note ? `, ${off.note}` : ''}` : ''}${locked ? ' · passerad dag, låst' : ''}`;
    const marked = selection.includes(d.date);
    const className = `ly-day ly-${d.status}${off ? ' ly-off' : ''}${d.part === 'jullov' ? ' ly-between' : ''}${marked ? ' ly-selected' : ''}${anchor === d.date && marked && selection.length > 1 ? ' ly-anchor' : ''}${d.date === sy.ht.start || d.date === sy.vt.start ? ' ly-term-start' : ''}${d.date === sy.ht.end || d.date === sy.vt.end ? ' ly-term-end' : ''}${locked ? ' ly-past' : ''}`;
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
          onClick={(e) => { if (touchSelect && press.consumed(d.date)) return; onDayClick(d.date, e); }}
          onContextMenu={() => calendar.contextMenu(d.date)}
          {...(touchSelect ? press.handlers(d.date) : {})}
        >
          {dayNumber}
          {d.note && <i className="ly-note-dot" aria-hidden="true" />}
          {d.holiday && i < 5 && <i className="ly-holiday-mark" aria-hidden="true" />}
        </button>
      </td>
    );
  }

  function half(part: 'ht' | 'vt') {
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
              const paintable = row.days.some((d) => d.editable && !past(d));
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

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div className="ly-calendar">
            {half('ht')}
            {half('vt')}
          </div>
        }
      />
      <ContextMenuContent className={menuClassName ? `ly-menu ${menuClassName}` : 'ly-menu'}>
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
              <ContextMenuItem onClick={onApplyToGroup}>
                Ingen undervisning för {group.name}
                {groupChangeable.length > 1 ? ` (${num(groupChangeable.length)})` : ''}
              </ContextMenuItem>
              <ContextMenuItem disabled={!groupMarked.length} onClick={onFollowSchool}>
                Följ skolans dag
                {groupMarked.length > 1 ? ` (${num(groupMarked.length)})` : ''}
              </ContextMenuItem>
            </>
          ) : (
            <ContextMenuItem disabled>Bara skolans skoldagar kan gälla en grupp</ContextMenuItem>
          )
        ) : editable && changeable.length > 0 ? (
          (['skoldag', 'lovdag', 'studiedag'] as Planned[]).map((t) => (
            <ContextMenuItem key={t} onClick={() => onApplyToSelection(t)}>
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
              : selectedDays.some((d) => d.editable && past(d))
                ? 'Passerade dagar är låsta'
                : 'Helger, helgdagar och dagarna mellan terminerna är låsta'}
          </ContextMenuItem>
        )}
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!selection.length} onClick={() => calendar.setSelection([])}>
          Avmarkera
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
