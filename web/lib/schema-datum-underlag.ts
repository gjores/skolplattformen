/** Serverintern, datumexakt deltagarprojektion. Bara anonymt motorproblem lämnar denna modell. */
import type { TjanstPlanRead } from './tjanst-contract.ts';
import type { SchemaForslag, SchemaInterval, SchemaPlacement, SchemaProblem, SchemaRegel } from './schema-contract.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
import { SchemaDatumError, kontrolleraSchemaDatum, schemaDatumDate, schemaDatumOriginal, schemaDatumTermTillaten, schemaDatumTillfallen, type SchemaDatumAndring, type SchemaDatumAvvikelse, type SchemaDatumTillfalle } from './schema-datum.ts';
import { schemaWeekday } from './schema-vecka.ts';
import { schemaSvenskaPrognosKluster } from './schema-svenska-prognos.ts';

type Period = { startsOn: string; endsOn: string | null };
export type SchemaDatedBasis = { unitId: string; schoolYear: number; complete: boolean;
  placements: ({ id: string; pupilId: string } & Period)[];
  classMemberships: ({ placementId: string; pupilId: string; classId: string } & Period)[];
  groups: ({ id: string; active: boolean } & Period)[];
  memberships: ({ groupId: string; pupilId: string } & Period)[] };
export type SchemaDatumDagUnderlag = { date: string; problem: SchemaProblem; placements: SchemaPlacement[]; occurrences: Map<string, SchemaDatumTillfalle>;
  groupIdsByRef: ReadonlyMap<string, string>; pupilsByGroup: ReadonlyMap<string, ReadonlySet<string>> };
export type SchemaDatumUnderlag = { datedOverrides: SchemaDatumAndring[]; days: SchemaDatumDagUnderlag[]; sources: { lesson: string; ref: string }[]; violations: SchemaDatumAvvikelse[] };
const fail = (reason: ConstructorParameters<typeof SchemaDatumError>[0] = 'schema_datum_source_unknown'): never => { throw new SchemaDatumError(reason); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const uuid = (value: unknown): string => typeof value === 'string' && UUID.test(value) ? value : fail();
const exact = (r: Record<string, unknown>, keys: string[]) => { if (Object.keys(r).sort().join() !== [...keys].sort().join()) fail(); };
const array = (value: unknown): unknown[] => Array.isArray(value) && value.length <= 200_000 ? value : fail();
const active = (period: Period, date: string) => period.startsOn <= date && (period.endsOn === null || period.endsOn >= date);
/** Detta kuvert är serverinternt och får aldrig skickas till webbläsaren eller motorn. */
export function parseSchemaDatedBasis(value: unknown, scope: { unitId: string; schoolYear: number }): SchemaDatedBasis {
  const r = object(value); exact(r, ['unitId', 'schoolYear', 'complete', 'placements', 'classMemberships', 'groups', 'memberships']);
  if (uuid(r.unitId) !== scope.unitId || r.schoolYear !== scope.schoolYear || typeof r.complete !== 'boolean') fail();
  const period = (x: Record<string, unknown>): Period => {
    const p = { startsOn: schemaDatumDate(x.startsOn), endsOn: x.endsOn === null ? null : schemaDatumDate(x.endsOn) };
    if (p.endsOn !== null && p.endsOn < p.startsOn) fail(); return p;
  };
  const placements = array(r.placements).map(raw => { const x = object(raw); exact(x, ['id', 'pupilId', 'startsOn', 'endsOn']); return { id: uuid(x.id), pupilId: uuid(x.pupilId), ...period(x) }; });
  const placementById = new Map(placements.map(p => [p.id, p])); if (placementById.size !== placements.length) fail();
  const classMemberships = array(r.classMemberships).map(raw => {
    const x = object(raw); exact(x, ['placementId', 'pupilId', 'classId', 'startsOn', 'endsOn']);
    const c = { placementId: uuid(x.placementId), pupilId: uuid(x.pupilId), classId: uuid(x.classId), ...period(x) };
    if (placementById.get(c.placementId)?.pupilId !== c.pupilId) fail(); return c;
  });
  const groups = array(r.groups).map(raw => {
    const x = object(raw); exact(x, ['id', 'active', 'startsOn', 'endsOn']); if (typeof x.active !== 'boolean') fail();
    return { id: uuid(x.id), active: x.active as boolean, ...period(x) };
  });
  if (new Set(groups.map(g => g.id)).size !== groups.length) fail();
  const groupIds = new Set(groups.map(g => g.id)), pupils = new Set(placements.map(p => p.pupilId));
  const memberships = array(r.memberships).map(raw => {
    const x = object(raw); exact(x, ['groupId', 'pupilId', 'startsOn', 'endsOn']);
    const m = { groupId: uuid(x.groupId), pupilId: uuid(x.pupilId), ...period(x) };
    if (!groupIds.has(m.groupId) || !pupils.has(m.pupilId)) fail(); return m;
  });
  return { unitId: scope.unitId, schoolYear: scope.schoolYear, complete: r.complete as boolean, placements, classMemberships, groups, memberships };
}

type Parts = { classes: string[]; groups: string[] };
const unique = <T,>(values: T[]): T[] => [...new Set(values)];
function datumSources(plan: TjanstPlanRead, u: SchemaUnderlag) {
  const partsBySource = new Map<string, Parts>();
  const add = (key: string, parts: Parts) => { if (partsBySource.has(key)) fail(); partsBySource.set(key, parts); };
  for (const c of plan.classes) for (const need of c.needs) add(need.sourceKey, { classes: [c.classId], groups: [] });
  for (const g of plan.groups ?? []) add(g.sourceKey, { classes: [], groups: [g.groupId] });
  const combine = (parts: Parts[]): Parts => ({ classes: unique(parts.flatMap(p => p.classes)), groups: unique(parts.flatMap(p => p.groups)) });
  const byRef = new Map<string, Parts>([...partsBySource].map(([ref, parts]) => [`undervisning:${ref}`, parts]));
  const rows = new Map(plan.rows.map(row => [row.id, row]));
  for (const joint of plan.joints) {
    const parts = joint.rowIds.map(id => partsBySource.get(rows.get(id)?.sourceKey ?? '') ?? fail());
    byRef.set(`samlasning:${joint.lineageId ?? joint.id}`, combine(parts));
  }
  for (const blockId of unique((plan.groups ?? []).flatMap(g => g.blockId ? [g.blockId] : [])))
    byRef.set(`valbart-block:${blockId}`, { classes: [], groups: (plan.groups ?? []).filter(g => g.blockId === blockId).map(g => g.groupId) });
  for (const a of u.villkor.aktiviteter ?? []) byRef.set(`aktivitet:${a.id}`, { classes: a.classRefs, groups: a.groupRefs });
  const sources = u.labels.lessons.map(l => ({ lesson: l.id, ref: l.egenAktivitet ? `aktivitet:${l.egenAktivitet.id}` : u.labels.activities.find(a => a.id === l.activity)?.ref ?? fail() }));
  const byLesson = new Map(sources.map(s => [s.lesson, { ref: s.ref, parts: byRef.get(s.ref) ?? fail() }]));
  return { sources, byLesson };
}

type Span = [number, number];
type TimeRule = Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }>;
export function schemaDatumTillganglighet(rules: TimeRule[], day: number): SchemaInterval[] {
  let spans: Span[] = [[0, 1440]];
  for (const key of unique(rules.filter(r => r.typ === 'tillaten').map(r => JSON.stringify([r.slag, r.ref])))) {
    const open = rules.filter(r => r.typ === 'tillaten' && JSON.stringify([r.slag, r.ref]) === key && r.days.includes(day));
    spans = spans.flatMap(([a, b]) => open.map(r => [Math.max(a, r.startMin), Math.min(b, r.endMin)] as Span)).filter(([a, b]) => a < b);
  }
  for (const r of rules.filter(r => r.typ === 'sparrad' && r.days.includes(day)))
    spans = spans.flatMap(([a, b]): Span[] => [[a, Math.min(b, r.startMin)], [Math.max(a, r.endMin), b]]).filter(([a, b]) => a < b);
  return spans.map(([start_min, end_min]) => ({ day, start_min, end_min }));
}

/** Bevarar den årsbyggda passidentiteten. Ett begränsat datumurval ritar färre dagar men kontrollerar fortfarande alla ändringar. */
export function schemaDatumUnderlag(plan: TjanstPlanRead, u: SchemaUnderlag, f: SchemaForslag, basis: SchemaDatedBasis,
  overrides: SchemaDatumAndring[], extraDates: string[] = [], behallDeltagare = false, urval: 'allaAndringar' | 'valdaDatum' = 'allaAndringar', excluded?: ReadonlySet<string>): SchemaDatumUnderlag {
  if (basis.unitId !== f.unitId || basis.schoolYear !== f.schoolYear || !basis.complete) fail('schema_datum_participants_unavailable');
  if (!f.time.calendar) fail('schema_datum_calendar_missing');
  const datedOverrides = kontrolleraSchemaDatum(f, overrides);
  const dates = unique([...extraDates.map(schemaDatumDate), ...(urval === 'allaAndringar' ? datedOverrides.flatMap(a => [a.originalDate, a.date]) : [])]).sort();
  if (dates.length > 366) fail('schema_datum_invalid');
  const { sources, byLesson } = datumSources(plan, u), classIds = new Set(plan.classes.map(c => c.classId)), planGroups = plan.groups ?? [];
  const groupBasis = new Map(basis.groups.map(g => [g.id, g]));
  if (planGroups.some(g => !groupBasis.has(g.groupId))) fail();
  const refs = [...plan.classes.map(c => c.classId), ...planGroups.map(g => g.groupId)], ids = new Map(refs.map((ref, i) => [ref, `grupp-${i + 1}`]));
  if (ids.size !== refs.length) fail();
  const groupOpen = (id: string, date: string) => { const g = groupBasis.get(id); return Boolean(g?.active && active(g, date)); };
  for (const a of datedOverrides) {
    const parts = byLesson.get(a.lesson)?.parts ?? fail();
    if (parts.groups.some(id => !groupOpen(id, a.originalDate) || !groupOpen(id, a.date))) fail('schema_datum_date_invalid');
  }
  const weekly = new Map(u.problem.lessons.map(l => [l.id, l]));
  const days = dates.map(date => {
    const calendarDay = f.time.calendar!.days.find(d => d.date === date), day = schemaWeekday(date);
    if (!calendarDay || !schemaDatumTermTillaten(f.period, calendarDay.term) || !calendarDay.schoolDay || day > 4) fail('schema_datum_date_invalid');
    const validPlacements = new Map(basis.placements.filter(p => active(p, date)).map(p => [p.id, p.pupilId]));
    const registered = new Set(validPlacements.values()), ofPupil = new Map<string, Set<string>>();
    const mark = (pupil: string, ref: string) => { const id = ids.get(ref); if (id) ofPupil.set(pupil, (ofPupil.get(pupil) ?? new Set()).add(id)); };
    for (const c of basis.classMemberships) if (classIds.has(c.classId) && active(c, date) && validPlacements.get(c.placementId) === c.pupilId) mark(c.pupilId, c.classId);
    for (const m of basis.memberships) if (registered.has(m.pupilId) && active(m, date) && groupOpen(m.groupId, date)) mark(m.pupilId, m.groupId);
    const signatures = new Map<string, { groups: string[]; size: number }>();
    const pupilsByGroup = new Map<string, Set<string>>(behallDeltagare ? [...ids.values()].map(id => [id, new Set<string>()]) : []);
    for (const [pupil, groups] of ofPupil) {
      if (behallDeltagare) for (const id of groups) pupilsByGroup.get(id)!.add(pupil);
      const sorted = [...groups].sort(), key = sorted.join('|'), signature = signatures.get(key) ?? { groups: sorted, size: 0 };
      signature.size++; signatures.set(key, signature);
    }
    const clusters: SchemaProblem['clusters'] = [], groups = refs.map(ref => ({ id: ids.get(ref)!, clusters: [] as string[] })), groupsById = new Map(groups.map(g => [g.id, g]));
    for (const key of [...signatures.keys()].sort()) {
      const s = signatures.get(key)!, id = `kluster-${clusters.length + 1}`; clusters.push({ id, size: s.size });
      for (const group of s.groups) groupsById.get(group)!.clusters.push(id);
    }
    for (const { classId, groupIds } of schemaSvenskaPrognosKluster(planGroups.filter(g => groupOpen(g.groupId, date)), classIds)) {
      const id = `kluster-${clusters.length + 1}`;
      clusters.push({ id, size: 1 });
      for (const ref of [classId, ...groupIds]) groupsById.get(ids.get(ref)!)!.clusters.push(id);
    }
    const actual = schemaDatumTillfallen(f, { mode: 'intervall', monday: '', from: date, to: date }, datedOverrides).filter(o => {
      const parts = byLesson.get(o.lesson.id)?.parts ?? fail();
      return !excluded?.has(o.key) && (Boolean(o.lesson.egenAktivitet) || parts.groups.every(id => groupOpen(id, date)));
    });
    const occurrences = new Map(actual.map((o, i) => [`tillfalle-${i + 1}`, o])), placements: SchemaPlacement[] = [];
    const lessons = [...occurrences].map(([id, occurrence]) => {
      const original = weekly.get(occurrence.lesson.id) ?? fail(), source = byLesson.get(occurrence.lesson.id) ?? fail();
      const mine = unique([...source.parts.classes, ...source.parts.groups.flatMap(ref => planGroups.find(g => g.groupId === ref)?.classIds ?? [])]);
      const persons = occurrence.lesson.teacherIds.map(id => u.teacherRefs[id] ?? fail());
      const rules = u.villkor.egna.filter((r): r is TimeRule => (r.typ === 'sparrad' || r.typ === 'tillaten') && (r.slag === 'amne' && r.ref === occurrence.lesson.title
        || r.slag === 'klass' && mine.includes(r.ref) || r.slag === 'grupp' && source.parts.groups.includes(r.ref) || r.slag === 'larare' && persons.includes(r.ref)));
      const { locked: _locked, periods: _periods, allowed: _allowed, ...remaining } = original;
      const ansvarig = u.problem.aktivitetsResurser?.[occurrence.lesson.id]?.ansvariga?.find(a => a.ref === occurrence.lesson.ansvarig);
      const tom = { before_min: 0, after_min: 0 };
      // Samma datum delar period, även när en höstundervisning flyttas till våren. Timplansavvikelsen redovisas separat.
      placements.push({ lesson: id, day, startMin: occurrence.lesson.startMin!, room: occurrence.lesson.roomId });
      return { ...remaining, id, duration_min: occurrence.length, groups: unique([...source.parts.classes, ...source.parts.groups]).map(ref => ids.get(ref) ?? fail()),
        ...(ansvarig && { teachers: [...remaining.teachers, ansvarig.id], margin: { students: remaining.margin?.students ?? tom, rooms: remaining.margin?.rooms ?? tom, teachers: ansvarig.marginal } }),
        ...(rules.length ? { allowed: schemaDatumTillganglighet(rules, day) } : {}) };
    });
    const links: NonNullable<SchemaProblem['links']> = [];
    for (const link of u.problem.links ?? []) {
      const linked = [...occurrences].filter(([, o]) => link.lessons.includes(o.lesson.id));
      if (link.kind === 'simultaneous') {
        for (const originalDate of unique(linked.map(([, o]) => o.originalDate))) {
          const together = linked.filter(([, o]) => o.originalDate === originalDate).map(([id]) => id);
          if (together.length > 1) links.push({ kind: link.kind, lessons: together });
        }
      } else for (let i = 0; i < linked.length; i++) for (let j = i + 1; j < linked.length; j++)
        if (linked[i][1].lesson.id !== linked[j][1].lesson.id) links.push({ kind: link.kind, lessons: [linked[i][0], linked[j][0]] });
    }
    const { periods: _periods, reference: _reference, links: _links, aktivitetsResurser: _resurser, student_day_balance: _veckomal, weights, ...problem } = u.problem;
    const { student_day_balance: _veckovikt, ...datumvikter } = weights;
    return { date, occurrences, placements, groupIdsByRef: ids, pupilsByGroup,
      problem: { ...problem, id: `datum-${date}`, groups, clusters, activities: u.problem.activities.map(a => ({ id: a.id })), lessons, weights: datumvikter, ...(links.length ? { links } : {}) } };
  });
  const violations: SchemaDatumAvvikelse[] = [];
  // Ett samplaceringsvillkor får inte försvinna bara för att ena tillfället har flyttats till en annan dag.
  for (const originalDate of unique(datedOverrides.map(a => a.originalDate))) for (const link of u.problem.links ?? []) {
    if (link.kind !== 'simultaneous') continue;
    const actual = link.lessons.flatMap(lesson => {
      const original = schemaDatumOriginal(f, { lesson, originalDate }); if (!original) return [];
      const change = datedOverrides.find(a => a.lesson === lesson && a.originalDate === originalDate);
      return [{ lesson, originalDate, date: change?.date ?? originalDate, startMin: change?.startMin ?? original.lesson.startMin }];
    });
    if (actual.length > 1 && actual.some(o => o.date !== actual[0].date || o.startMin !== actual[0].startMin))
      for (const date of unique(actual.map(o => o.date))) violations.push({ date, code: 'dated_simultaneous', message: 'Tillfällen som ska gå samtidigt ligger på olika datum eller tider.',
        lessons: actual.map(o => o.lesson), occurrences: actual.map(o => `${o.lesson}@${o.originalDate}`) });
  }
  return { datedOverrides, days, sources, violations };
}
