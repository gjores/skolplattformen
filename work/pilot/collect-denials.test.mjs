import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKong, collectKong, validateCursor, parseArgs } from './collect-denials.mjs';
import { kongConfig } from './configure-audit-source.mjs';
const source = 'a'.repeat(64);
const row = { schema:'phase3-ingress-v1', requestId:'b'.repeat(32), time:'2026-09-24T10:00:00+00:00', status:401, route:'rest' };
test('only source allowlist survives hostile fields', () => {
  const event = normalizeKong(JSON.stringify({...row, actor:'forged', req:{authorization:'secret'}, body:'pupil-name', routeId:'private-id'}),source);
  assert.equal(event.actor,null);
  assert.equal(event.outcome,'rejected');
  assert.doesNotMatch(JSON.stringify(event),/forged|secret|pupil-name|private-id/);
});
test('reject malformed or non-schema sources and arbitrary route values', () => {
  for (const patch of [{requestId:'client-id'},{time:'anything'},{status:'401'},{status:999},{route:'/rest/v1/private-id'}]) assert.equal(normalizeKong(JSON.stringify({...row,...patch}),source),null);
  assert.equal(normalizeKong('unstructured raw error',source),null);
  assert.equal(normalizeKong(JSON.stringify(row),'invalid-source'),null);
});
test('deduplicate source ids, never actor or same-second timestamps', () => {
  const raw = [row,row,{...row,requestId:'c'.repeat(32)}].map(JSON.stringify).join('\n');
  assert.equal(collectKong(raw,source).events.length,2);
  assert.equal(collectKong('{"schema":"phase3-ingress-v1"}',source).malformed,1);
});
test('successful ingress does not assert denied access', () => {
  assert.equal(normalizeKong(JSON.stringify({...row,status:200}),source).outcome,'received');
});
test('restart and unproven rotation cannot pass continuity', () => {
  assert.equal(validateCursor({id:'a',startedAt:'a'},{id:'b',startedAt:'b'}).reason,'source-restarted');
  assert.equal(validateCursor({id:'a',startedAt:'a'},{id:'a',startedAt:'a'}).status,'BLOCKED');
  assert.equal(validateCursor(null,{}).status,'BLOCKED');
});
test('configuration emits no raw request/header/body and is idempotent', () => {
  const config=kongConfig('server {\n access_log logs/access.log;\n}');
  const format=config.split('\n').find(x=>x.startsWith('log_format'));
  assert.doesNotMatch(format,/request_uri|http_|request_body|args/);
  assert.match(format,/\$request_id/);
  assert.equal(kongConfig(config),config);
  assert.throws(()=>kongConfig('unrecognized configuration'));
});
test('unknown flags and output escape refused', () => {
  for(const args of [['--linked'],['--target','baseline'],['--out','/tmp/private.json'],['--probe','--probe']]) assert.throws(()=>parseArgs(args));
  assert.equal(parseArgs(['--probe']).probe,true);
});
