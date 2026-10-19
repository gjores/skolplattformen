// Egen, tillfällig PostgreSQL-instans byggd från repots migrationer, för SQL-prov där det skyddade lokala
// målet saknas (till exempel i en molnmiljö). Instansen skapas i en ny privat katalog, lyssnar bara på en
// unix-socket i den katalogen och raderas efteråt. Inga anslutningssträngar tas emot och inga befintliga
// databaser läses eller skrivs. Schemat byggs från migrationerna, inte från en dump av ett installerat mål,
// så resultatet är ett prov av migrationskedjan med syntetiska data, inte av en installerad databas.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, chownSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const postgres = createRequire(new URL('../../web/package.json', import.meta.url))('postgres');
const candidates = ['/usr/lib/postgresql/18/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/16/bin', '/opt/homebrew/opt/postgresql@18/bin', '/opt/homebrew/opt/postgresql@17/bin'];

function binaries() {
  const dir = candidates.find(d => existsSync(join(d, 'initdb')) && existsSync(join(d, 'pg_ctl')));
  if (!dir) throw new Error('BLOCKED: PostgreSQL-servern (initdb/pg_ctl) saknas i miljön.');
  return dir;
}
/** PostgreSQL vägrar köra som root; då körs servern som systemanvändaren postgres. */
function runner() {
  if (typeof process.getuid !== 'function' || process.getuid() !== 0) return { run: (bin, args, opts) => execFileSync(bin, args, opts), uid: null, gid: null };
  const uid = Number(execFileSync('id', ['-u', 'postgres'], { encoding: 'utf8' }).trim()), gid = Number(execFileSync('id', ['-g', 'postgres'], { encoding: 'utf8' }).trim());
  return { run: (bin, args, opts) => execFileSync('runuser', ['-u', 'postgres', '--', bin, ...args], opts), uid, gid };
}
export function migrationFiles() {
  return readdirSync(resolve(root, 'supabase/migrations')).filter(f => /^\d{14}_[a-z0-9_]+\.sql$/u.test(f)).sort();
}

/** exclude: migrationsfiler (basnamn) som provet själv installerar i sin transaktion. */
export async function createEphemeralMigratedDb({ exclude = [] } = {}) {
  const bin = binaries(), { run, uid, gid } = runner();
  const dir = mkdtempSync(join(tmpdir(), 'skolplattform-ephemeral-pg-'));
  chmodSync(dir, 0o700); if (uid !== null) chownSync(dir, uid, gid);
  const data = join(dir, 'data'), log = join(dir, 'server.log'), opts = { stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000 };
  let db, started = false;
  const extra = new Set();
  const end = async () => {
    try { for (const c of extra) await c.end({ timeout: 5 }); extra.clear(); if (db) await db.end({ timeout: 5 }); } finally {
      try { if (started) run(join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', 'stop'], opts); } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  };
  try {
    run(join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'postgres', '-E', 'UTF8', '--locale=C.UTF-8', '--no-sync'], opts);
    run(join(bin, 'pg_ctl'), ['-D', data, '-l', log, '-w', '-o', `-k ${dir} -c listen_addresses='' -c fsync=off -c full_page_writes=off`, 'start'], opts);
    started = true;
    const connect = database => postgres({ path: join(dir, '.s.PGSQL.5432'), database, username: 'postgres', max: 1, prepare: false, onnotice: () => {} });
    const admin = connect('postgres');
    try { await admin`create database skolplattform_ephemeral template template0 encoding 'UTF8'`; } finally { await admin.end({ timeout: 5 }); }
    db = connect('skolplattform_ephemeral');
    await db.unsafe(readFileSync(resolve(root, 'work/pilot/ephemeral-supabase-stubs.sql'), 'utf8'));
    await db.unsafe(`alter database skolplattform_ephemeral set search_path = "$user", public, extensions`);
    await db.end({ timeout: 5 }); db = connect('skolplattform_ephemeral');
    const applied = [];
    for (const file of migrationFiles()) {
      if (exclude.includes(file)) continue;
      const sql = readFileSync(resolve(root, 'supabase/migrations', file), 'utf8');
      try { await db.begin(tx => tx.unsafe(sql)); } catch (e) { throw new Error(`Migration ${file} failed: ${e.code ?? ''} ${e.message}`); }
      applied.push({ file, sha256: createHash('sha256').update(sql).digest('hex') });
    }
    for (const file of exclude) assert.ok(existsSync(resolve(root, 'supabase/migrations', file)), `Excluded migration missing: ${file}`);
    const [{ version }] = await db`select current_setting('server_version') version`;
    // Extra anslutningar till samma tillfälliga databas (t.ex. prov med samtidiga transaktioner); stängs av end().
    const more = () => { const c = connect('skolplattform_ephemeral'); extra.add(c); return c; };
    return { db, end, connect: more, provenance: { kind: 'ephemeral-migrated-postgresql', serverVersion: version, stubs: 'work/pilot/ephemeral-supabase-stubs.sql', applied: applied.length,
      appliedChainSha256: createHash('sha256').update(applied.map(a => a.file + ':' + a.sha256).join('\n')).digest('hex'), excluded: exclude } };
  } catch (error) { await end(); throw error; }
}
