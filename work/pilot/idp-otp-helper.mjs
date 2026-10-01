// Opt-in helper for the isolated local IdP. Never serves seeds or session tokens.
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {assertTarget} from './verify-target.mjs';

export const TEST_OTP_USERS = ['p3.rektor', 'p3.huvudman', 'p3.it'];
export const TEST_IDP_ORIGINS = ['http://127.0.0.1:8180', 'http://host.docker.internal:8180', 'http://localhost:8180'];
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');

export function createOtpHelperServer(codeForUser) {
  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Vary', 'Origin');
    const reply = (status, body) => {
      response.writeHead(status, {'Content-Type': 'application/json'});
      response.end(JSON.stringify(body));
    };
    const port = response.socket.localPort;
    const origin = request.headers.origin;
    if (request.headers.host !== `127.0.0.1:${port}` || !TEST_IDP_ORIGINS.includes(origin)) {
      request.resume(); return reply(403, {error:'local_idp_only'});
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    if (request.url !== '/otp') {request.resume(); return reply(404, {error:'not_found'});}
    if (request.method === 'OPTIONS') {
      if (request.headers['access-control-request-method'] !== 'POST'
        || request.headers['access-control-request-headers']?.toLowerCase() !== 'content-type')
        return reply(403, {error:'invalid_preflight'});
      response.setHeader('Access-Control-Allow-Methods', 'POST');
      response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      response.writeHead(204); return response.end();
    }
    if (request.method !== 'POST' || request.headers['content-type'] !== 'application/json') {
      request.resume(); return reply(405, {error:'post_json_required'});
    }
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    try {
      let body = '';
      for await (const part of request) {
        body += part.toString();
        if (Buffer.byteLength(body) > 1024) {request.resume(); return reply(413, {error:'too_large'});}
      }
      let input;
      try {input = JSON.parse(body);} catch {return reply(400, {error:'invalid_request'});}
      if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'realm,username'
        || input.realm !== 'skolplattform-test' || !TEST_OTP_USERS.includes(input.username))
        return reply(403, {error:'test_account_required'});
      const code = await codeForUser(input.username, abort.signal);
      if (!/^\d{6}$/.test(code)) throw Error('invalid_code');
      if (!abort.signal.aborted) reply(200, {code});
    } catch {
      if (!abort.signal.aborted) reply(503, {error:'local_helper_unavailable'});
    }
  });
}

async function start() {
  if (process.argv.length !== 2) throw Error('no_flags_allowed');
  const manifest = await assertTarget('protected', {requireIdp:true});
  if (manifest.idp.publicUrl !== TEST_IDP_ORIGINS[0] || manifest.idp.containerName !== 'skolplattform-pilot-idp')
    throw Error('local_idp_required');
  const ports = JSON.parse(execFileSync('docker', ['inspect','--format','{{json .NetworkSettings.Ports}}',manifest.idp.containerName], {encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  if (!ports['8080/tcp']?.length || ports['8080/tcp'].some(p => p.HostIp !== '127.0.0.1' || p.HostPort !== '8180'))
    throw Error('loopback_binding_required');
  const dir = path.join(root, 'work/pilot/targets/protected/idp');
  const require = createRequire(path.join(root, 'web/package.json'));
  const {TOTP, Secret} = require('otpauth');
  const issued = new Map();
  const server = createOtpHelperServer(async (username, signal) => {
    if (!fs.existsSync(path.join(dir, 'test-buttons-state.json')) || !manifest.idp.users.some(u => u.username === username && u.totp))
      throw Error('helper_disabled');
    let enrolled = {};
    try {enrolled = JSON.parse(fs.readFileSync(path.join(dir, 'totp-users.json'), 'utf8'));}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    const seed = enrolled[username];
    if (typeof seed !== 'string' || !/^[A-Z2-7]{16,128}$/i.test(seed)) throw Error('enrollment_required');
    const totp = new TOTP({algorithm:'SHA1',digits:6,period:30,secret:Secret.fromBase32(seed)});
    let lastUsed = {};
    try {lastUsed = JSON.parse(fs.readFileSync(path.join(dir, 'totp-last-used.json'), 'utf8'));}
    catch (error) {if (error.code !== 'ENOENT') throw error;}
    const deadline = Date.now() + 35000;
    while (!signal.aborted && Date.now() < deadline) {
      const code = totp.generate();
      if (code !== issued.get(username) && code !== lastUsed[username] && 30000 - Date.now() % 30000 > 4000) {
        issued.set(username, code); return code;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw Error('request_ended');
  });
  server.on('error', () => {console.error('Provkodshjälpen kunde inte starta: LOCAL_HELPER_FAILED');process.exitCode=1;});
  server.listen(8181, '127.0.0.1', () => console.log('Lokal provkodsknapp: hjälptjänst på 127.0.0.1:8181.'));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {await start();} catch {console.error('Provkodshjälpen kunde inte starta: LOCAL_HELPER_FAILED');process.exitCode=1;}
}
