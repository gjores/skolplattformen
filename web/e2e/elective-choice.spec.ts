// Komponentprov med syntetiska alternativ. Verklig valinlämning provas separat via SQL/Worker/OIDC.
import { test, expect } from '@playwright/test';
const url = '/e2e/fixtures/elective-choice-preview.html';
test('flera val kräver rätt omfattning och sökning bevarar dolda val', async ({ page }) => {
  await page.goto(url);
  const submit = page.getByRole('button', { name: 'Lämna val', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Franska/ }).check();
  await expect(submit).toBeDisabled();
  await page.getByRole('searchbox', { name: 'Sök alternativ' }).fill('Spanska');
  await page.getByRole('checkbox', { name: /^Spanska/ }).check();
  await submit.click();
  await expect(page.getByRole('status', { name: 'Inlämnade val' })).toHaveText('1,2');
  await page.getByRole('searchbox', { name: 'Sök alternativ' }).fill('');
  await expect(page.getByRole('checkbox', { name: /^Franska/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Alternativ 3/ })).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Franska/ }).uncheck();
  await expect(submit).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^Alternativ 3/ })).toBeEnabled();
  await expect(page.getByRole('checkbox', { name: /^Alternativ 8/ })).toBeDisabled();
});
test('ett val kan bytas och rensas utan att flera alternativ väljs', async ({ page }) => {
  await page.goto(`${url}?single`);
  await page.getByRole('radio', { name: /^Franska/ }).check();
  await page.getByRole('radio', { name: /^Spanska/ }).check();
  await expect(page.getByRole('radio', { name: /^Franska/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Lämna val', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Inlämnade val' })).toHaveText('2');
  await page.getByRole('button', { name: 'Rensa val', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lämna val', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
