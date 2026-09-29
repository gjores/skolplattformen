// Fas5: verkliga lagringsfunktioner genom deterministisk syntetisk PostgREST.
// Inga databas-/mandat-/browserbevis; fördröjda svar och FK kontrolleras här.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const { installClientForTests } = await import('./supabase.ts');
const { persistTimplans, loadTimplans, persistSchoolYears, loadSchoolYears } = await import('./planning-store.ts');

const ORGANIZER_ID = '00000000-0000-4000-8000-0000000000aa';
const ACTOR_ID = '10000000-0000-4000-8000-0000000000ee';
const SLOW_UPSERT_MS = 150;

// ------------------------------------------------------------ fake-lager

/** In-memory-tabeller. timplan_cells nycklas som `timplan_id:row_id`. */
const tables = {
  timplans: new Map(),
  timplan_cells: new Map(),
  timplan_events: [],
  school_years: new Map(),
  school_year_days: new Map(),
};
let nextTimplanNo = 0;
let cellUpserts = 0;
let failNextCellWrite = false;
let yearUpserts = 0;
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
  yearUpserts = 0;
  failNextCellWrite = false;
  tables.school_years.clear();
  tables.school_year_days.clear();
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
  if (method === 'POST' && path === '/rest/v1/school_year_days') {
    yearUpserts++;
    return yearUpserts === 1 ? SLOW_UPSERT_MS : 0;
  }
  return 0;
}

const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

function json(body, status = 200) {
  return new Response(status === 204 ? null : body === undefined ? '' : JSON.stringify(body), {
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
    if (failNextCellWrite) { failNextCellWrite = false; return pgError('XX000', 'Syntetiskt skrivfel', 500); }
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
  if (method === 'DELETE' && path === '/rest/v1/timplans') {
    const id = new URL(url).searchParams.get('id')?.replace('eq.', '');
    tables.timplans.delete(id);
    for (const [key, cell] of tables.timplan_cells) if (cell.timplan_id === id) tables.timplan_cells.delete(key);
    return json(undefined, 204);
  }
  if (method === 'POST' && path === '/rest/v1/school_years') {
    const row = { ...body, id: `year-server-${++nextTimplanNo}`, status:'utkast', decided_on:null };
    tables.school_years.set(row.id, row);
    return json(accept.includes('vnd.pgrst.object') ? row : [row], 201);
  }
  if (method === 'POST' && path === '/rest/v1/school_year_days') {
    for (const day of body) {
      if (!tables.school_years.has(day.school_year_id)) return pgError('23503', 'FK year id', 409);
      tables.school_year_days.set(`${day.school_year_id}:${day.day}`, {...day});
    }
    return json(undefined, 201);
  }
  if (method === 'GET' && path === '/rest/v1/school_years') return json([...tables.school_years.values()]);
  if (method === 'GET' && path === '/rest/v1/school_year_days') return json([...tables.school_year_days.values()]);
  if (method === 'GET' && ['/rest/v1/school_year_group_days','/rest/v1/school_year_short_weeks','/rest/v1/school_year_events'].includes(path)) return json([]);
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

const testClient = createClient('http://127.0.0.1:1', 'lokal-testnyckel', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch },
  });
installClientForTests(testClient);

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

test('en senare ändring i annat fält bevarar den första och anropets snapshot', async () => {
  resetTables();
  seedExisting({ MATE:[20,0,0], SVEN:[20,0,0] });
  const before = plan(EXISTING_ID, { MATE:[20,0,0], SVEN:[20,0,0] });
  const firstValue = plan(EXISTING_ID, { MATE:[100,0,0], SVEN:[20,0,0] });
  const lastValue = plan(EXISTING_ID, { MATE:[100,0,0], SVEN:[200,0,0] });
  const first = persistTimplans([firstValue],[before]);
  const second = persistTimplans([lastValue],[firstValue]);
  lastValue.cells.SVEN[0] = 999;
  await Promise.all([first,second]);
  assert.deepEqual(tables.timplan_cells.get(`${EXISTING_ID}:MATE`).hours,[100,0,0]);
  assert.deepEqual(tables.timplan_cells.get(`${EXISTING_ID}:SVEN`).hours,[200,0,0]);
  assert.equal(lastValue.cells.SVEN[0],999,'callerdata får inte skrivas om');
});

test('misslyckad skrivning stoppar köade följdändringar och omläst retry går igenom', async () => {
  resetTables(); seedExisting({ MATE:[20,0,0] });
  const before = plan(EXISTING_ID,{ MATE:[20,0,0] });
  const one = plan(EXISTING_ID,{ MATE:[100,0,0] });
  const two = plan(EXISTING_ID,{ MATE:[200,0,0] });
  failNextCellWrite = true;
  const results = await Promise.allSettled([persistTimplans([one],[before]),persistTimplans([two],[one])]);
  assert.ok(results.every(r => r.status === 'rejected'));
  assert.equal(cellUpserts,1,'beroende skrivning ska aldrig skickas efter fel');
  assert.deepEqual(tables.timplan_cells.get(`${EXISTING_ID}:MATE`).hours,[20,0,0]);
  const fresh = await loadTimplans([]);
  await persistTimplans([two],fresh);
  assert.deepEqual(tables.timplan_cells.get(`${EXISTING_ID}:MATE`).hours,[200,0,0]);
});

test('borttagning använder server-ID och rensar den lokala mappningen', async () => {
  resetTables();
  const created = plan('model-delete',{ MATE:[20,0,0] });
  await persistTimplans([created],[]);
  await persistTimplans([],[created]);
  assert.equal(tables.timplans.size,0);
  await persistTimplans([created],[]);
  assert.equal(tables.timplans.size,1);
});

test('borttagning med omläst server-ID rensar också modellens alias', async () => {
  resetTables();
  const created = plan('model-reloaded-delete',{ MATE:[20,0,0] });
  await persistTimplans([created],[]);
  const fresh = await loadTimplans([]);
  await persistTimplans([],fresh);
  assert.equal(tables.timplans.size,0);
  await persistTimplans([created],[]);
  assert.equal(tables.timplans.size,1);
});

test('olika klienter får separata ID-mappningar för samma lokala modell-ID', async () => {
  resetTables();
  const created = plan('model-client-scope',{ MATE:[20,0,0] });
  await persistTimplans([created],[]);
  const secondClient = createClient('http://127.0.0.1:1','lokal-testnyckel',{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:fakeFetch},
  });
  try {
    installClientForTests(secondClient);
    await persistTimplans([created],[]);
    assert.equal(tables.timplans.size,2,'andra klientens modell-ID får inte återanvända första klientens server-ID');
    const edited = plan(created.id,{ MATE:[30,0,0] });
    await persistTimplans([edited],[created]);
    const ids = [...tables.timplans.keys()];
    assert.deepEqual(tables.timplan_cells.get(`${ids[0]}:MATE`).hours,[20,0,0]);
    assert.deepEqual(tables.timplan_cells.get(`${ids[1]}:MATE`).hours,[30,0,0]);
  } finally { installClientForTests(testClient); }
});

const year = (id,kind) => ({ id,unitId:'school-test',startYear:2026,label:'Läsåret 2026/27',
  ht:{start:'2026-08-17',end:'2026-12-18'},vt:{start:'2027-01-11',end:'2027-06-11'},
  exceptions:{'2026-10-30':{kind}},groupExceptions:{},shortWeeks:{},status:'utkast',history:[] });

test('läsår: följdändringar väntar på skapande och bevarar sista dagen', async () => {
  resetTables();
  const created = year('year-local','lov');
  const edited = year('year-local','studiedag');
  await Promise.all([persistSchoolYears([created],[],'school-test'),persistSchoolYears([edited],[created],'school-test')]);
  assert.equal(tables.school_years.size,1);
  const id = [...tables.school_years.keys()][0];
  assert.notEqual(id,created.id);
  assert.equal(tables.school_year_days.get(`${id}:2026-10-30`).kind,'studiedag');
  const fresh = await loadSchoolYears('school-test',[]);
  assert.equal(fresh[0].exceptions['2026-10-30'].kind,'studiedag');
});

test('läsår: fördröjd äldre ändring vinner inte över senare ändring', async () => {
  resetTables();
  const original = year('year-existing','lov');
  tables.school_years.set(original.id,{id:original.id,unit_id:'school-test',start_year:2026,ht_start:original.ht.start,ht_end:original.ht.end,vt_start:original.vt.start,vt_end:original.vt.end,status:'utkast'});
  tables.school_year_days.set(`${original.id}:2026-10-30`,{school_year_id:original.id,day:'2026-10-30',kind:'lov'});
  const one = year(original.id,'studiedag');
  const two = year(original.id,'lov');
  two.exceptions['2026-10-30'].note = 'Senaste beslutade avsikten';
  await Promise.all([persistSchoolYears([one],[original],'school-test'),persistSchoolYears([two],[one],'school-test')]);
  const day = tables.school_year_days.get(`${original.id}:2026-10-30`);
  assert.equal(day.kind,'lov'); assert.equal(day.note,'Senaste beslutade avsikten');
});

after(() => installClientForTests(null));
