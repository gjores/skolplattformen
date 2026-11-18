/**
 * Anrop till schemamotorns tjänst (05.2-SM-KOPPLING, K1). Bara appens server når tjänsten; webbläsaren gör det aldrig.
 * Adress och token är valfri serverkonfiguration: saknas de är motorn inte ansluten i miljön och inget anrop görs.
 * Varken underlag, svar eller token loggas.
 */
import { env as bindings } from 'cloudflare:workers';
import { SchemaContractError, parseSchemaEngineDiagnoses, parseSchemaSolution, parseSchemaCheck, type SchemaCheck, type SchemaPlacement, type SchemaProblem, type SchemaSolution } from '../schema-contract.ts';
import { SCHEMA_SOLVE_DEFAULT_MS, schemaSolveTime, type SchemaSolveTimeMs } from '../schema-fortsatt.ts';
import { parseSchemaPositions, type SchemaPositions } from '../schema-lagen.ts';
import { motorProblem } from '../schema-utan-sal.ts';
import { parseSchemaMotorPlacering, type SchemaPlaceringFailure, type SchemaPlaceringVal } from '../schema-placering.ts';

const MARGIN_MS = 5_000, REPLY_BYTES = 16 * 1024 * 1024;
export type SchemaEngineFailure = 'schema_engine_unconfigured' | 'schema_engine_unreachable' | 'schema_engine_busy' | 'schema_engine_bad_reply' | SchemaPlaceringFailure;
export class SchemaEngineError extends Error {
  public reason: SchemaEngineFailure;
  constructor(reason: SchemaEngineFailure) { super(reason); this.name = 'SchemaEngineError'; this.reason = reason; }
}

function config(): { url: string; token: string } {
  const worker = bindings as Record<string, string | undefined>;
  const url = worker.SCHEMAMOTOR_URL ?? process.env.SCHEMAMOTOR_URL, token = worker.SCHEMAMOTOR_TOKEN ?? process.env.SCHEMAMOTOR_TOKEN;
  if (!url || !token || !/^https?:\/\/[^\s/?#]+$/u.test(url)) throw new SchemaEngineError('schema_engine_unconfigured');
  return { url, token };
}

async function call<T>(path: string, body: unknown, timeMs: number, parse: (value: unknown) => T): Promise<T> {
  const { url, token } = config();
  let response: Response, text: string;
  try {
    // Workers-miljön godtar bara 'follow' och 'manual'; en omdirigering blir då ett svar som inte är ok och nekas nedan.
    response = await fetch(`${url}${path}`, { method: 'POST', redirect: 'manual',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeMs + MARGIN_MS) });
    text = await response.text();
  } catch { throw new SchemaEngineError('schema_engine_unreachable'); }
  if (response.status === 429) throw new SchemaEngineError('schema_engine_busy');
  // 401 betyder fel token i konfigurationen: motorn är då inte ansluten på ett användbart sätt.
  if (response.status === 401) throw new SchemaEngineError('schema_engine_unconfigured');
  if (path === '/v1/suggest' && response.status === 400 && text.length <= REPLY_BYTES) {
    let code: unknown; try { code = JSON.parse(text)?.error; } catch { /* ogiltigt motorsvar hanteras nedan */ }
    const known: Record<string, SchemaPlaceringFailure> = { invalid_baseline: 'schema_placement_invalid_baseline', locked_lesson: 'schema_placement_locked_lesson', bad_target: 'schema_placement_bad_target' };
    if (typeof code === 'string' && Object.hasOwn(known, code)) throw new SchemaEngineError(known[code]);
  }
  if (!response.ok || text.length > REPLY_BYTES) throw new SchemaEngineError('schema_engine_bad_reply');
  try { return parse(JSON.parse(text)); } catch { throw new SchemaEngineError('schema_engine_bad_reply'); }
}

/** Ett nytt sökfrö per fortsättning. Endast servern väljer det; det ingår inte i schemagrunden eller det sparade utkastet. */
export function freshSchemaSolveSeed(): number {
  const random = crypto.getRandomValues(new Uint32Array(2));
  return Math.max(1, (random[0] & 0x1fffff) * 0x1_0000_0000 + random[1]);
}

export function solveSchema(problem: SchemaProblem, timeMs: SchemaSolveTimeMs = SCHEMA_SOLVE_DEFAULT_MS, seed?: number): Promise<SchemaSolution> {
  const limit = schemaSolveTime(timeMs);
  if (seed !== undefined && (!Number.isSafeInteger(seed) || seed < 0)) throw new SchemaContractError();
  return call(`/v1/solve?time_ms=${limit}${seed === undefined ? '' : `&seed=${seed}`}`, problem, limit, value => {
    // Fröet finns redan i motorns stats. Ett gammalt/felaktigt svar får inte påstå att den nya sökomgången användes.
    if (seed !== undefined && (value as { stats?: { seed?: unknown } } | null)?.stats?.seed !== seed) throw new SchemaContractError();
    return parseSchemaSolution(value, problem);
  });
}

/** Motorns kontrollant prövar placeringarna mot underlaget (05.2-SM-FLYTT, F1). Inget räknas om. Pass utan sal upptar ingen sal (05.2-SM-UXF-43). */
const engineAt = (placements: SchemaPlacement[]) => placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] }));
export function validateSchema(problem: SchemaProblem, placements: SchemaPlacement[]): Promise<SchemaCheck> {
  const motor = motorProblem(problem, placements);
  return call('/v1/validate', { problem: motor, placements: engineAt(placements) }, 0, value => parseSchemaCheck(value, motor));
}

/** Läget för varje starttid för ett pass (05.2-SM-LAGEN). `pupil` är ett elevkluster ur underlaget, aldrig ett elev-ID. */
export function positionsSchema(problem: SchemaProblem, placements: SchemaPlacement[], lesson: string, pupil: string | null): Promise<SchemaPositions> {
  const motor = motorProblem(problem, placements);
  return call('/v1/positions', { problem: motor, placements: engineAt(placements), lesson, ...(pupil === null ? {} : { pupil }) }, 0, value => parseSchemaPositions(value, motor, lesson));
}

/** Förkontroller utan motorsökning. Underlaget hålls inom samma behöriga serverväg som förslaget. */
export function diagnoseSchema(problem: SchemaProblem) {
  return call('/v1/diagnose', problem, 0, value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SchemaContractError();
    const d = value as Record<string, unknown>;
    if (d.version !== problem.version || d.problem_id !== problem.id) throw new SchemaContractError();
    return parseSchemaEngineDiagnoses(d.diagnoses, problem);
  });
}

/** Begränsad placeringssökning, högst två sekunder. Resultatet är ett förslag, aldrig en skrivning. */
export function suggestSchema(problem: SchemaProblem, placements: SchemaPlacement[], val: SchemaPlaceringVal) {
  const { target, mode, lesson, depth } = val, motor = motorProblem(problem, placements);
  return call('/v1/suggest', { problem: motor, placements: engineAt(placements), mode, lesson, depth,
    target: target ? { day: target.day, start_min: target.startMin, rooms: target.room ? [target.room] : [] } : null }, 2_000,
  value => parseSchemaMotorPlacering(value, motor, { ...val, placements }));
}
