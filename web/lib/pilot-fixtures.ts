/**
 * Syntetisk pilotfixtur: en huvudman med en grundskola och ett gymnasium,
 * två klasser per skola och sex elever per klass. Alla ID:n är stabila så att
 * vyer och browserprov kan referera till dem. Innehållet är påhittat och
 * innehåller inga personnummer, adresser eller kontaktuppgifter.
 *
 * Fixturen bygger inte på modellernas enskolefabrik; den återskapar de
 * utbildningar som timplans- och adminmodellen förutsätter (gr, sa25, ek25)
 * med rätt skolenhet. Varje anrop ger nya objekt.
 */
import type {
  Assignment,
  Entry,
  Offering,
  OrganisationState,
  Organizer,
  PointPlan,
  SchoolUnit,
} from './organisation-model.ts';
import { createTimplanState, type TimplanState } from './timplan-model.ts';
import {
  createAdminState,
  studyPlanFromOffering,
  type AdminState,
  type PlanItem,
  type Pupil,
} from './admin-model.ts';

export const PILOT_ORGANIZER: Organizer = {
  name: 'Exempelstads kommun',
  organizationNumber: '2120009999',
  type: 'Kommunal',
};
export const PILOT_UNIT_GR = '99999902';
export const PILOT_UNIT_GY = '99999903';

export type PilotClass = {
  id: string;
  unitId: string;
  name: string;
  kind: 'grundskola' | 'gymnasium';
  grade?: number;
  cohortYear?: number;
  educationId: string;
};
export type PilotPupil = {
  id: string;
  unitId: string;
  classId: string;
  displayName: string;
  schoolType: 'GR' | 'GY';
  educationId: string;
  placementStart: string;
  placementEnd?: string;
};
export type PilotFixture = {
  organisation: OrganisationState;
  timplans: TimplanState;
  admin: AdminState;
  classes: PilotClass[];
  pupils: PilotPupil[];
  units: { gr: string; gy: string };
};

const PLACEMENT_START = '2026-08-17';
const GRADES_1_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Fiktiva namn, 24 unika. Ordningen styr klassplaceringen. */
const pupilNames = [
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
  'Nora Wik',
  'Oskar Rehn',
  'Tuva Malm',
  'Viggo Åkesson',
];

type ClassSpec = {
  name: string;
  unitId: string;
  kind: PilotClass['kind'];
  educationId: string;
  grade?: number;
  cohortYear?: number;
};
const classSpecs: ClassSpec[] = [
  { name: '4A', unitId: PILOT_UNIT_GR, kind: 'grundskola', educationId: 'gr', grade: 4 },
  { name: '7B', unitId: PILOT_UNIT_GR, kind: 'grundskola', educationId: 'gr', grade: 7 },
  { name: 'SA26A', unitId: PILOT_UNIT_GY, kind: 'gymnasium', educationId: 'sa25', cohortYear: 2026 },
  { name: 'EK26A', unitId: PILOT_UNIT_GY, kind: 'gymnasium', educationId: 'ek25', cohortYear: 2026 },
];
const classId = (unitId: string, name: string) => `klass:${unitId}:${name}`;

/** Historikpost med fast ID och tid, så att fixturen blir lika mellan anrop. */
const stamp = (id: string, role: Entry['role'], action: string, comment: string, time: string): Entry => ({
  id,
  time,
  role,
  action,
  comment,
});
const decided = (id: string, specialization: string[], on: string): PointPlan => ({
  id,
  version: 1,
  status: 'fastställd',
  specialization,
  decidedOn: on,
  history: [
    stamp(`${id}-h1`, 'huvudman', 'Fastställd', 'Programfördjupning enligt förslag.', on),
    stamp(`${id}-h2`, 'rektor', 'Utkast påbörjat', 'Nationella block ur katalogen; programfördjupningen väljs.', '2026-04-20'),
  ],
});

function pilotUnits(): SchoolUnit[] {
  const shared = {
    organizer: { ...PILOT_ORGANIZER },
    municipality: { code: '0000', name: 'Exempelstad' },
    headMaster: 'Robin Berg',
    locality: 'Exempelstad',
    status: 'Exempel',
    source: { name: 'Syntetiskt exempel' },
    pupilRegister: { source: 'Syntetiskt exempel', count: 12, note: 'Fiktiva elever i provmiljön. Ingen registeranslutning.' },
  };
  return [
    {
      ...structuredClone(shared),
      id: PILOT_UNIT_GR,
      code: PILOT_UNIT_GR,
      name: 'Björkhagens grundskola',
      schoolTypes: [{ code: 'GR', name: 'Grundskola', grades: [...GRADES_1_9] }],
    },
    {
      ...structuredClone(shared),
      id: PILOT_UNIT_GY,
      code: PILOT_UNIT_GY,
      name: 'Exempelstads gymnasium',
      schoolTypes: [{ code: 'GY', name: 'Gymnasieskola', programmes: ['SA', 'EK'] }],
    },
  ];
}

function pilotOfferings(): Offering[] {
  return [
    {
      id: 'gr',
      unitId: PILOT_UNIT_GR,
      kind: 'grundskola',
      name: 'Grundskola',
      grades: [...GRADES_1_9],
      cohort: 'Läsåret 2026/27',
      status: 'aktiv',
      permits: [
        {
          id: 'p-gr',
          issuer: 'Huvudmannens beslut',
          reference: 'KS 2019/410',
          decided: '2019-09-26',
          validFrom: '2020-07-01',
          scope: 'Grundskola årskurs 1–9 vid Björkhagens grundskola, Exempelstad.',
        },
      ],
      pointPlans: [],
    },
    {
      id: 'sa25',
      unitId: PILOT_UNIT_GY,
      kind: 'gymnasium',
      name: 'Samhällsvetenskap',
      localCode: 'SASAP-EG',
      programCode: 'SA25',
      orientationCode: 'SASAP',
      cohort: 'Elever som börjar HT 2026',
      status: 'aktiv',
      permits: [
        {
          id: 'p-sa',
          issuer: 'Huvudmannens beslut',
          reference: 'BUN 2024/221',
          decided: '2024-09-18',
          validFrom: '2025-07-01',
          scope: 'Samhällsvetenskapsprogrammet, inriktning samhällsvetenskap, vid Exempelstads gymnasium.',
        },
      ],
      pointPlans: [decided('pp-sa', ['ENGE3000X', 'HIST3000X', 'RETO1000X'], '2026-05-06')],
    },
    {
      id: 'ek25',
      unitId: PILOT_UNIT_GY,
      kind: 'gymnasium',
      name: 'Ekonomi',
      localCode: 'EKEKI-EG',
      programCode: 'EK25',
      orientationCode: 'EKEKI',
      cohort: 'Elever som börjar HT 2026',
      status: 'aktiv',
      permits: [
        {
          id: 'p-ek',
          issuer: 'Huvudmannens beslut',
          reference: 'BUN 2024/222',
          decided: '2024-09-18',
          validFrom: '2025-07-01',
          scope: 'Ekonomiprogrammet, inriktning ekonomi, vid Exempelstads gymnasium.',
        },
      ],
      pointPlans: [decided('pp-ek', ['MARK1000X', 'JURI2000X', 'ENGE3000X'], '2026-05-06')],
    },
    {
      id: 'es-foto',
      unitId: PILOT_UNIT_GY,
      kind: 'gymnasium',
      name: 'Foto och rörlig bild',
      localCode: 'ESBIF-FOT',
      programCode: 'ES25',
      orientationCode: 'ESBIF',
      cohort: 'Elever som börjar HT 2027',
      status: 'planerad',
      permits: [
        {
          id: 'p-es',
          issuer: 'Huvudmannens beslut',
          reference: 'BUN 2026/087',
          decided: '2026-09-01',
          validFrom: '2027-07-01',
          scope: 'Estetiska programmet, inriktning bild och formgivning, vid Exempelstads gymnasium. Start senast läsåret 2028/29.',
        },
      ],
      pointPlans: [
        {
          id: 'pp-es-foto',
          version: 1,
          status: 'utkast',
          specialization: ['FOTO1000X', 'FOTO2000X', 'FOTO3000X', 'FILO1000X'],
          history: [
            stamp('pp-es-foto-h1', 'rektor', 'Utkast påbörjat', 'Foto nivå 1–3 och film- och tv-produktion. 100 poäng kvar att välja.', '2026-09-03'),
          ],
        },
      ],
    },
  ];
}

function pilotAssignments(): Assignment[] {
  return [
    { id: 'rektor-robin', name: 'Robin Berg', role: 'rektor', unitIds: [PILOT_UNIT_GR, PILOT_UNIT_GY] },
    { id: 'larare-alex', name: 'Alex Lind', role: 'larare', unitIds: [PILOT_UNIT_GY] },
    { id: 'larare-mira', name: 'Mira Ek', role: 'larare', unitIds: [PILOT_UNIT_GY] },
    { id: 'larare-sam', name: 'Sam Nilsson', role: 'larare', unitIds: [PILOT_UNIT_GR] },
  ];
}

function pilotOrganisation(): OrganisationState {
  return {
    organizer: { ...PILOT_ORGANIZER },
    activeUnitId: PILOT_UNIT_GR,
    units: pilotUnits(),
    offerings: pilotOfferings(),
    assignments: pilotAssignments(),
    log: [],
  };
}

export function createPilotFixture(): PilotFixture {
  const organisation = pilotOrganisation();
  const timplans = createTimplanState(organisation);
  const base = createAdminState({ organisation, timplans });
  const groups = base.groups.map((g) => ({ ...g, members: [] as string[] }));

  const classes: PilotClass[] = classSpecs.map((c) => ({
    id: classId(c.unitId, c.name),
    unitId: c.unitId,
    name: c.name,
    kind: c.kind,
    ...(c.grade !== undefined ? { grade: c.grade } : {}),
    ...(c.cohortYear !== undefined ? { cohortYear: c.cohortYear } : {}),
    educationId: c.educationId,
  }));

  const pupils: PilotPupil[] = [];
  const adminPupils: Pupil[] = [];
  for (const [i, name] of pupilNames.entries()) {
    const spec = classSpecs[Math.floor(i / 6)];
    const id = `E-${2001 + i}`;
    pupils.push({
      id,
      unitId: spec.unitId,
      classId: classId(spec.unitId, spec.name),
      displayName: name,
      schoolType: spec.kind === 'grundskola' ? 'GR' : 'GY',
      educationId: spec.educationId,
      placementStart: PLACEMENT_START,
    });
    if (spec.kind === 'grundskola') {
      adminPupils.push({
        id,
        unitId: spec.unitId,
        name,
        className: spec.name,
        program: 'Grundskola',
        regime: 'Grundskola',
        mentor: 'Sam Nilsson',
        status: 'Aktiv',
        start: PLACEMENT_START,
        plan: [],
        planVersion: 1,
      });
      groups.find((g) => g.id === 'gr-sv')!.members.push(id);
      continue;
    }
    const isEK = spec.name.startsWith('EK');
    const derived = studyPlanFromOffering(organisation, timplans, spec.educationId, (code) =>
      code === 'MATE1B00X' ? (isEK ? 'ma-b' : 'ma-a') : code === 'SVEN1000X' ? 'sv-a' : code === 'ENGE1000X' ? 'en-a' : null,
    );
    if (!derived) throw new Error(`Poängplan saknas för ${spec.educationId}`);
    const plan: PlanItem[] = derived.plan;
    for (const item of plan) if (item.groupId) groups.find((g) => g.id === item.groupId)!.members.push(id);
    adminPupils.push({
      id,
      unitId: spec.unitId,
      name,
      className: spec.name,
      program: isEK ? 'Ekonomiprogrammet' : 'Samhällsvetenskapsprogrammet',
      regime: 'Gy25',
      mentor: isEK ? 'Alex Lind' : 'Mira Ek',
      status: 'Aktiv',
      start: PLACEMENT_START,
      offering: derived.offering,
      plan,
      planVersion: 1,
    });
  }

  const admin: AdminState = {
    pupils: adminPupils,
    groups,
    slots: base.slots,
    changes: base.changes,
    revision: base.revision,
  };

  return {
    organisation,
    timplans,
    admin,
    classes,
    pupils,
    units: { gr: PILOT_UNIT_GR, gy: PILOT_UNIT_GY },
  };
}

export function pupilsForUnit(f: PilotFixture, unitId: string): PilotPupil[] {
  return f.pupils.filter((p) => p.unitId === unitId);
}

export function adminForUnit(f: PilotFixture, unitId: string): Pick<AdminState, 'pupils'> {
  return { pupils: f.admin.pupils.filter((p) => p.unitId === unitId) };
}

export function schoolLabel(unit: SchoolUnit): string {
  return `${unit.name} — ${unit.schoolTypes.some((t) => t.code === 'GY') ? 'Gymnasium' : 'Grundskola'}`;
}
