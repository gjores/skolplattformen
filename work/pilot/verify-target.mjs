#!/usr/bin/env node
// Målskydd för lokala provmål (BASE-02, D-08).
//
// Modul:
//   import { assertTarget } from '../work/pilot/verify-target.mjs';
//   const manifest = await assertTarget('protected');            // kräver startat mål
//   const manifest = await assertTarget('baseline', { requireRunning: false });
//
// CLI:
//   node work/pilot/verify-target.mjs --target baseline|protected [--no-running]
//   exit 0 = OK, exit 1 = REFUSED (fel/okänt/fjärrmål), exit 3 = BLOCKED (målet är
//   inte förberett eller inte startat).
//
// Reglerna är avsiktligt strikta: ett prov får bara riktas mot ett manifest
// under work/pilot/targets/ vars projekt-ID börjar med "skolplattform-pilot-",
// vars API och databas ligger på 127.0.0.1 och som inte överlagras av
// molnvariabler eller flaggor som --linked/--db-url. Nycklar skrivs aldrig ut.
//
// Projektroten härleds ur filens egen plats, aldrig ur arbetskatalogen,
// eftersom skriptet anropas både från projektroten och från web/.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const targetsDir = path.join(root, 'work', 'pilot', 'targets');
const allowedTargets = ['baseline', 'protected'];
const projectPrefix = 'skolplattform-pilot-';
const forbiddenEnv = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_URL', 'SUPABASE_PROJECT_REF'];
const forbiddenFlags = ['--linked', '--db-url'];
const idpContainer = 'skolplattform-pilot-idp';
const idpIssuer = 'http://host.docker.internal:8180/realms/skolplattform-test';
const hostsBlocked = 'BLOCKED: host.docker.internal löses inte till 127.0.0.1 på den här datorn. Lägg till raden "127.0.0.1 host.docker.internal" i /etc/hosts (kräver administratörsrättighet och görs en gång) och kör igen. Skriptet ändrar aldrig /etc/hosts.';

function refused(message) {
  return new Error(`REFUSED: ${message}`);
}

function blocked(message) {
  return new Error(`BLOCKED: ${message}`);
}

// CLI:n skriver en versionskontroll-cache i <workdir>/supabase/.temp vid varje
// anrop. Målen är aldrig länkade, så katalogen innehåller inget projekt-ID;
// den tas bort så att .temp aldrig finns i ett provmål (rotens supabase/.temp
// kopieras aldrig hit).
function dropCliCache(workdir) {
  fs.rmSync(path.join(workdir, 'supabase', '.temp'), { recursive: true, force: true });
}

function readStatus(workdir) {
  let out;
  try {
    out = execFileSync('supabase', ['--workdir', workdir, 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } finally {
    dropCliCache(workdir);
  }
  const start = out.indexOf('{');
  if (start < 0) throw new Error('status -o json gav ingen JSON');
  return JSON.parse(out.slice(start));
}

function hostsReady() {
  if (process.env.SKOLPLATTFORM_TEST_NO_HOSTS === '1') return false;
  if (process.platform === 'darwin') {
    try {
      const out = execFileSync('dscacheutil', ['-q', 'host', '-a', 'name', 'host.docker.internal'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return /^ip_address:\s*127\.0\.0\.1\s*$/m.test(out);
    } catch {
      return false;
    }
  }
  try {
    return /^\s*127\.0\.0\.1\s+.*\bhost\.docker\.internal\b/m.test(fs.readFileSync('/etc/hosts', 'utf8'));
  } catch {
    return false;
  }
}

async function assertIdp(manifest) {
  if (!hostsReady()) throw new Error(hostsBlocked);
  if (!manifest.idp || manifest.idp.containerName !== idpContainer || manifest.idp.issuer !== idpIssuer) {
    throw blocked('test-IdP:n kör inte (kör node work/pilot/prepare-local.mjs --target protected --with-idp)');
  }
  try {
    const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).split('\n');
    if (!names.includes(idpContainer)) throw new Error('container saknas');
    const response = await fetch(`${manifest.idp.publicUrl}/realms/skolplattform-test/.well-known/openid-configuration`);
    if (!response.ok || (await response.json()).issuer !== idpIssuer) throw new Error('issuer saknas');
  } catch {
    throw blocked('test-IdP:n kör inte (kör node work/pilot/prepare-local.mjs --target protected --with-idp)');
  }
}

export async function assertTarget(name, { requireRunning = true, requireIdp = false } = {}) {
  // 1. Molnvariabler och fjärrflaggor vägras alltid, oavsett mål.
  for (const key of forbiddenEnv) {
    if (process.env[key] !== undefined && process.env[key] !== '') {
      throw refused(`miljövariabeln ${key} är satt; lokala prov får aldrig köras med molnkonfiguration`);
    }
  }
  for (const arg of process.argv) {
    for (const flag of forbiddenFlags) {
      if (arg === flag || arg.startsWith(`${flag}=`)) {
        throw refused(`flaggan ${flag} är inte tillåten; endast lokala mål under work/pilot/targets/`);
      }
    }
  }

  // 2. Målnamn och manifest.
  if (!allowedTargets.includes(name)) {
    throw refused(`okänt mål "${name}"; tillåtna mål är ${allowedTargets.join(', ')}`);
  }
  const manifestPath = path.join(targetsDir, name, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw blocked(`målet ${name} är inte förberett. Kör node work/pilot/prepare-local.mjs --target ${name}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw refused(`manifestet ${manifestPath} kan inte läsas: ${error.message}`);
  }

  // 3. Manifestets innehåll måste peka på ett lokalt, eget provmål.
  if (manifest.target !== name) {
    throw refused(`manifestet anger målet "${manifest.target}", inte "${name}"`);
  }
  if (typeof manifest.projectId !== 'string' || !manifest.projectId.startsWith(projectPrefix)) {
    throw refused(`projekt-ID "${manifest.projectId ?? ''}" saknar prefixet ${projectPrefix}`);
  }
  if (manifest.projectId !== `${projectPrefix}${name}`) {
    throw refused(`projekt-ID "${manifest.projectId}" hör inte till målet ${name}`);
  }
  if (typeof manifest.workdir !== 'string' || !path.isAbsolute(manifest.workdir)) {
    throw refused('manifestets workdir är inte en absolut sökväg');
  }
  const workdir = path.resolve(manifest.workdir);
  if (!workdir.startsWith(targetsDir + path.sep)) {
    throw refused(`workdir ${workdir} ligger inte under ${targetsDir}`);
  }
  let apiHost;
  try {
    apiHost = new URL(manifest.apiUrl).hostname;
  } catch {
    throw refused('manifestets apiUrl är inte en giltig URL');
  }
  if (apiHost !== '127.0.0.1') {
    throw refused(`apiUrl pekar på ${apiHost}, inte 127.0.0.1`);
  }
  if (typeof manifest.dbUrl !== 'string' || !manifest.dbUrl.includes('@127.0.0.1:')) {
    throw refused('dbUrl pekar inte på 127.0.0.1');
  }

  // 4. Körande instans måste vara samma som manifestet beskriver.
  if (requireRunning) {
    let status;
    try {
      status = readStatus(workdir);
    } catch {
      throw blocked(`målet ${name} är inte startat. Kör node work/pilot/prepare-local.mjs --target ${name}`);
    }
    if (status.API_URL !== manifest.apiUrl) {
      throw refused(`manifest och körande instans skiljer sig (API_URL ${status.API_URL} ≠ ${manifest.apiUrl})`);
    }
  }

  if (requireIdp) {
    if (name !== 'protected') throw refused('test-IdP får endast krävas för målet protected');
    await assertIdp(manifest);
  }

  return manifest;
}

function parseArgs(argv) {
  const options = { target: null, requireRunning: true, requireIdp: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') options.target = argv[++i];
    else if (arg.startsWith('--target=')) options.target = arg.slice('--target='.length);
    else if (arg === '--no-running') options.requireRunning = false;
    else if (arg === '--with-idp') options.requireIdp = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Användning: node work/pilot/verify-target.mjs --target baseline|protected [--no-running] [--with-idp]');
      process.exit(0);
    }
    // Andra argument ignoreras här; --linked/--db-url vägras i assertTarget.
  }
  return options;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const options = parseArgs(process.argv.slice(2));
  try {
    const manifest = await assertTarget(options.target ?? '', {
      requireRunning: options.requireRunning,
      requireIdp: options.requireIdp,
    });
    console.log(JSON.stringify({
      target: manifest.target,
      projectId: manifest.projectId,
      apiUrl: manifest.apiUrl,
      status: 'OK',
    }));
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
  }
}
