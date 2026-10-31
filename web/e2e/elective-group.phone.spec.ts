// Syntetisk komponentmiljö; tjänstefördelningens telefonläge är skrivskyddat.
import { test, expect } from '@playwright/test';
const URL = '/e2e/fixtures/elective-group-preview.html';
test('telefon visar grupp, ursprungsklasser och behov utan redigeringsknappar', async ({ page }) => {
  await page.goto(URL); await expect(page.getByRole('heading', { name: 'Spanska gemensam', exact: true })).toBeVisible();
  await expect(page.getByText(/SA26, NA26/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tilldela/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
