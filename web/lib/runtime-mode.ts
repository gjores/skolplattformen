// Lägeskontrakt för fas 1. Appen startar bara i ett uttryckligt exempelläge
// utan databasanslutning. Saknat, okänt eller skyddat läge är stängt.
// Förekomst av URL/nyckel i miljön är ingen behörighet och öppnar aldrig
// något; den registreras bara som ignorerad konfiguration.

export type RuntimeMode = 'example' | 'blocked';
export type RuntimeReason = 'explicit-example' | 'missing-mode' | 'unknown-mode' | 'protected-closed';
export type RuntimeDecision = { mode: RuntimeMode; reason: RuntimeReason; ignoredBackendConfig: boolean };

export const APP_MODE_VAR = 'NEXT_PUBLIC_APP_MODE';

export type RuntimeEnv = Partial<
  Record<'NEXT_PUBLIC_APP_MODE' | 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY', string | undefined>
>;

/** Rent beslut ur miljövärden. Skriver aldrig ut och lagrar aldrig värdena. */
export function resolveRuntimeMode(env: RuntimeEnv): RuntimeDecision {
  const ignoredBackendConfig = Boolean(env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const mode = env.NEXT_PUBLIC_APP_MODE;
  if (mode === 'example') return { mode: 'example', reason: 'explicit-example', ignoredBackendConfig };
  if (mode === 'protected') return { mode: 'blocked', reason: 'protected-closed', ignoredBackendConfig };
  if (mode === undefined || mode === '') return { mode: 'blocked', reason: 'missing-mode', ignoredBackendConfig };
  return { mode: 'blocked', reason: 'unknown-mode', ignoredBackendConfig };
}

/** Svensk beskrivning för loggar och vyer. Innehåller aldrig URL eller nycklar. */
export function describeRuntime(d: RuntimeDecision): string {
  return d.mode === 'example' ? 'Provmiljö: exempelläge utan databasanslutning' : `Stängd start (${d.reason})`;
}

/** Appens faktiska beslut. Literalerna nedan krävs för att Vinext ska bädda in värdena i klientbygget. */
export const runtime: RuntimeDecision = resolveRuntimeMode({
  NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
