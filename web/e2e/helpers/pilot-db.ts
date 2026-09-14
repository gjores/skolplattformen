import { execFileSync } from 'node:child_process';
import type { PilotManifest } from './keycloak.ts';

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function privatePgEnv(manifest: PilotManifest): NodeJS.ProcessEnv {
  const url = new URL(manifest.dbUrl);
  return { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
}

export function psql(manifest: PilotManifest, sql: string): string {
  return execFileSync(
    'psql',
    [
      '-h',
      '127.0.0.1',
      '-p',
      String(manifest.ports.db),
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-Atq',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { encoding: 'utf8', input: sql, env: privatePgEnv(manifest) },
  ).trim();
}

export function blockMembership(manifest: PilotManifest, membershipId: string): void {
  psql(
    manifest,
    `update public.memberships set status='blocked', blocked_at=now() where id=${sqlLiteral(membershipId)};`,
  );
}

export function unblockMembership(manifest: PilotManifest, membershipId: string): void {
  psql(
    manifest,
    `update public.memberships set status='active', blocked_at=null where id=${sqlLiteral(membershipId)};`,
  );
}
