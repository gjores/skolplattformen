/** Diagnosens verksamhetstexter och länkmål (SM-DIAGNOS). Inga egna uppgifter skickas till motorn. */
import { SCHEMA_CONTRACT_VERSION, SCHEMA_LIMITS, SchemaContractError, type SchemaDiagnosResurs, type SchemaDiagnosis, type SchemaMotorStatistics, type SchemaSearchStatistics } from './schema-contract.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
export type { SchemaDiagnosResurs, SchemaSearchStatistics } from './schema-contract.ts';
export type SchemaDiagnosAction = { target: 'villkor' | 'tjanst' | 'grupper' | 'timplan'; label: string; resourceId?: string; resource?: SchemaDiagnosResurs };
export type SchemaDiagnosFynd = { code: string; message: string; proof: boolean; lessons: string[]; resources: SchemaDiagnosResurs[]; action: SchemaDiagnosAction };

/** Appens namn och tydliga källreferenser stannar på serversidan tills svaret är behörighetsprövat. */
function resource(id: string, u: SchemaUnderlag): SchemaDiagnosResurs | null {
  const teacher = u.labels.teachers.findIndex(t => t.id === id);
  if (teacher >= 0) return { typ: 'larare', id: u.resurser.larare[teacher]?.ref ?? id, label: u.labels.teachers[teacher].name };
  // labels.classes bär även extra undervisningsgrupper för veckans resursval.
  // Källans uttryckliga gruppreferens avgör typen före den gemensamma visningslistan.
  const group = Object.entries(u.groupRefs).find(([, internal]) => internal === id)?.[0];
  const sourceGroup = group ? u.resurser.grupp.find(g => g.ref === group) : undefined;
  if (sourceGroup) return { typ: 'grupp', id: sourceGroup.ref, label: u.labels.names[id] ?? sourceGroup.name };
  const classroom = u.labels.classes.findIndex(t => t.id === id);
  if (classroom >= 0 && classroom < u.resurser.klass.length) return { typ: 'klass', id: u.resurser.klass[classroom].ref, label: u.labels.classes[classroom].name };
  // En separat grupp härledd ur ett undervisningsbehov har ingen egen grupprad.
  const teaching = group ? u.labels.activities.find(a => a.id === group) : undefined;
  if (teaching) return { typ: 'undervisning', id: teaching.title, label: teaching.title };
  const room = u.labels.rooms.find(r => r.id === id);
  if (room) return { typ: 'sal', id: room.name, label: room.name };
  const activity = u.labels.activities.find(a => a.id === id);
  if (activity) return { typ: 'undervisning', id: activity.title, label: activity.title };
  // Ett elevkluster är en tillfällig, anonym samling med gemensamma medlemskap.
  if (u.problem.clusters.some(c => c.id === id)) return { typ: 'grupp', id, label: u.labels.names[id] ?? 'Elever med samma gruppmedlemskap' };
  return null;
}
function named(message: string, u: SchemaUnderlag): string {
  const names = new Map<string, string>([...Object.entries(u.labels.names), ...u.labels.classes.map(c => [c.id, c.name] as const),
    ...u.labels.teachers.map(t => [t.id, t.name] as const), ...u.labels.rooms.map(r => [r.id, r.name] as const),
    ...u.labels.lessons.flatMap(l => [[l.id, l.title], [l.activity, l.title]] as [string, string][])]);
  return message.replace(/\b(?:grupp|kluster|larare|pass|behov|sal)-\d+\b/giu, id => names.get(id.toLowerCase()) ?? id);
}
export function diagnosAction(code: string, resources: SchemaDiagnosResurs[]): SchemaDiagnosAction {
  const r = resources[0];
  if (code === 'more_diagnoses') return { target: 'villkor', label: 'Rätta de visade punkterna och kontrollera igen' };
  if (code === 'group_without_teacher') return { target: 'tjanst', label: 'Tilldela lärare i tjänstefördelningen' };
  if (code === 'indivisible_time' || code === 'activity_time' || code === 'too_short') return { target: 'villkor', label: 'Se över passlängd och antal pass', ...(r ? { resourceId: r.id, resource: r } : {}) };
  if (r?.id.startsWith('kluster-')) return { target: 'grupper', label: 'Se över elevernas gruppmedlemskap' };
  if (code === 'no_days' || code === 'no_time') return { target: 'timplan', label: 'Kontrollera timplanens tid och period' };
  return { target: 'villkor', label: code === 'no_room' || code === 'too_little_room_time' ? 'Se över salar och salskrav' : 'Se över tillgänglig tid och villkor', ...(r ? { resourceId: r.id, resource: r } : {}) };
}
/** Syntetiska motor-ID byts till appens namn; timplanens underlag kompletterar motorns fynd. */
export function schemaDiagnos(u: SchemaUnderlag, diagnoses: SchemaDiagnosis[]): SchemaDiagnosFynd[] {
  const findings = diagnoses.map(d => {
    const resources = (d.resources ?? []).flatMap(id => { const r = resource(id, u); return r ? [r] : []; });
    return { code: d.code, message: named(d.message, u), proof: d.proof, lessons: d.lessons ?? [], resources, action: diagnosAction(d.code, resources) };
  });
  for (const a of u.labels.activities) {
    if (!a.weeklyOff || findings.some(f => f.code === 'indivisible_time' && f.lessons.some(id => u.labels.lessons.some(l => l.id === id && l.activity === a.id)))) continue;
    const resources: SchemaDiagnosResurs[] = [{ typ: 'undervisning', id: a.title, label: a.title }];
    findings.push({ code: 'indivisible_time', message: `${a.title}: timplanetiden kan inte fördelas på de tillåtna passlängderna och veckodagarna. Se över passlängd eller antal pass.`, proof: true,
      lessons: u.labels.lessons.filter(l => l.activity === a.id).map(l => l.id), resources, action: diagnosAction('indivisible_time', resources) });
  }
  for (const o of u.omitted) {
    if (o.reason === 'no_time') continue; // Ingen undervisning beställd i perioden är inget fel.
    findings.push({ code: o.reason, message: `${o.title}${o.classes.length ? ` (${o.classes.join(', ')})` : ''}: ${o.reason === 'no_days' ? 'perioden saknar skoldagar.' : 'tiden räcker inte till ett pass med vald passlängd.'}`,
      proof: false, lessons: [], resources: [], action: diagnosAction(o.reason, []) });
  }
  // Rader märkta vakant kan vara schemalagda utan lärare; egna aktiviteter omfattas inte.
  const vacant = u.labels.lessons.filter(l => l.vacant && !l.egenAktivitet && !findings.some(f => f.code === 'group_without_teacher' && f.lessons.includes(l.id)));
  if (vacant.length) findings.push({ code: 'group_without_teacher', message: `${vacant.length} undervisningspass saknar utsedd lärare. Tilldela lärare i tjänstefördelningen.`, proof: false,
    lessons: vacant.map(l => l.id), resources: [], action: diagnosAction('group_without_teacher', []) });
  if (findings.length <= SCHEMA_LIMITS.diagnoses) return findings;
  // Bevara motorns eventuella översiktsnotis och redovisa även appens bortre fynd.
  // Därmed försvinner inte information bakom en tyst slice när kontroller kompletteras.
  const summaries = findings.filter(f => f.code === 'more_diagnoses');
  const details = findings.filter(f => f.code !== 'more_diagnoses').sort((a, b) => Number(b.proof) - Number(a.proof));
  const keep = SCHEMA_LIMITS.diagnoses - summaries.length - 1;
  return [...details.slice(0, keep), ...summaries, { code: 'more_diagnoses',
    message: `Ytterligare ${details.length - keep} fynd från appens sammanställning visas inte här. Rätta de visade punkterna och kontrollera igen.`, proof: false, lessons: [], resources: [], action: diagnosAction('more_diagnoses', []) }];
}
export function schemaSearchStatistics(u: SchemaUnderlag, raw?: SchemaMotorStatistics): SchemaSearchStatistics {
  if (!raw) return { lessons: [], bottlenecks: [], iterations: 0 };
  return { lessons: raw.lessons.map(l => ({ ...l, title: u.labels.lessons.find(x => x.id === l.lesson)?.title ?? 'Pass' })),
    bottlenecks: raw.bottlenecks.map(b => ({ ...b, resource: b.resource ? resource(b.resource, u) : null })), iterations: raw.iterations };
}
export const FLASKHALS: Record<string, string> = { resource_busy: 'Resursen var upptagen', linked_overlap: 'Kopplade pass överlappade', same_day: 'Pass samma dag', max_day: 'Längsta dag', lunch: 'Lunchutrymme', room_unavailable: 'Spärrad sal', room_busy: 'Salen var upptagen', room_requirement: 'Salskrav', allowed_time: 'Tillåten tid' };

/** Formen och versionen kontrolleras före visning. Råa server-/motorfel blir aldrig ett tomt lyckat svar. */
export function parseSchemaDiagnos(value: unknown): SchemaDiagnosFynd[] {
  const bad = (): never => { throw new SchemaContractError(); };
  const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad();
  const str = (v: unknown, max = 2000): string => typeof v === 'string' && v.length > 0 && v.length <= max ? v : bad();
  const arr = (v: unknown, max: number): unknown[] => Array.isArray(v) && v.length <= max ? v : bad();
  const res = (v: unknown): SchemaDiagnosResurs => {
    const r = obj(v), typ = str(r.typ, 30) as SchemaDiagnosResurs['typ'];
    if (!['klass', 'grupp', 'larare', 'sal', 'undervisning'].includes(typ)) bad();
    return { typ, id: str(r.id, 200), label: str(r.label) };
  };
  const body = obj(value);
  if (body.version !== SCHEMA_CONTRACT_VERSION) bad();
  return arr(body.findings, SCHEMA_LIMITS.diagnoses).map(raw => {
    const f = obj(raw), a = obj(f.action), target = str(a.target, 30) as SchemaDiagnosAction['target'];
    if (!['villkor', 'tjanst', 'grupper', 'timplan'].includes(target) || typeof f.proof !== 'boolean') bad();
    return { code: str(f.code, 100), message: str(f.message), proof: f.proof as boolean, lessons: arr(f.lessons, SCHEMA_LIMITS.lessons).map(v => str(v, 100)), resources: arr(f.resources, SCHEMA_LIMITS.lessons).map(res),
      action: { target, label: str(a.label), ...(a.resourceId === undefined ? {} : { resourceId: str(a.resourceId, 200) }), ...(a.resource === undefined ? {} : { resource: res(a.resource) }) } };
  });
}
