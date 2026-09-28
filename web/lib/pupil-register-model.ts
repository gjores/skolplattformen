// Rena registerkontrakt. SQL är auktoritet för mandat, projektion och ändring.
import { csvRow } from './audit-export.ts';

export const PUPIL_PAGE_SIZE = 50;
export const HISTORY_PAGE_SIZE = 20;
export const PUPIL_SORT = ['displayName', 'id'] as const;
export type PupilStatus = 'aktuell' | 'framtida' | 'avslutad';
export type Period = { startsOn: string; endsOn: string | null };
export type Selection = {
  schoolYear: number;
  unitId: string;
  classId: string | null;
  educationId: string | null;
  grade: number | null;
  status: PupilStatus | null;
  page: number;
};
export type ListRequest = {
  selection: Selection;
  search: string;
  caseId: string | null;
};
export type CardRequest = {
  pupilId: string;
  schoolYear: number;
  caseId: string | null;
};
export type HistoryRequest = CardRequest & { page: number };
export type Capabilities = {
  canEdit: boolean;
  canExport: boolean;
  canRevealPersonalNumber: boolean;
  canReadHistory: boolean;
  canReadProtected: boolean;
};
export type NamedOption = { id: string; name: string };
export type RegisterScope = {
  schools: NamedOption[];
  groups: (NamedOption & { unitId: string })[];
  cases: (NamedOption & { unitId: string })[];
};
export type RegisterOptions = {
  schools: NamedOption[];
  classes: (NamedOption & { unitId: string; educationId: string | null })[];
  educations: (NamedOption & { unitId: string; startYear: number | null })[];
  grades: number[];
  statuses: PupilStatus[];
};
type PupilRowBase = {
  id: string;
  displayName: string;
  unitId: string;
  unitName: string;
  classId: string | null;
  className: string | null;
  educationId: string;
  educationName: string;
  grade: number | null;
  status: PupilStatus;
  capabilities: Omit<Capabilities, 'canReadProtected'>;
};
export type PupilListItem = PupilRowBase &
  (
    | { birthDate?: never; municipalityCode?: never }
    | {
        birthDate: string;
        municipalityCode: string | null;
      }
  );
export type PupilList = {
  pupils: PupilListItem[];
  scope: RegisterScope;
  options: RegisterOptions;
  capabilities: Capabilities;
  count: number;
  page: number;
  pageSize: typeof PUPIL_PAGE_SIZE;
};
export type OriginField =
  | 'displayName'
  | 'personalNumber'
  | 'protectedIdentity'
  | 'municipality'
  | 'placement'
  | 'education'
  | 'class';
export type FieldOrigin = {
  source: 'manual' | 'ss12000' | 'spar' | 'simulated';
  actorId: string | null;
  changedAt: string;
  localCorrection: boolean;
};
export type Placement = Period & {
  id: string;
  unitId: string;
  educationId: string;
};
export type ClassMembership = Period & {
  id: string;
  placementId: string;
  classId: string;
};
export type MunicipalityPeriod = Period & {
  id: string;
  municipalityCode: string;
  origin: FieldOrigin;
};
export type SourceConflict =
  | {
      id: string;
      field: Exclude<OriginField, 'personalNumber'>;
      local: string | boolean | null;
      incoming: string | boolean | null;
      origin: FieldOrigin;
    }
  | { id: string; field: 'personalNumber'; origin: FieldOrigin };
export type PupilCard = PupilListItem & {
  version: number;
  placements: Placement[];
  classes: ClassMembership[];
} & (
    | { municipalities?: never; origins?: never; sourceConflicts?: never }
    | {
        protectedIdentity: boolean;
        municipalities: MunicipalityPeriod[];
        origins: Partial<Record<OriginField, FieldOrigin>>;
        sourceConflicts: SourceConflict[];
      }
  );
export type PersonalNumberResult = { pupilId: string; personalNumber: string };
export type HistoryEntry = {
  id: string;
  changedBy: string;
  changedAt: string;
  origin: FieldOrigin;
} & (
  | {
      field: Exclude<OriginField, 'personalNumber'>;
      before: string | boolean | null;
      after: string | boolean | null;
    }
  | { field: 'personalNumber'; before: null; after: null }
);
export type PupilHistory = {
  entries: HistoryEntry[];
  count: number;
  page: number;
  pageSize: typeof HISTORY_PAGE_SIZE;
};
export type BasicsChange = {
  displayName?: string;
  personalNumber?: string;
  protectedIdentity?: boolean;
};
export type ChangeRequest = CardRequest & { expectedVersion: number } & (
    | { kind: 'basics'; payload: BasicsChange }
    | { kind: 'municipality'; payload: Period & { municipalityCode: string } }
    | {
        kind: 'transfer';
        payload: Period & {
          placementId: string;
          unitId: string;
          educationId: string;
        };
      }
    | {
        kind: 'education';
        payload: { placementId: string; educationId: string; startsOn: string };
      }
    | {
        kind: 'end-placement';
        payload: { placementId: string; endsOn: string };
      }
    | {
        kind: 'class';
        payload: Period & { placementId: string; classId: string };
      }
    | {
        kind: 'resolve-source';
        payload: { conflictId: string; choice: 'local' | 'source' };
      }
  );
export type CreatePupilRequest = {
  schoolYear: number;
  displayName: string;
  personalNumber: string;
  protectedIdentity: boolean;
  placement: Period & { unitId: string; educationId: string };
  classId: string;
  municipality: Period & { municipalityCode: string };
};
export type ConflictField =
  | 'displayName'
  | 'protectedIdentity'
  | 'municipalityCode'
  | 'unitId'
  | 'educationId'
  | 'classId'
  | 'startsOn'
  | 'endsOn';
export type FieldConflict = {
  field: ConflictField;
  submitted: string | boolean | null;
  current: string | boolean | null;
};
export type ConflictDetails = {
  currentVersion: number;
  changedBy: string;
  changedAt: string;
} & (
  | { kind: 'fields'; fields: FieldConflict[] }
  | { kind: 'identity'; field: 'personalNumber' }
  | {
      kind: 'period';
      period: 'placement' | 'class' | 'municipality';
      reason: 'overlap' | 'outside-placement';
    }
);
export const EXPORT_FIELDS = [
  'id',
  'displayName',
  'birthDate',
  'unitName',
  'className',
  'educationName',
  'grade',
  'status',
  'municipalityCode',
] as const;
export type ExportField = (typeof EXPORT_FIELDS)[number];
export type ExportSelection = {
  schoolYear: number;
  caseId: string | null;
  fields: ExportField[];
  protectedIds: string[];
  includePersonalNumber: boolean;
} & (
  | { mode: 'ids'; ids: string[] }
  | { mode: 'filter'; selection: Selection; search: string }
);
export type ExportPreview = {
  count: number;
  fields: ExportField[];
  includePersonalNumber: boolean;
};

export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
function requireDate(value: string): void {
  if (!isValidDate(value)) throw new Error('Ogiltigt datum');
}
function validYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1 && year <= 9998;
}
export function schoolYearRange(year: number): {
  startsOn: string;
  endsBefore: string;
} {
  if (!validYear(year)) throw new Error('Ogiltigt läsår');
  return {
    startsOn: `${String(year).padStart(4, '0')}-07-01`,
    endsBefore: `${String(year + 1).padStart(4, '0')}-07-01`,
  };
}
export function currentSchoolYear(today: string): number {
  requireDate(today);
  const year = Number(today.slice(0, 4)) - (today.slice(5, 7) < '07' ? 1 : 0);
  if (!validYear(year)) throw new Error('Ogiltigt läsår');
  return year;
}
export function schoolYearLabel(year: number): string {
  schoolYearRange(year);
  return `${String(year % 100).padStart(2, '0')}/${String((year + 1) % 100).padStart(2, '0')}`;
}
export function referenceDate(year: number, today: string): string {
  requireDate(today);
  const { startsOn, endsBefore } = schoolYearRange(year);
  return today >= startsOn && today < endsBefore ? today : startsOn;
}
export function gradeForSchoolYear(
  year: number,
  startYear: number | null,
): number | null {
  schoolYearRange(year);
  if (startYear === null) return null;
  if (!validYear(startYear)) throw new Error('Ogiltigt startår');
  return year - startYear + 1;
}
export function isValidPeriod(period: Period): boolean {
  return (
    isValidDate(period.startsOn) &&
    (period.endsOn === null ||
      (isValidDate(period.endsOn) && period.endsOn >= period.startsOn))
  );
}
export function periodOverlapsSchoolYear(
  period: Period,
  year: number,
): boolean {
  if (!isValidPeriod(period)) throw new Error('Ogiltig period');
  const range = schoolYearRange(year);
  return (
    period.startsOn < range.endsBefore &&
    (period.endsOn === null || period.endsOn >= range.startsOn)
  );
}
export function placementStatus(period: Period, at: string): PupilStatus {
  requireDate(at);
  if (!isValidPeriod(period)) throw new Error('Ogiltig period');
  if (period.startsOn > at) return 'framtida';
  return period.endsOn !== null && period.endsOn < at ? 'avslutad' : 'aktuell';
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STATUSES: readonly string[] = ['aktuell', 'framtida', 'avslutad'];
const QUERY_KEYS = [
  'vy',
  'lasar',
  'skola',
  'klass',
  'utbildning',
  'ak',
  'status',
  'sida',
];
function validSelection(s: Selection): boolean {
  return (
    validYear(s.schoolYear) &&
    typeof s.unitId === 'string' &&
    UUID.test(s.unitId) &&
    (s.classId === null ||
      (typeof s.classId === 'string' && UUID.test(s.classId))) &&
    (s.educationId === null ||
      (typeof s.educationId === 'string' && UUID.test(s.educationId))) &&
    (s.grade === null ||
      (Number.isSafeInteger(s.grade) && s.grade >= -9996 && s.grade <= 9998)) &&
    (s.status === null || STATUSES.includes(s.status)) &&
    Number.isSafeInteger(s.page) &&
    s.page > 0
  );
}
/** Kopierar bara de ofarliga urvalsfälten, även om anroparen bär andra nycklar. */
export function selectionToQuery(selection: Selection): string {
  if (!validSelection(selection)) throw new Error('Ogiltigt urval');
  const q = new URLSearchParams({
    vy: 'elever',
    lasar: String(selection.schoolYear),
    skola: selection.unitId,
    sida: String(selection.page),
  });
  if (selection.classId !== null) q.set('klass', selection.classId);
  if (selection.educationId !== null)
    q.set('utbildning', selection.educationId);
  if (selection.grade !== null) q.set('ak', String(selection.grade));
  if (selection.status !== null) q.set('status', selection.status);
  return `?${q}`;
}
export function selectionFromQuery(
  query: string,
  defaults: Selection,
): Selection | null {
  if (!validSelection(defaults)) return null;
  const q = new URLSearchParams(query);
  const keys = [...q.keys()];
  if (
    keys.some((key) => !QUERY_KEYS.includes(key)) ||
    new Set(keys).size !== keys.length
  )
    return null;
  if (q.has('vy') && q.get('vy') !== 'elever') return null;
  for (const key of ['lasar', 'ak', 'sida']) {
    if (q.has(key) && !/^-?(0|[1-9]\d*)$/u.test(q.get(key)!)) return null;
  }
  const value: Selection = {
    schoolYear: q.has('lasar') ? Number(q.get('lasar')) : defaults.schoolYear,
    unitId: q.get('skola') ?? defaults.unitId,
    classId: q.get('klass') ?? (keys.length === 0 ? defaults.classId : null),
    educationId:
      q.get('utbildning') ?? (keys.length === 0 ? defaults.educationId : null),
    grade: q.has('ak')
      ? Number(q.get('ak'))
      : keys.length === 0
        ? defaults.grade
        : null,
    status: (q.get('status') ??
      (keys.length === 0 ? defaults.status : null)) as PupilStatus | null,
    page: q.has('sida') ? Number(q.get('sida')) : defaults.page,
  };
  return validSelection(value) ? value : null;
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function readCapabilities(value: unknown): Capabilities {
  const row = object(value);
  const allowed = (key: string) =>
    row !== null && Object.hasOwn(row, key) && row[key] === true;
  return {
    canEdit: allowed('canEdit'),
    canExport: allowed('canExport'),
    canRevealPersonalNumber: allowed('canRevealPersonalNumber'),
    canReadHistory: allowed('canReadHistory'),
    canReadProtected: allowed('canReadProtected'),
  };
}
export function luhnOk(ten: string): boolean {
  if (!/^\d{10}$/u.test(ten)) return false;
  return (
    ten.split('').reduce((sum, digit, index) => {
      const value = Number(digit) * (index % 2 === 0 ? 2 : 1);
      return sum + (value > 9 ? value - 9 : value);
    }, 0) %
      10 ===
    0
  );
}
export function validateSyntheticPersonalNumber(
  input: string,
  allow: ReadonlySet<string>,
):
  | { ok: true; value: string; birthDate: string }
  | { ok: false; reason: 'format' | 'not_synthetic' } {
  const match = /^TEST-(\d{4})(\d{2})(\d{2})-(\d{4})$/u.exec(input);
  if (!match) return { ok: false, reason: 'format' };
  const birthDate = `${match[1]}-${match[2]}-${match[3]}`;
  if (
    !isValidDate(birthDate) ||
    !luhnOk(`${match[1].slice(2)}${match[2]}${match[3]}${match[4]}`)
  )
    return { ok: false, reason: 'format' };
  return allow.has(input)
    ? { ok: true, value: input, birthDate }
    : { ok: false, reason: 'not_synthetic' };
}
function exactKeys(row: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(row).length === keys.length &&
    keys.every((key) => Object.hasOwn(row, key))
  );
}
function conflictValue(field: string, value: unknown): boolean {
  switch (field) {
    case 'displayName':
      return (
        typeof value === 'string' && value.length > 0 && value.length <= 200
      );
    case 'protectedIdentity':
      return typeof value === 'boolean';
    case 'municipalityCode':
      return typeof value === 'string' && /^\d{4}$/u.test(value);
    case 'classId':
      if (value === null) return true;
      break;
    case 'unitId':
    case 'educationId':
      break;
    case 'endsOn':
      return value === null || isValidDate(value);
    case 'startsOn':
      return isValidDate(value);
    default:
      return false;
  }
  return typeof value === 'string' && UUID.test(value);
}
/** Tar endast emot redan behörighetsprövade konflikter. Kopierar inte SQL-detaljer. */
export function parseConflictDetails(value: unknown): ConflictDetails | null {
  const row = object(value);
  if (
    !row ||
    !Number.isSafeInteger(row.currentVersion) ||
    Number(row.currentVersion) < 1 ||
    typeof row.changedBy !== 'string' ||
    !row.changedBy ||
    row.changedBy.length > 200 ||
    typeof row.changedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      row.changedAt,
    ) ||
    !isValidDate(row.changedAt.slice(0, 10)) ||
    !Number.isFinite(Date.parse(row.changedAt))
  )
    return null;
  const base = {
    currentVersion: Number(row.currentVersion),
    changedBy: row.changedBy,
    changedAt: row.changedAt,
  };
  const keys = ['kind', 'currentVersion', 'changedBy', 'changedAt'];
  if (
    row.kind === 'identity' &&
    exactKeys(row, [...keys, 'field']) &&
    row.field === 'personalNumber'
  )
    return { ...base, kind: 'identity', field: 'personalNumber' };
  if (
    row.kind === 'period' &&
    exactKeys(row, [...keys, 'period', 'reason']) &&
    (row.period === 'placement' ||
      row.period === 'class' ||
      row.period === 'municipality') &&
    (row.reason === 'overlap' || row.reason === 'outside-placement')
  )
    return { ...base, kind: 'period', period: row.period, reason: row.reason };
  if (
    row.kind !== 'fields' ||
    !exactKeys(row, [...keys, 'fields']) ||
    !Array.isArray(row.fields) ||
    row.fields.length === 0
  )
    return null;
  const fields: FieldConflict[] = [];
  for (const item of row.fields) {
    const entry = object(item);
    if (
      !entry ||
      !exactKeys(entry, ['field', 'submitted', 'current']) ||
      typeof entry.field !== 'string' ||
      !conflictValue(entry.field, entry.submitted) ||
      !conflictValue(entry.field, entry.current) ||
      fields.some((field) => field.field === entry.field)
    )
      return null;
    fields.push({
      field: entry.field as ConflictField,
      submitted: entry.submitted as string | boolean | null,
      current: entry.current as string | boolean | null,
    });
  }
  return { ...base, kind: 'fields', fields };
}
const CSV_LABELS: Record<ExportField | 'personalNumber', string> = {
  id: 'elev_id',
  displayName: 'namn',
  birthDate: 'födelsedatum',
  unitName: 'skola',
  className: 'klass',
  educationName: 'utbildning',
  grade: 'årskurs',
  status: 'status',
  municipalityCode: 'kommunkod',
  personalNumber: 'personnummer',
};
/** Anropas endast med SQL-prövade exportfält och projicerade rader. */
export function registerCsv(
  fields: readonly (ExportField | 'personalNumber')[],
  rows: readonly Partial<
    Record<ExportField | 'personalNumber', string | number | null>
  >[],
): string {
  if (
    fields.length === 0 ||
    new Set(fields).size !== fields.length ||
    fields.some((field) => !Object.hasOwn(CSV_LABELS, field))
  )
    throw new Error('Ogiltiga exportfält');
  return `\uFEFF${[csvRow(fields.map((field) => CSV_LABELS[field])), ...rows.map((row) => csvRow(fields.map((field) => row[field])))].join('\r\n')}\r\n`;
}
