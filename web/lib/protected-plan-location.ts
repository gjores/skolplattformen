import { parsePlanningSelection, parsePlanningSetup, type PlanningSelection, type PlanningSetup } from './planning-year-contract.ts';

export type ProgramplanLocation = { offeringId: string; planId: string; version?: number; unitId?: string };
export type GymTimplanLocation = { kind: 'source' | 'plan'; id: string; unitId?: string; offeringId?: string; version?: number };
export type OtherTimplanLocation = { kind: 'grundskola' | 'introduktionsprogram'; id: string; columnId?: `ak${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | null; offeringId?: string; version?: number; unitId?: string };
export type PlanningLocationSelection = Partial<Omit<PlanningSelection, 'view'>>;
type PlanningLocationFields = { planning?: PlanningLocationSelection; relativeYear?: 1 | 2 | 3; allYears?: boolean; overview?: boolean };
export type PlanLocation = ({ view: 'programplaner'; programplan: ProgramplanLocation | null }
  | { view: 'timplaner'; gym: GymTimplanLocation | null; other?: OtherTimplanLocation }) & PlanningLocationFields;
const validId = (value: string | null): value is string => value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const printable = (value: string) => { for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 32 || value.charCodeAt(i) === 127) return false; return true; };
const revision = (value: string) => /^sha256:[0-9a-f]{64}$/u.test(value);
const bounded = (value: string, min: number, max: number) => /^(0|[1-9][0-9]*)$/u.test(value) && Number(value) >= min && Number(value) <= max;
const fields = {
  schoolYear: 'planeringslasar', unitId: 'planeringsskola', schoolform: 'planeringsform', query: 'planeringssok',
  status: 'planeringsstatus', cohortRelation: 'planeringskull', archive: 'planeringsarkiv', grade: 'planeringsarskurs',
  sort: 'planeringssort', direction: 'planeringsriktning', page: 'planeringssida', selectionRevision: 'planeringsrevision',
} as const;
const choices = {
  schoolform: ['gymnasium', 'grundskola', 'introduktionsprogram'], status: ['all', 'utkast', 'forslag', 'atersand', 'faststalld', 'ersatt'],
  cohortRelation: ['all', 'relevant', 'new', 'continuing', 'future', 'finished', 'unknown'], archive: ['active', 'archived', 'all'],
  sort: ['name', 'school', 'cohort', 'version', 'status', 'grade', 'points', 'hours'], direction: ['asc', 'desc'],
};
export function readPlanLocationResult(search: string): { location: PlanLocation | null; normalizationNotice: string | null } {
  const params = new URLSearchParams(search); let normalized = false;
  const one = (key: string) => { const values = params.getAll(key); if (values.length > 1) { normalized = true; return null; } return values[0] ?? null; };
  const id = (key: string) => { const value = one(key); if (value !== null && !validId(value)) normalized = true; return validId(value) ? value : null; };
  const view = one('vy'); let location: PlanLocation | null = null;
  if (view === 'programplaner') {
    const offeringId = id('utbildning'), planId = id('programplan');
    if (!!offeringId !== !!planId) normalized = true;
    location = { view, programplan: offeringId && planId ? { offeringId, planId } : null };
    const unitId = id('programplanskola'), version = one('programplansversion');
    if (location.programplan) {
      if (unitId) location.programplan.unitId = unitId;
      if (version !== null) { if (bounded(version, 1, 2147483647)) location.programplan.version = Number(version); else normalized = true; }
    } else if (unitId !== null || version !== null) normalized = true;
  } else if (view === 'timplaner') {
    const planId = id('timplan'), sourceId = id('programunderlag'), otherId = id('ovrigtimplan'), kind = one('timplansform');
    const conflicting = [planId, sourceId, otherId].filter(Boolean).length > 1;
    if (conflicting) normalized = true;
    location = { view, gym: conflicting ? null : planId ? { kind: 'plan', id: planId } : sourceId ? { kind: 'source', id: sourceId } : null };
    if (!conflicting && otherId && (kind === 'grundskola' || kind === 'introduktionsprogram')) location.other = { kind, id: otherId };
    else if (otherId || kind !== null) normalized = true;
    const column = one('timplanskolumn'), offeringId = id('timplansutbildning'), version = one('timplansversion'), unitId = id('timplansskola');
    if (location.other) {
      if (column !== null) { if (/^ak[1-9]$/u.test(column)) location.other.columnId = column as OtherTimplanLocation['columnId']; else if (column === 'unknown') location.other.columnId = null; else normalized = true; }
      if (offeringId !== null) location.other.offeringId = offeringId;
      if (version !== null) { if (bounded(version, 1, 2147483647)) location.other.version = Number(version); else normalized = true; }
      if (unitId) location.other.unitId = unitId;
    } else if (location.gym) {
      if (unitId) location.gym.unitId = unitId;
      if (offeringId) location.gym.offeringId = offeringId;
      if (version !== null) { if (bounded(version, 1, 2147483647)) location.gym.version = Number(version); else normalized = true; }
      if (column !== null) normalized = true;
    } else if (column !== null || offeringId !== null || version !== null || unitId !== null) normalized = true;
  }
  if (location) {
    const overview = one('planeringsoversikt');
    if (overview !== null) { if (overview === '1' || overview === '0') location.overview = overview === '1'; else normalized = true; }
    if (params.has('planeringsoversikt') && overview !== '1' && overview !== '0') location = collectionOnly(location);
    const planning: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(fields)) {
      const value = one(param); if (value === null) continue;
      let accepted: unknown;
      if (key === 'schoolYear' && bounded(value, 2000, 2100) || key === 'grade' && bounded(value, 1, 9) || key === 'page' && bounded(value, 1, 100000)) accepted = Number(value);
      else if (key === 'unitId' && (value === 'all' || validId(value))) accepted = value === 'all' ? null : value.toLowerCase();
      else if (key === 'selectionRevision' && revision(value)) accepted = value;
      else if (key === 'query' && value.length <= 200 && value === value.trim() && printable(value)) accepted = value;
      else if (key in choices && choices[key as keyof typeof choices].includes(value)) accepted = value;
      if (accepted === undefined) normalized = true; else planning[key] = accepted;
    }
    if (typeof planning.page === 'number' && planning.page > 1 && (!planning.selectionRevision || normalized)) { planning.page = 1; delete planning.selectionRevision; normalized = true; }
    if (Object.keys(planning).length) location.planning = planning as PlanningLocationSelection;
    const relative = one('planeringsrelativar'), all = one('planeringsallaar');
    if (relative !== null) { if (bounded(relative, 1, 3)) location.relativeYear = Number(relative) as 1 | 2 | 3; else normalized = true; }
    if (all !== null) { if (all === '1' || all === '0') location.allYears = all === '1'; else normalized = true; }
    if (location.overview) {
      if (location.view === 'programplaner' ? location.programplan : location.gym || location.other) normalized = true;
      if (location.relativeYear !== undefined || location.allYears !== undefined) normalized = true;
      location = collectionOnly(location); // Never mount a writer from an overview address.
      if (location.planning?.page && location.planning.page > 1) { location.planning = { ...location.planning, page: 1, selectionRevision: null }; normalized = true; }
    }
  }
  return { location, normalizationNotice: normalized ? 'Ogiltiga eller dubbla planeringsval har tagits bort. Kontrollera skola och läsår.' : null };
}
export function readPlanLocation(search: string): PlanLocation | null { return readPlanLocationResult(search).location; }
export function planLocationQuery(location: PlanLocation): string {
  const params = new URLSearchParams({ vy: location.view });
  if (!location.overview && location.view === 'programplaner' && location.programplan) {
    params.set('utbildning', location.programplan.offeringId); params.set('programplan', location.programplan.planId);
    if (location.programplan.unitId !== undefined) params.set('programplanskola', location.programplan.unitId);
    if (location.programplan.version !== undefined) params.set('programplansversion', String(location.programplan.version));
  } else if (!location.overview && location.view === 'timplaner') {
    if (location.gym) {
      params.set(location.gym.kind === 'plan' ? 'timplan' : 'programunderlag', location.gym.id);
      if (location.gym.unitId !== undefined) params.set('timplansskola', location.gym.unitId);
      if (location.gym.offeringId !== undefined) params.set('timplansutbildning', location.gym.offeringId);
      if (location.gym.version !== undefined) params.set('timplansversion', String(location.gym.version));
    }
    else if (location.other) {
      params.set('ovrigtimplan', location.other.id); params.set('timplansform', location.other.kind);
      if (location.other.columnId !== undefined) params.set('timplanskolumn', location.other.columnId ?? 'unknown');
      if (location.other.offeringId !== undefined) params.set('timplansutbildning', location.other.offeringId);
      if (location.other.version !== undefined) params.set('timplansversion', String(location.other.version));
      if (location.other.unitId !== undefined) params.set('timplansskola', location.other.unitId);
    }
  }
  for (const [key, param] of Object.entries(fields)) {
    const value = location.planning?.[key as keyof PlanningLocationSelection];
    if (value !== undefined && value !== null) params.set(param, String(value));
    else if (key === 'unitId' && value === null) params.set(param, 'all');
  }
  if (!location.overview && location.relativeYear !== undefined) params.set('planeringsrelativar', String(location.relativeYear));
  if (!location.overview && location.allYears !== undefined) params.set('planeringsallaar', location.allYears ? '1' : '0');
  if (location.overview !== undefined) params.set('planeringsoversikt', location.overview ? '1' : '0');
  return `?${params}`;
}
/** Keep only the requested collection and its independent planning selection. */
function collectionOnly(location: PlanLocation): PlanLocation {
  const fields = { ...(location.planning ? { planning: location.planning } : {}), ...(location.overview !== undefined ? { overview: location.overview } : {}) };
  return location.view === 'programplaner' ? { view: location.view, programplan: null, ...fields } : { view: location.view, gym: null, ...fields };
}
/** An explicit collection choice starts a clean filter/page without inventing another view in the read contract. */
export function planningCollectionLocation(location: PlanLocation, view: PlanningSelection['view'], schoolform: PlanningSelection['schoolform'], setup: PlanningSetup): ReturnType<typeof normalizePlanLocation> {
  if (view === 'programplan' && schoolform !== 'gymnasium') throw new TypeError('Programramar kräver gymnasiets skolform.');
  const current = normalizePlanLocation(location, setup).selection;
  const planning: PlanningLocationSelection = { schoolYear: current.schoolYear, unitId: current.unitId, schoolform,
    query: '', status: 'all', cohortRelation: 'relevant', archive: 'active', grade: null, sort: 'name', direction: 'asc', page: 1, selectionRevision: null };
  return normalizePlanLocation(view === 'programplan' ? { view: 'programplaner', programplan: null, overview: true, planning }
    : { view: 'timplaner', gym: null, overview: true, planning }, setup);
}
/** The supplied setup must come from the protected API; URL units never establish a mandate. */
export function normalizePlanLocation(location: PlanLocation, value: PlanningSetup): { location: PlanLocation; selection: PlanningSelection; normalizationNotice: string | null } {
  const setup = parsePlanningSetup(value), requested = location.planning ?? {}, view = location.view === 'programplaner' ? 'programplan' : 'timplan';
  let changed = false, clearTarget = false;
  if (location.overview) {
    changed = !!(location.view === 'programplaner' ? location.programplan : location.gym || location.other) || location.relativeYear !== undefined || location.allYears !== undefined;
    location = collectionOnly(location);
  }
  let schoolform = view === 'programplan' || location.view === 'timplaner' && location.gym ? 'gymnasium' as const : location.view === 'timplaner' ? location.other?.kind ?? requested.schoolform ?? 'gymnasium' : 'gymnasium';
  if (requested.schoolform !== undefined && requested.schoolform !== schoolform) changed = true;
  if (view === 'timplan' && !setup.units.some(u => u.canRead[schoolform])) {
    const available = (['gymnasium', 'grundskola', 'introduktionsprogram'] as const).find(form => setup.units.some(u => u.canRead[form]));
    if (available && available !== schoolform) { schoolform = available; changed = true; clearTarget = true; }
  }
  const readable = setup.units.filter(u => view === 'programplan' ? u.canRead.programplan : u.canRead[schoolform]);
  const targetUnit = location.view === 'programplaner' ? location.programplan?.unitId : location.gym?.unitId ?? location.other?.unitId;
  let unitId = requested.unitId === undefined ? targetUnit && readable.some(u => u.unitId === targetUnit) ? targetUnit : readable[0]?.unitId ?? null : requested.unitId;
  if (unitId !== null && !readable.some(u => u.unitId === unitId)) { unitId = readable[0]?.unitId ?? null; changed = true; clearTarget = true; }
  if (targetUnit !== undefined && (!readable.some(u => u.unitId === targetUnit) || unitId !== null && targetUnit !== unitId)) { changed = true; clearTarget = true; }
  const schoolYear = requested.schoolYear !== undefined && Number.isInteger(requested.schoolYear) && requested.schoolYear >= setup.minimumYear && requested.schoolYear <= setup.maximumYear ? requested.schoolYear : setup.currentYear;
  if (requested.schoolYear !== undefined && schoolYear !== requested.schoolYear) changed = true;
  const selection: PlanningSelection = { schoolYear, unitId, view, schoolform, query: requested.query ?? '', status: requested.status ?? 'all',
    cohortRelation: requested.cohortRelation ?? 'relevant', archive: requested.archive ?? 'active', grade: requested.grade ?? null,
    sort: requested.sort ?? 'name', direction: requested.direction ?? 'asc', page: requested.page ?? 1, selectionRevision: requested.selectionRevision ?? null };
  if (view === 'programplan' && (selection.status === 'forslag' || selection.status === 'atersand')) { selection.status = 'all'; changed = true; }
  if (schoolform === 'introduktionsprogram' && selection.grade !== null || schoolform === 'gymnasium' && selection.grade !== null && selection.grade > 3) { selection.grade = null; changed = true; }
  if (schoolform !== 'gymnasium' && selection.sort === 'points' || view === 'programplan' && selection.sort === 'hours') { selection.sort = 'name'; changed = true; }
  if (location.overview && (selection.page !== 1 || selection.selectionRevision !== null)) { selection.page = 1; selection.selectionRevision = null; changed = true; }
  if (changed || selection.page > 1 && selection.selectionRevision === null) { selection.page = 1; selection.selectionRevision = null; }
  const parsed = parsePlanningSelection(selection, setup);
  const { view: _view, ...planning } = parsed;
  const target = clearTarget ? collectionOnly(location) : location;
  return { location: { ...target, planning }, selection: parsed, normalizationNotice: changed ? 'Planeringsvalet har anpassats till ditt aktuella uppdrag. Kontrollera skola och läsår.' : null };
}

/** A user change resets revision-bound pages and references belonging to the previous school/year. */
export function planningLocationChange(location: PlanLocation, patch: Partial<PlanningSelection>, setup: PlanningSetup): ReturnType<typeof normalizePlanLocation> {
  const current = normalizePlanLocation(location, setup);
  const { view: _view, ...existing } = current.selection;
  const { view: _patchView, ...changes } = patch;
  const basisChanged = Object.keys(changes).some(key => key !== 'page' && key !== 'selectionRevision'
    && changes[key as keyof typeof changes] !== existing[key as keyof typeof existing]);
  const planning = { ...existing, ...changes, ...(basisChanged ? { page: 1, selectionRevision: null } : {}) };
  let target = current.location;
  if (planning.unitId !== existing.unitId || planning.schoolform !== existing.schoolform) {
    target = collectionOnly(target);
  } else if (planning.schoolYear !== existing.schoolYear) {
    const { relativeYear: _relative, allYears: _all, ...remaining } = target;
    target = remaining;
    if (target.view === 'timplaner' && target.other) {
      const { columnId: _column, ...other } = target.other;
      target = { ...target, other };
    }
  }
  return normalizePlanLocation({ ...target, planning }, setup);
}

export type VerifiedPlanningScope = { setup: PlanningSetup; selection: PlanningSelection };
/** Only compare with an earlier protected, verified scope; a first URL is merely a requested selection. */
export function planningReadScopeLost(previous: VerifiedPlanningScope | null, fresh: PlanningSetup): boolean {
  const next = parsePlanningSetup(fresh);
  if (!previous) return false;
  const before = parsePlanningSetup(previous.setup), selected = parsePlanningSelection(previous.selection, before);
  if (before.customerId !== next.customerId) return true;
  const readable = (unit: PlanningSetup['units'][number]) => selected.view === 'programplan' ? unit.canRead.programplan : unit.canRead[selected.schoolform];
  const formerlyReadable = before.units.filter(unit => readable(unit) && (selected.unitId === null || selected.unitId === unit.unitId));
  return formerlyReadable.some(unit => !next.units.some(current => current.unitId === unit.unitId && readable(current)));
}
