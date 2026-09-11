#!/usr/bin/env node
// Sammanställare för fas 1: kör fasens alla kontroller i ordning, bevarar
// varje delresultat och skriver en samlad resultatfil.
//
//   npm run verify:phase1                       (full körning, Playwright ingår)
//   node scripts/verify-phase1.mjs --skip-browser --out /tmp/snabb.json
//   node scripts/verify-phase1.mjs --with-restore
//
// Flaggor:
//   --with-restore   kör även återställningsprovet (work/pilot/verify-baseline.mjs)
//   --skip-browser   hoppar över Playwright (och exempelbygget om ett exempelbygge
//                    redan finns); totalstatus blir då högst PASS-PARTIAL.
//                    Ge alltid --out utanför arbetsträdet vid snabbkörning så att
//                    den committade fulla körningen inte skrivs över.
//   --out <sökväg>   var sammanställningen skrivs
//                    (standard <rot>/work/pilot/results/phase1-summary.json)
//
// Status per steg: PASS | FAIL | BLOCKED | KNOWN-ISSUE | SKIPPED.
// Totalstatus: PASS endast om alla obligatoriska steg är PASS; PASS-PARTIAL om
// enda avvikelsen är --skip-browser; BLOCKED om något obligatoriskt steg är
// BLOCKED (och inget FAIL); annars FAIL. KNOWN-ISSUE räknas aldrig som PASS men
// listas alltid under knownIssues. Ett steg som saknas eller kraschar blir
// aldrig PASS. Exitkod: 0 vid PASS/PASS-PARTIAL, 3 vid BLOCKED, 1 vid FAIL.
//
// Körs från web/ med Node 25. Pilotskripten under work/pilot/ härleder
// projektroten ur sin egen plats, inte ur cwd. Inga nycklar ur manifesten läses
// eller skrivs ut; bara fältet workdir används (för pgTAP-kopieringen).

import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const pilot = path.join(root, 'work', 'pilot');
const DEFAULT_OUT = path.join(root, 'work', 'pilot', 'results', 'phase1-summary.json');

// ------------------------------------------------------------ flaggor

const flags = { withRestore: false, skipBrowser: false, out: DEFAULT_OUT };
{
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--with-restore') flags.withRestore = true;
    else if (arg === '--skip-browser') flags.skipBrowser = true;
    else if (arg === '--out' || arg.startsWith('--out=')) {
      const value = arg === '--out' ? args[++i] : arg.slice('--out='.length);
      if (!value) usage(`Flaggan --out saknar värde.`);
      flags.out = path.resolve(process.cwd(), value);
    } else usage(`Okänt argument "${arg}".`);
  }
}

function usage(message) {
  console.error(message);
  console.error('Användning: node scripts/verify-phase1.mjs [--with-restore] [--skip-browser] [--out <sökväg>]');
  process.exit(2);
}

// ------------------------------------------------------------ körning

const startedAt = Date.now();
const steps = [];
const knownIssues = [];

/** Kör ett kommando utan skal, strömmar utdata och returnerar exit + utdata. */
function run(file, args, { cwd, env } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let output = '';
    let child;
    try {
      child = spawn(file, args, { cwd: cwd ?? web, env: env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      resolve({ exit: null, signal: null, output: String(error?.message ?? error), durationMs: Date.now() - t0, spawnError: true });
      return;
    }
    const collect = (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => {
      output += `\n${error.message}\n`;
      resolve({ exit: null, signal: null, output, durationMs: Date.now() - t0, spawnError: true });
    });
    child.on('close', (code, signal) => {
      resolve({ exit: code, signal, output, durationMs: Date.now() - t0, spawnError: false });
    });
  });
}

function record(step) {
  steps.push(step);
  const tag = step.status.padEnd(11);
  const secs = (step.durationMs / 1000).toFixed(1).padStart(6);
  console.log(`\n==> ${step.name.padEnd(14)} ${tag} exit=${String(step.exit ?? '-').padStart(3)} ${secs}s  ${step.detail ?? ''}`);
  return step;
}

function heading(name, command) {
  console.log(`\n--- ${name}: ${command}`);
}

/** Vanligt obligatoriskt steg: exit 0 = PASS, allt annat (även krasch) = FAIL. */
async function required(name, file, args, { cwd, command, env, displayArgs } = {}) {
  const shown = command ?? [path.relative(cwd ?? web, file), ...(displayArgs ?? args)].join(' ');
  heading(name, shown);
  const r = await run(file, args, { cwd, env });
  const status = r.exit === 0 ? 'PASS' : 'FAIL';
  const detail = r.spawnError
    ? 'kommandot kunde inte startas'
    : r.signal
      ? `avbrutet av signal ${r.signal}`
      : undefined;
  return record({ name, command: shown, required: true, exit: r.exit, durationMs: r.durationMs, status, detail });
}

/** Pilotskript med exitkod 0 = PASS, 1 = FAIL, 3 = BLOCKED. */
async function pilotStep(name, script, args = []) {
  const file = path.join(pilot, script);
  const shown = `node work/pilot/${script}${args.length ? ' ' + args.join(' ') : ''}`;
  heading(name, shown);
  const r = await run(process.execPath, [file, ...args], { cwd: root });
  const status = r.exit === 0 ? 'PASS' : r.exit === 3 ? 'BLOCKED' : 'FAIL';
  const detail = r.spawnError ? 'kommandot kunde inte startas' : status === 'BLOCKED' ? lastLine(r.output) : undefined;
  return record({ name, command: shown, required: true, exit: r.exit, durationMs: r.durationMs, status, detail });
}

function skipped(name, command, reason, { required: isRequired = true } = {}) {
  return record({ name, command, required: isRequired, exit: null, durationMs: 0, status: 'SKIPPED', detail: reason });
}

function blocked(name, command, reason) {
  return record({ name, command, required: true, exit: null, durationMs: 0, status: 'BLOCKED', detail: reason });
}

const lastLine = (text) =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);

function readBuildMode() {
  try {
    return JSON.parse(fs.readFileSync(path.join(web, 'dist', 'build-mode.json'), 'utf8'));
  } catch {
    return null;
  }
}

function revision() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ stegen

console.log(`Fas 1-sammanställning ${new Date().toISOString()} (Node ${process.version}, revision ${revision() ?? 'okänd'})`);
console.log(`Flaggor: withRestore=${flags.withRestore} skipBrowser=${flags.skipBrowser} out=${path.relative(root, flags.out) || flags.out}`);

// 1. modeller — globben expanderas här, aldrig av ett skal.
{
  const libDir = path.join(web, 'lib');
  const files = fs
    .readdirSync(libDir)
    .filter((f) => f.endsWith('.test.mjs'))
    .sort()
    .map((f) => `lib/${f}`);
  if (!files.length) {
    heading('modeller', 'node --test lib/*.test.mjs');
    record({ name: 'modeller', command: 'node --test lib/*.test.mjs', required: true, exit: null, durationMs: 0, status: 'FAIL', detail: 'inga testfiler hittades' });
  } else {
    await required('modeller', process.execPath, ['--test', ...files], {
      command: `node --test lib/*.test.mjs (${files.length} filer)`,
    });
  }
}

// 2. typkontroll
await required('typkontroll', process.execPath, [path.join(web, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], {
  command: 'npx tsc --noEmit',
});

// 3. lint
await required('lint', process.execPath, [path.join(web, 'node_modules', 'oxlint', 'bin', 'oxlint'), 'app', 'lib', 'scripts', 'e2e'], {
  command: 'npx oxlint app lib scripts e2e',
});

// 4. exempelbygge
{
  const mark = readBuildMode();
  if (flags.skipBrowser && mark?.mode === 'example') {
    skipped('exempelbygge', 'npm run build:example', `--skip-browser och dist/build-mode.json finns med mode example (revision ${mark.revision ?? '?'})`);
  } else {
    await required('exempelbygge', process.execPath, [path.join(web, 'scripts', 'run-mode.mjs'), 'build', '--mode', 'example'], {
      command: 'npm run build:example',
    });
  }
}

// 5. browser
if (flags.skipBrowser) {
  skipped('browser', 'npx playwright test', '--skip-browser: Playwright hoppades över; räknas inte som PASS');
} else {
  await required('browser', process.execPath, [path.join(web, 'node_modules', '@playwright', 'test', 'cli.js'), 'test'], {
    command: 'npx playwright test',
  });
}

// 6. sparordning — reproducerare av känt fel; aldrig PASS.
{
  const command = 'node --test lib/save-order.repro.mjs';
  heading('sparordning', command);
  const r = await run(process.execPath, ['--test', 'lib/save-order.repro.mjs']);
  const line = r.output
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('KNOWN-ISSUE:'));
  let status;
  let detail;
  if (r.spawnError || !line) {
    status = 'FAIL';
    detail = 'reproduceraren gav ingen KNOWN-ISSUE-rad (krasch eller saknad fil)';
    knownIssues.push(`sparordning: ${detail}`);
  } else if (r.exit === 0) {
    status = 'KNOWN-ISSUE';
    detail = `grön — utred: ${line}`;
    knownIssues.push(`sparordning (grön — utred): ${line}`);
  } else {
    status = 'KNOWN-ISSUE';
    detail = line;
    knownIssues.push(`sparordning: ${line}`);
  }
  record({ name: 'sparordning', command, required: false, exit: r.exit, durationMs: r.durationMs, status, detail });
}

// 7. mål-protected
const protectedTarget = await pilotStep('mål-protected', 'verify-target.mjs', ['--target', 'protected']);

// 8. sql-karantän — pgTAP-filerna kopieras till målets workdir före test db.
{
  const command = 'supabase --workdir <protected workdir> test db --local';
  if (protectedTarget.status !== 'PASS') {
    blocked('sql-karantän', command, `mål-protected är ${protectedTarget.status}`);
  } else {
    heading('sql-karantän', command);
    let workdir = null;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(pilot, 'targets', 'protected', 'manifest.json'), 'utf8'));
      workdir = typeof manifest.workdir === 'string' ? manifest.workdir : null;
    } catch {
      workdir = null;
    }
    if (!workdir || !fs.existsSync(workdir)) {
      blocked('sql-karantän', command, 'manifestet saknar workdir eller katalogen finns inte');
    } else {
      const sourceTests = path.join(root, 'supabase', 'tests');
      const targetTests = path.join(workdir, 'supabase', 'tests');
      const sqlFiles = fs.existsSync(sourceTests) ? fs.readdirSync(sourceTests).filter((f) => f.endsWith('.sql')).sort() : [];
      if (!sqlFiles.length) {
        record({ name: 'sql-karantän', command, required: true, exit: null, durationMs: 0, status: 'FAIL', detail: 'inga pgTAP-filer i supabase/tests/' });
      } else {
        fs.mkdirSync(targetTests, { recursive: true });
        for (const f of sqlFiles) fs.copyFileSync(path.join(sourceTests, f), path.join(targetTests, f));
        console.log(`Kopierade ${sqlFiles.join(', ')} till ${path.relative(root, targetTests)}/`);
        const r = await run('supabase', ['--workdir', workdir, 'test', 'db', '--local'], { cwd: root });
        // CLI:ns versionscache får inte ligga kvar i provmålet (plan 01-05).
        fs.rmSync(path.join(workdir, 'supabase', '.temp'), { recursive: true, force: true });
        // PASS kräver både exit 0 och pg_proves egen bekräftelse i utdatan.
        const successful = r.output.includes('All tests successful');
        const status = r.exit === 0 && successful ? 'PASS' : 'FAIL';
        const detail = r.spawnError
          ? 'supabase CLI kunde inte startas'
          : successful
            ? `pgTAP: ${sqlFiles.length} fil(er), All tests successful`
            : 'pgTAP rapporterade inte "All tests successful"';
        record({ name: 'sql-karantän', command, required: true, exit: r.exit, durationMs: r.durationMs, status, detail });
      }
    }
  }
}

// 9. api-isolering
if (protectedTarget.status !== 'PASS') {
  blocked('api-isolering', 'node work/pilot/verify-isolation.mjs', `mål-protected är ${protectedTarget.status}`);
} else {
  await pilotStep('api-isolering', 'verify-isolation.mjs');
}

// 10. mål-baseline
const baselineTarget = await pilotStep('mål-baseline', 'verify-target.mjs', ['--target', 'baseline']);

// 11. baslinje-db
if (baselineTarget.status !== 'PASS') {
  blocked('baslinje-db', 'node work/pilot/verify-baseline-db.mjs', `mål-baseline är ${baselineTarget.status}`);
} else {
  await pilotStep('baslinje-db', 'verify-baseline-db.mjs');
}

// 12. återställning (endast --with-restore)
if (flags.withRestore) {
  await required('återställning', process.execPath, [path.join(pilot, 'verify-baseline.mjs')], {
    cwd: root,
    command: 'node work/pilot/verify-baseline.mjs',
  });
} else {
  skipped('återställning', 'node work/pilot/verify-baseline.mjs', 'kräver --with-restore', { required: false });
}

// ------------------------------------------------------------ totalstatus

function overall() {
  const req = steps.filter((s) => s.required);
  if (req.some((s) => s.status === 'FAIL')) return 'FAIL';
  if (req.some((s) => s.status === 'BLOCKED')) return 'BLOCKED';
  const skippedRequired = req.filter((s) => s.status === 'SKIPPED');
  if (skippedRequired.length) {
    const onlyBrowserSkip = flags.skipBrowser && skippedRequired.every((s) => s.name === 'browser' || s.name === 'exempelbygge');
    return onlyBrowserSkip ? 'PASS-PARTIAL' : 'FAIL';
  }
  if (req.some((s) => s.status !== 'PASS')) return 'FAIL';
  return 'PASS';
}

const status = overall();
const summary = {
  kind: 'phase1-summary',
  date: new Date().toISOString(),
  revision: revision(),
  node: process.version,
  flags: { withRestore: flags.withRestore, skipBrowser: flags.skipBrowser },
  durationMs: Date.now() - startedAt,
  steps,
  knownIssues,
  status,
};

fs.mkdirSync(path.dirname(flags.out), { recursive: true });
fs.writeFileSync(flags.out, JSON.stringify(summary, null, 2) + '\n');

console.log('\n' + '='.repeat(78));
console.log('Steg'.padEnd(4) + ' ' + 'Namn'.padEnd(15) + 'Status'.padEnd(12) + 'Exit'.padEnd(6) + 'Tid'.padStart(8) + '  Obl.');
for (const [i, s] of steps.entries()) {
  console.log(
    String(i + 1).padStart(3) + '  ' + s.name.padEnd(15) + s.status.padEnd(12) + String(s.exit ?? '-').padEnd(6) + `${(s.durationMs / 1000).toFixed(1)}s`.padStart(8) + (s.required ? '  ja' : '  nej'),
  );
}
if (knownIssues.length) {
  console.log('\nKända fel (räknas aldrig som PASS):');
  for (const k of knownIssues) console.log(`  - ${k}`);
}
console.log(`\nTotalstatus: ${status}  (${((Date.now() - startedAt) / 1000).toFixed(1)} s)  → ${path.relative(root, flags.out) || flags.out}`);
console.log('='.repeat(78));

process.exit(status === 'PASS' || status === 'PASS-PARTIAL' ? 0 : status === 'BLOCKED' ? 3 : 1);
