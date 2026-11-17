/** C12: begränsad sandlåda. Endast serveråterbyggda underlag och oberoende helkontroller får ge ett alternativ. Inga dataskrivningar. */
import type { TjanstPlanRead } from '../tjanst-contract.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaCheck, type SchemaPlacement, type SchemaProblem, type SchemaRegel } from '../schema-contract.ts';
import { checkSchemaPlaceringRequest, type SchemaPlaceringVal, type SchemaPlaceringsforslag } from '../schema-placering.ts';
import { buildSchemaUnderlag, schemaKontroll, type SchemaBasis, type SchemaUnderlag } from '../schema-underlag.ts';
import { SCHEMA_VILLKORSFORSLAG_LIMITS, SchemaVillkorsforslagError, parseSchemaVillkorsforslag, schemaVillkorsandring, schemaVillkorsforslagInputFingerprint, tillampaSchemaVillkorsandring,
  type SchemaVillkorsforslag, type SchemaVillkorsforslagRequest } from '../schema-villkorsforslag.ts';
import { SchemaEngineError, suggestSchema, validateSchema } from './schemamotor.ts';
import { salIfyllning } from '../schema-utan-sal.ts';

export type SchemaVillkorsforslagMotor = {
  validate: (problem: SchemaProblem, placements: SchemaPlacement[]) => Promise<SchemaCheck>;
  suggest: (problem: SchemaProblem, placements: SchemaPlacement[], val: SchemaPlaceringVal) => Promise<{ depth: 1 | 2 | 3; timedOut: boolean; elapsedMs: number; suggestions: SchemaPlaceringsforslag[] }>;
};
const engine: SchemaVillkorsforslagMotor = { validate: validateSchema, suggest: suggestSchema };
class TimeLimit extends Error {}
const reference = (problem: SchemaProblem, placements: SchemaPlacement[]): SchemaProblem => ({ ...problem,
  reference: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room === null ? [] : [p.room] })) });

function rootsFor(problem: SchemaProblem, lesson: string): Set<string> {
  const roots = new Set([lesson]); let added = true;
  while (added) { added = false; for (const link of problem.links ?? []) if (link.kind === 'simultaneous' && link.lessons.some(id => roots.has(id)))
    for (const id of link.lessons) if (!roots.has(id)) { roots.add(id); added = true; }
  }
  return roots;
}
function resourceName(underlag: SchemaUnderlag, r: SchemaRegel): string | null {
  return r.slag === 'sal' ? underlag.labels.rooms.find(room => room.name === r.ref)?.name ?? null : underlag.resurser[r.slag].find(resource => resource.ref === r.ref)?.name ?? null;
}
/** Grov avgränsning före ombyggnad. Den faktiska påverkan på det valda passet prövas därefter i det ombyggda motorunderlaget. */
function relevant(underlag: SchemaUnderlag, r: SchemaRegel, roots: Set<string>): boolean {
  const lessons = underlag.problem.lessons.filter(l => roots.has(l.id)), labels = underlag.labels.lessons.filter(l => roots.has(l.id));
  if (r.slag === 'pass') return roots.has(r.ref);
  if (r.slag === 'amne') return labels.some(l => l.title === r.ref);
  if (r.slag === 'sal') return lessons.some(l => l.rooms?.allowed.some(id => underlag.labels.rooms.find(room => room.id === id)?.name === r.ref));
  if (r.slag === 'klass') {
    const index = underlag.resurser.klass.findIndex(c => c.ref === r.ref), id = underlag.labels.classes[index]?.id;
    return id !== undefined && labels.some(l => l.classIds.includes(id));
  }
  if (r.slag === 'larare') {
    // Resursväljaren kan innehålla oanvänd personal utan motornod. Endast serverns entydiga källkoppling får avgöra träffen.
    return lessons.some(l => l.teachers.some(id => underlag.teacherRefs[id] === r.ref));
  }
  const group = underlag.groupRefs[r.ref];
  // En reservgrupp kan ingå i ett samplacerat block utan en egen motornod. Den får bara gå vidare om den faktiska ombyggnaden påverkar roten.
  return group === undefined || lessons.some(l => l.groups.includes(group));
}
function affected(problem: SchemaProblem, roots: Set<string>): string {
  return JSON.stringify(problem.lessons.filter(l => roots.has(l.id)).map(l => ({ id: l.id, allowed: l.allowed ?? null, margin: l.margin ?? null,
    rooms: l.rooms?.allowed.map(id => ({ id, unavailable: problem.rooms?.find(r => r.id === id)?.unavailable ?? [] })) ?? [] })));
}
const matches = (reported: SchemaPlaceringsforslag['metricsBefore'], checked: SchemaCheck['metrics']) => reported.studentGapMin === checked.studentGapMin
  && reported.teacherGapMin === checked.teacherGapMin && reported.cost === checked.cost;

/** Motor/tid injiceras enbart av syntetiska prov, aldrig genom HTTP-begäran. Högst 12 egna rader och tre helkontrollerade alternativ. */
export async function schemaVillkorsforslag(plan: TjanstPlanRead, input: SchemaVillkorsforslagRequest, basis: SchemaBasis,
  motor: SchemaVillkorsforslagMotor = engine, options: { now?: () => number; timeMs?: number } = {}): Promise<SchemaVillkorsforslag> {
  const now = options.now ?? Date.now, started = now(), timeMs = Math.min(SCHEMA_VILLKORSFORSLAG_LIMITS.timeMs, Math.max(1, options.timeMs ?? SCHEMA_VILLKORSFORSLAG_LIMITS.timeMs));
  const remaining = () => timeMs - (now() - started);
  const bounded = async <T>(operation: () => Promise<T>): Promise<T> => {
    const ms = remaining(); if (ms <= 0) throw new TimeLimit();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Om transporten redan pågår när budgeten tar slut får dess eget timeout avsluta den. Ingen ny kandidat eller ofullständigt kontrollerat resultat lämnas ut.
    try { return await Promise.race([operation(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new TimeLimit()), ms); })]); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  };
  const underlag = buildSchemaUnderlag(plan, input, basis);
  if (underlag.grundFingerprint !== input.grundFingerprint) throw new SchemaVillkorsforslagError('schema_underlag_changed');
  const selected = underlag.problem.lessons.find(l => l.id === input.lesson);
  if (!selected || input.placements.some(p => p.lesson === input.lesson)) throw new SchemaVillkorsforslagError('schema_villkorsforslag_not_parked');
  if (selected.locked) throw new SchemaVillkorsforslagError('schema_placement_locked_lesson');
  const val: SchemaPlaceringVal = { lesson: input.lesson, depth: input.depth, mode: 'lesson', target: null };
  const placements = checkSchemaPlaceringRequest({ ...input, ...val }, underlag.problem, salIfyllning(underlag.villkor)), roots = rootsFor(underlag.problem, input.lesson);
  const suggestions: SchemaVillkorsforslag['suggestions'] = [];
  let timedOut = false, testedCandidates = 0, newGrundCandidates = 0, considered = 0;
  try {
    const before = await bounded(() => motor.validate(reference(underlag.problem, placements), placements));
    if (before.violations.length) throw new SchemaVillkorsforslagError('schema_placement_invalid_baseline');
    for (let ruleIndex = 0; ruleIndex < input.villkor.egna.length; ruleIndex++) {
      if (considered >= SCHEMA_VILLKORSFORSLAG_LIMITS.candidates || suggestions.length >= SCHEMA_VILLKORSFORSLAG_LIMITS.suggestions) break;
      if (remaining() <= 0) throw new TimeLimit();
      const rule = input.villkor.egna[ruleIndex];
      if (!['sparrad', 'tillaten', 'marginal'].includes(rule.typ) || underlag.egnaUtanTraff.includes(ruleIndex) || !relevant(underlag, rule, roots)) continue;
      const name = resourceName(underlag, rule); if (name === null) continue;
      const change = schemaVillkorsandring(input.villkor, ruleIndex, name); if (change === null) continue;
      considered++;
      const villkor = tillampaSchemaVillkorsandring(input.villkor, change);
      // Jämför verkliga pass före återläggning av utkastets lås. Ett ändrat passmönster är aldrig ett direkt giltigt placeringsalternativ.
      let sandbox = buildSchemaUnderlag(plan, { period: input.period, villkor }, basis);
      if (sandbox.grundFingerprint !== underlag.grundFingerprint) { newGrundCandidates++; continue; }
      if (affected(underlag.problem, roots) === affected(sandbox.problem, roots)) continue;
      if (input.locks) sandbox = buildSchemaUnderlag(plan, { ...input, villkor }, basis);
      const problem = reference(sandbox.problem, placements);
      testedCandidates++;
      const baseline = await bounded(() => motor.validate(problem, placements));
      if (baseline.violations.length) continue;
      const result = await bounded(() => motor.suggest(sandbox.problem, placements, val));
      timedOut ||= result.timedOut;
      // En placering per regel räcker. Inga ytterligare motorsvar visas utan egen helkontroll.
      const placement = result.suggestions[0]; if (!placement) continue;
      const check = await bounded(() => motor.validate(problem, placement.placements));
      if (check.violations.length || !matches(placement.metricsBefore, baseline.metrics) || !matches(placement.metricsAfter, check.metrics)) throw new SchemaEngineError('schema_engine_bad_reply');
      suggestions.push({ id: `regel-${ruleIndex + 1}`, change, placement, kontroll: schemaKontroll(sandbox, placement.placements, check) });
    }
  } catch (error) { if (!(error instanceof TimeLimit)) throw error; timedOut = true; }
  const explanation = [suggestions.length ? `${suggestions.length} prövade alternativ hittades. Varje alternativ ändrar en egen regel. Kontrollera det igen innan du använder det.`
    : 'Inget prövat alternativ hittades inom denna begränsade sökning. Granska passets villkor, lås och övriga placeringar.',
  timedOut ? 'Tidsgränsen nåddes. Bara färdigkontrollerade alternativ visas; detta visar inte att övriga möjligheter saknas.' : '',
  considered >= SCHEMA_VILLKORSFORSLAG_LIMITS.candidates ? 'Högst tolv regeländringar prövas per sökning.' : '',
  newGrundCandidates ? `${newGrundCandidates} ändringar kräver att passen räknas om och visas därför inte som färdiga placeringar.` : ''].filter(Boolean).join(' ');
  return parseSchemaVillkorsforslag({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, fingerprint: underlag.fingerprint,
    inputFingerprint: schemaVillkorsforslagInputFingerprint(input), lesson: input.lesson, depth: input.depth, timedOut, elapsedMs: Math.min(60_000, Math.max(0, Math.round(now() - started))),
    testedCandidates, newGrundCandidates, explanation, suggestions }, input, underlag.problem.lessons.map(l => l.id), underlag.problem.links);
}
