// Regelförankrad analys av timplaner för grundskola och introduktionsprogram.
//
// En ren funktion: samma indata (fryst regelprofil, sparad revision och celler) ger samma resultat.
// Analysen läser inga globala regler. Profilen följer med indata så att ett resultat alltid kan
// hänföras till exakt den regelversion som användes. Varje resultat anger kategori, vad som räknats,
// faktiska och förväntade timmar, källa och giltighet samt en åtgärdsmål när det finns en berörd rad.
//
// Gränser: planerad tid är inte genomförd undervisning, och ingen profil kan förklara ett
// individuellt beslut uppfyllt. En saknad eller okänd profil ger "Att kontrollera", aldrig "Uppfyllt".
// Gymnasiets timplan hör inte hit; den kräver fastställd programplan och egen regelprofil.

export type Category = 'fel' | 'risk' | 'info' | 'ok';
export type Stage = 'låg' | 'mellan' | 'hög';
export type StageHours = Record<Stage, number>;
export type RuleSource = { url: string; label: string; verifiedOn: string; validFrom: string | null; validTo: string | null };
export type GrundskolaProfile = {
  id: string; schoolKind: 'grundskola'; source: RuleSource;
  /** Garanterad tid per stadium, exklusive tid som delas mellan stadier (HKK i låg- och mellanstadiet). */
  stageHours: StageHours; total: number;
  subjects: { rowId: string; name: string; hours: StageHours; protected: boolean; shared?: { stages: Stage[]; hours: number } }[];
  /** Ämnesgrupper (NO/SO): gruppraden gäller i övriga stadier, medlemsraderna i `memberStages`. */
  groups: { rowId: string; name: string; hours: StageHours; memberStages: Stage[]; members: { rowId: string; name: string; minimum: StageHours }[] }[];
  schoolChoice: { rowId: string; maxHours: number; maxReductionPercent: number };
};
export type ImProfile = {
  id: string; schoolKind: 'introduktionsprogram'; source: RuleSource;
  minTeachingHoursPerWeek: number;
  rows: { rowId: string; name: string; kind: 'undervisning' | 'annan' }[];
};
export type RuleProfile = GrundskolaProfile | ImProfile;
export type ActionTarget =
  | { type: 'cell'; rowId: string; columnId: string }
  | { type: 'row'; rowId: string; columnIds: string[] }
  | null;
export type TimplanIssue = {
  /** Stabilt mellan körningar med samma indata. */
  issueId: string; ruleId: string; category: Category; title: string; detail: string;
  actual: number | null; expected: number | null; unit: 'timmar' | 'timmar per vecka' | null;
  /** regel: belagd i profilens källa. lokal: planeringsbedömning. underlag: kontroll av själva indata. */
  basis: 'regel' | 'lokal' | 'underlag'; sourceUrl: string | null; validFrom: string | null; validTo: string | null;
  localParameter: { name: string; value: number } | null;
  /** Obligatorisk kontrollpunkt (bara för Att kontrollera). */
  mandatory: boolean;
  /** Fel och obligatoriska kontrollpunkter hindrar beslut; risker, allmän information och Uppfyllt gör det inte. */
  blocksDecision: boolean;
  affectedRows: string[]; affectedColumns: string[]; actionTarget: ActionTarget;
};
/** Lokala planeringsbedömningar. De är aldrig lagkrav och redovisas som risk med parameterns namn. */
export type LocalParameters = {
  /** Ett ämne med minst så många timmar i ett stadium bör ha tid i varje årskurs. */
  subjectEveryYearMinStageHours: number;
  /** IM: bekräftad undervisning mindre än så här över gränsen ger en lågmarginalsrisk. */
  imLowMarginHours: number;
  /** IM: andel annan aktivitet (procent av undervisning och annan aktivitet) över vilken balansen flaggas. */
  imOtherActivityMaxPercent: number;
};
export const DEFAULT_LOCAL_PARAMETERS: LocalParameters = { subjectEveryYearMinStageHours: 100, imLowMarginHours: 2, imOtherActivityMaxPercent: 40 };
export type AnalysisInput = {
  schoolKind: 'grundskola' | 'introduktionsprogram';
  schoolId: string; savedRevision: number | null; analysisVersion: string;
  /** Datum då planen ska gälla; avgör om profilen är tillämplig. */
  appliesOn: string | null; profile: RuleProfile | null;
  /** Årskurser som planens kolumner motsvarar (grundskola). Standard: 1–9. */
  grades?: number[]; cells: Record<string, number[]>;
  valuesAre: 'saved' | 'own-unsaved';
  localParameters?: Partial<LocalParameters>;
};
export type ReadinessReason = { code: 'own-unsaved' | 'no-saved-revision' | 'analysis-version-missing'; text: string };
export type TimplanAnalysis = {
  analysisVersion: string; schoolKind: AnalysisInput['schoolKind']; schoolId: string; savedRevision: number | null;
  /** Gäller analysen serverns sparade revision eller användarens egna osparade värden. */
  scope: 'saved' | 'own-unsaved';
  profileId: string | null; issues: TimplanIssue[]; counts: Record<Category, number>;
  /** Beslutsunderlaget är inte klart: blockerande resultat eller skäl som rör underlaget. Räknas aldrig fram från totalsumman. */
  blocksDecision: boolean; blockingIssueIds: string[]; readinessReasons: ReadinessReason[];
};

const hours = (låg: number, mellan: number, hög: number): StageHours => ({ låg, mellan, hög });
const SKOLVERKET_TIMPLAN = 'https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan';

/**
 * Timplan för grundskolan från läsåret 2024/25. Summor enligt Skolverket (läst 2026-10-04): 1 882 låg,
 * 2 334 mellan, 40 gemensamt för låg- och mellanstadiet (HKK) och 2 634 hög, totalt 6 890 timmar.
 * Ämnesvisa timmar och minimitider är hämtade ur den tidigare modellens tabell över Skolförordningens
 * bilaga 1 och stäms av mot summorna ovan; de är inte hämtade på nytt från källan.
 */
export const GRUNDSKOLA_PROFILE: GrundskolaProfile = {
  id: 'gr-2024-25', schoolKind: 'grundskola',
  source: { url: SKOLVERKET_TIMPLAN, label: 'Skolverket: timplan för grundskolan från 2024/2025', verifiedOn: '2026-10-04', validFrom: '2024-07-01', validTo: null },
  stageHours: hours(1882, 2334, 2634), total: 6890,
  subjects: [
    { rowId: 'bild', name: 'Bild', hours: hours(60, 80, 100), protected: false },
    { rowId: 'engelska', name: 'Engelska', hours: hours(60, 220, 200), protected: true },
    { rowId: 'hkk', name: 'Hem- och konsumentkunskap', hours: hours(0, 0, 90), protected: false, shared: { stages: ['låg', 'mellan'], hours: 40 } },
    { rowId: 'idrott', name: 'Idrott och hälsa', hours: hours(140, 180, 280), protected: false },
    { rowId: 'matematik', name: 'Matematik', hours: hours(420, 410, 400), protected: true },
    { rowId: 'musik', name: 'Musik', hours: hours(80, 80, 80), protected: false },
    { rowId: 'slojd', name: 'Slöjd', hours: hours(50, 140, 140), protected: false },
    { rowId: 'svenska', name: 'Svenska eller svenska som andraspråk', hours: hours(680, 520, 290), protected: true },
    { rowId: 'teknik', name: 'Teknik', hours: hours(47, 65, 88), protected: false },
    { rowId: 'sprakval', name: 'Språkval', hours: hours(0, 48, 272), protected: true },
  ],
  groups: [
    { rowId: 'no', name: 'Naturorienterande ämnen', hours: hours(145, 216, 289), memberStages: ['mellan', 'hög'], members: [
      { rowId: 'biologi', name: 'Biologi', minimum: hours(0, 60, 80) }, { rowId: 'fysik', name: 'Fysik', minimum: hours(0, 60, 80) },
      { rowId: 'kemi', name: 'Kemi', minimum: hours(0, 60, 80) }] },
    { rowId: 'so', name: 'Samhällsorienterande ämnen', hours: hours(200, 375, 405), memberStages: ['mellan', 'hög'], members: [
      { rowId: 'geografi', name: 'Geografi', minimum: hours(0, 75, 80) }, { rowId: 'historia', name: 'Historia', minimum: hours(0, 90, 100) },
      { rowId: 'religion', name: 'Religionskunskap', minimum: hours(0, 75, 80) }, { rowId: 'samhallskunskap', name: 'Samhällskunskap', minimum: hours(0, 75, 90) }] },
  ],
  schoolChoice: { rowId: 'skolansval', maxHours: 600, maxReductionPercent: 20 },
};

/**
 * Introduktionsprogram: i genomsnitt minst 23 timmars undervisning per vecka (Skolverket, läst 2026-10-04).
 * Källan anger inget startdatum, så giltigheten redovisas som okänd. Raderna klassificeras här och bara här:
 * undervisning räknas mot ramen, annan aktivitet (praktik, mentorstid) gör det inte.
 */
export const IM_PROFILE: ImProfile = {
  id: 'im-2026-10', schoolKind: 'introduktionsprogram',
  source: { url: 'https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema',
    label: 'Skolverket: undervisningstid, lärotider och schema', verifiedOn: '2026-10-04', validFrom: null, validTo: null },
  minTeachingHoursPerWeek: 23,
  rows: [
    { rowId: 'im-sv', name: 'Svenska eller svenska som andraspråk, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-ma', name: 'Matematik, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-en', name: 'Engelska, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-sh', name: 'Samhällskunskap, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-idh', name: 'Idrott och hälsa', kind: 'undervisning' },
    { rowId: 'im-praktik', name: 'Praktik och yrkesorientering', kind: 'annan' },
    { rowId: 'im-mentor', name: 'Studiehandledning och mentorstid', kind: 'annan' },
  ],
};

const STAGES: Stage[] = ['låg', 'mellan', 'hög'];
const STAGE_KEY: Record<Stage, string> = { låg: 'lag', mellan: 'mellan', hög: 'hog' };
const STAGE_NAME: Record<Stage, string> = { låg: 'lågstadiet', mellan: 'mellanstadiet', hög: 'högstadiet' };
const ALL_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const KIND_NAME = { grundskola: 'grundskolan', introduktionsprogram: 'introduktionsprogrammen' } as const;
const CATEGORY_ORDER: Category[] = ['fel', 'risk', 'info', 'ok'];
const stageOfGrade = (grade: number): Stage => grade <= 3 ? 'låg' : grade <= 6 ? 'mellan' : 'hög';
const columnId = (grade: number) => `ak${grade}`;
const fmt = (n: number) => n.toLocaleString('sv-SE');
const list = (items: string[]) => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} och ${items[items.length - 1]}`;
const lowestAllowed = (national: number, reductionPercent: number) => Math.ceil(national * (100 - reductionPercent) / 100);
const rowTarget = (rowId: string, columnIds: string[]): ActionTarget => ({ type: 'row', rowId, columnIds });
const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validRow = (value: unknown, width: number): value is number[] => Array.isArray(value) && value.length === width
  && value.every(n => Number.isInteger(n) && n >= 0 && n <= 2000);

type Draft = {
  ruleId: string; category: Category; title: string; detail: string;
  actual?: number | null; expected?: number | null; unit?: TimplanIssue['unit'];
  basis?: TimplanIssue['basis']; source?: RuleSource | null; mandatory?: boolean;
  localParameter?: TimplanIssue['localParameter']; rows?: string[]; columns?: string[]; target?: ActionTarget;
};
type Add = (issueId: string, draft: Draft) => void;

function collector() {
  const issues: TimplanIssue[] = [];
  const seen = new Set<string>();
  const add: Add = (issueId, d) => {
    if (seen.has(issueId)) return;
    seen.add(issueId);
    issues.push({
      issueId, ruleId: d.ruleId, category: d.category, title: d.title, detail: d.detail,
      actual: d.actual ?? null, expected: d.expected ?? null, unit: d.unit ?? null,
      basis: d.basis ?? 'regel', sourceUrl: d.source?.url ?? null, validFrom: d.source?.validFrom ?? null, validTo: d.source?.validTo ?? null,
      localParameter: d.localParameter ?? null, mandatory: d.category === 'info' && d.mandatory === true,
      blocksDecision: d.category === 'fel' || (d.category === 'info' && d.mandatory === true),
      affectedRows: d.rows ?? [], affectedColumns: d.columns ?? [], actionTarget: d.target ?? null,
    });
  };
  return { issues, add };
}

function resolveLocalParameters(overrides: Partial<LocalParameters> | undefined): LocalParameters {
  const result = { ...DEFAULT_LOCAL_PARAMETERS };
  for (const key of Object.keys(result) as (keyof LocalParameters)[]) {
    const value = overrides?.[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) result[key] = value;
  }
  return result;
}

function profileProblem(input: AnalysisInput): string | null {
  const profile = input.profile;
  if (!profile) return 'Ingen regelprofil är vald för skolformen och tidpunkten.';
  if (profile.schoolKind !== input.schoolKind) return `Profilen ${profile.id} gäller ${KIND_NAME[profile.schoolKind]}, inte ${KIND_NAME[input.schoolKind]}.`;
  if (!isDate(input.appliesOn)) return 'Datum då planen ska gälla saknas, så profilens giltighet kan inte kontrolleras.';
  const { validFrom, validTo, label } = profile.source;
  if (validFrom && input.appliesOn < validFrom) return `${label} gäller från ${validFrom}, planen gäller ${input.appliesOn}.`;
  if (validTo && input.appliesOn > validTo) return `${label} gällde till ${validTo}, planen gäller ${input.appliesOn}.`;
  return null;
}

function grundskola(add: Add, input: AnalysisInput, p: GrundskolaProfile, params: LocalParameters): void {
  const src = p.source;
  const pct = p.schoolChoice.maxReductionPercent;
  const grades = input.grades ?? ALL_GRADES;
  if (!Array.isArray(grades) || grades.length === 0 || grades.some(g => !Number.isInteger(g) || g < 1 || g > 9) || new Set(grades).size !== grades.length) {
    add('gr:grades-invalid', { ruleId: 'grades-invalid', category: 'info', mandatory: true, basis: 'underlag', title: 'Årskurserna kan inte kontrolleras',
      detail: 'Planens årskurser är ogiltiga eller dubblerade, så stadierna kan inte avgöras.' });
    return;
  }
  const width = grades.length;
  const allColumns = grades.map(columnId);
  const idx: Record<Stage, number[]> = { låg: [], mellan: [], hög: [] };
  grades.forEach((g, i) => idx[stageOfGrade(g)].push(i));
  const columnsOf = (stage: Stage) => idx[stage].map(i => columnId(grades[i]));
  const complete = STAGES.filter(s => idx[s].length === 3);
  for (const stage of STAGES.filter(s => idx[s].length > 0 && idx[s].length < 3)) {
    add(`gr:stage-partial:${STAGE_KEY[stage]}`, { ruleId: 'stage-partial', category: 'info', mandatory: true, basis: 'underlag',
      title: `${STAGE_NAME[stage][0].toUpperCase()}${STAGE_NAME[stage].slice(1)} är bara delvis med`,
      detail: `Planen omfattar ${idx[stage].length} av 3 årskurser i ${STAGE_NAME[stage]}. Stadiets tid kan inte kontrolleras mot den garanterade tiden förrän underlag för hela stadiet finns.`,
      columns: columnsOf(stage) });
  }

  const names = new Map<string, string>();
  for (const s of p.subjects) names.set(s.rowId, s.name);
  for (const g of p.groups) { names.set(g.rowId, g.name); for (const m of g.members) names.set(m.rowId, m.name); }
  names.set(p.schoolChoice.rowId, 'Skolans val');
  const planned = new Map<string, number[]>();
  for (const [rowId, name] of names) {
    const raw: unknown = Object.hasOwn(input.cells, rowId) ? input.cells[rowId] : undefined;
    if (raw === undefined) {
      add(`gr:row-missing:${rowId}`, { ruleId: 'row-missing', category: 'fel', basis: 'underlag', title: `${name}: raden saknas`,
        detail: 'Raden finns inte i planen. En saknad rad räknas inte som noll, och de kontroller som behöver den kan inte genomföras.',
        rows: [rowId], columns: allColumns, target: rowTarget(rowId, allColumns) });
    } else if (!validRow(raw, width)) {
      add(`gr:row-shape:${rowId}`, { ruleId: 'row-shape', category: 'fel', basis: 'underlag', title: `${name}: raden har ogiltiga värden`,
        detail: `Raden ska ha ${width} heltal mellan 0 och 2 000, ett per årskurs. Timmarna i raden räknas inte.`,
        rows: [rowId], columns: allColumns, target: rowTarget(rowId, allColumns) });
    } else planned.set(rowId, raw);
  }
  for (const [rowId, raw] of Object.entries(input.cells)) {
    if (names.has(rowId) || (Array.isArray(raw) && raw.every(n => n === 0))) continue;
    add(`gr:row-unknown:${rowId}`, { ruleId: 'row-unknown', category: 'info', mandatory: true, basis: 'underlag', title: `Okänd rad: ${rowId}`,
      detail: 'Raden finns inte i regelprofilen. Dess timmar räknas inte mot någon garanterad tid och måste kontrolleras separat.',
      rows: [rowId], columns: allColumns, target: rowTarget(rowId, allColumns) });
  }

  const has = (...rowIds: string[]) => rowIds.every(id => planned.has(id));
  const sum = (rowId: string, stage: Stage) => idx[stage].reduce((n, i) => n + planned.get(rowId)![i], 0);
  const family = (rowIds: string[]) => ({ rowIds, ran: 0, bad: 0 });
  const protectedFamily = family(p.subjects.filter(s => s.protected).map(s => s.rowId));
  const limitFamily = family([...p.subjects.filter(s => !s.protected && !s.shared).map(s => s.rowId), ...p.groups.map(g => g.rowId)]);
  const minimumFamily = family(p.groups.flatMap(g => g.members.map(m => m.rowId)));
  let reductions = 0;

  const reduction = (key: string, name: string, stage: Stage, national: number, local: number, rows: string[], columns: string[]) => {
    limitFamily.ran++;
    if (local >= national) return;
    const floor = lowestAllowed(national, pct);
    reductions += national - local;
    if (local >= floor) return;
    limitFamily.bad++;
    add(`gr:reduction-limit:${key}:${STAGE_KEY[stage]}`, { ruleId: 'reduction-limit', category: 'fel', source: src, unit: 'timmar', actual: local, expected: floor,
      title: `${name}: för stor minskning i ${STAGE_NAME[stage]}`,
      detail: `${fmt(local)} av ${fmt(national)} timmar. Skolans val får minska ett ämne med högst ${pct} procent per stadium, alltså till lägst ${fmt(floor)} timmar.`,
      rows, columns, target: rowTarget(rows[0], columns) });
  };

  for (const s of p.subjects) {
    if (!has(s.rowId)) continue;
    for (const stage of complete) {
      if (s.shared?.stages.includes(stage)) continue;
      const national = s.hours[stage], local = sum(s.rowId, stage), columns = columnsOf(stage);
      if (s.protected) {
        protectedFamily.ran++;
        if (local < national) {
          protectedFamily.bad++;
          add(`gr:protected-subject:${s.rowId}:${STAGE_KEY[stage]}`, { ruleId: 'protected-subject', category: 'fel', source: src, unit: 'timmar', actual: local, expected: national,
            title: `${s.name}: skyddat ämne har för få timmar i ${STAGE_NAME[stage]}`,
            detail: `${fmt(local)} av ${fmt(national)} timmar. ${s.name} får inte minskas genom skolans val.`,
            rows: [s.rowId], columns, target: rowTarget(s.rowId, columns) });
        }
      } else reduction(s.rowId, s.name, stage, national, local, [s.rowId], columns);
    }
  }

  for (const g of p.groups) {
    for (const stage of complete) {
      const asMembers = g.memberStages.includes(stage);
      const misplaced = asMembers ? [{ rowId: g.rowId, name: g.name }] : g.members;
      for (const row of misplaced) {
        if (!has(row.rowId)) continue;
        const at = idx[stage].find(i => planned.get(row.rowId)![i] > 0);
        if (at === undefined) continue;
        const column = columnId(grades[at]);
        add(`gr:group-placement:${row.rowId}:${STAGE_KEY[stage]}`, { ruleId: 'group-placement', category: 'fel', source: src, unit: 'timmar', actual: sum(row.rowId, stage), expected: 0,
          title: `${row.name}: timmar på fel nivå i ${STAGE_NAME[stage]}`,
          detail: asMembers
            ? `${g.name} planeras ämne för ämne i ${STAGE_NAME[stage]}. Timmar på gruppraden räknas inte, så att de inte räknas två gånger.`
            : `${g.name} planeras som en grupp i ${STAGE_NAME[stage]}. Timmar på enskilda ämnen räknas inte, så att de inte räknas två gånger.`,
          rows: [row.rowId], columns: columnsOf(stage), target: { type: 'cell', rowId: row.rowId, columnId: column } });
      }
      const counted = asMembers ? g.members.map(m => m.rowId) : [g.rowId];
      if (!has(...counted)) continue;
      reduction(g.rowId, g.name, stage, g.hours[stage], counted.reduce((n, id) => n + sum(id, stage), 0), counted, columnsOf(stage));
      if (!asMembers) continue;
      for (const m of g.members) {
        minimumFamily.ran++;
        const have = sum(m.rowId, stage), min = m.minimum[stage];
        if (have >= min) continue;
        minimumFamily.bad++;
        add(`gr:group-minimum:${m.rowId}:${STAGE_KEY[stage]}`, { ruleId: 'group-minimum', category: 'fel', source: src, unit: 'timmar', actual: have, expected: min,
          title: `${m.name}: garanterad minsta tid saknas i ${STAGE_NAME[stage]}`,
          detail: `${fmt(have)} av minst ${fmt(min)} timmar. Resten av ${g.name} får fördelas fritt mellan ämnena.`,
          rows: [m.rowId], columns: columnsOf(stage), target: rowTarget(m.rowId, columnsOf(stage)) });
      }
    }
  }

  for (const stage of complete) {
    const candidates = [
      ...p.subjects.filter(s => !s.shared?.stages.includes(stage)).map(s => ({ rowId: s.rowId, name: s.name })),
      ...p.groups.flatMap(g => g.memberStages.includes(stage) ? g.members : [{ rowId: g.rowId, name: g.name }]),
    ];
    for (const row of candidates) {
      if (!has(row.rowId)) continue;
      const total = sum(row.rowId, stage), emptyAt = idx[stage].find(i => planned.get(row.rowId)![i] === 0);
      if (total < params.subjectEveryYearMinStageHours || emptyAt === undefined) continue;
      add(`gr:subject-every-year:${row.rowId}:${STAGE_KEY[stage]}`, { ruleId: 'subject-every-year', category: 'risk', basis: 'lokal',
        localParameter: { name: 'subjectEveryYearMinStageHours', value: params.subjectEveryYearMinStageHours },
        title: `${row.name}: ingen tid i åk ${grades[emptyAt]}`,
        detail: `${fmt(total)} timmar i ${STAGE_NAME[stage]} men inga i åk ${grades[emptyAt]}. Ett ämne med minst ${fmt(params.subjectEveryYearMinStageHours)} timmar i stadiet läses normalt varje årskurs. Det är en lokal bedömning, inget lagkrav.`,
        rows: [row.rowId], columns: [columnId(grades[emptyAt])], target: { type: 'cell', rowId: row.rowId, columnId: columnId(grades[emptyAt]) } });
    }
  }

  let sharedChecked = false;
  for (const s of p.subjects) {
    if (!s.shared || !has(s.rowId)) continue;
    const present = s.shared.stages.filter(stage => idx[stage].length > 0);
    if (present.length === 0) continue;
    const columns = s.shared.stages.flatMap(columnsOf);
    const stageNames = list(s.shared.stages.map(stage => STAGE_NAME[stage]));
    if (!s.shared.stages.every(stage => complete.includes(stage))) {
      add(`gr:shared-subject:${s.rowId}:incomplete`, { ruleId: 'shared-subject', category: 'info', mandatory: true, basis: 'underlag', title: `${s.name}: gemensam tid kan inte kontrolleras`,
        detail: `${fmt(s.shared.hours)} timmar gäller ${stageNames} tillsammans. Planen omfattar inte alla årskurser i dem, så kompletterande underlag för resten saknas.`,
        rows: [s.rowId], columns: s.shared.stages.flatMap(columnsOf), target: rowTarget(s.rowId, columns) });
      continue;
    }
    sharedChecked = true;
    const local = s.shared.stages.reduce((n, stage) => n + sum(s.rowId, stage), 0), national = s.shared.hours, floor = lowestAllowed(national, pct);
    if (local >= national) {
      add(`gr:shared-subject:${s.rowId}:ok`, { ruleId: 'shared-subject', category: 'ok', source: src, unit: 'timmar', actual: local, expected: national,
        title: `${s.name}: den gemensamma tiden är uppfylld`,
        detail: `${fmt(local)} av minst ${fmt(national)} timmar i ${stageNames} tillsammans, oavsett hur de fördelas mellan stadierna.`, rows: [s.rowId], columns });
      continue;
    }
    reductions += national - local;
    if (local < floor) {
      add(`gr:shared-subject:${s.rowId}:over`, { ruleId: 'shared-subject', category: 'fel', source: src, unit: 'timmar', actual: local, expected: floor,
        title: `${s.name}: för stor minskning av den gemensamma tiden`,
        detail: `${fmt(local)} av ${fmt(national)} timmar i ${stageNames} tillsammans. Skolans val får minska ämnet med högst ${pct} procent, alltså till lägst ${fmt(floor)} timmar.`,
        rows: [s.rowId], columns, target: rowTarget(s.rowId, columns) });
    }
  }

  const allValid = planned.size === names.size;
  if (allValid) {
    const units: { key: string; stages: Stage[] }[] = [];
    if (complete.includes('låg') && complete.includes('mellan')) units.push({ key: 'lag+mellan', stages: ['låg', 'mellan'] });
    else for (const stage of ['låg', 'mellan'] as Stage[]) if (complete.includes(stage)) units.push({ key: STAGE_KEY[stage], stages: [stage] });
    if (complete.includes('hög')) units.push({ key: 'hog', stages: ['hög'] });
    for (const unit of units) {
      const shares = (s: GrundskolaProfile['subjects'][number]) => s.shared !== undefined && s.shared.stages.every(stage => unit.stages.includes(stage));
      const national = unit.stages.reduce((n, stage) => n + p.stageHours[stage], 0) + p.subjects.filter(shares).reduce((n, s) => n + s.shared!.hours, 0);
      let actual = 0;
      for (const stage of unit.stages) {
        for (const s of p.subjects) if (!s.shared?.stages.includes(stage) || shares(s)) actual += sum(s.rowId, stage);
        for (const g of p.groups) actual += (g.memberStages.includes(stage) ? g.members.map(m => m.rowId) : [g.rowId]).reduce((n, id) => n + sum(id, stage), 0);
        actual += sum(p.schoolChoice.rowId, stage);
      }
      const where = list(unit.stages.map(stage => STAGE_NAME[stage])), columns = unit.stages.flatMap(columnsOf);
      if (actual < national) {
        add(`gr:stage-total:${unit.key}`, { ruleId: 'stage-total', category: 'fel', source: src, unit: 'timmar', actual, expected: national, columns,
          title: `Timmarna i ${where} räcker inte till den garanterade tiden`,
          detail: `${fmt(actual)} av minst ${fmt(national)} timmar. ${fmt(national - actual)} timmar saknas. Tid som tas från ett ämne ska läggas på skolans val.` });
      } else {
        add(`gr:stage-total:${unit.key}`, { ruleId: 'stage-total', category: 'ok', source: src, unit: 'timmar', actual, expected: national, columns,
          title: `Garanterad tid i ${where} är uppfylld`,
          detail: `${fmt(actual)} av minst ${fmt(national)} timmar, inklusive skolans val och utan dubbelräknade ämnesgrupper.` });
      }
    }
  }

  const done = (f: { rowIds: string[]; ran: number; bad: number }) => f.ran > 0 && f.bad === 0 && has(...f.rowIds);
  if (done(protectedFamily)) add('gr:protected-subject:ok', { ruleId: 'protected-subject', category: 'ok', source: src,
    title: 'Skyddade ämnen har minst den garanterade tiden', detail: `${list(p.subjects.filter(s => s.protected).map(s => s.name))} har minst nationell tid i de kontrollerade stadierna.` });
  if (done(limitFamily)) add('gr:reduction-limit:ok', { ruleId: 'reduction-limit', category: 'ok', source: src,
    title: `Ingen minskning över ${pct} procent`, detail: `Inget ämne eller ämnesgrupp har minskats med mer än ${pct} procent i något kontrollerat stadium.` });
  if (done(minimumFamily)) add('gr:group-minimum:ok', { ruleId: 'group-minimum', category: 'ok', source: src,
    title: 'Ämnenas garanterade minsta tid inom NO och SO är uppfylld', detail: 'Varje ämne i ämnesgrupperna har minst sin garanterade tid i de kontrollerade stadierna.' });
  if (complete.length > 0 || sharedChecked) {
    const max = p.schoolChoice.maxHours;
    const base = { ruleId: 'school-choice-total', source: src, unit: 'timmar' as const, actual: reductions, expected: max, rows: [p.schoolChoice.rowId], columns: allColumns };
    if (reductions > max) add('gr:school-choice-total:over', { ...base, category: 'fel', title: 'Skolans val omfördelar för mycket tid',
      detail: `${fmt(reductions)} timmar är minskade i ämnena, högst ${fmt(max)} timmar får omfördelas.`, target: rowTarget(p.schoolChoice.rowId, allColumns) });
    else add('gr:school-choice-total:ok', { ...base, category: 'ok', title: 'Skolans val inom ramen',
      detail: `${fmt(reductions)} av högst ${fmt(max)} timmar är omfördelade från ämnena i de kontrollerade stadierna.` });
  }
}

function introduktionsprogram(add: Add, input: AnalysisInput, p: ImProfile, params: LocalParameters): void {
  const src = p.source, column = ['vecka'], expected = p.minTeachingHoursPerWeek;
  const names = new Map(p.rows.map(r => [r.rowId, r.name] as const));
  const planned = new Map<string, number>();
  for (const [rowId, name] of names) {
    const raw: unknown = Object.hasOwn(input.cells, rowId) ? input.cells[rowId] : undefined;
    if (raw === undefined) {
      add(`im:row-missing:${rowId}`, { ruleId: 'row-missing', category: 'fel', basis: 'underlag', title: `${name}: raden saknas`,
        detail: 'Raden finns inte i planen. En saknad rad räknas inte som noll, och de kontroller som behöver den kan inte genomföras.',
        rows: [rowId], columns: column, target: rowTarget(rowId, column) });
    } else if (!validRow(raw, 1)) {
      add(`im:row-shape:${rowId}`, { ruleId: 'row-shape', category: 'fel', basis: 'underlag', title: `${name}: raden har ogiltigt värde`,
        detail: 'Raden ska ha ett heltal mellan 0 och 2 000 timmar per vecka. Värdet räknas inte.', rows: [rowId], columns: column, target: rowTarget(rowId, column) });
    } else planned.set(rowId, raw[0]);
  }
  const unclassifiedRows = Object.entries(input.cells).filter(([rowId, raw]) => !names.has(rowId) && !(Array.isArray(raw) && raw.every(n => n === 0)));
  const unclassified = unclassifiedRows.reduce((n, [, raw]) => n + (Array.isArray(raw) ? raw.reduce((m, v) => m + (Number.isInteger(v) && v > 0 ? v : 0), 0) : 0), 0);
  if (unclassifiedRows.length > 0) {
    add('im:time-unclassified', { ruleId: 'time-unclassified', category: 'info', mandatory: true, basis: 'underlag', unit: 'timmar per vecka', actual: unclassified,
      title: 'Oklassificerad tid i planen',
      detail: `${fmt(unclassified)} timmar per vecka ligger på rader som regelprofilen inte klassificerar (${unclassifiedRows.map(([id]) => id).join(', ')}). De räknas inte som undervisning.`,
      rows: unclassifiedRows.map(([id]) => id), columns: column });
  }

  const sumOf = (kind: 'undervisning' | 'annan') => p.rows.filter(r => r.kind === kind).reduce((n, r) => n + (planned.get(r.rowId) ?? 0), 0);
  const teachingRows = p.rows.filter(r => r.kind === 'undervisning').map(r => r.rowId), otherRows = p.rows.filter(r => r.kind === 'annan').map(r => r.rowId);
  const confirmed = sumOf('undervisning'), other = sumOf('annan');
  if (teachingRows.every(id => planned.has(id))) {
    const target = rowTarget(teachingRows[0], column);
    const common = { ruleId: 'im-teaching', unit: 'timmar per vecka' as const, actual: confirmed, expected, rows: teachingRows, columns: column, target };
    if (confirmed < expected) {
      const total = otherRows.every(id => planned.has(id)) ? ` Planen har totalt ${fmt(confirmed + other)} timmar per vecka, men ${fmt(other)} av dem är annan aktivitet och räknas inte som undervisning.` : '';
      add('im:im-teaching', { ...common, category: 'fel', source: src, title: 'Styrkt undervisningsram saknas',
        detail: `${fmt(confirmed)} timmar per vecka är bekräftad undervisning enligt profilens klassificering, kravet är i genomsnitt minst ${fmt(expected)}.${total}` });
    } else {
      add('im:im-teaching', { ...common, category: 'ok', source: src, title: 'Undervisningsramen är uppfylld i planen',
        detail: `${fmt(confirmed)} timmar per vecka är undervisning enligt profilens klassificering, kravet är i genomsnitt minst ${fmt(expected)}. Det visar planerad tid i en gemensam plan, inte genomförd tid och inte någon enskild elevs program.` });
      if (confirmed < expected + params.imLowMarginHours) {
        add('im:im-low-margin', { ...common, ruleId: 'im-low-margin', category: 'risk', basis: 'lokal', expected: expected + params.imLowMarginHours,
          localParameter: { name: 'imLowMarginHours', value: params.imLowMarginHours }, title: 'Låg marginal över undervisningsramen',
          detail: `${fmt(confirmed)} timmar per vecka ger ${fmt(confirmed - expected)} timmars marginal. Det är en lokal bedömning (marginal under ${fmt(params.imLowMarginHours)} timmar), inget lagkrav.` });
      }
    }
    if (otherRows.every(id => planned.has(id)) && confirmed + other > 0 && other * 100 > params.imOtherActivityMaxPercent * (confirmed + other)) {
      add('im:im-other-share', { ruleId: 'im-other-share', category: 'risk', basis: 'lokal', unit: 'timmar per vecka', actual: other, expected: null,
        localParameter: { name: 'imOtherActivityMaxPercent', value: params.imOtherActivityMaxPercent }, title: 'Mycket annan aktivitet jämfört med undervisning',
        detail: `${fmt(other)} av ${fmt(confirmed + other)} timmar per vecka är praktik och mentorstid. Det är en lokal balansbedömning (över ${fmt(params.imOtherActivityMaxPercent)} procent), inget lagkrav.`,
        rows: otherRows, columns: column, target: rowTarget(otherRows[0], column) });
    }
  }
  add('im:im-individual', { ruleId: 'im-individual', category: 'info', mandatory: false, source: src, title: 'Individuell tillämpning kontrolleras separat',
    detail: 'En gemensam plan visar inte vilken undervisning varje elev får. Rektor beslutar den individuella fördelningen, och den prövas inte här.' });
}

export function analyseTimplan(input: AnalysisInput): TimplanAnalysis {
  const { issues, add } = collector();
  const problem = profileProblem(input);
  const profile = problem === null ? input.profile : null;
  if (problem !== null) {
    add('profil:profile-unknown', { ruleId: 'profile-unknown', category: 'info', mandatory: true, basis: 'underlag',
      title: 'Regelprofil saknas eller gäller inte planen',
      detail: `${problem} Inga rättsliga påståenden görs, och planen kan inte fastställas förrän profilen är kontrollerad.` });
  } else if (profile) {
    const params = resolveLocalParameters(input.localParameters);
    if (profile.schoolKind === 'grundskola') grundskola(add, input, profile, params);
    else introduktionsprogram(add, input, profile, params);
    add('allm:planned-not-delivered', { ruleId: 'planned-not-delivered', category: 'info', mandatory: false, basis: 'underlag',
      title: 'Planerad tid är inte genomförd undervisning',
      detail: 'Timplanen visar planerad tid. Den är inte faktiskt genomförd undervisning och bevisar inte någon enskild elevs genomförda timmar.' });
    if (profile.source.validFrom === null) {
      add('allm:profile-validity', { ruleId: 'profile-validity', category: 'info', mandatory: false, source: profile.source,
        title: 'Källan anger ingen startdag för regeln',
        detail: `${profile.source.label} anger ingen startdag. Kontrollera att regeln gäller för utbildningens elevkull.` });
    }
  }

  issues.sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || (a.issueId < b.issueId ? -1 : a.issueId > b.issueId ? 1 : 0));
  const counts: Record<Category, number> = { fel: 0, risk: 0, info: 0, ok: 0 };
  for (const issue of issues) counts[issue.category]++;
  const scope = input.valuesAre === 'saved' ? 'saved' : 'own-unsaved';
  const readinessReasons: ReadinessReason[] = [];
  if (scope === 'own-unsaved') readinessReasons.push({ code: 'own-unsaved', text: 'Analysen gäller egna osparade värden. Beslut baseras på serverns sparade revision.' });
  else if (!Number.isSafeInteger(input.savedRevision) || (input.savedRevision as number) < 0) readinessReasons.push({ code: 'no-saved-revision', text: 'Det finns ingen sparad revision att besluta om.' });
  if (typeof input.analysisVersion !== 'string' || input.analysisVersion.trim() === '') readinessReasons.push({ code: 'analysis-version-missing', text: 'Analysens version saknas, så resultatet kan inte hänföras till en regelversion.' });
  const blockingIssueIds = issues.filter(i => i.blocksDecision).map(i => i.issueId);
  return {
    analysisVersion: input.analysisVersion, schoolKind: input.schoolKind, schoolId: input.schoolId,
    savedRevision: input.savedRevision, scope, profileId: profile?.id ?? null, issues, counts,
    blocksDecision: blockingIssueIds.length > 0 || readinessReasons.length > 0, blockingIssueIds, readinessReasons,
  };
}
