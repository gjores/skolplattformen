import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRuntimeMode, describeRuntime, APP_MODE_VAR } from './runtime-mode.ts';

test('uttryckligt exempelläge öppnar exempelläget', () => {
  assert.deepEqual(resolveRuntimeMode({ NEXT_PUBLIC_APP_MODE: 'example' }), {
    mode: 'example',
    reason: 'explicit-example',
    ignoredBackendConfig: false,
  });
});

test('saknat eller tomt läge är stängt', () => {
  assert.equal(APP_MODE_VAR, 'NEXT_PUBLIC_APP_MODE');
  for (const env of [{}, { NEXT_PUBLIC_APP_MODE: '' }, { NEXT_PUBLIC_APP_MODE: undefined }]) {
    const d = resolveRuntimeMode(env);
    assert.equal(d.mode, 'blocked');
    assert.equal(d.reason, 'missing-mode');
    assert.equal(d.ignoredBackendConfig, false);
  }
});

test('skyddat läge öppnas bara med exakt NEXT_PUBLIC_APP_MODE=protected', () => {
  assert.deepEqual(resolveRuntimeMode({ NEXT_PUBLIC_APP_MODE: 'protected' }), {
    mode: 'protected',
    reason: 'explicit-protected',
    ignoredBackendConfig: false,
  });
  for (const value of [' protected', 'Protected', 'PROTECTED']) {
    const d = resolveRuntimeMode({ NEXT_PUBLIC_APP_MODE: value });
    assert.equal(d.mode, 'blocked');
    assert.equal(d.reason, 'unknown-mode');
  }
});

test('okända lägen och annat skiftläge är stängda', () => {
  for (const value of ['demo', 'EXAMPLE', 'Example', ' example', 'example ']) {
    const d = resolveRuntimeMode({ NEXT_PUBLIC_APP_MODE: value });
    assert.equal(d.mode, 'blocked', `läget "${value}" ska vara stängt`);
    assert.equal(d.reason, 'unknown-mode', `läget "${value}" ska vara okänt`);
  }
});

test('URL och nyckel utan läge öppnar aldrig något', () => {
  const d = resolveRuntimeMode({
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.example',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'k',
  });
  assert.equal(d.mode, 'blocked');
  assert.equal(d.reason, 'missing-mode');
  assert.equal(d.ignoredBackendConfig, true);
});

test('exempelläge med URL i miljön förblir exempelläge men markerar ignorerad backendkonfiguration', () => {
  const d = resolveRuntimeMode({
    NEXT_PUBLIC_APP_MODE: 'example',
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.example',
  });
  assert.equal(d.mode, 'example');
  assert.equal(d.reason, 'explicit-example');
  assert.equal(d.ignoredBackendConfig, true);
});

test('describeRuntime ger svensk beskrivning utan URL eller nycklar', () => {
  const example = resolveRuntimeMode({
    NEXT_PUBLIC_APP_MODE: 'example',
    NEXT_PUBLIC_SUPABASE_URL: 'https://hemlig.example',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'hemlig-nyckel',
  });
  assert.equal(describeRuntime(example), 'Provmiljö: exempelläge utan databasanslutning');
  const protectedMode = resolveRuntimeMode({
    NEXT_PUBLIC_APP_MODE: 'protected',
    NEXT_PUBLIC_SUPABASE_URL: 'https://hemlig.example',
  });
  assert.equal(describeRuntime(protectedMode), 'Skyddad provmiljö: åtkomst via serverlagret');
  assert.equal(describeRuntime(resolveRuntimeMode({})), 'Stängd start (missing-mode)');
  for (const text of [describeRuntime(example), describeRuntime(protectedMode)]) {
    assert.ok(!text.includes('hemlig'));
    assert.ok(!text.includes('http'));
  }
});
