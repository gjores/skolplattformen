// Riktade 04-12-prov mot verklig lokal OIDC och byggd Worker; inga DB-mutationer.
// Det uttryckligen märkta projektionsprovet simulerar endast anonymt API-svar.
// Ersätter inte 04-19:s samlade verifiering.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page, type Response } from '@playwright/test';
import { loginViaKeycloak, waitForHydration } from './helpers/keycloak.ts';
import type { PupilList } from '../lib/pupil-register-model.ts';

let passwords: Record<string, string>;
test.beforeAll(() => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url)), '--target', 'protected', '--with-idp'], { stdio: 'pipe' });
  passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8'));
});
function listResponse(response: Response) { return new URL(response.url()).pathname === '/api/elever/lista' && response.request().method() === 'POST'; }
async function login(page: Page): Promise<PupilList> {
  const response = page.waitForResponse(listResponse);
  const bootstrap = page.waitForResponse((item) => new URL(item.url()).pathname === '/api/elever/urval');
  await loginViaKeycloak(page, 'p3.admin', { password: passwords['p3.admin'] });
  await waitForHydration(page);
  const selection = await bootstrap;
  expect(selection.status()).toBe(200);
  expect(selection.headers()['cache-control']).toBe('no-store');
  const metadata = await selection.json();
  const keys = (value: unknown): string[] => value && typeof value === 'object' ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
  expect(keys(metadata).filter((key) => ['pupils', 'pupilId', 'personalNumber', 'birthDate', 'auditRefs'].includes(key))).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Elever', exact: true })).toBeVisible();
  const result = await response; expect(result.status()).toBe(200);
  await expect(page.locator('.pupil-register')).toBeVisible();
  return result.json();
}
async function search(page: Page, value: string) {
  await page.getByLabel('Sökord', { exact: true }).fill(value);
  const response = page.waitForResponse(listResponse);
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  const result = await response; expect(result.status()).toBe(200);
  expect(result.request().postDataJSON().search).toBe(value);
  expect(new URL(result.url()).search).toBe('');
  return result.json() as Promise<PupilList>;
}
async function assertNoSearchPersistence(page: Page, value: string) {
  expect(await page.evaluate(() => JSON.stringify({ url: location.href, state: history.state, local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain(value);
}

test('serverns options och projektion visas responsivt med minst 44 px tryckytor', async ({ page }, info) => {
  const result = await login(page);
  expect(result.pupils.length).toBeGreaterThan(0);
  expect(result.pageSize).toBe(50);
  for (const [label, values] of [
    ['Klass', result.options.classes.map((item) => item.id)],
    ['Utbildning', result.options.educations.map((item) => item.id)],
    ['Årskurs', result.options.grades.map(String)],
    ['Status', result.options.statuses],
  ] as [string, string[]][]) {
    const actual = await page.getByLabel(label, { exact: true }).locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean));
    expect(actual.sort()).toEqual([...values].sort());
  }
  const phone = info.project.name !== 'list-desktop';
  await expect(page.locator('.pupil-register-table')).toBeVisible({ visible: !phone });
  await expect(page.locator('.pupil-register-cards')).toBeVisible({ visible: phone });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const badTargets = await page.locator('.pupil-register button, .pupil-register select, .pupil-register input:not([type="checkbox"]), [aria-label="Läsår"] button, #lasar').evaluateAll((elements) => elements.filter((element) => {
    const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && (box.width < 44 || box.height < 44);
  }).map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim()));
  expect(badTargets).toEqual([]);
});

test('POST-sökning ligger bara i minnet; filter, bakåt och omladdning bevarar säkert urval', async ({ page }) => {
  await login(page);
  const needle = 'TEST-20080101-1234';
  await search(page, needle);
  await assertNoSearchPersistence(page, needle);
  // Options kommer från serverns urval även när ingen elev träffar sökningen.
  expect(await page.getByLabel('Klass', { exact: true }).locator('option').count()).toBeGreaterThan(1);
  const response = page.waitForResponse(listResponse);
  await page.getByLabel('Status', { exact: true }).selectOption('avslutad');
  await response;
  await expect(page).toHaveURL(/status=avslutad/u);
  const back = page.waitForResponse(listResponse);
  await page.goBack(); await back;
  expect(new URL(page.url()).searchParams.has('status')).toBe(false);
  await assertNoSearchPersistence(page, needle);
  const filtered = page.waitForResponse(listResponse);
  await page.getByLabel('Status', { exact: true }).selectOption('aktuell'); await filtered;
  const reload = page.waitForResponse(listResponse);
  await page.reload();
  expect((await reload).request().postDataJSON().search).toBe('');
  await expect(page.getByLabel('Sökord', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Status', { exact: true })).toHaveValue('aktuell');
  await assertNoSearchPersistence(page, needle);
});

test('utloggning i annan flik tömmer lista, söktext, gamla lagringsnycklar och URL före låsvyn', async ({ page }) => {
  const result = await login(page);
  await search(page, result.pupils[0].displayName);
  await page.evaluate(() => { sessionStorage.setItem('sp_elevsok_old', 'syntetisk gammal sökning'); localStorage.setItem('sp_elevsok_old', 'syntetisk gammal sökning'); });
  const other = await page.context().newPage();
  await other.goto('/'); await waitForHydration(other);
  await other.getByRole('button', { name: 'Logga ut', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Du har loggats ut i en annan flik');
  await expect(page.locator('.pupil-register')).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((key) => key.startsWith('sp_elevsok')))).toEqual([]);
  await expect(page.getByText(result.pupils[0].displayName, { exact: true })).toHaveCount(0);
  await other.close();
});

test('okänd och otillåten skola ger samma allmänna återgång; läsår skickas till servern', async ({ page }) => {
  await login(page);
  const original = new URL(page.url());
  const fallback = 'Urvalet i adressen gäller inte ditt uppdrag. Listan visar läsåret för din första skola.';
  // Första ID:t är annan syntetisk skola, andra ett obefintligt men giltigt UUID.
  for (const school of ['33000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000001']) {
    const url = new URL(original); url.searchParams.set('skola', school);
    await page.goto(url.href);
    await expect(page.getByText(fallback, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Sökord', { exact: true })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('skola')).toBe(original.searchParams.get('skola'));
  }
  const picker = page.getByLabel('Läsår', { exact: true });
  const years = await picker.locator('option').evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  const current = await picker.inputValue();
  const another = years.find((year) => year !== current);
  expect(another, 'Provdata måste omfatta flera läsår').toBeTruthy();
  const response = page.waitForResponse(listResponse);
  await picker.selectOption(another!);
  expect((await response).request().postDataJSON().selection.schoolYear).toBe(Number(another));
  await expect.poll(() => new URL(page.url()).searchParams.get('lasar')).toBe(another);
});

test('simulerad anonym serverprojektion får ingen markering eller elevåtgärd', async ({ page }, info) => {
  await page.route('**/api/elever/lista', async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const result = await response.json() as PupilList;
    expect(result.pupils.length).toBeGreaterThan(0);
    const row = result.pupils[0];
    result.pupils = [{ ...row, displayName: 'Anonym syntetisk elev', capabilities: { canEdit: false, canExport: false, canRevealPersonalNumber: false, canReadHistory: false } }];
    result.count = 1;
    await route.fulfill({ response, json: result });
  });
  await login(page);
  const selector = info.project.name === 'list-desktop' ? '.pupil-register-table tbody tr' : '.pupil-register-cards > li';
  const row = page.locator(selector).filter({ hasText: 'Anonym syntetisk elev' });
  await expect(row).toBeVisible();
  await expect(row.getByRole('checkbox')).toHaveCount(0);
  await expect(row.getByRole('button')).toHaveCount(0);
});
