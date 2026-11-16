#!/usr/bin/env node
// Bygger endast en ny lokal, fryst katalog. Inga tjänster, målmanifest, tokenfiler eller databaser öppnas.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { closeSync, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_UAT_MIGRATIONS, schemaUatSources, schemaUatSqlMetadata } from '../pilot/schema-uat-install-core.mjs';
import { prepareMigrationSql } from '../pilot/apply-elective-blocks.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const PREVIOUS_SCHEMA_REVISION = '4267daf75b4f142f72ce04a9d3ac57e5b98ea2ef';
// Explicit beslutad återanvändningskälla för UAT:s efterföljande UI-rättning. Andra motorer byggs som vanligt.
export const SCHEMA_REUSABLE_MOTOR_RELEASE = Object.freeze({
  revision: '211d85a662d6416992c6b4ae731dae8d92250f35',
  manifestSha256: 'fac1e8badd23278b20ac675a3dc09c232147b80b78bd7d2d7ba229992fa45098',
  motorTreeHash: '0a744212b12c3cdfa8f3eb432063fe61ad3f5e31',
  files: Object.freeze([
    Object.freeze({ path: 'runtime/motor/schemamotor', type: 'file', bytes: 1421408, sha256: 'a7cd1a49bf88a90d6c2f465eec31ded9bed25acf5b663be6c686e0fc138a62ee', executable: true }),
    Object.freeze({ path: 'runtime/motor/schemamotor-tjanst', type: 'file', bytes: 1874912, sha256: 'e8fc4c6eecaab183ea1e15faf088b498ed9da1fe30353c97953f435397338023', executable: true }),
  ]),
});
export const releaseSha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const sorted = rows => rows.sort((a, b) => a.path.localeCompare(b.path, 'en'));
const sensitiveName = name => name === '.dev.vars' || name.startsWith('.dev.vars.') || name === 'token' || name.startsWith('.env');

export function assertSchemaReleaseRevision(sourceRoot, revision) {
  assert.match(revision ?? '', /^[a-f0-9]{40}$/u, 'an explicit complete commit is required');
  assert.equal(git(sourceRoot, ['rev-parse', revision + '^{commit}']), revision, 'revision is not the exact commit');
  return { revision, tree: git(sourceRoot, ['rev-parse', revision + '^{tree}']) };
}

export function schemaMotorSourceTree(sourceRoot, revision) {
  assertSchemaReleaseRevision(sourceRoot, revision);
  const tree = git(sourceRoot, ['rev-parse', revision + ':schemamotor']);
  assert.match(tree, /^[a-f0-9]{40}$/u); assert.equal(git(sourceRoot, ['cat-file', '-t', tree]), 'tree', 'complete schemamotor tree required');
  return tree;
}
export function assertIdenticalSchemaMotorTrees(sourceRoot, revision, fromRevision) {
  const current = schemaMotorSourceTree(sourceRoot, revision), previous = schemaMotorSourceTree(sourceRoot, fromRevision);
  assert.equal(current, previous, 'entire schemamotor source tree changed'); return current;
}

/** Innehållshashar, inga filtexter. Produktkatalogen får inga länkar eller privata runtimefiler. */
export function releaseInventory(directory, prefix = '', { links = false, excludeNodeModules = false } = {}) {
  const rows = [], base = realpathSync(directory);
  const visit = (dir, relative) => {
    for (const name of readdirSync(dir).sort()) {
      if (excludeNodeModules && name === 'node_modules') continue;
      const file = path.join(dir, name), key = relative + name, stat = lstatSync(file);
      assert.ok(!sensitiveName(name), 'private runtime file refused: ' + key);
      if (stat.isSymbolicLink()) {
        assert.ok(links, 'product symlink refused: ' + key);
        const resolved = realpathSync(file); assert.ok(resolved.startsWith(base + path.sep), 'external dependency symlink refused');
        rows.push({ path: prefix + key, type: 'symlink', target: readlinkSync(file) });
      } else if (stat.isDirectory()) visit(file, key + '/');
      else { assert.ok(stat.isFile(), 'special file refused'); rows.push({ path: prefix + key, type: 'file', bytes: stat.size, sha256: releaseSha(readFileSync(file)), executable: Boolean(stat.mode & 0o111) }); }
    }
  };
  visit(directory, ''); return sorted(rows);
}

/** Exakt två vanliga, körbara binärer; även extra filer, länkar och ändrade rättigheter nekas. */
export function assertSchemaMotorFiles(directory, expectedFiles) {
  const expectedPaths = ['runtime/motor/schemamotor', 'runtime/motor/schemamotor-tjanst'];
  assert.deepEqual(expectedFiles.map(item => item.path), expectedPaths, 'exact two motor files required');
  for (const file of expectedFiles) {
    assert.equal(file.type, 'file'); assert.equal(file.executable, true); assert.ok(Number.isSafeInteger(file.bytes) && file.bytes > 0); assert.match(file.sha256, /^[a-f0-9]{64}$/u);
  }
  assert.deepEqual(releaseInventory(path.join(directory, 'runtime/motor'), 'runtime/motor/'), expectedFiles, 'motor file inventory changed');
  return expectedFiles;
}

/** Ingen ny byggning eller motorkörning. Bara den uttryckligt utpekade 211d-b-artefakten får återanvändas. */
export function verifySchemaReusableMotor({ directory, revision, nodeModules }) {
  assert.match(directory ?? '', /^\/private\/tmp\/schema-uat-release-[a-z0-9-]+$/u); assert.equal(realpathSync(directory), directory);
  assert.ok(nodeModules, 'installed dependencies must be verified');
  const manifestBytes = readFileSync(path.join(directory, 'artifact.json'));
  assert.equal(releaseSha(manifestBytes), SCHEMA_REUSABLE_MOTOR_RELEASE.manifestSha256, 'unapproved motor release manifest');
  const manifest = verifySchemaUatRelease(directory, { nodeModules });
  assert.equal(manifest.source.revision, SCHEMA_REUSABLE_MOTOR_RELEASE.revision, 'unapproved motor source revision');
  assert.deepEqual(assertSchemaReleaseRevision(root, manifest.source.revision), manifest.source, 'origin source object differs');
  const motorTreeHash = assertIdenticalSchemaMotorTrees(root, revision, manifest.source.revision);
  assert.equal(motorTreeHash, SCHEMA_REUSABLE_MOTOR_RELEASE.motorTreeHash);
  const files = manifest.artifact.files.filter(item => item.path.startsWith('runtime/motor/'));
  assert.deepEqual(files, SCHEMA_REUSABLE_MOTOR_RELEASE.files, 'unapproved motor binaries'); assertSchemaMotorFiles(directory, files);
  return { directory, provenance: { mode: 'reused-release', fromRevision: manifest.source.revision, fromManifestSha256: releaseSha(manifestBytes),
    motorTreeHash, files, originalBuildTools: { cargo: manifest.tools.cargo, rustc: manifest.tools.rustc } } };
}

/** Bara paket som finns i låsfilen. Verktygens rörliga toppnivåcache räknas inte som beroendekod. */
export function schemaReleaseDependencies(lockFile, nodeModules) {
  const lock = readJson(lockFile), base = realpathSync(nodeModules), packages = [], files = [];
  assert.equal(lock.lockfileVersion, 3); assert.ok(lock.packages?.['']);
  for (const [location, item] of Object.entries(lock.packages).filter(([key]) => key !== '').sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    assert.ok(location.startsWith('node_modules/') && !location.split('/').includes('..') && !item.link, 'nonstandard locked package');
    const relative = location.slice('node_modules/'.length), directory = path.join(base, relative), manifest = path.join(directory, 'package.json');
    if (!existsSync(manifest)) { assert.equal(item.optional, true, 'required dependency is missing: ' + location); packages.push({ path: location, version: item.version, optionalAbsent: true }); continue; }
    assert.ok(!lstatSync(directory).isSymbolicLink(), 'package root symlink refused');
    const actual = readJson(manifest); assert.equal(actual.version, item.version, 'installed dependency differs from lock: ' + location);
    const contents = releaseInventory(directory, location + '/', { links: true, excludeNodeModules: true });
    packages.push({ path: location, version: actual.version, packageJsonSha256: releaseSha(readFileSync(manifest)), files: contents.length,
      contentsSha256: releaseSha(contents), integrity: item.integrity ?? null }); files.push(...contents);
  }
  assert.ok(packages.length > 0);
  return { packageLockSha256: releaseSha(readFileSync(lockFile)), packages, files: sorted(files), sha256: releaseSha({ packages, files: sorted(files) }) };
}

function buildEnvironment() {
  const result = Object.fromEntries(['PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'CARGO_HOME', 'RUSTUP_HOME', 'SDKROOT', 'DEVELOPER_DIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return { ...result, CI: 'true', WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' };
}
async function command(file, args, cwd, log, env) {
  const fd = openSync(log, 'wx', 0o600);
  try {
    const child = spawn(file, args, { cwd, env, stdio: ['ignore', fd, fd] });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    assert.equal(code, 0, 'frozen build failed; inspect private build log');
  } finally { closeSync(fd); }
}

export async function prepareSchemaUatRelease({ revision, directory, motorRelease = null, onStage = () => {} }) {
  assert.match(directory ?? '', /^\/private\/tmp\/schema-uat-release-[a-z0-9-]+$/u, 'new owned release directory required');
  assert.equal(realpathSync(path.dirname(directory)), path.dirname(directory)); assert.equal(existsSync(directory), false);
  const source = assertSchemaReleaseRevision(root, revision); assert.ok(Number(process.versions.node.split('.')[0]) >= 25, 'use the checked Node 25 runtime');
  mkdirSync(directory, { mode: 0o700 });
  const clone = path.join(directory, 'source'), runtime = path.join(directory, 'runtime');
  onStage('cloning-exact-commit'); git(root, ['clone', '--local', '--no-hardlinks', '--no-checkout', root, clone]); git(clone, ['checkout', '--detach', revision]);
  assert.equal(git(clone, ['status', '--porcelain']), ''); assert.deepEqual(assertSchemaReleaseRevision(clone, revision), source);
  const web = path.join(clone, 'web'), dependencies = path.join(root, 'web/node_modules');
  assert.equal(releaseSha(readFileSync(path.join(web, 'package.json'))), releaseSha(readFileSync(path.join(root, 'web/package.json'))), 'installed dependency package manifest differs from frozen commit');
  assert.equal(releaseSha(readFileSync(path.join(web, 'package-lock.json'))), releaseSha(readFileSync(path.join(root, 'web/package-lock.json'))), 'installed dependency lock differs from frozen commit');
  onStage('hashing-locked-dependencies'); const dependencyManifest = schemaReleaseDependencies(path.join(web, 'package-lock.json'), dependencies);
  let reusedMotor = null;
  if (motorRelease !== null) { onStage('verifying-reused-motor'); reusedMotor = verifySchemaReusableMotor({ directory: motorRelease, revision, nodeModules: dependencies }); }
  symlinkSync(realpathSync(dependencies), path.join(web, 'node_modules'), 'dir');
  const fonts = path.join(root, 'web/.vinext/fonts');
  let fontInventory = [];
  if (existsSync(fonts)) {
    fontInventory = releaseInventory(fonts); assert.ok(fontInventory.every(item => /\.(?:woff2?|ttf|otf|css|json)$/u.test(item.path)), 'unexpected font-cache input');
    mkdirSync(path.join(web, '.vinext'), { recursive: true }); cpSync(fonts, path.join(web, '.vinext/fonts'), { recursive: true });
    assert.deepEqual(releaseInventory(path.join(web, '.vinext/fonts')), fontInventory, 'font cache changed while copied');
  }
  const contracts = readFileSync(path.join(web, 'lib/schema-contract.ts'), 'utf8'), motor = readFileSync(path.join(clone, 'schemamotor/crates/model/src/lib.rs'), 'utf8');
  assert.match(contracts, /SCHEMA_CONTRACT_VERSION = 8 as const/u); assert.match(contracts, /SCHEMA_MOTOR_VERSION = 4 as const/u); assert.match(motor, /CONTRACT_VERSION: u32 = 4;/u);
  onStage('building-protected-app'); const env = buildEnvironment();
  await command(process.execPath, ['scripts/run-mode.mjs', 'build', '--mode', 'protected'], web, path.join(directory, 'app-build.log'), env);
  const mark = readJson(path.join(web, 'dist-protected/build-mode.json'));
  assert.equal(mark.mode, 'protected'); assert.equal(mark.revision, revision); assert.equal(mark.node, process.version);
  let motorProvenance;
  if (reusedMotor !== null) {
    onStage('reusing-verified-motor'); motorProvenance = reusedMotor.provenance;
  } else {
    onStage('building-offline-locked-motor');
    await command('cargo', ['build', '--offline', '--locked', '--release'], path.join(clone, 'schemamotor'), path.join(directory, 'motor-build.log'),
      { ...env, CARGO_TARGET_DIR: path.join(directory, 'cargo-target'), CARGO_PROFILE_RELEASE_STRIP: 'none' });
    motorProvenance = { mode: 'built-offline', sourceRevision: revision, motorTreeHash: schemaMotorSourceTree(clone, revision),
      buildTools: { cargo: execFileSync('cargo', ['--version'], { encoding: 'utf8' }).trim(), rustc: execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim() } };
  }
  assert.equal(git(clone, ['status', '--porcelain', '--untracked-files=no']), '', 'tracked sources changed during build');
  mkdirSync(path.join(runtime, 'web'), { recursive: true }); mkdirSync(path.join(runtime, 'motor')); mkdirSync(path.join(directory, 'sql'));
  for (const name of ['scripts', 'dist-protected']) cpSync(path.join(web, name), path.join(runtime, 'web', name), { recursive: true });
  for (const name of ['package.json', 'package-lock.json']) copyFileSync(path.join(web, name), path.join(runtime, 'web', name));
  if (reusedMotor !== null) assertSchemaMotorFiles(reusedMotor.directory, reusedMotor.provenance.files);
  for (const name of ['schemamotor', 'schemamotor-tjanst']) copyFileSync(path.join(reusedMotor === null ? path.join(directory, 'cargo-target/release')
    : path.join(reusedMotor.directory, 'runtime/motor'), name), path.join(runtime, 'motor', name));
  if (reusedMotor !== null) assertSchemaMotorFiles(directory, reusedMotor.provenance.files);
  const sources = schemaUatSources(clone), sql = schemaUatSqlMetadata(sources);
  for (const item of sql) copyFileSync(path.join(clone, 'supabase/migrations', item.file), path.join(directory, 'sql', item.file));
  onStage('verifying-final-inventory');
  assert.deepEqual(schemaReleaseDependencies(path.join(web, 'package-lock.json'), dependencies), dependencyManifest, 'dependencies changed during frozen build');
  const files = [...releaseInventory(runtime, 'runtime/'), ...releaseInventory(path.join(directory, 'sql'), 'sql/')];
  const artifact = { files: sorted(files), fileCount: files.length, sha256: releaseSha(sorted(files)) };
  const manifest = { kind: 'schema-uat-release', status: 'PREPARED', preparedAt: new Date().toISOString(), source, contracts: { app: 8, motor: 4 }, build: mark,
    artifact, sql, dependencies: { file: 'dependencies.json', sha256: releaseSha(dependencyManifest), packages: dependencyManifest.packages.length,
      installedPackages: dependencyManifest.packages.filter(item => !item.optionalAbsent).length, contentFiles: dependencyManifest.files.length },
    fontInputsSha256: releaseSha(fontInventory), tools: { node: process.version, ...(motorProvenance.mode === 'built-offline' ? motorProvenance.buildTools : {}) }, motor: motorProvenance,
    previousRuntimeRevision: PREVIOUS_SCHEMA_REVISION, targetContact: false, authorization: 'pending-concrete-user-approval',
    rollback: { runtime: 'restore both app and motor from previousRuntimeRevision', sqlBeforeCommit: 'transaction rollback', sqlAfterCommit: 'retain additive schema and every saved draft; no DROP, reset or journal deletion' },
    limits: ['No target preflight or installation', 'Release evidence must bind this exact artifact before approval', 'Linked installed dependencies must be rechecked before start', 'No claim of SS 12000 exchange support'] };
  writeFileSync(path.join(directory, 'dependencies.json'), JSON.stringify(dependencyManifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  verifySchemaUatRelease(directory);
  return { revision, artifactSha256: artifact.sha256, manifestSha256: releaseSha(readFileSync(path.join(directory, 'artifact.json'))), fileCount: artifact.fileCount,
    installedPackages: manifest.dependencies.installedPackages, sql, targetContact: false };
}

export function verifySchemaUatRelease(directory, { nodeModules = null } = {}) {
  const manifest = readJson(path.join(directory, 'artifact.json')), dependency = readJson(path.join(directory, 'dependencies.json'));
  assert.equal(manifest.kind, 'schema-uat-release'); assert.equal(manifest.status, 'PREPARED'); assert.equal(manifest.targetContact, false);
  assert.match(manifest.source.revision, /^[a-f0-9]{40}$/u); assert.deepEqual(manifest.contracts, { app: 8, motor: 4 });
  assert.equal(manifest.previousRuntimeRevision, PREVIOUS_SCHEMA_REVISION);
  assert.equal(manifest.authorization, 'pending-concrete-user-approval');
  assert.deepEqual(manifest.sql.map(item => item.file), [...SCHEMA_UAT_MIGRATIONS], 'exact three migrations required');
  const files = sorted([...releaseInventory(path.join(directory, 'runtime'), 'runtime/'), ...releaseInventory(path.join(directory, 'sql'), 'sql/')]);
  assert.deepEqual(files, manifest.artifact.files, 'frozen artifact changed'); assert.equal(files.length, manifest.artifact.fileCount); assert.equal(releaseSha(files), manifest.artifact.sha256);
  assert.equal(releaseSha(dependency), manifest.dependencies.sha256, 'dependency manifest changed');
  for (const item of manifest.sql) {
    const source = readFileSync(path.join(directory, 'sql', item.file));
    assert.equal(releaseSha(source), item.sha256, 'SQL changed'); assert.equal(source.length, item.bytes);
    assert.equal(prepareMigrationSql(source.toString('utf8')).executionSha256, item.executionSha256);
  }
  assert.deepEqual(readJson(path.join(directory, 'runtime/web/dist-protected/build-mode.json')), manifest.build);
  assert.equal(manifest.build.revision, manifest.source.revision); assert.equal(manifest.build.mode, 'protected');
  if (manifest.motor) {
    assert.ok(['built-offline', 'reused-release'].includes(manifest.motor.mode));
    assert.equal(manifest.motor.motorTreeHash, schemaMotorSourceTree(root, manifest.source.revision), 'motor provenance source tree differs');
    if (manifest.motor.mode === 'reused-release') {
      assert.equal(manifest.motor.fromRevision, SCHEMA_REUSABLE_MOTOR_RELEASE.revision); assert.equal(manifest.motor.fromManifestSha256, SCHEMA_REUSABLE_MOTOR_RELEASE.manifestSha256);
      assert.equal(manifest.motor.motorTreeHash, SCHEMA_REUSABLE_MOTOR_RELEASE.motorTreeHash);
      assert.deepEqual(manifest.motor.files, SCHEMA_REUSABLE_MOTOR_RELEASE.files); assertSchemaMotorFiles(directory, manifest.motor.files);
    } else assert.equal(manifest.motor.sourceRevision, manifest.source.revision);
  }
  if (nodeModules !== null) assert.deepEqual(schemaReleaseDependencies(path.join(directory, 'runtime/web/package-lock.json'), nodeModules), dependency, 'installed dependency code changed');
  return manifest;
}

export function parseSchemaReleaseArguments(args) {
  assert.ok([4, 6].includes(args.length)); assert.equal(args[0], '--revision'); assert.equal(args[2], '--directory');
  if (args.length === 6) { assert.equal(args[4], '--motor-release'); assert.ok(args[5] && !args[5].startsWith('--')); }
  return { revision: args[1], directory: args[3], motorRelease: args[5] ?? null };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    if (args[0] === '--verify' && args.length === 2) { const manifest = verifySchemaUatRelease(args[1], { nodeModules: path.join(root, 'web/node_modules') }); console.log(JSON.stringify({ status: 'PASS', revision: manifest.source.revision, files: manifest.artifact.fileCount, targetContact: false })); }
    else { const result = await prepareSchemaUatRelease({ ...parseSchemaReleaseArguments(args), onStage: stage => console.log(JSON.stringify({ stage })) }); console.log(JSON.stringify({ status: 'PREPARED', ...result })); }
  } catch (error) { console.error(JSON.stringify({ status: 'FAIL', name: error.name, message: String(error.message).slice(0, 500), targetContact: false })); process.exitCode = 1; }
}
