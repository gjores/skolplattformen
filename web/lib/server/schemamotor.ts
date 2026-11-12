/**
 * Anrop till schemamotorns tjänst (05.2-SM-KOPPLING, K1). Bara appens server når tjänsten; webbläsaren gör det aldrig.
 * Adress och token är valfri serverkonfiguration: saknas de är motorn inte ansluten i miljön och inget anrop görs.
 * Varken underlag, svar eller token loggas.
 */
import { env as bindings } from 'cloudflare:workers';
import { parseSchemaSolution, parseSchemaCheck, type SchemaCheck, type SchemaPlacement, type SchemaProblem, type SchemaSolution } from '../schema-contract.ts';
import { SCHEMA_DEFAULTS } from '../schema-underlag.ts';

const SCHEMA_ENGINE_TIME_MS = SCHEMA_DEFAULTS.solveTimeMs, MARGIN_MS = 5_000, REPLY_BYTES = 16 * 1024 * 1024;
export type SchemaEngineFailure = 'schema_engine_unconfigured' | 'schema_engine_unreachable' | 'schema_engine_busy' | 'schema_engine_bad_reply';
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
  if (!response.ok || text.length > REPLY_BYTES) throw new SchemaEngineError('schema_engine_bad_reply');
  try { return parse(JSON.parse(text)); } catch { throw new SchemaEngineError('schema_engine_bad_reply'); }
}

export function solveSchema(problem: SchemaProblem): Promise<SchemaSolution> {
  return call(`/v1/solve?time_ms=${SCHEMA_ENGINE_TIME_MS}`, problem, SCHEMA_ENGINE_TIME_MS, value => parseSchemaSolution(value, problem));
}

/** Motorns kontrollant prövar placeringarna mot underlaget (05.2-SM-FLYTT, F1). Inget räknas om. */
export function validateSchema(problem: SchemaProblem, placements: SchemaPlacement[]): Promise<SchemaCheck> {
  return call('/v1/validate', { problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) }, 0,
    value => parseSchemaCheck(value, problem));
}
