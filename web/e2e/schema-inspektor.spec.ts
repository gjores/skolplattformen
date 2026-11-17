// 05.2-SM-UXF-42: panelen för valt pass och sammanhängande lägesfält. Simulerade rutter och syntetiska uppgifter; inget användarprov.
import { test, expect, type Page } from './schema-test';
import { SCHEMA_CONTRACT_VERSION } from '../lib/schema-contract.ts';
import { lagesfalt } from '../lib/schema-lagesfalt.ts';
import { LAGE } from '../app/schema/mojligt.tsx';
import fixture from './schema-fixture';
import kontroll from './fixtures/schema-kontroll.json' with { type: 'json' };
import folj from './fixtures/schema-folj.json' with { type: 'json' };

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const f = { ...fixture, contractVersion: SCHEMA_CONTRACT_VERSION, statistics: { lessons: [], bottlenecks: [], iterations: 0 } };
type Placement = { lesson: string; day: number; startMin: number; room: string | null };
const visible = f.lessons.filter(l => l.classIds.includes(f.classes[0].id) && (l.term === null || l.term === 'ht') && l.day !== null);
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
async function start(page: Page) {
  const checks: { placements: Placement[] }[] = [];
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: f }));
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON(); checks.push(body);
    return route.fulfill({ headers, json: { ...kontroll.clash, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint,
      violations: [], total: 0, metrics: { ...kontroll.clash.metrics, placed: body.placements.length, unplaced: f.lessons.length - body.placements.length } } });
  });
  await page.route('**/api/schema/lagen', route => route.fulfill({ headers, json: { ...folj.alla, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, lesson: route.request().postDataJSON().lesson } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('.schema-week')).toBeVisible();
  return checks;
}

test('ett klick visar passet och ändrar ingenting; flytt till exakt tid görs med tangentbordet utan dragning', async ({ page }, info) => {
  const checks = await start(page), l = visible[0];
  await expect.poll(() => checks.length).toBeGreaterThanOrEqual(0);
  const fore = checks.length;
  await page.locator(`.schema-week [data-lesson="${l.id}"]`).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel.getByRole('heading', { name: new RegExp(`^${l.title} · `, 'u') })).toBeVisible();
  await expect(panel).toContainText(`Tid${['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'][l.day!]} ${clock(l.startMin!)}`);
  await expect(panel).toContainText('Ett klick visar passet. Inget flyttas förrän du väljer Flytta hit.');
  await expect(panel.getByRole('status')).toHaveText('Passets nuvarande tid.');
  await expect(panel.getByRole('button', { name: 'Flytta hit' })).toBeDisabled();
  // Klicket gav ingen kontroll och inget ångra-steg.
  await page.waitForTimeout(300); expect(checks.length).toBe(fore);
  await expect(page.locator('.schema-undo').getByRole('button').first()).toBeDisabled();
  // Stega två starttider framåt med tangentbordet.
  const senare = panel.getByRole('button', { name: 'Senare start' });
  await senare.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  const mal = l.startMin! + 2 * f.startGridMin;
  await expect(panel.getByLabel('Starttid')).toHaveValue(String(mal));
  // Beskedet gäller den valda starten och nämner tiden en gång.
  await expect(panel.getByRole('status')).toContainText(clock(mal));
  expect((await panel.getByRole('status').innerText()).split(clock(mal)).length - 1).toBe(1);
  await panel.getByRole('button', { name: 'Tidigare start' }).focus(); await page.keyboard.press('Enter');
  await expect(panel.getByLabel('Starttid')).toHaveValue(String(mal - f.startGridMin));
  await senare.focus(); await page.keyboard.press('Enter');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') await panel.screenshot({ path: `${process.env.SCHEMA_BILDER}/inspektor.png` });
  await panel.getByRole('button', { name: 'Flytta hit' }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => checks.length).toBe(fore + 1);
  const flyttad = checks.at(-1)!.placements.find(p => p.lesson === l.id)!;
  expect([flyttad.day, flyttad.startMin]).toEqual([l.day, mal]);
});

test('möjlighetskartan ritar sammanhängande fält, färre och större än de prövade starttiderna', async ({ page }) => {
  await start(page);
  const l = visible[0];
  await page.locator(`.schema-week [data-lesson="${l.id}"]`).click();
  // Bara möjlighetskartans fält: veckans egna lager (till exempel sena pass) har andra texter.
  const falt = page.locator('.schema-week .schema-falt').filter({ hasText: new RegExp(`^(?:${Object.values(LAGE).filter(t => t !== LAGE.sparrad).map(t => t.replace(/[()]/gu, '\\$&')).join('|')})`, 'u') });
  const vantat = lagesfalt(folj.alla.positions as { day: number; startMin: number; state: string }[], f.startGridMin).filter(x => x.state !== 'sparrad');
  await expect(falt).toHaveCount(vantat.length);
  expect(vantat.length).toBeLessThan(folj.alla.positions.length);
  // Det största fältet rymmer sin text.
  const hojder = await falt.evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  expect(Math.max(...hojder)).toBeGreaterThanOrEqual(16);
});

test('panelen för valt pass vid 200 % text på 1280 px: inget ligger utanför sidan', async ({ page }) => {
  await start(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.locator(`.schema-week [data-lesson="${visible[0].id}"]`).click();
  await expect(page.getByRole('form', { name: 'Flytta pass' }).getByRole('button', { name: 'Senare start' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
