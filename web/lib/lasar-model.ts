// Läsår och skoldagar: rektorn planerar vilka dagar som är skoldagar,
// lovdagar och studiedagar; huvudmannen fastställer terminernas början och
// slut.
//
// Skolförordningen (2011:185) 3 kap. 2 §: "Läsåret ska ha minst 178 skoldagar
// och minst 12 lovdagar. Utöver skol- och lovdagarna får det inom läsåret
// läggas ut högst fem studiedagar för personalen." 3 §: "Läsåret ska börja i
// augusti och sluta i juni. Dagarna för höst- och vårterminens början och slut
// beslutas av huvudmannen." 4 §: skolarbetet förläggs måndag–fredag, så jämnt
// fördelat som möjligt, med sammanhållna skoldagar.
// Gymnasieförordningen (2010:2039) 3 kap. 1–3 §§ säger detsamma och
// dessutom att läsåret ska omfatta 40 veckor och att skoldagarna ska vara så
// jämnt fördelade över läsåret som möjligt. Allmänna helgdagar följer lagen
// (1989:253) om allmänna helgdagar. Texterna lästa på lagen.nu 5 september
// 2026. Skoldag, lovdag och studiedag definieras inte i författningarna;
// definitionerna nedan är produktens och följer av paragrafernas uppbyggnad.

import { today, uid, clock } from './common.ts';

export type Role = 'rektor' | 'huvudman';
export const roleLabel: Record<Role, string> = { rektor: 'Rektor', huvudman: 'Huvudman' };

export type ISODate = string;
/** Det rektorn kan sätta på en vardag inom terminerna. */
export type Planned = 'skoldag' | 'lovdag' | 'studiedag';
/** Det en dag i kalendern visar. */
export type DayStatus = Planned | 'helgdag' | 'helg' | 'utanför';

export const minSchoolDays = 178;
export const minHolidays = 12;
export const maxStudyDays = 5;
export const gymnasiumWeeks = 40;
/** Skoldagar i följd utan lov innan fördelningen över läsåret ifrågasätts. Tolv veckor. */
export const longRun = 60;

export const definitions: { id: DayStatus | 'läsår' | 'termin' | 'undervisningstimme'; term: string; text: string; source: string }[] = [
  {
    id: 'skoldag',
    term: 'Skoldag',
    text: 'Vardag inom en termin då eleverna har skolarbete. Läsåret ska ha minst 178 skoldagar. Skolarbetet förläggs måndag–fredag, så jämnt som möjligt över dagarna och läsåret, med sammanhållna skoldagar.',
    source: 'Skolförordningen 3 kap. 2 och 4 §§ · Gymnasieförordningen 3 kap. 1 och 3 §§',
  },
  {
    id: 'lovdag',
    term: 'Lovdag',
    text: 'Vardag inom läsåret då eleverna är lediga och som inte är en allmän helgdag eller en studiedag. Läsåret ska ha minst 12 lovdagar. Vardagarna mellan höst- och vårterminen räknas här som lovdagar (jullov).',
    source: 'Skolförordningen 3 kap. 2 § · Gymnasieförordningen 3 kap. 1 §',
  },
  {
    id: 'studiedag',
    term: 'Studiedag',
    text: 'Dag för personalen, till exempel planering eller fortbildning, då eleverna är lediga. Högst fem per läsår, utöver skol- och lovdagarna. En studiedag räknas varken som skoldag eller lovdag.',
    source: 'Skolförordningen 3 kap. 2 § · Gymnasieförordningen 3 kap. 1 §',
  },
  {
    id: 'helgdag',
    term: 'Allmän helgdag',
    text: 'Nyårsdagen, trettondedag jul, långfredagen, annandag påsk, första maj, Kristi himmelsfärdsdag, nationaldagen, juldagen och annandag jul kan infalla på en vardag; midsommardagen och alla helgons dag är alltid lördagar. Julafton, midsommarafton och nyårsafton är inte allmänna helgdagar. Helgdagar räknas här varken som skoldagar eller lovdagar.',
    source: 'Lagen (1989:253) om allmänna helgdagar 1–2 §§',
  },
  {
    id: 'läsår',
    term: 'Läsår',
    text: 'Börjar i augusti och slutar i juni (gymnasieskolan: senast i juni). Består av en hösttermin och en vårtermin. I gymnasieskolan ska läsåret omfatta 40 veckor, räknat som terminernas veckor.',
    source: 'Skolförordningen 3 kap. 3 § · Gymnasieförordningen 3 kap. 1–2 §§',
  },
  {
    id: 'termin',
    term: 'Termin',
    text: 'Dagarna för höst- och vårterminens början och slut beslutas av huvudmannen. Rektorn föreslår; huvudmannen fastställer.',
    source: 'Skolförordningen 3 kap. 3 § · Gymnasieförordningen 3 kap. 2 § · Skollagen 2 kap. 10 §',
  },
  {
    id: 'undervisningstimme',
    term: 'Undervisningstimme',
    text: 'Timplanens och den garanterade undervisningstidens timmar är timmar om 60 minuter. Raster och lov är inte undervisning. Med skoldagarna som grund räknas här hur många minuter i veckan timplanens timmar kräver.',
    source: 'Skollagen 16 kap. 18 § · Skolförordningen 9 kap. 3 §',
  },
];

// ---------------------------------------------------------------- datum

const MS = 86_400_000;
export const parseDate = (s: ISODate) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: ISODate, n: number) => iso(new Date(parseDate(s).getTime() + n * MS));
/** 0 = måndag … 6 = söndag. */
export const weekday = (s: ISODate) => (parseDate(s).getUTCDay() + 6) % 7;
export const isWeekend = (s: ISODate) => weekday(s) >= 5;
export const daysBetween = (a: ISODate, b: ISODate) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / MS);
export const monday = (s: ISODate) => addDays(s, -weekday(s));
export function isoWeek(s: ISODate): { week: number; year: number } {
  const d = parseDate(s);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * MS);
  const year = thursday.getUTCFullYear();
  const first = new Date(Date.UTC(year, 0, 4));
  const firstThursday = new Date(first.getTime() + (3 - ((first.getUTCDay() + 6) % 7)) * MS);
  return { week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS)), year };
}
/** Måndagen i ISO-vecka `week` år `year`. */
export function mondayOfWeek(year: number, week: number): ISODate {
  const jan4 = iso(new Date(Date.UTC(year, 0, 4)));
  return addDays(monday(jan4), (week - 1) * 7);
}
export const monthNames = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
export const weekdayNames = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
export const weekdayShort = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];
export function formatDate(s: ISODate, withYear = false) {
  const d = parseDate(s);
  return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}
export const formatLong = (s: ISODate) => `${weekdayNames[weekday(s)]} ${formatDate(s, true)}`;

// ---------------------------------------------------------------- helgdagar

/** Påskdagen enligt den gregorianska beräkningen (Meeus/Jones/Butcher). */
export function easterSunday(year: number): ISODate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(Date.UTC(year, month - 1, day)));
}
function saturdayBetween(year: number, month: number, fromDay: number): ISODate {
  let d = iso(new Date(Date.UTC(year, month - 1, fromDay)));
  while (weekday(d) !== 5) d = addDays(d, 1);
  return d;
}
export type Holiday = { date: ISODate; name: string };
/** Allmänna helgdagar ett kalenderår enligt lagen (1989:253), utom söndagar. */
export function publicHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const fixed = (m: number, d: number) => iso(new Date(Date.UTC(year, m - 1, d)));
  return [
    { date: fixed(1, 1), name: 'Nyårsdagen' },
    { date: fixed(1, 6), name: 'Trettondedag jul' },
    { date: addDays(easter, -2), name: 'Långfredagen' },
    { date: easter, name: 'Påskdagen' },
    { date: addDays(easter, 1), name: 'Annandag påsk' },
    { date: fixed(5, 1), name: 'Första maj' },
    { date: addDays(easter, 39), name: 'Kristi himmelsfärdsdag' },
    { date: addDays(easter, 49), name: 'Pingstdagen' },
    { date: fixed(6, 6), name: 'Nationaldagen' },
    { date: saturdayBetween(year, 6, 20), name: 'Midsommardagen' },
    { date: saturdayBetween(year, 10, 31), name: 'Alla helgons dag' },
    { date: fixed(12, 25), name: 'Juldagen' },
    { date: fixed(12, 26), name: 'Annandag jul' },
  ].sort((a, b) => a.date.localeCompare(b.date));
}
export function holidayName(date: ISODate): string | undefined {
  const year = Number(date.slice(0, 4));
  return publicHolidays(year).find((h) => h.date === date)?.name;
}

// ---------------------------------------------------------------- modell

export type Term = { start: ISODate; end: ISODate };
export type Exception = { kind: 'lovdag' | 'studiedag'; note?: string };
export type SchoolYearStatus = 'utkast' | 'förslag' | 'återsänd' | 'fastställd';
export const statusLabel: Record<SchoolYearStatus, string> = {
  utkast: 'Utkast',
  förslag: 'Förslag till huvudman',
  återsänd: 'Återsänd för ändring',
  fastställd: 'Fastställd',
};
export type Entry = { id: string; time: string; role: Role; action: string; comment: string };
export type SchoolYear = {
  id: string;
  unitId: string;
  startYear: number;
  label: string;
  ht: Term;
  vt: Term;
  /** Vardagar inom terminerna som inte är skoldagar. Alla andra vardagar inom terminerna är skoldagar. */
  exceptions: Record<ISODate, Exception>;
  /** Skoldagar då en enskild årskurs eller klass saknar undervisning. */
  groupExceptions: Record<string, Record<ISODate, GroupException>>;
  /** Grupper som läser färre dagar i veckan. Bara årskurs 1 och 2 i grundskolan. */
  shortWeeks: Record<string, ShortWeek>;
  status: SchoolYearStatus;
  history: Entry[];
  decidedOn?: ISODate;
};
export type LasarState = { role: Role; years: SchoolYear[] };

/**
 * Avvikelser per elevgrupp. Läsåret hör till skolenheten och prövas mot
 * Skolförordningen 3 kap. 2 §, men skoldagarna behöver inte vara lika för alla
 * elever: 3 kap. 4 § andra stycket tillåter fyra skoldagar i veckan för en
 * grupp elever i årskurs 1 eller 2, och 4 a–5 §§ tillåter andra lärotider för
 * en enskild elev. Det som garanteras varje elev är undervisningstiden i
 * timmar, inte antalet dagar, så en grupp med färre dagar behöver längre dagar.
 */
export type Cause = 'nationellt prov' | 'apl' | 'friluftsdag' | 'annat';
export const causeLabel: Record<Cause, string> = {
  'nationellt prov': 'Nationellt prov',
  apl: 'Arbetsplatsförlagt lärande',
  friluftsdag: 'Friluftsdag',
  annat: 'Annat',
};
export type GroupException = { cause: Cause; note?: string };
/** Ledig veckodag för en grupp. Årskursen följer med, eftersom bara årskurs 1
 *  och 2 får förkortas och databasen prövar det. */
export type ShortWeek = { weekday: number; reason: string; columnId: string };
export type GroupScope = 'årskurs' | 'klass';
/** En elevgrupp som kan ha egna lärotider. Härleds ur timplan och elevregister. */
export type StudentGroup = {
  id: string;
  name: string;
  scope: GroupScope;
  kind: 'grundskola' | 'gymnasium' | 'introduktionsprogram';
  educationId: string;
  educationName: string;
  /** Timplanens kolumn. Saknas när klassens årskurs inte går att härleda. */
  columnId?: string;
  /** Klassens årskursgrupp. Klassen ärver årskursens avvikelser. */
  parentId?: string;
  pupils?: number;
};

export type DayInfo = {
  date: ISODate;
  status: DayStatus;
  /** Vilken termin dagen ligger i, eller 'jullov' mellan terminerna. */
  part?: 'ht' | 'vt' | 'jullov';
  holiday?: string;
  note?: string;
  /** Om rektorn kan sätta skoldag, lovdag eller studiedag på dagen. */
  editable: boolean;
};

export function dayInfo(sy: SchoolYear, date: ISODate): DayInfo {
  const inHt = date >= sy.ht.start && date <= sy.ht.end;
  const inVt = date >= sy.vt.start && date <= sy.vt.end;
  const between = date > sy.ht.end && date < sy.vt.start;
  const part = inHt ? 'ht' : inVt ? 'vt' : between ? 'jullov' : undefined;
  if (!part) return { date, status: 'utanför', editable: false };
  if (isWeekend(date)) return { date, status: 'helg', part, editable: false };
  const holiday = holidayName(date);
  if (holiday) return { date, status: 'helgdag', part, holiday, editable: false };
  if (part === 'jullov') return { date, status: 'lovdag', part, editable: false };
  const exception = sy.exceptions[date];
  return { date, status: exception?.kind ?? 'skoldag', part, note: exception?.note, editable: true };
}

/** Alla dagar från läsårets första till sista dag. */
export function yearDays(sy: SchoolYear): DayInfo[] {
  const days: DayInfo[] = [];
  for (let d = sy.ht.start; d <= sy.vt.end; d = addDays(d, 1)) days.push(dayInfo(sy, d));
  return days;
}

/** Så mycket av timplanens utbildning som gruppbygget behöver. */
export type EducationRef = {
  id: string;
  name: string;
  kind: 'grundskola' | 'gymnasium' | 'introduktionsprogram';
  programCode?: string;
  columns: { id: string; label: string }[];
};
/** En klass ur elevregistret, med det som krävs för att hitta rätt årskurs. */
export type ClassRef = {
  columnId?: string;
  name: string;
  kind: 'grundskola' | 'gymnasium' | 'introduktionsprogram';
  educationId?: string;
  /** Grundskolans årskurs ur klassnamnet, till exempel 8 i 8A. */
  grade?: number;
  /** Gymnasiets startår ur klassnamnet, till exempel 2026 i SA26A. */
  cohortYear?: number;
  /** Programbokstäverna i klassnamnet, till exempel EK i EK26A. */
  programPrefix?: string;
  pupils: number;
};

/**
 * Elevgrupper som kan ha egna lärotider: timplanens årskurser och klasserna
 * ur elevregistret. Inget eget register; listan härleds så att den inte kan
 * glida isär från timplanen.
 */
export function studentGroups(educations: EducationRef[], classes: ClassRef[], startYear: number): StudentGroup[] {
  const groups: StudentGroup[] = [];
  for (const e of educations)
    for (const c of e.columns)
      groups.push({ id: `${e.id}:${c.id}`, name: c.label, scope: 'årskurs', kind: e.kind, educationId: e.id, educationName: e.name, columnId: c.id });
  for (const k of classes) {
    // Utbildningens id kan komma från en annan källa än klassens, så
    // programkoden i klassnamnet är den bärande kopplingen för gymnasiet.
    const education =
      educations.find((e) => e.id === k.educationId) ??
      (k.programPrefix
        ? educations.find((e) => e.kind === k.kind && e.programCode?.slice(0, 2) === k.programPrefix)
        : undefined) ??
      educations.find((e) => e.kind === k.kind);
    if (!education) continue;
    const columnId = k.columnId ?? (
      education.kind === 'grundskola'
        ? k.grade
          ? `ak${k.grade}`
          : undefined
        : education.kind === 'gymnasium'
          ? k.cohortYear
            ? `ar${startYear - k.cohortYear + 1}`
            : undefined
          : education.columns[0]?.id);
    const known = columnId && education.columns.some((c) => c.id === columnId) ? columnId : undefined;
    groups.push({
      id: `klass:${k.name}`,
      name: k.name,
      scope: 'klass',
      kind: education.kind,
      educationId: education.id,
      educationName: education.name,
      columnId: known,
      parentId: known ? `${education.id}:${known}` : undefined,
      pupils: k.pupils,
    });
  }
  return groups;
}

/** Gruppen och de grupper den ärver avvikelser från, närmast först. */
export function groupChain(group: StudentGroup, groups: StudentGroup[]): StudentGroup[] {
  const chain = [group];
  let parent = group.parentId ? groups.find((g) => g.id === group.parentId) : undefined;
  while (parent && !chain.includes(parent)) {
    chain.push(parent);
    parent = parent.parentId ? groups.find((g) => g.id === parent!.parentId) : undefined;
  }
  return chain;
}

export type GroupDay = DayInfo & {
  /** Skoldag för skolan men utan undervisning för gruppen. */
  off?: { cause: Cause; note?: string; from: string; recurring?: boolean };
};

/** Skolans dagar sedda ur en grupps perspektiv. */
export function groupYearDays(sy: SchoolYear, group: StudentGroup, groups: StudentGroup[]): GroupDay[] {
  const chain = groupChain(group, groups);
  return yearDays(sy).map((d) => {
    if (d.status !== 'skoldag') return d;
    for (const g of chain) {
      const e = sy.groupExceptions[g.id]?.[d.date];
      if (e) return { ...d, off: { ...e, from: g.name } };
      const short = sy.shortWeeks[g.id];
      if (short && weekday(d.date) === short.weekday)
        return { ...d, off: { cause: 'annat', note: short.reason, from: g.name, recurring: true } };
    }
    return d;
  });
}

export type GroupSummary = {
  /** Dagar gruppen faktiskt har undervisning. */
  days: number;
  perWeekday: number[];
  /** Skolans skoldagar minus gruppens. */
  fewer: number;
  byCause: { cause: Cause; days: number; note?: string; recurring?: boolean }[];
  shortWeek?: ShortWeek & { from: string };
  issues: Issue[];
};

export function groupSummary(sy: SchoolYear, group: StudentGroup, groups: StudentGroup[]): GroupSummary {
  const days = groupYearDays(sy, group, groups);
  const teaching = days.filter((d) => d.status === 'skoldag' && !d.off);
  const off = days.filter((d) => d.status === 'skoldag' && d.off);
  const perWeekday = [0, 1, 2, 3, 4].map((w) => teaching.filter((d) => weekday(d.date) === w).length);
  const causes = new Map<string, { cause: Cause; days: number; note?: string; recurring?: boolean }>();
  for (const d of off) {
    const key = `${d.off!.cause}|${d.off!.recurring ? 'v' : 'd'}`;
    const row = causes.get(key) ?? { cause: d.off!.cause, days: 0, note: d.off!.note, recurring: d.off!.recurring };
    row.days += 1;
    causes.set(key, row);
  }
  const chain = groupChain(group, groups);
  const shortOwner = chain.find((g) => sy.shortWeeks[g.id]);
  const issues: Issue[] = [];
  if (shortOwner) {
    const short = sy.shortWeeks[shortOwner.id];
    const allowed = shortOwner.kind === 'grundskola' && (shortOwner.columnId === 'ak1' || shortOwner.columnId === 'ak2');
    if (!allowed)
      issues.push({ level: 'error', text: `${shortOwner.name} läser fyra dagar i veckan. Antalet skoldagar i veckan får bara begränsas för en grupp elever i årskurs 1 eller 2 (Skolförordningen 3 kap. 4 § andra stycket).` });
    if (!short.reason.trim())
      issues.push({ level: 'error', text: `Fyra skoldagar i veckan för ${shortOwner.name} kräver särskilda skäl. Ange dem.` });
  }
  for (const g of chain)
    for (const [date, e] of Object.entries(sy.groupExceptions[g.id] ?? {}))
      if (e.cause === 'annat' && !e.note?.trim())
        issues.push({ level: 'error', text: `${g.name} saknar undervisning ${formatLong(date)} utan angiven orsak. Skriv vad som gäller den dagen.` });
  const schoolDays = days.filter((d) => d.status === 'skoldag').length;
  if (teaching.length < minSchoolDays && schoolDays >= minSchoolDays)
    issues.push({ level: 'warning', text: `${group.name} har ${format(teaching.length)} undervisningsdagar mot skolans ${format(schoolDays)}. Läsåret ska ha minst ${minSchoolDays} skoldagar; avsteg för en grupp behöver kunna motiveras, och den garanterade undervisningstiden i timmar ska ändå nås.` });
  return {
    days: teaching.length,
    perWeekday,
    fewer: schoolDays - teaching.length,
    byCause: [...causes.values()].sort((a, b) => b.days - a.days),
    shortWeek: shortOwner ? { ...sy.shortWeeks[shortOwner.id], from: shortOwner.name } : undefined,
    issues,
  };
}

export type Issue = { level: 'error' | 'warning'; text: string };
export type Summary = {
  skoldagar: number;
  lovdagar: number;
  lovdagarTerminer: number;
  lovdagarJullov: number;
  studiedagar: number;
  helgdagar: Holiday[];
  weeks: { ht: number; vt: number; total: number };
  terms: Record<'ht' | 'vt', { skoldagar: number; lovdagar: number; studiedagar: number; helgdagar: number }>;
  /** Skoldagar per veckodag måndag–fredag. */
  perWeekday: number[];
  /** Skoldagar utöver minsta antal; negativt när läsåret är för kort. */
  margin: number;
  studiedagarKvar: number;
  issues: Issue[];
};

/** Veckor som en termin spänner över, räknat på kalenderveckor. */
export function termWeeks(term: Term) {
  return Math.round((daysBetween(monday(term.start), monday(term.end)) + 7) / 7);
}

const format = (n: number) => n.toLocaleString('sv-SE');

export function summarize(sy: SchoolYear, schoolTypes: string[] = ['GR']): Summary {
  const days = yearDays(sy);
  const count = (f: (d: DayInfo) => boolean) => days.filter(f).length;
  const termCount = (part: 'ht' | 'vt') => ({
    skoldagar: count((d) => d.part === part && d.status === 'skoldag'),
    lovdagar: count((d) => d.part === part && d.status === 'lovdag'),
    studiedagar: count((d) => d.part === part && d.status === 'studiedag'),
    helgdagar: count((d) => d.part === part && d.status === 'helgdag'),
  });
  const perWeekday = [0, 1, 2, 3, 4].map((w) => count((d) => d.status === 'skoldag' && weekday(d.date) === w));
  const skoldagar = count((d) => d.status === 'skoldag');
  const lovdagarTerminer = count((d) => d.status === 'lovdag' && d.part !== 'jullov');
  const lovdagarJullov = count((d) => d.status === 'lovdag' && d.part === 'jullov');
  const studiedagar = count((d) => d.status === 'studiedag');
  const helgdagar = days.filter((d) => d.status === 'helgdag').map((d) => ({ date: d.date, name: d.holiday! }));
  const weeks = { ht: termWeeks(sy.ht), vt: termWeeks(sy.vt), total: termWeeks(sy.ht) + termWeeks(sy.vt) };
  const issues: Issue[] = [];
  const gy = schoolTypes.includes('GY') || schoolTypes.includes('GYAN');
  const gr = schoolTypes.some((t) => ['GR', 'GRAN', 'SP', 'SAM', 'FSK', 'FKLASS'].includes(t));

  if (sy.ht.start.slice(5, 7) !== '08') issues.push({ level: 'error', text: 'Läsåret ska börja i augusti.' });
  if (sy.vt.end.slice(5, 7) !== '06') issues.push({ level: 'error', text: gy && !gr ? 'Läsåret ska sluta senast i juni.' : 'Läsåret ska sluta i juni.' });
  if (sy.ht.end <= sy.ht.start || sy.vt.end <= sy.vt.start || sy.vt.start <= sy.ht.end)
    issues.push({ level: 'error', text: 'Terminerna överlappar eller är omvända. Höstterminen slutar före vårterminen börjar.' });
  if (skoldagar < minSchoolDays)
    issues.push({ level: 'error', text: `Läsåret har ${format(skoldagar)} skoldagar; minst ${minSchoolDays} krävs. Ta bort ${format(minSchoolDays - skoldagar)} lov- eller studiedag${minSchoolDays - skoldagar > 1 ? 'ar' : ''} eller förläng en termin.` });
  if (lovdagarTerminer + lovdagarJullov < minHolidays)
    issues.push({ level: 'error', text: `Läsåret har ${format(lovdagarTerminer + lovdagarJullov)} lovdagar; minst ${minHolidays} krävs.` });
  if (studiedagar > maxStudyDays)
    issues.push({ level: 'error', text: `${format(studiedagar)} studiedagar är utlagda; högst ${maxStudyDays} får läggas ut inom läsåret.` });
  if (gy && weeks.total !== gymnasiumWeeks)
    issues.push({ level: gr ? 'warning' : 'error', text: `Terminerna omfattar ${format(weeks.total)} veckor; gymnasieskolans läsår ska omfatta ${gymnasiumWeeks} veckor (Gymnasieförordningen 3 kap. 1 §).${gr ? ' Grundskolan har inget veckokrav.' : ''}` });
  for (const [term, name] of [['ht', 'Höstterminen'], ['vt', 'Vårterminen']] as const) {
    for (const edge of ['start', 'end'] as const) {
      const d = sy[term][edge];
      if (isWeekend(d) || holidayName(d))
        issues.push({ level: 'warning', text: `${name} ${edge === 'start' ? 'börjar' : 'slutar'} ${formatLong(d)}, som är ${holidayName(d) ? holidayName(d)!.toLocaleLowerCase('sv') : 'en helg'}.` });
    }
  }
  const spread = Math.max(...perWeekday) - Math.min(...perWeekday);
  if (spread >= 4) {
    const low = perWeekday.indexOf(Math.min(...perWeekday));
    const high = perWeekday.indexOf(Math.max(...perWeekday));
    issues.push({ level: 'warning', text: `Skoldagarna är ojämnt fördelade över veckan: ${format(perWeekday[low])} ${weekdayNames[low]}ar mot ${format(perWeekday[high])} ${weekdayNames[high]}ar. Undervisning som bara ligger på ${weekdayNames[low]}ar får ${format(spread)} färre tillfällen. Lägg studiedagar och lovdagar på andra veckodagar.` });
  }
  // Skoldagar i följd utan lov. En svensk hösttermin har normalt tio till elva
  // veckor fram till höstlovet; först en termin helt utan avbrott flaggas.
  let run = 0;
  let longest = { length: 0, end: '' };
  for (const d of days) {
    if (d.status === 'skoldag' || d.status === 'helg') {
      if (d.status === 'skoldag') run += 1;
    } else {
      if (run > longest.length) longest = { length: run, end: d.date };
      run = 0;
    }
  }
  if (run > longest.length) longest = { length: run, end: addDays(sy.vt.end, 1) };
  if (longest.length > longRun)
    issues.push({ level: 'warning', text: `${format(longest.length)} skoldagar i följd utan lov fram till ${formatDate(addDays(longest.end, -1))}, mer än ${longRun / 5} veckor. Skoldagarna ska vara så jämnt fördelade över läsåret som möjligt.` });
  for (const d of days)
    if (d.status === 'studiedag' && d.note === undefined)
      issues.push({ level: 'warning', text: `Studiedagen ${formatLong(d.date)} saknar anteckning om vad personalen gör.` });

  return {
    skoldagar,
    lovdagar: lovdagarTerminer + lovdagarJullov,
    lovdagarTerminer,
    lovdagarJullov,
    studiedagar,
    helgdagar,
    weeks,
    terms: { ht: termCount('ht'), vt: termCount('vt') },
    perWeekday,
    margin: skoldagar - minSchoolDays,
    studiedagarKvar: Math.max(0, maxStudyDays - studiedagar),
    issues,
  };
}

// ---------------------------------------------------------------- kalender

export type WeekRow = { week: number; year: number; days: DayInfo[]; monthLabel?: string; schoolDays: number };
/** Veckorader för en halva av kalendern, måndag–söndag, med månadsetikett där månaden byter. */
export function weekRows(sy: SchoolYear, half: 'ht' | 'vt'): WeekRow[] {
  const year = half === 'ht' ? sy.startYear : sy.startYear + 1;
  const from = half === 'ht' ? monday(`${year}-08-01`) : monday(`${year}-01-01`);
  const to = half === 'ht' ? `${year}-12-31` : `${year}-06-30`;
  const rows: WeekRow[] = [];
  let seen = '';
  for (let m = from; m <= to; m = addDays(m, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => dayInfo(sy, addDays(m, i)));
    const w = isoWeek(m);
    const firstOfMonth = days.find((d) => d.date.slice(8) === '01' || d.date === from);
    const month = firstOfMonth ? monthNames[Number(firstOfMonth.date.slice(5, 7)) - 1] : undefined;
    const label = month && month !== seen ? month : undefined;
    if (label) seen = label;
    rows.push({ week: w.week, year: w.year, days, monthLabel: label, schoolDays: days.filter((d) => d.status === 'skoldag').length });
  }
  return rows;
}

// ---------------------------------------------------------------- förslag

/** Flyttar en terminsdag bort från helger och helgdagar, framåt eller bakåt. */
function workday(date: ISODate, direction: 1 | -1): ISODate {
  let d = date;
  while (isWeekend(d) || holidayName(d)) d = addDays(d, direction);
  return d;
}

/** Ett förslag utifrån helgdagar och vanliga lov; allt kan ändras. */
export function proposeSchoolYear(startYear: number, unitId: string, schoolTypes: string[] = ['GR']): SchoolYear {
  const next = startYear + 1;
  let htStart = workday(mondayOfWeek(startYear, 34), 1);
  const htEnd = workday(addDays(monday(`${startYear}-12-18`), 4), -1);
  const vtStart = workday(mondayOfWeek(next, 2), 1);
  const vtEnd = workday(addDays(monday(`${next}-06-10`), 4), -1);
  const gy = schoolTypes.includes('GY') || schoolTypes.includes('GYAN');
  // Gymnasieskolans läsår omfattar 40 veckor; flytta höstterminens början inom augusti.
  const weeks = () => termWeeks({ start: htStart, end: htEnd }) + termWeeks({ start: vtStart, end: vtEnd });
  while (gy && weeks() < gymnasiumWeeks && addDays(htStart, -7).slice(5, 7) === '08') htStart = addDays(htStart, -7);
  while (gy && weeks() > gymnasiumWeeks && addDays(htStart, 7).slice(5, 7) === '08') htStart = addDays(htStart, 7);
  htStart = workday(htStart, 1);

  const exceptions: Record<ISODate, Exception> = {};
  const week = (year: number, w: number, note: string) => {
    const m = mondayOfWeek(year, w);
    for (let i = 0; i < 5; i += 1) exceptions[addDays(m, i)] = { kind: 'lovdag', note };
  };
  week(startYear, 44, 'Höstlov');
  week(next, 9, 'Sportlov');
  const easter = easterSunday(next);
  const easterMonday = addDays(easter, -6);
  for (let i = 0; i < 4; i += 1) exceptions[addDays(easterMonday, i)] = { kind: 'lovdag', note: 'Påsklov' };
  const ascension = addDays(easter, 39);
  exceptions[addDays(ascension, 1)] = { kind: 'lovdag', note: 'Klämdag efter Kristi himmelsfärdsdag' };
  // Behåll bara lov som faktiskt ligger på vardagar inom terminerna.
  const draft: SchoolYear = { id: `${startYear}/${String(next).slice(2)}`, unitId, startYear, label: `Läsåret ${startYear}/${String(next).slice(2)}`, ht: { start: htStart, end: htEnd }, vt: { start: vtStart, end: vtEnd }, exceptions: {}, groupExceptions: {}, shortWeeks: {}, status: 'utkast', history: [] };
  for (const [date, e] of Object.entries(exceptions)) if (dayInfo(draft, date).editable) draft.exceptions[date] = e;
  return draft;
}

// ---------------------------------------------------------------- beräkning

// Beräkningarna tar antalet undervisningsdagar, inte en sammanfattning, så att
// de fungerar lika för skolan och för en grupp med egna lärotider.
/** Skolveckor: dagarna räknade som femdagarsveckor. */
export const schoolWeeks = (days: number) => days / 5;
/** Minuter per vecka som `hours` timmar per läsår kräver på `days` dagar. */
export const requiredWeeklyMinutes = (hours: number, days: number) =>
  days ? Math.round((hours * 60) / schoolWeeks(days)) : 0;
/** Timmar per undervisningsdag i genomsnitt. */
export const hoursPerSchoolDay = (hours: number, days: number) => (days ? hours / days : 0);

export type WeeklySlot = { day: number; duration: number };
/** Undervisning som ett återkommande veckoschema lägger ut under läsåret, i timmar. */
export function plannedHours(s: { perWeekday: number[] }, slots: WeeklySlot[]): { hours: number; occasions: number; perDay: number[] } {
  const perDay = [0, 0, 0, 0, 0];
  let minutes = 0;
  let occasions = 0;
  for (const slot of slots) {
    const n = s.perWeekday[slot.day] ?? 0;
    perDay[slot.day] += slot.duration * n;
    minutes += slot.duration * n;
    occasions += n;
  }
  return { hours: Math.round((minutes / 60) * 10) / 10, occasions, perDay: perDay.map((m) => Math.round((m / 60) * 10) / 10) };
}

// ---------------------------------------------------------------- flöde

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const entry = (role: Role, action: string, comment: string): Entry => ({ id: uid(), time: clock(), role, action, comment });
const editableStatus: SchoolYearStatus[] = ['utkast', 'återsänd'];
export const canEdit = (state: LasarState, sy: SchoolYear) => state.role === 'rektor' && editableStatus.includes(sy.status);
export const yearOf = (state: LasarState, id: string) => {
  const sy = state.years.find((y) => y.id === id);
  ensure(sy, 'Läsåret finns inte.');
  return sy;
};
const replace = (state: LasarState, next: SchoolYear): LasarState => ({ ...state, years: state.years.map((y) => (y.id === next.id ? next : y)) });

export function setRole(state: LasarState, role: Role): LasarState {
  return { ...state, role };
}

export function setDay(state: LasarState, id: string, date: ISODate, kind: Planned, note?: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const info = dayInfo(sy, date);
  ensure(info.editable, info.status === 'helgdag' ? `${formatLong(date)} är ${info.holiday!.toLocaleLowerCase('sv')} och kan inte vara skoldag.` : info.status === 'helg' ? 'Skolarbetet förläggs måndag–fredag.' : info.part === 'jullov' ? 'Dagarna mellan terminerna är lov. Ändra terminens slut eller början i stället.' : 'Dagen ligger utanför läsåret. Ändra terminernas början och slut i stället.');
  const exceptions = { ...sy.exceptions };
  if (kind === 'skoldag') delete exceptions[date];
  else exceptions[date] = note === undefined ? { kind } : { kind, note };
  return replace(state, { ...sy, exceptions });
}

/** Nya undantag när ett antal dagar får samma slag. Låsta dagar hoppas över. */
function applyKind(sy: SchoolYear, dates: ISODate[], kind: Planned, note?: string) {
  const exceptions = { ...sy.exceptions };
  const changed: ISODate[] = [];
  for (const date of dates) {
    if (!dayInfo(sy, date).editable) continue;
    if (kind === 'skoldag') delete exceptions[date];
    else exceptions[date] = note === undefined ? { kind } : { kind, note };
    changed.push(date);
  }
  return { exceptions, changed };
}

/** Sätter samma slag på flera markerade dagar, som inte behöver ligga i följd. */
export function setDays(state: LasarState, id: string, dates: ISODate[], kind: Planned, note?: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const { exceptions, changed } = applyKind(sy, dates, kind, note);
  ensure(changed.length, 'Ingen av de markerade dagarna kan ändras. Helger, allmänna helgdagar och dagarna mellan terminerna är låsta.');
  return replace(state, { ...sy, exceptions });
}

/** Sätter samma slag på alla ändringsbara dagar i ett intervall, till exempel vid skift-klick. */
export function setRange(state: LasarState, id: string, from: ISODate, to: ISODate, kind: Planned, note?: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const [a, b] = from <= to ? [from, to] : [to, from];
  const dates: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) dates.push(d);
  const { exceptions, changed } = applyKind(sy, dates, kind, note);
  ensure(changed.length, 'Inga vardagar inom terminerna i det valda intervallet.');
  return replace(state, { ...sy, exceptions });
}

/** Vardagar inom terminerna i ett intervall; underlag för markering med skift-klick. */
export function editableRange(sy: SchoolYear, from: ISODate, to: ISODate): ISODate[] {
  const [a, b] = from <= to ? [from, to] : [to, from];
  const dates: ISODate[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) if (dayInfo(sy, d).editable) dates.push(d);
  return dates;
}

export function setNote(state: LasarState, id: string, date: ISODate, note: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const e = sy.exceptions[date];
  ensure(e, 'Bara lov- och studiedagar har anteckning.');
  return replace(state, { ...sy, exceptions: { ...sy.exceptions, [date]: note.trim() ? { ...e, note: note.trim() } : { kind: e.kind } } });
}

/** Samma anteckning på flera markerade lov- eller studiedagar. Skoldagar hoppas över. */
export function setNotes(state: LasarState, id: string, dates: ISODate[], note: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const text = note.trim();
  const exceptions = { ...sy.exceptions };
  let changed = 0;
  for (const date of dates) {
    const e = exceptions[date];
    if (!e) continue;
    exceptions[date] = text ? { ...e, note: text } : { kind: e.kind };
    changed += 1;
  }
  ensure(changed, 'Bara lov- och studiedagar har anteckning. Markera minst en sådan dag.');
  return replace(state, { ...sy, exceptions });
}

/** Markerar skoldagar som utan undervisning för en grupp. Bara skolans skoldagar berörs. */
export function setGroupDays(state: LasarState, id: string, group: StudentGroup, dates: ISODate[], cause: Cause, note?: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  ensure(cause !== 'annat' || note?.trim(), 'Ange vad som gäller dagen när orsaken är annat.');
  const usable = dates.filter((d) => dayInfo(sy, d).status === 'skoldag');
  ensure(usable.length, 'Bara skolans skoldagar kan sakna undervisning för en grupp. Lov, studiedagar, helger och helgdagar gäller redan alla.');
  const byDate = { ...sy.groupExceptions[group.id] };
  for (const date of usable) byDate[date] = note?.trim() ? { cause, note: note.trim() } : { cause };
  return replace(state, { ...sy, groupExceptions: { ...sy.groupExceptions, [group.id]: byDate } });
}

/** Tar bort gruppens avvikelser och låter skolans dag gälla igen. */
export function clearGroupDays(state: LasarState, id: string, group: StudentGroup, dates: ISODate[]): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const byDate = { ...sy.groupExceptions[group.id] };
  let removed = 0;
  for (const date of dates)
    if (byDate[date]) {
      delete byDate[date];
      removed += 1;
    }
  ensure(removed, `Ingen av de markerade dagarna är en egen avvikelse för ${group.name}.`);
  const groupExceptions = { ...sy.groupExceptions };
  if (Object.keys(byDate).length) groupExceptions[group.id] = byDate;
  else delete groupExceptions[group.id];
  return replace(state, { ...sy, groupExceptions });
}

/**
 * Fyra skoldagar i veckan för en grupp. Skolförordningen 3 kap. 4 § andra
 * stycket tillåter det bara för en grupp elever i årskurs 1 eller 2, och
 * bara om det finns särskilda skäl.
 */
export function setShortWeek(state: LasarState, id: string, group: StudentGroup, weekdayOff: number, reason: string): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  ensure(weekdayOff >= 0 && weekdayOff <= 4, 'Välj en veckodag måndag till fredag.');
  ensure(group.kind === 'grundskola' && (group.columnId === 'ak1' || group.columnId === 'ak2'),
    'Antalet skoldagar i veckan får bara begränsas för en grupp elever i årskurs 1 eller 2 (Skolförordningen 3 kap. 4 § andra stycket).');
  ensure(reason.trim(), 'Ange de särskilda skälen.');
  return replace(state, { ...sy, shortWeeks: { ...sy.shortWeeks, [group.id]: { weekday: weekdayOff, reason: reason.trim(), columnId: group.columnId! } } });
}

export function clearShortWeek(state: LasarState, id: string, group: StudentGroup): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  ensure(sy.shortWeeks[group.id], `${group.name} har ingen förkortad vecka.`);
  const shortWeeks = { ...sy.shortWeeks };
  delete shortWeeks[group.id];
  return replace(state, { ...sy, shortWeeks });
}

export function setTerm(state: LasarState, id: string, term: 'ht' | 'vt', edge: 'start' | 'end', date: ISODate): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseDate(date).getTime()), 'Ange ett datum.');
  const next = { ...sy, [term]: { ...sy[term], [edge]: date } };
  ensure(next.ht.start < next.ht.end && next.ht.end < next.vt.start && next.vt.start < next.vt.end, 'Terminerna måste ligga i ordning: höstterminen före vårterminen.');
  ensure(next.ht.start.slice(0, 4) === String(sy.startYear) && next.vt.end.slice(0, 4) === String(sy.startYear + 1), `Läsåret ${sy.id} ligger ${sy.startYear}–${sy.startYear + 1}.`);
  // Lov, studiedagar och gruppavvikelser utanför terminerna faller bort.
  const exceptions: Record<ISODate, Exception> = {};
  for (const [d, e] of Object.entries(sy.exceptions)) if (dayInfo(next, d).editable) exceptions[d] = e;
  const groupExceptions: SchoolYear['groupExceptions'] = {};
  for (const [groupId, byDate] of Object.entries(sy.groupExceptions)) {
    const kept = Object.fromEntries(Object.entries(byDate).filter(([d]) => dayInfo(next, d).editable));
    if (Object.keys(kept).length) groupExceptions[groupId] = kept;
  }
  return replace(state, { ...next, exceptions, groupExceptions });
}

export function resetToProposal(state: LasarState, id: string, schoolTypes: string[]): LasarState {
  const sy = yearOf(state, id);
  ensure(canEdit(state, sy), 'Bara rektorn ändrar ett utkast eller en återsänd version.');
  const proposal = proposeSchoolYear(sy.startYear, sy.unitId, schoolTypes);
  return replace(state, { ...sy, ht: proposal.ht, vt: proposal.vt, exceptions: proposal.exceptions, history: [entry('rektor', 'Förslag återställt', 'Terminer och lov enligt förslaget utifrån helgdagarna.'), ...sy.history] });
}

/** Skolans och gruppernas avvikelser tillsammans, som besluten prövas mot. */
export function allIssues(sy: SchoolYear, schoolTypes: string[], groups: StudentGroup[] = []): Issue[] {
  return [...summarize(sy, schoolTypes).issues, ...groups.flatMap((g) => groupSummary(sy, g, groups).issues)];
}

export function submit(state: LasarState, id: string, comment: string, schoolTypes: string[], groups: StudentGroup[] = []): LasarState {
  const sy = yearOf(state, id);
  ensure(state.role === 'rektor', 'Bara rektorn skickar förslag till huvudmannen.');
  ensure(editableStatus.includes(sy.status), 'Läsåret är redan skickat eller fastställt.');
  ensure(comment.trim(), 'Beskriv förslaget för huvudmannen.');
  const errors = allIssues(sy, schoolTypes, groups).filter((i) => i.level === 'error');
  ensure(!errors.length, `Åtgärda ${errors.length} avvikelse${errors.length > 1 ? 'r' : ''} innan förslaget skickas.`);
  return replace(state, { ...sy, status: 'förslag', history: [entry('rektor', 'Förslag skickat', comment.trim()), ...sy.history] });
}

export function withdraw(state: LasarState, id: string): LasarState {
  const sy = yearOf(state, id);
  ensure(state.role === 'rektor' && sy.status === 'förslag', 'Bara ett skickat förslag kan tas tillbaka av rektorn.');
  return replace(state, { ...sy, status: 'utkast', history: [entry('rektor', 'Förslag återtaget', 'Förslaget togs tillbaka för fortsatt arbete.'), ...sy.history] });
}

export function requestChanges(state: LasarState, id: string, comment: string): LasarState {
  const sy = yearOf(state, id);
  ensure(state.role === 'huvudman', 'Bara huvudmannen återsänder ett förslag.');
  ensure(sy.status === 'förslag', 'Bara ett skickat förslag kan återsändas.');
  ensure(comment.trim(), 'Ange vad rektorn behöver ändra.');
  return replace(state, { ...sy, status: 'återsänd', history: [entry('huvudman', 'Återsänd för ändring', comment.trim()), ...sy.history] });
}

export function approve(state: LasarState, id: string, comment: string, schoolTypes: string[], groups: StudentGroup[] = []): LasarState {
  const sy = yearOf(state, id);
  ensure(state.role === 'huvudman', 'Bara huvudmannen fastställer läsårstiderna.');
  ensure(sy.status === 'förslag', 'Bara ett skickat förslag kan fastställas.');
  ensure(comment.trim(), 'Dokumentera beslutet.');
  const errors = allIssues(sy, schoolTypes, groups).filter((i) => i.level === 'error');
  ensure(!errors.length, 'Förslaget avviker från författningarna och kan inte fastställas.');
  return replace(state, { ...sy, status: 'fastställd', decidedOn: today, history: [entry('huvudman', 'Fastställd', comment.trim()), ...sy.history] });
}

/** Öppnar ett fastställt läsår för ändring; det tidigare beslutet ligger kvar i historiken. */
export function reopen(state: LasarState, id: string, comment: string): LasarState {
  const sy = yearOf(state, id);
  ensure(state.role === 'huvudman', 'Bara huvudmannen öppnar ett fastställt läsår.');
  ensure(sy.status === 'fastställd', 'Läsåret är inte fastställt.');
  ensure(comment.trim(), 'Ange skälet.');
  return replace(state, { ...sy, status: 'utkast', decidedOn: undefined, history: [entry('huvudman', 'Öppnat för ändring', comment.trim()), ...sy.history] });
}

export function addComment(state: LasarState, id: string, text: string): LasarState {
  const sy = yearOf(state, id);
  ensure(text.trim(), 'Skriv en kommentar.');
  return replace(state, { ...sy, history: [entry(state.role, 'Kommentar', text.trim()), ...sy.history] });
}

export function addSchoolYear(state: LasarState, unitId: string, startYear: number, schoolTypes: string[]): LasarState {
  ensure(state.role === 'rektor', 'Rektorn påbörjar läsårets planering.');
  ensure(!state.years.some((y) => y.unitId === unitId && y.startYear === startYear), 'Läsåret finns redan.');
  const sy = proposeSchoolYear(startYear, unitId, schoolTypes);
  sy.history = [entry('rektor', 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna. Studiedagar läggs ut av rektorn.')];
  return { ...state, years: [...state.years, sy].sort((a, b) => a.startYear - b.startYear) };
}

export const unitYears = (state: LasarState, unitId: string) => state.years.filter((y) => y.unitId === unitId);

/** Exempel: Testskolan har ett fastställt läsår 2026/27 och ett påbörjat 2027/28. */
export function createLasarState(unitId = '99999901', schoolTypes: string[] = ['GR', 'GY']): LasarState {
  const stamp = (role: Role, action: string, comment: string, time: string): Entry => ({ ...entry(role, action, comment), time });
  const current = proposeSchoolYear(2026, unitId, schoolTypes);
  current.exceptions['2026-09-30'] = { kind: 'studiedag', note: 'Gemensam planering av läsårets bedömning' };
  current.exceptions['2027-02-11'] = { kind: 'studiedag', note: 'Fortbildning i nya läroplanen' };
  current.groupExceptions = {
    'klass:8A': {
      '2027-05-11': { cause: 'nationellt prov', note: 'Lärarna är provvakter vid årskurs 9:s nationella prov' },
      '2027-05-12': { cause: 'nationellt prov', note: 'Lärarna är provvakter vid årskurs 9:s nationella prov' },
    },
  };
  current.status = 'fastställd';
  current.decidedOn = '2026-03-18';
  current.history = [
    stamp('huvudman', 'Fastställd', 'Läsårstiderna fastställda av styrelsen 18 mars 2026.', '2026-03-18'),
    stamp('rektor', 'Förslag skickat', 'Två studiedagar på onsdag och torsdag för att inte belasta måndagarna. Sportlov vecka 9.', '2026-03-02'),
    stamp('rektor', 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna.', '2026-02-20'),
  ];
  const next = proposeSchoolYear(2027, unitId, schoolTypes);
  next.history = [stamp('rektor', 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna. Studiedagar läggs ut av rektorn.', '2026-09-04')];
  return { role: 'rektor', years: [current, next] };
}
