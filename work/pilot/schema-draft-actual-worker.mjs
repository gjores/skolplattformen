// Egen workerd från oförändrad byggd produkt. Reläet ändrar bara nätverksadress till provets helt egna IdP.
import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { builtWorkerModules } from '../../web/scripts/preview-worker-modules.mjs';
import { SCHEMA_ACTUAL_ISSUER } from './schema-draft-actual-runtime.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const { unstable_getMiniflareWorkerOptions } = require('wrangler'), { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = require('miniflare');
const file = process.argv[2]; assert.ok(file?.startsWith('/private/tmp/') && file.endsWith('/worker-private.json'));
let settings = JSON.parse(readFileSync(file, 'utf8'));
async function start(settings) {
const config = path.join(settings.buildRoot, 'server/wrangler.json');
const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions(config); assert.ok(main);
const { modulesRules: _rules, ...options } = workerOptions, modules = await builtWorkerModules(main, path.dirname(config));
const allowed = new Set([settings.bindings.SUPABASE_URL, settings.bindings.SCHEMAMOTOR_URL, `http://127.0.0.1:${settings.port}`]);
const runtime = new Miniflare(convertV4MiniflareOptions({ host: '127.0.0.1', port: settings.port, log: new Log(LogLevel.WARN),
  workers: [{ ...options, ...modules, bindings: { ...options.bindings, ...settings.bindings }, outboundService: async request => {
    const original = new URL(request.url), target = new URL(request.url);
    if (original.origin === new URL(SCHEMA_ACTUAL_ISSUER).origin && original.pathname.startsWith('/realms/skolplattform-test/')) {
      target.protocol = 'http:'; target.host = new URL(settings.idpURL).host;
    } else assert.ok(allowed.has(original.origin), 'Unexpected outbound origin in owned runtime');
    const body = ['GET', 'HEAD'].includes(request.method) ? null : await request.arrayBuffer();
    if (original.origin === settings.bindings.SCHEMAMOTOR_URL && body) {
      const text = new TextDecoder().decode(body); assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/iu.test(text), 'Internal UUID reached motor');
      assert.ok(!text.includes('Syntetisk') && !text.includes('undervisning:'), 'Named source reached motor');
      const data = JSON.parse(text), problem = data.problem ?? data;
      appendFileSync(path.join(path.dirname(file), 'motor-requests.jsonl'), JSON.stringify({ path: original.pathname, id: problem.id,
        lessons: problem.lessons?.length ?? 0, clusters: problem.clusters, groups: problem.groups }) + '\n', { mode: 0o600 });
    }
    const response = await fetch(target, { method: request.method, headers: Object.fromEntries(request.headers), redirect: 'manual', ...(body ? { body } : {}) });
    const headers = new Headers(response.headers); headers.delete('content-encoding'); headers.delete('content-length'); headers.delete('transfer-encoding');
    return new Response(await response.arrayBuffer(), { status: response.status, headers });
  } }, ...externalWorkers] }));
await runtime.ready; return runtime;
}
let runtime = await start(settings), pending = Promise.resolve();
let finish; const closed = new Promise(resolve => { finish = resolve; });
const reload = () => { pending = pending.then(async () => {
  const next = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(next.port, settings.port); assert.equal(next.idpURL, settings.idpURL); assert.deepEqual(next.bindings, settings.bindings);
  assert.ok(path.resolve(next.buildRoot).startsWith(path.dirname(file) + '/ui-'));
  await runtime.dispose(); runtime = await start(next); settings = next;
  appendFileSync(path.join(path.dirname(file), 'worker-reloads.jsonl'), JSON.stringify({ status: 'ready', buildRoot: next.buildRoot, at: new Date().toISOString() }) + '\n', { mode: 0o600 });
}).catch(error => { appendFileSync(path.join(path.dirname(file), 'worker-reloads.jsonl'), JSON.stringify({ status: 'failed', code: error.code ?? error.name }) + '\n', { mode: 0o600 }); process.exitCode = 1; finish(); }); };
process.on('SIGUSR2', reload); process.once('SIGINT', finish); process.once('SIGTERM', finish);
try { await closed; await pending; }
finally { process.off('SIGUSR2', reload); await runtime.dispose(); }
