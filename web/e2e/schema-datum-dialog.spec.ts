// Dialogens periodgränser. Full datumkontroll/lagring prövas separat mot den skyddade motorkedjan.
import { test, expect } from './schema-test';
const URL = '/e2e/fixtures/schema-datum-dialog-preview.html';
test('terminsutkast förklarar att terminsflytt kräver ett läsårsutkast och behåller datumvalet', async ({ page }, info) => {
  await page.goto(URL);
  const dialog = page.getByRole('dialog', { name: 'Ändra ett tillfälle' }), date = dialog.getByLabel('Datum', { exact: true });
  await expect(date).toHaveAttribute('min', '2026-08-17'); await expect(date).toHaveAttribute('max', '2026-12-18');
  await date.fill('2027-01-12'); await dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('ett utkast för hela läsåret'); await expect(date).toHaveValue('2027-01-12'); await expect(page.locator('[data-saved]')).toHaveText('Ingen ändring');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true })).toBeInViewport(); await page.screenshot({ path: info.outputPath('datum-periodgranser-200.png'), fullPage: false });
});
test('läsårsutkast kan förbereda flytt över terminsgränsen med originalets längd', async ({ page }) => {
  await page.goto(URL + '?period=lasar'); const dialog = page.getByRole('dialog', { name: 'Ändra ett tillfälle' });
  await dialog.getByLabel('Datum', { exact: true }).fill('2027-01-12'); await dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();
  await expect(page.locator('[data-saved]')).toContainText('"originalDate":"2026-11-03"'); await expect(page.locator('[data-saved]')).toContainText('"date":"2027-01-12"'); await expect(dialog.getByRole('alert')).toHaveCount(0);
});
