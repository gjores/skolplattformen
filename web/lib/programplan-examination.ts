import { VOCATIONAL_GY25_CODES } from './programplan-profile.ts';

/** A school's dated review of the applicable national source, not a machine-verified exam catalogue. */
export type ProgramplanExamination = {
  model: 'vocational_exam' | 'diploma_work';
  appliesToStart: string;
  checkedOn: string;
  referenceUrl: string;
  referenceText: string;
};
const keys = ['model', 'appliesToStart', 'checkedOn', 'referenceUrl', 'referenceText'];
function invalid(): never { throw new TypeError('Ogiltigt underlag för examensform.'); }
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) invalid();
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) invalid();
  return value;
}
export function parseProgramplanExamination(value: unknown): ProgramplanExamination {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null || Object.getOwnPropertySymbols(value).length
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(d => d.get !== undefined || d.set !== undefined)
    || Object.getOwnPropertyNames(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) invalid();
  const r = value as Record<string, unknown>;
  if (r.model !== 'vocational_exam' && r.model !== 'diploma_work') invalid();
  if (typeof r.referenceText !== 'string' || !r.referenceText.trim() || r.referenceText !== r.referenceText.trim() || r.referenceText.length > 2000) invalid();
  if (typeof r.referenceUrl !== 'string' || r.referenceUrl.length > 1000 || r.referenceUrl !== r.referenceUrl.trim()) invalid();
  if (!/^https:\/\/(?:[a-z0-9-]+\.)*skolverket\.se(?:[/?#][^\s\\]*)?$/iu.test(r.referenceUrl) || Array.from(r.referenceUrl).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) invalid();
  let url: URL;
  try { url = new URL(r.referenceUrl); } catch { return invalid(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || !(url.hostname === 'skolverket.se' || url.hostname.endsWith('.skolverket.se'))) invalid();
  return { model: r.model, appliesToStart: date(r.appliesToStart), checkedOn: date(r.checkedOn), referenceUrl: r.referenceUrl, referenceText: r.referenceText };
}
/** National three-year cohort start; graduation year and individual transition cases are not inferred. */
export function requiresProgramplanExamination(programCode: string, startedOn: string | null): boolean {
  return VOCATIONAL_GY25_CODES.some(code => code === programCode) && startedOn !== null && startedOn >= '2028-07-02';
}
export function validProgramplanExamination(value: unknown, programCode: string, startedOn: string | null,
  today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())): boolean {
  if (!requiresProgramplanExamination(programCode, startedOn)) return false;
  try { const examination = parseProgramplanExamination(value); return examination.appliesToStart === startedOn && examination.checkedOn <= today; }
  catch { return false; }
}
export function examinationLabel(value?: ProgramplanExamination): string {
  return value?.model === 'vocational_exam' ? 'Yrkesprov' : 'Gymnasiearbete';
}
export const EXAMINATION_REVIEW_REQUIRED = 'Granska examensformen för den här elevkullen. Välj yrkesprov om ett tillämpligt prov finns hos Skolverket, annars gymnasiearbete. Spara valet med källa och kontrolldatum innan planen skickas till huvudmannen.';
