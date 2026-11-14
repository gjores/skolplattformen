/**
 * Var kan passet ligga, och varför inte här (05.2-SM-LAGEN). Motorn prövar varje starttid i veckan för ett valt pass mot övriga pass som de
 * ligger i utkastet, med samma kontrollant som kontrollen, och ger ett läge per starttid med orsaker. Här tolkas svaret strikt, löpnummer byts
 * mot namn och orsakerna blir svenska rader som i designvyn (`design/Samlingsvy.dc.html`). Inget sparas.
 * Elevnivå: motorn får elevens kluster (löpnummer), aldrig elevens ID; bara den som får se eleven kan begära den.
 */
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, parseSchemaKontrollRequest, type SchemaForslag, type SchemaForslagRequest, type SchemaKontrollRequest, type SchemaPlacement,
  type SchemaProblem } from './schema-contract.ts';
import { buildSchemaUnderlag, type SchemaBasis, type SchemaUnderlag } from './schema-underlag.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

/** Fri, bryter ett önskemål, går med ett byte, regelbrott, spärrad tid. Samma ordning som teckenförklaringen. */
export const SCHEMA_LAGEN = ['fri', 'onskemal', 'byte', 'brott', 'sparrad'] as const;
export type SchemaLage = typeof SCHEMA_LAGEN[number];
const FROM_ENGINE: Record<string, SchemaLage> = { free: 'fri', preference: 'onskemal', swap: 'byte', violation: 'brott', blocked: 'sparrad' };
/** Vad en orsak gäller. `pass` är passets egna ramar (tillåtna tider, låsning, koppling). */
export type SchemaOrsakSlag = 'larare' | 'elever' | 'grupp' | 'sal' | 'amne' | 'pass';
const KIND: Record<string, SchemaOrsakSlag> = { teacher: 'larare', students: 'elever', group: 'grupp', room: 'sal', activity: 'amne', lesson: 'pass' };

/** Orsakerna motorn kan ge, med vad de gäller. Okända koder nekas. */
const SPARR: Record<string, SchemaOrsakSlag> = { outside_allowed: 'pass', teacher_unavailable: 'larare', group_unavailable: 'grupp', room_unavailable: 'sal', lock_broken: 'pass' };
const BROTT: Record<string, SchemaOrsakSlag> = { teacher_clash: 'larare', student_clash: 'elever', room_clash: 'sal', teacher_day_too_long: 'larare', teacher_no_lunch: 'larare',
  student_day_too_long: 'elever', student_no_lunch: 'elever', same_day: 'amne', activity_time: 'amne', not_simultaneous: 'pass', overlap_forbidden: 'pass',
  room_count: 'pass', room_unfit: 'sal', unknown_room: 'sal', room_unwanted: 'sal' };
const ONSKEMAL = ['student_gap', 'teacher_gap', 'student_late', 'same_day_repeat', 'moved', 'room_moved'] as const;

/** Motorns svar efter tolkning: löpnummer för resurserna, som i underlaget. */
export type SchemaPositionsOrsak = { code: string; kind: SchemaOrsakSlag | null; resource: string | null; lessons: string[] };
export type SchemaPositions = { lesson: string; positions: { day: number; startMin: number; room: string | null; state: SchemaLage; costDelta: number; reasons: SchemaPositionsOrsak[] }[] };

/** Ruttens svar: namn i stället för löpnummer för lärare, elever, grupper, salar och ämnen. Passens löpnummer behålls, som i förslaget. */
export type SchemaLagenOrsak = { code: string; kind: SchemaOrsakSlag | null; name: string | null; lessons: string[] };
export type SchemaLagenPosition = { day: number; startMin: number; room: string | null; state: SchemaLage; costDelta: number; reasons: SchemaLagenOrsak[] };
export type SchemaLagen = { contractVersion: typeof SCHEMA_CONTRACT_VERSION; fingerprint: string; lesson: string;
  /** Lägena räknade för en elev: elevernas brott gäller bara den eleven. */
  elev: boolean; positions: SchemaLagenPosition[] };
/** Begäran: kontrollens underlag och placeringar, passet och eventuellt en elev (appens ID; stannar på servern). */
export type SchemaLagenRequest = SchemaKontrollRequest & { lesson: string; pupilId: string | null };

const LIMIT = { positions: 7 * 288, reasons: 2000, lessons: 2000 } as const;
const LESSON = /^pass-\d{1,6}$/u, ROOM = /^sal-\d{1,3}$/u, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
function bad(): never { throw new SchemaContractError(); }
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) bad();
  return value as Record<string, unknown>;
}
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const r = record(value);
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
function int(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) bad();
  return value;
}
function list(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) bad();
  return value;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum) bad();
  return value;
}

export function parseSchemaLagenRequest(value: unknown): SchemaLagenRequest {
  const { lesson, pupilId, ...rest } = record(value);
  if (typeof lesson !== 'string' || !LESSON.test(lesson)) bad();
  if (pupilId !== null && (typeof pupilId !== 'string' || !UUID.test(pupilId.toLowerCase()))) bad();
  return { ...parseSchemaKontrollRequest(rest), lesson, pupilId: pupilId === null ? null : (pupilId as string).toLowerCase() };
}

/** Klustren ett pass berör, som motorn räknar dem. */
export function schemaPassKluster(problem: SchemaProblem, lesson: string): string[] {
  const groups = problem.lessons.find(l => l.id === lesson)?.groups ?? [];
  return [...new Set(groups.flatMap(g => problem.groups.find(x => x.id === g)?.clusters ?? []))];
}

/**
 * Elevens kluster i underlaget, eller `null` när eleven inte ingår i schemat. Underlaget byggs en gång till med en tvilling till eleven (samma klasser
 * och gruppmedlemskap): klustret som växer med en är elevens. Så används underlagets egen indelning, och inga löpnummer flyttas.
 */
export function schemaElevKluster(plan: TjanstPlanRead, request: Pick<SchemaForslagRequest, 'period' | 'villkor'>, basis: SchemaBasis, underlag: SchemaUnderlag, pupilId: string): string | null {
  const members = basis.members, pupil = members?.pupils.find(p => p.id === pupilId);
  if (!members || !pupil) return null;
  const twin = `${pupilId}:tvilling`;
  const more: SchemaBasis = { ...basis, members: { pupils: [...members.pupils, { id: twin, classIds: pupil.classIds }],
    memberships: [...members.memberships, ...members.memberships.filter(m => m.pupilId === pupilId).map(m => ({ ...m, pupilId: twin }))] } };
  const before = underlag.problem.clusters, after = buildSchemaUnderlag(plan, request, more).problem.clusters;
  if (after.length !== before.length || after.some((c, i) => c.id !== before[i].id || (c.size !== before[i].size && c.size !== before[i].size + 1))) return null;
  const grown = before.filter((c, i) => after[i].size === c.size + 1);
  return grown.length === 1 ? grown[0].id : null;
}

/** Motorns svar för ett pass: varje starttid ska ligga i skoldagen på startrutnätet, en gång, och orsakerna ska stämma med läget. */
export function parseSchemaPositions(value: unknown, problem: SchemaProblem, lesson: string): SchemaPositions {
  const s = exact(value, ['version', 'problem_id', 'lesson', 'positions']);
  const own = problem.lessons.find(l => l.id === lesson);
  if (s.version !== SCHEMA_CONTRACT_VERSION || s.problem_id !== problem.id || s.lesson !== lesson || !own) bad();
  const known: Record<SchemaOrsakSlag, Set<string>> = {
    larare: new Set(problem.teachers.map(t => t.id)), elever: new Set(problem.clusters.map(c => c.id)), grupp: new Set(problem.groups.map(g => g.id)),
    sal: new Set((problem.rooms ?? []).map(r => r.id)), amne: new Set(problem.activities.map(a => a.id)), pass: new Set() };
  const lessons = new Set(problem.lessons.map(l => l.id)), seen = new Set<string>(), grid = problem.time.start_grid_min || problem.time.step_min;
  const positions = list(s.positions, LIMIT.positions).map(raw => {
    const p = exact(raw, ['day', 'start_min', 'rooms', 'state', 'cost_delta', 'reasons']);
    const day = int(p.day, 0, problem.time.days.length - 1), frame = problem.time.days[day], startMin = int(p.start_min, frame.start_min, frame.end_min - own.duration_min);
    if ((startMin - frame.start_min) % grid !== 0 || seen.has(`${day}:${startMin}`)) bad();
    seen.add(`${day}:${startMin}`);
    const state = FROM_ENGINE[text(p.state, 20)] ?? bad();
    const rooms = list(p.rooms, 1).map(r => text(r, 10));
    if (own.rooms ? rooms.length !== 1 || !own.rooms.allowed.includes(rooms[0]) : rooms.length !== 0) bad();
    const reasons = list(p.reasons, LIMIT.reasons).map(raw => {
      const r = exact(raw, ['code', 'resource_kind', 'resource', 'lessons']), code = text(r.code, 100);
      const others = list(r.lessons, LIMIT.lessons).map(id => text(id, 100));
      if (others.some(id => id === lesson || !lessons.has(id))) bad();
      if ((ONSKEMAL as readonly string[]).includes(code)) {
        if (r.resource_kind !== null || r.resource !== null || others.length) bad();
        return { code, kind: null, resource: null, lessons: others };
      }
      const kind = KIND[text(r.resource_kind, 20)] ?? bad();
      if ((SPARR[code] ?? BROTT[code]) !== kind) bad();
      const resource = r.resource === null ? null : text(r.resource, 100);
      if (kind === 'pass' ? resource !== null : resource !== null && !known[kind].has(resource)) bad();
      return { code, kind, resource, lessons: others };
    });
    const codes = reasons.map(r => r.code), sparr = (c: string) => Object.hasOwn(SPARR, c), brott = (c: string) => Object.hasOwn(BROTT, c);
    const fits = state === 'fri' ? !codes.length
      : state === 'onskemal' ? codes.length > 0 && codes.every(c => (ONSKEMAL as readonly string[]).includes(c))
        : state === 'sparrad' ? codes.some(sparr) && codes.every(c => sparr(c) || brott(c))
          : codes.length > 0 && codes.every(brott);
    if (!fits) bad();
    return { day, startMin, room: rooms[0] ?? null, state, costDelta: int(p.cost_delta, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), reasons };
  });
  return { lesson, positions };
}

/** Ruttens svar: resurserna får namn. Elevernas orsaker namnges efter klustret (klasser och grupper), aldrig efter en elev. */
export function schemaLagen(underlag: SchemaUnderlag, reply: SchemaPositions, elev: boolean): SchemaLagen {
  const { labels } = underlag;
  const name = new Map<string, string>([...Object.entries(labels.names), ...labels.classes.map(c => [c.id, c.name] as const), ...labels.teachers.map(t => [t.id, t.name] as const),
    ...labels.rooms.map(r => [r.id, r.name] as const), ...labels.lessons.map(l => [l.activity, l.title] as const)]);
  const positions = reply.positions.map(p => {
    const seen = new Set<string>(), reasons: SchemaLagenOrsak[] = [];
    for (const r of p.reasons) {
      const named = { code: r.code, kind: r.kind, name: r.resource === null ? null : name.get(r.resource) ?? null, lessons: r.lessons };
      const key = JSON.stringify(named);
      if (!seen.has(key)) { seen.add(key); reasons.push(named); }
    }
    return { ...p, reasons };
  });
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint: underlag.fingerprint, lesson: reply.lesson, elev, positions };
}

/** Klientens tolkning av ruttens svar. */
export function parseSchemaLagen(value: unknown, fingerprint: string, lesson: string): SchemaLagen {
  const k = exact(value, ['contractVersion', 'fingerprint', 'lesson', 'elev', 'positions']);
  if (k.contractVersion !== SCHEMA_CONTRACT_VERSION || k.fingerprint !== fingerprint || k.lesson !== lesson || typeof k.elev !== 'boolean') bad();
  const seen = new Set<string>();
  const positions = list(k.positions, LIMIT.positions).map(raw => {
    const p = exact(raw, ['day', 'startMin', 'room', 'state', 'costDelta', 'reasons']);
    const day = int(p.day, 0, 6), startMin = int(p.startMin, 0, 1435);
    if (seen.has(`${day}:${startMin}`)) bad();
    seen.add(`${day}:${startMin}`);
    const state = SCHEMA_LAGEN.find(x => x === p.state) ?? bad();
    if (p.room !== null && !ROOM.test(text(p.room, 10))) bad();
    const reasons = list(p.reasons, LIMIT.reasons).map(raw => {
      const r = exact(raw, ['code', 'kind', 'name', 'lessons']), code = text(r.code, 100);
      const allowed = state === 'onskemal' ? (ONSKEMAL as readonly string[]).includes(code) : state === 'sparrad' ? Object.hasOwn(SPARR, code) || Object.hasOwn(BROTT, code)
        : state !== 'fri' && Object.hasOwn(BROTT, code);
      if (!allowed) bad();
      const kind = r.kind === null ? null : Object.values(KIND).find(x => x === r.kind) ?? bad();
      if (kind !== (SPARR[code] ?? BROTT[code] ?? null)) bad();
      const lessons = list(r.lessons, LIMIT.lessons).map(id => { const x = text(id, 100); if (!LESSON.test(x)) bad(); return x; });
      return { code, kind, name: r.name === null ? null : text(r.name, 2000), lessons };
    });
    if (state !== 'fri' && !reasons.length) bad();
    return { day, startMin, room: p.room as string | null, state, costDelta: int(p.costDelta, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), reasons };
  });
  return { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint, lesson, elev: k.elev, positions };
}

/** Det som behövs för texterna: förslagets pass och namn, och placeringarna lägena räknades mot. */
export type SchemaLagenKontext = Pick<SchemaForslag, 'lessons' | 'classes' | 'teachers' | 'rooms'> & {
  placements: SchemaPlacement[];
  /** Elevens namn på elevnivå. Visas bara för den som får se eleven. */
  elev?: string;
};

const DAGAR = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const klocka = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const forsta = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const och = (names: string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} och ${names.at(-1)}`;
const unik = <T,>(values: T[]) => [...new Set(values)];
const BROTT_TEXT: Record<string, string> = { teacher_day_too_long: 'för lång dag för läraren', teacher_no_lunch: 'läraren får ingen lunch', student_day_too_long: 'för lång dag för eleverna',
  student_no_lunch: 'eleverna får ingen lunch', same_day: 'ämnet ligger redan samma dag', activity_time: 'undervisningstiden stämmer inte med timplanen',
  not_simultaneous: 'passet ska gå samtidigt med andra pass', overlap_forbidden: 'passet får inte överlappa ett annat pass', room_count: 'ingen passande sal', room_unfit: 'salen passar inte passet',
  unknown_room: 'salen finns inte', room_unwanted: 'passet ska inte ha någon sal' };
const ONSKEMAL_TEXT: Record<string, string> = { student_gap: 'håltid för eleverna', teacher_gap: 'håltid för läraren', student_late: 'sen dag', same_day_repeat: 'samma ämne två gånger samma dag',
  moved: 'passet flyttas från sin tidigare tid', room_moved: 'passet byter sal' };

/**
 * Varför passet inte kan ligga här, som rader i designvyns tooltip: rubrik, vad som ligger i vägen per resurs, vilka av passets resurser som är lediga
 * och till sist läget ("Regelbrott: eleverna har redan ett pass."). Tider är passens undervisningstid; marginal före och efter passet anges för sig.
 */
export function varfor(lesson: string, position: SchemaLagenPosition, k: SchemaLagenKontext): string[] {
  const pass = new Map(k.lessons.map(l => [l.id, l])), at = new Map(k.placements.map(p => [p.lesson, p]));
  const klass = new Map(k.classes.map(c => [c.id, c.name])), larare = new Map(k.teachers.map(t => [t.id, t.name])), sal = new Map(k.rooms.map(r => [r.id, r.name]));
  const own = pass.get(lesson), dag = DAGAR[position.day], tid = klocka(position.startMin);
  const length = own?.durationMin ?? 0, end = position.startMin + length + (own?.marginMin ?? 0), from = position.startMin - (own?.marginBeforeMin ?? 0);
  const klasser = (ids: string[]) => ids.map(id => klass.get(id) ?? id);
  const elever = (other?: string) => {
    if (k.elev) return k.elev;
    const mine = own?.classIds ?? [], theirs = other ? pass.get(other)?.classIds ?? [] : mine, common = mine.filter(id => theirs.includes(id));
    return common.length ? och(klasser(common)) : 'Eleverna';
  };
  const tider = (id: string) => {
    const p = at.get(id), l = pass.get(id);
    if (!p || !l) return '';
    const slut = p.startMin + l.durationMin;
    const fore = l.marginBeforeMin ?? 0;
    return ` ${klocka(p.startMin)}–${klocka(slut)}${fore ? `, med marginal ${klocka(p.startMin - fore)}–${klocka(slut + l.marginMin)}` : l.marginMin ? `, med marginal till ${klocka(slut + l.marginMin)}` : ''}`;
  };
  const med = (id: string) => { const l = pass.get(id), c = l ? klasser(l.classIds) : []; return c.length ? ` med ${och(c)}` : ''; };
  const titel = (id: string) => pass.get(id)?.title ?? 'ett annat pass';
  const overlaps = (id: string) => { const p = at.get(id), l = pass.get(id); return !!p && !!l && p.day === position.day && p.startMin - (l.marginBeforeMin ?? 0) < end && from < p.startMin + l.durationMin + l.marginMin; };

  const lines = [position.state === 'fri' ? `${forsta(dag)} ${tid}` : `Varför inte ${dag} ${tid}?`];
  const reasons = position.reasons;
  // Vad som ligger i vägen, ett pass i taget: elever, lärare och sal som delas med det.
  const clashes = reasons.filter(r => r.lessons.length && r.code.endsWith('_clash'));
  for (const other of unik(clashes.flatMap(r => r.lessons))) {
    const mine = clashes.filter(r => r.lessons.includes(other));
    if (mine.some(r => r.kind === 'elever')) lines.push(`${elever(other)} har ${titel(other)}${tider(other)}.`);
    const teachers = unik(mine.filter(r => r.kind === 'larare' && r.name).map(r => r.name!));
    if (teachers.length) lines.push(`${och(teachers)} har ${titel(other)}${med(other)}${tider(other)}.`);
    const rooms = unik(mine.filter(r => r.kind === 'sal' && r.name).map(r => r.name!));
    if (rooms.length) lines.push(`${och(rooms)} används av ${titel(other)}${med(other)}${tider(other)}.`);
  }
  // Spärrar och regler som gäller dagen eller passet självt.
  for (const r of reasons) {
    const vem = r.kind === 'elever' ? elever() : r.name ?? '';
    if (r.code === 'teacher_unavailable' || r.code === 'group_unavailable' || r.code === 'room_unavailable') lines.push(`${vem} är spärrad då.`);
    else if (r.code === 'outside_allowed') lines.push('Tiden ligger utanför passets tillåtna tider.');
    else if (r.code === 'lock_broken') lines.push('Passet är låst till sin tid.');
    else if (r.code.endsWith('_no_lunch')) lines.push(`${vem} får ingen lunch ${dag}.`);
    else if (r.code.endsWith('_day_too_long')) lines.push(`${vem} får för lång dag ${dag}.`);
    else if (r.code === 'same_day') lines.push(`${own?.title ?? 'Ämnet'} ligger redan ${dag}.`);
    else if (r.code === 'activity_time') lines.push(`${own?.title ?? 'Undervisningen'} får inte timplanens tid med passet ${dag}.`);
  }
  // Passets resurser som inte nämns: lediga.
  const busy = new Set(reasons.filter(r => r.kind !== 'elever').map(r => `${r.kind}|${r.name}`)), studentsBusy = reasons.some(r => r.kind === 'elever' || r.kind === 'grupp');
  const free = [...(studentsBusy || !own ? [] : k.elev ? [k.elev] : klasser(own.classIds)), ...(own?.teacherIds ?? []).map(id => larare.get(id) ?? id).filter(n => !busy.has(`larare|${n}`)),
    ...(position.room && !busy.has(`sal|${sal.get(position.room)}`) ? [sal.get(position.room) ?? position.room] : [])];
  if (free.length) lines.push(`${och(free)} är ${free.length > 1 ? 'lediga' : 'ledig'}.`);
  if (position.state === 'fri') lines.push('Passet kan läggas här.');
  else if (position.state === 'onskemal') lines.push(`Bryter ett önskemål: ${unik(reasons.map(r => ONSKEMAL_TEXT[r.code] ?? r.code)).join(', ')}.`);
  else if (position.state === 'sparrad') lines.push('Spärrad tid.');
  else {
    const rules = unik(reasons.map(r => r.code === 'student_clash' ? (r.lessons.some(overlaps) ? 'eleverna har redan ett pass' : 'eleverna får för kort rast')
      : r.code === 'teacher_clash' ? (r.lessons.some(overlaps) ? 'läraren har redan ett pass' : 'läraren får för kort rast')
        : r.code === 'room_clash' ? 'salen är upptagen' : BROTT_TEXT[r.code] ?? 'passets regler bryts'));
    if (position.state === 'brott') lines.push(`Regelbrott: ${rules.join(', ')}.`);
    else {
      const other = unik(reasons.flatMap(r => r.lessons))[0], from = at.get(lesson);
      lines.push(`Går med ett byte: ${titel(other)}${med(other)} kan ta passets plats${from ? ` ${DAGAR[from.day]} ${klocka(from.startMin)}` : ''}.`);
    }
  }
  return lines;
}
