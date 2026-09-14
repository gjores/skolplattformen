#!/usr/bin/env node
// Säker pgTAP-körare för det verifierade, disponibla protected-målet.
// Ingen reset görs här och inga anslutningshemligheter skickas i argv.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const sourceTests = path.join(root, 'supabase', 'tests');
const options = { file: null, out: null };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === '--file') options.file = argv[++i];
  else if (arg.startsWith('--file=')) options.file = arg.slice('--file='.length);
  else if (arg === '--out') options.out = argv[++i];
  else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
  else {
    console.error('REFUSED: använd --file <filnamn> och/eller --out <json>');
    process.exit(1);
  }
}

let manifest;
try {
  // Målskyddet körs före all filkopiering och före Supabase CLI.
  manifest = await assertTarget('protected');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
}

const available = fs.readdirSync(sourceTests).filter(file => file.endsWith('.sql')).sort();
const selected = options.file ? [path.basename(options.file)] : available;
if (selected.length === 0 || selected.some(file => !available.includes(file) || file !== path.basename(file))) {
  console.error('REFUSED: SQL-provet finns inte i supabase/tests');
  process.exit(1);
}
const targetTests = path.join(manifest.workdir, 'supabase', 'tests');
fs.mkdirSync(targetTests, { recursive: true });
for (const file of selected) fs.copyFileSync(path.join(sourceTests, file), path.join(targetTests, file));

const args = ['--workdir', manifest.workdir, 'test', 'db', '--local'];
if (options.file) args.push(path.join('supabase', 'tests', selected[0]));
const proc = spawnSync('supabase', args, {
  cwd: root,
  env: { ...process.env },
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  maxBuffer: 64 * 1024 * 1024,
});
fs.rmSync(path.join(manifest.workdir, 'supabase', '.temp'), { recursive: true, force: true });
const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
process.stdout.write(proc.stdout ?? '');
process.stderr.write(proc.stderr ?? '');
const passed = proc.status === 0 && output.includes('All tests successful');
if (options.out) {
  const outPath = path.resolve(options.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ target: 'protected', files: selected, status: passed ? 'PASS' : 'FAIL', exitCode: proc.status }, null, 2) + '\n');
}
process.exit(passed ? 0 : 1);
