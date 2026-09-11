import http from 'node:http';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const upstreamPort = 3001;
const phonePort = 3002;

// Telefonvägen startar bara ett bygge som är märkt som exempelläge av
// scripts/run-mode.mjs. Ett omärkt eller annat bygge vägras.
const marker = new URL('../dist/build-mode.json', import.meta.url);
let mode;
try { mode = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch { mode = null; }
if (!mode || mode.mode !== 'example') {
  console.error('Bygget saknar exempelläge. Kör npm run build:example först.');
  process.exit(2);
}
console.log(`Telefonförhandsvisning: läge ${mode.mode}, revision ${mode.revision}`);

const child = spawn(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'dev',
  '--config', 'dist/server/wrangler.json',
  '--port', String(upstreamPort), '--ip', '127.0.0.1', '--inspector-port', '0',
], {
  cwd: project,
  env: { ...process.env, WRANGLER_WRITE_LOGS: 'false', WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let diagnostics = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
  diagnostics = (diagnostics + data.toString()).slice(-8000);
});

// Expose only the app's read surface; Wrangler's local administration stays on loopback.
const server = http.createServer((req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Felaktig adress.'); return; }
  if (!['GET', 'HEAD'].includes(req.method) || path.startsWith('/cdn-cgi/') || path.startsWith('/__debug')) {
    res.writeHead(404); res.end('Sidan finns inte.'); return;
  }
  const proxy = http.request({
    hostname: '127.0.0.1', port: upstreamPort, path: req.url, method: req.method,
    headers: { ...req.headers, host: `localhost:${upstreamPort}` }, timeout: 15000,
  }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  proxy.on('timeout', () => proxy.destroy(new Error('Upstream timeout')));
  proxy.on('error', () => {
    if (!res.headersSent) res.writeHead(502, {'content-type':'text/plain; charset=utf-8'});
    res.end('Förhandsvisningen är inte tillgänglig. Starta om den på datorn.');
  });
  res.on('close', () => proxy.destroy());
  req.pipe(proxy);
});
let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close();
  child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300).unref();
}
child.on('error', error => { console.error(error.message); stop(1); });
child.on('exit', code => { if (!shuttingDown) { console.error(diagnostics); stop(code || 1); } });
server.on('error', error => { console.error(error.message); stop(1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

function ready() {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${upstreamPort}/`, res => { res.resume(); resolve(res.statusCode === 200); });
    req.setTimeout(1500, () => req.destroy());
    req.on('error', () => resolve(false));
  });
}
let available = false;
for (let i = 0; i < 60 && !shuttingDown; i++) {
  if (await ready()) { available = true; break; }
  await new Promise(resolve => setTimeout(resolve, 500));
}
if (!available) { console.error('Kunde inte starta appen.\n' + diagnostics); stop(1); }
else if (!shuttingDown) server.listen(phonePort, '0.0.0.0', () => {
  console.log('Telefonförhandsvisningen är igång. Använd samma wifi som datorn.');
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) if (address.family === 'IPv4' && !address.internal)
      console.log(`Öppna http://${address.address}:${phonePort}/`);
  }
  console.log('Låt datorn vara vaken. Avsluta med Ctrl+C.');
});
