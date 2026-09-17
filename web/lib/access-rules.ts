export type AssignmentLike = {
  validFrom: string;
  validTo: string | null;
  endedAt: string | null;
};

export type AssignmentState = 'giltigt' | 'kommande' | 'avslutat';

export type AccessFunction =
  | 'kundadmin'
  | 'granskare'
  | 'huvudman'
  | 'rektor'
  | 'administrator'
  | 'larare';

export const FUNCTION_LABEL: Record<AccessFunction, string> = {
  kundadmin: 'Kundadministration',
  granskare: 'Granskning',
  huvudman: 'Huvudman',
  rektor: 'Rektor',
  administrator: 'Administratör',
  larare: 'Lärare',
};

export type AssignmentView = AssignmentLike & {
  id: string;
  membershipId: string;
  customerId: string;
  customerName: string;
  organizerName: string | null;
  unitName: string | null;
  function: AccessFunction;
  membershipStatus: 'active' | 'blocked';
};

export type GroupedAssignment = AssignmentView & { blocked?: true };

export function assignmentState(a: AssignmentLike, today: string): AssignmentState {
  if (a.endedAt !== null) return 'avslutat';
  if (a.validFrom > today) return 'kommande';
  if (a.validTo !== null && a.validTo < today) return 'avslutat';
  return 'giltigt';
}

const collator = new Intl.Collator('sv-SE');

function contextOrder(a: AssignmentView, b: AssignmentView): number {
  return (
    collator.compare(a.customerName, b.customerName) ||
    collator.compare(a.organizerName ?? '', b.organizerName ?? '') ||
    collator.compare(a.function, b.function) ||
    collator.compare(a.id, b.id)
  );
}

function endingPoint(a: AssignmentView): string {
  return a.endedAt ?? a.validTo ?? '';
}

export function selectableAssignments(
  list: AssignmentView[],
  today: string,
): { valid: GroupedAssignment[]; upcoming: GroupedAssignment[]; ended: GroupedAssignment[] } {
  const valid: GroupedAssignment[] = [];
  const upcoming: GroupedAssignment[] = [];
  const ended: GroupedAssignment[] = [];

  for (const item of list) {
    if (item.membershipStatus === 'blocked') {
      ended.push({ ...item, blocked: true });
      continue;
    }
    const state = assignmentState(item, today);
    if (state === 'giltigt') valid.push(item);
    else if (state === 'kommande') upcoming.push(item);
    else ended.push(item);
  }

  valid.sort(contextOrder);
  upcoming.sort((a, b) => collator.compare(a.validFrom, b.validFrom) || contextOrder(a, b));
  ended.sort((a, b) => collator.compare(endingPoint(b), endingPoint(a)) || contextOrder(a, b));
  return { valid, upcoming, ended };
}

export function epochChanged(current: number | null, next: number | null): boolean {
  return current !== null && next !== null && current !== next;
}

export function contextLabel(
  value: Pick<AssignmentView, 'customerName' | 'organizerName' | 'unitName' | 'function'>,
): string {
  return [
    value.customerName,
    value.organizerName,
    value.unitName,
    FUNCTION_LABEL[value.function],
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

export function todayInStockholm(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
