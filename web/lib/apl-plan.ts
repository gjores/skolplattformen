import { timplanTimeTotals } from './timplan-time.ts';
import { gymObject, isGymTimplanV2, gymArray, gymBoolean, gymInteger, gymRowKey, gymShape, gymUuid, parseGymTimplan, type GymTimplan } from './gym-timplan.ts';
import { isValidDate, currentSchoolYear } from './pupil-register-model.ts';
import { projectGymTimplanYear } from './planning-year-model.ts';
import { programplanProfile } from './programplan-profile.ts';

/** Planned GUT only. These objects never represent attendance, workplace hours or SS 12000 Placement. */
export const APL_CONTRACT_VERSION = 'structured_v1' as const;
export const APL_RULE_PROFILE = 'gy25_school_vocational_v1' as const;
export const APL_LIMITS = { periods: 100, contentsPerPeriod: 200, allocationsPerPeriod: 1200, allocations: 20000,
  wholeWeeks: 160, gutMinutesPerAllocation: 120000, periodName: 120, description: 2000, confirmations: 1000 } as const;
export type AplEducationForm = 'school_based' | 'apprenticeship' | 'unknown';
export type AplExtent = { basis: 'whole_weeks' | 'mixed_weeks' | 'unknown'; weeks: number | null; reviewed: boolean; reviewNote: string };
export type AplContent = { rowKey: string; description: string };
export type AplAllocation = { rowKey: string; termIndex: number; gutMinutes: number };
export type AplPeriod = { id: string; name: string; startsOn: string | null; endsOn: string | null; schoolYear: number | null;
  /** Preliminary intent only; absent preserves historical hashes. Never an exact date interval. */
  plannedTermIndex?: number; extent: AplExtent; contents: AplContent[]; allocations: AplAllocation[] };
export type AplPlan = { contractVersion: typeof APL_CONTRACT_VERSION; educationForm: AplEducationForm;
  classification: 'unreviewed' | 'complete'; periods: AplPeriod[] };
/** Constructed from the verified frozen catalog by the server, never accepted on a write request. */
export type AplProgram = { code: string; version: number; category: string; startDate: string | null; endDate: string | null;
  canceledDate: string | null; sourceSupported: boolean };
export type AplCopyReview = { id: string; sourcePlanId: string; sourceVersion: number; sourcePeriodId: string; sourcePeriodName: string;
  reason: 'missing_row' | 'inactive_term' | 'insufficient_total' | 'unverified_source'; contents: AplContent[]; allocations: AplAllocation[];
  resolution: null | { actorId: string; assignmentId: string; at: string; note: string } };
export type AplCopyReviewResolution = { id: string; note: string };
/** copyReview is server-owned immutable provenance; commands may resolve existing items, never replace or remove them. */
export type AplContext = { organizerId: string; plan: GymTimplan; program: AplProgram; copyReview: AplCopyReview[] };
export type AplConfirmation = { id: string; planId: string; unitId: string; actorId: string; assignmentId: string;
  actorName: string; at: string; revision: number; contentHash: string; comment: string };
export type AplReview = AplConfirmation & { timplanRevision: number; rectorConfirmationId: string };
export type AplRevisionScope = { revisionScope?: 'apl'; timplanRevision?: number; reviews?: AplReview[] };
export type AplReadRequest = { planId: string };
export type AplReadReply = AplRevisionScope & { contractVersion: typeof APL_CONTRACT_VERSION; planId: string; revision: number;
  organizerId: string; program: AplProgram; plan: AplPlan | null; copyReview: AplCopyReview[]; contentHash: string;
  confirmations: AplConfirmation[]; capabilities: { canSave: boolean; canConfirm: boolean; canReview?: boolean } };
type AplCommandIdentity = { contractVersion: typeof APL_CONTRACT_VERSION; commandId: string; planId: string; expectedRevision: number; revisionScope?: 'apl'; expectedTimplanRevision?: number };
export type AplSaveCommand = AplCommandIdentity & { action: 'save'; plan: AplPlan; copyReviewResolutions: AplCopyReviewResolution[] };
export type AplConfirmCommand = AplCommandIdentity & { action: 'confirm'; expectedContentHash: string; comment: string };
export type AplReviewCommand = AplCommandIdentity & { action: 'review'; expectedContentHash: string; comment: string };
export type AplCommand = AplSaveCommand | AplConfirmCommand | AplReviewCommand;
export type AplReceipt = { contractVersion: typeof APL_CONTRACT_VERSION; commandId: string; planId: string;
  action: AplCommand['action']; revision: number; changed: boolean; replayed: boolean; contentHash: string; confirmationId: string | null; reviewId?: string | null };
export type AplCommandReply = { receipt: AplReceipt; detail: AplReadReply };
/** Replaying a bare commandId is insufficient: actor/assignment and the exact command must match in the server. */
export type AplStatusRequest = { command: AplCommand };
export type AplStatusReply = { state: 'not_found'; result: null } | { state: 'completed'; result: AplCommandReply };
/** Private SQL transport, never exposed as a client write field. The entire basis is frozen with each completed receipt. */
export type AplFrozenBasis = { organizerId: string; gymTimplan: Record<string, unknown>; aplRevision?: number; copyReview: AplCopyReview[] };
export type AplSqlEnvelope<T> = { contractVersion: 'apl_sql_v1'; basis: AplFrozenBasis | null; result: T };
export type AplIssueCode = 'legacy' | 'unsupported_profile' | 'education_form_unknown' | 'apprenticeship_needs_review'
  | 'classification_unreviewed' | 'no_periods' | 'incomplete_period' | 'extent_needs_review' | 'weeks_exceed_calendar_bound'
  | 'minimum_weeks' | 'overlapping_periods' | 'school_year_mismatch' | 'period_before_start' | 'period_outside_plan'
  | 'spring_start_review' | 'unknown_content' | 'unresolved_content' | 'content_description_missing'
  | 'period_allocation_mismatch' | 'allocation_outside_period' | 'inactive_term' | 'allocation_without_total'
  | 'allocation_exceeds_total' | 'total_hours_incomplete' | 'copy_review_pending' | 'whole_week_capacity_conflict' | 'annual_apl_unallocated' | 'time_copy_review_pending';
export type AplIssue = { code: AplIssueCode; level: 'blocker' | 'review'; periodId: string | null; rowKey: string | null; message: string };
export type AplPeriodProjection = { id: string; declaredWholeWeeks: number | null; reviewedWholeWeeks: number | null;
  expectedGutMinutes: number | null; allocatedGutMinutes: number; isoWeekUpperBound: number | null; termIndices: number[] };
export type AplProjection = { state: 'legacy' | 'structured'; ruleProfile: typeof APL_RULE_PROFILE | null;
  declaredWholeWeeks: number | null; reviewedWholeWeeks: number | null; expectedGutMinutes: number | null;
  allocatedGutMinutes: number | null; totalMinutes: number | null; schoolMinutes: number | null;
  readyForConfirmation: boolean; periods: AplPeriodProjection[]; issues: AplIssue[] };

export class AplContractError extends TypeError {
  readonly code = 'invalid_apl_plan';
  readonly reason: string;
  constructor(reason = 'invalid_contract', message = 'APL-underlaget kunde inte kontrolleras.') {
    super(message); this.name = 'AplContractError'; this.reason = reason;
  }
}
function bad(reason?: string, message?: string): never { throw new AplContractError(reason, message); }
function guarded<T>(fn: () => T): T {
  try { return fn(); } catch (error) { if (error instanceof AplContractError) throw error; return bad(); }
}
function choice<T extends string>(value: unknown, values: readonly T[]): T {
  if (typeof value !== 'string' || !values.includes(value as T)) bad(); return value as T;
}
function text(value: unknown, maximum: number, allowEmpty = true): string {
  // Unicode code points match PostgreSQL char_length. Reject lone surrogates and controls before UTF-8 hashing.
  if (typeof value !== 'string' || Array.from(value).length > maximum || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(value)
    || value !== value.trim() || !allowEmpty && value.length === 0) bad();
  return value;
}
function date(value: unknown): string { if (!isValidDate(value)) bad(); return value; }
function nullableDate(value: unknown): string | null { return value === null ? null : date(value); }
function instant(value: unknown): string {
  const at = text(value, 24, false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) bad();
  return at;
}
function hash(value: unknown): string { if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(value)) bad(); return value; }
function unique<T>(values: T[], key: (value: T) => string): T[] {
  if (new Set(values.map(key)).size !== values.length) bad('duplicate'); return values;
}
function contract(value: unknown): typeof APL_CONTRACT_VERSION { return choice(value, [APL_CONTRACT_VERSION]); }
function parseExtent(value: unknown): AplExtent {
  const r = gymShape(value, ['basis', 'weeks', 'reviewed', 'reviewNote']);
  const basis = choice(r.basis, ['whole_weeks', 'mixed_weeks', 'unknown']), weeks = r.weeks === null ? null : gymInteger(r.weeks, APL_LIMITS.wholeWeeks, 1);
  const reviewed = gymBoolean(r.reviewed), reviewNote = text(r.reviewNote, APL_LIMITS.description);
  if (basis !== 'whole_weeks' && (weeks !== null || reviewed) || reviewed && (weeks === null || !reviewNote)) bad();
  return { basis, weeks, reviewed, reviewNote };
}
export function parseAplPlan(value: unknown): AplPlan {
  return guarded(() => {
    const r = gymShape(value, ['contractVersion', 'educationForm', 'classification', 'periods']);
    const periods = unique(gymArray(r.periods, APL_LIMITS.periods).map(value => {
      const hasTerm = value !== null && typeof value === 'object' && Object.hasOwn(value, 'plannedTermIndex');
      const p = gymShape(value, ['id', 'name', 'startsOn', 'endsOn', 'schoolYear', 'extent', 'contents', 'allocations', ...(hasTerm ? ['plannedTermIndex'] : [])]);
      const startsOn = nullableDate(p.startsOn), endsOn = nullableDate(p.endsOn);
      if (startsOn !== null && endsOn !== null && startsOn > endsOn) bad('invalid_period_dates');
      const schoolYear = p.schoolYear === null ? null : gymInteger(p.schoolYear, 2100, 2000);
      const contents = unique(gymArray(p.contents, APL_LIMITS.contentsPerPeriod).map(value => {
        const c = gymShape(value, ['rowKey', 'description']); return { rowKey: gymRowKey(c.rowKey), description: text(c.description, APL_LIMITS.description) };
      }), c => c.rowKey);
      const allocations = unique(gymArray(p.allocations, APL_LIMITS.allocationsPerPeriod).map(value => {
        const a = gymShape(value, ['rowKey', 'termIndex', 'gutMinutes']);
        const rowKey = gymRowKey(a.rowKey);
        if (!contents.some(c => c.rowKey === rowKey)) bad('allocation_without_content');
        return { rowKey, termIndex: gymInteger(a.termIndex, 5), gutMinutes: gymInteger(a.gutMinutes, APL_LIMITS.gutMinutesPerAllocation) };
      }), a => `${a.rowKey}|${a.termIndex}`);
      return { id: gymUuid(p.id), name: text(p.name, APL_LIMITS.periodName), startsOn, endsOn, schoolYear,
        extent: parseExtent(p.extent), contents, allocations, ...(hasTerm ? { plannedTermIndex: gymInteger(p.plannedTermIndex, 5) } : {}) };
    }), p => p.id);
    if (periods.reduce((sum, p) => sum + p.allocations.length, 0) > APL_LIMITS.allocations) bad();
    return { contractVersion: contract(r.contractVersion), educationForm: choice(r.educationForm, ['school_based', 'apprenticeship', 'unknown']),
      classification: choice(r.classification, ['unreviewed', 'complete']), periods };
  });
}
export function parseAplProgram(value: unknown): AplProgram {
  return guarded(() => {
    const p = gymShape(value, ['code', 'version', 'category', 'startDate', 'endDate', 'canceledDate', 'sourceSupported']);
    const program = { code: text(p.code, 96, false), version: gymInteger(p.version, 999999, 1), category: text(p.category, 96, false),
      startDate: nullableDate(p.startDate), endDate: nullableDate(p.endDate), canceledDate: nullableDate(p.canceledDate), sourceSupported: gymBoolean(p.sourceSupported) };
    if (program.startDate && program.endDate && program.startDate > program.endDate) bad();
    return program;
  });
}
export function parseAplContext(value: unknown): AplContext {
  return guarded(() => {
    const r = gymShape(value, ['organizerId', 'plan', 'program', 'copyReview']);
    // Validate descriptors before accessing the id, just as in all public wire parsers.
    const v2 = Object.hasOwn(gymObject(r.plan), 'timeModel');
    const planRecord = gymShape(r.plan, ['id', 'offeringId', 'unitId', 'schoolName', 'version', 'revision', 'status', 'source', 'currentSource',
      'rows', ...(v2 ? ['timeModel', 'timeRows', 'timeCopyReview'] : ['hours']), 'canPlan', 'archived', 'sourceChanged', 'series', 'nameAtCreation']);
    const plan = parseGymTimplan(r.plan, gymUuid(planRecord.id));
    const program = parseAplProgram(r.program);
    if (program.code !== plan.source.education.programCode) bad();
    return { organizerId: gymUuid(r.organizerId), plan, program, copyReview: parseAplCopyReview(r.copyReview) };
  });
}

export function parseAplCopyReview(value: unknown): AplCopyReview[] {
  return guarded(() => unique(gymArray(value, 1000).map(value => {
    const r = gymShape(value, ['id', 'sourcePlanId', 'sourceVersion', 'sourcePeriodId', 'sourcePeriodName', 'reason', 'contents', 'allocations', 'resolution']);
    // Reuse the exact content/allocation validation, without demanding that old row keys exist in the new source.
    const old = parseAplPlan({ contractVersion: APL_CONTRACT_VERSION, educationForm: 'unknown', classification: 'unreviewed', periods: [{
      id: r.sourcePeriodId, name: r.sourcePeriodName, startsOn: null, endsOn: null, schoolYear: null,
      extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' }, contents: r.contents, allocations: r.allocations,
    }] }).periods[0];
    let resolution: AplCopyReview['resolution'] = null;
    if (r.resolution !== null) {
      const v = gymShape(r.resolution, ['actorId', 'assignmentId', 'at', 'note']);
      resolution = { actorId: gymUuid(v.actorId), assignmentId: gymUuid(v.assignmentId), at: instant(v.at), note: text(v.note, 2000, false) };
    }
    if (!old.contents.length && !old.allocations.length) bad();
    return { id: gymUuid(r.id), sourcePlanId: gymUuid(r.sourcePlanId), sourceVersion: gymInteger(r.sourceVersion, 2147483647, 1),
      sourcePeriodId: old.id, sourcePeriodName: old.name, reason: choice(r.reason, ['missing_row', 'inactive_term', 'insufficient_total', 'unverified_source']),
      contents: old.contents, allocations: old.allocations, resolution };
  }), r => r.id));
}
export function parseAplCopyReviewResolutions(value: unknown): AplCopyReviewResolution[] {
  return guarded(() => unique(gymArray(value, 1000).map(value => {
    const r = gymShape(value, ['id', 'note']); return { id: gymUuid(r.id), note: text(r.note, 2000, false) };
  }), r => r.id));
}
/** SQL checks the same existing pending identities under the common plan lock before writing server-owned resolution metadata. */
export function validateAplCopyReviewResolutions(value: AplCopyReview[], resolutions: AplCopyReviewResolution[]): void {
  const byId = new Map(parseAplCopyReview(value).map(r => [r.id, r]));
  for (const resolution of parseAplCopyReviewResolutions(resolutions)) {
    const item = byId.get(resolution.id);
    if (!item || item.resolution !== null) bad('invalid_copy_review_resolution', 'Granskningspunkten finns inte eller är redan hanterad. Läs in APL-underlaget igen.');
  }
}

/** An upper bound only: ISO weeks touched by the inclusive interval, never a full-APL-week conversion. */
export function aplIsoWeekUpperBound(startsOn: string, endsOn: string): number {
  date(startsOn); date(endsOn); if (startsOn > endsOn) bad('invalid_period_dates');
  return isoMondayIndex(endsOn) - isoMondayIndex(startsOn) + 1;
}
function isoMondayIndex(value: string): number {
  const instant = new Date(`${value}T00:00:00.000Z`);
  return (instant.getTime() - ((instant.getUTCDay() + 6) % 7) * 86400000 + 3 * 86400000) / 604800000;
}
/** Necessary capacity test only. A touched ISO week can support at most one declared whole week for this planning group. */
function wholeWeekCapacityFits(periods: AplPeriod[]): boolean {
  const intervals = periods.filter(p => p.startsOn !== null && p.endsOn !== null && p.extent.basis === 'whole_weeks' && p.extent.weeks !== null)
    .map(p => ({ first: isoMondayIndex(p.startsOn!), last: isoMondayIndex(p.endsOn!), count: p.extent.weeks! }))
    .sort((a, b) => a.last - b.last || a.first - b.first);
  // Earliest available week, earliest deadline first, also catches overloaded subsets hidden by a long other interval.
  // Work is bounded by periods * declared weeks, even for invalid dates outside the three-year projection.
  const used = new Set<number>();
  for (const interval of intervals) {
    let candidate = interval.first;
    for (let i = 0; i < interval.count; i++) {
      while (used.has(candidate)) candidate++;
      if (candidate > interval.last) return false;
      used.add(candidate++);
    }
  }
  return true;
}
export function splitAplMinutes(minutes: number): { hours: number; minutes: number } {
  return guarded(() => { gymInteger(minutes); return { hours: Math.floor(minutes / 60), minutes: minutes % 60 }; });
}
function supportedProfile(ctx: AplContext, plan: AplPlan | null): boolean {
  const { program, plan: timetable } = ctx, started = timetable.source.startedOn, profile = programplanProfile(program);
  return plan?.educationForm === 'school_based' && program.sourceSupported && profile?.vocational === true
    && aplSourceProfileSupported(program, started);
}
/** Profile/date part of SQL source_blockers; combine with independently verified source readiness.
 * The input sourceSupported flag is deliberately not used to establish itself. */
export function aplSourceProfileSupported(value: AplProgram, startedOn: string | null): boolean {
  const program = parseAplProgram(value), started = nullableDate(startedOn), profile = programplanProfile(program);
  return profile !== null && started !== null && started >= '2025-07-01' && program.startDate !== null
    && started >= program.startDate && (program.endDate === null || started <= program.endDate)
    && (program.canceledDate === null || started < program.canceledDate)
    && (!profile.vocational || started < '2028-07-02');
}
function allocationIssues(ctx: AplContext, plan: AplPlan): AplIssue[] {
  const issues: AplIssue[] = [], byKey = new Map(ctx.plan.rows.map(row => [row.key, row]));
  const totals = new Map<string, { rowKey: string; termIndex: number; minutes: number }>();
  for (const period of plan.periods) for (const allocation of period.allocations) {
    const row = byKey.get(allocation.rowKey), { termIndex, rowKey } = allocation;
    const add = (code: AplIssueCode, message: string) => issues.push({ code, message, level: 'blocker', periodId: period.id, rowKey });
    if (!row) { add('unknown_content', 'Tiden avser innehåll som saknas i den här frysta programkällan. Fördelningen behöver rättas.'); continue; }
    if (row.pointTerms[termIndex] === 0) { add('inactive_term', 'APL-tid får bara fördelas på en termin där innehållet ingår.'); continue; }
    const annual = isGymTimplanV2(ctx.plan);
    const total = isGymTimplanV2(ctx.plan) ? ctx.plan.timeRows[rowKey].annualAplMinutes[Math.floor(termIndex / 2)] : ctx.plan.hours[rowKey][termIndex];
    if (total === null) add('allocation_without_total', annual ? 'Ange först års-APL för innehållet och årskursen.' : 'Fördela först totaltimmarna i timplanen. APL ingår i dessa timmar.');
    const cell = `${rowKey}|${annual ? Math.floor(termIndex / 2) : termIndex}`, previous = totals.get(cell)?.minutes ?? 0;
    totals.set(cell, { rowKey, termIndex, minutes: previous + allocation.gutMinutes });
  }
  for (const cell of totals.values()) {
    const total = isGymTimplanV2(ctx.plan) ? ctx.plan.timeRows[cell.rowKey].annualAplMinutes[Math.floor(cell.termIndex / 2)] : ctx.plan.hours[cell.rowKey][cell.termIndex];
    if (total !== null && cell.minutes > total * (isGymTimplanV2(ctx.plan) ? 1 : 60)) issues.push({ code: 'allocation_exceeds_total', level: 'blocker', periodId: null,
      rowKey: cell.rowKey, message: isGymTimplanV2(ctx.plan) ? 'Periodernas APL-tid överstiger angiven års-APL.' : 'APL-andelen överstiger sparad total tid. Justera APL-fördelningen eller totaltimmarna innan du sparar.' });
  }
  return issues;
}
/** Used for APL writes and again after a proposed timetable row change, under the same DB lock. */
export function validateAplAllocationWrite(context: AplContext, value: AplPlan): void {
  const ctx = parseAplContext(context), plan = parseAplPlan(value), knownRows = new Set(ctx.plan.rows.map(row => row.key));
  if (plan.periods.some(period => period.contents.some(content => !knownRows.has(content.rowKey))))
    bad('unknown_content', 'Innehållskopplingen saknas i den här frysta programkällan. Välj befintligt innehåll innan du sparar.');
  const first = allocationIssues(ctx, plan)[0];
  if (first) bad(first.code, first.message);
}

export function projectAplPlan(context: AplContext, value: AplPlan | null): AplProjection {
  const ctx = parseAplContext(context), plan = value === null ? null : parseAplPlan(value);
  const timetable = ctx.plan, annual = isGymTimplanV2(timetable);
  const annualTotals = isGymTimplanV2(timetable) ? timplanTimeTotals(timetable) : null;
  const activeTotals = timetable.rows.flatMap(row => row.pointTerms.flatMap((points, i) => points ? [isGymTimplanV2(timetable) ? timetable.timeRows[row.key].schoolMinutes[i] : timetable.hours[row.key][i]] : []));
  const totalMinutes = annualTotals ? (annualTotals.complete ? annualTotals.totalMinutes : null)
    : activeTotals.some(n => n === null) ? null : activeTotals.reduce<number>((sum, n) => sum + (n ?? 0) * 60, 0);
  const issues: AplIssue[] = [], add = (code: AplIssueCode, message: string, periodId: string | null = null, rowKey: string | null = null,
    level: AplIssue['level'] = 'blocker') => { issues.push({ code, level, periodId, rowKey, message }); };
  if (plan === null) return { state: 'legacy', ruleProfile: null, declaredWholeWeeks: null, reviewedWholeWeeks: null,
    expectedGutMinutes: null, allocatedGutMinutes: null, totalMinutes, schoolMinutes: null, readyForConfirmation: false, periods: [],
    issues: [{ code: 'legacy', level: 'blocker', periodId: null, rowKey: null, message: 'Planen saknar strukturerat APL-underlag. Befintliga timmar har ännu ingen granskad APL-fördelning.' }] };
  const supported = supportedProfile(ctx, plan);
  if (plan.educationForm === 'unknown') add('education_form_unknown', 'Välj utbildningsform innan omfattningen granskas.');
  else if (plan.educationForm === 'apprenticeship') add('apprenticeship_needs_review', 'Lärlingsutbildning kräver en annan beräkningsgrund som inte stöds i denna etapp.');
  else if (!supported) add('unsupported_profile', 'APL-reglerna är inte verifierade för den här frysta programkällan och elevkullen.');
  if (plan.classification !== 'complete') add('classification_unreviewed', 'Granska hur den befintliga totaltiden fördelas mellan APL och skolförlagd undervisning.');
  if (ctx.copyReview.some(item => item.resolution === null)) add('copy_review_pending',
    'Kopieringen innehåller tid eller innehåll som inte kunde överföras till den nya källan. Granska varje bevarad punkt och dokumentera hur den har hanterats.');
  if (!plan.periods.length) add('no_periods', 'Lägg till planerade APL-perioder.');
  if (activeTotals.some(n => n === null)) add('total_hours_incomplete', 'Timplanen saknar totaltimmar i ett eller flera aktiva terminsfält.');
  issues.push(...allocationIssues(ctx, plan));
  const started = ctx.plan.source.startedOn;
  let projection: ReturnType<typeof projectGymTimplanYear> | null = null;
  if (started !== null) {
    const year = currentSchoolYear(started);
    if (year >= 2000 && year <= 2100) projection = projectGymTimplanYear(year, ctx.plan,
      [0, 1, 2, 3, 4, 5].map(i => timetable.rows.reduce((sum, row) => sum + (isGymTimplanV2(timetable) ? timetable.timeRows[row.key].schoolMinutes[i] ?? 0 : timetable.hours[row.key][i] ?? 0), 0)));
  }
  if (projection?.reviewTermIndices.length) add('spring_start_review',
    'Utbildningen börjar på våren. Granska förläggningen mot det faktiska startdatumet; terminskolumnerna är visningsintervall.', null, null, 'review');
  const byKey = new Map(ctx.plan.rows.map(row => [row.key, row]));
  let overlaps = false;
  const dated = plan.periods.filter(p => p.startsOn !== null && p.endsOn !== null).sort((a, b) => ordinal(a.startsOn!, b.startsOn!));
  for (let i = 0; i < dated.length; i++) for (let j = i + 1; j < dated.length && dated[j].startsOn! <= dated[i].endsOn!; j++) {
    overlaps = true; add('overlapping_periods', 'Perioderna överlappar för samma planeringsgrupp. Omfattningen får inte räknas dubbelt.', dated[j].id);
  }
  const periods = plan.periods.map(period => {
    const { extent } = period, completeDates = period.startsOn !== null && period.endsOn !== null;
    const periodAdd = (code: AplIssueCode, message: string, rowKey: string | null = null) => add(code, message, period.id, rowKey);
    if (!period.name || !completeDates || period.schoolYear === null || !period.contents.length) periodAdd('incomplete_period', 'Fyll i periodens namn, datum, läsår och innehåll.');
    if (extent.basis !== 'whole_weeks' || extent.weeks === null || !extent.reviewed) periodAdd('extent_needs_review',
      'Omfattningen behöver granskas. Delveckor och osäkert underlag räknas inte automatiskt om till GUT.');
    const isoWeekUpperBound = completeDates ? aplIsoWeekUpperBound(period.startsOn!, period.endsOn!) : null;
    if (extent.weeks !== null && isoWeekUpperBound !== null && extent.weeks > isoWeekUpperBound)
      periodAdd('weeks_exceed_calendar_bound', 'Uppgivna hela veckor överstiger antalet berörda kalenderveckor. Kontrollera datum och omfattning.');
    if (period.startsOn !== null && period.schoolYear !== null && currentSchoolYear(period.startsOn) !== period.schoolYear)
      periodAdd('school_year_mismatch', 'Periodens första datum stämmer inte med valt läsår.');
    if (started !== null && period.startsOn !== null && period.startsOn < started)
      periodAdd('period_before_start', 'Perioden börjar före utbildningens frysta startdatum.');
    const terms = completeDates && projection ? projection.terms.filter(t => period.startsOn! < t.endsBefore && period.endsOn! >= t.startsOn) : [];
    if (completeDates && (!projection || period.startsOn! < projection.terms[0].startsOn || period.endsOn! >= projection.terms[5].endsBefore))
      periodAdd('period_outside_plan', 'Perioden ligger helt eller delvis utanför timplanens sex terminsintervall.');
    for (const content of period.contents) {
      const row = byKey.get(content.rowKey);
      if (!row) periodAdd('unknown_content', 'Innehållskopplingen saknas i den här frysta programkällan och behöver granskas.', content.rowKey);
      else if (row.rowKind !== 'fixed' || row.key.startsWith('meta:')) periodAdd('unresolved_content', 'Kopplingen är ett valbart block eller annat ospecificerat innehåll, inte en verifierad ämnesnivå.', content.rowKey);
      if (!content.description) periodAdd('content_description_missing', 'Beskriv vilken del av ämnesnivån som planeras på arbetsplatsen.', content.rowKey);
    }
    for (const allocation of period.allocations) if (completeDates && !terms.some(t => t.index === allocation.termIndex))
      periodAdd('allocation_outside_period', 'Tidsfördelningen avser en termin utanför periodens datum. Fördela tiden uttryckligt mellan berörda terminer.', allocation.rowKey);
    const declaredWholeWeeks = extent.basis === 'whole_weeks' ? extent.weeks : null;
    const reviewedWholeWeeks = supported && declaredWholeWeeks !== null ? extent.reviewed ? declaredWholeWeeks : 0 : null;
    const expectedGutMinutes = supported && extent.reviewed && declaredWholeWeeks !== null ? declaredWholeWeeks * 23 * 60 : null;
    const allocatedGutMinutes = period.allocations.reduce((sum, a) => sum + a.gutMinutes, 0);
    if (expectedGutMinutes !== null && expectedGutMinutes !== allocatedGutMinutes)
      periodAdd('period_allocation_mismatch', 'Fördela periodens hela GUT-omfattning exakt en gång mellan innehåll och terminer.');
    return { id: period.id, declaredWholeWeeks, reviewedWholeWeeks, expectedGutMinutes, allocatedGutMinutes, isoWeekUpperBound, termIndices: terms.map(t => t.index) };
  });
  const sumKnown = (key: 'declaredWholeWeeks' | 'reviewedWholeWeeks' | 'expectedGutMinutes') => periods.some(p => p[key] === null)
    ? null : periods.reduce((sum, p) => sum + (p[key] ?? 0), 0);
  const declaredWholeWeeks = sumKnown('declaredWholeWeeks');
  const capacityConflict = !wholeWeekCapacityFits(plan.periods);
  if (capacityConflict) add('whole_week_capacity_conflict', 'Periodernas uppgivna hela APL-veckor ryms inte i olika berörda kalenderveckor. Kontrollera förläggning och omfattning.');
  const reviewedWholeWeeks = supported && !overlaps && !capacityConflict ? sumKnown('reviewedWholeWeeks') : null;
  const expectedGutMinutes = supported && !overlaps && !capacityConflict ? sumKnown('expectedGutMinutes') : null;
  if (supported && reviewedWholeWeeks !== null && reviewedWholeWeeks < 15) add('minimum_weeks', 'Minst 15 hela granskade APL-veckor behöver planeras för den här utbildningsformen.');
  if (isGymTimplanV2(timetable)) {
    if (timetable.timeCopyReview.some(review => review.resolution === null)) add('time_copy_review_pending', 'Kopieringen har tidsrader som behöver granskas. Skapa en plan med verifierbar källa innan beslut.');
    if (timetable.rows.some(row => [0, 1, 2].some(year => (row.pointTerms[year * 2] > 0 || row.pointTerms[year * 2 + 1] > 0)
      && timetable.timeRows[row.key].annualAplMinutes[year] !== plan.periods.reduce((sum, p) => sum + p.allocations.filter(a => a.rowKey === row.key && Math.floor(a.termIndex / 2) === year).reduce((n, a) => n + a.gutMinutes, 0), 0))))
      add('annual_apl_unallocated', 'Fördela all angiven års-APL på perioder innan förläggningen bekräftas.');
  }
  const allocatedGutMinutes = periods.reduce((sum, p) => sum + p.allocatedGutMinutes, 0), readyForConfirmation = !issues.some(i => i.level === 'blocker');
  return { state: 'structured', ruleProfile: supported ? APL_RULE_PROFILE : null, declaredWholeWeeks, reviewedWholeWeeks, expectedGutMinutes,
    allocatedGutMinutes, totalMinutes, schoolMinutes: annual && annualTotals ? (annualTotals.missingSchoolCells ? null : annualTotals.schoolMinutes) : readyForConfirmation && totalMinutes !== null ? totalMinutes - allocatedGutMinutes : null,
    readyForConfirmation, periods, issues };
}

// Canonical values are positional arrays. There is deliberately no object-key ordering or JSON whitespace dependency.
export type AplCanonicalValue = null | boolean | number | string | AplCanonicalValue[];
const encoder = new TextEncoder();
function ordinal(a: string, b: string): number {
  const left = encoder.encode(a), right = encoder.encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) if (left[i] !== right[i]) return left[i] - right[i];
  return left.length - right.length;
}
/** n=null, t/f=boolean, i<decimal>;, s<UTF-8-byte-count>:<raw string>, a<length>:<concatenated values>. */
export function aplCanonicalSerialize(value: AplCanonicalValue): string {
  if (value === null) return 'n';
  if (typeof value === 'boolean') return value ? 't' : 'f';
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) bad(); return `i${value};`; }
  if (typeof value === 'string') {
    if (/[\p{Cs}]/u.test(value)) bad();
    return `s${encoder.encode(value).length}:${value}`;
  }
  if (Array.isArray(value)) return guarded(() => `a${value.length}:${gymArray(value, 200000).map(v => aplCanonicalSerialize(v as AplCanonicalValue)).join('')}`);
  return bad();
}
export async function aplHashCanonical(value: AplCanonicalValue): Promise<string> {
  const bytes = encoder.encode(aplCanonicalSerialize(value)), digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`;
}
export function aplPlanCanonicalPayload(value: AplPlan | null): AplCanonicalValue {
  if (value === null) return null;
  const plan = parseAplPlan(value);
  return [plan.contractVersion, plan.educationForm, plan.classification,
    [...plan.periods].sort((a, b) => ordinal(a.id, b.id)).map(p => [p.id, p.name, p.startsOn, p.endsOn, p.schoolYear,
      [p.extent.basis, p.extent.weeks, p.extent.reviewed, p.extent.reviewNote],
      [...p.contents].sort((a, b) => ordinal(a.rowKey, b.rowKey)).map(c => [c.rowKey, c.description]),
      [...p.allocations].sort((a, b) => ordinal(a.rowKey, b.rowKey) || a.termIndex - b.termIndex).map(a => [a.rowKey, a.termIndex, a.gutMinutes]),
      ...(p.plannedTermIndex === undefined ? [] : [['planned_term_v1', p.plannedTermIndex]])])];
}
/** Frozen identities/content only; plan/source/series administrative revisions, statuses and display names are excluded. */
export function aplContentHashPayload(context: AplContext, value: AplPlan | null): AplCanonicalValue {
  const ctx = parseAplContext(context), { plan, program } = ctx, source = plan.source;
  return [isGymTimplanV2(plan) ? 'apl_content_v2' : 'apl_content_v1', [ctx.organizerId, plan.unitId, plan.offeringId, plan.id, plan.series!.id, plan.version],
    [source.planId, source.version, source.catalogId, source.startedOn, source.education.programCode, source.education.orientationCode,
      program.version, program.category, program.startDate, program.endDate, program.canceledDate, program.sourceSupported],
    [...plan.rows].sort((a, b) => ordinal(a.key, b.key)).map(row => [row.key, row.points, row.part, row.rowKind, [...row.pointTerms], ...(isGymTimplanV2(plan) ? [[...plan.timeRows[row.key].schoolMinutes], [...plan.timeRows[row.key].annualAplMinutes]] : [[...plan.hours[row.key]]])]),
    aplPlanCanonicalPayload(value),
    [...ctx.copyReview].sort((a, b) => ordinal(a.id, b.id)).map(r => [r.id, r.sourcePlanId, r.sourceVersion, r.sourcePeriodId, r.sourcePeriodName, r.reason,
      [...r.contents].sort((a, b) => ordinal(a.rowKey, b.rowKey)).map(c => [c.rowKey, c.description]),
      [...r.allocations].sort((a, b) => ordinal(a.rowKey, b.rowKey) || a.termIndex - b.termIndex).map(a => [a.rowKey, a.termIndex, a.gutMinutes]),
      r.resolution === null ? null : [r.resolution.actorId, r.resolution.assignmentId, r.resolution.at, r.resolution.note]]),
    ...(isGymTimplanV2(plan) ? [plan.timeCopyReview.map(r => [r.id, r.contractVersion, r.sourcePlanId, r.sourceVersion, r.rowKey, r.reason, [...r.row.schoolMinutes], [...r.row.annualAplMinutes], r.resolution === null ? null : [r.resolution.actorId, r.resolution.assignmentId, r.resolution.at, r.resolution.note]])] : [])];
}
export async function aplContentHash(context: AplContext, value: AplPlan | null): Promise<string> {
  return aplHashCanonical(aplContentHashPayload(context, value));
}
export function aplMutationEffect(previous: AplPlan | null, next: AplPlan, action: 'save' | 'confirm', resolutions: AplCopyReviewResolution[] = []):
  { changed: boolean; revisionDelta: 0 | 1; auditAction: 'apl_plan_unchanged' | 'apl_plan_saved' | 'apl_placement_confirmed' } {
  choice(action, ['save', 'confirm']); parseAplPlan(next);
  if (action === 'confirm') return { changed: true, revisionDelta: 1, auditAction: 'apl_placement_confirmed' };
  const changed = parseAplCopyReviewResolutions(resolutions).length > 0
    || aplCanonicalSerialize(aplPlanCanonicalPayload(previous)) !== aplCanonicalSerialize(aplPlanCanonicalPayload(next));
  return { changed, revisionDelta: changed ? 1 : 0, auditAction: changed ? 'apl_plan_saved' : 'apl_plan_unchanged' };
}
export function parseAplConfirmation(value: unknown): AplConfirmation {
  return guarded(() => {
    const r = gymShape(value, ['id', 'planId', 'unitId', 'actorId', 'assignmentId', 'actorName', 'at', 'revision', 'contentHash', 'comment']);
    const at = instant(r.at);
    return { id: gymUuid(r.id), planId: gymUuid(r.planId), unitId: gymUuid(r.unitId), actorId: gymUuid(r.actorId), assignmentId: gymUuid(r.assignmentId),
      actorName: text(r.actorName, 200, false), at, revision: gymInteger(r.revision), contentHash: hash(r.contentHash), comment: text(r.comment, 2000) };
  });
}
export async function aplConfirmationCurrent(context: AplContext, plan: AplPlan | null, confirmation: AplConfirmation | null): Promise<boolean> {
  const ctx = parseAplContext(context);
  if (confirmation === null || plan === null) return false;
  const event = parseAplConfirmation(confirmation);
  return event.planId === ctx.plan.id && event.unitId === ctx.plan.unitId && event.revision <= ctx.plan.revision
    && event.contentHash === await aplContentHash(ctx, plan);
}
export function parseAplReadRequest(value: unknown): AplReadRequest {
  return guarded(() => ({ planId: gymUuid(gymShape(value, ['planId']).planId) }));
}
export function parseAplCommand(value: unknown): AplCommand {
  return guarded(() => {
    // Strict descriptors before reading the discriminant; no user-controlled role, hash proof or actor field.
    const descriptor = Object.getOwnPropertyDescriptor(value ?? {}, 'action');
    if (!descriptor || descriptor.get || descriptor.set) bad();
    const action = choice(descriptor.value, ['save', 'confirm', 'review']);
    const separated = Object.hasOwn(gymObject(value), 'revisionScope');
    if (action === 'review' && !separated) bad();
    const r = gymShape(value, ['contractVersion', 'action', 'commandId', 'planId', 'expectedRevision', ...(separated ? ['revisionScope', 'expectedTimplanRevision'] : []), ...(action === 'save' ? ['plan', 'copyReviewResolutions'] : ['expectedContentHash', 'comment'])]);
    const identity = { contractVersion: contract(r.contractVersion), commandId: gymUuid(r.commandId), planId: gymUuid(r.planId), expectedRevision: gymInteger(r.expectedRevision, 2147483646), ...(separated ? { revisionScope: choice(r.revisionScope, ['apl'] as const), expectedTimplanRevision: gymInteger(r.expectedTimplanRevision, 2147483646) } : {}) };
    return action === 'save' ? { ...identity, action, plan: parseAplPlan(r.plan), copyReviewResolutions: parseAplCopyReviewResolutions(r.copyReviewResolutions) }
      : { ...identity, action, expectedContentHash: hash(r.expectedContentHash), comment: text(r.comment, 2000, false) };
  });
}
export function parseAplReadReply(value: unknown, expected: AplReadRequest): AplReadReply {
  return guarded(() => {
    const separated = Object.hasOwn(gymObject(value), 'revisionScope');
    const r = gymShape(value, ['contractVersion', 'planId', 'revision', 'organizerId', 'program', 'plan', 'copyReview', 'contentHash', 'confirmations', 'capabilities', ...(separated ? ['revisionScope', 'timplanRevision', 'reviews'] : [])]);
    const planId = gymUuid(r.planId), revision = gymInteger(r.revision), plan = r.plan === null ? null : parseAplPlan(r.plan);
    if (planId !== parseAplReadRequest(expected).planId) bad();
    const confirmations = unique(gymArray(r.confirmations, APL_LIMITS.confirmations).map(parseAplConfirmation), event => event.id);
    if (plan === null && confirmations.length || confirmations.some(event => event.planId !== planId || event.revision > revision)
      || new Set(confirmations.map(event => event.revision)).size !== confirmations.length
      || confirmations.some((event, i) => i > 0 && event.revision <= confirmations[i - 1].revision)
      || new Set(confirmations.map(event => event.unitId)).size > 1) bad();
    const caps = gymShape(r.capabilities, ['canSave', 'canConfirm', ...(separated ? ['canReview'] : [])]), copyReview = parseAplCopyReview(r.copyReview);
    if (plan === null && copyReview.length) bad();
    const reviews = separated ? unique(gymArray(r.reviews, APL_LIMITS.confirmations).map(value => {
      const { timplanRevision, rectorConfirmationId, ...event } = gymShape(value, ['id', 'planId', 'unitId', 'actorId', 'assignmentId', 'actorName', 'at', 'revision', 'contentHash', 'comment', 'timplanRevision', 'rectorConfirmationId']);
      return { ...parseAplConfirmation(event), timplanRevision: gymInteger(timplanRevision), rectorConfirmationId: gymUuid(rectorConfirmationId) };
    }), event => event.id) : undefined;
    if (reviews?.some((event, i) => event.planId !== planId || event.revision > revision || i > 0 && event.revision <= reviews[i - 1].revision
      || !confirmations.some(c => c.id === event.rectorConfirmationId && c.contentHash === event.contentHash && c.revision < event.revision && c.unitId === event.unitId))) bad();
    return { contractVersion: contract(r.contractVersion), planId, revision, ...(separated ? { revisionScope: choice(r.revisionScope, ['apl'] as const), timplanRevision: gymInteger(r.timplanRevision), reviews } : {}), organizerId: gymUuid(r.organizerId), program: parseAplProgram(r.program), plan, copyReview, contentHash: hash(r.contentHash), confirmations,
      capabilities: { canSave: gymBoolean(caps.canSave), canConfirm: gymBoolean(caps.canConfirm), ...(separated ? { canReview: gymBoolean(caps.canReview) } : {}) } };
  });
}
export function parseAplCommandReply(value: unknown, expected: AplCommand): AplCommandReply {
  return guarded(() => {
    const input = parseAplCommand(expected), r = gymShape(value, ['receipt', 'detail']);
    const v = gymShape(r.receipt, ['contractVersion', 'commandId', 'planId', 'action', 'revision', 'changed', 'replayed', 'contentHash', 'confirmationId', ...(input.revisionScope === 'apl' ? ['reviewId'] : [])]);
    const receipt: AplReceipt = { contractVersion: contract(v.contractVersion), commandId: gymUuid(v.commandId), planId: gymUuid(v.planId),
      action: choice(v.action, ['save', 'confirm', 'review']), revision: gymInteger(v.revision), changed: gymBoolean(v.changed), replayed: gymBoolean(v.replayed),
      contentHash: hash(v.contentHash), confirmationId: v.confirmationId === null ? null : gymUuid(v.confirmationId), ...(input.revisionScope === 'apl' ? { reviewId: v.reviewId === null ? null : gymUuid(v.reviewId) } : {}) };
    if (receipt.commandId !== input.commandId || receipt.planId !== input.planId || receipt.action !== input.action
      || receipt.revision !== input.expectedRevision + (receipt.changed ? 1 : 0)) bad();
    const detail = parseAplReadReply(r.detail, { planId: input.planId });
    if (detail.revisionScope !== input.revisionScope || input.revisionScope === 'apl' && detail.timplanRevision !== input.expectedTimplanRevision) bad();
    if (input.action !== 'review' && receipt.reviewId != null) bad();
    if (detail.plan === null || detail.revision !== receipt.revision || detail.contentHash !== receipt.contentHash) bad();
    if (input.action === 'save') {
      if (receipt.confirmationId !== null || detail.confirmations.some(event => event.revision > input.expectedRevision)
        || aplCanonicalSerialize(aplPlanCanonicalPayload(detail.plan)) !== aplCanonicalSerialize(aplPlanCanonicalPayload(input.plan))) bad();
      for (const resolution of input.copyReviewResolutions) {
        if (!receipt.changed || detail.copyReview.find(r => r.id === resolution.id)?.resolution?.note !== resolution.note) bad();
      }
    } else if (input.action === 'review') {
      const event = detail.reviews?.at(-1);
      if (!receipt.changed || receipt.confirmationId !== null || !receipt.reviewId || !event || event.id !== receipt.reviewId
        || event.revision !== receipt.revision || event.contentHash !== receipt.contentHash || receipt.contentHash !== input.expectedContentHash
        || event.comment !== input.comment || event.timplanRevision !== input.expectedTimplanRevision) bad();
    } else {
      const event = detail.confirmations.at(-1);
      if (!receipt.changed || receipt.confirmationId === null || receipt.contentHash !== input.expectedContentHash
        || !event || event.id !== receipt.confirmationId || event.revision !== receipt.revision || event.contentHash !== receipt.contentHash || event.comment !== input.comment) bad();
    }
    return { receipt, detail };
  });
}
export function parseAplStatusRequest(value: unknown): AplStatusRequest {
  return guarded(() => ({ command: parseAplCommand(gymShape(value, ['command']).command) }));
}
export function parseAplStatusReply(value: unknown, expected: AplStatusRequest): AplStatusReply {
  return guarded(() => {
    const input = parseAplStatusRequest(expected), r = gymShape(value, ['state', 'result']);
    const state = choice(r.state, ['not_found', 'completed']);
    if (state === 'not_found') { if (r.result !== null) bad(); return { state, result: null }; }
    const result = parseAplCommandReply(r.result, input.command);
    if (!result.receipt.replayed) bad();
    return { state, result };
  });
}

/** Shape parsing alone is not a hash/source proof. The server verifies every read/frozen command reply against its trusted context. */
export async function verifyAplReadReply(value: unknown, context: AplContext): Promise<AplReadReply> {
  const ctx = parseAplContext(context), detail = parseAplReadReply(value, { planId: ctx.plan.id });
  if (detail.plan !== null) validateAplAllocationWrite(ctx, detail.plan);
  if ((detail.revisionScope === 'apl' ? detail.timplanRevision !== ctx.plan.revision : detail.revision !== ctx.plan.revision) || detail.confirmations.some(event => event.unitId !== ctx.plan.unitId)
    || detail.contentHash !== await aplContentHash(ctx, detail.plan)) bad('invalid_read_snapshot');
  const replyContext = { ...ctx, organizerId: detail.organizerId, program: detail.program, copyReview: detail.copyReview };
  if (aplCanonicalSerialize(aplContentHashPayload(replyContext, detail.plan)) !== aplCanonicalSerialize(aplContentHashPayload(ctx, detail.plan))) bad('invalid_read_snapshot');
  return detail;
}

/** Only the raw outer shape is checked here. Server04 must independently project/verify the full frozen catalog and matrix. */
export function parseAplFrozenBasis(value: unknown): AplFrozenBasis {
  return guarded(() => {
    const separated = Object.hasOwn(gymObject(value), 'aplRevision');
    const r = gymShape(value, ['organizerId', 'gymTimplan', 'copyReview', ...(separated ? ['aplRevision'] : [])]);
    const v2 = Object.hasOwn(gymObject(r.gymTimplan), 'timeModel');
    const gymTimplan = gymShape(r.gymTimplan, ['id', 'offeringId', 'unitId', 'schoolName', 'version', 'revision', 'status', 'source', 'catalog',
      'currentSource', 'currentSourceBasis', ...(v2 ? ['timeModel', 'timeRows', 'timeCopyReview'] : ['hours']), 'canPlan', 'archived', 'series', 'nameAtCreation']);
    return { organizerId: gymUuid(r.organizerId), gymTimplan, ...(separated ? { aplRevision: gymInteger(r.aplRevision) } : {}), copyReview: parseAplCopyReview(r.copyReview) };
  });
}
/** The caller chooses the trusted operation parser; a wire field cannot select an older verifier. Null basis is only for not_found status. */
export function parseAplSqlEnvelope<T>(value: unknown, parseResult: (value: unknown) => T): AplSqlEnvelope<T> {
  return guarded(() => {
    const r = gymShape(value, ['contractVersion', 'basis', 'result']);
    if (r.contractVersion !== 'apl_sql_v1') bad();
    const result = parseResult(r.result), basis = r.basis === null ? null : parseAplFrozenBasis(r.basis);
    if (basis !== null && result !== null && typeof result === 'object' && Object.getOwnPropertyDescriptor(result, 'state')?.value === 'not_found') bad();
    if (basis === null) {
      const status = gymShape(result, ['state', 'result']);
      if (status.state !== 'not_found' || status.result !== null) bad();
    }
    return { contractVersion: 'apl_sql_v1', basis, result };
  });
}
