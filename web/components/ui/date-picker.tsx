'use client';

import { useEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Popover } from '@base-ui/react/popover';
import { DayPicker } from 'react-day-picker';
import { sv } from 'react-day-picker/locale';
import { CalendarDays } from 'lucide-react';
import { calendarDateError, calendarDateValue, calendarIsoWeek, parseCalendarDate } from '@/lib/calendar-date';
import './date-picker.css';

type DatePickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'min' | 'max'> & {
  value: string;
  onValueChange: (value: string) => void;
  min?: string;
  max?: string;
};
const fullDate = (date: Date) => date.toLocaleDateString('sv-SE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/** Swedish date input; the parent's string remains a date, never a timestamp. */
export function DatePicker({ value, onValueChange, id, min, max, required, disabled, readOnly, className, onKeyDown, ...props }: DatePickerProps) {
  const generated = useId(), inputId = id ?? `date-${generated}`, helpId = `${inputId}-calendar-help`;
  const input = useRef<HTMLInputElement>(null), container = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false), [month, setMonth] = useState<Date>();
  const selected = parseCalendarDate(value), lower = min ? parseCalendarDate(min) : undefined, upper = max ? parseCalendarDate(max) : undefined;
  const error = calendarDateError(value, min, max), week = selected ? calendarIsoWeek(selected) : null;
  const unavailable = () => !!(disabled || readOnly || input.current?.matches(':disabled'));
  useEffect(() => { input.current?.setCustomValidity(error); }, [error]);
  const change = (next: string) => { if (!unavailable()) onValueChange(next); };
  const choose = (date: Date | undefined) => {
    if (!date || unavailable()) return;
    const next = calendarDateValue(date);
    if (calendarDateError(next, min, max)) return;
    change(next); setOpen(false);
  };
  const openCalendar = (next: boolean) => {
    if (next && unavailable()) return;
    if (next) {
      let initial = selected ?? new Date();
      if (lower && initial < lower) initial = lower;
      if (upper && initial > upper) initial = upper;
      setMonth(initial);
    }
    setOpen(next);
  };
  const today = calendarDateValue(new Date());
  const earliest = lower ?? new Date(Math.min(1900, selected?.getFullYear() ?? 1900), 0, 1);
  const latest = upper ?? new Date(Math.max(new Date().getFullYear() + 30, selected?.getFullYear() ?? 0), 11, 31);
  return <span className="school-date" ref={container}>
    <span className="school-date-control">
      <input {...props} id={inputId} ref={input} type="date" min={min} max={max} value={value} required={required} disabled={disabled} readOnly={readOnly}
        className={`school-date-input ${className ?? ''}`} placeholder={props.placeholder ?? 'ÅÅÅÅ-MM-DD'} inputMode="numeric" autoComplete={props.autoComplete ?? 'off'}
        aria-invalid={props['aria-invalid'] || !!error || undefined}
        aria-describedby={[props['aria-describedby'], helpId].filter(Boolean).join(' ')}
        onChange={event => change(event.target.value)} onKeyDown={event => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && event.altKey && event.key === 'ArrowDown') { event.preventDefault(); openCalendar(true); }
        }} />
      <Popover.Root open={open && !disabled && !readOnly} onOpenChange={openCalendar}>
        <Popover.Trigger type="button" className="school-date-trigger" disabled={disabled || readOnly} aria-label="Öppna kalender" aria-describedby={inputId}>
          <CalendarDays size={20} aria-hidden="true" />
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Positioner className="school-date-positioner" sideOffset={8} align="end" collisionPadding={8}>
            <Popover.Popup className="school-date-popup" aria-label="Välj datum" initialFocus={() => container.current?.querySelector<HTMLButtonElement>('.rdp-day_button[tabindex="0"]') ?? true}>
              <Popover.Title className="school-date-title">Välj datum</Popover.Title>
              <DayPicker mode="single" required selected={selected} onSelect={choose} month={month} onMonthChange={setMonth}
                locale={sv} ISOWeek showWeekNumber showOutsideDays captionLayout="dropdown" navLayout="after" startMonth={earliest} endMonth={latest}
                disabled={[...(lower ? [{ before: lower }] : []), ...(upper ? [{ after: upper }] : [])]}
                labels={{ labelNext: () => 'Nästa månad', labelPrevious: () => 'Föregående månad', labelNav: () => 'Byt månad',
                  labelMonthDropdown: () => 'Månad', labelYearDropdown: () => 'År', labelWeekNumberHeader: () => 'Vecka', labelWeekNumber: n => `Vecka ${n}`,
                  labelGrid: date => date.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }), labelDayButton: (date, modifiers) => `${fullDate(date)}${modifiers.today ? ', i dag' : ''}${modifiers.selected ? ', valt datum' : ''}` }}
                formatters={{ formatWeekNumberHeader: () => 'v.', formatMonthDropdown: date => date.toLocaleDateString('sv-SE', { month: 'long' }) }} />
              <p className="school-date-selection">{selected ? `${fullDate(selected)} · vecka ${week!.week}${week!.year !== selected.getFullYear() ? ` (${week!.year})` : ''}` : 'Välj en dag i kalendern.'}</p>
              <div className="school-date-actions"><button type="button" disabled={!!calendarDateError(today, min, max)} onClick={() => choose(parseCalendarDate(today))}>I dag</button>
                {!required && <button type="button" onClick={() => { change(''); setOpen(false); }}>Töm datum</button>}
                <Popover.Close type="button">Stäng</Popover.Close></div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
    <span id={helpId} className={`school-date-help${error ? ' school-date-error' : ''}`}>{error || (week ? `Vecka ${week.week}${week.year !== selected!.getFullYear() ? ` (${week.year})` : ''}` : 'ÅÅÅÅ-MM-DD · kalender med veckonummer')}</span>
  </span>;
}
