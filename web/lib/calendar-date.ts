/** Calendar-only values. Never parse YYYY-MM-DD as an instant or serialize UTC. */
export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}
export function calendarDateValue(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function calendarDateError(value: string, min?: string, max?: string): string {
  if (!value) return '';
  if (!parseCalendarDate(value)) return 'Ange ett giltigt datum som ÅÅÅÅ-MM-DD.';
  if (min && parseCalendarDate(min) && value < min) return `Välj ${min} eller senare.`;
  if (max && parseCalendarDate(max) && value > max) return `Välj ${max} eller tidigare.`;
  return '';
}
/** ISO week-year can differ from the calendar year near New Year. */
export function calendarIsoWeek(date: Date): { week: number; year: number } {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utc.setUTCFullYear(date.getFullYear());
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const year = utc.getUTCFullYear(), start = new Date(0);
  start.setUTCHours(0, 0, 0, 0); start.setUTCFullYear(year, 0, 1);
  return { year, week: Math.ceil(((utc.getTime() - start.getTime()) / 86400000 + 1) / 7) };
}
