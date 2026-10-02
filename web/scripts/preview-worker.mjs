// Kör det färdigbyggda Worker-paketet direkt i Miniflares workerd.
// Wrangler läser samma konfiguration/privata vars, men dess dev-proxy används
// inte: avbrutna browseranrop ska inte avsluta hela förhandsvisningen.
import path from 'node:path';
import { createRequire } from 'node:module';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = wranglerRequire('miniflare');
const [configPath, portText] = process.argv.slice(2);
if (!configPath || !/^\d+$/u.test(portText ?? '') || Number(portText) < 1024 || Number(portText) > 65535) {
  throw new Error('Förhandsvisning kräver byggkonfiguration och en lokal port.');
}
const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions(path.resolve(configPath));
if (!main) throw new Error('Byggets Worker-entrypoint saknas.');
const runtime = new Miniflare(convertV4MiniflareOptions({
  host: '127.0.0.1', port: Number(portText),
  log: new Log(LogLevel.INFO),
  workers: [{ ...workerOptions, modules: true, scriptPath: main }, ...externalWorkers],
}));
try {
  const ready = await runtime.ready;
  console.log(`Byggd Worker körs på ${ready.origin} (workerd, direkt lokal förhandsvisning).`);
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} finally {
  await runtime.dispose();
}
