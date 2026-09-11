// KNOWN-ISSUE: äldre skrivning som når lagret sist. Ägare: fas 5 (ADMIN-04 /
// bevarade planeringsflöden) — beständig timplansredigering får inte öppnas i
// skyddat läge förrän detta är grönt. Källa: CONCERNS.md Known Bugs;
// organisation-workspace.tsx runTimplan; planning-store.ts writeCells.
//
// Reproducerare, INTE regressionsprov. Filnamnet slutar på .repro.mjs så att
// den inte plockas upp av globben lib/*.test.mjs. Den anropar de riktiga
// lagerfunktionerna persistTimplans/loadTimplans genom en kontrollerad
// transport (fake-PostgREST i minnet) där svarstiderna styrs per anrop.
// Assertionerna uttrycker det KORREKTA beteendet; att de faller är beviset
// för att felet finns kvar. Röd = som väntat. Grön = utred om felet är borta.
//
//   node --test lib/save-order.repro.mjs
//
// Ändra inte planning-store.ts härifrån: rättningen (kö/generationskontroll
// och id-mappning före nästa skrivning) hör till fas 5.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const { installClientForTests } = await import('./supabase.ts');
const { persistTimplans, loadTimplans } = await import('./planning-store.ts');

const ORGANIZER_ID = '00000000-0000-4000-8000-0000000000aa';
const ACTOR_ID = '10000000-0000-4000-8000-0000000000ee';
const SLOW_UPSERT_MS = 150;

// ------------------------------------------------------------ fake-lager

/** In-memory-tabeller. timplan_cells nycklas som `timplan_id:row_id`. */
const tables = {
  timplans: new Map(),
  timplan_cells: new Map(),
  timplan_events: [],
};
let nextTimplanNo = 0;
let cellUpserts = 0;
const t0 = Date.now();
/** @type {{ at: number, line: string }[]} */
const log = [];
const note = (line) => {
  const at = Date.now() - t0;
  log.push({ at, line });
  console.log(`  [+${String(at).padStart(4)} ms] ${line}`);
};

function resetTables() {
  tables.timplans.clear();
  tables.timplan_cells.clear();
  tables.timplan_events.length = 0;
  cellUpserts = 0;
}

/**
 * Fördröjning per anrop: det första upsert-anropet till timplan_cells hålls
 * SLOW_UPSERT_MS i "nätverket", alla senare svarar direkt. Det speglar
 * varierande svarstider — utlösaren i CONCERNS.md.
 */
function delay(url, method, prefer) {
  const path = new URL(url).pathname;
  if (method === 'POST' && path === '/rest/v1/timplan_cells' && prefer.includes('resolution=merge-duplicates')) {
    cellUpserts += 1;
    return cellUpserts === 1 ? SLOW_UPSERT_MS : 0;
  }
  return 0;
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function json(body, status = 200) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
const pgError = (code, message, status) =>
  json({ code, message, details: null, hint: null }, status);

async function fakeFetch(input, init) {
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = String(input instanceof Request ? input.url : input);
  const prefer = headers.get('prefer') ?? '';
  const accept = headers.get('accept') ?? '';
  const path = new URL(url).pathname;
  const rawBody = init?.body ?? (input instanceof Request ? await input.text() : undefined);
  const body = typeof rawBody === 'string' && rawBody.length ? JSON.parse(rawBody) : undefined;

  const wait = delay(url, method, prefer);
  const label = `${method} ${path}${describe(body)}`;
  note(`${label} — skickat${wait ? ` (fördröjs ${wait} ms)` : ''}`);
  await sleep(wait);

  // Hela svaret räknas fram först när fördröjningen är över: det är då
  // skrivningen "når lagret".
  if (method === 'GET' && path === '/auth/v1/user') {
    return json({
      id: ACTOR_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'prov@example.test',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      is_anonymous: false,
    });
  }
  if (method === 'POST' && path === '/rest/v1/rpc/current_organizer_id') {
    return json(ORGANIZER_ID);
  }
  if (method === 'POST' && path === '/rest/v1/timplans') {
    nextTimplanNo += 1;
    const row = {
      id: `20000000-0000-4000-8000-${String(nextTimplanNo).padStart(12, '0')}`,
      organizer_id: body.organizer_id,
      offering_id: body.offering_id,
      version: body.version,
      status: 'utkast',
      basis: body.basis,
      catalog_fetched: body.catalog_fetched ?? null,
      decided_on: null,
      created_by: body.created_by ?? null,
      created_at: new Date().toISOString(),
    };
    tables.timplans.set(row.id, row);
    note(`  → timplans fick lagrets id ${row.id}`);
    return json(accept.includes('vnd.pgrst.object') ? row : [row], 201);
  }
  if (method === 'POST' && path === '/rest/v1/timplan_cells') {
    if (!prefer.includes('resolution=merge-duplicates')) return pgError('PGRST000', 'väntade upsert', 400);
    for (const cell of body) {
      if (!tables.timplans.has(cell.timplan_id)) {
        note(`  → 23503: timplan_cells.timplan_id ${cell.timplan_id} finns inte i timplans`);
        return pgError(
          '23503',
          'insert or update on table "timplan_cells" violates foreign key constraint "timplan_cells_timplan_id_fkey"',
          409,
        );
      }
      tables.timplan_cells.set(`${cell.timplan_id}:${cell.row_id}`, { ...cell, hours: [...cell.hours] });
      note(`  → timplan_cells ${cell.timplan_id}:${cell.row_id} = [${cell.hours.join(', ')}] nådde lagret`);
    }
    return json(undefined, 201);
  }
  if (method === 'POST' && path === '/rest/v1/timplan_events') {
    const rows = Array.isArray(body) ? body : [body];
    for (const ev of rows) {
      if (!tables.timplans.has(ev.timplan_id)) {
        return pgError('23503', 'insert or update on table "timplan_events" violates foreign key constraint', 409);
      }
      tables.timplan_events.push({ id: `event-${tables.timplan_events.length + 1}`, created_at: new Date().toISOString(), ...ev });
    }
    return json(undefined, 201);
  }
  if (method === 'GET' && path === '/rest/v1/timplans') return json([...tables.timplans.values()]);
  if (method === 'GET' && path === '/rest/v1/timplan_cells') return json([...tables.timplan_cells.values()]);
  if (method === 'GET' && path === '/rest/v1/timplan_events') return json(tables.timplan_events);
  note(`  → ohanterat anrop ${label}`);
  return pgError('PGRST000', `ohanterat av reproduceraren: ${method} ${path}`, 404);
}

function describe(body) {
  if (!body) return '';
  if (Array.isArray(body) && body[0]?.row_id) {
    return ` ${body.map((c) => `${c.timplan_id.slice(-4)}:${c.row_id}=[${c.hours.join(',')}]`).join(' ')}`;
  }
  if (body.offering_id) return ` offering ${body.offering_id}`;
  return '';
}

installClientForTests(
  createClient('http://127.0.0.1:1', 'lokal-testnyckel', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  }),
);

// ------------------------------------------------------------ fixturer

const EXISTING_ID = '20000000-0000-4000-8000-0000000000f1';
const EDUCATION_ID = '30000000-0000-4000-8000-000000000001';

function seedExisting(cells) {
  tables.timplans.set(EXISTING_ID, {
    id: EXISTING_ID,
    organizer_id: ORGANIZER_ID,
    offering_id: EDUCATION_ID,
    version: 1,
    status: 'utkast',
    basis: 'Grundskola, nationell timplan',
    catalog_fetched: '',
    decided_on: null,
    created_by: ACTOR_ID,
    created_at: '2026-01-01T00:00:00Z',
  });
  for (const [rowId, hours] of Object.entries(cells)) {
    tables.timplan_cells.set(`${EXISTING_ID}:${rowId}`, { timplan_id: EXISTING_ID, row_id: rowId, hours: [...hours] });
  }
}

/** En öppen timplan som modellen ser den (timplan-model.ts Timplan). */
const plan = (id, cells, extra = {}) => ({
  id,
  educationId: EDUCATION_ID,
  version: 1,
  status: 'utkast',
  basis: 'Grundskola, nationell timplan',
  catalog: '',
  cells: structuredClone(cells),
  history: [],
  ...extra,
});

// ------------------------------------------------------------ utfall

/** @type {Record<string, 'PASS' | 'FAIL'>} */
const outcomes = {};
async function scenario(name, run) {
  try {
    await run();
    outcomes[name] = 'PASS';
  } catch (error) {
    outcomes[name] = 'FAIL';
    throw error;
  }
}

// ------------------------------------------------------------ scenarier

test('samma cell: senaste avsedda värde ska finnas i lagret', () =>
  scenario('samma cell', async () => {
    resetTables();
    seedExisting({ MATE: [20, 0, 0] });
    const before = plan(EXISTING_ID, { MATE: [20, 0, 0] });
    const next1 = plan(EXISTING_ID, { MATE: [100, 0, 0] });
    const next2 = plan(EXISTING_ID, { MATE: [200, 0, 0] });

    // Två snabba inmatningar i samma fält: 20 → 100 → 200. Varje onChange i
    // vyn startar sin egen sparning; här startas de utan att invänta varandra.
    const first = persistTimplans([next1], [before]);
    const second = persistTimplans([next2], [next1]);
    await Promise.all([first, second]);

    const stored = tables.timplan_cells.get(`${EXISTING_ID}:MATE`)?.hours;
    const reloaded = (await loadTimplans([])).find((p) => p.id === EXISTING_ID)?.cells.MATE;
    const slowFirst = log.some((l) => l.line.includes('fördröjs'));
    assert.ok(slowFirst, 'fördröjningen ska ha tillämpats på första upsert-anropet');
    note(`lagret har MATE = [${stored?.join(', ')}], omläsning ger [${reloaded?.join(', ')}]`);
    assert.deepEqual(stored, [200, 0, 0], 'senaste avsedda värdet (200) ska vara det som finns kvar i lagret');
    assert.deepEqual(reloaded, [200, 0, 0], 'omläsning ska visa senaste avsedda värdet');
  }));

test('nytt objekt följt av snabb ändring använder lagrets id', () =>
  scenario('nytt objekt', async () => {
    resetTables();
    const modelId = 'model-4f3c1a2b-lokalt-id';
    const created = plan(modelId, { MATE: [20, 0, 0] }, { version: 2 });
    const edited = { ...created, cells: { MATE: [30, 0, 0] } };

    // Ny version skapas i vyn med modellens id; användaren ändrar en cell innan
    // första sparningen och omläsningen hunnit ge lagrets id.
    const create = persistTimplans([created], []);
    const edit = persistTimplans([edited], [created]);
    const results = await Promise.allSettled([create, edit]);
    for (const r of results) if (r.status === 'rejected') note(`sparning avvisad: ${r.reason.message}`);

    const rows = [...tables.timplans.values()];
    const cells = [...tables.timplan_cells.values()];
    note(`timplans: ${rows.length} rad(er); celler: ${cells.map((c) => `${c.timplan_id}:${c.row_id}=[${c.hours.join(',')}]`).join(' ') || 'inga'}`);
    assert.equal(rows.length, 1, 'exakt en timplansrad ska finnas');
    const storeId = rows[0].id;
    assert.notEqual(storeId, modelId);
    for (const r of results) assert.equal(r.status, 'fulfilled', `ingen sparning ska avvisas: ${r.reason?.message ?? ''}`);
    assert.ok(cells.every((c) => c.timplan_id === storeId), 'alla celler ska höra till lagrets id, inte modellens');
    assert.deepEqual(tables.timplan_cells.get(`${storeId}:MATE`)?.hours, [30, 0, 0], 'den snabba ändringen ska ha nått lagret');
  }));

after(() => {
  installClientForTests(null);
  const names = Object.keys(outcomes);
  const failed = names.filter((n) => outcomes[n] === 'FAIL');
  const detail = names.map((n) => `${n}=${outcomes[n]}`).join(', ');
  if (failed.length) {
    console.log(`KNOWN-ISSUE: ${failed.length} av ${names.length} scenarier röda som väntat (${detail}). Ägare: fas 5. Sparordning/id-mappning i persistTimplans är inte rättad.`);
  } else {
    console.log(`KNOWN-ISSUE: 0 av ${names.length} scenarier röda (${detail}) — grön utan rättning i planning-store.ts, utred om felet verkligen är borta eller om fördröjningen inte tillämpades.`);
  }
});
