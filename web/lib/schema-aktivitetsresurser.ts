import { SCHEMA_LIMITS, type SchemaAktivitetsResurser, type SchemaPlacement, type SchemaProblem, type SchemaRawViolation, type SchemaSolution } from './schema-contract.ts';
import { motorProblem } from './schema-utan-sal.ts';

type Pass = SchemaProblem['lessons'][number];
type Ansvarig = NonNullable<SchemaAktivitetsResurser['ansvariga']>[number];
type Marginal = Ansvarig['marginal'];
const nollmarginal: Marginal = { before_min: 0, after_min: 0 };
type UpptagenTid = { start: number; end: number; fore: number; efter: number };

function tid(p: SchemaPlacement, l: Pass, marginal = l.margin?.teachers ?? nollmarginal): UpptagenTid {
  const end = p.startMin + l.duration_min;
  return { start: p.startMin, end, fore: Math.max(0, p.startMin - marginal.before_min), efter: end + marginal.after_min };
}

/** Samma marginalkrock som motorns oberoende kontroll. Marginaler får överlappa en annan marginal. */
export function aktivitetResurskrock(a: UpptagenTid, b: UpptagenTid, rast: number): boolean {
  return a.start < b.end + rast && b.start < a.end + rast
    || a.fore < b.end && b.start < a.efter || a.start < b.efter && b.fore < a.end;
}

const sammanslagenTid = (tider: UpptagenTid[]): [number, number][] => {
  const intervall: [number, number][] = [];
  for (const { fore, efter } of [...tider].sort((a, b) => a.fore - b.fore || a.efter - b.efter)) {
    const sista = intervall.at(-1);
    if (sista && sista[1] >= fore) sista[1] = Math.max(sista[1], efter);
    else intervall.push([fore, efter]);
  }
  return intervall;
};

function rymsOverDagen(problem: SchemaProblem, tider: UpptagenTid[], max: number | undefined): boolean {
  const lunch = problem.rules.lunch;
  const intervall = sammanslagenTid(tider);
  if (max !== undefined && intervall.reduce((summa, [a, b]) => summa + b - a, 0) > max) return false;
  if (!lunch?.teachers) return true;
  let fran = lunch.window_start_min;
  for (const [a, b] of intervall) {
    if (Math.min(a, lunch.window_end_min) - fran >= lunch.length_min) return true;
    fran = Math.max(fran, b);
  }
  return lunch.window_end_min - fran >= lunch.length_min;
}

export function aktivitetMotorsProblem(problem: SchemaProblem): SchemaProblem {
  if (!problem.aktivitetsResurser) return problem;
  const { aktivitetsResurser: _, ...motor } = problem;
  return motor;
}

const salSaknas = 'Aktiviteten saknar en ledig sal som rymmer deltagarna.';
const ansvarigSaknas = 'Aktiviteten saknar en tillgänglig ansvarig på den föreslagna tiden.';

function medAnsvarigsFonstren(l: Pass, person: Ansvarig): NonNullable<Pass['allowed']> {
  const personens = person.fonstren.map(f => ({ day: f.day, start_min: f.start_min + person.marginal.before_min, end_min: f.end_min - person.marginal.after_min }));
  const tillatna = !l.allowed?.length ? personens : l.allowed.flatMap(a => personens.flatMap(b => a.day === b.day
    ? [{ day: a.day, start_min: Math.max(a.start_min, b.start_min), end_min: Math.min(a.end_min, b.end_min) }] : []));
  return tillatna.filter(t => t.end_min - t.start_min >= l.duration_min);
}

/** Motorn använder de befintliga lärarreglerna för det explicita valet. Externa ID:n stannar i webbservern. */
export function aktivitetKontrollProblem(problem: SchemaProblem, placements: SchemaPlacement[]): { motor: SchemaProblem; violations: SchemaRawViolation[] } {
  const motor = aktivitetMotorsProblem(problem), resurser = problem.aktivitetsResurser;
  if (!resurser) return { motor, violations: [] };
  const at = new Map(placements.map(p => [p.lesson, p])), violations: SchemaRawViolation[] = [];
  const avvikelse = (l: Pass, code: string, message: string) => violations.push({ code, message, lessons: [l.id], resources: [] });
  return { motor: { ...motor, lessons: motor.lessons.map(l => {
    const val = resurser[l.id], p = at.get(l.id);
    if (!val || !p) return l;
    if (val.sal && p.room === null) avvikelse(l, 'activity_room_missing', salSaknas);
    if (!val.ansvariga) return l;
    const person = val.ansvariga.find(a => a.ref === p.ansvarig);
    if (!person) { avvikelse(l, 'activity_responsible_missing', ansvarigSaknas); return l; }
    const timmar = tid(p, l, person.marginal);
    if (!person.fonstren.some(f => f.day === p.day && f.start_min <= timmar.fore && timmar.efter <= f.end_min)) {
      avvikelse(l, 'activity_responsible_unavailable', 'Den tilldelade ansvariga är inte tillgänglig på aktivitetens tid.');
    }
    const allowed = medAnsvarigsFonstren(l, person);
    return { ...l, teachers: [...l.teachers, person.id], ...(allowed.length && { allowed }),
      margin: { students: l.margin?.students ?? nollmarginal, rooms: l.margin?.rooms ?? nollmarginal, teachers: person.marginal } };
  }) }, violations };
}

/** Tilldelar en ansvarig i den redan lagda veckan, med samma perioder, raster och marginaler som motorn. */
export function valjAktivitetsresurser(problem: SchemaProblem, solution: SchemaSolution): SchemaSolution {
  const resurser = problem.aktivitetsResurser;
  if (!resurser) return solution;
  const pass = new Map(problem.lessons.map(l => [l.id, l]));
  const personer = new Map(problem.teachers.map(t => [t.id, t]));
  const perioder = (l: Pass) => l.periods?.length ? l.periods : problem.periods?.map(p => p.id) ?? ['hela'];
  const lagda = [...solution.placements], forst = new Map(lagda.map((p, i) => [p.lesson, i]));
  const upptaget = new Map<string, UpptagenTid[]>();
  const nycklar = (id: string, p: SchemaPlacement, l: Pass) => perioder(l).map(period => `${id}/${period}/${p.day}`);
  const boka = (id: string, p: SchemaPlacement, l: Pass, marginal?: Marginal) => {
    for (const key of nycklar(id, p, l)) {
      const lista = upptaget.get(key);
      if (lista) lista.push(tid(p, l, marginal)); else upptaget.set(key, [tid(p, l, marginal)]);
    }
  };
  for (const p of lagda) {
    const l = pass.get(p.lesson)!;
    for (const id of l.teachers) boka(id, p, l);
    const ansvarig = resurser[l.id]?.ansvariga?.find(a => a.ref === resurser[l.id]?.valdAnsvarig);
    if (ansvarig) boka(ansvarig.id, p, l, ansvarig.marginal);
  }

  const ledig = (p: SchemaPlacement, l: Pass, person: Ansvarig) => {
    const timmar = tid(p, l, person.marginal);
    return person.fonstren.some(f => f.day === p.day && f.start_min <= timmar.fore && timmar.efter <= f.end_min)
      && nycklar(person.id, p, l).every(key => {
        const andras = upptaget.get(key) ?? [];
        return !andras.some(a => aktivitetResurskrock(a, timmar, problem.rules.break_min))
          && rymsOverDagen(problem, [...andras, timmar], personer.get(person.id)?.max_min_per_day);
      });
  };
  const konflikter = new Map<string, string>();
  const tilldelningar = new Map<string, string>();
  const alternativ = lagda.flatMap(p => {
    const val = resurser[p.lesson];
    if (!val) return [];
    if (val.sal && p.room === null) { konflikter.set(p.lesson, salSaknas); return []; }
    if (!val.ansvariga) return [];
    const l = pass.get(p.lesson)!;
    if (val.valdAnsvarig) { tilldelningar.set(p.lesson, val.valdAnsvarig); return []; }
    return [{ p, l, kandidater: val.ansvariga.filter(a => ledig(p, l, a)) }];
  }).sort((a, b) => a.kandidater.length - b.kandidater.length || a.p.day - b.p.day || a.p.startMin - b.p.startMin || a.p.lesson.localeCompare(b.p.lesson));
  for (const { p, l, kandidater } of alternativ) {
    const valt = kandidater.find(a => ledig(p, l, a));
    if (valt) { boka(valt.id, p, l, valt.marginal); tilldelningar.set(p.lesson, valt.ref); }
    else konflikter.set(p.lesson, ansvarigSaknas);
  }
  for (const id of solution.unplaced) {
    const val = resurser[id];
    if (val?.sal) konflikter.set(id, 'Motorn hittade ingen placering med en ledig sal som rymmer deltagarna.');
    else if (val?.ansvariga?.length === 0) konflikter.set(id, ansvarigSaknas);
  }
  const placements = lagda.filter(p => !konflikter.has(p.lesson) || resurser[p.lesson]?.valdAnsvarig !== undefined).map(p => {
    const ansvarig = tilldelningar.get(p.lesson);
    return ansvarig ? { ...p, ansvarig } : p;
  });
  const unplaced = [...solution.unplaced, ...[...konflikter.keys()].filter(id => forst.has(id) && resurser[id]?.valdAnsvarig === undefined)];
  const diagnoses = [...[...konflikter].map(([lesson, message]) => ({ code: message === ansvarigSaknas ? 'activity_responsible_missing' : 'activity_room_missing', message, proof: false, lessons: [lesson] })), ...solution.diagnoses];
  return { ...solution, placements, unplaced, diagnoses: diagnoses.slice(0, SCHEMA_LIMITS.diagnoses),
    status: solution.status === 'complete' && unplaced.length ? 'time_limit' : solution.status };
}

/** En kort reservkörning får prova andra tider enbart för flexibla aktiviteter som saknar ansvarig. */
export function aktivitetReservproblem(problem: SchemaProblem, solution: SchemaSolution): { motor: SchemaProblem; ansvariga: Map<string, string> } | null {
  const resurser = problem.aktivitetsResurser;
  const saknar = new Set(solution.diagnoses.filter(d => d.code === 'activity_responsible_missing').flatMap(d => d.lessons ?? []));
  if (!resurser || !saknar.size) return null;
  const at = new Map(solution.placements.map(p => [p.lesson, p]));
  const vald = aktivitetKontrollProblem(problem, solution.placements).motor;
  const pass = new Map(vald.lessons.map(l => [l.id, l]));
  const personPass = new Map<string, SchemaPlacement[]>();
  for (const p of solution.placements) for (const id of pass.get(p.lesson)?.teachers ?? []) {
    const tider = personPass.get(id);
    if (tider) tider.push(p); else personPass.set(id, [p]);
  }
  const ansvariga = new Map<string, string>();
  const sammaTermin = (a: Pass, b: Pass) => !a.periods?.length || !b.periods?.length || a.periods.some(p => b.periods?.includes(p));
  const lessons = vald.lessons.flatMap<Pass>(l => {
    const p = at.get(l.id);
    if (p) return [{ ...l, locked: { day: p.day, start_min: p.startMin, ...(p.room ? { rooms: [p.room] } : {}) } }];
    if (l.locked || !saknar.has(l.id) || problem.links?.some(link => link.lessons.includes(l.id) && link.lessons.some(id => id !== l.id && !at.has(id)))) return [];
    const alternativ = (resurser[l.id]?.ansvariga ?? []).flatMap(person => {
      const allowed = medAnsvarigsFonstren(l, person);
      if (!allowed.length) return [];
      const lagda = (personPass.get(person.id) ?? []).filter(p => {
        const o = pass.get(p.lesson);
        return o?.teachers.includes(person.id) && sammaTermin(l, o);
      });
      const val = allowed.reduce((antal, f) => {
        const dag = problem.time.days[f.day], grid = problem.time.start_grid_min || problem.time.step_min;
        const fram = dag.start_min + Math.max(0, Math.ceil((f.start_min - dag.start_min) / grid)) * grid;
        for (let startMin = fram; startMin + l.duration_min <= Math.min(f.end_min, dag.end_min); startMin += grid) {
          const t = tid({ lesson: l.id, day: f.day, startMin, room: null }, l, person.marginal);
          if (!lagda.some(o => o.day === f.day && aktivitetResurskrock(t, tid(o, pass.get(o.lesson)!), problem.rules.break_min))) antal++;
        }
        return antal;
      }, 0);
      return val ? [{ person, allowed, val }] : [];
    }).sort((a, b) => b.val - a.val || a.person.ref.localeCompare(b.person.ref));
    const reserv = alternativ[0];
    if (!reserv) return [];
    const { person, allowed } = reserv;
    ansvariga.set(l.id, person.ref);
    return [{ ...l, allowed, teachers: [...l.teachers, person.id], margin: { students: l.margin?.students ?? nollmarginal,
      rooms: l.margin?.rooms ?? nollmarginal, teachers: person.marginal } }];
  });
  if (!ansvariga.size) return null;
  const keep = new Set(lessons.map(l => l.id)), links = vald.links?.flatMap(l => {
    const lessons = l.lessons.filter(id => keep.has(id));
    return lessons.length > 1 ? [{ ...l, lessons }] : [];
  });
  const { reference: _, ...rest } = vald;
  return { motor: motorProblem({ ...rest, lessons, links }, solution.placements), ansvariga };
}
