import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { api, ApiError, onEpochChange, setKnownEpoch } from './server-client.ts';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; setKnownEpoch(null); });
const details = { kind: 'fields', currentVersion: 2, changedBy: 'Testadministratör', changedAt: '2026-09-28T10:00:00Z', fields: [{ field: 'displayName', submitted: 'Test A', current: 'Test B' }] };
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function response(body, status = 200, epoch = 1) { return new Response(JSON.stringify(body), { status, headers: { 'X-Context-Epoch': String(epoch) } }); }

test('aktuell konflikt ger typade details utan sessionsspärr; ogiltiga details släpps inte igenom', async () => {
  setKnownEpoch(1);
  const locks = []; const stop = onEpochChange(epoch => locks.push(epoch));
  try {
    for (const [input, expected] of [[details, details], [{ ...details, personalNumber: 'TEST-private' }, null]]) {
      globalThis.fetch = async () => response({ code: 'conflict', details: input }, 409);
      await assert.rejects(api.post('/api/elever/test', {}), e => e instanceof ApiError && e.code === 'conflict' && assert.deepEqual(e.details, expected) === undefined);
    }
    assert.deepEqual(locks, []);
  } finally { stop(); }
});

test('fördröjt 409 efter kontextbyte avbryts innan elevfält eller gamla epoch-headern används', async () => {
  setKnownEpoch(1); const late = deferred(); let signal;
  globalThis.fetch = async (_path, options) => { signal = options.signal; return late.promise; };
  const result = api.post('/api/elever/test', {});
  setKnownEpoch(2); assert.equal(signal.aborted, true);
  late.resolve(response({ code: 'conflict', details }, 409, 1));
  await assert.rejects(result, { name: 'AbortError' });
  globalThis.fetch = async (_path, options) => { assert.equal(options.headers.get('X-Context-Epoch'), '2'); return response({}, 200, 2); };
  await api.get('/api/current');
});

test('kontextbyte under läsning av felkropp stoppar 409-details', async () => {
  setKnownEpoch(1); const reading = deferred(); const late = deferred();
  globalThis.fetch = async () => ({ ok: false, status: 409, headers: new Headers(), json: () => { reading.resolve(); return late.promise; } });
  const result = api.post('/api/elever/test', {}); await reading.promise;
  setKnownEpoch(2); late.resolve({ code: 'conflict', details });
  await assert.rejects(result, { name: 'AbortError' });
});

for (const method of ['download', 'downloadPost']) {
  test(`${method}: Blob färdig efter utloggning lämnas aldrig ut`, async () => {
    setKnownEpoch(1); const reading = deferred(); const late = deferred();
    globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers(), blob: () => { reading.resolve(); return late.promise; } });
    assert.equal(typeof api[method], 'function');
    const result = api[method]('/api/elever/export', {}); await reading.promise;
    setKnownEpoch(null); late.resolve(new Blob(['syntetisk elev']));
    await assert.rejects(result, { name: 'AbortError' });
  });
}

test('downloadPost skickar urval i kroppen och no-store med epoch, credentials och abortsignal', async () => {
  setKnownEpoch(3); const body = { ids: ['synthetic'], includePersonalNumber: false };
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/elever/export'); assert.equal(options.method, 'POST');
    assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers.get('X-Context-Epoch'), '3'); assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(options.body), body); assert.ok(options.signal instanceof AbortSignal);
    return new Response('test', { headers: { 'Content-Disposition': 'attachment; filename="elever.csv"' } });
  };
  const result = await api.downloadPost('/api/elever/export', body);
  assert.equal(result.filename, 'elever.csv'); assert.equal(await result.blob.text(), 'test');
});

test('avsiktligt kontextbyte accepteras, gamla lyckade svar avbryts', async () => {
  setKnownEpoch(1); const late = deferred(); const locks = []; const stop = onEpochChange(epoch => locks.push(epoch));
  try {
    globalThis.fetch = async path => path === '/api/context' ? response({ selected: true }, 200, 2) : late.promise;
    const old = api.get('/api/old');
    assert.deepEqual(await api.post('/api/context', {}), { selected: true });
    late.resolve(response({ pupil: 'Test' }, 200, 1));
    await assert.rejects(old, { name: 'AbortError' }); assert.deepEqual(locks, []);
  } finally { stop(); }
});

for (const code of ['context_changed', 'membership_blocked', 'assignment_ended', 'assignment_expired']) {
  test(`${code} behåller spärrnotifiering`, async () => {
    setKnownEpoch(1); const locks = []; const stop = onEpochChange(epoch => locks.push(epoch));
    try {
      globalThis.fetch = async () => response({ code, details }, 409);
      await assert.rejects(api.get('/api/test'), e => e instanceof ApiError && e.code === code && e.details === null);
      assert.deepEqual(locks, [1]);
    } finally { stop(); }
  });
}

test('oväntad ny epoch spärrar och lämnar aldrig ut lyckat innehåll', async () => {
  setKnownEpoch(1); const locks = []; const stop = onEpochChange(epoch => locks.push(epoch));
  try {
    globalThis.fetch = async () => response({ pupil: 'Test' }, 200, 2);
    await assert.rejects(api.get('/api/test'), { name: 'AbortError' });
    assert.deepEqual(locks, [2]);
  } finally { stop(); }
});

test('kontextbyte medan ett avsiktligt kontextbytes kropp läses avbryter även det svaret', async () => {
  setKnownEpoch(1); const reading = deferred(); const late = deferred();
  globalThis.fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'X-Context-Epoch': '2' }), json: () => { reading.resolve(); return late.promise; } });
  const result = api.post('/api/context', {}); await reading.promise;
  setKnownEpoch(null); late.resolve({ selected: true });
  await assert.rejects(result, { name: 'AbortError' });
});

test('fördröjt exportfel efter utloggning avbryts före details', async () => {
  setKnownEpoch(1); const late = deferred();
  globalThis.fetch = async () => late.promise;
  const result = api.downloadPost('/api/elever/export', {});
  setKnownEpoch(null); late.resolve(response({ code: 'conflict', details }, 409));
  await assert.rejects(result, { name: 'AbortError' });
});

test('401 behåller ApiError och avbryter andra pågående svar', async () => {
  setKnownEpoch(1); const late = deferred();
  globalThis.fetch = async path => path === '/api/current' ? response({ code: 'session_expired' }, 401) : late.promise;
  const old = api.get('/api/old');
  await assert.rejects(api.get('/api/current'), e => e instanceof ApiError && e.status === 401);
  late.resolve(response({ pupil: 'Test' }));
  await assert.rejects(old, { name: 'AbortError' });
});

test('första epoch accepteras och fel utan objektkropp blir generiska', async () => {
  globalThis.fetch = async () => response({ ready: true });
  assert.deepEqual(await api.get('/api/test'), { ready: true });
  for (const body of [null, 'private value']) {
    globalThis.fetch = async () => response(body, 400);
    await assert.rejects(api.get('/api/test'), e => e instanceof ApiError && e.code === 'bad_request' && e.details === null);
  }
});
