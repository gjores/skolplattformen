// Isoleringsprov för fas 1 (plan 01-08, BASE-02): blockerad start och byggd
// exempelvy får inte kontakta Supabase/Auth/RPC och lämnar ingen sb-session,
// trots syntetiska molnvärden i miljön.
//
// Projekt `blocked`: `npm run dev:blocked:test` (127.0.0.1:5192) med tomt läge
// och NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:59999.
// Projekt `built`: `npm run preview:example` (127.0.0.1:3011) mot dist/ efter
// `npm run build:example`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// Backend-mönster som aldrig får förekomma i någon request-URL.
const FORBIDDEN_PATHS = ['59999', '/auth/v1/', '/rest/v1/', '/rpc/'];

function collectRequests(page: Page) {
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  return urls;
}

/**
 * Anrop som bryter isoleringen: backend-mönster i sökvägen, eller någon
 * annan värd än provservern själv (t.ex. *.supabase.co). Dev-servern
 * levererar källmoduler som `/lib/supabase.ts` från sin egen värd; det är
 * modulladdning, inte ett backend-anrop, och räknas därför bara som brott
 * när värden är främmande.
 */
function offending(urls: string[], ownHost: string) {
  return urls.filter((url) => {
    const lower = url.toLowerCase();
    if (FORBIDDEN_PATHS.some((needle) => lower.includes(needle))) return true;
    return new URL(url).host !== ownHost && lower.includes('supabase');
  });
}

function foreignHosts(urls: string[], ownHost: string) {
  return urls.filter((url) => new URL(url).host !== ownHost);
}

async function supabaseStorageKeys(page: Page) {
  return page.evaluate(() => {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-')) keys.push(key);
    }
    return keys;
  });
}

test('blockerad start visar ingen arbetsyta och gör inga anrop till anslutningen', async ({ page, baseURL }) => {
  const ownHost = new URL(baseURL as string).host; // 127.0.0.1:5192
  const urls = collectRequests(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Arbetsytan är inte tillgänglig ännu' })).toBeVisible();
  await expect(page.getByText('Följ projektets startanvisning för att öppna provmiljön.')).toBeVisible();
  await expect(page.getByLabel('Exempelskola')).toHaveCount(0);
  await expect(page.getByText('Prova som')).toHaveCount(0);
  await expect(page.getByText('Provmiljö', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Om provmiljön' })).toHaveCount(0);
  // Ge eventuella fördröjda anrop tid att synas innan trafiken bedöms.
  await page.waitForTimeout(2000);
  expect(urls.length).toBeGreaterThan(0);
  expect(foreignHosts(urls, ownHost)).toEqual([]);
  expect(offending(urls, ownHost)).toEqual([]);
  expect(urls.filter((url) => url.toLowerCase().includes('supabase.co'))).toEqual([]);
  expect(await supabaseStorageKeys(page)).toEqual([]);
});

test('byggd exempelvy gör inga Supabase-anrop och lämnar ingen session', async ({ page, baseURL }) => {
  const ownHost = new URL(baseURL as string).host; // 127.0.0.1:3011
  const urls = collectRequests(page);
  await page.goto('/');
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
  // Vänta in hydreringen innan sidan används (se phase1-baseline.spec.ts).
  await page.waitForFunction(() => {
    const el = document.getElementById('exempelskola');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
  await page.getByLabel('Exempelskola').selectOption({ label: 'Exempelstads gymnasium — Gymnasium' });
  await page.getByRole('button', { name: 'Utbildningar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Visa Samhällsvetenskap' })).toBeVisible();
  await page.getByRole('button', { name: 'Om provmiljön' }).click();
  const dialog = page.getByRole('dialog', { name: 'Om provmiljön' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stäng hjälpen' }).click();
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(2000);

  expect(urls.length).toBeGreaterThan(0);
  expect(foreignHosts(urls, ownHost)).toEqual([]);
  expect(offending(urls, ownHost)).toEqual([]);
  // Det byggda paketet får inte hämta något som heter supabase alls.
  expect(urls.filter((url) => url.toLowerCase().includes('supabase'))).toEqual([]);
  expect(await supabaseStorageKeys(page)).toEqual([]);
  await expect(page.getByText('Provmiljö', { exact: true })).toBeVisible();
});

test('byggd vy är märkt med exempelläge', async () => {
  const markPath = fileURLToPath(new URL('../dist/build-mode.json', import.meta.url));
  const mark = JSON.parse(readFileSync(markPath, 'utf8')) as { mode?: string; revision?: string };
  expect(mark.mode).toBe('example');
  expect(typeof mark.revision).toBe('string');
});
