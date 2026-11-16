#!/usr/bin/env node
// Reproducerbara verifieringsverktyg, inga produkt-/målkonfigurationer eller säkerhetsgrindar ändras.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [flag, destination] = process.argv.slice(2); assert.equal(flag, '--out');
const directory = path.resolve(destination); assert.match(directory, /^\/private\/tmp\/[a-z0-9/-]+$/u); assert.equal(existsSync(directory), false);
mkdirSync(directory, { mode: 0o700 });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const image = 'sha256:5b6c2c6cbc90b6085e3f9b3086110b1eccedb643374137bfdcd1d2f5c78f6cd1';
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000 }).trim();
assert.equal(docker(['image', 'inspect', image, '--format', '{{.Architecture}}']), 'arm64');
const version = 'v25.9.0', filename = `node-${version}-linux-arm64.tar.xz`, url = `https://nodejs.org/dist/${version}/`;
const download = async address => { const result = await fetch(address, { signal: AbortSignal.timeout(60000) }); assert.ok(result.ok); return Buffer.from(await result.arrayBuffer()); };
const sums = (await download(url + 'SHASUMS256.txt')).toString('utf8');
const expected = sums.split('\n').find(line => line.endsWith('  ' + filename))?.split(' ')[0]; assert.match(expected ?? '', /^[0-9a-f]{64}$/u);
const nodeArchive = await download(url + filename); assert.equal(digest(nodeArchive), expected);
writeFileSync(path.join(directory, 'node.tar.xz'), nodeArchive, { mode: 0o600 }); mkdirSync(path.join(directory, 'node'));
execFileSync('tar', ['-xJf', path.join(directory, 'node.tar.xz'), '-C', path.join(directory, 'node'), '--strip-components=1', filename.slice(0, -7) + '/bin/node']);
const lock = JSON.parse(readFileSync(path.join(root, 'web/package-lock.json'), 'utf8')), packages = {};
for (const [name, archive] of [['@cloudflare/workerd-linux-arm64', 'workerd.tgz'], ['@esbuild/linux-arm64', 'esbuild.tgz']]) {
  const item = lock.packages['node_modules/' + name]; assert.ok(item && new URL(item.resolved).hostname === 'registry.npmjs.org');
  const bytes = await download(item.resolved); assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), item.integrity);
  writeFileSync(path.join(directory, archive), bytes, { mode: 0o600 }); const target = path.join(directory, 'node_modules', name); mkdirSync(target, { recursive: true });
  execFileSync('tar', ['-xzf', path.join(directory, archive), '-C', target, '--strip-components=1']);
  packages[name] = { name, version: item.version, url: item.resolved, integrity: item.integrity,
    binarySha256: digest(readFileSync(path.join(target, 'bin', name.startsWith('@cloudflare') ? 'workerd' : 'esbuild'))) };
}
// Signerad Debian-metadata och dessutom exakt version+arkivhash. Det tillfälliga hämtarobjektet försvinner automatiskt.
const libatomic = { version: '12.2.0-14+deb12u1', arch: 'arm64', archiveSha256: '1693aa13ce2b30d061a519fc28b77b9bab8c8e45804ced5969d99821e1bc2159' };
const container = 'schema-linux-dependency-' + randomUUID().replaceAll('-', '');
try {
  docker(['run', '--rm', '--name', container, '--label', 'skolplattform.schema-actual=' + container, '--volume', directory + ':/owned:rw', image,
    '/bin/sh', '-c', 'apt-get update -qq && cd /owned && apt-get download libatomic1=12.2.0-14+deb12u1 && dpkg-deb -x libatomic1_*.deb libatomic']);
} finally {
  if (docker(['ps', '-a', '--filter', 'label=skolplattform.schema-actual=' + container, '--format', '{{.Names}}']) === container) {
    assert.equal(docker(['inspect', '--format', '{{index .Config.Labels "skolplattform.schema-actual"}}', container]), container);
    docker(['rm', '-f', container]);
  }
}
assert.equal(digest(readFileSync(path.join(directory, 'libatomic1_12.2.0-14+deb12u1_arm64.deb'))), libatomic.archiveSha256);
libatomic.binarySha256 = digest(readFileSync(path.join(directory, 'libatomic/usr/lib/aarch64-linux-gnu/libatomic.so.1.2.0')));
const proof = { image, node: { version, url: url + filename, archiveSha256: expected, binarySha256: digest(readFileSync(path.join(directory, 'node/bin/node'))) },
  workerd: packages['@cloudflare/workerd-linux-arm64'], esbuild: packages['@esbuild/linux-arm64'], libatomic,
  packageLockSha256: digest(readFileSync(path.join(root, 'web/package-lock.json'))) };
writeFileSync(path.join(directory, 'integrity.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ status: 'PREPARED', directory, image, node: version, workerd: proof.workerd.version, esbuild: proof.esbuild.version }));
