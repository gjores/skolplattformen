// 05.2-SM-UXFLODE: förutsättningar före första förslaget, mot uttryckligt simulerade rutter och syntetiska uppgifter. Inget användarprov.
import { test, expect, type Page } from './schema-test';
import rawForslag from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaVillkor } from '../lib/schema-contract.ts';

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const base = { ...rawForslag, contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
/** Underlaget utan beräkning: samma pass, inget lagt. */
export function olagt(villkor: SchemaVillkor): SchemaForslag {
  const f = structuredClone(base);
  f.villkor = villkor; f.lessons = f.lessons.map(l => ({ ...l, day: null, startMin: null, roomId: null })); f.status = 'cancelled'; delete f.locks;
  f.metrics = { ...f.metrics, placed: 0, unplaced: f.lessons.length };
  return f;
}
export async function mockUnderlag(page: Page) {
  const bodies: { villkor: SchemaVillkor }[] = [];
  await page.route('**/api/schema/underlag', route => {
    const body = route.request().postDataJSON() as { villkor: SchemaVillkor }; bodies.push(body);
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, beraknat: false, forslag: olagt(body.villkor) } });
  });
  return bodies;
}

test('resurser, lektionsantal och villkor går att läsa och ändra utan beräknat förslag', async ({ page }) => {
  const solves: unknown[] = [];
  await page.route('**/api/schema/forslag', route => { solves.push(route.request().postDataJSON()); return route.abort(); });
  await page.route('**/api/schema/diagnos', route => { solves.push(route.request().postDataJSON()); return route.abort(); });
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
  await page.getByRole('button', { name: 'Lägg till sal' }).click();
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
