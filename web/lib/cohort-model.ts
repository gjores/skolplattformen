import { uid, clock } from './common.ts';
import type { OrganisationState, Role } from './organisation-model.ts';
import type { Timplan } from './timplan-model.ts';
import type { ClassRef, EducationRef } from './lasar-model.ts';

export type ClassTimplan = {
  unitId: string;
  className: string;
  startYear: number;
  timplanId: string;
  columnId: string;
};
export const cohortYear = (label: string) =>
  Number(/20\d{2}/.exec(label)?.[0]) || new Date().getFullYear();
export const cohortLabel = (kind: string, year: number) =>
  kind === 'gymnasium'
    ? `Elever som börjar HT ${year}`
    : `Läsåret ${year}/${String(year + 1).slice(2)}`;

export function copyCohort(
  org: OrganisationState,
  plans: Timplan[],
  role: Role,
  sourceId: string,
  year: number,
) {
  if (role !== 'huvudman')
    throw new Error('Bara huvudmannen kopierar utbildningar.');
  const source = org.offerings.find((o) => o.id === sourceId);
  if (!source) throw new Error('Utbildningen finns inte.');
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100 ||
    year <= cohortYear(source.cohort)
  )
    throw new Error('Välj ett startår efter den ursprungliga kullen.');
  const cohort = cohortLabel(source.kind, year);
  if (
    org.offerings.some(
      (o) =>
        o.unitId === source.unitId &&
        o.name === source.name &&
        o.kind === source.kind &&
        o.cohort === cohort,
    )
  )
    throw new Error('Utbildningen finns redan för den kullen.');
  const pp = [...source.pointPlans]
    .filter((p) => p.status !== 'ersatt')
    .sort((a, b) => b.version - a.version)[0];
  const sourcePlan = [...plans]
    .filter((p) => p.educationId === sourceId && p.status !== 'ersatt')
    .sort((a, b) => b.version - a.version)[0];
  const history = () => [
    {
      id: uid(),
      time: clock(),
      role,
      action: 'Kopierad till ny kull',
      comment: `Utgår från ${source.name}, ${source.cohort}. Nytt beslut behövs.`,
    },
  ];
  const offering = {
    ...source,
    id: uid(),
    cohort,
    status: 'planerad' as const,
    permits: [],
    grades: source.grades ? [...source.grades] : undefined,
    pointPlans: pp
      ? [
          {
            ...pp,
            id: uid(),
            version: 1,
            status: 'utkast' as const,
            decidedOn: undefined,
            specialization: [...pp.specialization],
            history: history(),
          },
        ]
      : [],
  };
  const copied: Timplan | undefined = sourcePlan
    ? {
        ...sourcePlan,
        id: uid(),
        educationId: offering.id,
        version: 1,
        status: 'utkast',
        decidedOn: undefined,
        basis: pp ? 'Poängplan v1' : sourcePlan.basis,
        cells: structuredClone(sourcePlan.cells),
        history: history().map((h) => ({ ...h, role: 'huvudman' as const })),
      }
    : undefined;
  return {
    offering,
    org: {
      ...org,
      offerings: [...org.offerings, offering],
      log: [...history(), ...org.log],
    },
    plans: copied ? [...plans, copied] : plans,
  };
}

export function normalizeClassBinding(
  binding: ClassTimplan,
  plan: Timplan,
  columns: { id: string }[],
): ClassTimplan {
  const className = binding.className.trim().toLocaleUpperCase('sv');
  if (!className || className.length > 60)
    throw new Error('Ange ett klassnamn med högst 60 tecken.');
  if (
    !Number.isInteger(binding.startYear) ||
    binding.startYear < 2000 ||
    binding.startYear > 2100
  )
    throw new Error('Ange ett giltigt läsår.');
  if (plan.id !== binding.timplanId || plan.status !== 'fastställd')
    throw new Error('Välj en fastställd timplan.');
  if (!columns.some((c) => c.id === binding.columnId))
    throw new Error('Välj en årskurs som finns i timplanen.');
  return { ...binding, className };
}

/** Explicit class bindings take precedence over guesses from a class name. */
export function classesWithBindings(
  classes: ClassRef[],
  bindings: ClassTimplan[],
  plans: Timplan[],
  educations: EducationRef[],
  year: number,
): ClassRef[] {
  const result = new Map(
    classes.map((c) => [c.name.toLocaleUpperCase('sv'), c]),
  );
  for (const b of bindings.filter((b) => b.startYear === year)) {
    const plan = plans.find((p) => p.id === b.timplanId);
    const education = educations.find((e) => e.id === plan?.educationId);
    if (!education) continue;
    const existing = result.get(b.className);
    result.set(b.className, {
      ...existing,
      name: b.className,
      kind: education.kind,
      educationId: education.id,
      columnId: b.columnId,
      pupils: existing?.pupils ?? 0,
    });
  }
  return [...result.values()];
}
