// Verklig lokal OIDC, byggd Worker och skyddad databas. Inga elevfixturer/reset.
// Köraren måste ge exklusiv DB-slot: ett snävt testloggfel och en sessions
// MFA-tid ändras tillfälligt och återställs i finally. Inga hemligheter skrivs ut.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, request as requestFactory, type APIResponse, type Page } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';

const endpoint = '/api/kund/skyddsbehorighet';
const customer = '33000000-0000-4000-8000-000000000001';
const uuid = /^[0-9a-f-]{36}$/u;
type Permission = { assignmentId: string; membershipId: string; displayName: string; unitId: string; schoolName: string; permissionId: string | null };
let manifest: PilotManifest;
let passwords: Record<string, string>;
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url)), '--target', 'protected', '--with-idp'], { stdio: 'pipe' });
  manifest = readPilotManifest();
  passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8')) as Record<string, string>;
});

async function login(page: Page, name: string): Promise<void> {
  if (!passwords[name]) throw new Error('BLOCKED: befintligt syntetiskt provkonto saknas.');
  await loginViaKeycloak(page, name, { password: passwords[name] });
  await waitForHydration(page);
}
async function post(page: Page, data: Record<string, unknown>): Promise<APIResponse> {
  return page.request.post(endpoint, { data, headers: { Origin: new URL(page.url()).origin } });
}
async function list(page: Page): Promise<Permission[]> {
  const response = await page.request.get(endpoint);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  assertAudited(response, 'protected_permission_listed');
  const body = await response.json() as { permissions: Permission[] };
  expect(body.permissions.length).toBeGreaterThan(0);
  return body.permissions;
}
function assertAudited(response: APIResponse, action: string): void {
  const correlation = response.headers()['x-correlation-id'];
  expect(correlation).toMatch(uuid);
  expect(psql(manifest, `select count(*) from public.security_events where correlation_id='${correlation}' and action='${action}' and outcome='ok' and customer_id='${customer}';`)).toBe('1');
}
function canRead(row: Permission): boolean {
  expect(row.assignmentId).toMatch(uuid); expect(row.unitId).toMatch(uuid);
  return psql(manifest, `select public.phase4_has_protected_permission('${row.assignmentId}','${row.unitId}');`) === 't';
}
async function grant(page: Page, row: Permission): Promise<string> {
  const response = await post(page, { action: 'grant', assignmentId: row.assignmentId, unitId: row.unitId });
  expect(response.status()).toBe(201);
  assertAudited(response, 'protected_permission_granted');
  const body = await response.json() as { permissionId: string };
  expect(body.permissionId).toMatch(uuid);
  expect(canRead(row)).toBe(true);
  return body.permissionId;
}
async function revoke(page: Page, id: string): Promise<void> {
  const response = await post(page, { action: 'revoke', permissionId: id });
  expect(response.status()).toBe(200);
  assertAudited(response, 'protected_permission_revoked');
}
function injectAuditFailure(action: 'granted' | 'revoked'): void {
  psql(manifest, `create function public.phase4_permission_browser_fail() returns trigger language plpgsql as $$ begin
    if new.customer_id='${customer}'::uuid and new.action='protected_permission_${action}' and new.outcome='ok' then raise exception 'Synthetic permission audit failure'; end if; return new; end $$;
    create trigger phase4_permission_browser_fail before insert on public.security_events for each row execute function public.phase4_permission_browser_fail();`);
}
function removeAuditFailure(): void {
  psql(manifest, 'drop trigger if exists phase4_permission_browser_fail on public.security_events; drop function if exists public.phase4_permission_browser_fail();');
}

test('huvudmannens verkliga API loggar före svar och loggfel återställer grant och revoke', async ({ page }) => {
  await login(page, 'p3.huvudman');
  const row = (await list(page)).find(option => option.displayName === 'Alva Skoladmin');
  if (!row) throw new Error('Det befintliga syntetiska administratörsuppdraget saknas.');
  const initiallyGranted = Boolean(row.permissionId);
  let current = row.permissionId;
  try {
    if (current) { await revoke(page, current); current = null; }
    expect(canRead(row)).toBe(false);
    injectAuditFailure('granted');
    try {
      const response = await post(page, { action: 'grant', assignmentId: row.assignmentId, unitId: row.unitId });
      expect(response.status()).toBe(500);
      expect((await response.json()).code).toBe('audit_unavailable');
      expect(canRead(row)).toBe(false);
    } finally { removeAuditFailure(); }
    current = await grant(page, row);
    expect((await list(page)).find((r) => r.assignmentId === row.assignmentId && r.unitId === row.unitId)?.permissionId).toBe(current);
    injectAuditFailure('revoked');
    try {
      const response = await post(page, { action: 'revoke', permissionId: current });
      expect(response.status()).toBe(500);
      expect((await response.json()).code).toBe('audit_unavailable');
      expect(canRead(row)).toBe(true);
    } finally { removeAuditFailure(); }
    await revoke(page, current); current = null;
    expect(canRead(row)).toBe(false);
  } finally {
    if (current) await revoke(page, current);
    if (initiallyGranted) await grant(page, row);
  }
});

test('backend kräver MFA och same-origin och avvisar klientvald aktör', async ({ page }) => {
  await login(page, 'p3.huvudman');
  const row = (await list(page)).find(option => option.displayName === 'Alva Skoladmin');
  if (!row) throw new Error('Det befintliga syntetiska administratörsuppdraget saknas.');
  const before = canRead(row);
  const data = { action: 'grant', assignmentId: row.assignmentId, unitId: row.unitId };
  const csrf = await page.request.post(endpoint, { data, headers: { Origin: 'https://synthetic-invalid.example.test' } });
  expect(csrf.status()).toBe(403); expect((await csrf.json()).code).toBe('csrf');
  const actor = await post(page, { ...data, actorId: row.assignmentId });
  expect(actor.status()).toBe(400); expect((await actor.json()).code).toBe('bad_request');
  const cookie = (await page.context().cookies()).find((c) => c.name === 'sp_session');
  if (!cookie) throw new Error('Appsession saknas efter verklig inloggning.');
  const hash = createHash('sha256').update(decodeURIComponent(cookie.value)).digest('hex');
  const original = psql(manifest, `select auth_time::text from public.app_sessions where token_hash=decode('${hash}','hex');`);
  if (!original) throw new Error('Sessionsbevis saknas.');
  try {
    psql(manifest, `update public.app_sessions set auth_time=clock_timestamp()-interval '9 hours' where token_hash=decode('${hash}','hex');`);
    const expired = await post(page, data);
    expect(expired.status()).toBe(403); expect((await expired.json()).code).toBe('mfa_required');
    expect(canRead(row)).toBe(before);
  } finally {
    psql(manifest, `update public.app_sessions set auth_time='${original.replaceAll("'", "''")}'::timestamptz where token_hash=decode('${hash}','hex');`);
  }
});

for (const [role, username] of [['rektorns', 'p3.rektor'], ['administratörens', 'p3.admin']]) {
test(`${role} vy saknar skyddsåtgärden och backend nekar även direktanrop`, async ({ page }) => {
  await login(page, username);
  await expect(page.getByRole('button', { name: 'Hantera skyddsbehörighet' })).toHaveCount(0);
  const response = await page.request.get(endpoint);
  expect(response.status()).toBe(403); expect((await response.json()).code).toBe('forbidden');
  const mutate = await post(page, { action: 'grant', assignmentId: '00000000-0000-4000-8000-000000000001', unitId: '33000000-0000-4000-8000-000000000111' });
  expect(mutate.status()).toBe(403); expect((await mutate.json()).code).toBe('forbidden');
});
}

test('huvudmannens dialog fungerar med tangentbord, mobil, MFA-fel och loggfel utan tappade val', async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await login(page, 'p3.huvudman');
  const row = (await list(page)).find(option => option.displayName === 'Alva Skoladmin');
  if (!row) throw new Error('Det befintliga syntetiska administratörsuppdraget saknas.');
  const initiallyGranted = Boolean(row.permissionId);
  if (row.permissionId) await revoke(page, row.permissionId);
  const cleanup = await requestFactory.newContext({ baseURL: new URL(page.url()).origin, storageState: await page.context().storageState(), extraHTTPHeaders: { Origin: new URL(page.url()).origin }, timeout: 15_000 });
  const trigger = page.getByRole('button', { name: 'Hantera skyddsbehörighet' });
  try {
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Skyddsbehörighet', exact: true });
    await expect(dialog).toBeVisible();
    const popup = page.locator('[role=dialog]:visible');
    await expect(popup.locator('select')).toHaveCount(2);
    const accessible = await popup.evaluate(el => ({ labelledby: el.getAttribute('aria-labelledby'), label: el.getAttribute('aria-label'), titleId: el.querySelector('h2')?.id, title: el.querySelector('h2')?.textContent }));
    await testInfo.attach('dialog-accessibility.json', { body: JSON.stringify(accessible), contentType: 'application/json' });
    await expect(dialog, JSON.stringify(accessible)).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Skola', exact: true }).selectOption(row.unitId);
    await dialog.getByRole('combobox', { name: 'Administratörsuppdrag', exact: true }).selectOption(row.assignmentId);
    await expect(dialog).toContainText('Saknar skyddsbehörighet');
    const small = await dialog.locator('button, select').evaluateAll((elements) => elements.filter((el) => el instanceof HTMLElement && el.offsetParent !== null).map((el) => ({ tag: el.tagName, height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width })).filter((el) => el.height < 44 || el.width < 44));
    expect(small).toEqual([]);
    const [width, viewport] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    expect(width).toBeLessThanOrEqual(viewport + 1);
    const bounds = await dialog.boundingBox();
    expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport + 1).toBeTruthy();
    await dialog.getByRole('button', { name: 'Ge skyddsbehörighet', exact: true }).click();
    const confirm = dialog.getByRole('button', { name: 'Bekräfta tilldelning', exact: true });
    await expect(confirm).toBeFocused();
    page.once('dialog', (nativeDialog) => nativeDialog.dismiss());
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    await expect(dialog).toBeVisible();
    // Bara detta presentationsfall simuleras; verkligt MFA-nekande provas ovan.
    await page.route(`**${endpoint}`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'mfa_required', correlationId: '00000000-0000-4000-8000-000000000004' }) });
    });
    await confirm.click();
    await expect(dialog.getByText('Ändring av skyddsbehörighet kräver verifiering med engångskod.')).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Administratörsuppdrag', exact: true })).toHaveValue(row.assignmentId);
    await expect(dialog.getByRole('combobox', { name: 'Skola', exact: true })).toHaveValue(row.unitId);
    expect(canRead(row)).toBe(false);
    await page.unroute(`**${endpoint}`);
    await page.screenshot({ path: testInfo.outputPath('permission-mfa-choice-preserved.png') });
    await confirm.click();
    await expect(dialog).toContainText('Tilldelningen är sparad.');
    await expect(dialog).toContainText('Har skyddsbehörighet');
    expect(canRead(row)).toBe(true);
    await dialog.getByRole('button', { name: 'Återkalla skyddsbehörighet', exact: true }).click();
    injectAuditFailure('revoked');
    try {
      await dialog.getByRole('button', { name: 'Bekräfta återkallelse', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('säkerhetsloggen inte är tillgänglig');
      await expect(dialog.getByRole('combobox', { name: 'Administratörsuppdrag', exact: true })).toHaveValue(row.assignmentId);
      expect(canRead(row)).toBe(true);
    } finally { removeAuditFailure(); }
    await dialog.getByRole('button', { name: 'Bekräfta återkallelse', exact: true }).click();
    await expect(dialog).toContainText('Återkallelsen är sparad.');
    await expect(dialog).toContainText('Saknar skyddsbehörighet');
    expect(canRead(row)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath('permission-revoked.png') });
    await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
    await expect(dialog).toBeHidden(); await expect(trigger).toBeFocused();
  } finally {
    if (!page.isClosed()) await page.unroute(`**${endpoint}`);
    try {
      const state = await cleanup.get(endpoint);
      expect(state.status()).toBe(200);
      const options = (await state.json()).permissions as Permission[];
      const current = options.find(r => r.assignmentId === row.assignmentId && r.unitId === row.unitId)?.permissionId;
      if (current) expect((await cleanup.post(endpoint, { data: { action: 'revoke', permissionId: current } })).status()).toBe(200);
      if (initiallyGranted) expect((await cleanup.post(endpoint, { data: { action: 'grant', assignmentId: row.assignmentId, unitId: row.unitId } })).status()).toBe(201);
    } finally { await cleanup.dispose(); }
  }
});
