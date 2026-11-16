// Användarens C2/C3/C4/C6/C8: verkliga komponenter, syntetiskt underlag och uttryckligt simulerade schemarutter.
import { test, expect, type Page } from './schema-test';
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaRegel, type SchemaVillkor } from '../lib/schema-contract.ts';
import { samlingResurser } from '../lib/schema-samling.ts';

const URL = '/e2e/fixtures/schema-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const base = { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
const margin: SchemaRegel = { slag: 'amne', ref: 'Idrott och hälsa', typ: 'marginal', beforeMin: 10, afterMin: 15,
  occupies: ['elever'], label: 'Omklädning före, dusch efter', visibleFor: ['elever'], when: 'alltid' };
const firstGroup = samlingResurser(base).find(r => r.slag === 'grupp')!;
const longGroup = { ...firstGroup, name: 'Moderna språk – fördjupning – nivå 2, franska' };
const resources = samlingResurser(base).map(r => r.key === longGroup.key ? longGroup : r);

async function setup(page: Page, egna: SchemaRegel[] = []) {
  const controls: SchemaVillkor[] = [];
  await page.addInitScript(({ unitId, villkor }) => localStorage.setItem(`schema-villkor:${unitId}`, JSON.stringify(villkor)),
    { unitId: base.unitId, villkor: { ...base.villkor, egna } });
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...base, villkor: route.request().postDataJSON().villkor } }));
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON(); controls.push(body.villkor);
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint,
      fingerprint: base.fingerprint, violations: [], total: 0, teachings: base.teachings, trims: base.trims, metrics: base.metrics, rooms: {} } });
  });
  await page.route('**/api/schema/samling', route => route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION,
    grundFingerprint: base.grundFingerprint, resources, clusters: [] } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
  return controls;
}

async function conditionCell(page: Page, resource: string, column: string) {
  const table = page.getByRole('grid', { name: 'Villkor i tabell', exact: true });
  const index = await table.locator('thead th').evaluateAll((ths, name) => ths.findIndex(th => th.textContent?.trim() === name), column);
  expect(index).toBeGreaterThanOrEqual(0);
  return table.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: resource, exact: true }) }).locator('th,td').nth(index);
}

test('hela skolans värden överlappas inte av den fasta namnkolumnen, även vid 200 procent text', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: 'Villkor i tabell', exact: true }).click();
  await page.getByRole('tab', { name: 'Hela skolan', exact: true }).click();
  for (const size of [16, 32]) {
    await page.addStyleTag({ content: `html { font-size: ${size}px !important; }` });
    const table = page.getByRole('grid', { name: 'Villkor i tabell', exact: true });
    await table.getByRole('columnheader', { name: 'Värde', exact: true }).scrollIntoViewIfNeeded();
    const geometry = await table.evaluate(element => {
      const first = element.querySelector('thead th')!.getBoundingClientRect();
      const second = element.querySelectorAll('thead th')[1].getBoundingClientRect();
      const name = element.querySelector('tbody th')!.getBoundingClientRect();
      const value = element.querySelector('tbody td')!.getBoundingClientRect();
      return { headingOverlap: first.right - second.left, valueOverlap: name.right - value.left };
    });
    expect(geometry.headingOverlap).toBeLessThanOrEqual(1);
    expect(geometry.valueOverlap).toBeLessThanOrEqual(1);
    await expect(await conditionCell(page, 'Skoldag', 'Värde')).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`skolans-villkor-${size}px.png`), fullPage: false });
  }
});

test('en marginal kan sparas som ingen och tas bort uttryckligt, båda går att ångra', async ({ page }, info) => {
  const controls = await setup(page, [margin]);
  await page.getByRole('button', { name: 'Villkor i tabell', exact: true }).click();
  await page.getByRole('tab', { name: 'Ämnen', exact: true }).click();
  const cell = await conditionCell(page, margin.ref, 'Marginal');
  await cell.dblclick();
  const editor = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: 'Marginal för Idrott och hälsa', exact: true }) });
  await editor.getByRole('combobox', { name: 'Före passet', exact: true }).selectOption('0');
  await editor.getByRole('combobox', { name: 'Efter passet', exact: true }).selectOption('0');
  await expect(editor.getByRole('button', { name: 'Spara', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Spara', exact: true }).click();
  await expect(cell).toHaveText('Inget villkor');
  await expect.poll(() => controls.at(-1)?.egna).toEqual([]);
  await page.getByRole('button', { name: 'Ångra senaste villkor', exact: true }).click();
  await expect(cell).toContainText('10/15 min, elever');
  await expect.poll(() => controls.at(-1)?.egna).toEqual([margin]);
  await cell.dblclick();
  // Borttagningen kräver inte att ett formulär med ogiltigt eget innehåll först kan sparas.
  await editor.getByLabel('Eleverna', { exact: true }).uncheck();
  await expect(editor.getByRole('button', { name: 'Spara', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Ta bort villkoret', exact: true }).click();
  await expect(cell).toHaveText('Inget villkor');
  await page.getByRole('button', { name: 'Ångra senaste villkor', exact: true }).click();
  await expect(cell).toContainText('10/15 min, elever');
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await cell.dblclick();
  const remove = editor.getByRole('button', { name: 'Ta bort villkoret', exact: true });
  await remove.scrollIntoViewIfNeeded();
  await expect(remove).toBeInViewport();
  const editorBox = await editor.boundingBox();
  expect(editorBox).toBeTruthy();
  expect(editorBox!.x).toBeGreaterThanOrEqual(0);
  expect(editorBox!.x + editorBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(editorBox!.y).toBeGreaterThanOrEqual(0);
  expect(editorBox!.y + editorBox!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({ path: info.outputPath('ta-bort-marginal-stor-text.png'), fullPage: false });
});

test('resurssök visar rena namnrader med grupprubrik och fungerar med tangentbord vid stor text', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: 'Samlingsvy', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg till resurs', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Lägg till klass, grupp, lärare, sal eller elev', exact: true });
  const input = dialog.getByRole('combobox', { name: 'Sök resurs', exact: true });
  await input.fill(base.teachers[0].name);
  await expect(dialog.locator('.samling-resursnamn').first()).toHaveText(base.teachers[0].name);
  expect(await dialog.locator('.schema-note').count()).toBe(0);
  await input.press('Enter');
  await expect(page.getByRole('button', { name: `Ta bort ${base.teachers[0].name} från samlingsvyn`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lägg till resurs', exact: true }).click();
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await input.fill(longGroup.name);
  const option = dialog.getByRole('option').filter({ hasText: longGroup.name }).first();
  await expect(option).toBeVisible();
  const box = await option.boundingBox(), name = await option.locator('.samling-resursnamn').boundingBox(), windowBox = await dialog.boundingBox();
  expect(box && name && windowBox).toBeTruthy();
  expect(name!.x).toBeGreaterThanOrEqual(box!.x);
  expect(name!.x + name!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
  expect(windowBox!.y).toBeGreaterThanOrEqual(0);
  expect(windowBox!.y + windowBox!.height).toBeLessThanOrEqual(1000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('resurssok-stor-text.png'), fullPage: false });
});

test('aktivitetsformuläret visar vad som saknas och behåller valen, utan notis om nationella prov', async ({ page }, info) => {
  await setup(page);
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await expect(dialog.getByText(/Nationella prov hör/)).toHaveCount(0);
  await dialog.getByLabel('Namn', { exact: true }).fill('APT prov');
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Välj minst en klass, grupp, ansvarig eller sal som aktiviteten ska uppta.');
  await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('APT prov');
  await dialog.getByLabel(base.resurser.larare[0].name, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Låt motorn placera', exact: true }).click();
  await dialog.getByLabel('Längd i minuter', { exact: true }).fill('60');
  await dialog.getByLabel('Tidigast', { exact: true }).fill('08:00');
  await dialog.getByLabel('Senast slut', { exact: true }).fill('08:30');
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Tiden mellan Tidigast och Senast slut ska vara minst 60 minuter, så att hela aktiviteten ryms.');
  await expect(dialog.getByLabel(base.resurser.larare[0].name, { exact: true })).toBeChecked();
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await dialog.getByRole('alert').scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('aktivitet-konkreta-fel-stor-text.png'), fullPage: false });
});
