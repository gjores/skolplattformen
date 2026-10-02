import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { builtWorkerModules } from './preview-worker-modules.mjs';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { convertV4MiniflareOptions } = wranglerRequire('miniflare');

async function fixture(t, files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'worker-module-guard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), source);
  }
  return realpath(root);
}

test('exact entry first and every built chunk included; private vars and metadata never loaded', async t => {
  const root = await fixture(t, {
    'index.js': 'import "./chunks/a.js"; export default () => import("./chunks/b.mjs");',
    'chunks/a.js': 'import "node:buffer"; export const a=1;',
    'chunks/b.mjs': 'export const x=2;',
    '.dev.vars': 'SECRET=synthetic-do-not-load',
    '.private/leak.js': 'synthetic-do-not-load',
    'wrangler.json': '{"synthetic":"do-not-load"}',
    'styles.css': '/* synthetic-do-not-load */',
  });
  const source = await builtWorkerModules(path.join(root, 'index.js'), root);
  assert.equal(source.modules[0].path, path.join(root, 'index.js'));
  assert.equal(source.modulesRoot, root);
  assert.equal(source.modules.length, 3);
  assert.ok(source.modules.every(module => module.type === 'ESModule'));
  assert.ok(!JSON.stringify(source).includes('do-not-load'));
  const converted = convertV4MiniflareOptions({ workers: [{ ...source }] });
  const manifest = converted.workers[0].config.manifest;
  assert.equal(manifest.mainModule, 'index.js');
  assert.deepEqual(Object.keys(manifest.modules), ['index.js', 'chunks/a.js', 'chunks/b.mjs']);
  assert.equal(manifest.modules['chunks/a.js'].contents, 'import "node:buffer"; export const a=1;');
});

test('outside, missing, hidden and unsupported entries cannot become the entrypoint', async t => {
  const root = await fixture(t, { 'index.js': 'export {};', '.hidden.js': 'secret', 'metadata.json': '{}' });
  for (const entry of [path.join(root, '..', 'outside.js'), path.join(root, 'missing.js'), path.join(root, '.hidden.js'), path.join(root, 'metadata.json')]) {
    await assert.rejects(builtWorkerModules(entry, root), /inom serverkatalogen|saknas/u);
  }
});

test('a symlink cannot introduce files outside the built module tree', async t => {
  const root = await fixture(t, { 'index.js': 'export {};' });
  const outside = await fixture(t, { 'outside.js': 'export const privateValue=1;' });
  await symlink(path.join(outside, 'outside.js'), path.join(root, 'linked.js'));
  await assert.rejects(builtWorkerModules(path.join(root, 'index.js'), root), /Symlänkar/u);
});

test('V4 conversion keeps compatibility, variables, assets and external Worker references', async t => {
  const root = await fixture(t, { 'index.js': 'export default {};', 'public/index.html': 'asset' });
  const source = await builtWorkerModules(path.join(root, 'index.js'), root);
  const converted = convertV4MiniflareOptions({
    host: '127.0.0.1', port: 3056,
    workers: [{
      ...source, name: 'synthetic-user-worker', rootPath: root,
      compatibilityDate: '2026-09-03', compatibilityFlags: ['nodejs_compat'],
      bindings: { APP_MODE: 'protected', SESSION_SECRET: 'synthetic-private-value' },
      assets: { directory: path.join(root, 'public'), binding: 'ASSETS' },
      serviceBindings: { TARGET: 'synthetic-external-worker' },
    }, {
      name: 'synthetic-external-worker', modules: true, script: 'export default { fetch() { return new Response("synthetic"); } };',
      compatibilityDate: '2026-09-03',
    }],
  });
  assert.equal(converted.host, '127.0.0.1');
  assert.equal(converted.port, 3056);
  assert.equal(converted.workers.length, 2);
  const config = converted.workers[0].config;
  assert.equal(config.compatibilityDate, '2026-09-03');
  assert.deepEqual(config.compatibilityFlags, ['nodejs_compat']);
  assert.equal(config.env.APP_MODE.value, 'protected');
  assert.equal(config.env.SESSION_SECRET.value, 'synthetic-private-value');
  assert.equal(config.env.TARGET.worker, 'synthetic-external-worker');
  assert.equal(config.assets.directory, path.join(root, 'public'));
  assert.equal(config.env.ASSETS.type, 'assets');
});
