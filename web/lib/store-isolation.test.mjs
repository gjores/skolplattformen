// Transportprov av de riktiga laddarna: ingen klient skapas ur miljön, ingen
// anonym inloggning, ingen demoetablering, ingen seedning och inga
// skrivningar vid vanlig laddning. Allt går genom en inspelande fetch mot en
// loopback-adress som aldrig nås.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Fejkvärden sätts FÖRE import: appen får inte skapa klient av dem.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exempel.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'falsk';

const supabaseModule = await import('./supabase.ts');
const { supabase, hasBackend, installClientForTests } = supabaseModule;
const { loadOrganisation } = await import('./organisation-store.ts');
const { loadTimplans, loadSchoolYears } = await import('./planning-store.ts');

const ORGANIZER_ID = '00000000-0000-4000-8000-0000000000aa';

/** @type {{ method: string, url: string, prefer: string | null }[]} */
const calls = [];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function recordingFetch(input, init) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = String(input instanceof Request ? input.url : input);
  calls.push({ method, url, prefer: headers.get('prefer') });
  const path = new URL(url).pathname;
  if (method === 'POST' && path === '/rest/v1/rpc/current_organizer_id') return json(ORGANIZER_ID);
  if (method !== 'GET') return json({ message: 'förbjuden av testet' }, 403);
  if ((headers.get('accept') ?? '').includes('vnd.pgrst.object')) {
    return json({
      id: ORGANIZER_ID,
      name: 'Tom huvudman',
      organization_number: null,
      type: 'Kommunal',
      created_at: '2026-01-01T00:00:00Z',
    });
  }
  return json([]);
}

const fake = createClient('http://127.0.0.1:1', 'lokal-testnyckel', {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: recordingFetch },
});

// Namnet på den borttagna demoinloggningen sätts ihop vid körning så att
// grep-grinden "inget sådant namn i lib/ och app/" förblir meningsfull.
const removedDemoLogin = ['signIn', 'Demo'].join('');

test('miljövärden skapar ingen klient och demoinloggningen finns inte längre', async () => {
  assert.equal(supabase(), null);
  assert.equal(hasBackend, false);
  assert.ok(!(removedDemoLogin in supabaseModule), `${removedDemoLogin} ska vara borttagen`);
  assert.equal(supabaseModule[removedDemoLogin], undefined);
  await assert.rejects(loadOrganisation(), /Ingen backend konfigurerad/);
  assert.equal(calls.length, 0, 'inga anrop utan installerad klient');
});

test('loadOrganisation läser tomt utan att seeda', async () => {
  installClientForTests(fake);
  const state = await loadOrganisation();
  assert.equal(state.units.length, 0);
  assert.equal(state.offerings.length, 0);
  assert.equal(state.activeUnitId, '');
  assert.equal(state.organizer.name, 'Tom huvudman');
});

test('loadTimplans och loadSchoolYears ger tomt resultat utan seedning', async () => {
  installClientForTests(fake);
  assert.deepEqual(await loadTimplans([]), []);
  assert.deepEqual(await loadSchoolYears('unit-x', ['GR']), []);
});

test('inspelad transport: ingen inloggning, ingen bootstrap_demo_profile, inga skrivningar', () => {
  assert.ok(calls.length > 0, 'laddningarna ska ha gjort anrop');
  for (const call of calls) {
    assert.ok(!call.url.includes('/auth/v1/'), `oväntat auth-anrop: ${call.url}`);
    assert.ok(!call.url.includes('bootstrap_demo_profile'), `oväntad demoetablering: ${call.url}`);
    assert.ok(!['DELETE', 'PATCH', 'PUT'].includes(call.method), `oväntad skrivning: ${call.method} ${call.url}`);
    if (call.method !== 'GET') {
      assert.equal(call.method, 'POST');
      assert.ok(call.url.endsWith('/rest/v1/rpc/current_organizer_id'), `oväntat POST-anrop: ${call.url}`);
    }
    assert.ok(!(call.prefer ?? '').includes('resolution=merge-duplicates'), `oväntad upsert: ${call.url}`);
  }
  installClientForTests(null);
  assert.equal(supabase(), null);
});
