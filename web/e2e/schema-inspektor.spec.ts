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
  await page.route('**/api/schema/folj', route => route.fulfill({ headers, json: { ...folj.utanElever, contractVersion: SCHEMA_CONTRACT_VERSION, lesson: route.request().postDataJSON().lesson } }));
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
  await expect(panel.getByRole('group', { name: 'Pröva ny tid eller sal' })).toBeVisible();
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

test('arbetsytorna delar utkast och veckan lämnar plats åt passpanelen vid val', async ({ page, schemaDraftServer }, info) => {
  const checks = await start(page);
  const week = page.locator('.schema-week');
  const navigation = page.getByRole('navigation', { name: 'Arbetsytor' });
  const prepare = navigation.getByRole('button', { name: 'Förbered' });
  const schedule = navigation.getByRole('button', { name: 'Lägg schema' });
  const sidebar = page.getByRole('complementary', { name: 'Valt pass' });
  const pass = week.locator(`[data-lesson="${visible[0].id}"]`);
  await expect(page.getByRole('region', { name: 'Sparat schemautkast' })).toContainText('Sparat på servern');
  await expect(schedule).toHaveAttribute('aria-current', 'page');
  await expect(sidebar).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Beräkning', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.scrollTo(0, 0));
  const wholeWeek = (await week.boundingBox())!;
  expect(wholeWeek.y).toBeLessThan(page.viewportSize()!.height * 0.7);
  const previousWrites = schemaDraftServer.saves.length, previousChecks = checks.length;

  await pass.focus();
  await page.keyboard.press('Enter');
  await expect(sidebar.getByRole('combobox', { name: 'Dag', exact: true })).toBeFocused();
  await expect(sidebar.getByRole('button', { name: 'Följ passet', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Lås passet', exact: true })).toBeEnabled();
  const withPanel = (await week.boundingBox())!, panelBox = (await sidebar.boundingBox())!;
  expect(withPanel.width).toBeLessThan(wholeWeek.width);
  expect(panelBox.x).toBeGreaterThanOrEqual(withPanel.x + withPanel.width);
  expect(panelBox.y).toBeLessThan(withPanel.y + withPanel.height);

  await prepare.click();
  await expect(prepare).toHaveAttribute('aria-current', 'page');
  await expect(sidebar).toHaveCount(0);
  await schedule.click();
  await expect(schedule).toHaveAttribute('aria-current', 'page');
  await expect(pass).toHaveAttribute('aria-pressed', 'true');
  await expect(sidebar).toBeVisible();
  await page.getByRole('button', { name: 'Till kontrollerna', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kontroller och underlag', exact: true })).toBeFocused();
  await sidebar.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(pass).toBeFocused();
  await expect(sidebar).toHaveCount(0);
  expect((await week.boundingBox())!.width).toBeCloseTo(wholeWeek.width, 0);
  expect(checks.length).toBe(previousChecks);
  expect(schemaDraftServer.saves.length).toBe(previousWrites);
  await pass.click();
  await sidebar.getByRole('button', { name: 'Lås passet', exact: true }).click();
  await expect(pass).toContainText('Låst');
  await expect(sidebar.getByRole('button', { name: 'Flytta hit', exact: true })).toBeDisabled();
  await sidebar.getByRole('button', { name: 'Lås upp passet', exact: true }).click();
  await expect(pass).not.toContainText('Låst');
  if (process.env.SCHEMA_BILDER) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('schema-oversikt.png') });
  }
  await sidebar.getByRole('button', { name: 'Följ passet', exact: true }).click();
  const follow = page.getByRole('region', { name: /^Följ passet:/u });
  await expect(follow.getByRole('heading', { name: /^Följ passet:/u })).toBeFocused();
  await follow.getByRole('button', { name: 'Stäng', exact: true }).click();
  await expect(pass).toBeFocused();
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

test('panelen för valt pass vid 200 % text staplas och ryms inom sidan', async ({ page }) => {
  await start(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.locator(`.schema-week [data-lesson="${visible[0].id}"]`).click();
  const sidebar = page.getByRole('complementary', { name: 'Valt pass' });
  await expect(sidebar.getByRole('button', { name: 'Senare start' })).toBeVisible();
  const week = (await page.locator('.schema-week').boundingBox())!, panel = (await sidebar.boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(week.y + week.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
