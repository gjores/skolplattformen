// Samlingsvyns rena beräkningar (05.2-SM-SAMLINGSVY). Alla beläggningar räknas på hela förslaget, även när pass filtreras bort i vyn.
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, type SchemaForslag, type SchemaForslagLesson, type SchemaMembers, type SchemaPlacement, type SchemaTerm, type SchemaVillkor } from './schema-contract.ts';
import { schemaElevernasKluster } from './schema-folj.ts';
import { marginalBand } from './schema-lager.ts';
import type { SchemaOverlay } from './schema-utkast.ts';
import { resursRefs } from './schema-utkast.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

export const SAMLING_SLAG = ['klass', 'grupp', 'larare', 'sal', 'elev'] as const;
export type SamlingSlag = typeof SAMLING_SLAG[number];
export const SAMLING_NAMN: Record<SamlingSlag, string> = { klass: 'Klass', grupp: 'Grupp', larare: 'Lärare', sal: 'Sal', elev: 'Elev' };
export type SamlingResurs = { key: string; id: string; slag: SamlingSlag; name: string; lessons: string[];
  /** Beläggning för hela resursen: en grupps elever kan även vara upptagna av klassens undervisning. */
  busyLessons: string[]; size: number | null; antagen: boolean; year: string | null };
export type SamlingKluster = { size: number; antagen: boolean; lessons: string[] };
export type SchemaSamlingData = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; grundFingerprint: string; resources: SamlingResurs[]; clusters: SamlingKluster[] };
export type SamlingFilter = { subject: string; year: string; program: string; team: string; term: '' | SchemaTerm };
export const tomtSamlingFilter = (): SamlingFilter => ({ subject: '', year: '', program: '', team: '', term: '' });
export type SamlingFarg = 'amne' | 'larare' | 'sal' | 'avvikelse' | 'last';
export type SamlingArbetsvy = { id: string; name: string; resources: string[]; layers: Record<string, boolean>; filter: SamlingFilter; color: SamlingFarg; compact: boolean; day: number | null };
export type SamlingSpann = { day: number; startMin: number; endMin: number };
const unik = <T,>(xs: T[]): T[] => [...new Set(xs)];

/** Grundurvalet fungerar även innan serverns extra grupp-/elevläsning är klar. Stabil appreferens bär arbetsvyn, aldrig körningens löpnummer. */
export function samlingResurser(f: Pick<SchemaForslag, 'classes' | 'teachers' | 'rooms' | 'resurser' | 'lessons'>): SamlingResurs[] {
  const refs = resursRefs(f);
  return [
    ...f.classes.map(c => { const r = refs.get(c.id), slag = r?.slag === 'grupp' ? 'grupp' as const : 'klass' as const;
      const lessons = f.lessons.filter(l => l.classIds.includes(c.id)).map(l => l.id);
      return { key: `${slag}:${r?.ref ?? c.id}`, id: c.id, slag, name: c.name, lessons, busyLessons: lessons, size: null, antagen: false, year: null }; }),
    ...f.teachers.map(t => ({ key: `larare:${refs.get(t.id)?.ref ?? t.id}`, id: t.id, slag: 'larare' as const, name: t.name,
      lessons: f.lessons.filter(l => l.teacherIds.includes(t.id)).map(l => l.id), busyLessons: f.lessons.filter(l => l.teacherIds.includes(t.id)).map(l => l.id), size: null, antagen: false, year: null })),
    ...f.rooms.map(r => ({ key: `sal:${r.name}`, id: r.id, slag: 'sal' as const, name: r.name, lessons: [], busyLessons: [], size: null, antagen: false, year: null })),
  ];
}

/** Servern använder redan behörighetsprövat underlag. Inga elev-ID:n skickas; elevens tillfälliga löpnummer lever bara i denna läsning. Klass-/grupp-/personalreferenser bevarar arbetsvyns identitet. */
export function schemaSamlingData(plan: Pick<TjanstPlanRead, 'classes' | 'groups'>, u: SchemaUnderlag, members: SchemaMembers | null, names: Map<string, string>): SchemaSamlingData {
  const labels = u.labels, problem = u.problem, classCount = plan.classes.length;
  const ofGroups = (ids: string[]) => problem.lessons.filter(l => l.groups.some(g => ids.includes(g))).map(l => l.id);
  const kluster = schemaElevernasKluster(plan, u, members);
  const classYear = (n: number) => { const col = plan.classes[n]?.link?.column; return col && /^(ak|ar)\d+$/u.test(col) ? `${col.startsWith('ak') ? 'Årskurs' : 'År'} ${col.replace(/\D/gu, '')}` : null; };
  const resources: SamlingResurs[] = problem.groups.map((g, i) => {
    const klass = i < classCount, sourceId = Object.entries(u.groupRefs).find(([, id]) => id === g.id)?.[0];
    const source = klass ? plan.classes[i] : (plan.groups ?? []).find(x => x.groupId === sourceId);
    const id = klass ? (source as TjanstPlanRead['classes'][number] | undefined)?.classId : (source as NonNullable<TjanstPlanRead['groups']>[number] | undefined)?.groupId;
    const slag = klass ? 'klass' as const : 'grupp' as const;
    const overlapping = problem.groups.filter(other => other.clusters.some(c => g.clusters.includes(c))).map(x => x.id);
    return { key: id ? `${slag}:${id}` : `tillfallig-grupp:${g.id}`, id: g.id, slag, name: labels.names[g.id] ?? labels.classes.find(c => c.id === g.id)?.name ?? g.id,
      lessons: klass ? labels.lessons.filter(l => l.classIds.includes(g.id)).map(l => l.id) : ofGroups([g.id]), busyLessons: ofGroups(overlapping), size: g.clusters.reduce((sum, c) => sum + (problem.clusters.find(x => x.id === c)?.size ?? 0), 0),
      antagen: kluster === null || g.clusters.some(c => problem.clusters.findIndex(x => x.id === c) >= kluster.real), year: klass ? classYear(i) : null };
  });
  resources.push(...labels.teachers.map((t, i) => ({ key: `larare:${u.resurser.larare[i]?.ref ?? t.id}`, id: t.id, slag: 'larare' as const, name: t.name,
    lessons: problem.lessons.filter(l => l.teachers.includes(t.id)).map(l => l.id), busyLessons: problem.lessons.filter(l => l.teachers.includes(t.id)).map(l => l.id), size: null, antagen: false, year: null })));
  resources.push(...labels.rooms.map(r => ({ key: `sal:${r.name}`, id: r.id, slag: 'sal' as const, name: r.name, lessons: [], busyLessons: [], size: null, antagen: false, year: null })));
  // Även en grupp utan egna schemapass kan väljas. Dess elever kan redan vara upptagna av klassens undervisning.
  for (const [i, group] of (plan.groups ?? []).entries()) if (!resources.some(r => r.key === `grupp:${group.groupId}`)) {
    const from = u.time.terms[u.terms[0]]?.span?.start, to = u.time.terms[u.terms.at(-1)!]?.span?.end;
    const pupils = unik((members?.memberships ?? []).filter(m => m.groupId === group.groupId && (from === undefined || to === undefined || m.startsOn <= to && (m.endsOn === null || m.endsOn >= from))).map(m => m.pupilId));
    const ids = new Set(kluster ? pupils.flatMap(p => kluster.of.has(p) ? [kluster.of.get(p)!] : []) : []);
    const groups = kluster ? problem.groups.filter(g => g.clusters.some(c => ids.has(c))).map(g => g.id)
      : group.classIds.flatMap(id => { const n = plan.classes.findIndex(c => c.classId === id); return n >= 0 ? [`grupp-${n + 1}`] : []; });
    resources.push({ key: `grupp:${group.groupId}`, id: `grupp-tom-${i + 1}`, slag: 'grupp', name: group.name, lessons: [], busyLessons: ofGroups(groups), size: kluster ? ids.size ? pupils.filter(p => kluster.of.has(p)).length : 0 : null, antagen: kluster === null, year: null });
  }
  if (kluster) {
    let i = 0;
    for (const [pupil, cluster] of kluster.of) if (names.has(pupil)) {
      i++; const ids = problem.groups.filter(g => g.clusters.includes(cluster)).map(g => g.id);
      resources.push({ key: `elev:${i}`, id: `elev-${i}`, slag: 'elev', name: names.get(pupil)!, lessons: ofGroups(ids), busyLessons: ofGroups(ids), size: 1, antagen: false, year: null });
    }
  }
  const clusters = problem.clusters.map((c, i) => ({ size: c.size, antagen: kluster === null || i >= kluster.real,
    lessons: ofGroups(problem.groups.filter(g => g.clusters.includes(c.id)).map(g => g.id)) }));
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: u.grundFingerprint, resources, clusters };
}

/** Svaret prövas mot förslaget; okända pass eller elev-ID:n kan inte läggas in genom ett svagt lässvar. */
export function parseSamlingData(raw: unknown, f: Pick<SchemaForslag, 'grundFingerprint' | 'lessons'>): SchemaSamlingData {
  const bad = (): never => { throw new SchemaContractError(); };
  const obj = (x: unknown, keys: string[]): Record<string, unknown> => {
    if (!x || typeof x !== 'object' || Array.isArray(x) || Object.keys(x).length !== keys.length || keys.some(k => !Object.hasOwn(x, k))) return bad();
    return x as Record<string, unknown>;
  };
  const text = (x: unknown, max = 200): string => typeof x === 'string' && x.length > 0 && x.length <= max ? x : bad();
  const count = (x: unknown): number => typeof x === 'number' && Number.isSafeInteger(x) && x >= 0 && x <= 100000 ? x : bad();
  const ids = new Set(f.lessons.map(l => l.id));
  const list = (x: unknown): string[] => !Array.isArray(x) || x.length > 20000 || x.some(v => typeof v !== 'string' || !ids.has(v)) || new Set(x).size !== x.length ? bad() : x as string[];
  const r = obj(raw, ['contractVersion', 'grundFingerprint', 'resources', 'clusters']);
  if (r.contractVersion !== SCHEMA_CONTRACT_VERSION || r.grundFingerprint !== f.grundFingerprint || !Array.isArray(r.resources) || r.resources.length > 20000 || !Array.isArray(r.clusters) || r.clusters.length > 20000) bad();
  const resources = (r.resources as unknown[]).map(x => {
    const a = obj(x, ['key', 'id', 'slag', 'name', 'lessons', 'busyLessons', 'size', 'antagen', 'year']);
    const slag = SAMLING_SLAG.includes(a.slag as SamlingSlag) ? a.slag as SamlingSlag : bad();
    if (typeof a.antagen !== 'boolean' || slag === 'elev' && (!/^elev:\d+$/u.test(String(a.key)) || !/^elev-\d+$/u.test(String(a.id)))) bad();
    return { key: text(a.key, 2100), id: text(a.id), slag, name: text(a.name), lessons: list(a.lessons), busyLessons: list(a.busyLessons), size: a.size === null ? null : count(a.size), antagen: a.antagen as boolean, year: a.year === null ? null : text(a.year) };
  });
  if (new Set(resources.map(x => x.key)).size !== resources.length) bad();
  const clusters = (r.clusters as unknown[]).map(x => { const c = obj(x, ['size', 'antagen', 'lessons']); if (typeof c.antagen !== 'boolean') bad(); return { size: count(c.size), antagen: c.antagen as boolean, lessons: list(c.lessons) }; });
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources, clusters };
}

/** Salens rad följer utkastets nuvarande sal; övriga resurser har sin medlemslista från servern. */
export function samlingPass(r: SamlingResurs, lessons: SchemaForslagLesson[], term: SchemaTerm): SchemaForslagLesson[] {
  const ids = new Set(r.lessons);
  return lessons.filter(l => (l.term === null || l.term === term) && (r.slag === 'sal' ? l.roomId === r.id : ids.has(l.id)));
}
const union = (xs: [number, number][]): [number, number][] => {
  const out: [number, number][] = [];
  for (const [a, b] of xs.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])) { const last = out.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
  return out;
};
export function friaSpann(from: number, to: number, busy: [number, number][]): [number, number][] {
  let at = from; const out: [number, number][] = [];
  for (const [a, b] of union(busy)) { if (b <= at || a >= to) continue; if (a > at) out.push([at, Math.min(a, to)]); at = Math.max(at, b); }
  if (at < to) out.push([at, to]); return out;
}

/** Bara resursens egna hårda tidsvillkor avgör ledighet. Ett ämnesfönster ska inte göra läraren upptagen för alla andra ämnen. */
export function samlingTidsvillkor(r: SamlingResurs, v: SchemaVillkor): SchemaOverlay[] {
  const ref = r.slag === 'sal' ? r.name : r.key.slice(r.key.indexOf(':') + 1);
  const rules = v.egna.filter((x): x is typeof x & { typ: 'sparrad' | 'tillaten'; days: number[]; startMin: number; endMin: number } => x.slag === r.slag && x.ref === ref && (x.typ === 'sparrad' || x.typ === 'tillaten'));
  const out: SchemaOverlay[] = rules.filter(x => x.typ === 'sparrad').flatMap(x => x.days.filter(d => !!v.days[d]).map(day => ({ day, startMin: x.startMin, endMin: x.endMin, kind: 'sparrad' as const, label: `Spärrad tid · ${r.name}` })));
  const allowed = rules.filter(x => x.typ === 'tillaten');
  if (allowed.length) for (const [day, d] of v.days.entries()) out.push(...friaSpann(d.startMin, d.endMin, allowed.filter(x => x.days.includes(day)).map(x => [x.startMin, x.endMin])).map(([startMin, endMin]) => ({ day, startMin, endMin, kind: 'tillaten-ute' as const, label: `Utanför tillåten tid · ${r.name}` })));
  return out;
}

/** Upptagen tid omfattar marginalerna och resursens hårda tidsvillkor, aldrig vyns filter. */
export function samlingUpptagen(r: SamlingResurs, f: SchemaForslag, v: SchemaVillkor, term: SchemaTerm, day: number): [number, number][] {
  const busyIds = new Set(r.busyLessons);
  const lessons = (r.slag === 'sal' ? samlingPass(r, f.lessons, term) : f.lessons.filter(l => busyIds.has(l.id) && (l.term === null || l.term === term))).filter(l => l.day === day && l.startMin !== null);
  const del = r.slag === 'larare' ? 'larare' : r.slag === 'sal' ? 'sal' : 'elever';
  const busy: [number, number][] = lessons.map(l => { const bands = marginalBand(v, f, l, del), before = Math.max(0, ...bands.filter(b => b.side === 'fore').map(b => b.minutes)), after = Math.max(0, ...bands.filter(b => b.side === 'efter').map(b => b.minutes));
    return [l.startMin! - before, l.startMin! + l.durationMin + after]; });
  busy.push(...samlingTidsvillkor(r, v).filter(o => o.day === day).map(o => [o.startMin, o.endMin] as [number, number]));
  return union(busy);
}
export function gemensamLedigTid(resources: SamlingResurs[], f: SchemaForslag, v: SchemaVillkor, term: SchemaTerm): SamlingSpann[] {
  if (resources.length < 2) return [];
  return v.days.flatMap((d, day) => friaSpann(d.startMin, d.endMin, resources.flatMap(r => samlingUpptagen(r, f, v, term, day))).map(([startMin, endMin]) => ({ day, startMin, endMin })));
}
export function samlingHal(r: SamlingResurs, f: SchemaForslag, v: SchemaVillkor, term: SchemaTerm): SamlingSpann[] {
  return v.days.flatMap((_, day) => { const b = samlingUpptagen(r, f, v, term, day); if (b.length < 2) return [];
    return friaSpann(b[0][0], b.at(-1)![1], b).map(([startMin, endMin]) => ({ day, startMin, endMin })); });
}
/** Lunchtryck är en beräknad första fri lunch per elevkluster, ingen bokad lunch. Varje elev räknas bara en gång, även vid samläsning. */
export function lunchTryck(clusters: SamlingKluster[], f: SchemaForslag, v: SchemaVillkor, term: SchemaTerm): { slots: (SamlingSpann & { pupils: number; antagna: number })[]; utanLunch: number } {
  if (!v.lunch) return { slots: [], utanLunch: 0 };
  const { startMin, endMin, lengthMin } = v.lunch, slots: (SamlingSpann & { pupils: number; antagna: number })[] = []; let utanLunch = 0;
  for (const c of clusters) for (let day = 0; day < v.days.length; day++) {
    const ids = new Set(c.lessons), lessons = f.lessons.filter(l => ids.has(l.id) && (l.term === null || l.term === term) && l.day === day && l.startMin !== null);
    if (!lessons.length) continue;
    const open = friaSpann(startMin, endMin, lessons.map(l => { const bands = marginalBand(v, f, l, 'elever'), before = Math.max(0, ...bands.filter(b => b.side === 'fore').map(b => b.minutes)), after = Math.max(0, ...bands.filter(b => b.side === 'efter').map(b => b.minutes)); return [l.startMin! - before, l.startMin! + l.durationMin + after]; }));
    const lunch = open.find(([a, b]) => Math.ceil(a / 5) * 5 + lengthMin <= b);
    if (!lunch) { utanLunch += c.size; continue; }
    const from = Math.ceil(lunch[0] / 5) * 5;
    for (let at = from; at < from + lengthMin; at += 5) { const s = slots.find(s => s.day === day && s.startMin === at); if (s) { s.pupils += c.size; if (c.antagen) s.antagna += c.size; } else slots.push({ day, startMin: at, endMin: at + 5, pupils: c.size, antagna: c.antagen ? c.size : 0 }); }
  }
  return { slots: slots.sort((a, b) => a.day - b.day || a.startMin - b.startMin), utanLunch };
}
/** Personalens ämneskoppling är ett uppdrag i tjänstefördelningen, inget bevis på legitimation eller undervisningsbehörighet. */
export function ledigaResurser(resources: SamlingResurs[], f: SchemaForslag, v: SchemaVillkor, term: SchemaTerm, when: SamlingSpann, subject = ''): (SamlingResurs & { undervisar: boolean })[] {
  if (!Number.isInteger(when.day) || !Number.isFinite(when.startMin) || !Number.isFinite(when.endMin) || when.endMin <= when.startMin) return [];
  return resources.filter(r => (r.slag === 'larare' || r.slag === 'sal') && v.days[when.day] && when.startMin >= v.days[when.day].startMin && when.endMin <= v.days[when.day].endMin
    && !samlingUpptagen(r, f, v, term, when.day).some(([a, b]) => a < when.endMin && when.startMin < b))
    .map(r => ({ ...r, undervisar: r.slag === 'larare' && !!subject && samlingPass(r, f.lessons, term).some(l => l.title === subject) }))
    .sort((a, b) => Number(b.undervisar) - Number(a.undervisar) || a.name.localeCompare(b.name, 'sv'));
}
/** Kombinerbara filter begränsar enbart visningen, aldrig beläggning eller kontroll. Okänd metadata gissas inte från namn. */
export function filtreraSamling(lessons: SchemaForslagLesson[], filter: SamlingFilter, resources: SamlingResurs[]): SchemaForslagLesson[] {
  const yearIds = new Set(resources.filter(r => r.year === filter.year).flatMap(r => r.lessons));
  return lessons.filter(l => (!filter.subject || l.title === filter.subject) && (!filter.term || l.term === null || l.term === filter.term) && (!filter.year || yearIds.has(l.id)));
}
/** Arbetsvyer får aldrig bära elevval, elevnamn eller elev-ID. Även okända fält stryks före localStorage. */
export function sakerArbetsvy(v: SamlingArbetsvy): SamlingArbetsvy {
  const layers = Object.fromEntries(Object.entries(v.layers).filter(([k, on]) => ['sparrad', 'tillaten', 'lunch', 'marginal', 'salar', 'sena', 'haltid', 'lunchtryck'].includes(k) && typeof on === 'boolean'));
  return { id: v.id.slice(0, 80), name: v.name.trim().slice(0, 80), resources: unik(v.resources.filter(k => /^(klass|grupp|larare|sal):/u.test(k))).slice(0, 100), layers,
    filter: { subject: v.filter.subject.slice(0, 200), year: v.filter.year.slice(0, 80), program: '', team: '', term: v.filter.term === 'ht' || v.filter.term === 'vt' ? v.filter.term : '' },
    color: ['amne', 'larare', 'sal', 'avvikelse', 'last'].includes(v.color) ? v.color : 'amne', compact: !!v.compact, day: v.day !== null && Number.isInteger(v.day) && v.day >= 0 && v.day < 5 ? v.day : null };
}
export const arbetsvyNyckel = (unitId: string) => `schema-arbetsvyer:${unitId}`;
export function lasArbetsvyer(storage: Pick<Storage, 'getItem'>, unitId: string): SamlingArbetsvy[] {
  try { const xs: unknown = JSON.parse(storage.getItem(arbetsvyNyckel(unitId)) ?? '[]');
    if (!Array.isArray(xs)) return [];
    return xs.slice(0, 40).flatMap(x => { try { const v = sakerArbetsvy(x as SamlingArbetsvy); return v.id && v.name ? [v] : []; } catch { return []; } });
  } catch { return []; }
}
export function skrivArbetsvyer(storage: Pick<Storage, 'setItem'>, unitId: string, values: SamlingArbetsvy[]): boolean {
  try { storage.setItem(arbetsvyNyckel(unitId), JSON.stringify(values.slice(0, 40).map(sakerArbetsvy))); return true; } catch { return false; }
}

/** Applicera en aktuell placeringslista; pass utan placering ligger på viloytan. */
export function samlingForslag(f: SchemaForslag, placements: SchemaPlacement[]): SchemaForslag {
  const at = new Map(placements.map(p => [p.lesson, p]));
  return { ...f, lessons: f.lessons.map(l => { const p = at.get(l.id); return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null }; }) };
}
