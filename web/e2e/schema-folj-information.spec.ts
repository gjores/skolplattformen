// Användarens TMI-fynd: riktiga följkomponenter, syntetiskt valblock och uttryckligt simulerade rutter.
import { test, expect, type Page } from './schema-test';
import raw from './schema-fixture';
import following from './fixtures/schema-folj.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';

const headers = { 'X-Context-Epoch': '1' }, URL = '/e2e/fixtures/schema-preview.html';
const amnen = 'Spanska · Moderna språk – fortsättning – Nivå 1, Franska · Moderna språk – fördjupning – Nivå 1, Franska · Moderna språk – fördjupning – Nivå 2, Moderna språk – fördjupning – nivå 2, franska';
const blockTitel = `Valbart block: ${amnen}`;

async function setup(page: Page, block: boolean) {
  const f = { ...structuredClone(raw), contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
  const lesson = f.lessons.find(l => l.id === following.lesson)!;
  if (block) { lesson.title = blockTitel; lesson.durationMin = 80; lesson.teacherIds = f.teachers.slice(0, 3).map(t => t.id); }
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...f, villkor: route.request().postDataJSON().villkor } }));
  await page.route('**/api/schema/folj', route => route.fulfill({ headers, json: { ...following.utanElever, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await page.route('**/api/schema/lagen', route => route.fulfill({ headers, json: { ...following.alla, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible();
  await page.locator(`[data-lesson="${lesson.id}"]`).first().focus();
  await page.keyboard.press('f');
  const panel = page.getByRole('region', { name: /^Följ passet:/u });
  await expect(panel).toBeVisible();
  await expect(panel.locator('.folj-start').first()).toBeAttached();
  return { panel, lesson, f };
}

test('valblock sammanfattas en gång och lärarrader upprepar inte ämneslistorna, även med stor text', async ({ page }, info) => {
  const { panel, lesson, f } = await setup(page, true);
  await expect(panel.getByRole('heading', { name: 'Följ passet: Valbart block, Klass 1', exact: true })).toBeVisible();
  const summary = panel.locator('summary').filter({ hasText: /^Visa ämnen i blocket$/u });
  const details = summary.locator('..');
  const fullaAmnen = details.getByText(amnen, { exact: true });
  await expect(fullaAmnen).not.toBeVisible();

  for (const size of [16, 32]) {
    await page.addStyleTag({ content: `html { font-size: ${size}px !important; }` });
    await expect(panel.locator('.folj-mojligt .folj-namn small')).toHaveText('Valbart block, 80 min');
    const rows = panel.locator('.folj-larare');
    await expect(rows).toHaveCount(3);
    for (const [index, teacher] of f.teachers.slice(0, 3).entries()) {
      await expect(rows.nth(index).locator('.folj-namn b')).toHaveText(teacher.name);
      await expect(rows.nth(index).locator('.folj-namn small')).toHaveText('lärare');
      expect((await rows.nth(index).boundingBox())!.height).toBeLessThan(size * 6);
    }
    const pass = panel.locator(`[data-schema-pass="${lesson.id}"]`).first();
    await expect(pass).toHaveAttribute('title', new RegExp(blockTitel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    await expect(pass).toHaveAccessibleName(new RegExp(blockTitel.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')));
    await summary.focus(); await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await expect(fullaAmnen).toBeVisible();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Space');
    await expect(details).not.toHaveAttribute('open');
    await expect(fullaAmnen).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await panel.scrollIntoViewIfNeeded();
    await panel.screenshot({ path: info.outputPath(`folj-valblock-${size}px.png`) });
  }
});

test('ett vanligt pass behåller ämnesnamnet och får ingen valblocksdetalj', async ({ page }) => {
  const { panel, lesson } = await setup(page, false);
  await expect(panel.getByRole('heading', { name: `Följ passet: ${lesson.title}, Klass 1`, exact: true })).toBeVisible();
  await expect(panel.locator('.folj-mojligt .folj-namn small')).toHaveText(`${lesson.title}, ${lesson.durationMin} min`);
  await expect(panel.locator('summary').filter({ hasText: 'Visa ämnen i blocket' })).toHaveCount(0);
  await expect(panel.locator('.folj-larare .folj-namn small')).toHaveText('lärare');
});
