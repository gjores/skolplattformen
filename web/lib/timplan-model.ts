// Timplaner: rektorn föreslår fördelningen av undervisningstid, huvudmannen
// fastställer den, för varje utbildning skolenheten har.
//
// Grundskola: Skolförordningen (2011:185) 9 kap. 4 §, "Huvudmannen beslutar
// efter förslag av rektorn om fördelning mellan årskurserna". Gymnasieskola:
// Gymnasieförordningen (2010:2039) 4 kap. 22 §, huvudmannen beslutar om
// antalet undervisningstimmar för varje nivå och fördelningen över läsåren,
// och ska redovisa hur eleven fått sin garanterade undervisningstid.
// Introduktionsprogram: rektorn beslutar per elev inom huvudmannens
// utbildningsplan. Utbildningarna och poängplanerna kommer ur
// organisationsmodellen; timplanen lägger bara timmar på dem.

import { snapshotInfo } from './syllabus.ts';
import { today, uid, clock } from './common.ts';
import {
  createOrganisationState,
  currentPointPlan,
  pointPlanBlocks,
  offeringTitle,
  type Offering,
  type OrganisationState,
} from './organisation-model.ts';

export type Role = 'rektor' | 'huvudman';
export const roleLabel: Record<Role, string> = {
  rektor: 'Rektor',
  huvudman: 'Huvudman',
};

export type Stage = 'låg' | 'mellan' | 'hög';
export const stages: { id: Stage; name: string; years: number[] }[] = [
  { id: 'låg', name: 'Lågstadiet', years: [1, 2, 3] },
  { id: 'mellan', name: 'Mellanstadiet', years: [4, 5, 6] },
  { id: 'hög', name: 'Högstadiet', years: [7, 8, 9] },
];
const stageOf = (year: number): Stage =>
  year <= 3 ? 'låg' : year <= 6 ? 'mellan' : 'hög';

/**
 * Nationell timplan för grundskolan. Skolförordningen (2011:185) bilaga 1 i
 * lydelse från läsåret 2024/25, läst 5 september 2026. Timmar per stadium.
 * `fixed`: får inte minskas inom skolans val. `minimum`: garanterad minsta tid
 * för ett ämne inom en ämnesgrupp; resten fördelas fritt inom gruppen.
 */
export type NationalSubject = {
  id: string;
  name: string;
  code?: string;
  hours?: Record<Stage, number>;
  fixed?: boolean;
  group?: string;
  minimum?: Partial<Record<Stage, number>>;
};
export const nationalTimplan: NationalSubject[] = [
  { id: 'bild', name: 'Bild', code: 'GRGRBIL01', hours: { låg: 60, mellan: 80, hög: 100 } },
  { id: 'engelska', name: 'Engelska', code: 'GRGRENG01', hours: { låg: 60, mellan: 220, hög: 200 }, fixed: true },
  { id: 'hkk', name: 'Hem- och konsumentkunskap', code: 'GRGRHKK01', hours: { låg: 0, mellan: 40, hög: 90 } },
  { id: 'idrott', name: 'Idrott och hälsa', code: 'GRGRIDR01', hours: { låg: 140, mellan: 180, hög: 280 } },
  { id: 'matematik', name: 'Matematik', code: 'GRGRMAT01', hours: { låg: 420, mellan: 410, hög: 400 }, fixed: true },
  { id: 'musik', name: 'Musik', code: 'GRGRMUS01', hours: { låg: 80, mellan: 80, hög: 80 } },
  { id: 'no', name: 'Naturorienterande ämnen', hours: { låg: 145, mellan: 216, hög: 289 } },
  { id: 'biologi', name: 'Biologi', code: 'GRGRBIO01', group: 'no', minimum: { mellan: 60, hög: 80 } },
  { id: 'fysik', name: 'Fysik', code: 'GRGRFYS01', group: 'no', minimum: { mellan: 60, hög: 80 } },
  { id: 'kemi', name: 'Kemi', code: 'GRGRKEM01', group: 'no', minimum: { mellan: 60, hög: 80 } },
  { id: 'so', name: 'Samhällsorienterande ämnen', hours: { låg: 200, mellan: 375, hög: 405 } },
  { id: 'geografi', name: 'Geografi', code: 'GRGRGEO01', group: 'so', minimum: { mellan: 75, hög: 80 } },
  { id: 'historia', name: 'Historia', code: 'GRGRHIS01', group: 'so', minimum: { mellan: 90, hög: 100 } },
  { id: 'religion', name: 'Religionskunskap', code: 'GRGRREL01', group: 'so', minimum: { mellan: 75, hög: 80 } },
  { id: 'samhallskunskap', name: 'Samhällskunskap', code: 'GRGRSAM01', group: 'so', minimum: { mellan: 75, hög: 90 } },
  { id: 'slojd', name: 'Slöjd', code: 'GRGRSLJ01', hours: { låg: 50, mellan: 140, hög: 140 } },
  { id: 'svenska', name: 'Svenska eller svenska som andraspråk', code: 'GRGRSVE01', hours: { låg: 680, mellan: 520, hög: 290 }, fixed: true },
  { id: 'teknik', name: 'Teknik', code: 'GRGRTEK01', hours: { låg: 47, mellan: 65, hög: 88 } },
  { id: 'sprakval', name: 'Språkval', code: 'GRGRMSP01', hours: { låg: 0, mellan: 48, hög: 272 }, fixed: true },
];
export const nationalStageTotal: Record<Stage, number> = { låg: 1882, mellan: 2374, hög: 2634 };
export const nationalTotal = 6890;
export const skolansValMax = 600;
export const skolansValReduction = 0.2;

/** Skollagen (2010:800) 16 kap. 18 §, läst 5 september 2026. */
export const guaranteedHours = {
  högskoleförberedande: 2180,
  yrkesprogram2800: 2720,
  yrkesprogram2700: 2625,
};
/** Skollagen 17 kap. 6 §: heltid, i genomsnitt minst 23 timmar i veckan. */
export const introWeeklyMinimum = 23;
/** Läsårsveckor som riktvärdet för schema räknas på. Skolans egen uppgift. */
export const schoolYearWeeks = 36;

export type Column = { id: string; label: string; stage?: Stage };
export type RowKind = 'subject' | 'group' | 'member' | 'skolansval' | 'level' | 'local';
export type Row = {
  id: string;
  name: string;
  kind: RowKind;
  code?: string;
  subject?: string;
  group?: string;
  block?: string;
  points?: number;
  national?: Record<Stage, number>;
  minimum?: Partial<Record<Stage, number>>;
  fixed?: boolean;
};
export type Block = { id: string; name: string; points: number };
export type Education = {
  id: string;
  kind: 'grundskola' | 'gymnasium' | 'introduktionsprogram';
  name: string;
  detail: string;
  cohort: string;
  unit: string;
  columns: Column[];
  rows: Row[];
  blocks?: Block[];
  frame: { label: string; total: number; source: string };
  /** Vad timplanen bygger på, till exempel "Poängplan v1". */
  basis: string;
  programCode?: string;
  orientationCode?: string;
};

export type TimplanStatus = 'utkast' | 'förslag' | 'återsänd' | 'fastställd' | 'ersatt';
export const statusLabel: Record<TimplanStatus, string> = {
  utkast: 'Utkast',
  förslag: 'Förslag till huvudman',
  återsänd: 'Återsänd för ändring',
  fastställd: 'Fastställd',
  ersatt: 'Ersatt',
};
export type Entry = {
  id: string;
  time: string;
  role: Role;
  action: string;
  comment: string;
};
export type Timplan = {
  id: string;
  educationId: string;
  version: number;
  status: TimplanStatus;
  cells: Record<string, number[]>;
  history: Entry[];
  catalog: string;
  basis: string;
  decidedOn?: string;
};
export type TimplanState = {
  role: Role;
  educations: Education[];
  plans: Timplan[];
};
export type Issue = {
  level: 'error' | 'warning';
  text: string;
  rowId?: string;
  columnIds?: string[];
};

/** Stadier som skolenheten har alla årskurser i; bara de prövas mot bilaga 1. */
export function completeStages(columns: Column[]) {
  return stages.filter((s) => s.years.every((y) => columns.some((c) => c.id === `ak${y}`)));
}

function grundskolaEducation(o: Offering): Education {
  const grades = o.grades?.length ? o.grades : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const rows: Row[] = nationalTimplan.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    kind: s.group ? 'member' : s.code ? 'subject' : 'group',
    group: s.group,
    national: s.hours,
    minimum: s.minimum,
    fixed: s.fixed,
  }));
  rows.push({ id: 'skolansval', name: 'Skolans val', kind: 'skolansval' });
  const columns: Column[] = grades.map((year) => ({ id: `ak${year}`, label: `Åk ${year}`, stage: stageOf(year) }));
  const total = completeStages(columns).reduce((n, s) => n + nationalStageTotal[s.id], 0);
  const span = `årskurs ${grades[0]}–${grades[grades.length - 1]}`;
  return {
    id: o.id,
    kind: 'grundskola',
    name: `${o.name}, ${span}`,
    detail: 'Fördelning mellan årskurserna av den garanterade undervisningstiden',
    cohort: o.cohort,
    unit: 'timmar',
    columns,
    rows,
    frame: {
      label: 'Skolförordningen (2011:185) bilaga 1, 9 kap. 4 §',
      total,
      source: 'https://lagen.nu/2011:185',
    },
    basis: `Skolformen grundskola, ${span}`,
  };
}

const gymnasiumColumns: Column[] = [1, 2, 3].map((y) => ({ id: `ar${y}`, label: `År ${y}` }));

function gymnasiumEducation(o: Offering): Education | undefined {
  const plan = currentPointPlan(o);
  if (!plan) return undefined;
  const blocks = pointPlanBlocks(o, plan);
  if (!blocks.length) return undefined;
  const rows: Row[] = blocks.flatMap((b) =>
    b.levels.map((l) => ({
      id: l.code,
      name: l.name,
      kind: 'level' as const,
      code: l.subjectCode ? l.code : undefined,
      subject: l.subject,
      block: b.id,
      points: l.points,
    })),
  );
  return {
    id: o.id,
    kind: 'gymnasium',
    name: offeringTitle(o),
    detail: `${o.localCode ?? o.orientationCode ?? o.programCode} · ${o.programCode} · 2 500 gymnasiepoäng`,
    cohort: o.cohort,
    unit: 'timmar',
    columns: gymnasiumColumns,
    rows,
    blocks: blocks.map((b) => ({ id: b.id, name: b.name, points: b.required })),
    frame: {
      label: 'Skollagen (2010:800) 16 kap. 18 § · Gymnasieförordningen 4 kap. 22 §',
      total: guaranteedHours.högskoleförberedande,
      source: snapshotInfo.source,
    },
    basis: `Poängplan v${plan.version}`,
    programCode: o.programCode,
    orientationCode: o.orientationCode,
  };
}

function introEducation(o: Offering): Education {
  const rows: Row[] = [
    { id: 'im-sv', name: 'Svenska eller svenska som andraspråk, grundskolenivå', kind: 'local', code: 'GRGRSVE01' },
    { id: 'im-ma', name: 'Matematik, grundskolenivå', kind: 'local', code: 'GRGRMAT01' },
    { id: 'im-en', name: 'Engelska, grundskolenivå', kind: 'local', code: 'GRGRENG01' },
    { id: 'im-sh', name: 'Samhällskunskap, grundskolenivå', kind: 'local', code: 'GRGRSAM01' },
    { id: 'im-idh', name: 'Idrott och hälsa', kind: 'local', code: 'GRGRIDR01' },
    { id: 'im-praktik', name: 'Praktik och yrkesorientering', kind: 'local' },
    { id: 'im-mentor', name: 'Studiehandledning och mentorstid', kind: 'local' },
  ];
  return {
    id: o.id,
    kind: 'introduktionsprogram',
    name: `Introduktionsprogram, ${o.name.toLocaleLowerCase('sv')}`,
    detail: 'Huvudmannens utbildningsplan · heltid',
    cohort: o.cohort,
    unit: 'timmar per vecka',
    columns: [{ id: 'vecka', label: 'Per vecka' }],
    rows,
    frame: {
      label: 'Skollagen (2010:800) 17 kap. 6–7 §§',
      total: introWeeklyMinimum,
      source: 'https://lagen.nu/2010:800',
    },
    basis: 'Utbildningsplan',
  };
}

/** En timplan kan bara byggas på en utbildning med fastställd grund. */
export function educationFromOffering(o: Offering): Education | undefined {
  if (o.kind === 'grundskola') return grundskolaEducation(o);
  if (o.kind === 'gymnasium') return gymnasiumEducation(o);
  return introEducation(o);
}
export function deriveEducations(organisation: OrganisationState): Education[] {
  return organisation.offerings
    .map(educationFromOffering)
    .filter((e): e is Education => Boolean(e));
}

/** Delar ett stadiums timmar jämnt på tre årskurser; resten läggs först. */
function split(total: number, parts = 3): number[] {
  const base = Math.floor(total / parts);
  const rest = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < rest ? 1 : 0));
}

export function stageHours(education: Education, plan: Timplan, rowId: string, stage: Stage): number {
  const cells = plan.cells[rowId] ?? [];
  return education.columns.reduce((n, c, i) => n + (c.stage === stage ? (cells[i] ?? 0) : 0), 0);
}
export function rowTotal(plan: Timplan, rowId: string): number {
  return (plan.cells[rowId] ?? []).reduce((n, v) => n + v, 0);
}
export function columnTotals(education: Education, plan: Timplan): number[] {
  return education.columns.map((_, i) =>
    education.rows.reduce((n, r) => n + (plan.cells[r.id]?.[i] ?? 0), 0),
  );
}
export function planTotal(education: Education, plan: Timplan): number {
  return columnTotals(education, plan).reduce((n, v) => n + v, 0);
}

export function cellEditable(education: Education, row: Row, column: Column): boolean {
  if (education.kind !== 'grundskola') return true;
  // NO och SO undervisas som block i lågstadiet och som egna ämnen därefter.
  if (row.kind === 'group') return column.stage === 'låg';
  if (row.kind === 'member') return column.stage !== 'låg';
  return true;
}

/** Riktvärde för schemat: minuter per vecka vid skolans läsårsveckor. */
export const weeklyMinutes = (hours: number, weeks = schoolYearWeeks) =>
  Math.round((hours * 60) / weeks);

/**
 * Underlag för tjänstefördelning: timmar per ämne och kolumn. Behörighet per
 * lärare och faktisk fördelning på tjänster ligger utanför timplanen.
 */
export function staffingSummary(education: Education, plan: Timplan) {
  const map = new Map<string, number[]>();
  for (const row of education.rows) {
    if (row.kind === 'group' || row.kind === 'skolansval') continue;
    const key = row.subject ?? row.name;
    const cells = plan.cells[row.id] ?? [];
    const acc = map.get(key) ?? education.columns.map(() => 0);
    education.columns.forEach((_, i) => (acc[i] += cells[i] ?? 0));
    map.set(key, acc);
  }
  return [...map.entries()]
    .map(([subject, perColumn]) => ({ subject, perColumn, total: perColumn.reduce((n, v) => n + v, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** Nationell fördelning som utgångspunkt: stadiets timmar jämnt över årskurserna. */
export function defaultCells(education: Education): Record<string, number[]> {
  const cells: Record<string, number[]> = {};
  if (education.kind === 'grundskola') {
    for (const row of education.rows) {
      const values: number[] = [];
      for (const column of education.columns) {
        const stage = column.stage!;
        const year = Number(column.id.replace('ak', ''));
        const position = stages.find((s) => s.id === stage)!.years.indexOf(year);
        let stageTotal = 0;
        if (row.kind === 'group') stageTotal = stage === 'låg' ? row.national![stage] : 0;
        else if (row.kind === 'member') {
          const group = education.rows.find((r) => r.id === row.group)!;
          const members = education.rows.filter((r) => r.group === row.group);
          const min = members.reduce((n, m) => n + (m.minimum?.[stage] ?? 0), 0);
          const free = group.national![stage] - min;
          stageTotal = stage === 'låg' ? 0 : (row.minimum?.[stage] ?? 0) + split(free, members.length)[members.indexOf(row)];
        } else if (row.kind === 'subject') stageTotal = row.national![stage];
        const perYear =
          row.id === 'sprakval' && stage === 'mellan'
            ? [0, 0, stageTotal]
            : row.id === 'hkk' && stage === 'mellan'
              ? [0, split(stageTotal, 2)[0], split(stageTotal, 2)[1]]
              : split(stageTotal);
        values.push(perYear[position]);
      }
      cells[row.id] = values;
    }
    return cells;
  }
  if (education.kind === 'gymnasium') {
    // 90 timmar per 100 poäng ger marginal mot 2 180 timmar. Nivå 1 läses år 1,
    // nivå 2 år 2, nivå 3 år 3. Inriktningen får börja år 1 på ES, FR, IN och
    // NB (Gymnasieförordningen 4 kap. 2 §), annars år 2. Fördjupning år 3.
    const early = ['ES', 'FR', 'IN', 'NB'].includes((education.programCode ?? '').slice(0, 2));
    for (const row of education.rows) {
      const hours = Math.round((row.points ?? 0) * 0.9);
      const level = row.code ? Number(row.code.replace(/^[A-Z]+/, '')[0]) : 0;
      let years: number[];
      if (row.block === 'individuellt') years = [0, Math.round(hours / 2), hours - Math.round(hours / 2)];
      else if (row.block === 'gymnasiearbete') years = [0, 0, hours];
      else if (row.code === 'IDRO1000X') years = split(hours);
      else if (row.block === 'fordjupning') years = [0, 0, hours];
      else if (row.block === 'inriktning')
        years = early
          ? level >= 3 ? [0, 0, hours] : level === 2 ? [0, hours, 0] : [hours, 0, 0]
          : level >= 3 ? [0, 0, hours] : [0, hours, 0];
      else if (!row.code || !level) years = [Math.round(hours / 2), hours - Math.round(hours / 2), 0];
      else years = level === 1 ? [hours, 0, 0] : level === 2 ? [0, hours, 0] : [0, 0, hours];
      cells[row.id] = years;
    }
    return cells;
  }
  const weekly: Record<string, number> = { 'im-sv': 6, 'im-ma': 5, 'im-en': 4, 'im-sh': 2, 'im-idh': 2, 'im-praktik': 4, 'im-mentor': 1 };
  for (const row of education.rows) cells[row.id] = [weekly[row.id] ?? 0];
  return cells;
}

function format(n: number) {
  return n.toLocaleString('sv-SE');
}

export function timplanIssues(education: Education, plan: Timplan): Issue[] {
  const issues: Issue[] = [];
  if (plan.basis !== education.basis)
    issues.push({ level: 'warning', text: `Timplanen bygger på ${plan.basis.toLocaleLowerCase('sv')}, men utbildningen har nu ${education.basis.toLocaleLowerCase('sv')}. Skapa en ny version för att ta in ändringen.` });
  const cols = (stage: Stage) => education.columns.filter((c) => c.stage === stage).map((c) => c.id);
  if (education.kind === 'grundskola') {
    const active = completeStages(education.columns);
    const reductions: Record<Stage, number> = { låg: 0, mellan: 0, hög: 0 };
    for (const row of education.rows) {
      for (const stage of active) {
        const local = stageHours(education, plan, row.id, stage.id);
        if (row.kind === 'subject' || (row.kind === 'group' && stage.id === 'låg')) {
          const national = row.national![stage.id];
          if (local < national) {
            const floor = row.fixed ? national : Math.ceil(national * (1 - skolansValReduction));
            if (row.fixed)
              issues.push({ level: 'error', rowId: row.id, columnIds: cols(stage.id), text: `${row.name} får inte minskas: ${format(local)} av ${format(national)} timmar i ${stage.name.toLocaleLowerCase('sv')}.` });
            else if (local < floor)
              issues.push({ level: 'error', rowId: row.id, columnIds: cols(stage.id), text: `${row.name} är minskat med mer än 20 procent i ${stage.name.toLocaleLowerCase('sv')}: ${format(local)} av ${format(national)} timmar, lägst ${format(floor)}.` });
            reductions[stage.id] += national - local;
          }
        }
        if (row.kind === 'group' && stage.id !== 'låg') {
          const members = education.rows.filter((r) => r.group === row.id);
          const sum = members.reduce((n, m) => n + stageHours(education, plan, m.id, stage.id), 0);
          const national = row.national![stage.id];
          if (sum < national) {
            const floor = Math.ceil(national * (1 - skolansValReduction));
            if (sum < floor)
              issues.push({ level: 'error', rowId: row.id, columnIds: cols(stage.id), text: `${row.name} är minskade med mer än 20 procent i ${stage.name.toLocaleLowerCase('sv')}: ${format(sum)} av ${format(national)} timmar.` });
            reductions[stage.id] += national - sum;
          }
          for (const m of members) {
            const min = m.minimum?.[stage.id] ?? 0;
            const have = stageHours(education, plan, m.id, stage.id);
            if (have < min)
              issues.push({ level: 'error', rowId: m.id, columnIds: cols(stage.id), text: `${m.name} har ${format(have)} timmar i ${stage.name.toLocaleLowerCase('sv')}; garanterad minsta tid är ${format(min)}.` });
          }
        }
      }
      // Ett ämne med minst 100 timmar i stadiet läses normalt varje årskurs;
      // ett tomt år där är värt att se. Små ämnen koncentreras ofta med avsikt.
      if (row.kind === 'subject') {
        for (const [i, column] of education.columns.entries()) {
          if (row.national![column.stage!] < 100) continue;
          if (!(plan.cells[row.id]?.[i] ?? 0))
            issues.push({ level: 'warning', rowId: row.id, columnIds: [column.id], text: `${row.name} saknar undervisning i årskurs ${column.label.replace('Åk ', '')}.` });
        }
      }
    }
    const val = education.rows.find((r) => r.kind === 'skolansval')!;
    const valTotal = rowTotal(plan, val.id);
    if (valTotal > skolansValMax)
      issues.push({ level: 'error', rowId: val.id, text: `Skolans val omfattar ${format(valTotal)} timmar; högst ${format(skolansValMax)} får användas.` });
    for (const stage of active) {
      const valStage = stageHours(education, plan, val.id, stage.id);
      if (valStage < reductions[stage.id])
        issues.push({ level: 'error', rowId: val.id, columnIds: cols(stage.id), text: `Minskningarna i ${stage.name.toLocaleLowerCase('sv')} är ${format(reductions[stage.id])} timmar men skolans val ger bara ${format(valStage)} tillbaka.` });
      const stageSum = education.rows.reduce((n, r) => n + stageHours(education, plan, r.id, stage.id), 0);
      if (stageSum < nationalStageTotal[stage.id])
        issues.push({ level: 'error', columnIds: cols(stage.id), text: `${stage.name} har ${format(stageSum)} timmar; garanterad tid är ${format(nationalStageTotal[stage.id])}.` });
    }
    if (planTotal(education, plan) < education.frame.total)
      issues.push({ level: 'error', text: `Totalt ${format(planTotal(education, plan))} timmar; garanterad undervisningstid är ${format(education.frame.total)}.` });
    for (const stage of stages)
      if (!active.includes(stage) && education.columns.some((c) => c.stage === stage.id))
        issues.push({ level: 'warning', columnIds: cols(stage.id), text: `${stage.name} är delat med en annan skolenhet; stadiets summa prövas inte här.` });
    return issues;
  }
  if (education.kind === 'gymnasium') {
    for (const block of education.blocks ?? []) {
      const points = education.rows.filter((r) => r.block === block.id).reduce((n, r) => n + (r.points ?? 0), 0);
      if (points !== block.points)
        issues.push({ level: 'error', text: `${block.name} omfattar ${format(points)} poäng; poängplanen anger ${format(block.points)}.` });
    }
    for (const row of education.rows)
      if ((row.points ?? 0) > 0 && rowTotal(plan, row.id) === 0)
        issues.push({ level: 'error', rowId: row.id, text: `${row.name} (${format(row.points ?? 0)} p) saknar undervisningstid.` });
    const total = planTotal(education, plan);
    if (total < education.frame.total)
      issues.push({ level: 'error', text: `Totalt ${format(total)} timmar; garanterad undervisningstid är ${format(education.frame.total)}.` });
    else if (total - education.frame.total < education.frame.total * 0.02)
      issues.push({ level: 'warning', text: `Marginalen mot garanterad undervisningstid är ${format(total - education.frame.total)} timmar. Utebliven undervisning måste då ersättas fullt ut.` });
    for (const [i, column] of education.columns.entries())
      if (columnTotals(education, plan)[i] === 0)
        issues.push({ level: 'warning', columnIds: [column.id], text: `${column.label} saknar undervisningstid.` });
    return issues;
  }
  const weekly = planTotal(education, plan);
  if (weekly < education.frame.total)
    issues.push({ level: 'error', text: `${format(weekly)} timmar per vecka; heltid är i genomsnitt minst ${format(education.frame.total)}.` });
  return issues;
}

function entry(role: Role, action: string, comment: string): Entry {
  return { id: uid(), time: clock(), role, action, comment };
}

function plan(education: Education, version: number, status: TimplanStatus, cells: Record<string, number[]>, history: Entry[], decidedOn?: string): Timplan {
  return { id: uid(), educationId: education.id, version, status, cells: structuredClone(cells), history, catalog: snapshotInfo.fetched, basis: education.basis, decidedOn };
}

export function createTimplanState(organisation: OrganisationState = createOrganisationState()): TimplanState {
  const educations = deriveEducations(organisation);
  const by = (id: string) => educations.find((e) => e.id === id);
  const stamp = (role: Role, action: string, comment: string, time: string): Entry => ({ ...entry(role, action, comment), time });
  const plans: Timplan[] = [];

  const gr = by('gr');
  if (gr) {
    // Gällande plan utan skolans val, och rektorns förslag om en profil i
    // högstadiet där tid från slöjd, bild och teknik samlas i skolans val.
    const base = defaultCells(gr);
    const draft = structuredClone(base);
    const set = (row: string, values: number[]) => {
      for (const [i, year] of [7, 8, 9].entries()) {
        const index = gr.columns.findIndex((c) => c.id === `ak${year}`);
        if (index >= 0) draft[row][index] = values[i];
      }
    };
    set('slojd', [38, 37, 37]);
    set('bild', [27, 27, 26]);
    set('teknik', [26, 25, 25]);
    set('skolansval', [20, 20, 20]);
    plans.push(
      plan(gr, 1, 'fastställd', base, [
        stamp('rektor', 'Förslag skickat', 'Nationell fördelning jämnt över årskurserna inom varje stadium.', '2026-05-12'),
        stamp('huvudman', 'Fastställd', 'Fastställd av styrelsen att gälla från läsåret 2025/26.', '2026-06-03'),
      ], '2026-06-03'),
      plan(gr, 2, 'utkast', draft, [
        stamp('rektor', 'Utkast påbörjat', 'Profil i högstadiet: 60 timmar skolans val från slöjd, bild och teknik, inom 20-procentsgränsen.', '2026-09-02'),
      ]),
    );
  }
  const sa = by('sa25');
  if (sa)
    plans.push(
      plan(sa, 1, 'förslag', defaultCells(sa), [
        stamp('rektor', 'Utkast påbörjat', 'Poängplan v1 med inriktning samhällsvetenskap. 90 timmar per 100 poäng.', '2026-08-28'),
        stamp('rektor', 'Förslag skickat', 'Fördelningen ger 70 timmar marginal mot garanterad undervisningstid. Programfördjupning år 3.', '2026-09-03'),
      ]),
    );
  const ek = by('ek25');
  if (ek) {
    const draft = defaultCells(ek);
    draft.GYAREK25 = [0, 0, 0];
    draft.IDRO1000X = [30, 30, 0];
    plans.push(
      plan(ek, 1, 'utkast', draft, [
        stamp('rektor', 'Utkast påbörjat', 'Påbörjat efter SA25. Gymnasiearbetet och idrottens år 3 är inte placerade än.', '2026-09-04'),
      ]),
    );
  }
  const im = by('im');
  if (im)
    plans.push(
      plan(im, 1, 'fastställd', defaultCells(im), [
        stamp('rektor', 'Förslag skickat', 'Utbildningsplan för individuellt alternativ: 24 timmar per vecka.', '2026-06-10'),
        stamp('huvudman', 'Fastställd', 'Utbildningsplanen fastställd. Praktiken följs upp per elev i studieplanen.', '2026-06-17'),
      ], '2026-06-17'),
    );
  return { role: 'rektor', educations, plans };
}

export const currentPlan = (state: TimplanState, educationId: string): Timplan | undefined =>
  state.plans.find((p) => p.educationId === educationId && p.status === 'fastställd');
export const openPlan = (state: TimplanState, educationId: string): Timplan | undefined =>
  state.plans.find((p) => p.educationId === educationId && ['utkast', 'förslag', 'återsänd'].includes(p.status));
export const educationOf = (state: TimplanState, plan: Timplan): Education =>
  state.educations.find((e) => e.id === plan.educationId)!;

const editableStatus: TimplanStatus[] = ['utkast', 'återsänd'];
export const canEdit = (state: TimplanState, plan: Timplan) =>
  state.role === 'rektor' && editableStatus.includes(plan.status);

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function replace(state: TimplanState, next: Timplan): TimplanState {
  return { ...state, plans: state.plans.map((p) => (p.id === next.id ? next : p)) };
}

export function setRole(state: TimplanState, role: Role): TimplanState {
  return { ...state, role };
}

export function startRevision(state: TimplanState, educationId: string): TimplanState {
  ensure(state.role === 'rektor', 'Rektorn föreslår fördelningen; huvudmannen fastställer den.');
  ensure(!openPlan(state, educationId), 'Det finns redan en öppen version. Avsluta den först.');
  const latest = [...state.plans].filter((p) => p.educationId === educationId).sort((a, b) => b.version - a.version)[0];
  const education = state.educations.find((e) => e.id === educationId);
  ensure(education, 'Utbildningen saknar fastställd grund för en timplan.');
  // Rader som inte längre finns i grunden faller bort; nya rader får utgångsvärden.
  const cells: Record<string, number[]> = {};
  const fallback = defaultCells(education);
  for (const row of education.rows) cells[row.id] = latest?.cells[row.id] ?? fallback[row.id];
  const next = plan(education, (latest?.version ?? 0) + 1, 'utkast', cells, [
    entry('rektor', 'Utkast påbörjat', latest ? `Utgår från version ${latest.version} (${latest.basis}). Grund: ${education.basis}.` : `Utgår från nationell fördelning. Grund: ${education.basis}.`),
  ]);
  return { ...state, plans: [next, ...state.plans] };
}

export function setCell(state: TimplanState, planId: string, rowId: string, columnIndex: number, value: number): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(canEdit(state, current), 'Bara rektorn kan ändra ett utkast eller en återsänd version.');
  const education = educationOf(state, current);
  const row = education.rows.find((r) => r.id === rowId);
  const column = education.columns[columnIndex];
  ensure(row && column && cellEditable(education, row, column), 'Cellen kan inte ändras.');
  ensure(Number.isInteger(value) && value >= 0 && value <= 2000, 'Ange ett heltal mellan 0 och 2 000.');
  const cells = { ...current.cells, [rowId]: [...(current.cells[rowId] ?? education.columns.map(() => 0))] };
  cells[rowId][columnIndex] = value;
  return replace(state, { ...current, cells });
}

export function submit(state: TimplanState, planId: string, comment: string): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(state.role === 'rektor', 'Bara rektorn skickar förslag till huvudmannen.');
  ensure(editableStatus.includes(current.status), 'Versionen är redan skickad eller avslutad.');
  ensure(comment.trim(), 'Beskriv förslaget för huvudmannen.');
  const errors = timplanIssues(educationOf(state, current), current).filter((i) => i.level === 'error');
  ensure(!errors.length, `Åtgärda ${errors.length} avvikelse${errors.length > 1 ? 'r' : ''} innan förslaget skickas.`);
  return replace(state, { ...current, status: 'förslag', history: [entry('rektor', 'Förslag skickat', comment.trim()), ...current.history] });
}

export function withdraw(state: TimplanState, planId: string): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(state.role === 'rektor' && current.status === 'förslag', 'Bara ett skickat förslag kan tas tillbaka av rektorn.');
  return replace(state, { ...current, status: 'utkast', history: [entry('rektor', 'Förslag återtaget', 'Förslaget togs tillbaka för fortsatt arbete.'), ...current.history] });
}

export function requestChanges(state: TimplanState, planId: string, comment: string): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(state.role === 'huvudman', 'Bara huvudmannen återsänder ett förslag.');
  ensure(current.status === 'förslag', 'Bara ett skickat förslag kan återsändas.');
  ensure(comment.trim(), 'Ange vad rektorn behöver ändra.');
  return replace(state, { ...current, status: 'återsänd', history: [entry('huvudman', 'Återsänd för ändring', comment.trim()), ...current.history] });
}

export function approve(state: TimplanState, planId: string, comment: string): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(state.role === 'huvudman', 'Bara huvudmannen fastställer en timplan.');
  ensure(current.status === 'förslag', 'Bara ett skickat förslag kan fastställas.');
  ensure(comment.trim(), 'Dokumentera beslutet.');
  const errors = timplanIssues(educationOf(state, current), current).filter((i) => i.level === 'error');
  ensure(!errors.length, 'Förslaget har avvikelser mot den nationella ramen och kan inte fastställas.');
  const previous = currentPlan(state, current.educationId);
  const plans = state.plans.map((p) =>
    p.id === current.id
      ? { ...p, status: 'fastställd' as const, decidedOn: today, history: [entry('huvudman', 'Fastställd', comment.trim()), ...p.history] }
      : previous && p.id === previous.id
        ? { ...p, status: 'ersatt' as const, history: [entry('huvudman', 'Ersatt', `Ersatt av version ${current.version}.`), ...p.history] }
        : p,
  );
  return { ...state, plans };
}

export function addComment(state: TimplanState, planId: string, text: string): TimplanState {
  const current = state.plans.find((p) => p.id === planId);
  ensure(current, 'Timplanen finns inte.');
  ensure(current.status !== 'ersatt', 'En ersatt version kan inte kommenteras.');
  ensure(text.trim(), 'Skriv en kommentar.');
  return replace(state, { ...current, history: [entry(state.role, 'Kommentar', text.trim()), ...current.history] });
}

/** Jämför två versioner cell för cell för en läsbar före/efter-lista. */
export function diffPlans(education: Education, before: Timplan | undefined, after: Timplan) {
  const changes: { rowId: string; name: string; columnId: string; label: string; from: number; to: number }[] = [];
  for (const row of education.rows)
    for (const [i, column] of education.columns.entries()) {
      const from = before?.cells[row.id]?.[i] ?? 0;
      const to = after.cells[row.id]?.[i] ?? 0;
      if (from !== to) changes.push({ rowId: row.id, name: row.name, columnId: column.id, label: column.label, from, to });
    }
  return changes;
}
