// 05.2-SM-UXF-41: Tilldela salar och behåll tiderna. Simulerade rutter och syntetiska uppgifter; inget användarprov.
// Kontrollens svar här fyller inte i salar själv. Den riktiga kontrollen fyller i första tillåtna sal; då gäller tilldelningen salar som kontrollen underkänt (prövat i schema-salsattning.test.mjs).
import { test, expect, forberedFlik, type Page } from './schema-test';
import { bas, headers, lagt, mockUnderlag } from './schema-underlag-mock';
import kontrollFixtur from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor, type SchemaPlacement, type SchemaVillkor } from '../lib/schema-contract.ts';
import { laggTillSal } from '../lib/schema-salregister.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
function register(): SchemaVillkor {
  let v: SchemaVillkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' };
  for (const [name, platser] of [['A101', 32], ['A102', 30], ['A103', 28]] as const) v = laggTillSal(v, { name, typ: 'Allmän sal', platser, utrustning: [] });
  return v;
}
const svenska = bas.lessons.filter(l => l.title === 'Svenska' && l.day !== null);
async function mocka(page: Page) {
  const kontroller: { placements: SchemaPlacement[] }[] = [];
  await mockUnderlag(page);
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: lagt(route.request().postDataJSON().villkor) }));
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON() as { placements: SchemaPlacement[] }; kontroller.push(body);
    return route.fulfill({ headers, json: { ...kontrollFixtur.clash, violations: [], total: 0, rooms: Object.fromEntries(body.placements.filter(p => p.room).map(p => [p.lesson, p.room])) } });
  });
  await page.addInitScript(([unit, value]) => { if (window.localStorage.getItem(`schema-villkor:${unit}`) === null) window.localStorage.setItem(`schema-villkor:${unit}`, value); }, [UNIT, JSON.stringify(register())] as const);
  return kontroller;
}
const tider = (placements: SchemaPlacement[]) => JSON.stringify(placements.map(p => [p.lesson, p.day, p.startMin]).sort());

test('salar förhandsgranskas, används som ett steg och kan ångras, utan att någon tid ändras', async ({ page }, info) => {
  const kontroller = await mocka(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  // Inget salbehov finns ännu: inget att tilldela.
  await expect(page.locator('[data-salsattning]')).toHaveCount(0);
  // Ämnet Svenska får Lämplig allmän sal i Förbered.
  await page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' }).click();
  await forberedFlik(page, 'Pass och salar').click();
  const behov = page.locator('[data-salbehov]');
  await behov.getByRole('radio', { name: /^Ämnet Svenska/u }).check();
  await behov.getByRole('radio', { name: 'Lämplig allmän sal' }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' }).click();
  const panel = page.locator('[data-salsattning]');
  await expect(panel).toContainText(`${svenska.length} pass har tid och ska ha sal`);
  await expect(page.locator('[data-lage="sal"]')).toContainText(`0 av ${svenska.length} pass som ska ha sal har sal`);
  const fore = kontroller.length;
  await panel.getByRole('button', { name: 'Förhandsgranska salarna' }).click();
  const visning = panel.locator('[data-salsattning-visning]');
  await expect(visning).toHaveAttribute('data-salsattning-visning', 'aktuell');
  const antal = Number((await visning.locator('[data-antal="far-sal"]').innerText()).match(/(\d+) pass/u)![1]), hinder = Number((await visning.locator('[data-antal="hinder"]').innerText()).match(/(\d+) pass/u)![1]);
  expect(antal).toBeGreaterThan(0); expect(antal + hinder).toBe(svenska.length);
  await expect(visning.locator('[data-tilldelad]')).toHaveCount(antal);
  await expect(visning).toContainText('inga nya regelavvikelser');
  // Förhandsgranskningen prövade hela schemat med samma tider, och utkastet är orört.
  expect(kontroller.length).toBe(fore + 1);
  const provad = kontroller.at(-1)!.placements;
  expect(tider(provad)).toBe(tider(bas.lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin!, room: null }])));
  expect(provad.filter(p => p.room).length).toBe(antal);
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') await panel.screenshot({ path: `${process.env.SCHEMA_BILDER}/salsattning.png` });
  // Avbryt lämnar schemat orört.
  await visning.getByRole('button', { name: 'Avbryt' }).click();
  await expect(page.locator('[data-lage="sal"]')).toContainText(`0 av ${svenska.length} pass som ska ha sal har sal`);
  await panel.getByRole('button', { name: 'Förhandsgranska salarna' }).click();
  await visning.getByRole('button', { name: `Använd salarna för ${antal} pass` }).click();
  await expect(page.getByText(`Salar tilldelade för ${antal} pass. Ingen tid har ändrats.`, { exact: false })).toBeVisible();
  await expect(page.locator('[data-lage="sal"]')).toContainText(hinder ? `${antal} av ${svenska.length} pass som ska ha sal har sal` : `Alla ${svenska.length} pass som ska ha sal har sal`);
  // Klass 3 har okänt elevantal i provdata: de passen redovisas som inte kontrollerade, aldrig som godkända.
  const okanda = svenska.filter(l => l.classIds.some(id => bas.classes.find(c => c.id === id)?.name === 'Klass 3')).length;
  expect(okanda).toBeGreaterThan(0);
  await expect(page.locator('[data-lage="kapacitet"]')).toContainText(/Platserna räcker för \d+ pass, \d+ inte kontrollerade/u);
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  // Ångra återställer alla salar i ett steg.
  await page.locator('.schema-undo').getByRole('button').first().click();
  await expect(page.locator('[data-lage="sal"]')).toContainText(`0 av ${svenska.length} pass som ska ha sal har sal`);
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  for (const k of kontroller) expect(tider(k.placements)).toBe(tider(provad));
});

test('en förhandsgranskning blir inaktuell när salbehoven ändras, och kan då inte användas', async ({ page }) => {
  await mocka(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' }).click();
  await forberedFlik(page, 'Pass och salar').click();
  const behov = page.locator('[data-salbehov]');
  await behov.getByRole('radio', { name: /^Ämnet Svenska/u }).check(); await behov.getByRole('radio', { name: 'Lämplig allmän sal' }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' }).click();
  const panel = page.locator('[data-salsattning]');
  await panel.getByRole('button', { name: 'Förhandsgranska salarna' }).click();
  await expect(panel.locator('[data-salsattning-visning]')).toHaveAttribute('data-salsattning-visning', 'aktuell');
  await page.locator('[data-ytval]').getByRole('button', { name: 'Förbered' }).click();
  await forberedFlik(page, 'Pass och salar').click();
  await behov.getByRole('radio', { name: 'Särskilda salskrav' }).check(); await behov.getByLabel('A101', { exact: true }).check();
  await behov.getByRole('button', { name: 'Spara salbehov' }).click();
  await page.locator('[data-ytval]').getByRole('button', { name: 'Lägg schema' }).click();
  await expect(panel.locator('[data-salsattning-visning]')).toHaveAttribute('data-salsattning-visning', 'inaktuell');
  await expect(panel.getByRole('button', { name: /^Använd salarna/u })).toBeDisabled();
});
