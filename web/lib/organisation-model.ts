import type { SchoolAddress } from './registry-address.ts';
// Skolans grund: huvudmannens skolenheter, utbildningar, tillstånd och
// poängplaner.
//
// Huvudmannen lägger grunden (Skollagen 2 kap. 8 §), rektorn leder den inre
// organisationen (2 kap. 10 §). En huvudman kan ha flera skolenheter; varje
// utbildning hör till en skolenhet (godkännandet avser viss utbildning vid
// viss skolenhet, 2 kap. 5 §). Poängplanen är utbildningens nationella block
// ur Skolverkets katalog plus huvudmannens val av programfördjupning
// (Gymnasieförordningen 4 kap. 5–6 §§). Från en fastställd poängplan skapas
// elevernas individuella studieplaner (7 kap. 7 §). Roller är exempelroller.

import {
  findProgram,
  listPrograms,
  type SyllabusBlockSubject,
  type SyllabusProgram,
} from './syllabus.ts';
import { clock, today, uid } from './common.ts';

export type Role = 'huvudman' | 'rektor' | 'administrator' | 'larare';
export const roleLabel: Record<Role, string> = {
  huvudman: 'Huvudman',
  rektor: 'Rektor',
  administrator: 'Administratör',
  larare: 'Lärare',
};

export type Entry = {
  id: string;
  time: string;
  role: Role;
  action: string;
  comment: string;
};
const entry = (role: Role, action: string, comment: string): Entry => ({
  id: uid(),
  time: clock(),
  role,
  action,
  comment,
});

export type SchoolType = {
  code: string;
  name: string;
  grades?: number[];
  programmes?: string[];
};
export type Organizer = { name: string; organizationNumber?: string; type: string };
export type SchoolUnit = {
  /** Skolenhetskoden är identiteten; lokala exempel har en syntetisk kod. */
  id: string;
  code: string;
  name: string;
  organizer: Organizer;
  municipality: { code: string; name: string };
  schoolTypes: SchoolType[];
  headMaster?: string;
  locality?: string;
  address?: SchoolAddress;
  status: string;
  source: { name: string; fetched?: string; modified?: string; url?: string };
  pupilRegister: { source: string; count: number; note: string };
};

/** Det som läsvägen /api/skolenhet lämnar vidare ur Skolenhetsregistret v2. */
export type RegistryUnit = {
  code: string;
  name: string;
  status: string;
  municipalityCode: string;
  municipalityName?: string;
  schoolTypes: string[];
  programmes: Record<string, string[]>;
  headMaster?: string;
  locality?: string;
  address?: SchoolAddress;
  organizer: { name: string; organizationNumber?: string; type: string };
  modified?: string;
  extractDate?: string;
};

export const schoolTypeNames: Record<string, string> = {
  FSK: 'Förskoleklass',
  FKLASS: 'Förskoleklass',
  GR: 'Grundskola',
  GRAN: 'Anpassad grundskola',
  FTH: 'Fritidshem',
  GY: 'Gymnasieskola',
  GYAN: 'Anpassad gymnasieskola',
  SP: 'Specialskola',
  SAM: 'Sameskola',
};
const organizerTypeNames: Record<string, string> = {
  KOMMUN: 'Kommun',
  ENSKILD: 'Enskild',
  REGION: 'Region',
  STAT: 'Staten',
};
const statusNames: Record<string, string> = {
  AKTIV: 'Aktiv',
  VILANDE: 'Vilande',
  UPPHORT: 'Upphört',
  PLANERAD: 'Planerad',
};
export const registryStatusName = (code: string) => statusNames[code] ?? code;

export type Permit = {
  id: string;
  issuer: 'Skolinspektionen' | 'Skolverket' | 'Huvudmannens beslut';
  reference: string;
  decided: string;
  validFrom: string;
  validTo?: string;
  scope: string;
  file?: { name: string; size: number; type: string };
};
export type PointPlanStatus = 'utkast' | 'fastställd' | 'ersatt';
export type PointPlan = {
  id: string;
  version: number;
  status: PointPlanStatus;
  /** Valda nivåer i programfördjupningen, som nivåkoder ur katalogen. */
  specialization: string[];
  history: Entry[];
  decidedOn?: string;
};
export type OfferingKind = 'grundskola' | 'gymnasium' | 'introduktionsprogram';
export type OfferingStatus = 'planerad' | 'aktiv' | 'avvecklas';
export type Offering = {
  id: string;
  unitId: string;
  kind: OfferingKind;
  /** Lokalt namn på utbildningen, till exempel profilens namn. */
  name: string;
  /** Lokal kod som huvudmannen eller antagningskansliet sätter. */
  localCode?: string;
  programCode?: string;
  orientationCode?: string;
  grades?: number[];
  cohort: string;
  status: OfferingStatus;
  permits: Permit[];
  pointPlans: PointPlan[];
};
/**
 * Uppdrag vid skolenheter. En rektor leder en eller flera skolenheter
 * (Skollagen 2 kap. 9 §), en lärare kan tjänstgöra vid flera. En elev är
 * inskriven vid exakt en skolenhet och ligger därför i elevregistret, inte här.
 */
export type Assignment = {
  id: string;
  name: string;
  role: 'rektor' | 'larare';
  unitIds: string[];
};
export type OrganisationState = {
  organizer: Organizer;
  units: SchoolUnit[];
  activeUnitId: string;
  offerings: Offering[];
  assignments: Assignment[];
  log: Entry[];
};

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const isPrincipal = (role: Role) => role === 'huvudman';

export const activeUnit = (state: OrganisationState): SchoolUnit =>
  state.units.find((u) => u.id === state.activeUnitId) ?? state.units[0];
export const unitOf = (state: OrganisationState, o: Offering): SchoolUnit | undefined =>
  state.units.find((u) => u.id === o.unitId);
export const unitOfferings = (state: OrganisationState, unitId: string) =>
  state.offerings.filter((o) => o.unitId === unitId);
export const unitStaff = (state: OrganisationState, unitId: string) =>
  state.assignments.filter((a) => a.unitIds.includes(unitId));

export function appointPrincipal(state: OrganisationState, role: Role, unitId: string, principalId?: string, name?: string): OrganisationState {
  ensure(role === 'huvudman', 'Bara huvudmannen utser rektor.');
  ensure(state.units.some(u=>u.id===unitId), 'Skolenheten finns inte.');
  const chosen = principalId ? state.assignments.find(a=>a.id===principalId&&a.role==='rektor') : undefined;
  if (principalId) ensure(chosen, 'Välj en rektor hos huvudmannen.');
  else ensure(name?.trim() && name.trim().length <= 120, 'Ange rektorns namn, högst 120 tecken.');
  const next = chosen ?? {id:uid(),name:name!.trim(),role:'rektor' as const,unitIds:[]};
  const assignments = state.assignments.filter(a=>a.id!==next.id).map(a=>a.role==='rektor'?{...a,unitIds:a.unitIds.filter(id=>id!==unitId)}:a);
  return {...state,assignments:[...assignments,{...next,unitIds:[...new Set([...next.unitIds,unitId])]}],log:[entry(role,'Rektor utsedd',`${next.name} vid ${state.units.find(u=>u.id===unitId)!.name}.`),...state.log]};
}

/** Vilka skolenheter en roll arbetar med: huvudmannen alla, rektorn sina. */
export function unitsForRole(state: OrganisationState, role: Role, personId = 'rektor-robin'): SchoolUnit[] {
  if (role === 'rektor') {
    const mine = state.assignments.find((a) => a.id === personId && a.role === 'rektor');
    const units = state.units.filter((u) => mine?.unitIds.includes(u.id));
    return units.length ? units : state.units.slice(0, 1);
  }
  return state.units;
}

export function assignUnit(state: OrganisationState, role: Role, assignmentId: string, unitId: string, on: boolean): OrganisationState {
  const assignment = state.assignments.find((a) => a.id === assignmentId);
  ensure(assignment, 'Uppdraget finns inte.');
  ensure(assignment.role === 'larare' ? role === 'rektor' : isPrincipal(role),
    assignment.role === 'larare' ? 'Bara rektorn ändrar lärarnas uppdrag.' : 'Bara huvudmannen ändrar rektorers uppdrag.');
  ensure(state.units.some((u) => u.id === unitId), 'Skolenheten finns inte.');
  const unitIds = on ? [...new Set([...assignment.unitIds, unitId])] : assignment.unitIds.filter((id) => id !== unitId);
  ensure(assignment.role !== 'rektor' || unitIds.length > 0, 'En rektor behöver minst en skolenhet.');
  const unit = state.units.find((u) => u.id === unitId)!;
  return {
    ...state,
    assignments: state.assignments.map((a) => (a.id === assignmentId ? { ...a, unitIds } : a)),
    log: [entry(role, on ? 'Uppdrag tillagt' : 'Uppdrag avslutat', `${assignment.name} (${assignment.role === 'rektor' ? 'rektor' : 'lärare'}) ${on ? 'vid' : 'lämnar'} ${unit.name}.`), ...state.log],
  };
}

export const studyPathCode = (o: Offering) =>
  o.orientationCode ?? o.programCode ?? (o.kind === 'grundskola' ? 'GR' : 'IM');

export function programOf(o: Offering): SyllabusProgram | undefined {
  return o.programCode ? findProgram(o.programCode) : undefined;
}
export function orientationOf(o: Offering) {
  return programOf(o)?.orientations.find((x) => x.code === o.orientationCode);
}
export function offeringTitle(o: Offering): string {
  const program = programOf(o);
  if (!program) return o.name;
  const orientation = orientationOf(o);
  return `${program.name}${orientation ? `, ${orientation.name.toLocaleLowerCase('sv')}` : ''} · ${o.name}`;
}

export type Level = {
  code: string;
  subjectCode: string;
  subject: string;
  name: string;
  points: number;
  block: string;
  /** Nationellt fastlagd eller lokalt vald. */
  fixed: boolean;
};
export type Block = {
  id: string;
  name: string;
  required: number;
  levels: Level[];
};

function levelsOf(block: string, subjects: SyllabusBlockSubject[], fixed = true): Level[] {
  const levels: Level[] = [];
  for (const subject of subjects) {
    // Svenska som andraspråk är ett alternativ till svenska, inte ett tillägg.
    if (subject.optional && subject.code === 'SVEA') continue;
    if (!subject.levels.length)
      levels.push({ code: subject.code, subjectCode: subject.code, subject: subject.name, name: subject.name, points: subject.points, block, fixed });
    for (const level of subject.levels)
      levels.push({ code: level.code, subjectCode: subject.code, subject: subject.name, name: `${subject.name}, ${level.name}`, points: level.points, block, fixed });
  }
  return levels;
}

/** Valbara nivåer i programfördjupningen enligt Skolverkets lista för programmet. */
export function specializationOptions(o: Offering): Level[] {
  const program = programOf(o);
  if (!program) return [];
  const taken = new Set(fixedLevels(o).map((l) => l.code));
  return levelsOf('fordjupning', program.specialization, false).filter((l) => !taken.has(l.code));
}

function fixedLevels(o: Offering): Level[] {
  const program = programOf(o);
  if (!program) return [];
  const orientation = orientationOf(o);
  return [
    ...levelsOf('gemensamma', program.foundation),
    ...levelsOf('programgemensamma', program.programmeSpecific),
    ...(orientation ? levelsOf('inriktning', orientation.subjects) : []),
  ];
}

export const totalPoints = 2500;

/** Poängplanens block: nationella ur katalogen, programfördjupningen ur planen. */
export function pointPlanBlocks(o: Offering, plan?: PointPlan): Block[] {
  const program = programOf(o);
  if (!program) return [];
  const orientation = orientationOf(o);
  const fixed = fixedLevels(o);
  const sum = (block: string) => fixed.filter((l) => l.block === block).reduce((n, l) => n + l.points, 0);
  const options = specializationOptions(o);
  const chosen = (plan?.specialization ?? [])
    .map((code) => options.find((l) => l.code === code))
    .filter((l): l is Level => Boolean(l));
  const required = totalPoints - sum('gemensamma') - sum('programgemensamma') - (orientation?.points ?? 0) - 300;
  return [
    { id: 'gemensamma', name: 'Gymnasiegemensamma ämnen', required: sum('gemensamma'), levels: fixed.filter((l) => l.block === 'gemensamma') },
    { id: 'programgemensamma', name: 'Programgemensamma ämnen', required: sum('programgemensamma'), levels: fixed.filter((l) => l.block === 'programgemensamma') },
    ...(orientation ? [{ id: 'inriktning', name: `Inriktning ${orientation.name.toLocaleLowerCase('sv')}`, required: orientation.points, levels: fixed.filter((l) => l.block === 'inriktning') }] : []),
    { id: 'fordjupning', name: 'Programfördjupning', required, levels: chosen },
    { id: 'individuellt', name: 'Individuellt val', required: 200, levels: [{ code: 'INDIVIDUELLT', subjectCode: '', subject: 'Individuellt val', name: 'Individuellt val', points: 200, block: 'individuellt', fixed: true }] },
    { id: 'gymnasiearbete', name: 'Gymnasiearbete', required: 100, levels: [{ code: `GYAR${program.code.slice(0, 2)}25`, subjectCode: '', subject: 'Gymnasiearbete', name: 'Gymnasiearbete', points: 100, block: 'gymnasiearbete', fixed: true }] },
  ];
}

export type Issue = { level: 'error' | 'warning'; text: string };
export function pointPlanIssues(o: Offering, plan: PointPlan): Issue[] {
  const issues: Issue[] = [];
  const blocks = pointPlanBlocks(o, plan);
  if (!blocks.length) return [{ level: 'error', text: 'Programmet finns inte i den hämtade katalogen.' }];
  const fordjupning = blocks.find((b) => b.id === 'fordjupning')!;
  const have = fordjupning.levels.reduce((n, l) => n + l.points, 0);
  if (have !== fordjupning.required)
    issues.push({ level: 'error', text: `Programfördjupningen omfattar ${have} poäng; poängplanen anger ${fordjupning.required}.` });
  const unknown = plan.specialization.filter((code) => !fordjupning.levels.some((l) => l.code === code));
  for (const code of unknown)
    issues.push({ level: 'error', text: `${code} får inte erbjudas som programfördjupning på ${o.programCode}.` });
  const seen = new Map<string, number>();
  for (const block of blocks) for (const l of block.levels) seen.set(l.code, (seen.get(l.code) ?? 0) + 1);
  for (const [code, n] of seen) if (n > 1) issues.push({ level: 'error', text: `${code} förekommer ${n} gånger i poängplanen.` });
  // En nivå förutsätter den lägre nivån i samma ämne någonstans på studievägen.
  const all = blocks.flatMap((b) => b.levels);
  for (const l of fordjupning.levels) {
    const step = Number(l.code.replace(/^[A-Z]+/, '')[0]);
    if (step > 1 && !all.some((x) => x.subjectCode === l.subjectCode && Number(x.code.replace(/^[A-Z]+/, '')[0]) === step - 1))
      issues.push({ level: 'warning', text: `${l.name} utan nivå ${step - 1} i samma ämne på studievägen.` });
  }
  const total = all.reduce((n, l) => n + l.points, 0);
  if (total !== totalPoints)
    issues.push({ level: 'error', text: `Poängplanen omfattar ${total} poäng i stället för ${totalPoints}.` });
  return issues;
}

export const currentPointPlan = (o: Offering) => o.pointPlans.find((p) => p.status === 'fastställd');
export const openPointPlan = (o: Offering) => o.pointPlans.find((p) => p.status === 'utkast');

/** Mall för elevens individuella studieplan enligt Gymnasieförordningen 7 kap. 7 §. */
export function studyPlanTemplate(o: Offering, plan: PointPlan | undefined = currentPointPlan(o)): Level[] {
  if (o.kind !== 'gymnasium') return [];
  return pointPlanBlocks(o, plan).flatMap((b) => b.levels);
}

/** Programkoder som registret anger för skolenheten jämfört med utbudet. */
export function registryComparison(state: OrganisationState, unitId: string = state.activeUnitId) {
  const unit = state.units.find((u) => u.id === unitId);
  const registry = new Set(unit?.schoolTypes.flatMap((t) => t.programmes ?? []) ?? []);
  const offered = new Set(
    unitOfferings(state, unitId)
      .filter((o) => o.kind === 'gymnasium' && o.programCode)
      .map((o) => o.programCode!.replace(/25$/, '')),
  );
  return {
    known: Boolean(unit) && unit!.source.name !== 'Lokalt exempel' && registry.size > 0,
    missingInRegistry: [...offered].filter((p) => !registry.has(p)),
    notOffered: [...registry].filter((p) => !offered.has(p)),
  };
}


function unitFromRegistry(unit: RegistryUnit, url: string | undefined, grades: number[] | undefined): SchoolUnit {
  return {
    id: unit.code,
    code: unit.code,
    name: unit.name,
    organizer: { ...unit.organizer, type: organizerTypeNames[unit.organizer.type] ?? unit.organizer.type },
    municipality: { code: unit.municipalityCode, name: unit.municipalityName ?? unit.locality ?? unit.municipalityCode },
    schoolTypes: unit.schoolTypes.map((code) => ({
      code,
      name: schoolTypeNames[code] ?? code,
      grades: code === 'GR' ? (grades ?? [1, 2, 3, 4, 5, 6, 7, 8, 9]) : undefined,
      programmes: unit.programmes[code.toLowerCase()] ?? unit.programmes[code],
    })),
    headMaster: unit.headMaster,
    locality: unit.locality,
    address: unit.address,
    status: statusNames[unit.status] ?? unit.status,
    source: { name: 'Skolenhetsregistret', fetched: today, modified: unit.modified, url },
    pupilRegister: { source: 'Inget register kopplat', count: 0, note: 'Elevregistret kopplas per skolenhet, i ett senare steg enligt SS 12000.' },
  };
}

/** Lägger till en skolenhet ur registret under huvudmannen och gör den aktiv. */
export function addUnitFromRegistry(state: OrganisationState, role: Role, unit: RegistryUnit, url?: string): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen lägger till skolenheter.');
  ensure(/^\d{8}$/.test(unit.code), 'Skolenhetskoden är åtta siffror.');
  ensure(!state.units.some((u) => u.code === unit.code), `${unit.name} finns redan bland huvudmannens skolenheter.`);
  const next = unitFromRegistry(unit, url, undefined);
  return {
    ...state,
    units: [...state.units, next],
    activeUnitId: next.id,
    log: [entry(role, 'Skolenhet tillagd', `${next.name} (${next.code}) ur Skolenhetsregistret, ${next.organizer.name}.`), ...state.log],
  };
}

/** Uppdaterar den aktiva skolenhetens grunduppgifter från registret. */
export function applyRegistryUnit(state: OrganisationState, role: Role, unit: RegistryUnit, url?: string): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen ändrar skolenhetens grunduppgifter.');
  ensure(/^\d{8}$/.test(unit.code), 'Skolenhetskoden är åtta siffror.');
  const current = activeUnit(state);
  const gr = current.schoolTypes.find((t) => t.code === 'GR');
  const next = { ...unitFromRegistry(unit, url, gr?.grades), id: current.id, pupilRegister: current.pupilRegister };
  return {
    ...state,
    units: state.units.map((u) => (u.id === current.id ? next : u)),
    log: [entry(role, 'Skolenhet hämtad', `${unit.name} (${unit.code}) ur Skolenhetsregistret.`), ...state.log],
  };
}

export function selectUnit(state: OrganisationState, unitId: string): OrganisationState {
  ensure(state.units.some((u) => u.id === unitId), 'Skolenheten finns inte.');
  return { ...state, activeUnitId: unitId };
}

export function removeUnit(state: OrganisationState, role: Role, unitId: string): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen tar bort en skolenhet.');
  const unit = state.units.find((u) => u.id === unitId);
  ensure(unit, 'Skolenheten finns inte.');
  ensure(state.units.length > 1, 'Huvudmannen behöver minst en skolenhet.');
  ensure(!unitOfferings(state, unitId).some((o) => o.status === 'aktiv'), 'Skolenheten har aktiva utbildningar. Avveckla dem först.');
  const units = state.units.filter((u) => u.id !== unitId);
  return {
    ...state,
    units,
    activeUnitId: state.activeUnitId === unitId ? units[0].id : state.activeUnitId,
    offerings: state.offerings.filter((o) => o.unitId !== unitId),
    assignments: state.assignments.map((a) => ({ ...a, unitIds: a.unitIds.filter((id) => id !== unitId) })),
    log: [entry(role, 'Skolenhet borttagen', `${unit.name} (${unit.code}) och dess planerade utbildningar.`), ...state.log],
  };
}

export function setGrades(state: OrganisationState, role: Role, unitId: string, grades: number[]): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen ändrar skolenhetens grunduppgifter.');
  ensure(grades.length && grades.every((g) => Number.isInteger(g) && g >= 1 && g <= 9), 'Ange årskurser 1–9.');
  const sorted = [...grades].sort((a, b) => a - b);
  return {
    ...state,
    units: state.units.map((u) => (u.id === unitId ? { ...u, schoolTypes: u.schoolTypes.map((t) => (t.code === 'GR' ? { ...t, grades: sorted } : t)) } : u)),
    offerings: state.offerings.map((o) => (o.unitId === unitId && o.kind === 'grundskola' ? { ...o, grades: sorted } : o)),
  };
}

/**
 * Förslag till utbildningar ur registrets uppgifter om skolenheten: ett
 * nationellt program per programkod, grundskola om skolformen finns.
 * Huvudmannen bekräftar varje förslag; inget skapas av sig självt.
 */
export type OfferingSuggestion = {
  kind: OfferingKind;
  name: string;
  programCode?: string;
  orientations: { code: string; name: string }[];
  registryCode?: string;
  inCatalog: boolean;
};
export function suggestOfferings(state: OrganisationState, unitId: string): OfferingSuggestion[] {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return [];
  const existing = new Set(unitOfferings(state, unitId).map((o) => o.kind === 'gymnasium' ? o.programCode : o.kind));
  const suggestions: OfferingSuggestion[] = [];
  const gr = unit.schoolTypes.find((t) => t.code === 'GR');
  if (gr && !existing.has('grundskola'))
    suggestions.push({ kind: 'grundskola', name: 'Grundskola', orientations: [], inCatalog: true });
  const gy = unit.schoolTypes.find((t) => t.code === 'GY');
  for (const code of gy?.programmes ?? []) {
    const program = listPrograms().find((p) => p.code === `${code}25`);
    if (program && existing.has(program.code)) continue;
    suggestions.push({
      kind: 'gymnasium',
      name: program?.name ?? code,
      programCode: program?.code,
      orientations: program?.orientations.map((o) => ({ code: o.code, name: o.name })) ?? [],
      registryCode: code,
      inCatalog: Boolean(program),
    });
  }
  if (gy && !existing.has('introduktionsprogram'))
    suggestions.push({ kind: 'introduktionsprogram', name: 'Introduktionsprogram', orientations: [], inCatalog: true });
  return suggestions;
}

export type OfferingInput = {
  unitId: string;
  kind: OfferingKind;
  name: string;
  localCode?: string;
  programCode?: string;
  orientationCode?: string;
  cohort: string;
  status?: OfferingStatus;
};
export function addOffering(state: OrganisationState, role: Role, input: OfferingInput): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen definierar vilka utbildningar skolenheten har.');
  const unit = state.units.find((u) => u.id === input.unitId);
  ensure(unit, 'Välj en skolenhet.');
  ensure(input.name.trim(), 'Ge utbildningen ett namn.');
  ensure(input.cohort.trim(), 'Ange vilken kull eller vilket läsår utbildningen gäller.');
  let grades: number[] | undefined;
  if (input.kind === 'gymnasium') {
    const program = input.programCode && findProgram(input.programCode);
    ensure(program, 'Välj ett program ur katalogen.');
    ensure(unit.schoolTypes.some((t) => t.code === 'GY'), `${unit.name} har inte gymnasieskola som skolform.`);
    if (program.orientations.length)
      ensure(program.orientations.some((o) => o.code === input.orientationCode), 'Välj en inriktning på programmet.');
  } else if (input.kind === 'grundskola') {
    const gr = unit.schoolTypes.find((t) => t.code === 'GR');
    ensure(gr, `${unit.name} har inte grundskola som skolform.`);
    grades = gr.grades;
  } else ensure(unit.schoolTypes.some((t) => t.code === 'GY'), 'Introduktionsprogram förutsätter gymnasieskola som skolform.');
  const offering: Offering = {
    id: uid(),
    unitId: unit.id,
    kind: input.kind,
    name: input.name.trim(),
    localCode: input.localCode?.trim() || undefined,
    programCode: input.kind === 'gymnasium' ? input.programCode : undefined,
    orientationCode: input.kind === 'gymnasium' ? input.orientationCode : undefined,
    grades,
    cohort: input.cohort.trim(),
    status: input.status ?? 'planerad',
    permits: [],
    pointPlans: [],
  };
  return { ...state, offerings: [...state.offerings, offering], log: [entry(role, 'Utbildning tillagd', `${offeringTitle(offering)} vid ${unit.name}.`), ...state.log] };
}

export function updateOffering(state: OrganisationState, role: Role, id: string, patch: Partial<Pick<Offering, 'name' | 'localCode' | 'cohort' | 'status'>>): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen ändrar en utbildnings grunduppgifter.');
  const current = state.offerings.find((o) => o.id === id);
  ensure(current, 'Utbildningen finns inte.');
  if (patch.name !== undefined) ensure(patch.name.trim(), 'Namnet kan inte vara tomt.');
  return { ...state, offerings: state.offerings.map((o) => (o.id === id ? { ...o, ...patch, name: patch.name?.trim() ?? o.name, localCode: patch.localCode !== undefined ? patch.localCode.trim() || undefined : o.localCode } : o)) };
}

export function removeOffering(state: OrganisationState, role: Role, id: string): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen tar bort en utbildning.');
  const current = state.offerings.find((o) => o.id === id);
  ensure(current, 'Utbildningen finns inte.');
  ensure(current.status === 'planerad' && !current.pointPlans.some((p) => p.status === 'fastställd'), 'Bara en planerad utbildning utan fastställd poängplan kan tas bort. Avveckla annars.');
  return { ...state, offerings: state.offerings.filter((o) => o.id !== id), log: [entry(role, 'Utbildning borttagen', offeringTitle(current)), ...state.log] };
}

export function addPermit(state: OrganisationState, role: Role, offeringId: string, permit: Omit<Permit, 'id'>): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen registrerar tillstånd.');
  const current = state.offerings.find((o) => o.id === offeringId);
  ensure(current, 'Utbildningen finns inte.');
  ensure(permit.reference.trim(), 'Ange beslutets diarienummer eller referens.');
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(permit.decided), 'Ange beslutsdatum som ÅÅÅÅ-MM-DD.');
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(permit.validFrom), 'Ange giltig från som ÅÅÅÅ-MM-DD.');
  ensure(!permit.validTo || permit.validTo >= permit.validFrom, 'Giltig till kan inte ligga före giltig från.');
  const next: Permit = { ...permit, id: uid(), reference: permit.reference.trim(), scope: permit.scope.trim() };
  return {
    ...state,
    offerings: state.offerings.map((o) => (o.id === offeringId ? { ...o, permits: [...o.permits, next] } : o)),
    log: [entry(role, 'Tillstånd registrerat', `${next.issuer} ${next.reference} för ${offeringTitle(current)}.`), ...state.log],
  };
}

export function removePermit(state: OrganisationState, role: Role, offeringId: string, permitId: string): OrganisationState {
  ensure(isPrincipal(role), 'Bara huvudmannen tar bort ett tillstånd.');
  return { ...state, offerings: state.offerings.map((o) => (o.id === offeringId ? { ...o, permits: o.permits.filter((p) => p.id !== permitId) } : o)) };
}

/** Enskild huvudman behöver godkännande per utbildning; kommunal dokumenterar eget beslut. */
export function permitStatus(state: OrganisationState, o: Offering): { level: 'ok' | 'warning' | 'error'; text: string } {
  const valid = o.permits.filter((p) => p.validFrom <= today && (!p.validTo || p.validTo >= today));
  if (valid.length) return { level: 'ok', text: `${valid[0].issuer} ${valid[0].reference}` };
  if (o.permits.length) return { level: 'error', text: 'Registrerat tillstånd gäller inte i dag.' };
  const unit = unitOf(state, o);
  if (unit?.organizer.type === 'Enskild' && o.kind !== 'introduktionsprogram') {
    const sibling = state.offerings.find((x) => x.id !== o.id && x.unitId === o.unitId && x.kind === o.kind && studyPathCode(x) === studyPathCode(o) && x.permits.length);
    return { level: 'error', text: sibling ? `Tillstånd saknas. ${sibling.name} har ${sibling.permits[0].issuer} ${sibling.permits[0].reference} för samma studieväg; bifoga om beslutet omfattar även denna profil.` : 'Tillstånd saknas. Enskild huvudman behöver godkännande för utbildningen vid skolenheten.' };
  }
  return { level: 'warning', text: 'Inget beslut registrerat.' };
}

export function createPointPlan(state: OrganisationState, role: Role, offeringId: string): OrganisationState {
  ensure(role === 'rektor' || role === 'huvudman', 'Rektor och huvudman utformar poängplaner.');
  const current = state.offerings.find((o) => o.id === offeringId);
  ensure(current, 'Utbildningen finns inte.');
  ensure(current.kind === 'gymnasium', 'Poängplan gäller nationella program i gymnasieskolan.');
  ensure(!openPointPlan(current), 'Det finns redan ett utkast. Fastställ eller arbeta vidare i det.');
  const latest = [...current.pointPlans].sort((a, b) => b.version - a.version)[0];
  const plan: PointPlan = {
    id: uid(),
    version: (latest?.version ?? 0) + 1,
    status: 'utkast',
    specialization: latest ? [...latest.specialization] : [],
    history: [entry(role, 'Utkast påbörjat', latest ? `Utgår från version ${latest.version}.` : 'Nationella block ur katalogen; programfördjupningen väljs.')],
  };
  return { ...state, offerings: state.offerings.map((o) => (o.id === offeringId ? { ...o, pointPlans: [plan, ...o.pointPlans] } : o)) };
}

export function togglePick(state: OrganisationState, role: Role, offeringId: string, planId: string, code: string): OrganisationState {
  ensure(role === 'rektor' || role === 'huvudman', 'Rektor och huvudman utformar poängplaner.');
  const current = state.offerings.find((o) => o.id === offeringId);
  ensure(current, 'Utbildningen finns inte.');
  const plan = current.pointPlans.find((p) => p.id === planId);
  ensure(plan && plan.status === 'utkast', 'Bara ett utkast kan ändras.');
  ensure(specializationOptions(current).some((l) => l.code === code), `${code} får inte erbjudas som programfördjupning på ${current.programCode}.`);
  const specialization = plan.specialization.includes(code) ? plan.specialization.filter((c) => c !== code) : [...plan.specialization, code];
  return { ...state, offerings: state.offerings.map((o) => (o.id === offeringId ? { ...o, pointPlans: o.pointPlans.map((p) => (p.id === planId ? { ...p, specialization } : p)) } : o)) };
}

export function approvePointPlan(state: OrganisationState, role: Role, offeringId: string, planId: string, comment: string): OrganisationState {
  ensure(isPrincipal(role), 'Huvudmannen beslutar vilka ämnen och nivåer som erbjuds (Gymnasieförordningen 4 kap. 6 §).');
  const current = state.offerings.find((o) => o.id === offeringId);
  ensure(current, 'Utbildningen finns inte.');
  const plan = current.pointPlans.find((p) => p.id === planId);
  ensure(plan && plan.status === 'utkast', 'Bara ett utkast kan fastställas.');
  ensure(comment.trim(), 'Dokumentera beslutet.');
  const errors = pointPlanIssues(current, plan).filter((i) => i.level === 'error');
  ensure(!errors.length, `Åtgärda ${errors.length} avvikelse${errors.length > 1 ? 'r' : ''} innan poängplanen fastställs.`);
  return {
    ...state,
    offerings: state.offerings.map((o) =>
      o.id === offeringId
        ? {
            ...o,
            pointPlans: o.pointPlans.map((p) =>
              p.id === planId
                ? { ...p, status: 'fastställd' as const, decidedOn: today, history: [entry(role, 'Fastställd', comment.trim()), ...p.history] }
                : p.status === 'fastställd'
                  ? { ...p, status: 'ersatt' as const, history: [entry(role, 'Ersatt', `Ersatt av version ${plan.version}.`), ...p.history] }
                  : p,
            ),
          }
        : o,
    ),
    log: [entry(role, 'Poängplan fastställd', `${offeringTitle(current)}, version ${plan.version}.`), ...state.log],
  };
}

export function addPointPlanComment(state: OrganisationState, role: Role, offeringId: string, planId: string, text: string): OrganisationState {
  ensure(text.trim(), 'Skriv en kommentar.');
  return { ...state, offerings: state.offerings.map((o) => (o.id === offeringId ? { ...o, pointPlans: o.pointPlans.map((p) => (p.id === planId ? { ...p, history: [entry(role, 'Kommentar', text.trim()), ...p.history] } : p)) } : o)) };
}

const stamp = (role: Role, action: string, comment: string, time: string): Entry => ({ ...entry(role, action, comment), time });
const decided = (id: string, version: number, specialization: string[], on: string): PointPlan => ({
  id,
  version,
  status: 'fastställd',
  specialization,
  decidedOn: on,
  history: [stamp('huvudman', 'Fastställd', 'Programfördjupning enligt förslag.', on), stamp('rektor', 'Utkast påbörjat', 'Nationella block ur katalogen; programfördjupningen väljs.', '2026-04-20')],
});

export function createOrganisationState(): OrganisationState {
  const organizer: Organizer = { name: 'Testskolan i Exempelstad AB', organizationNumber: '5599999901', type: 'Enskild' };
  const unitId = '99999901';
  return {
    organizer,
    activeUnitId: unitId,
    units: [
      {
        id: unitId,
        code: unitId,
        name: 'Testskolan',
        organizer,
        municipality: { code: '0000', name: 'Exempelstad' },
        schoolTypes: [
          { code: 'GR', name: 'Grundskola', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
          { code: 'GY', name: 'Gymnasieskola', programmes: ['SA', 'EK', 'ES'] },
        ],
        headMaster: 'Robin Berg',
        locality: 'Exempelstad',
        status: 'Exempel',
        source: { name: 'Lokalt exempel' },
        pupilRegister: { source: 'Lokalt exempel', count: 20, note: 'Elevregistret är syntetiskt. Koppling enligt SS 12000 är ett senare steg.' },
      },
    ],
    offerings: [
      { id: 'gr', unitId, kind: 'grundskola', name: 'Grundskola', grades: [1, 2, 3, 4, 5, 6, 7, 8, 9], cohort: 'Läsåret 2026/27', status: 'aktiv', permits: [{ id: 'p-gr', issuer: 'Skolinspektionen', reference: 'SI 2019:4410', decided: '2019-09-26', validFrom: '2020-07-01', scope: 'Godkännande som huvudman för grundskola årskurs 1–9 vid Testskolan, Exempelstad.' }], pointPlans: [] },
      { id: 'sa25', unitId, kind: 'gymnasium', name: 'Samhällsvetenskap', localCode: 'SASAP-TS', programCode: 'SA25', orientationCode: 'SASAP', cohort: 'Elever som börjar HT 2026', status: 'aktiv', permits: [{ id: 'p-sa', issuer: 'Skolinspektionen', reference: 'SI 2024:2211', decided: '2024-09-18', validFrom: '2025-07-01', scope: 'Samhällsvetenskapsprogrammet, inriktning samhällsvetenskap, vid Testskolan.' }], pointPlans: [decided('pp-sa', 1, ['ENGE3000X', 'HIST3000X', 'RETO1000X'], '2026-05-06')] },
      { id: 'ek25', unitId, kind: 'gymnasium', name: 'Ekonomi', localCode: 'EKEKI-TS', programCode: 'EK25', orientationCode: 'EKEKI', cohort: 'Elever som börjar HT 2026', status: 'aktiv', permits: [{ id: 'p-ek', issuer: 'Skolinspektionen', reference: 'SI 2024:2212', decided: '2024-09-18', validFrom: '2025-07-01', scope: 'Ekonomiprogrammet, inriktning ekonomi, vid Testskolan.' }], pointPlans: [decided('pp-ek', 1, ['MARK1000X', 'JURI2000X', 'ENGE3000X'], '2026-05-06')] },
      { id: 'es-foto', unitId, kind: 'gymnasium', name: 'Foto och rörlig bild', localCode: 'ESBIF-FOT', programCode: 'ES25', orientationCode: 'ESBIF', cohort: 'Elever som börjar HT 2027', status: 'planerad', permits: [{ id: 'p-es', issuer: 'Skolinspektionen', reference: 'SI 2026:0873', decided: '2026-09-01', validFrom: '2027-07-01', scope: 'Estetiska programmet, inriktning bild och formgivning, vid Testskolan. Start senast läsåret 2028/29.' }], pointPlans: [{ id: 'pp-es-foto', version: 1, status: 'utkast', specialization: ['FOTO1000X', 'FOTO2000X', 'FOTO3000X', 'FILO1000X'], history: [stamp('rektor', 'Utkast påbörjat', 'Foto nivå 1–3 och film- och tv-produktion. 100 poäng kvar att välja.', '2026-09-03')] }] },
      { id: 'es-design', unitId, kind: 'gymnasium', name: 'Design och form', localCode: 'ESBIF-DES', programCode: 'ES25', orientationCode: 'ESBIF', cohort: 'Elever som börjar HT 2027', status: 'planerad', permits: [], pointPlans: [] },
      { id: 'im', unitId, kind: 'introduktionsprogram', name: 'Individuellt alternativ', cohort: 'Läsåret 2026/27', status: 'aktiv', permits: [], pointPlans: [] },
    ],
    assignments: [
      { id: 'rektor-robin', name: 'Robin Berg', role: 'rektor', unitIds: [unitId] },
      { id: 'larare-alex', name: 'Alex Lind', role: 'larare', unitIds: [unitId] },
      { id: 'larare-mira', name: 'Mira Ek', role: 'larare', unitIds: [unitId] },
      { id: 'larare-sam', name: 'Sam Nilsson', role: 'larare', unitIds: [unitId] },
    ],
    log: [],
  };
}
