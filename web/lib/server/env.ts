import { env as bindings } from 'cloudflare:workers';

const KEYS = [
  'APP_MODE',
  'OIDC_ISSUER',
  'OIDC_CLIENT_ID',
  'OIDC_CLIENT_SECRET',
  'OIDC_REDIRECT_URI',
  'OIDC_POST_LOGOUT_REDIRECT_URI',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'DATABASE_URL',
  'SESSION_SECRET',
  'MFA_ACR_VALUES',
  'MFA_MAX_AGE_SECONDS',
  'SESSION_IDLE_SECONDS',
  'SESSION_ABSOLUTE_SECONDS',
] as const;

export type ServerEnv = Record<(typeof KEYS)[number], string>;

export function serverEnv(): ServerEnv {
  const workerBindings = bindings as Record<string, string | undefined>;
  const values = Object.fromEntries(
    KEYS.map((key) => [key, workerBindings[key] ?? process.env[key]]),
  ) as Partial<ServerEnv>;
  const missing = KEYS.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new Error(`Serverkonfiguration saknar ${missing.join(', ')}`);
  }
  if (values.APP_MODE !== 'protected') {
    throw new Error('Serverkonfiguration kräver APP_MODE=protected');
  }
  return values as ServerEnv;
}

export function isHttps(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}
