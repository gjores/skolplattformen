// 05.2-SM-UXF-51: egna samtidighetsblock i Förbered. Simulerade rutter och syntetiska uppgifter; inget användarprov.
// Motorns samma start prövas i schemamotor/crates/solve/tests/own_blocks.rs och underlagets kopplingar i lib/schema-blockunderlag.test.mjs.
import { test, expect, forberedFlik, type Page } from './schema-test';
import { bas, mockUnderlag, utanBerakning } from './schema-underlag-mock';

const URL = '/e2e/fixtures/schema-preview.html';
const rad = (title: string, klass: string) => bas.fordelning.find(r => r.title === title && r.classes.join() === klass)!;
async function laggTillPass(page: Page, undervisning: string, pass: RegExp) {
  const form = page.locator('[data-nytt-block]');
  await form.getByLabel('Undervisning').selectOption({ label: undervisning });
  await form.getByLabel('Pass', { exact: true }).selectOption({ label: (await form.getByLabel('Pass', { exact: true }).locator('option').allInnerTexts()).find(t => pass.test(t))! });
  await form.getByRole('button', { name: 'Lägg till passet' }).click();
}

test('ett samtidighetsblock av pass ur olika undervisningar läggs till, prövas och kan ångras utan beräkning', async ({ page }, info) => {
  const berakningar = await utanBerakning(page), reads = await mockUnderlag(page);
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  const yta = page.locator('[data-samtidighetsblock]'), form = page.locator('[data-nytt-block]');
  await expect(yta).toContainText('Passen kan sluta olika.');
  await form.getByLabel('Namn').fill('Engelska och matematik');
  await laggTillPass(page, 'Engelska · Klass 1', /^Pass 1 \(HT\)/u);
  await expect(form.getByRole('alert')).toContainText('2–20 pass');
  await laggTillPass(page, 'Matematik · Klass 2', /^Pass 1 \(HT\)/u);
  await expect(form.getByRole('list', { name: 'Pass i det nya blocket' }).getByRole('listitem')).toHaveCount(2);
  await form.getByRole('button', { name: 'Lägg till samtidighetsblock' }).click();
  const block = yta.locator('[data-block="block-1"]');
  await expect(block).toContainText('Engelska och matematik');
  // Underlaget läses om med blocket i villkoren och ger dess status. Ingen beräkning görs.
  await expect(block).toHaveAttribute('data-status', 'aktivt'); await expect(block).toContainText('2 pass börjar samtidigt.');
  expect(reads.at(-1)!.villkor.block).toEqual([{ id: 'block-1', namn: 'Engelska och matematik', medlemmar: [{ ref: rad('Engelska', 'Klass 1').ref, term: 'ht', pass: 1 }, { ref: rad('Matematik', 'Klass 2').ref, term: 'ht', pass: 1 }] }]);
  await expect(page.locator('[data-punkt="lektioner"]')).toContainText('1 eget samtidighetsblock');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') await yta.screenshot({ path: `${process.env.SCHEMA_BILDER}/samtidighetsblock.png` });
  // Ångra tar bort blocket i ett steg.
  await page.getByRole('button', { name: /^Ångra: samtidighetsblocket Engelska och matematik/u }).click();
  await expect(yta.locator('[data-block]')).toHaveCount(0);
  expect(berakningar).toHaveLength(0);
});

test('ett block där samma elever finns i två pass visas som hinder och nästa uppgift pekar dit', async ({ page }) => {
  await utanBerakning(page); await mockUnderlag(page);
  await page.goto(URL);
  await forberedFlik(page, 'Pass och salar').click();
  const form = page.locator('[data-nytt-block]');
  await form.getByLabel('Namn').fill('Språk');
  await laggTillPass(page, 'Spanska · Klass 1, Klass 2', /^Pass 1 \(HT\)/u);
  await laggTillPass(page, 'Tyska · Klass 1, Klass 2', /^Pass 1 \(HT\)/u);
  await form.getByRole('button', { name: 'Lägg till samtidighetsblock' }).click();
  const block = page.locator('[data-block="block-1"]');
  await expect(block).toHaveAttribute('data-status', 'hinder'); await expect(block).toContainText('Blocket ger ingen rätt till dubbelbokning');
  await expect(page.locator('[data-punkt="lektioner"]')).toContainText('Samtidighetsblocket Språk har ett hinder och används inte.');
  // Två pass ur samma undervisning nekas redan i formuläret.
  await form.getByLabel('Namn').fill('Dubbel');
  await laggTillPass(page, 'Spanska · Klass 1, Klass 2', /^Pass 1 \(HT\)/u);
  await laggTillPass(page, 'Spanska · Klass 1, Klass 2', /^Pass 2 \(HT\)/u);
  await expect(form.getByRole('alert')).toContainText('två pass ur samma undervisning');
  await expect(form.getByRole('button', { name: 'Lägg till samtidighetsblock' })).toBeDisabled();
});
