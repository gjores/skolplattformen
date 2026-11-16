import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { releaseInventory, schemaReleaseDependencies, assertSchemaReleaseRevision, prepareSchemaUatRelease, verifySchemaUatRelease, PREVIOUS_SCHEMA_REVISION, releaseSha,
  assertIdenticalSchemaMotorTrees, assertSchemaMotorFiles, verifySchemaReusableMotor, parseSchemaReleaseArguments } from './prepare-uat-release.mjs';
import { schemaUatSources, schemaUatSqlMetadata } from '../pilot/schema-uat-install-core.mjs';

const temporary = fn => { const directory = mkdtempSync(path.join(tmpdir(), 'schema-release-unit-')); try { return fn(directory); } finally { rmSync(directory, { recursive: true, force: true }); } };
test('freeze accepts only an exact complete existing commit; HEAD/abbreviation/another object are rejected', () => temporary(directory => {
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init']); writeFileSync(path.join(directory, 'synthetic.txt'), 'synthetic'); git(['add', 'synthetic.txt']);
  git(['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'synthetic']);
  const revision = git(['rev-parse', 'HEAD']); assert.equal(assertSchemaReleaseRevision(directory, revision).revision, revision);
  for (const invalid of ['HEAD', revision.slice(0, 10), 'a'.repeat(40), git(['rev-parse', 'HEAD^{tree}'])]) assert.throws(() => assertSchemaReleaseRevision(directory, invalid));
}));
test('product inventory detects content changes and rejects secret/config files and symlinks', () => temporary(directory => {
  const file = path.join(directory, 'app.js'); writeFileSync(file, 'first'); const original = releaseInventory(directory);
  writeFileSync(file, 'other'); assert.notDeepEqual(releaseInventory(directory), original);
  writeFileSync(path.join(directory, '.dev.vars'), 'synthetic'); assert.throws(() => releaseInventory(directory), /private runtime file/u);
  rmSync(path.join(directory, '.dev.vars')); symlinkSync(file, path.join(directory, 'alias.js')); assert.throws(() => releaseInventory(directory), /product symlink/u);
}));
test('dependency manifest binds required/optional packages, exact versions and installed executable contents', () => temporary(directory => {
  const modules = path.join(directory, 'node_modules'); mkdirSync(path.join(modules, 'synthetic'), { recursive: true });
  const lock = path.join(directory, 'package-lock.json'), packageJson = path.join(modules, 'synthetic/package.json'), implementation = path.join(modules, 'synthetic/index.js');
  writeFileSync(lock, JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/synthetic': { version: '1.0.0', integrity: 'sha512-synthetic' }, 'node_modules/optional': { version: '1.0.0', optional: true } } }));
  writeFileSync(packageJson, JSON.stringify({ name: 'synthetic', version: '1.0.0' })); writeFileSync(implementation, 'first');
  const first = schemaReleaseDependencies(lock, modules); assert.equal(first.packages.length, 2); assert.ok(first.packages.some(item => item.optionalAbsent));
  writeFileSync(implementation, 'other'); assert.notEqual(schemaReleaseDependencies(lock, modules).sha256, first.sha256);
  writeFileSync(packageJson, JSON.stringify({ name: 'synthetic', version: '2.0.0' })); assert.throws(() => schemaReleaseDependencies(lock, modules), /differs from lock/u);
  rmSync(path.join(modules, 'synthetic'), { recursive: true }); assert.throws(() => schemaReleaseDependencies(lock, modules), /required dependency is missing/u);
}));
test('release preparation rejects target/runtime paths before any build, clone or connection', async () => {
  for (const directory of ['/Users/petter.gjores/dev/skolplattform/work/pilot/targets/protected/runtime/new', '/private/tmp/schema-uat-release-ok/../other', '/tmp/arbitrary']) {
    await assert.rejects(prepareSchemaUatRelease({ directory, revision: 'a'.repeat(40) }), /owned release directory/u);
  }
});
test('frozen verification rejects changed product, dependency evidence, omitted SQL and mismatched build revision', () => temporary(directory => {
  const write = (relative, value) => { const file = path.join(directory, relative); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value)); };
  const sources = schemaUatSources(), sql = schemaUatSqlMetadata(sources), dependency = { packages: [], files: [] }, revision = 'c'.repeat(40);
  const build = { mode: 'protected', revision, node: process.version, builtAt: '2026-11-16T12:00:00Z' };
  write('runtime/web/dist-protected/build-mode.json', build); write('runtime/web/dist-protected/app.js', 'synthetic app');
  write('runtime/motor/schemamotor-tjanst', 'synthetic motor'); for (const item of sql) write('sql/' + item.file, sources[item.file].sql);
  const files = [...releaseInventory(path.join(directory, 'runtime'), 'runtime/'), ...releaseInventory(path.join(directory, 'sql'), 'sql/')].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const manifest = { kind: 'schema-uat-release', status: 'PREPARED', targetContact: false, source: { revision }, contracts: { app: 8, motor: 4 },
    previousRuntimeRevision: PREVIOUS_SCHEMA_REVISION, authorization: 'pending-concrete-user-approval', sql, artifact: { files, fileCount: files.length, sha256: releaseSha(files) },
    dependencies: { sha256: releaseSha(dependency) }, build };
  write('dependencies.json', dependency); write('artifact.json', manifest); assert.equal(verifySchemaUatRelease(directory).source.revision, revision);
  write('runtime/web/dist-protected/app.js', 'changed'); assert.throws(() => verifySchemaUatRelease(directory), /artifact changed/u); write('runtime/web/dist-protected/app.js', 'synthetic app');
  write('dependencies.json', { changed: true }); assert.throws(() => verifySchemaUatRelease(directory), /dependency manifest changed/u); write('dependencies.json', dependency);
  write('artifact.json', { ...manifest, sql: sql.slice(0, -1) }); assert.throws(() => verifySchemaUatRelease(directory), /exact three migrations/u);
  write('artifact.json', { ...manifest, source: { revision: 'd'.repeat(40) } }); assert.throws(() => verifySchemaUatRelease(directory));
}));
test('motor reuse accepts a UI-only commit but rejects any change in the entire motor tree or a missing object/tree', () => temporary(directory => {
  const git = args => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => { git(['add', '.']); git(['-c', 'user.name=synthetic', '-c', 'user.email=synthetic@example.invalid', 'commit', '-m', 'synthetic']); return git(['rev-parse', 'HEAD']); };
  git(['init']); writeFileSync(path.join(directory, 'app.tsx'), 'before'); const missingTree = commit();
  mkdirSync(path.join(directory, 'schemamotor')); writeFileSync(path.join(directory, 'schemamotor/Cargo.lock'), 'synthetic lock');
  writeFileSync(path.join(directory, 'schemamotor/README.md'), 'original non-Rust input'); const fromRevision = commit();
  writeFileSync(path.join(directory, 'app.tsx'), 'UI-only change'); const uiRevision = commit();
  assert.equal(assertIdenticalSchemaMotorTrees(directory, uiRevision, fromRevision), git(['rev-parse', fromRevision + ':schemamotor']));
  writeFileSync(path.join(directory, 'schemamotor/README.md'), 'changed non-Rust input'); const changed = commit();
  assert.throws(() => assertIdenticalSchemaMotorTrees(directory, changed, fromRevision), /entire schemamotor source tree changed/u);
  assert.throws(() => assertIdenticalSchemaMotorTrees(directory, missingTree, fromRevision));
  assert.throws(() => assertIdenticalSchemaMotorTrees(directory, 'a'.repeat(40), fromRevision));
  assert.throws(() => assertIdenticalSchemaMotorTrees(directory, uiRevision.slice(0, 10), fromRevision));
}));
test('reused motor inventory refuses changed or missing bytes, non-executable files, links and any third file', () => temporary(directory => {
  const motor = path.join(directory, 'runtime/motor'); mkdirSync(motor, { recursive: true });
  const cli = path.join(motor, 'schemamotor'), service = path.join(motor, 'schemamotor-tjanst');
  writeFileSync(cli, 'original CLI', { mode: 0o755 }); writeFileSync(service, 'original service', { mode: 0o755 });
  const files = releaseInventory(motor, 'runtime/motor/'); assert.equal(assertSchemaMotorFiles(directory, files).length, 2);
  writeFileSync(service, 'changed bytes'); assert.throws(() => assertSchemaMotorFiles(directory, files), /inventory changed/u); writeFileSync(service, 'original service');
  chmodSync(service, 0o644); assert.throws(() => assertSchemaMotorFiles(directory, files), /inventory changed/u); chmodSync(service, 0o755);
  writeFileSync(path.join(motor, 'third'), 'unexpected'); assert.throws(() => assertSchemaMotorFiles(directory, files), /inventory changed/u); rmSync(path.join(motor, 'third'));
  rmSync(service); assert.throws(() => assertSchemaMotorFiles(directory, files), /inventory changed/u);
  symlinkSync(cli, service); assert.throws(() => assertSchemaMotorFiles(directory, files), /symlink refused/u);
  assert.throws(() => assertSchemaMotorFiles(directory, files.slice(0, 1)), /exact two/u);
}));
test('self-described PREPARED release cannot replace the explicitly pinned reusable release', () => {
  const directory = '/private/tmp/schema-uat-release-unit-' + randomUUID(); mkdirSync(directory, { mode: 0o700 });
  try { writeFileSync(path.join(directory, 'artifact.json'), JSON.stringify({ kind: 'schema-uat-release', status: 'PREPARED', source: { revision: 'a'.repeat(40) } }));
    assert.throws(() => verifySchemaReusableMotor({ directory, revision: 'b'.repeat(40), nodeModules: path.join(directory, 'node_modules') }), /unapproved motor release manifest/u);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('CLI defaults to building and accepts reuse only as the final explicit optional pair', () => {
  const args = ['--revision', 'a'.repeat(40), '--directory', '/private/tmp/schema-uat-release-synthetic'];
  assert.equal(parseSchemaReleaseArguments(args).motorRelease, null);
  assert.equal(parseSchemaReleaseArguments([...args, '--motor-release', '/private/tmp/schema-uat-release-origin']).motorRelease, '/private/tmp/schema-uat-release-origin');
  for (const invalid of [[...args, '--motor-release'], [...args, '--other', 'anything'], [...args, '--motor-release', '--flag'], [...args, '--motor-release', 'one', '--motor-release', 'two']]) {
    assert.throws(() => parseSchemaReleaseArguments(invalid));
  }
});
