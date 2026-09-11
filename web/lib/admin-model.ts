import { today, uid } from './common.ts';
import {
  createOrganisationState,
  offeringTitle,
  studyPlanTemplate,
  currentPointPlan,
  type OrganisationState,
} from './organisation-model.ts';
import { createTimplanState, type TimplanState } from './timplan-model.ts';
import {
  findSubject,
  label as syllabusLabel,
  points as syllabusPoints,
  regimeOf,
  syllabusIssues,
  type Regime,
  type SyllabusRef,
} from './syllabus.ts';

export type AdminView = 'students' | 'plans' | 'groups' | 'planning';
export type { Regime, SyllabusRef };
export { today, uid } from './common.ts';
export type PlanItem = {
  id: string;
  name: string;
  points: number;
  period: string;
  groupId: string | null;
  /**
   * Hänvisning till nationell styrdokumentsversion. Saknas för lokalt innehåll
   * utan motsvarighet i Skolverkets katalog, till exempel praktik.
   */
  syllabus?: SyllabusRef;
  /** Poängplanens block som raden kommer ur. */
  block?: string;
  /** Skolan har undervisningsgrupper för modulen; utan koppling är det en brist. */
  groupRequired?: boolean;
};
export type PlanDraft = {
  items: PlanItem[];
  reason: string;
  created: string;
  basedOn: number;
};
export type Pupil = {
  id: string;
  name: string;
  className: string;
  program: string;
  regime: Regime;
  mentor: string;
  status: 'Aktiv' | 'Inskrivning';
  start: string;
  goal?: string;
  end?: string;
  /** Skolenheten eleven är inskriven vid. Alltid exakt en. */
  unitId: string;
  /** Utbildningen enligt huvudmannens utbud; studieplanen skapas ur dess poängplan. */
  offering?: { id: string; title: string; basis: string };
  plan: PlanItem[];
  planVersion: number;
  draft?: PlanDraft;
};
export type Group = {
  id: string;
  name: string;
  moduleId: string;
  subject: string;
  /** Härleds ur katalogens typeOfSyllabus när gruppen har en hänvisning. */
  regime: Regime;
  teacher: string;
  capacity: number;
  members: string[];
  syllabus?: SyllabusRef;
};
export type Slot = {
  id: string;
  groupId: string;
  day: number;
  start: number;
  duration: number;
  room: string;
  teacher: string;
};
export type Change = {
  id: string;
  time: string;
  title: string;
  detail: string;
  pupilIds: string[];
};
export type AdminState = {
  pupils: Pupil[];
  groups: Group[];
  slots: Slot[];
  changes: Change[];
  revision: number;
};
export const rooms = [
  { id: 'A201', capacity: 24 },
  { id: 'A204', capacity: 16 },
  { id: 'B301', capacity: 30 },
  { id: 'B304', capacity: 8 },
];
export const teachers = ['Alex Lind', 'Mira Ek', 'Robin Berg', 'Sam Nilsson'];
export const dayNames = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
export const timeLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}.${String(minutes % 60).padStart(2, '0')}`;
const names = [
  'Alma Berg',
  'Amir Lind',
  'Astrid Holm',
  'Elias Norén',
  'Ella Dahl',
  'Felix Lund',
  'Freja Ek',
  'Hugo Strand',
  'Ines Bergman',
  'Isak Lindén',
  'Lea Nyström',
  'Leo Sjöberg',
  'Maja Sand',
  'Noah Vik',
  'Olivia Lind',
  'Omar Ekström',
  'Saga Bäck',
  'Sam Holm',
  'Vera Nord',
  'William Falk',
];
/**
 * Lokal modulidentitet → nationell styrdokumentsversion. Den lokala nyckeln är
 * skolans egen; koden till höger ägs av Skolverket och skrivs aldrig om här.
 */
const moduleRefs: Record<string, SyllabusRef> = {
  MATE1B00X: { subject: 'MATE', item: 'MATE1B00X', version: 1 },
  SVEN1000X: { subject: 'SVEN', item: 'SVEN1000X', version: 1 },
  ENGE1000X: { subject: 'ENGE', item: 'ENGE1000X', version: 1 },
  sv3: { subject: 'SVE', item: 'SVESVE03', version: 8 },
  ma2: { subject: 'MAT', item: 'MATMAT02b', version: 11 },
  'gr-sv': { subject: 'GRGRSVE01', version: 15 },
  'im-sv': { subject: 'GRGRSVE01', version: 15 },
};
export const moduleRef = (moduleId: string): SyllabusRef | undefined =>
  moduleRefs[moduleId];

// Namn, poäng och regelverk läses ur katalogen. En okänd kod ska märkas, inte gissas.
function teachingGroup(
  group: Omit<Group, 'regime' | 'subject' | 'syllabus' | 'members'>,
): Group {
  const syllabus = moduleRefs[group.moduleId];
  const regime = syllabus && regimeOf(syllabus);
  if (!syllabus || !regime)
    throw new Error(
      `${group.moduleId} saknar giltig hänvisning till Skolverkets katalog.`,
    );
  return {
    ...group,
    subject: syllabusLabel(syllabus),
    regime,
    syllabus,
    members: [],
  };
}

function planItem(
  moduleId: string,
  period: string,
  groupId: string | null,
): PlanItem {
  const syllabus = moduleRefs[moduleId];
  if (!syllabus)
    throw new Error(`${moduleId} saknar hänvisning till Skolverkets katalog.`);
  return {
    id: moduleId,
    name: syllabusLabel(syllabus),
    points: syllabusPoints(syllabus) ?? 0,
    period,
    groupId,
    syllabus,
    groupRequired: baseGroups.some((g) => g.moduleId === moduleId),
  };
}

const baseGroups: Group[] = [
  {
    id: 'ma-a',
    name: 'MA1B · A',
    moduleId: 'MATE1B00X',
    teacher: 'Mira Ek',
    capacity: 10,
  },
  {
    id: 'ma-b',
    name: 'MA1B · B',
    moduleId: 'MATE1B00X',
    teacher: 'Mira Ek',
    capacity: 8,
  },
  {
    id: 'sv-a',
    name: 'SV1 · A',
    moduleId: 'SVEN1000X',
    teacher: 'Alex Lind',
    capacity: 16,
  },
  {
    id: 'en-a',
    name: 'EN1 · A',
    moduleId: 'ENGE1000X',
    teacher: 'Robin Berg',
    capacity: 16,
  },
  {
    id: 'sv3',
    name: 'SV3 · SA24',
    moduleId: 'sv3',
    teacher: 'Alex Lind',
    capacity: 12,
  },
  {
    id: 'ma2',
    name: 'MA2B · SA24',
    moduleId: 'ma2',
    teacher: 'Mira Ek',
    capacity: 12,
  },
  {
    id: 'gr-sv',
    name: 'SV · 8A',
    moduleId: 'gr-sv',
    teacher: 'Alex Lind',
    capacity: 24,
  },
  {
    id: 'im',
    name: 'IM · Svenska',
    moduleId: 'im-sv',
    teacher: 'Sam Nilsson',
    capacity: 8,
  },
].map(teachingGroup);

/**
 * Elevens studieplan skapas ur utbildningens fastställda poängplan och den
 * senaste timplanens läsårsplacering (Gymnasieförordningen 7 kap. 7 §).
 * Elevens egna val och avvikelser läggs ovanpå mallen; de finns inte i exemplet.
 */
function studyPlanFromOffering(
  organisation: OrganisationState,
  timplans: TimplanState,
  offeringId: string,
  groupFor: (levelCode: string) => string | null,
): { offering: Pupil['offering']; plan: PlanItem[] } | undefined {
  const offering = organisation.offerings.find((o) => o.id === offeringId);
  const pointPlan = offering && currentPointPlan(offering);
  if (!offering || !pointPlan) return undefined;
  const timplan = [...timplans.plans]
    .filter((p) => p.educationId === offeringId)
    .sort((a, b) => (a.status === 'fastställd' ? -1 : 1) - (b.status === 'fastställd' ? -1 : 1) || b.version - a.version)[0];
  const education = timplans.educations.find((e) => e.id === offeringId);
  const yearOf = (code: string) => {
    const cells = timplan?.cells[code];
    const index = cells ? cells.findIndex((h) => h > 0) : -1;
    return index >= 0 ? index + 1 : undefined;
  };
  const plan: PlanItem[] = studyPlanTemplate(offering, pointPlan).map((level) => {
    const subject = level.subjectCode ? findSubject(level.subjectCode) : undefined;
    const year = yearOf(level.code);
    const groupId = year === 1 ? groupFor(level.code) : null;
    return {
      id: level.code,
      name: level.name,
      points: level.points,
      period: year ? `Läsår ${year}${year === 1 ? ' (2026/27)' : ''}` : 'Ej placerad',
      groupId,
      syllabus: subject ? { subject: subject.code, item: level.code, version: subject.version } : undefined,
      block: level.block,
      groupRequired: year === 1 && baseGroups.some((g) => g.moduleId === level.code),
    };
  });
  return {
    offering: { id: offering.id, title: offeringTitle(offering), basis: `${education?.basis ?? `Poängplan v${pointPlan.version}`}${timplan ? ` · timplan v${timplan.version} (${timplan.status})` : ''}` },
    plan,
  };
}

/**
 * Klasserna som eleverna är indelade i, med det som behövs för att koppla
 * klassen till rätt årskurs i timplanen. Klassnamnet är källan: siffran först
 * är grundskolans årskurs, siffrorna efter programbokstäverna är kullens
 * startår. Går det inte att läsa ut lämnas fältet tomt och klassen visas utan
 * timplansjämförelse i stället för att gissa.
 */
export function deriveClasses(state: AdminState) {
  const byName = new Map<string, { name: string; kind: 'grundskola' | 'gymnasium' | 'introduktionsprogram'; educationId?: string; grade?: number; cohortYear?: number; programPrefix?: string; pupils: number }>();
  for (const p of state.pupils) {
    const kind =
      p.program === 'Grundskola'
        ? ('grundskola' as const)
        : p.program === 'Introduktionsprogram'
          ? ('introduktionsprogram' as const)
          : ('gymnasium' as const);
    const grade = kind === 'grundskola' ? Number(/^(\d{1,2})/.exec(p.className)?.[1]) || undefined : undefined;
    const twoDigits = /(\d{2})/.exec(p.className)?.[1];
    const cohortYear = kind === 'grundskola' || !twoDigits ? undefined : 2000 + Number(twoDigits);
    const programPrefix = /^([A-ZÅÄÖ]{2,3})\d/.exec(p.className)?.[1];
    const row = byName.get(p.className) ?? { name: p.className, kind, educationId: p.offering?.id, grade, cohortYear, programPrefix, pupils: 0 };
    row.pupils += 1;
    if (!row.educationId && p.offering?.id) row.educationId = p.offering.id;
    byName.set(p.className, row);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'sv'));
}

export type AdminSource = { organisation: OrganisationState; timplans: TimplanState };
export function createAdminState(source?: AdminSource): AdminState {
  const organisation = source?.organisation ?? createOrganisationState();
  const timplans = source?.timplans ?? createTimplanState(organisation);
  const groups = baseGroups.map((g) => ({ ...g, members: [] as string[] }));
  const pupils: Pupil[] = names.map((name, i) => {
    const id = `E-${1001 + i}`;
    const regime: Regime =
      i < 12 ? 'Gy25' : i < 16 ? 'Gy11' : i < 18 ? 'Grundskola' : 'Gy25';
    const im = i >= 18;
    const className =
      i < 6
        ? 'SA26A'
        : i < 12
          ? 'EK26A'
          : i < 16
            ? 'SA24A'
            : i < 18
              ? '8A'
              : 'IM26';
    // Gy25-eleverna får sin studieplan ur huvudmannens poängplan och timplan.
    const derived =
      regime === 'Gy25' && !im
        ? studyPlanFromOffering(organisation, timplans, className.startsWith('EK') ? 'ek25' : 'sa25', (code) =>
            code === 'MATE1B00X'
              ? i === 4 || i === 10 ? null : i < 6 ? 'ma-a' : 'ma-b'
              : code === 'SVEN1000X'
                ? 'sv-a'
                : code === 'ENGE1000X'
                  ? 'en-a'
                  : null,
          )
        : undefined;
    const plan: PlanItem[] =
      regime === 'Grundskola'
        ? []
        : im
          ? [
              planItem('im-sv', 'HT 2026', 'im'),
              {
                // Lokalt innehåll utan motsvarighet i Skolverkets katalog.
                id: 'praktik',
                name: 'Praktik och yrkesorientering',
                points: 0,
                period: 'HT 2026',
                groupId: null,
              },
            ]
          : regime === 'Gy11'
            ? [
                planItem('sv3', 'HT 2026', 'sv3'),
                planItem('ma2', 'HT 2026', 'ma2'),
              ]
            : (derived?.plan ?? []);
    if (regime === 'Grundskola')
      groups.find((g) => g.id === 'gr-sv')!.members.push(id);
    for (const item of plan)
      if (item.groupId)
        groups.find((g) => g.id === item.groupId)!.members.push(id);
    const pupil: Pupil = {
      id,
      unitId: organisation.activeUnitId,
      name,
      className,
      program: im
        ? 'Introduktionsprogram'
        : regime === 'Grundskola'
          ? 'Grundskola'
          : className.startsWith('EK')
            ? 'Ekonomiprogrammet'
            : 'Samhällsvetenskapsprogrammet',
      regime,
      offering: derived?.offering,
      mentor: i < 12 ? 'Mira Ek' : i < 16 ? 'Robin Berg' : 'Sam Nilsson',
      status: i === 10 ? 'Inskrivning' : 'Aktiv',
      start: regime === 'Gy11' ? '2024-08-19' : '2026-08-17',
      plan,
      planVersion: 2,
      ...(im
        ? {
            goal: 'Behörighet till nationellt program genom kompletterande grundskoleämnen och yrkesorientering.',
            end: '2027-06-11',
          }
        : {}),
    };
    if (i === 2)
      pupil.draft = {
        items: plan.map((x) => ({
          ...x,
          period: x.id === 'ENGE1000X' ? 'Läsår 1, vårterminen' : x.period,
        })),
        reason:
          'Förslag till ändrad förläggning. Behöver stämmas av med eleven och ansvarig funktion.',
        created: '2026-09-04',
        basedOn: 2,
      };
    return pupil;
  });
  const slots: Slot[] = [
    {
      id: 's1',
      groupId: 'ma-a',
      day: 0,
      start: 540,
      duration: 60,
      room: 'A201',
      teacher: 'Mira Ek',
    },
    {
      id: 's2',
      groupId: 'sv-a',
      day: 0,
      start: 630,
      duration: 60,
      room: 'B301',
      teacher: 'Alex Lind',
    },
    {
      id: 's3',
      groupId: 'ma-b',
      day: 1,
      start: 540,
      duration: 60,
      room: 'A204',
      teacher: 'Mira Ek',
    },
    {
      id: 's4',
      groupId: 'en-a',
      day: 1,
      start: 630,
      duration: 60,
      room: 'B301',
      teacher: 'Robin Berg',
    },
    {
      id: 's5',
      groupId: 'sv3',
      day: 2,
      start: 540,
      duration: 60,
      room: 'B304',
      teacher: 'Alex Lind',
    },
    {
      id: 's6',
      groupId: 'im',
      day: 2,
      start: 540,
      duration: 60,
      room: 'B304',
      teacher: 'Sam Nilsson',
    },
    {
      id: 's7',
      groupId: 'ma2',
      day: 3,
      start: 540,
      duration: 60,
      room: 'A201',
      teacher: 'Mira Ek',
    },
    {
      id: 's8',
      groupId: 'gr-sv',
      day: 4,
      start: 540,
      duration: 60,
      room: 'A204',
      teacher: 'Alex Lind',
    },
    {
      id: 's9',
      groupId: 'ma-a',
      day: 3,
      start: 660,
      duration: 60,
      room: 'A201',
      teacher: 'Mira Ek',
    },
    {
      id: 's10',
      groupId: 'ma-b',
      day: 4,
      start: 660,
      duration: 60,
      room: 'A204',
      teacher: 'Mira Ek',
    },
  ];
  return { pupils, groups, slots, changes: [], revision: 1 };
}
export type Conflict = { key: string; message: string; slotIds: string[] };
export function scheduleConflicts(state: AdminState): Conflict[] {
  const issues: Conflict[] = [];
  for (const [i, a] of state.slots.entries()) {
    const group = state.groups.find((g) => g.id === a.groupId);
    const room = rooms.find((r) => r.id === a.room);
    if (group && room && group.members.length > room.capacity)
      issues.push({
        key: `capacity:${a.id}`,
        message: `${a.room} har ${room.capacity} platser, men ${group.name} har ${group.members.length} elever.`,
        slotIds: [a.id],
      });
    for (const b of state.slots.slice(i + 1)) {
      if (
        a.day !== b.day ||
        a.start >= b.start + b.duration ||
        b.start >= a.start + a.duration
      )
        continue;
      const id = [a.id, b.id].sort().join(':');
      if (a.room === b.room)
        issues.push({
          key: `room:${id}`,
          message: `${a.room} är dubbelbokad ${dayNames[a.day].toLowerCase()} ${timeLabel(Math.max(a.start, b.start))}.`,
          slotIds: [a.id, b.id],
        });
      if (a.teacher === b.teacher)
        issues.push({
          key: `teacher:${id}`,
          message: `${a.teacher} har två samtidiga pass.`,
          slotIds: [a.id, b.id],
        });
      const other = state.groups.find((g) => g.id === b.groupId);
      if (a.groupId === b.groupId)
        issues.push({
          key: `group:${id}`,
          message: `${group?.name ?? a.groupId} har två samtidiga pass.`,
          slotIds: [a.id, b.id],
        });
      if (
        group &&
        other &&
        group.id !== other.id &&
        group.members.some((id) => other.members.includes(id))
      )
        issues.push({
          key: `students:${id}`,
          message: `${group.name} och ${other.name} har gemensamma elever samtidigt.`,
          slotIds: [a.id, b.id],
        });
    }
  }
  return issues;
}
/**
 * Kontrollerar elevens planrader mot den hämtade katalogen. Returnerar skälen,
 * inte en flagga: den som ska åtgärda avvikelsen behöver se vad som avviker.
 */
export function planSyllabusIssues(
  p: Pupil,
  now: string = today,
): { item: PlanItem; issues: string[] }[] {
  return p.plan
    .filter((item) => item.syllabus)
    .map((item) => ({
      item,
      issues: syllabusIssues(item.syllabus!, {
        today: now,
        startedOn: p.start,
        localPoints: item.points,
      }),
    }))
    .filter((row) => row.issues.length > 0);
}

/**
 * En grupp följer den styrdokumentsordning dess ämne har. En elev på
 * introduktionsprogram läser grundskoleämnen för behörighet och ska därför
 * kunna placeras i en sådan grupp utan att byta utbildningskull.
 */
export function regimeAllowed(pupil: Pupil, group: Group): boolean {
  if (pupil.regime === group.regime) return true;
  return (
    group.regime === 'Grundskola' &&
    pupil.regime !== 'Grundskola' &&
    pupil.program === 'Introduktionsprogram'
  );
}

export function pupilIssues(p: Pupil): string[] {
  const issues: string[] = [];
  if (p.status === 'Inskrivning') issues.push('Inskrivning pågår');
  if (p.regime !== 'Grundskola' && !p.plan.length)
    issues.push('Studieplan saknas');
  if (p.plan.some((x) => x.groupRequired && !x.groupId))
    issues.push('Gruppkoppling saknas');
  if (planSyllabusIssues(p).length) issues.push('Styrdokument att kontrollera');
  if (p.draft) issues.push('Planutkast att granska');
  return issues;
}
export function groupPreview(
  state: AdminState,
  ids: string[],
  targetId: string,
) {
  const target = state.groups.find((g) => g.id === targetId);
  const errors: string[] = [];
  const unique = [...new Set(ids)];
  if (!target || !unique.length)
    return {
      errors: ['Välj elever och en undervisningsgrupp.'],
      changes: [] as { id: string; from: string; to: string }[],
      next: state,
    };
  const changes: { id: string; from: string; to: string }[] = [];
  for (const id of unique) {
    const p = state.pupils.find((p) => p.id === id);
    if (!p) {
      errors.push('En vald elev finns inte längre.');
      continue;
    }
    if (
      !regimeAllowed(p, target) ||
      (p.regime !== 'Grundskola' &&
        !p.plan.some((i) => i.id === target.moduleId))
    ) {
      errors.push(
        `${p.name}: gruppen motsvarar inte elevens studieinnehåll eller regelverk.`,
      );
      continue;
    }
    if (target.members.includes(id)) continue;
    const old = state.groups.filter(
      (g) => g.moduleId === target.moduleId && g.members.includes(id),
    );
    changes.push({
      id,
      from: old.map((g) => g.name).join(', ') || 'Ingen grupp',
      to: target.name,
    });
  }
  const moveIds = changes.map((c) => c.id);
  const groups = state.groups.map((g) =>
    g.id === target.id
      ? { ...g, members: [...g.members, ...moveIds] }
      : g.moduleId === target.moduleId
        ? { ...g, members: g.members.filter((id) => !moveIds.includes(id)) }
        : g,
  );
  const pupils = state.pupils.map((p) =>
    moveIds.includes(p.id)
      ? {
          ...p,
          plan: p.plan.map((item) =>
            item.id === target.moduleId
              ? { ...item, groupId: target.id }
              : item,
          ),
          planVersion: p.planVersion + (p.regime === 'Grundskola' ? 0 : 1),
        }
      : p,
  );
  const next = { ...state, groups, pupils };
  if (groups.find((g) => g.id === target.id)!.members.length > target.capacity)
    errors.push(
      `Gruppen skulle få ${groups.find((g) => g.id === target.id)!.members.length} elever. Kapaciteten är ${target.capacity}.`,
    );
  const before = new Set(scheduleConflicts(state).map((c) => c.key));
  for (const issue of scheduleConflicts(next)) {
    const affectedGroups = issue.slotIds.map((slotId) => {
      const slot = next.slots.find((s) => s.id === slotId)!;
      return next.groups.find((g) => g.id === slot.groupId)!;
    });
    // Existing conflicts must not conceal newly affected pupils or excess seats.
    const worsens = issue.key.startsWith('capacity:')
      ? affectedGroups.some((g) => g.id === targetId && moveIds.length > 0)
      : issue.key.startsWith('students:') &&
        moveIds.some(
          (id) =>
            affectedGroups.every((g) => g.members.includes(id)) &&
            !affectedGroups.every((g) =>
              state.groups.find((old) => old.id === g.id)!.members.includes(id),
            ),
        );
    if (!before.has(issue.key) || worsens) errors.push(issue.message);
  }
  if (!changes.length && !errors.length)
    errors.push('Alla valda elever finns redan i gruppen.');
  return { errors: [...new Set(errors)], changes, next };
}
function logChange(
  state: AdminState,
  title: string,
  detail: string,
  pupilIds: string[],
): AdminState {
  return {
    ...state,
    revision: state.revision + 1,
    changes: [
      {
        id: uid(),
        time: new Date().toLocaleTimeString('sv-SE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        title,
        detail,
        pupilIds,
      },
      ...state.changes,
    ],
  };
}
export function applyGroup(
  state: AdminState,
  ids: string[],
  targetId: string,
): AdminState {
  const preview = groupPreview(state, ids, targetId);
  if (preview.errors.length) throw new Error(preview.errors.join(' '));
  return logChange(
    preview.next,
    'Undervisningsgrupp ändrad',
    `${preview.changes.length} elever → ${state.groups.find((g) => g.id === targetId)!.name}. Klass och program är oförändrade.`,
    preview.changes.map((c) => c.id),
  );
}
export function slotPreview(state: AdminState, slot: Slot) {
  const errors: string[] = [];
  if (!state.slots.some((s) => s.id === slot.id))
    errors.push('Schemapasset finns inte.');
  if (!state.groups.some((g) => g.id === slot.groupId))
    errors.push('Välj en känd undervisningsgrupp.');
  if (!rooms.some((r) => r.id === slot.room))
    errors.push('Välj en känd lokal.');
  if (!teachers.includes(slot.teacher)) errors.push('Välj en känd lärare.');
  if (
    !Number.isInteger(slot.day) ||
    slot.day < 0 ||
    slot.day > 4 ||
    !Number.isInteger(slot.start) ||
    slot.start < 480 ||
    slot.start + slot.duration > 1020 ||
    !Number.isInteger(slot.duration) ||
    slot.duration < 15
  )
    errors.push('Passet måste rymmas inom en vardag 08.00–17.00.');
  const next = {
    ...state,
    slots: state.slots.map((s) => (s.id === slot.id ? slot : s)),
  };
  for (const issue of scheduleConflicts(next))
    if (issue.slotIds.includes(slot.id)) errors.push(issue.message);
  return { errors: [...new Set(errors)], next };
}
export function applySlot(state: AdminState, slot: Slot): AdminState {
  const preview = slotPreview(state, slot);
  if (preview.errors.length) throw new Error(preview.errors.join(' '));
  const before = state.slots.find((s) => s.id === slot.id)!;
  return logChange(
    preview.next,
    'Schemapass ändrat',
    `${state.groups.find((g) => g.id === slot.groupId)?.name}: ${dayNames[before.day]} ${timeLabel(before.start)}, ${before.room} → ${dayNames[slot.day]} ${timeLabel(slot.start)}, ${slot.room}.`,
    state.groups.find((g) => g.id === slot.groupId)?.members ?? [],
  );
}
export function savePlanDraft(
  state: AdminState,
  id: string,
  items: PlanItem[],
  reason: string,
): AdminState {
  const pupil = state.pupils.find((p) => p.id === id);
  if (!pupil || pupil.regime === 'Grundskola')
    throw new Error('Välj en gymnasieelev.');
  if (!reason.trim()) throw new Error('Beskriv orsaken till ändringen.');
  if (
    items.some(
      (item) =>
        !item.name.trim() || !Number.isFinite(item.points) || item.points < 0,
    )
  )
    throw new Error('Kontrollera namn och poäng.');
  if (JSON.stringify(items) === JSON.stringify(pupil.plan))
    throw new Error('Ändra minst en uppgift innan du sparar ett utkast.');
  return logChange(
    {
      ...state,
      pupils: state.pupils.map((p) =>
        p.id === id
          ? {
              ...p,
              draft: {
                items: structuredClone(items),
                reason: reason.trim(),
                created: today,
                basedOn: p.planVersion,
              },
            }
          : p,
      ),
    },
    'Planutkast sparat',
    reason.trim(),
    [id],
  );
}

export function discardPlanDraft(state: AdminState, id: string): AdminState {
  const pupil = state.pupils.find((p) => p.id === id);
  if (!pupil?.draft) return state;
  return logChange(
    {
      ...state,
      pupils: state.pupils.map((p) =>
        p.id === id ? { ...p, draft: undefined } : p,
      ),
    },
    'Planutkast borttaget',
    `Utkastet för ${pupil.name} togs bort. Gällande studieplan är oförändrad.`,
    [id],
  );
}

// Partition intersecting intervals into lanes, including different start times.
export function slotLanes(
  slots: Slot[],
): Record<string, { lane: number; count: number }> {
  const result: Record<string, { lane: number; count: number }> = {};
  for (let day = 0; day < 5; day++) {
    const sorted = slots
      .filter((s) => s.day === day)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
    let cluster: { slot: Slot; lane: number }[] = [];
    let ends: number[] = [];
    let clusterEnd = -1;
    const flush = () => {
      for (const item of cluster)
        result[item.slot.id] = { lane: item.lane, count: ends.length };
      cluster = [];
      ends = [];
    };
    for (const slot of sorted) {
      if (slot.start >= clusterEnd) flush();
      let lane = ends.findIndex((end) => end <= slot.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = slot.start + slot.duration;
      cluster.push({ slot, lane });
      clusterEnd = Math.max(clusterEnd, slot.start + slot.duration);
    }
    flush();
  }
  return result;
}
