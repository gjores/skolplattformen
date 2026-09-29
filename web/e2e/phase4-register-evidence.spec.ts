// Riktat lokalt prov med riktig Keycloak-inloggning och webbläsarnedladdning.
// Endast syntetiska 04-16-uppgifter; ingen publicerad eller kommunal anslutning.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { loginViaKeycloak, waitForHydration } from './helpers/keycloak.ts';

let password: string;
test.beforeAll(() => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../../work/pilot/verify-target.mjs', import.meta.url)), '--target', 'protected', '--with-idp'], { stdio: 'pipe', timeout: 30_000 });
  const secrets = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase4-users.json', import.meta.url)), 'utf8')) as Record<string, string>;
  password = secrets['p4.admin.skyddad'];
  if (!password) throw new Error('BLOCKED: 04-16-provkonto saknas');
});

test('ny inloggning återfinner urval och laddar CSV via webbläsaren', async ({ browser, baseURL }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const context = await browser.newContext({ baseURL, locale: 'sv-SE', acceptDownloads: true });
    try {
      const page = await context.newPage();
      const list = page.waitForResponse(response => new URL(response.url()).pathname === '/api/elever/lista' && response.request().method() === 'POST');
      const steps = await loginViaKeycloak(page, 'p4.admin.skyddad', { password });
      await waitForHydration(page);
      expect(steps.some(step => step === 'otp' || step === 'enroll')).toBe(true);
      expect((await list).status()).toBe(200);
      const searched = page.waitForResponse(response => new URL(response.url()).pathname === '/api/elever/lista' && response.request().method() === 'POST');
      await page.getByLabel('Sökord', { exact: true }).fill('Alex Prov');
      await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
      const data = await (await searched).json();
      expect(data.count).toBe(2);
      expect(new Set(data.pupils.map((pupil: { id: string }) => pupil.id)).size).toBe(2);
      await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
      if (attempt === 0) continue;
      const preview = page.waitForResponse(response => new URL(response.url()).pathname === '/api/elever/export' && response.request().postDataJSON()?.mode === 'preview');
      await page.getByRole('button', { name: 'Exportera urval…' }).click();
      expect((await (await preview).json()).count).toBe(2);
      const dialog = page.getByRole('dialog');
      const [download, response] = await Promise.all([
        page.waitForEvent('download'),
        page.waitForResponse(candidate => new URL(candidate.url()).pathname === '/api/elever/export' && candidate.request().postDataJSON()?.mode === 'download'),
        dialog.getByRole('button', { name: 'Exportera 2 elever (CSV)' }).click(),
      ]);
      expect(response.status()).toBe(200);
      expect(download.suggestedFilename()).toMatch(/\.csv$/u);
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      const csv = Buffer.concat(chunks).toString('utf8');
      expect(csv.split(/\r?\n/u).filter(Boolean)).toHaveLength(3);
      expect(csv).not.toContain('Skyddad Provperson');
    } finally { await context.close(); }
  }
});
