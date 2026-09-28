// Verklig lokal OIDC + byggd Worker + SQL. Exklusiv DB-slot krävs.
// Ingen reset: befintlig syntetisk elevs skyddsflagga återställs i finally.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type APIResponse, type Page } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';
const customer = '33000000-0000-4000-8000-000000000001';
const unit = '33000000-0000-4000-8000-000000000111';
const pupil = '33000000-0000-4000-8000-000000000211';
let manifest: PilotManifest;
let passwords: Record<string, string>;
let year: number;
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url)), '--target', 'protected', '--with-idp'], { stdio: 'pipe' });
  manifest = readPilotManifest();
  passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8'));
  year = Number(psql(manifest, 'select extract(year from public.app_today())::int-case when extract(month from public.app_today())<7 then 1 else 0 end;'));
});
async function login(page: Page, user: string) {
  if (!passwords[user]) throw new Error('Syntetiskt provkonto saknas.');
  await loginViaKeycloak(page, user, { password: passwords[user] });
  await waitForHydration(page);
}
function selection() { return { schoolYear: year, unitId: unit, classId: null, educationId: null, grade: null, status: null, page: 1 }; }
function cardUrl(id = pupil) { return `/api/elever/elev?pupilId=${id}&schoolYear=${year}`; }
function historyUrl() { return `/api/elever/historik?pupilId=${pupil}&schoolYear=${year}&page=1`; }
async function list(page: Page, search = '') { return page.request.post('/api/elever/lista', { data: { selection: selection(), search, caseId: null }, headers: { Origin: new URL(page.url()).origin } }); }
function audited(response: APIResponse, action: string) {
  const correlation = response.headers()['x-correlation-id'];
  expect(correlation).toMatch(/^[0-9a-f-]{36}$/u);
  expect(psql(manifest, `select count(*) from public.security_events where correlation_id='${correlation}' and customer_id='${customer}' and action='${action}' and outcome='ok';`)).toBe('1');
}
function injectFailure(action: string) {
  if (!['pupil_list_read', 'pupil_read', 'pupil_history_read', 'pupil_protected_read'].includes(action)) throw new Error('Ogiltigt provfall');
  psql(manifest, `create function public.phase4_reads_browser_fail() returns trigger language plpgsql as $$ begin
    if new.customer_id='${customer}'::uuid and new.action='${action}' and new.outcome='ok' then raise exception 'Synthetic read audit failure'; end if; return new; end $$;
    create trigger phase4_reads_browser_fail before insert on public.security_events for each row execute function public.phase4_reads_browser_fail();`);
}
function clearFailure() { psql(manifest, 'drop trigger if exists phase4_reads_browser_fail on public.security_events; drop function if exists public.phase4_reads_browser_fail();'); }
function noInternalOrNumber(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    expect(['auditRefs', 'personalNumber'].includes(key)).toBe(false);
    noInternalOrNumber(child);
  }
}
test('lista, kort och historik loggas före svar och lämnar inget innehåll vid loggfel', async ({ page }) => {
  await login(page, 'p3.admin');
  const calls: [string, () => Promise<APIResponse>][] = [
    ['pupil_list_read', () => list(page)], ['pupil_read', () => page.request.get(cardUrl())], ['pupil_history_read', () => page.request.get(historyUrl())],
  ];
  for (const [action, call] of calls) {
    const response = await call(); expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
    audited(response, action); noInternalOrNumber(await response.json());
    injectFailure(action);
    try { const denied = await call(); expect(denied.status()).toBe(500); const body = await denied.json(); expect(body.code).toBe('audit_unavailable'); expect(Object.keys(body).sort()).toEqual(['code', 'correlationId']); }
    finally { clearFailure(); }
  }
  const badOrigin = await page.request.post('/api/elever/lista', { data: { selection: selection(), search: '', caseId: null }, headers: { Origin: 'https://invalid.example.test' } });
  expect(badOrigin.status()).toBe(403);
  const extra = await page.request.post('/api/elever/lista', { data: { selection: selection(), search: '', caseId: null, actorId: pupil }, headers: { Origin: new URL(page.url()).origin } });
  expect(extra.status()).toBe(400);
  expect((await page.request.get(cardUrl('00000000-0000-4000-8000-000000000001'))).status()).toBe(404);
  expect((await page.request.get(`${cardUrl()}&search=forbidden`)).status()).toBe(400);
});
test('skyddad läsning kräver skolbeslut och separat committad skyddslogg', async ({ page, browser }) => {
  await login(page, 'p3.admin');
  const hm = await browser.newPage({ baseURL: new URL(page.url()).origin });
  await login(hm, 'p3.huvudman');
  const permissionPath = '/api/kund/skyddsbehorighet';
  const response = await hm.request.get(permissionPath); expect(response.status()).toBe(200);
  const row = (await response.json()).permissions.find((r: { displayName: string; unitId: string }) => r.displayName === 'Alva Skoladmin' && r.unitId === unit);
  expect(row).toBeTruthy();
  const originalProtected = psql(manifest, `select protected_identity from public.pupils where id='${pupil}' and customer_id='${customer}';`);
  expect(['t', 'f']).toContain(originalProtected);
  const initiallyGranted = Boolean(row.permissionId);
  let current: string | null = row.permissionId;
  const change = (data: object) => hm.request.post(permissionPath, { data, headers: { Origin: new URL(hm.url()).origin } });
  try {
    if (current) { expect((await change({ action: 'revoke', permissionId: current })).status()).toBe(200); current = null; }
    psql(manifest, `update public.pupils set protected_identity=true where id='${pupil}' and customer_id='${customer}';`);
    const anonymous = await page.request.get(cardUrl()); expect(anonymous.status()).toBe(200);
    const body = await anonymous.json(); expect(body).not.toHaveProperty('birthDate'); expect(body).not.toHaveProperty('protectedIdentity'); expect(body.capabilities.canReadHistory).toBe(false);
    expect((await page.request.get(historyUrl())).status()).toBe(404);
    const hidden = await list(page, body.displayName); expect(hidden.status()).toBe(200); expect((await hidden.json()).pupils.some((p: { id: string }) => p.id === pupil)).toBe(false);
    const granted = await change({ action: 'grant', assignmentId: row.assignmentId, unitId: unit }); expect(granted.status()).toBe(201); current = (await granted.json()).permissionId;
    const visible = await page.request.get(cardUrl()); expect(visible.status()).toBe(200); audited(visible, 'pupil_read'); audited(visible, 'pupil_protected_read');
    expect((await visible.json()).protectedIdentity).toBe(true);
    injectFailure('pupil_protected_read');
    try { const denied = await page.request.get(cardUrl()); expect(denied.status()).toBe(500); expect((await denied.json()).code).toBe('audit_unavailable'); }
    finally { clearFailure(); }
    expect((await change({ action: 'revoke', permissionId: current })).status()).toBe(200); current = null;
    expect((await (await page.request.get(cardUrl())).json()).capabilities.canReadHistory).toBe(false);
  } finally {
    clearFailure();
    psql(manifest, `update public.pupils set protected_identity=${originalProtected === 't' ? 'true' : 'false'} where id='${pupil}' and customer_id='${customer}';`);
    if (current) expect((await change({ action: 'revoke', permissionId: current })).status()).toBe(200);
    if (initiallyGranted) expect((await change({ action: 'grant', assignmentId: row.assignmentId, unitId: unit })).status()).toBe(201);
    await hm.close();
  }
});
for (const user of ['p3.huvudman', 'p3.it']) {
  test(`${user}: verksamhetsroll utan elevinsyn nekas alla registerläsningar`, async ({ page }) => {
    await login(page, user);
    expect((await list(page)).status()).toBe(403);
    expect((await page.request.get(cardUrl())).status()).toBe(403);
    expect((await page.request.get(historyUrl())).status()).toBe(403);
  });
}
test('lärare får klassens begränsade projektion men inte administrativ historik', async ({ page }) => {
  await login(page, 'p3.larare');
  const response = await list(page); expect(response.status()).toBe(200); audited(response, 'pupil_list_read');
  const result = await response.json(); expect(result.pupils.length).toBeGreaterThan(0);
  for (const row of result.pupils) { expect(row).not.toHaveProperty('birthDate'); expect(row).not.toHaveProperty('municipalityCode'); expect(row.capabilities.canReadHistory).toBe(false); }
  expect((await page.request.get(historyUrl())).status()).toBe(403);
});
