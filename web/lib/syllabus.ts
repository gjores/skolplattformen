// Läslager över ögonblicksbilden från Skolverkets Syllabus-API.
// Katalogen är referensdata om utbildningens innehåll. Den beskriver inte
// personer, grupper eller scheman; de kommer från huvudmannens egna system.

import { syllabusSnapshot } from './syllabus-snapshot.ts';

export type SyllabusItem = { code: string; name: string; points: number };
export type SyllabusSubject = {
  code: string;
  name: string;
  typeOfSyllabus: string;
  schoolTypes: string[];
  version: number;
  startDate?: string;
  endDate?: string;
  canceledDate?: string;
  skolfs?: string;
  items: SyllabusItem[];
};
export type SyllabusLevel = { code: string; name: string; points: number };
export type SyllabusBlockSubject = {
  code: string;
  name: string;
  points: number;
  optional: boolean;
  levels: SyllabusLevel[];
};
export type SyllabusOrientation = {
  code: string;
  name: string;
  points: number;
  subjects: SyllabusBlockSubject[];
};
/** Ett nationellt programs poängplan som Skolverket publicerar den. */
export type SyllabusProgram = {
  code: string;
  name: string;
  category: string;
  version: number;
  startDate?: string;
  endDate?: string;
  canceledDate?: string;
  skolfs?: string;
  foundation: SyllabusBlockSubject[];
  programmeSpecific: SyllabusBlockSubject[];
  orientations: SyllabusOrientation[];
  specialization: SyllabusBlockSubject[];
};
export type SyllabusSnapshot = {
  source: string;
  apiVersion: string;
  fetched: string;
  schoolTypes: string[];
  subjects: SyllabusSubject[];
  programs: SyllabusProgram[];
};

/** Styrdokumentsordning enligt informationsmodellens objekt Styrdokumentsversion. */
export type Regime = 'Gy25' | 'Gy11' | 'Grundskola';

/**
 * Hänvisning från en lokal post till en nationell styrdokumentsversion.
 * `version` är den version posten skrevs mot, inte den som råkar ligga i
 * katalogen just nu. Skillnaden är själva poängen med fältet.
 */
export type SyllabusRef = {
  subject: string;
  item?: string;
  version: number;
};

const byCode = new Map(syllabusSnapshot.subjects.map((s) => [s.code, s]));

export const snapshotInfo = {
  source: syllabusSnapshot.source,
  apiVersion: syllabusSnapshot.apiVersion,
  fetched: syllabusSnapshot.fetched,
  subjects: syllabusSnapshot.subjects.length,
  programs: syllabusSnapshot.programs.map((p) => p.code),
};

export const findSubject = (code: string): SyllabusSubject | undefined =>
  byCode.get(code);

export const findProgram = (code: string): SyllabusProgram | undefined =>
  syllabusSnapshot.programs.find((p) => p.code === code);

/** Nationella program i Gy25 som huvudmannen kan välja utbildningar ur. */
export const listPrograms = (): SyllabusProgram[] =>
  [...syllabusSnapshot.programs].sort((a, b) => a.name.localeCompare(b.name, 'sv'));

export function resolve(ref: SyllabusRef) {
  const subject = byCode.get(ref.subject);
  if (!subject) return undefined;
  const item = ref.item
    ? subject.items.find((i) => i.code === ref.item)
    : undefined;
  if (ref.item && !item) return { subject, item: undefined };
  return { subject, item };
}

const regimes: Record<string, Regime> = {
  GRADE_SUBJECT_SYLLABUS: 'Gy25',
  SUBJECT_SYLLABUS: 'Gy11',
  COURSE_SYLLABUS: 'Grundskola',
};

/** Gy25, Gy11 och Grundskola är typeOfSyllabus, inte en lokal etikett. */
export const regimeOfSubject = (
  subject: SyllabusSubject,
): Regime | undefined => regimes[subject.typeOfSyllabus];

export function regimeOf(ref: SyllabusRef): Regime | undefined {
  const subject = byCode.get(ref.subject);
  return subject && regimeOfSubject(subject);
}

/**
 * Kortform för gränssnittet. Gy11-kurser bär redan ämnesnamnet ("Matematik 2b")
 * medan Gy25-nivåer inte gör det ("Nivå 1b") och behöver ämnet framför sig.
 */
export function label(ref: SyllabusRef): string {
  const found = resolve(ref);
  if (!found) return ref.item ?? ref.subject;
  const { subject, item } = found;
  if (!item) return subject.name;
  return item.name.startsWith(subject.name)
    ? item.name
    : `${subject.name}, ${item.name}`;
}

export const code = (ref: SyllabusRef): string => ref.item ?? ref.subject;

export function points(ref: SyllabusRef): number | undefined {
  return resolve(ref)?.item?.points;
}

export type SyllabusContext = {
  /** Dagens datum som ISO-sträng. Skickas in så att kontrollen går att testa. */
  today: string;
  /** Elevens utbildningsstart. Avgör vilken styrdokumentsordning som gäller. */
  startedOn?: string;
  /** Poäng i den lokala posten, för jämförelse med styrdokumentet. */
  localPoints?: number;
};

/**
 * Kontrollerar en hänvisning mot katalogen. Returnerar lästa avvikelser, inte
 * en giltighetsflagga: skälet ska kunna visas för den som ska åtgärda det.
 */
export function syllabusIssues(
  ref: SyllabusRef,
  context: SyllabusContext,
): string[] {
  const issues: string[] = [];
  const found = resolve(ref);
  if (!found) {
    issues.push(
      `Koden ${ref.subject} finns inte i katalogen hämtad ${syllabusSnapshot.fetched}.`,
    );
    return issues;
  }
  const { subject, item } = found;
  if (ref.item && !item)
    issues.push(`${ref.item} finns inte som nivå eller kurs i ${subject.code}.`);
  if (subject.version !== ref.version)
    issues.push(
      `${subject.code} har version ${subject.version} i katalogen. Posten hänvisar till version ${ref.version}.`,
    );
  if (subject.endDate && context.today > subject.endDate)
    issues.push(`${subject.name} upphörde att gälla ${subject.endDate}.`);
  if (
    subject.canceledDate &&
    context.startedOn &&
    context.startedOn >= subject.canceledDate
  )
    issues.push(
      `${subject.name} var upphävt ${subject.canceledDate} när utbildningen påbörjades ${context.startedOn}.`,
    );
  if (
    item &&
    typeof context.localPoints === 'number' &&
    context.localPoints !== item.points
  )
    issues.push(
      `${item.name} är ${item.points} poäng i styrdokumentet, posten anger ${context.localPoints}.`,
    );
  return issues;
}
