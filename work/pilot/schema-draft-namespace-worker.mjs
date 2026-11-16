// Bara provets nätverksnamnrymd. Produktens byggda moduler och säkerhetsgrind lämnas oförändrade.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer as tcpServer, connect } from 'node:net';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import path from 'node:path';
import { builtWorkerModules } from './preview-worker-modules.mjs';

const settings = JSON.parse(readFileSync('/config/worker-private.json', 'utf8'));
const require = createRequire('/deps/package.json');
const { unstable_getMiniflareWorkerOptions } = require('wrangler');
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const listen = (server, port) => new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
const pg = tcpServer(socket => {
  const upstream = connect({ host: 'schema-test-host', port: settings.postgresPort });
  socket.on('error', () => upstream.destroy()); upstream.on('error', () => socket.destroy());
  socket.pipe(upstream); upstream.pipe(socket);
});
const auth = httpServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/auth/v1/token?grant_type=id_token') { req.resume(); res.writeHead(404).end(); return; }
  const upstream = httpRequest({ hostname: settings.authHost, port: 9999, path: '/token?grant_type=id_token', method: req.method,
    headers: { ...req.headers, host: settings.authHost + ':9999' } }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
  upstream.on('error', () => { res.writeHead(502).end(); }); req.pipe(upstream);
});
await listen(pg, 56322); await listen(auth, 56331);
assert.equal(new URL(settings.bindings.DATABASE_URL).hostname, '127.0.0.1');
assert.equal(new URL(settings.bindings.DATABASE_URL).port, '56322');
assert.equal(settings.bindings.SUPABASE_URL, 'http://127.0.0.1:56331');
const config = '/artifact/server/wrangler.json';
const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions(config); assert.ok(main);
const { modulesRules: _rules, ...options } = workerOptions;
const modules = await builtWorkerModules(main, path.dirname(config));
const allowed = new Set([settings.bindings.SUPABASE_URL, settings.bindings.SCHEMAMOTOR_URL, new URL(settings.bindings.OIDC_ISSUER).origin]);
const runtime = new Miniflare(convertV4MiniflareOptions({ host: '0.0.0.0', port: 8080, log: new Log(LogLevel.WARN),
  workers: [{ ...options, ...modules, bindings: { ...options.bindings, ...settings.bindings }, outboundService: async request => {
    const url = new URL(request.url); assert.ok(allowed.has(url.origin), 'Unexpected outbound origin in owned namespace');
    const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.arrayBuffer();
    if (url.origin === settings.bindings.SCHEMAMOTOR_URL && body) {
      const text = new TextDecoder().decode(body);
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(text), 'Internal UUID reached motor');
      assert.ok(!text.includes('Syntetisk') && !text.includes('undervisning:'), 'Named source reached motor');
      const data = JSON.parse(text), problem = data.problem ?? data;
      appendFileSync('/evidence/motor-requests.jsonl', JSON.stringify({ path: url.pathname, id: problem.id,
        lessons: problem.lessons?.length ?? 0, clusters: problem.clusters, groups: problem.groups }) + '\n', { mode: 0o600 });
    }
    const response = await fetch(url, { method: request.method, headers: Object.fromEntries(request.headers), redirect: 'manual', ...(body ? { body } : {}) });
    const headers = new Headers(response.headers); headers.delete('content-encoding'); headers.delete('content-length'); headers.delete('transfer-encoding');
    return new Response(await response.arrayBuffer(), { status: response.status, headers });
  } }, ...externalWorkers] }));
await runtime.ready;
console.log(JSON.stringify({ stage: 'namespace-ready', node: process.version, arch: process.arch, databasePort: 56322, authPort: 56331 }));
let finish; const closed = new Promise(resolve => { finish = resolve; });
process.once('SIGTERM', finish); process.once('SIGINT', finish);
try { await closed; }
finally { await runtime.dispose(); auth.closeAllConnections(); auth.close(); pg.close(); }
