// 05-20: programplanens livscykel. Servern (SQL) avgör statusen; klienten visar bara
// serverns lifecycle. Regeln här är samma falltabell som phase5_programplan_phase_at.
import { ProgramplanContractError } from './programplan-catalog.ts';

export type ProgramplanPhase = 'framtida' | 'pagaende' | 'avslutad' | 'okand';
export type ProgramplanLifecycleUnit = { id: string; name: string; primary: boolean; inMandate: boolean };
export type ProgramplanLifecycle = { phase: ProgramplanPhase; startsOn: string | null; archived: boolean; revision: number; units: ProgramplanLifecycleUnit[] };
export type ProgramplanLifecycleCommandName = 'delete' | 'archive' | 'restore' | 'update';
export type ProgramplanEducationDetails = { name: string; localCode: string | null; cohort: string; startedOn: string | null };
export type ProgramplanLifecycleCommand =
  | { offeringId: string; expectedRevision: number; command: 'delete' | 'archive' | 'restore'; details: Record<string, never> }
  | { offeringId: string; expectedRevision: number; command: 'update'; details: ProgramplanEducationDetails };
export type ProgramplanLifecycleReply = { offeringId: string; command: ProgramplanLifecycleCommandName; lifecycle: ProgramplanLifecycle | null };
export type ProgramplanLifecycleActions = { editDetails: boolean; changePlan: boolean; delete: boolean; archive: boolean; restore: boolean };

export function programplanSchoolActions(_lifecycle: ProgramplanLifecycle, _role: 'huvudman' | 'rektor'): { add: boolean; remove: boolean } { return { add: false, remove: false }; }
export function programplanSchoolLabel(lifecycle: ProgramplanLifecycle): string { return lifecycle.units.find(u => u.primary)!.name; }

export const programplanPhaseLabel: Record<ProgramplanPhase, string> = { framtida: 'Framtida', pagaende: 'Pågående', avslutad: 'Avslutad', okand: 'Start okänd' };
export const programplanLifecycleEvent: Record<ProgramplanLifecycleCommandName, string> = {
  delete: 'programplan_education_deleted', archive: 'programplan_education_archived', restore: 'programplan_education_restored', update: 'programplan_education_updated',
};

function bad(): never { throw new ProgramplanContractError('invalid_programplan_lifecycle'); }
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;
function daysIn(year: number, month: number) { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
/** Kalenderdatum (YYYY-MM-DD) eller fel. Inga tidszoner eller tolkningar. */
export function programplanDate(value: unknown): string {
  if (typeof value !== 'string') bad();
  const m = DATE.exec(value); if (!m) bad();
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysIn(y, mo)) bad();
  return value;
}
/** Samma datum ett antal kalenderår senare; 29 februari blir 28 februari (som SQL:s interval). */
export function addCalendarYears(date: string, years: number): string {
  const [y, m, d] = programplanDate(date).split('-').map(Number), year = y + years;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, daysIn(year, m))).padStart(2, '0')}`;
}
/** Dagens datum i Europe/Stockholm, som phase5_programplan_today(). */
export function stockholmToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
/** Förslag för ny elevkull: 17 augusti nästa år. */
export function nextCohortStart(today: string = stockholmToday()): string { return `${Number(programplanDate(today).slice(0, 4)) + 1}-08-17`; }
export function startsAfter(date: string, today: string = stockholmToday()): boolean {
  try { return programplanDate(date) > programplanDate(today); } catch { return false; }
}

/** D-02: status från kullens start. Gissas aldrig. */
export function programplanPhaseAt(startsOn: string | null, startYear: number | null, hasDecided: boolean, today: string): ProgramplanPhase {
  programplanDate(today);
  if (startsOn !== null) {
    programplanDate(startsOn);
    return today < startsOn ? 'framtida' : today < addCalendarYears(startsOn, 3) ? 'pagaende' : 'avslutad';
  }
  if (startYear !== null) {
    if (!Number.isSafeInteger(startYear) || startYear < 1) bad();
    const year = Number(today.slice(0, 4));
    return year < startYear ? 'framtida' : year >= startYear + 4 ? 'avslutad' : 'okand';
  }
  return hasDecided ? 'okand' : 'framtida';
}

/** D-01: tillåtna åtgärder. Rektor ändrar bara planen i en framtida, ej arkiverad utbildning. */
export function programplanLifecycleActions(lifecycle: ProgramplanLifecycle, role: 'huvudman' | 'rektor'): ProgramplanLifecycleActions {
  const open = !lifecycle.archived && lifecycle.phase === 'framtida', hm = role === 'huvudman';
  const inMandate = lifecycle.units.some(u => u.primary && u.inMandate);
  return { editDetails: hm && open && inMandate, changePlan: open && inMandate, delete: hm && open && inMandate,
    archive: hm && !lifecycle.archived && inMandate, restore: hm && lifecycle.archived && inMandate };
}
/** Kort förklaring när planen inte går att ändra. */
export function programplanLockReason(lifecycle: ProgramplanLifecycle): string | null {
  if (lifecycle.archived) return 'Planen är arkiverad och kan bara läsas. Ta fram den ur arkivet för att se den bland övriga planer.';
  if (lifecycle.phase === 'pagaende') return 'Elevkullen har börjat. En pågående plan kan inte ändras, bara arkiveras.';
  if (lifecycle.phase === 'avslutad') return 'Utbildningen är avslutad. Planen kan inte ändras, bara arkiveras.';
  if (lifecycle.phase === 'okand') return 'Utbildningens start är okänd och en version är fastställd. Planen skyddas och kan inte ändras, bara arkiveras.';
  return null;
}

function object(v: unknown, keys: string[]): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || ![Object.prototype, null].includes(Object.getPrototypeOf(v))
    || Object.getOwnPropertySymbols(v).length || Object.getOwnPropertyNames(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  return v as Record<string, unknown>;
}
function list(v: unknown, max: number): unknown[] {
  if (!Array.isArray(v) || v.length > max || Object.getPrototypeOf(v) !== Array.prototype || Object.getOwnPropertySymbols(v).length
    || Object.getOwnPropertyNames(v).length !== v.length + 1 || Object.values(Object.getOwnPropertyDescriptors(v)).some(d => d.get !== undefined || d.set !== undefined)) bad();
  for (let i = 0; i < v.length; i++) if (!Object.hasOwn(v, i)) bad();
  return v;
}
function uuid(v: unknown): string { if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(v)) bad(); return v.toLowerCase(); }
function integer(v: unknown, max = 2147483647): number { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > max) bad(); return v; }
function text(v: unknown, max: number, optional = false): string | null {
  if (optional && v === null) return null;
  if (typeof v !== 'string' || v.length > max || !v.trim()) bad();
  return v;
}

export function parseProgramplanLifecycle(v: unknown): ProgramplanLifecycle {
  const r = object(v, ['phase', 'startsOn', 'archived', 'revision', 'units']);
  if (typeof r.phase !== 'string' || !Object.hasOwn(programplanPhaseLabel, r.phase) || typeof r.archived !== 'boolean') bad();
  const units = list(r.units, 50).map(u => {
    const x = object(u, ['id', 'name', 'primary', 'inMandate']);
    if (typeof x.primary !== 'boolean' || typeof x.inMandate !== 'boolean' || typeof x.name !== 'string' || x.name.length > 1000) bad();
    return { id: uuid(x.id), name: x.name, primary: x.primary, inMandate: x.inMandate };
  });
  if (units.filter(u => u.primary).length !== 1 || new Set(units.map(u => u.id)).size !== units.length) bad();
  return { phase: r.phase as ProgramplanPhase, startsOn: r.startsOn === null ? null : programplanDate(r.startsOn), archived: r.archived, revision: integer(r.revision), units };
}
export function parseProgramplanEducationDetails(v: unknown): ProgramplanEducationDetails {
  const r = object(v, ['name', 'localCode', 'cohort', 'startedOn']);
  return { name: text(r.name, 120)!.trim(), localCode: text(r.localCode, 80, true)?.trim() ?? null, cohort: text(r.cohort, 120)!.trim(),
    startedOn: r.startedOn === null ? null : programplanDate(r.startedOn) };
}
export function parseProgramplanLifecycleCommand(v: unknown): ProgramplanLifecycleCommand {
  const r = object(v, ['offeringId', 'expectedRevision', 'command', 'details']);
  const base = { offeringId: uuid(r.offeringId), expectedRevision: integer(r.expectedRevision, 2147483646) };
  if (r.command === 'update') return { ...base, command: 'update', details: parseProgramplanEducationDetails(r.details) };
  if (r.command !== 'delete' && r.command !== 'archive' && r.command !== 'restore') bad();
  object(r.details, []);
  return { ...base, command: r.command, details: {} };
}
export function parseProgramplanLifecycleReply(v: unknown, expected: ProgramplanLifecycleCommand): ProgramplanLifecycleReply {
  const r = object(v, ['offeringId', 'command', 'lifecycle']);
  if (uuid(r.offeringId) !== expected.offeringId || r.command !== expected.command) bad();
  if (expected.command === 'delete') { if (r.lifecycle !== null) bad(); return { offeringId: expected.offeringId, command: 'delete', lifecycle: null }; }
  const lifecycle = parseProgramplanLifecycle(r.lifecycle);
  if (lifecycle.revision !== expected.expectedRevision + 1 || lifecycle.archived !== (expected.command === 'archive')) bad();
  return { offeringId: expected.offeringId, command: expected.command, lifecycle };
}
