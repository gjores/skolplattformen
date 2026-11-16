// Datumvyn mot syntetiskt kalenderunderlag och mockade appanrop; ingen inloggad Worker eller verklig anslutning.
import { test, expect, type Page } from './schema-test';
import forslag from './schema-fixture';
import kontroll from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION } from '../lib/schema-contract.ts';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
});

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };

async function start(page: Page) {
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...forslag, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await page.route('**/api/schema/kontroll', route => route.fulfill({ headers, json: { ...kontroll.clash, contractVersion: SCHEMA_CONTRACT_VERSION, violations: [], total: 0 } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  return page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen' });
}

test('SM-VECKOVY: lov, studiedag och klassens egen dag utan undervisning visas med datum och orsak', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Vecka', exact: true }).click();
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-10-26');
  await expect(page.locator('.schema-week .schema-lesson')).toHaveCount(0);
  await expect(page.locator('.schema-utan-undervisning')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: /Måndag 26 okt/u })).toContainText('Lovdag');
  await expect(val.getByRole('status')).toContainText('Ändringar här gäller ett enskilt tillfälle');
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-11-09');
  await expect(page.locator('[data-date="2026-11-11"]')).toContainText('Studiedag');
  await expect(page.locator('[data-date="2026-11-11"] .schema-lesson')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Klass eller grupp', exact: true }).selectOption({ label: 'Klass 12' });
  await expect(page.locator('[data-date="2026-11-12"]')).toContainText('Friluftsdag');
  await expect(page.locator('[data-date="2026-11-12"] .schema-lesson')).toHaveCount(0);
  expect(await page.locator('.schema-day').evaluateAll(days => days.every(day => {
    const reason = day.querySelector('.schema-dagorsak'), ol = day.querySelector('ol');
    return !reason || !ol || reason.getBoundingClientRect().bottom <= ol.getBoundingClientRect().top + 1;
  })), 'Kalenderns orsak ska rymmas ovanför tidsbanan').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-kalender-${info.project.name}.png`, fullPage: true });
});

test('SM-VECKOVY: datumintervallet och passtabellen öppnar ändring av just ett tillfälle', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Datumintervall', exact: true }).click();
  await val.getByLabel('Från', { exact: true }).fill('2026-11-06');
  await val.getByLabel('Till', { exact: true }).fill('2026-11-16');
  await expect(page.locator('.schema-week .schema-day')).toHaveCount(11);
  await expect(page.locator('[data-date="2026-11-07"]')).toContainText('Helg');
  await page.getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  const rows = page.locator('.passtabell tr[data-passrad]');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toHaveAttribute('data-passrad', /@2026-11-/u);
  await expect(rows.first().locator('[data-col="6"]')).toContainText(/nov/u);
  await rows.first().locator('[data-col="1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Ändra ett tillfälle' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Ändra ett tillfälle' }).getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(val.getByRole('status')).toContainText('Ändringar här gäller ett enskilt tillfälle');
  await expect(val.getByLabel('Till', { exact: true })).toHaveAttribute('max', '2026-12-03');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-tabell-${info.project.name}.png`, fullPage: true });
});

test('SM-VECKOVY: tangentbord och 200 procent text ryms på dator', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Vecka', exact: true }).focus();
  await page.keyboard.press('Space');
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-11-16');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(val.getByRole('button', { name: 'Nästa vecka' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await val.getByRole('button', { name: 'Nästa vecka' }).click();
  await expect(val.getByRole('combobox', { name: 'Vecka', exact: true })).toHaveValue('2026-11-23');
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-stor-text-${info.project.name}.png`, fullPage: true });
});
