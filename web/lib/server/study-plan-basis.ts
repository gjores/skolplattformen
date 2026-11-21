import generatedCatalog from '../programplan-catalog.generated.json' with { type: 'json' };
import {
  resolveProgramplanBasis, verifyProgramplanCatalog, type CatalogBlockSubject, type CatalogProgram, type CatalogSubject,
  type ProgramplanLevelRef, type VerifiedProgramplanCatalog,
} from '../programplan-catalog.ts';
import { programplanLevelOrderIssues } from '../programplan-analysis.ts';
import { defaultProgramplanChoiceBlocks } from '../programplan-choice-blocks.ts';
import { requiresProgramplanExamination } from '../programplan-examination.ts';
import { PROGRAMPLAN_LANGUAGES, programplanLanguageName } from '../programplan-languages.ts';
import { programplanProfile, VOCATIONAL_GY25_CODES } from '../programplan-profile.ts';
import { DIPLOMA_WORK_POINTS, INDIVIDUAL_CHOICE_POINTS, programFrame } from '../programplan-table.ts';
import { parseProgramplanTermDistribution } from '../programplan-terms-contract.ts';
import { programplanLevelRanks, programplanTermRows, type ProgramplanTermDistribution } from '../programplan-terms.ts';
import type { StudyPlanCalendarYear, StudyPlanCurrentReply, StudyPlanDraftEdit } from '../study-plan-contract.ts';
import {
  invalidStudyPlan, parseStudyPlanContent, parseStudyPlanLevelRef, parseStudyPlanSource,
  STUDY_PLAN_REGIMES, studyPlanCode, studyPlanDate, studyPlanEnum, studyPlanFields,
  studyPlanInt, studyPlanLabel, studyPlanLevelKey, studyPlanList, studyPlanNullable, studyPlanUnique,
  studyPlanUuid,
  type StudyPlanCatalogLevel, type StudyPlanChoice, type StudyPlanContent, type StudyPlanIssue,
  type StudyPlanAttempt, type StudyPlanLevel, type StudyPlanPath, type StudyPlanSnapshot, type StudyPlanSource,
} from '../study-plan-model.ts';
import { valplanLanguageRule, valplanSubjectAllowed } from '../valplan-model.ts';

type PlanPin = { id: string; revision: number; version: number; specializationRefs: ProgramplanLevelRef[] };
const sourceKinds = ['modernLanguage', 'languageSubject', 'naturalScience', 'individualChoice', 'specialization'] as const;
type SourceKind = typeof sourceKinds[number];
type SourceChoice = {
  id: string; revision: number; kind: 'language' | 'specialization' | 'optional' | 'individual';
  state: 'confirmed' | 'unresolved'; levels: StudyPlanCatalogLevel[]; sourceKind?: SourceKind;
};
type StudyPlanBasis = {
  path: StudyPlanPath; source: StudyPlanSource; startedOn: string; offeringRevision: number;
  programPlan: PlanPin | null; choices: SourceChoice[]; calendar: StudyPlanCalendarYear[]; token: string;
  programTerms?: { cohortStartYear: number; distribution: ProgramplanTermDistribution };
};
type Projection = Pick<StudyPlanCurrentReply, 'basisStatus' | 'basisIssues' | 'availableLevels'>;
const sourceKindsToChoice = {
  modernLanguage: { id: 'mosp', kind: 'language' }, languageSubject: { id: 'sprk', kind: 'language' },
  naturalScience: { id: 'nave', kind: 'optional' }, individualChoice: { id: 'individual', kind: 'individual' },
  specialization: { id: 'specialization', kind: 'specialization' },
} as const;

function catalogLevel(value: unknown): StudyPlanCatalogLevel {
  const { points, label, ...ref } = studyPlanFields(value, ['subjectCode', 'subjectVersion', 'itemCode', 'languageCode', 'points', 'label']);
  return { ...parseStudyPlanLevelRef(ref), points: studyPlanInt(points, 1, 10000), label: studyPlanLabel(label) };
}

export function parseStudyPlanBasis(value: unknown): StudyPlanBasis {
  const r = studyPlanFields(value, ['path', 'source', 'startedOn', 'offeringRevision', 'programPlan', 'choices', 'calendar', 'token'], ['programTerms']);
  const path = studyPlanFields(r.path, ['regime', 'programCode', 'orientationCode', 'apprenticeship', 'specialVariantCode']);
  if (path.apprenticeship !== null || path.specialVariantCode !== null) invalidStudyPlan();
  if (typeof r.token !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(r.token)) invalidStudyPlan();
  const source = parseStudyPlanSource(r.source);
  const choices = studyPlanUnique(studyPlanList(r.choices, value => {
    const c = studyPlanFields(value, ['id', 'revision', 'kind', 'state', 'levels'], ['sourceKind']);
    const state = studyPlanEnum(c.state, ['confirmed', 'unresolved']);
    const kind = studyPlanEnum(c.kind, ['language', 'specialization', 'optional', 'individual']);
    const sourceKind = Object.hasOwn(c, 'sourceKind') ? studyPlanEnum(c.sourceKind, sourceKinds) : undefined;
    const levels = studyPlanUnique(studyPlanList(c.levels, catalogLevel, 50), studyPlanLevelKey);
    if ((state === 'confirmed') !== (levels.length > 0) || (sourceKind && sourceKindsToChoice[sourceKind].kind !== kind)) invalidStudyPlan();
    return { id: studyPlanUuid(c.id), revision: studyPlanInt(c.revision), kind, state, levels, ...(sourceKind ? { sourceKind } : {}) };
  }), c => c.id);
  const choicePins = new Map(source.choices.map(c => [c.id, c.revision]));
  if (choices.length !== choicePins.size || choices.some(c => choicePins.get(c.id) !== c.revision)
    || (source.catalogId === null) !== (source.programVersion === null)) invalidStudyPlan();
  const programPlan = studyPlanNullable(r.programPlan, value => {
    const p = studyPlanFields(value, ['id', 'revision', 'version', 'specializationRefs']);
    const specializationRefs = studyPlanUnique(studyPlanList(p.specializationRefs, value => {
      const l = studyPlanFields(value, ['subjectCode', 'subjectVersion', 'itemCode', 'points']);
      return { subjectCode: studyPlanCode(l.subjectCode), subjectVersion: studyPlanInt(l.subjectVersion),
        itemCode: studyPlanCode(l.itemCode), points: studyPlanInt(l.points, 0, 10000) };
    }, 200), l => l.itemCode);
    return { id: studyPlanUuid(p.id), revision: studyPlanInt(p.revision, 0), version: studyPlanInt(p.version), specializationRefs };
  });
  if (programPlan && !source.catalogId) invalidStudyPlan();
  let programTerms: StudyPlanBasis['programTerms'];
  if (Object.hasOwn(r, 'programTerms')) {
    if (!programPlan || path.regime !== 'national_gy25') invalidStudyPlan();
    const terms = studyPlanFields(r.programTerms, ['cohortStartYear', 'distribution']);
    programTerms = { cohortStartYear: studyPlanInt(terms.cohortStartYear, 1900, 9996), distribution: parseProgramplanTermDistribution(terms.distribution) };
  }
  const calendar = studyPlanUnique(studyPlanList(r.calendar, value => {
    const y = studyPlanFields(value, ['schoolYear', 'htStart', 'htEnd', 'vtStart', 'vtEnd']);
    const schoolYear = studyPlanInt(y.schoolYear, 1900, 9998);
    const htStart = studyPlanDate(y.htStart), htEnd = studyPlanDate(y.htEnd);
    const vtStart = studyPlanDate(y.vtStart), vtEnd = studyPlanDate(y.vtEnd);
    if (htStart > htEnd || htEnd >= vtStart || vtStart > vtEnd
      || htStart < `${schoolYear}-07-01` || vtEnd > `${schoolYear + 1}-06-30`) invalidStudyPlan();
    return { schoolYear, htStart, htEnd, vtStart, vtEnd };
  }, 30), y => String(y.schoolYear));
  return {
    path: { regime: studyPlanEnum(path.regime, STUDY_PLAN_REGIMES), programCode: studyPlanCode(path.programCode),
      orientationCode: studyPlanNullable(path.orientationCode, studyPlanCode), apprenticeship: null, specialVariantCode: null },
    source, startedOn: studyPlanDate(r.startedOn), offeringRevision: studyPlanInt(r.offeringRevision, 0),
    programPlan, choices, calendar, token: r.token, ...(programTerms ? { programTerms } : {}),
  };
}

type ChoiceRule = {
  id: string; kind: StudyPlanChoice['kind']; label: string; points: number | null;
  permits(level: StudyPlanCatalogLevel): boolean;
};
type TakenChoice = { id: string; kind: StudyPlanChoice['kind']; label: string; state: StudyPlanChoice['state']; levels: StudyPlanCatalogLevel[]; targetId?: string };
type Curriculum = {
  basisStatus: Projection['basisStatus']; issues: StudyPlanIssue[]; levelIndex: Map<string, StudyPlanCatalogLevel>;
  fixed: StudyPlanCatalogLevel[]; rules: ChoiceRule[]; sourceChoices: TakenChoice[];
  program: CatalogProgram | null;
};

const sourceChoiceLabels: Record<SourceChoice['kind'], string> = {
  language: 'Språkval från skolans valplan', specialization: 'Programfördjupning från skolans valplan',
  optional: 'Naturvetenskapligt ämne från skolans valplan', individual: 'Individuellt val från skolans valplan',
};
const uniqueLevels = (levels: StudyPlanCatalogLevel[]) => [...new Map(levels.map(l => [studyPlanLevelKey(l), l])).values()];
let catalogPromise: Promise<VerifiedProgramplanCatalog> | undefined;

function subjectApplies(subject: CatalogSubject, on: string): boolean {
  return subject.typeOfSyllabus === 'GRADE_SUBJECT_SYLLABUS' && subject.schoolTypes.includes('GY')
    && subject.startDate !== null && subject.startDate <= on && (!subject.endDate || on <= subject.endDate)
    && (!subject.canceledDate || on < subject.canceledDate);
}

function offeredLevels(catalog: VerifiedProgramplanCatalog, startedOn: string): StudyPlanCatalogLevel[] {
  return catalog.subjects.filter(s => subjectApplies(s, startedOn)).flatMap(subject => {
    const rule = valplanLanguageRule(subject.code);
    const languages = rule?.required && !rule.fixed ? PROGRAMPLAN_LANGUAGES.map(l => l.code) : [rule?.fixed ?? null];
    return subject.items.filter(item => item.points > 0).flatMap(item => languages.map(languageCode => ({
      subjectCode: subject.code, subjectVersion: subject.version, itemCode: item.code, languageCode,
      label: `${subject.name} · ${item.name}${languageCode ? ` · ${programplanLanguageName(languageCode)}` : ''}`, points: item.points,
    })));
  });
}

function needsExaminationReview(basis: StudyPlanBasis): boolean {
  // SQL uses 1 July to select a catalogue when only the cohort year is known.
  // An actual school placement later that same year cannot establish the type of exam.
  const possibleAutumn2028 = basis.programPlan === null && basis.startedOn === '2028-07-01'
    && basis.source.placementStartsOn >= '2028-07-02';
  return requiresProgramplanExamination(basis.path.programCode, possibleAutumn2028 ? '2028-07-02' : basis.startedOn);
}

function getSourceChoices(basis: StudyPlanBasis, curriculum: Curriculum, pinned: StudyPlanCatalogLevel[]): TakenChoice[] {
  const choices: TakenChoice[] = basis.choices.map(choice => {
    const id = `valplan:${choice.id}`;
    const levels = choice.levels.flatMap(l => {
      const level = curriculum.levelIndex.get(studyPlanLevelKey(l));
      if (level?.points === l.points) return [level];
      curriculum.issues.push({ code: 'choice_level_source_missing', field: id });
      return [];
    });
    const targetId = choice.sourceKind ? sourceKindsToChoice[choice.sourceKind].id : undefined;
    return { id, kind: choice.kind, label: sourceChoiceLabels[choice.kind], targetId,
      state: levels.length === choice.levels.length ? choice.state : 'unresolved', levels };
  });
  if (basis.programPlan && pinned.length) choices.unshift({
    id: `programplan:${basis.programPlan.id}`, kind: 'specialization', label: 'Fastställd programfördjupning',
    state: 'confirmed', levels: pinned, targetId: 'specialization',
  });
  return choices;
}

async function curriculumFor(basis: StudyPlanBasis): Promise<Curriculum> {
  const curriculum: Curriculum = { basisStatus: 'ready', issues: [], levelIndex: new Map(), fixed: [], rules: [], sourceChoices: [], program: null };
  function incomplete(code: string): Curriculum {
    curriculum.basisStatus = code === 'unsupported_path' ? 'unsupported' : 'incomplete';
    curriculum.issues.push({ code, field: 'path' });
    curriculum.sourceChoices = getSourceChoices(basis, curriculum, []);
    return curriculum;
  }

  if (basis.path.regime !== 'national_gy25') return incomplete('unsupported_path');
  const { catalogId, programVersion } = basis.source;
  if (!catalogId || !programVersion) return incomplete('catalog_missing');
  let catalog: VerifiedProgramplanCatalog;
  try {
    catalogPromise ??= verifyProgramplanCatalog(generatedCatalog);
    catalog = await catalogPromise;
  } catch {
    return incomplete('catalog_unavailable');
  }
  if (catalog.catalogId !== catalogId) return incomplete('catalog_unavailable');
  const program = catalog.programs.find(p => p.code === basis.path.programCode && p.version === programVersion);
  if (!program || !programplanProfile(program)) return incomplete('catalog_program_missing');
  if (needsExaminationReview(basis)) curriculum.issues.push({ code: 'examination_source_needs_review', field: 'levels' });
  const { orientationCode } = basis.path;
  const orientation = program.orientations.find(item => item.code === orientationCode);
  const orientationPending = !orientation && (orientationCode !== null || program.orientations.length > 0);
  const programRef = { code: program.code, version: program.version };
  const specializationRefs = basis.programPlan?.specializationRefs ?? [];
  const resolved = resolveProgramplanBasis(catalog, { catalogId, programRef, orientationCode, startedOn: basis.startedOn, specializationRefs });

  if (orientationPending) {
    curriculum.issues.push({ code: orientationCode === null ? 'orientation_required' : 'orientation_not_found', field: 'orientation' });
  } else if (resolved.status !== 'resolved') {
    curriculum.issues.push(...resolved.diagnostics.map(d => ({ code: d.code, field: d.blockId ?? 'path' })));
  } else {
    curriculum.program = program;
  }
  const allLevels = offeredLevels(catalog, basis.startedOn);
  curriculum.levelIndex = new Map(allLevels.map(l => [studyPlanLevelKey(l), l]));
  const fixedByBlock = (subjects: CatalogBlockSubject[]) => subjects.flatMap(subject => subject.levels.flatMap(item => {
    if (subject.subjectVersion === null) return [];
    const level = curriculum.levelIndex.get(studyPlanLevelKey({
      subjectCode: subject.code, subjectVersion: subject.subjectVersion, itemCode: item.code, languageCode: valplanLanguageRule(subject.code)?.fixed ?? null,
    }));
    if (level?.points === item.points) return [level];
    curriculum.issues.push({ code: 'fixed_level_source_missing', field: subject.code });
    return [];
  }));

  const blocks = [...program.foundation, ...program.programmeSpecific, ...(orientation?.subjects ?? [])];
  curriculum.fixed = uniqueLevels(fixedByBlock(blocks.filter(s => !s.optional)));
  // The current national edition's paired alternatives are the two Swedish progressions.
  const swedish = blocks.filter(s => s.optional && ['SVEN', 'SVEA'].includes(s.code));
  const swedishKeys = new Set(fixedByBlock(swedish).map(studyPlanLevelKey));
  curriculum.rules.push({
    id: 'svenska', kind: 'optional', label: 'Svenska eller svenska som andraspråk',
    points: swedish[0]?.levels.reduce((sum, l) => sum + l.points, 0) ?? null,
    permits: level => swedishKeys.has(studyPlanLevelKey(level)),
  });
  for (const s of blocks.filter(s => s.optional && !swedish.includes(s))) {
    curriculum.issues.push({ code: 'unsupported_alternative', field: s.code });
  }

  const slots = defaultProgramplanChoiceBlocks(program, orientationCode).filter(b => b.kind !== 'individualChoice');
  const kinds = { modernLanguage: 'language', languageSubject: 'language', naturalScience: 'optional' } as const;
  for (const slot of slots) {
    const kind = slot.kind;
    if (kind !== 'modernLanguage' && kind !== 'languageSubject' && kind !== 'naturalScience') continue;
    curriculum.rules.push({ id: slot.id, kind: kinds[kind], label: `${slot.name} · ${slot.points} p`, points: slot.points,
      permits: level => valplanSubjectAllowed(kind, level.subjectCode) });
  }
  const recognizedSlots = new Set(['MOSP', 'SPRK', 'NAVE']);
  for (const subject of blocks.filter(s => !s.levels.length && !recognizedSlots.has(s.code))) {
    curriculum.issues.push({ code: 'subject_levels_unresolved', field: subject.code });
  }

  const specializationKeys = new Set(program.specialization.flatMap(s => s.levels.filter(l => l.points > 0).map(l =>
    `${s.code}/${s.subjectVersion}/${l.code}/${l.points}`)));
  const room = programFrame(program, orientationCode).specializationRoom;
  curriculum.rules.push(
    { id: 'specialization', kind: 'specialization', label: room === null ? 'Programfördjupning' : `Programfördjupning · ${room} p`, points: room,
      permits: level => specializationKeys.has(`${level.subjectCode}/${level.subjectVersion}/${level.itemCode}/${level.points}`) },
    { id: 'individual', kind: 'individual', label: 'Individuellt val · 200 p', points: INDIVIDUAL_CHOICE_POINTS,
      permits: level => level.points <= INDIVIDUAL_CHOICE_POINTS },
    { id: 'extra', kind: 'optional', label: 'Ytterligare nivåer enligt beslut', points: null, permits: () => true },
  );
  const pinned = (resolved.basis?.selectedSpecialization ?? []).flatMap(l => {
    const level = curriculum.levelIndex.get(studyPlanLevelKey({
      subjectCode: l.subjectCode, subjectVersion: l.subjectVersion, itemCode: l.itemCode, languageCode: null,
    }));
    if (level) return [level];
    curriculum.issues.push({ code: 'choice_level_source_missing', field: 'specialization' });
    return [];
  });
  curriculum.sourceChoices = getSourceChoices(basis, curriculum, pinned);
  if (program.orientations.length || orientationCode !== null) curriculum.sourceChoices.unshift({
    id: 'orientation', kind: 'orientation', label: orientation?.name ?? 'Inriktning', state: orientation ? 'confirmed' : 'unresolved',
    levels: fixedByBlock(orientation?.subjects.filter(s => !s.optional) ?? []),
  });
  if (curriculum.issues.length > 0) curriculum.basisStatus = 'incomplete';
  return curriculum;
}

function sourceAssignments(curriculum: Curriculum): Map<string, StudyPlanCatalogLevel[]> {
  const assignments = new Map<string, StudyPlanCatalogLevel[]>();
  for (const choice of curriculum.sourceChoices) {
    if (choice.state !== 'confirmed') continue;
    for (const level of choice.levels) {
      const applicable = curriculum.rules.filter(rule => sourceAllowsChoice(choice, rule) && rule.permits(level));
      if (applicable.length !== 1) continue;
      const rule = applicable[0];
      assignments.set(rule.id, [...(assignments.get(rule.id) ?? []), level]);
    }
  }
  return assignments;
}

function choicesByLevel(choices: TakenChoice[]): Map<string, TakenChoice> {
  return new Map(choices.flatMap(choice => choice.levels.map(level => [studyPlanLevelKey(level), choice] as const)));
}

function sourceAllowsChoice(source: TakenChoice | undefined, rule: ChoiceRule): boolean {
  return !source || (source.state === 'confirmed' && source.kind === rule.kind && rule.id !== 'extra' && rule.id !== 'svenska'
    && (!source.targetId || source.targetId === rule.id));
}

export async function projectStudyPlanBasis(basis: StudyPlanBasis): Promise<Projection> {
  const curriculum = await curriculumFor(basis);
  const fixed = new Set(curriculum.fixed.map(studyPlanLevelKey));
  const assigned = sourceAssignments(curriculum);
  const assignedKeys = new Set([...assigned.values()].flat().map(studyPlanLevelKey));
  const bySource = choicesByLevel(curriculum.sourceChoices);
  const availableLevels = [...curriculum.levelIndex.values()].flatMap(level => {
    const key = studyPlanLevelKey(level);
    if (fixed.has(key) || assignedKeys.has(key)) return [];
    const choiceIds = curriculum.rules.filter(rule => {
      if (!sourceAllowsChoice(bySource.get(key), rule)) return false;
      if (rule.id === 'extra') return !bySource.has(key);
      if (rule.points === null || rule.points === 0 || !rule.permits(level)) return false;
      const taken = uniqueLevels(assigned.get(rule.id) ?? []).reduce((sum, l) => sum + l.points, 0);
      return taken + level.points <= rule.points;
    }).map(rule => rule.id);
    return choiceIds.length ? [{ ...level, choiceIds }] : [];
  });
  return { basisStatus: curriculum.basisStatus, basisIssues: uniqueIssues(curriculum.issues), availableLevels };
}

function uniqueIssues(issues: StudyPlanIssue[]): StudyPlanIssue[] {
  return [...new Map(issues.map(issue => [`${issue.code}/${issue.field}`, issue])).values()];
}
function isSourceChoice(id: string): boolean {
  return id === 'orientation' || id.startsWith('valplan:') || id.startsWith('programplan:');
}
function needsHistoricalLevel(level: StudyPlanLevel, decisions: StudyPlanContent['decisions']): boolean {
  return level.attempts.some(a => a.actual.certainty === 'unknown' || a.actual.start !== null || a.actual.end !== null)
    || decisions.some(d => d.levelIds.includes(level.id) || d.replacementLevelIds.includes(level.id));
}
function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(id => b.includes(id));
}

function validProgression(rule: ChoiceRule, picks: StudyPlanCatalogLevel[]): boolean {
  return rule.id !== 'svenska' || new Set(picks.map(l => l.subjectCode)).size === 1;
}

type PlannedPeriod = Pick<StudyPlanAttempt, 'plannedStart' | 'plannedEnd'>;

function termRowLevelKeys(rowKey: string, programCode: string): string[] {
  if (rowKey === 'meta:diplomaWork') return [studyPlanLevelKey({ kind: 'diploma_work',
    subjectCode: null, subjectVersion: null, itemCode: `GYAR${programCode}`, languageCode: null })];
  const [part, ...key] = rowKey.split(':');
  if (part === 'block' || part === 'meta') return [];
  const levels = part === 'alternative' ? key.slice(1).join(':').split('+') : [key.join(':')];
  return levels.flatMap(level => {
    const [subjectCode, version, itemCode] = level.split(':');
    const language = valplanLanguageRule(subjectCode);
    if (language?.required && !language.fixed) return [];
    return [studyPlanLevelKey({ subjectCode, subjectVersion: Number(version), itemCode, languageCode: language?.fixed ?? null })];
  });
}

function programPeriods(basis: StudyPlanBasis, program: CatalogProgram | null): Map<string, PlannedPeriod | null> {
  const periods = new Map<string, PlannedPeriod | null>();
  const { programPlan, programTerms, source, startedOn } = basis;
  if (!program || !programPlan || !programTerms || !source.catalogId) return periods;
  const { cohortStartYear, distribution } = programTerms;
  const { orientationCode } = basis.path;
  const rows = programplanTermRows(program, {
    catalogId: source.catalogId, programRef: { code: program.code, version: program.version }, orientationCode, startedOn,
    specializationRefs: programPlan.specializationRefs, choiceBlocks: defaultProgramplanChoiceBlocks(program, orientationCode),
  });
  const byRow = new Map(distribution.map(item => [item.rowKey, item.points]));
  const review = new Set(programplanLevelOrderIssues(rows, distribution, programplanLevelRanks(program)).flatMap(issue =>
    issue.target?.kind === 'row' ? [issue.target.rowKey] : []));
  const toTerm = (index: number): NonNullable<PlannedPeriod['plannedStart']> => ({
    kind: 'term', schoolYear: cohortStartYear + Math.floor(index / 2), term: index % 2 === 0 ? 'HT' : 'VT',
  });
  for (const row of rows) {
    const points = byRow.get(row.key);
    let period: PlannedPeriod | null = null;
    if (points && !review.has(row.key) && points.reduce((sum, value) => sum + value, 0) === row.points) {
      const first = points.findIndex(value => value > 0), last = points.findLastIndex(value => value > 0);
      if (first !== -1 && points.slice(first, last + 1).every(value => value > 0)) {
        period = { plannedStart: toTerm(first), plannedEnd: toTerm(last) };
      }
    }
    for (const key of termRowLevelKeys(row.key, program.code)) periods.set(key, periods.has(key) ? null : period);
  }
  return periods;
}

export async function prepareStudyPlanDraft(
  basis: StudyPlanBasis, latest: StudyPlanSnapshot | null, payload: StudyPlanDraftEdit,
): Promise<StudyPlanContent> {
  const curriculum = await curriculumFor(basis);
  const periods = latest === null ? programPeriods(basis, curriculum.program) : null;
  const old = latest?.content;
  const oldByKey = new Map(old?.levels.map(level => [studyPlanLevelKey(level), level]));
  const oldById = new Map(old?.levels.map(level => [level.id, level]));
  const decisions = old?.decisions ?? [];
  const edits = new Map(payload.dates.map(edit => [edit.attemptId, edit]));
  const levels = new Map<string, StudyPlanLevel>();
  const choices: StudyPlanChoice[] = [];
  const issues = [...curriculum.issues];
  const addLevel = (level: Omit<StudyPlanLevel, 'id' | 'attempts'>): string => {
    const key = studyPlanLevelKey(level);
    const prior = levels.get(key) ?? oldByKey.get(key);
    const period = periods?.get(key);
    const saved = {
      ...level, id: prior?.id ?? crypto.randomUUID(),
      attempts: prior?.attempts ?? [{
        id: crypto.randomUUID(), plannedStart: period?.plannedStart ?? null, plannedEnd: period?.plannedEnd ?? null,
        actual: { certainty: 'recorded', start: null, end: null },
      } as const],
    } satisfies StudyPlanLevel;
    levels.set(key, saved);
    return saved.id;
  };
  const addAcademicLevel = (level: StudyPlanCatalogLevel) => addLevel({
    subjectCode: level.subjectCode, subjectVersion: level.subjectVersion, itemCode: level.itemCode, languageCode: level.languageCode,
    label: level.label, points: level.points, kind: 'gy25_level',
  });
  for (const level of curriculum.fixed) addAcademicLevel(level);
  if (basis.path.regime === 'national_gy25' && !needsExaminationReview(basis)) addLevel({
    kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: `GYAR${basis.path.programCode}`,
    languageCode: null, label: 'Gymnasiearbete', points: DIPLOMA_WORK_POINTS,
  });
  const fixedKeys = new Set(curriculum.fixed.map(studyPlanLevelKey));
  const sourceKeys = new Map<string, string>();
  for (const choice of curriculum.sourceChoices) {
    for (const level of choice.levels) {
      if (choice.id === 'orientation') continue;
      const key = studyPlanLevelKey(level);
      if (sourceKeys.has(key) || fixedKeys.has(key)) issues.push({ code: 'duplicate_level_source', field: choice.id });
      sourceKeys.set(key, choice.id);
    }
    choices.push({ id: choice.id, kind: choice.kind, label: choice.label, state: choice.state, levelIds: choice.levels.map(addAcademicLevel) });
  }

  const assigned = sourceAssignments(curriculum);
  const sourceAssigned = new Set([...assigned.values()].flat().map(studyPlanLevelKey));
  const used = new Set([...fixedKeys, ...sourceAssigned]);
  const bySource = choicesByLevel(curriculum.sourceChoices);
  const rules = new Map(curriculum.rules.map(rule => [rule.id, rule]));
  const previouslySourced = new Set(old?.choices.filter(c => isSourceChoice(c.id)).flatMap(c => c.levelIds));
  const oldManual = old?.choices.filter(c => rules.has(c.id)).flatMap(choice =>
    choice.levelIds.flatMap(id => {
      const level = oldById.get(id);
      if (!level) return [];
      const key = studyPlanLevelKey(level);
      if (previouslySourced.has(id) && (sourceAssigned.has(key) || !bySource.has(key))) return [];
      return [{ choiceId: choice.id, level }];
    })) ?? [];
  const manual = new Map<string, StudyPlanCatalogLevel[]>();
  for (const choice of payload.selections ?? oldManual) {
    const rule = rules.get(choice.choiceId), key = studyPlanLevelKey(choice.level), level = curriculum.levelIndex.get(key);
    if (!rule || !level || !rule.permits(level) || used.has(key) || !sourceAllowsChoice(bySource.get(key), rule)) {
      if (payload.selections !== undefined) invalidStudyPlan();
      issues.push({ code: 'previous_choice_needs_review', field: choice.choiceId });
      continue;
    }
    used.add(key);
    manual.set(rule.id, [...(manual.get(rule.id) ?? []), level]);
  }
  const allocated = new Set([...assigned.values(), ...manual.values()].flat().map(studyPlanLevelKey));
  for (const choice of curriculum.sourceChoices) {
    if (choice.id !== 'orientation' && choice.state === 'confirmed' && choice.levels.some(level => !allocated.has(studyPlanLevelKey(level)))) {
      issues.push({ code: 'source_choice_needs_review', field: choice.id });
    }
  }

  const confirm = new Set(payload.confirmedChoiceIds ?? []);
  if ([...confirm].some(id => !rules.has(id))) invalidStudyPlan();
  for (const rule of curriculum.rules) {
    const picks = uniqueLevels([...(assigned.get(rule.id) ?? []), ...(manual.get(rule.id) ?? [])]);
    const levelIds = picks.map(addAcademicLevel);
    const points = picks.reduce((sum, level) => sum + level.points, 0);
    const prior = old?.choices.find(choice => choice.id === rule.id);
    const coveredByDecisions = levelIds.every(id => decisions.some(d =>
      (d.kind === 'extended' || d.kind === 'adapted' || d.kind === 'replaced')
        && (d.levelIds.includes(id) || d.replacementLevelIds.includes(id))));
    const isExtra = rule.id === 'extra';
    const complete = isExtra ? coveredByDecisions : rule.points === points && validProgression(rule, picks);
    const notApplicable = (rule.points === 0 || isExtra) && picks.length === 0;
    const confirmed = complete && (isExtra || confirm.has(rule.id) || !manual.has(rule.id)
      || (payload.confirmedChoiceIds === undefined && prior?.state === 'confirmed' && sameIds(prior.levelIds, levelIds)));
    if (confirm.has(rule.id) && !complete && !isExtra) issues.push({ code: 'choice_scope_incomplete', field: rule.id });
    if (isExtra && picks.length && !coveredByDecisions) issues.push({ code: 'additional_level_decision_needed', field: rule.id });
    choices.push({ id: rule.id, kind: rule.kind, label: rule.label,
      state: notApplicable ? 'not_applicable' : confirmed ? 'confirmed' : 'unresolved', levelIds });
  }
  for (const level of old?.levels ?? []) {
    const key = studyPlanLevelKey(level);
    if (!levels.has(key) && needsHistoricalLevel(level, decisions)) {
      levels.set(key, level);
      if (!decisions.some(d => ['reduced', 'replaced', 'adapted', 'eligibility_opt_out'].includes(d.kind) && d.levelIds.includes(level.id))) {
        issues.push({ code: 'historical_level_needs_review', field: 'levels' });
      }
    }
  }

  const editedLevels = [...levels.values()].map(level => ({ ...level, attempts: level.attempts.map(attempt => {
    const edit = edits.get(attempt.id);
    if (!edit) return attempt;
    if (edit.levelId !== level.id) invalidStudyPlan();
    edits.delete(attempt.id);
    return { ...attempt, plannedStart: edit.plannedStart, plannedEnd: edit.plannedEnd };
  }) }));
  if (edits.size) invalidStudyPlan();
  if (payload.apprenticeship === true && !VOCATIONAL_GY25_CODES.some(code => code === basis.path.programCode)) invalidStudyPlan();
  return parseStudyPlanContent({
    path: { ...basis.path, apprenticeship: payload.apprenticeship ?? old?.path.apprenticeship ?? basis.path.apprenticeship },
    source: basis.source, levels: editedLevels, choices, decisions,
    compulsorySchoolSubjects: payload.compulsorySchoolSubjects === undefined ? old?.compulsorySchoolSubjects ?? null : payload.compulsorySchoolSubjects,
    distanceTeaching: payload.distanceTeaching ?? old?.distanceTeaching ?? { kind: 'unknown', minutes: null },
    dialogue: null, sourceIssues: uniqueIssues(issues),
  });
}
