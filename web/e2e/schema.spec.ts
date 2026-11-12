// Vyn Schema mot ett syntetiskt förslag som schemamotorn har räknat (work/schema/verify-koppling.mjs).
// Rutt, behörighet och motoranrop verifieras separat; här prövas bara vad användaren ser.
import { test, expect, type Page } from '@playwright/test';
import forslag from './fixtures/schema-forslag.json' with { type: 'json' };
const URL = '/e2e/fixtures/schema-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const shots = process.env.SCHEMA_SHOTS;
async function mock(page: Page, reply: (body: Record<string, unknown>) => { status?: number; json: unknown }) {
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    return route.fulfill({ headers, ...reply(body) });
  });
  return bodies;
}

test('förslaget visas som vecka per klass och per lärare, utan sidledsrullning', async ({ page }, info) => {
  const bodies = await mock(page, () => ({ json: forslag }));
  await page.goto(URL);
  await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  await expect(page.getByText('Det sparas inte och publiceras inte.')).toBeVisible();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  expect(bodies).toEqual([{ unitId: forslag.unitId, schoolYear: 2026, term: 'ht', weeks: 18 }]);
  await expect(page.getByText('276 av 276 pass per vecka har fått en tid.')).toBeVisible();
  await expect(page.getByText('Underlag: tjänstefördelning version 1 (utkast).')).toBeVisible();

  const monday = page.getByRole('region', { name: 'Måndag' });
  await expect(monday.getByRole('listitem').first()).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/u);
  // Klass 1 har idrott utan lärare i underlaget.
  await expect(page.locator('.schema-lesson.vacant').first()).toContainText('Ingen lärare');
  const perClass = await page.locator('.schema-lesson').count();
  expect(perClass).toBe(forslag.lessons.filter(l => l.classIds.includes(forslag.classes[0].id)).length);

  await page.getByRole('button', { name: 'Lärare' }).click();
  await expect(page.getByRole('button', { name: 'Lärare' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.schema-filter select').selectOption({ label: forslag.teachers[1].name });
  await expect(page.locator('.schema-lesson')).toHaveCount(forslag.lessons.filter(l => l.teacherIds.includes(forslag.teachers[1].id)).length);
  await expect(page.locator('.schema-lesson').first()).toContainText('Klass');
  await expect(page.getByRole('heading', { name: 'Antaganden i förslaget' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-${info.project.name}.png`, fullPage: true });
});

test('olagda pass, förklaring och utelämnade behov redovisas i text', async ({ page }) => {
  const first = forslag.lessons[0];
  await mock(page, () => ({ json: { ...forslag, status: 'time_limit', lessons: [{ ...first, day: null, startMin: null }, ...forslag.lessons.slice(1)],
    diagnoses: [{ message: `Pass ${first.title} fick ingen plats.`, proof: false }], omitted: [{ title: 'Liten kurs', classes: ['Klass 1'], reason: 'too_short' }],
    metrics: { ...forslag.metrics, placed: 275, unplaced: 1 } } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Räknetiden tog slut')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pass utan tid (1)' })).toBeVisible();
  await expect(page.getByText(`Pass ${first.title} fick ingen plats.`)).toBeVisible();
  await expect(page.getByText('Liten kurs · Klass 1: mindre än 20 min i veckan')).toBeVisible();
});

test('motor som inte är ansluten ger ett tydligt besked och inget schema', async ({ page }) => {
  await mock(page, () => ({ status: 503, json: { code: 'schema_engine_unavailable', correlationId: 'prov', details: { reason: 'schema_engine_unconfigured' } } }));
  await page.goto(URL);
  await page.getByLabel('Termin').selectOption('vt');
  await expect(page.getByLabel('Undervisningsveckor')).toHaveValue('20');
  await page.getByLabel('Undervisningsveckor').fill('0');
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag' })).toBeDisabled();
  await expect(page.getByText('Ange 1–30 veckor.')).toBeVisible();
  await page.getByLabel('Undervisningsveckor').fill('19');
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('alert')).toHaveText('Schemamotorn är inte ansluten i den här miljön. Inget förslag kan tas fram.');
  await expect(page.locator('.schema-week')).toHaveCount(0);
});

test('svar för en annan termin än den begärda visas inte', async ({ page }) => {
  await mock(page, () => ({ json: { ...forslag, term: 'vt' } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('alert')).toHaveText('Schemaförslaget kunde inte tas fram. Försök igen.');
});
