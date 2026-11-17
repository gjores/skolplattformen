// 05.2-SM-UXFLODE: förutsättningar före första förslaget, mot uttryckligt simulerade rutter och syntetiska uppgifter. Inget användarprov.
import { test, expect } from './schema-test';
import { bas as base, mockUnderlag, utanBerakning } from './schema-underlag-mock';

const URL = '/e2e/fixtures/schema-preview.html';

test('resurser, lektionsantal och villkor går att läsa och ändra utan beräknat förslag', async ({ page }) => {
  const solves = await utanBerakning(page);
  const reads = await mockUnderlag(page);
  await page.goto(URL);
  const underlag = page.getByRole('region', { name: 'Underlag före första förslaget' });
  await expect(underlag).toContainText(`${base.fordelning.length} undervisningar`);
  await expect(underlag).toContainText('Inget schemaförslag är beräknat.');
  await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  // Eget villkor för en klass, före första förslaget.
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  const form = page.locator('.schema-egna-form');
  await form.getByLabel(/^Gäller/u).selectOption('klass');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await expect(page.getByRole('list', { name: 'Egna villkor' })).toContainText(base.resurser.klass[0].name);
  // En spärrad tid är ett tidsvillkor och läser inte om underlaget. En ny sal ändrar grunden: underlaget läses om, utan beräkning.
  expect(reads).toHaveLength(1);
  await page.getByLabel('Salens namn').fill('Idrottshallen');
  await page.getByRole('group', { name: 'Salar' }).getByRole('button', { name: 'Lägg till sal' }).click();
  await expect.poll(() => reads.length).toBe(2);
  expect(reads[1].villkor.salar).toEqual(['Idrottshallen']); expect(reads[1].villkor.egna).toHaveLength(1);
  await underlag.getByText('Antal lektioner per undervisning').click();
  await expect(underlag.getByText(base.fordelning[0].title).first()).toBeVisible();
  await underlag.locator('summary', { hasText: 'Villkor i tabell' }).click();
  await expect(underlag.getByRole('heading', { name: 'Villkor i tabell' })).toBeVisible();
  await expect(underlag.getByRole('table').first()).toBeVisible();
  expect(solves).toHaveLength(0);
});

test('misslyckad underlagsläsning hindrar inte villkoren och går att göra om', async ({ page }) => {
  await page.goto(URL);
  const underlag = page.getByRole('region', { name: 'Underlag före första förslaget' });
  await expect(underlag).toContainText('Underlaget kunde inte läsas.');
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.locator('.schema-egna-form')).toHaveCount(0);
  await mockUnderlag(page);
  await underlag.getByRole('button', { name: 'Läs underlaget igen' }).click();
  await expect(underlag).toContainText('Inget schemaförslag är beräknat.');
});
