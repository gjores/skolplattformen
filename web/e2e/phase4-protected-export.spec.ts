// Riktat 04-24-prov: skyddsmärke i elevlistan och uttryckligt skyddsval i exporten
// mot verklig lokal OIDC, byggd protected-Worker och SQL. Ingen reset: en befintlig
// syntetisk elevs skyddsflagga och p3.admins skyddsbehörighet återställs i finally.
// p3.admin saknar engångskod, så nedladdningen prövas inte här (SQL/nod, 04-16/04-19).
// Inga elevnamn, personnummer eller elev-ID skrivs till loggar eller rapport.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Response } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';
import type { PupilList } from '../lib/pupil-register-model.ts';

const customer = '33000000-0000-4000-8000-000000000001';
const unit = '33000000-0000-4000-8000-000000000111';
const pupil = '33000000-0000-4000-8000-000000000211';
const unknown = '33000000-0000-4000-8000-0000000fffff';
const permissionPath = '/api/kund/skyddsbehorighet';
const verifyTarget = fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url));
let manifest: PilotManifest;
let passwords: Record<string, string>;

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  process.env.PGCONNECT_TIMEOUT = '10';
  execFileSync(process.execPath, [verifyTarget, '--target', 'protected', '--with-idp'], { stdio: 'pipe', timeout: 30_000 });
  manifest = readPilotManifest();
  passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8'));
});
/** Målskydd före varje skrivning till databasen. */
function guardedWrite(sql: string) {
  execFileSync(process.execPath, [verifyTarget, '--target', 'protected'], { stdio: 'pipe', timeout: 30_000 });
  psql(manifest, sql);
}
const isPath = (response: Response, path: string, method = 'GET') => new URL(response.url()).pathname === path && response.request().method() === method;
async function login(page: Page, user: string) {
  if (!passwords[user]) throw new Error('Syntetiskt provkonto saknas.');
  await loginViaKeycloak(page, user, { password: passwords[user] });
  await waitForHydration(page);
}
async function ready(page: Page) { await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false'); }
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
/** Adress, historik och sessionStorage får aldrig bära skyddat elev-ID eller skyddsinformation. */
async function cleanStorage(page: Page) {
  const stored = await page.evaluate(() => JSON.stringify({ url: location.href, state: history.state, session: Object.entries(sessionStorage) }));
  expect(stored.includes(pupil), 'elev-ID i adress, historik eller sessionStorage').toBe(false);
  expect(/skydd|protected/iu.test(stored), 'skyddsinformation i adress, historik eller sessionStorage').toBe(false);
}
/** Väntar bara på ändliga animeringar i dialogen (öppningens skalning), aldrig på oändliga. */
async function settle(page: Page) {
  await page.getByRole('dialog').evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished)));
}
/** Väntar på nästa förhandsprövning och returnerar skickad kropp, status och svar. */
async function previewAfter(page: Page, action: () => Promise<void>) {
  const wait = page.waitForResponse(response => isPath(response, '/api/elever/export', 'POST'));
  await action();
  const response = await wait;
  return { status: response.status(), sent: response.request().postDataJSON(), body: await response.json() };
}
/** Serverns antal; ett tomt urval ger enligt 04-10 generiskt 400 i stället för 0. */
function counted(result: { status: number; body: { count?: number; code?: string } }) {
  if (result.status === 400) { expect(result.body.code).toBe('bad_request'); return 0; }
  expect(result.status).toBe(200); return result.body.count as number;
}
const exportButton = (count: number) => `Exportera ${count === 1 ? '1 elev' : `${count} elever`} (CSV)`;

test('skyddsmärke och uttryckligt skyddsval för behörig; obehörig ser inget utöver anonym rad', async ({ page, browser }, info) => {
  const origin = new URL(test.info().project.use.baseURL ?? 'http://127.0.0.1:3000').origin;
  const hmContext = await browser.newContext({ baseURL: origin, locale: 'sv-SE' });
  const hm = await hmContext.newPage();
  await login(hm, 'p3.huvudman');
  const change = (data: object) => hm.request.post(permissionPath, { data, headers: { Origin: origin } });
  const permissions = await hm.request.get(permissionPath); expect(permissions.status()).toBe(200);
  const row = (await permissions.json()).permissions.find((r: { displayName: string; unitId: string }) => r.displayName === 'Alva Skoladmin' && r.unitId === unit);
  expect(row, 'p3.admins rad i huvudmannens skyddsvy').toBeTruthy();
  const originalProtected = psql(manifest, `select protected_identity from public.pupils where id='${pupil}' and customer_id='${customer}';`);
  expect(['t', 'f']).toContain(originalProtected);
  const initiallyGranted = Boolean(row.permissionId);
  let current: string | null = row.permissionId;
  try {
    // ---- 1. Behörig administratör ----
    if (!current) {
      const granted = await change({ action: 'grant', assignmentId: row.assignmentId, unitId: unit });
      expect(granted.status()).toBe(201); current = (await granted.json()).permissionId;
    }
    guardedWrite(`update public.pupils set protected_identity=true where id='${pupil}' and customer_id='${customer}';`);
    const firstList = page.waitForResponse(response => isPath(response, '/api/elever/lista', 'POST'));
    await login(page, 'p3.admin');
    const listResponse = await firstList; expect(listResponse.status()).toBe(200);
    const list: PupilList = await listResponse.json();
    await ready(page);
    expect(list.capabilities.canReadProtected).toBe(true);
    expect(list.protectedIds).toEqual([pupil]);
    expect(list.pupils.filter(p => 'protectedIdentity' in p).map(p => [p.id, p.protectedIdentity])).toEqual([[pupil, true]]);
    const flagged = list.pupils.find(p => p.id === pupil);
    expect(flagged).toBeTruthy();
    const nameButton = page.getByRole('button', { name: `${flagged!.displayName}, öppna elevkortet`, exact: true }).filter({ visible: true });
    await expect(nameButton).toHaveCount(1);
    // Märket står på rätt rad (tabellrad på dator, kort på telefon) och bara där.
    const container = page.locator('.pupil-register-table tbody tr, .pupil-register-cards > li').filter({ visible: true });
    await expect(container.filter({ hasText: 'Skyddade personuppgifter' })).toHaveCount(1);
    await expect(container.filter({ hasText: 'Skyddade personuppgifter' }).getByRole('button', { name: `${flagged!.displayName}, öppna elevkortet`, exact: true })).toHaveCount(1);
    await expect(page.locator('.pupil-badge').filter({ visible: true })).toHaveCount(1);
    await noOverflow(page);
    await cleanStorage(page);
    await page.screenshot({ path: info.outputPath('behorig-lista.png'), fullPage: true });

    // Markera den skyddade eleven: målet blir markerade elever och valet är omarkerat.
    await page.getByRole('checkbox', { name: `Markera ${flagged!.displayName}` }).filter({ visible: true }).check();
    const markedPreview = await previewAfter(page, () => page.getByRole('button', { name: 'Exportera urval…' }).click());
    const dialog = page.getByRole('dialog');
    // Utan valet återstår ingen elev: servern svarar med det generiska tomma urvalet (400).
    expect(markedPreview.status).toBe(400);
    expect(markedPreview.sent.export).toMatchObject({ mode: 'ids', ids: [pupil], protectedIds: [] });
    await expect(dialog.getByRole('alert')).toHaveText('Urvalet innehåller inga elever att exportera.');
    const choice = dialog.getByRole('checkbox', { name: 'Ta med elever med skyddade personuppgifter (1)' });
    await expect(choice).not.toBeChecked();
    await expect(dialog.getByText('Utan detta val utelämnas de ur exporten.')).toBeVisible();
    const checkedMarked = await previewAfter(page, () => choice.check());
    expect(checkedMarked.sent.export).toMatchObject({ mode: 'ids', ids: [pupil], protectedIds: [pupil] });
    expect(checkedMarked.body.count).toBe(1);
    await expect(dialog.getByRole('button', { name: exportButton(1) })).toBeEnabled();

    // Byte till hela urvalet återställer valet.
    const whole = await previewAfter(page, () => dialog.getByRole('radio', { name: /^Alla elever i urvalet/u }).check());
    await expect(choice).not.toBeChecked();
    expect(whole.sent.export).toMatchObject({ mode: 'filter', protectedIds: [] });
    const base = counted(whole);
    expect(base).toBe(list.count - 1);
    const included = await previewAfter(page, () => choice.check());
    expect(included.status).toBe(200);
    expect(included.sent.export.protectedIds).toEqual([pupil]);
    expect(included.body.count).toBe(base + 1);
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: exportButton(base + 1) })).toBeEnabled();
    const excluded = await previewAfter(page, () => choice.uncheck());
    expect(excluded.sent.export.protectedIds).toEqual([]);
    expect(counted(excluded)).toBe(base);
    await settle(page);
    const checkLabel = choice.locator('xpath=ancestor::label[1]');
    expect((await checkLabel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await noOverflow(page);
    await cleanStorage(page);
    await page.screenshot({ path: info.outputPath('behorig-export.png'), fullPage: true });

    // ---- 2. Behörigheten återkallas medan dialogen är öppen och valet är gjort ----
    const again = await previewAfter(page, () => choice.check());
    expect(again.body.count).toBe(base + 1);
    expect((await change({ action: 'revoke', permissionId: current })).status()).toBe(200); current = null;
    await previewAfter(page, () => choice.uncheck());
    const revoked = await previewAfter(page, () => choice.check());
    expect(revoked.status).toBe(404);
    expect(revoked.body.code).toBe('not_found');
    expect(revoked.sent.export.protectedIds).toEqual([pupil]);
    const warning = dialog.getByRole('alert');
    await expect(warning).toHaveText('En elev i urvalet ingår inte längre i ditt uppdrag. Stäng dialogen, hämta aktuellt läge och välj igen.');
    expect(/skydd/iu.test((await warning.textContent()) ?? '')).toBe(false);
    await expect(dialog.getByRole('button', { name: 'Exportera (CSV)' })).toBeDisabled();
    await page.screenshot({ path: info.outputPath('aterkallad.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Avbryt exporten' }).click();
    await expect(dialog).toHaveCount(0);

    // ---- 3. Obehörig efter återkallelse och ny listläsning ----
    const reread = page.waitForResponse(response => isPath(response, '/api/elever/lista', 'POST'));
    await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
    const plainResponse = await reread; expect(plainResponse.status()).toBe(200);
    const plain = await plainResponse.json();
    await ready(page);
    expect(plain.capabilities.canReadProtected).toBe(false);
    expect(plain).not.toHaveProperty('protectedIds');
    expect(plain.pupils.some((p: object) => 'protectedIdentity' in p)).toBe(false);
    expect(Object.keys(plain).sort()).toEqual(['capabilities', 'count', 'options', 'page', 'pageSize', 'pupils', 'scope']);
    const anonymous = plain.pupils.find((p: { id: string }) => p.id === pupil);
    expect(anonymous, 'D-19: anonym rad finns kvar i listan').toBeTruthy();
    expect(anonymous.displayName).not.toBe(flagged!.displayName);
    expect(anonymous).not.toHaveProperty('birthDate');
    expect(anonymous.capabilities.canExport).toBe(false);
    await expect(page.locator('.pupil-badge')).toHaveCount(0);
    const leaks = await page.locator('.pupil-register').evaluate(root => {
      const found: string[] = [];
      // Miljöetiketten "SKYDDAD PROVMILJÖ" gäller provmiljön, inte eleven.
      if (/skydd(?!ad provmiljö)/iu.test(root.textContent ?? '')) found.push('text');
      for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of element.attributes)
        if ((attribute.name === 'title' || attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) && /skydd|protect/iu.test(attribute.value)) found.push(attribute.name);
      return found;
    });
    expect(leaks).toEqual([]);
    await noOverflow(page);
    const plainPreview = await previewAfter(page, () => page.getByRole('button', { name: 'Exportera urval…' }).click());
    expect(plainPreview.sent.export.protectedIds).toEqual([]);
    expect(counted(plainPreview)).toBe(base);
    await expect(dialog.getByRole('checkbox', { name: /skyddade/iu })).toHaveCount(0);
    expect(/skydd/iu.test((await dialog.textContent()) ?? '')).toBe(false);
    await page.screenshot({ path: info.outputPath('obehorig-export.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Avbryt exporten' }).click();
    // Direktanrop: skyddat och okänt ID ger samma status, kod och svarsform.
    const direct = async (id: string) => {
      const response = await page.request.post('/api/elever/export', { headers: { Origin: origin }, data: { mode: 'preview', export: {
        ...plainPreview.sent.export, protectedIds: [id] } } });
      const body = await response.json();
      return { status: response.status(), code: body.code, keys: Object.keys(body).filter(key => key !== 'correlationId').sort() };
    };
    const protectedDirect = await direct(pupil);
    const unknownDirect = await direct(unknown);
    expect(protectedDirect.status).toBe(404);
    expect(protectedDirect.code).toBe('not_found');
    expect(protectedDirect).toEqual(unknownDirect);

    // ---- 4. Lagring ----
    await cleanStorage(page);
  } finally {
    guardedWrite(`update public.pupils set protected_identity=${originalProtected === 't' ? 'true' : 'false'} where id='${pupil}' and customer_id='${customer}';`);
    if (current && !initiallyGranted) expect((await change({ action: 'revoke', permissionId: current })).status()).toBe(200);
    if (!current && initiallyGranted) expect((await change({ action: 'grant', assignmentId: row.assignmentId, unitId: unit })).status()).toBe(201);
    await hmContext.close();
  }
});
