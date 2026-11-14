/**
 * Följ passet (05.2-SM-FOLJ): alla scheman ett valt pass berör, rad för rad med gemensam tidsaxel (`design/Samlingsvy.dc.html`).
 *
 * Förslaget till klienten bär inte passens grupper eller elevkluster (kontraktet v1). Därför härleds de på servern ur underlaget och
 * elevernas medlemskap (`SchemaMembers`): grupperna på passet, grupper som delar elever med passet (med antal) och, för den som får se
 * elever, elevlistan och en vald elevs pass. Klienten får grupper som löpnummer med namn och passens löpnummer; inga elev-ID utom i
 * elevlistan, som bara den som får se eleverna får. Motorn får aldrig elev-ID. Inget sparas.
 *
 * Elevens schema ritas i klienten ur placeringarna i utkastet, så att det följer varje flytt utan ny läsning.
 */
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, type SchemaForslag, type SchemaForslagLesson, type SchemaMembers } from './schema-contract.ts';
import { schemaPassKluster, type SchemaLagenPosition } from './schema-lagen.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

/** En klass eller grupp i motorns underlag. `delar`: elever gemensamma med passet; `null` för grupperna på passet. */
export type SchemaFoljGrupp = { id: string; name: string; slag: 'klass' | 'grupp'; elever: number; delar: number | null;
  /** Antalet bygger på antagen klasstorlek (klass utan elever i registret). */
  antagen: boolean;
  /** Gruppens pass (löpnummer). */
  lessons: string[];
  /** Klasser som gruppens elever går i. Tom för en klass. */
  klasser: string[] };
/** Vald elev: namn, klasser och grupper, passen och vilka av dem som kommer ur en grupp i stället för hela klassen. */
export type SchemaFoljElev = { name: string; grupper: string[]; lessons: string[]; fromGroup: string[] };
export type SchemaFolj = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; fingerprint: string; lesson: string;
  grupper: SchemaFoljGrupp[];
  /** Elever som har passet, för väljaren. `null` när användaren inte får se elever eller elevernas indelning inte kunde stämmas av. */
  elever: { id: string; name: string }[] | null;
  elev: SchemaFoljElev | null };

const LIMIT = { grupper: 40, delar: 8, lessons: 20000, elever: 2000, text: 200 } as const;
const GROUP = /^grupp-\d{1,6}$/u, LESSON = /^pass-\d{1,6}$/u, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const unik = <T,>(values: T[]) => [...new Set(values)];
const svensk = (a: string, b: string) => a.localeCompare(b, 'sv');

/**
 * Varje elevs kluster, med samma indelning som underlaget (elever med exakt samma klasser och grupper under perioden). Stämmer inte antalet
 * per kluster med underlaget ges `null`: då visas ingen elevlista hellre än en som kan vara fel.
 */
export function schemaElevernasKluster(plan: Pick<TjanstPlanRead, 'classes' | 'groups'>, underlag: Pick<SchemaUnderlag, 'problem' | 'terms' | 'time'>,
  members: SchemaMembers | null): { of: Map<string, string>; real: number } | null {
  if (!members) return { of: new Map(), real: 0 };
  const classNo = new Map(plan.classes.map((c, i) => [c.classId, i + 1])), groups = plan.groups ?? [], groupNo = new Map(groups.map((g, i) => [g.groupId, i]));
  const from = underlag.time.terms[underlag.terms[0]]?.span?.start, to = underlag.time.terms[underlag.terms.at(-1)!]?.span?.end;
  const registered = new Set(members.pupils.map(p => p.id)), groupsOf = new Map<string, Set<string>>();
  for (const m of members.memberships) {
    if (!groupNo.has(m.groupId) || !registered.has(m.pupilId)) continue;
    if (from !== undefined && to !== undefined && (m.startsOn > to || m.endsOn !== null && m.endsOn < from)) continue;
    groupsOf.set(m.pupilId, (groupsOf.get(m.pupilId) ?? new Set()).add(m.groupId));
  }
  const pad = (n: number) => String(n).padStart(6, '0'), keyOf = new Map<string, string>(), size = new Map<string, number>();
  for (const p of members.pupils) {
    const classes = unik(p.classIds.filter(id => classNo.has(id))).sort((a, b) => classNo.get(a)! - classNo.get(b)!);
    const own = [...groupsOf.get(p.id) ?? []].sort((a, b) => groupNo.get(a)! - groupNo.get(b)!);
    if (!classes.length && !own.length) continue;
    const key = `${classes.map(id => pad(classNo.get(id)!)).join('.')}|${own.map(id => pad(groupNo.get(id)!)).join('.')}`;
    keyOf.set(p.id, key); size.set(key, (size.get(key) ?? 0) + 1);
  }
  const keys = [...size.keys()].sort(), clusters = underlag.problem.clusters;
  if (keys.some((key, i) => clusters[i]?.id !== `kluster-${i + 1}` || clusters[i].size !== size.get(key))) return null;
  const id = new Map(keys.map((key, i) => [key, `kluster-${i + 1}`]));
  return { of: new Map([...keyOf].map(([pupil, key]) => [pupil, id.get(key)!])), real: keys.length };
}

/**
 * Serverns svar för ett pass: grupperna på passet, grupper som delar elever med det, elevlistan (bara med namn, dvs. för den som får se
 * eleverna) och vald elevs pass. `pupilId` ska redan vara prövad mot läsningarna; elev som inte har passet ger `SchemaContractError`.
 */
export function schemaFolj(plan: Pick<TjanstPlanRead, 'classes' | 'groups'>, underlag: SchemaUnderlag, members: SchemaMembers | null, names: Map<string, string> | null,
  lesson: string, pupilId: string | null): SchemaFolj {
  const { problem, labels } = underlag, own = problem.lessons.find(l => l.id === lesson);
  if (!own) throw new SchemaContractError();
  const classCount = plan.classes.length, slag = (id: string): 'klass' | 'grupp' => Number(id.slice(6)) <= classCount ? 'klass' : 'grupp';
  const name = (id: string) => labels.classes.find(c => c.id === id)?.name ?? labels.names[id] ?? id;
  const size = new Map(problem.clusters.map(c => [c.id, c.size])), mine = new Set(schemaPassKluster(problem, lesson));
  const kluster = schemaElevernasKluster(plan, underlag, members);
  // Kluster efter de verkliga är antagna (klass utan elever, grupp utan medlemmar). Kan indelningen inte stämmas av räknas alla som verkliga.
  const antagen = (c: string) => kluster !== null && problem.clusters.findIndex(x => x.id === c) >= kluster.real;
  const lessonsOf = (g: string) => problem.lessons.filter(l => l.groups.includes(g)).map(l => l.id);
  const className = new Map(labels.classes.map(c => [c.id, c.name]));
  const rad = (g: { id: string; clusters: string[] }, delar: number | null): SchemaFoljGrupp => {
    const lessons = lessonsOf(g.id), counted = delar === null ? g.clusters : g.clusters.filter(c => mine.has(c));
    const klasser = slag(g.id) === 'klass' ? [] : unik(labels.lessons.filter(l => lessons.includes(l.id)).flatMap(l => l.classIds)).flatMap(id => className.has(id) && Number(id.slice(6)) <= classCount ? [className.get(id)!] : []);
    return { id: g.id, name: name(g.id), slag: slag(g.id), elever: g.clusters.reduce((n, c) => n + (size.get(c) ?? 0), 0), delar,
      antagen: counted.some(antagen), lessons, klasser };
  };
  const on = own.groups.flatMap(id => { const g = problem.groups.find(x => x.id === id); return g ? [rad(g, null)] : []; });
  const delar = problem.groups.filter(g => !own.groups.includes(g.id)).map(g => ({ g, n: g.clusters.filter(c => mine.has(c)).reduce((sum, c) => sum + (size.get(c) ?? 0), 0) }))
    .filter(x => x.n > 0).sort((a, b) => b.n - a.n || svensk(name(a.g.id), name(b.g.id))).slice(0, LIMIT.delar).map(x => rad(x.g, x.n));
  const elever = kluster && names && names.size
    ? [...kluster.of].flatMap(([id, c]) => mine.has(c) && names.has(id) ? [{ id, name: names.get(id)! }] : []).sort((a, b) => svensk(a.name, b.name) || a.id.localeCompare(b.id)).slice(0, LIMIT.elever)
    : null;
  let elev: SchemaFoljElev | null = null;
  if (pupilId !== null) {
    const c = kluster?.of.get(pupilId);
    if (!c || !mine.has(c)) throw new SchemaContractError();
    const groups = problem.groups.filter(g => g.clusters.includes(c)), ids = new Set(groups.map(g => g.id));
    const lessons = problem.lessons.filter(l => l.groups.some(g => ids.has(g)));
    elev = { name: names?.get(pupilId) ?? 'Vald elev', grupper: groups.map(g => name(g.id)),
      lessons: lessons.map(l => l.id), fromGroup: lessons.filter(l => !l.groups.some(g => ids.has(g) && slag(g) === 'klass')).map(l => l.id) };
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint: underlag.fingerprint, lesson, grupper: [...on, ...delar], elever, elev };
}

function bad(): never { throw new SchemaContractError(); }
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) bad();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) bad();
  return value;
}
function text(value: unknown, maximum: number = LIMIT.text): string {
  if (typeof value !== 'string' || !value || value.length > maximum) bad();
  return value;
}
const count = (value: unknown) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) bad(); return value; };
const ids = (value: unknown, pattern: RegExp) => list(value, LIMIT.lessons).map(x => { const s = text(x, 20); if (!pattern.test(s)) bad(); return s; });

/** Klientens tolkning av ruttens svar. */
export function parseSchemaFolj(value: unknown, fingerprint: string, lesson: string): SchemaFolj {
  const k = exact(value, ['contractVersion', 'fingerprint', 'lesson', 'grupper', 'elever', 'elev']);
  if (k.contractVersion !== SCHEMA_CONTRACT_VERSION || k.fingerprint !== fingerprint || k.lesson !== lesson) bad();
  const grupper = list(k.grupper, LIMIT.grupper).map(raw => {
    const g = exact(raw, ['id', 'name', 'slag', 'elever', 'delar', 'antagen', 'lessons', 'klasser']);
    if (!GROUP.test(text(g.id, 20)) || (g.slag !== 'klass' && g.slag !== 'grupp') || typeof g.antagen !== 'boolean') bad();
    return { id: g.id as string, name: text(g.name), slag: g.slag, elever: count(g.elever), delar: g.delar === null ? null : count(g.delar), antagen: g.antagen,
      lessons: ids(g.lessons, LESSON), klasser: list(g.klasser, 200).map(x => text(x)) } satisfies SchemaFoljGrupp;
  });
  const elever = k.elever === null ? null : list(k.elever, LIMIT.elever).map(raw => {
    const p = exact(raw, ['id', 'name']), id = text(p.id, 40);
    if (!UUID.test(id)) bad();
    return { id, name: text(p.name) };
  });
  let elev: SchemaFoljElev | null = null;
  if (k.elev !== null) {
    const e = exact(k.elev, ['name', 'grupper', 'lessons', 'fromGroup']);
    elev = { name: text(e.name), grupper: list(e.grupper, LIMIT.grupper).map(x => text(x)), lessons: ids(e.lessons, LESSON), fromGroup: ids(e.fromGroup, LESSON) };
    if (elev.fromGroup.some(id => !elev!.lessons.includes(id))) bad();
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint, lesson, grupper, elever, elev };
}

// ── Klientens rader ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export type FoljRadSlag = 'klass' | 'grupp' | 'larare' | 'sal' | 'delar' | 'elev';
/** En rad i Följ passet: vem, en rad text under namnet ("klass · 25 elever") och passen som visas. */
export type FoljRad = { key: string; slag: FoljRadSlag; name: string; detail: string; chip: string; lessons: SchemaForslagLesson[];
  /** Klassens eller gruppens egna pass i underlaget (för en klass: pass för hela klassen), för att avgöra vilka krockar som syns här. */
  egna?: Set<string>;
  /** Elevens rad: pass som kommer ur en grupp i stället för hela klassen (streckad kant). */
  fromGroup?: Set<string> };

const elevText = (n: number, antagen: boolean) => `${antagen ? 'antagna ' : ''}${n} ${n === 1 ? 'elev' : 'elever'}`;

/**
 * Raderna för ett pass, i designvyns ordning: klasser och grupper på passet, lärarna, salen, grupper som delar elever med passet och vald elev.
 * Utan serverns svar (ännu inte läst eller nekat) visas passets klasser ur förslaget. `visas` väljer passen (lagda, i terminen som visas).
 */
export function foljRader(forslag: Pick<SchemaForslag, 'lessons' | 'classes' | 'teachers' | 'rooms'>, lessonId: string, folj: SchemaFolj | null,
  visas: (l: SchemaForslagLesson) => boolean): FoljRad[] {
  const lesson = forslag.lessons.find(l => l.id === lessonId);
  if (!lesson) return [];
  const shown = forslag.lessons.filter(l => l.day !== null && l.startMin !== null && visas(l));
  const byClass = (id: string) => shown.filter(l => l.classIds.includes(id)), byIds = (ids: string[]) => { const s = new Set(ids); return shown.filter(l => s.has(l.id)); };
  const className = (id: string) => forslag.classes.find(c => c.id === id)?.name ?? id;
  const rows: FoljRad[] = [];
  const grupp = (g: SchemaFoljGrupp, slag: FoljRadSlag): FoljRad => {
    const lessons = g.slag === 'klass' ? byClass(g.id) : byIds(g.lessons);
    if (slag === 'delar') {
      const n = elevText(g.delar ?? 0, g.antagen);
      return { key: `delar:${g.id}`, slag, name: g.name, detail: `${g.slag} · delar ${n}`, chip: `${g.name} (delar ${n})`, lessons, egna: new Set(g.lessons) };
    }
    return { key: `${g.slag}:${g.id}`, slag: g.slag, name: g.name, chip: g.name, lessons, egna: new Set(g.lessons),
      detail: `${g.slag} · ${elevText(g.elever, g.antagen)}${g.klasser.length ? ` ur ${g.klasser.join(', ')}` : ''}` };
  };
  if (folj) rows.push(...folj.grupper.filter(g => g.delar === null).map(g => grupp(g, g.slag)));
  else rows.push(...lesson.classIds.map(id => ({ key: `klass:${id}`, slag: 'klass' as const, name: className(id), detail: 'klass', chip: className(id), lessons: byClass(id) })));
  for (const id of lesson.teacherIds) {
    const name = forslag.teachers.find(t => t.id === id)?.name ?? id, lessons = shown.filter(l => l.teacherIds.includes(id));
    rows.push({ key: `larare:${id}`, slag: 'larare', name, chip: name, lessons, detail: `lärare · ${unik(lessons.map(l => l.title)).slice(0, 3).join(', ') || lesson.title}` });
  }
  if (lesson.roomId) {
    const name = forslag.rooms.find(r => r.id === lesson.roomId)?.name ?? lesson.roomId;
    rows.push({ key: `sal:${lesson.roomId}`, slag: 'sal', name, chip: name, detail: 'sal', lessons: shown.filter(l => l.roomId === lesson.roomId) });
  }
  if (folj) {
    const seen = new Set(rows.map(r => r.key.split(':')[1]));
    rows.push(...folj.grupper.filter(g => g.delar !== null && !seen.has(g.id)).map(g => grupp(g, 'delar')));
    if (folj.elev) rows.push({ key: 'elev', slag: 'elev', name: folj.elev.name, detail: `elev · ${folj.elev.grupper.join(', ')}`, chip: `${folj.elev.name} (elev)`,
      lessons: byIds(folj.elev.lessons), fromGroup: new Set(folj.elev.fromGroup) });
  }
  return rows;
}

const DAGAR = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const klocka = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const forsta = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Elevens krockar som inte syns i något annat schema på raderna: två av elevens pass ligger samtidigt (samma dag, överlappande tid, samma termin
 * eller hela året) och ingen klass- eller grupprad har båda bland sina egna pass (en klass: pass för hela klassen). Ger passen och en text per krock, i tidsordning.
 */
export function elevKrockar(rader: FoljRad[]): { lessons: Set<string>; texter: string[] } {
  const elev = rader.find(r => r.slag === 'elev'), lessons = new Set<string>(), texter: string[] = [];
  if (!elev) return { lessons, texter };
  const others = rader.flatMap(r => r.egna ? [r.egna] : []);
  const all = [...elev.lessons].sort((a, b) => a.day! - b.day! || a.startMin! - b.startMin! || a.id.localeCompare(b.id));
  const vem = (l: SchemaForslagLesson) => elev.fromGroup?.has(l.id) ? 'elevens' : 'klassens';
  for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) {
    if (a.day !== b.day || b.startMin! >= a.startMin! + a.durationMin || a.startMin! >= b.startMin! + b.durationMin) continue;
    if (a.term !== null && b.term !== null && a.term !== b.term) continue;
    if (others.some(s => s.has(a.id) && s.has(b.id))) continue;
    lessons.add(a.id); lessons.add(b.id);
    // Klassens pass före elevens grupps, som i designvyn.
    const [x, y] = vem(a) === 'elevens' && vem(b) === 'klassens' ? [b, a] : [a, b];
    texter.push(`${forsta(DAGAR[a.day!])} ${klocka(Math.max(a.startMin!, b.startMin!))} krockar för eleven: ${vem(x)} ${x.title} och ${vem(y)} ${y.title} ligger samtidigt. Krocken syns inte i klassens eller gruppens schema var för sig.`);
  }
  return { lessons, texter };
}

/** Möjliga starttider som sammanhängande sträckor med samma läge per dag, för att rita raden. `to` är sista starttiden plus ett steg. */
export function lagesStrackor(positions: Pick<SchemaLagenPosition, 'day' | 'startMin' | 'state'>[], step: number): { day: number; from: number; to: number; state: SchemaLagenPosition['state'] }[] {
  const sorted = [...positions].sort((a, b) => a.day - b.day || a.startMin - b.startMin), result: { day: number; from: number; to: number; state: SchemaLagenPosition['state'] }[] = [];
  for (const p of sorted) {
    const last = result.at(-1);
    if (last && last.day === p.day && last.state === p.state && last.to === p.startMin) last.to = p.startMin + step;
    else result.push({ day: p.day, from: p.startMin, to: p.startMin + step, state: p.state });
  }
  return result;
}
