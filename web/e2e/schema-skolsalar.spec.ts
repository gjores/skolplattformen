// 05.2-SM-UXF-23: skolans salregister. Simulerade rutter och syntetiska uppgifter; tabellens regler och behörighet prövas i
// work/pilot/verify-school-rooms.mjs och lib/skolsalar-routes.test.mjs. Inget användarprov.
import { test, expect, mockSkolsalar, type Page } from './schema-test';
import { mockUnderlag } from './schema-underlag-mock';
import { defaultSchemaVillkor, type SchemaVillkor } from '../lib/schema-contract.ts';
import { laggTillSal } from '../lib/schema-salregister.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
const sal = (n: number, name: string) => ({ id: `sal-${n}`, name, typ: 'Allmän sal', platser: 30, utrustning: [] });
async function sparadeVillkor(page: Page, villkor: SchemaVillkor) {
  await page.addInitScript(([unit, value]) => { window.localStorage.setItem(`schema-villkor:${unit}`, value); }, [UNIT, JSON.stringify(villkor)] as const);
}
function egetRegister(): SchemaVillkor {
  let v: SchemaVillkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' };
  for (const [name, platser] of [['A101', 32], ['Labb 1', 24]] as const) v = laggTillSal(v, { name, typ: 'Allmän sal', platser, utrustning: [] });
  return v;
}

test('en sal läggs till i skolans register, sparas direkt och finns kvar i ett nytt utkast', async ({ page }, info) => {
  const skola = await mockSkolsalar(page); await mockUnderlag(page);
  await page.goto(URL);
  const salar = page.locator('[data-salar]');
  await expect(salar.getByText('0 salar i skolans salregister')).toBeVisible();
  await expect(salar).toContainText('Registret gäller hela skolan och alla schemautkast.');
  await salar.locator('[data-salregister]').getByRole('button', { name: 'Lägg till sal' }).click();
  const form = page.locator('[data-salform]');
  await form.getByLabel('Salens namn').fill('A101'); await form.getByLabel('Platser').fill('32');
  await form.getByRole('button', { name: 'Lägg till salen' }).click();
  await expect(salar.getByText('A101 är tillagd i skolans salregister.')).toBeVisible();
  await expect(salar.getByText('1 sal i skolans salregister')).toBeVisible();
  expect(skola.saves.map(s => [s.expectedRevision, s.document.nasta, s.document.salar.map(x => x.name)])).toEqual([[0, 2, ['A101']]]);
  // Ändringen ingår inte i utkastets Ångra.
  await expect(page.getByRole('button', { name: /Ångra.*A101/u })).toHaveCount(0);
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') await salar.screenshot({ path: `${process.env.SCHEMA_BILDER}/skolsalar.png` });
  // Ett nytt utkast utan sparade villkor visar samma sal.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-salar] [data-sal="sal-1"]')).toContainText('A101');
  await expect(page.locator('[data-salar]').getByText('1 sal i skolans salregister')).toBeVisible();
});

test('utkastets eget register förs över först efter förhandsgranskning och behåller numren', async ({ page }) => {
  const skola = await mockSkolsalar(page, { nasta: 3, salar: [sal(1, 'A101'), sal(2, 'Aula')] }); await mockUnderlag(page);
  await sparadeVillkor(page, egetRegister());
  await page.goto(URL);
  const salar = page.locator('[data-salar]'), overforing = salar.locator('[data-overforing]');
  await expect(salar.getByText('2 salar i utkastets salregister')).toBeVisible();
  // Utkastets sal-2 heter Labb 1 men skolans sal-2 är Aula: konflikt, inget sparas.
  await expect(overforing).toContainText('Labb 1: numret 2 är redan Aula i skolans salregister.');
  await expect(overforing.getByRole('button', { name: 'För över till skolans salregister' })).toBeDisabled();
  expect(skola.saves).toHaveLength(0);
});

test('utan konflikt: förhandsgranskningen säger vad som finns och vad som läggs till, och överföringen kan ångras i utkastet', async ({ page }) => {
  const skola = await mockSkolsalar(page, { nasta: 2, salar: [sal(1, 'A101')] }); await mockUnderlag(page);
  await sparadeVillkor(page, egetRegister());
  await page.goto(URL);
  const salar = page.locator('[data-salar]'), overforing = salar.locator('[data-overforing]');
  await expect(overforing.getByRole('list', { name: 'Salar som förs över' })).toContainText('A101: finns redan i skolans salregister');
  await expect(overforing).toContainText('Labb 1: läggs till i skolans salregister');
  await overforing.getByRole('button', { name: 'För över till skolans salregister' }).click();
  await expect(salar.getByText('2 salar i skolans salregister')).toBeVisible();
  await expect(overforing).toHaveCount(0);
  expect(skola.saves.at(-1)!.document.salar.map(s => [s.id, s.name])).toEqual([['sal-1', 'A101'], ['sal-2', 'Labb 1']]);
  await expect(page.locator('.schema-undo').getByRole('button').first()).toBeEnabled();
});
