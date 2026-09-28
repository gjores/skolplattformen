// Isolerat browserregressionsprov av initial session401; inget IdP/DB-prov.
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'no_session' }) }));
});
test('första oinloggade sidvisningen bevarar inbjudans returväg', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sp_elevsok_old', 'syntetisk-testtext');
    sessionStorage.setItem('sp_elevsok_old', 'syntetisk-testtext');
  });
  await page.goto('/?till=%2Finbjudan&vy=elever&lasar=2026&sok=syntetisk-testtext');
  await expect(page.getByRole('link', { name: 'Logga in', exact: true })).toHaveAttribute('href', '/api/auth/login?till=/inbjudan');
  expect([...new URL(page.url()).searchParams.keys()]).toEqual(['till']);
  expect(await page.evaluate(() => JSON.stringify({ state: history.state, local: { ...localStorage }, session: { ...sessionStorage } }))).not.toContain('syntetisk-testtext');
});
test('första oinloggade sidvisningen bevarar nekad inloggnings felkod', async ({ page }) => {
  await page.goto('/?inloggning=nekad&kod=test-denied');
  await expect(page.getByRole('alert')).toContainText('kod: test-denied');
});
