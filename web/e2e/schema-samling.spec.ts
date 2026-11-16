// Samlingsvy mot syntetiskt förslag och simulerade lässvar. Dessa prov påstår inte faktisk serverbehörighet eller kommunanslutning.
import { test, expect, type Page } from './schema-test';
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import { samlingResurser, type SchemaSamlingData } from '../lib/schema-samling.ts';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
});

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const f = { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION, rooms: [{ id: 'sal-1', name: 'Provsal 1' }], villkor: { ...proposal.villkor, salar: ['Provsal 1'] } } as SchemaForslag;
async function setup(page: Page, pupils = false) {
  const resources = samlingResurser(f);
  const data: SchemaSamlingData = { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources: [...resources,
    ...(pupils ? [{ key: 'elev:1', id: 'elev-1', name: 'Provelev Samling', slag: 'elev' as const, lessons: resources[0].lessons, busyLessons: resources[0].lessons, size: 1, antagen: false, year: null }] : [])],
    clusters: [{ size: 25, antagen: true, lessons: resources[0].lessons }] };
  await page.route('**/api/schema/forslag', r => r.fulfill({ headers, json: f }));
  await page.route('**/api/schema/samling', r => r.fulfill({ headers, json: data }));
  await page.goto(URL);
  // Även testets extra sal väljs i det riktiga formuläret, så att det simulerade svaret motsvarar begärans villkor.
  // Detta fungerar också i fallet där localStorage-gettern avsiktligt nekas.
  const settings = page.locator('details.schema-villkor');
  if (await settings.getAttribute('open') === null) await settings.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
  if (await settings.getByRole('button', { name: 'Ta bort sal Provsal 1', exact: true }).count() === 0) {
    await settings.getByLabel('Salens namn', { exact: true }).fill('Provsal 1');
    await settings.getByRole('button', { name: 'Lägg till sal', exact: true }).click();
  }
  await settings.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Samlingsvy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Samlingsvy', exact: true })).toBeVisible();
  return data;
}
async function add(page: Page, name: string) {
  await page.getByRole('button', { name: 'Lägg till resurs', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Sök resurs' });
  await input.fill(name);
  const exactName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const target = page.getByRole('option').filter({ hasText: new RegExp(`^${exactName}\\s*(klass|grupp|lärare|sal|elev)$`, 'u') });
  await expect(target).toHaveCount(1); await expect(target).toBeVisible();
  // Command kan redan ha markerat första träffen; pilar vidare bara tills den exakta resursen är markerad.
  // Prefixsökning efter t.ex Provlärare 1 får inte välja Provlärare 10.
  const count = await page.getByRole('option').count();
  for (let i = 0; i < count && await target.getAttribute('aria-selected') !== 'true'; i++) await input.press('ArrowDown');
  await expect(target).toHaveAttribute('aria-selected', 'true'); await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(page.getByRole('button', { name: `Ta bort ${name} från samlingsvyn`, exact: true })).toBeVisible();
}

test('samlingsvy lägger till klass, lärare och sal med tangentbord och öppnar sparad arbetsvy efter omladdning', async ({ page }) => {
  const data = await setup(page), teacher = f.teachers[0].name;
  const view = page.locator('.samling'), day = view.getByRole('combobox', { name: 'Dag i samlingsvyn', exact: true });
  await expect(day).toBeVisible(); await expect(day).toHaveValue('0');
  const dayHeaders = view.locator('.samling-ram .folj-dagar > div');
  await expect(dayHeaders).toHaveCount(2);
  await expect(dayHeaders.nth(1)).toHaveText(/^Måndag\s*08:00–16:30$/u);
  // Dagvalet nås direkt och avgränsar faktiskt passen, utan att resursmatrisen först behöver öppnas.
  const row = view.locator('.samling-ram').locator(`[data-resource="${data.resources[0].key}"]`);
  const expected = (selected: number | null) => f.lessons.filter(l => data.resources[0].lessons.includes(l.id) && (l.term === null || l.term === 'ht') && l.day !== null && (selected === null || l.day === selected)).map(l => l.id).sort();
  const shownIds = () => row.locator('[data-schema-pass]').evaluateAll(elements => elements.map(el => (el as HTMLElement).dataset.schemaPass!).sort());
  await expect.poll(shownIds).toEqual(expected(0));
  await day.selectOption('1'); await expect.poll(shownIds).toEqual(expected(1));
  await expect(dayHeaders).toHaveCount(2); await expect(dayHeaders.nth(1)).toHaveText(/^Tisdag\s*08:00–16:30$/u);
  await day.selectOption(''); await expect.poll(shownIds).toEqual(expected(null));
  await expect(dayHeaders).toHaveCount(6);
  await day.selectOption('0');
  // Klassens rad är förvald; lärare och sal nås med samma command-sökning.
  await expect(page.getByRole('button', { name: `Ta bort ${f.classes[0].name} från samlingsvyn`, exact: true })).toBeVisible();
  await add(page, teacher);
  if (f.rooms.length) await add(page, f.rooms[0].name);
  await view.getByLabel('Namn på arbetsvyn').fill('Klassens planering');
  await view.getByRole('button', { name: 'Spara som arbetsvy', exact: true }).click();
  await expect(view.getByText('Arbetsvyn Klassens planering är sparad i den här webbläsaren. Elevval följer inte med.')).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await view.getByRole('combobox', { name: 'Arbetsvy', exact: true }).selectOption({ label: 'Klassens planering' });
  await expect(day).toHaveValue('0');
  await expect(view.getByRole('button', { name: `Ta bort ${teacher} från samlingsvyn`, exact: true })).toBeVisible();
  await view.getByLabel('Namn på arbetsvyn').fill('Ny benämning'); await view.getByRole('button', { name: 'Byt namn', exact: true }).click();
  await expect(view.getByRole('combobox', { name: 'Arbetsvy', exact: true }).locator('option', { hasText: 'Ny benämning' })).toHaveCount(1);
  expect(data.resources.length).toBeGreaterThan(2);
  await expect(dayHeaders).toHaveCount(2);
  await expect(dayHeaders.nth(1)).toHaveText(/^Måndag\s*08:00–16:30$/u);
  await page.screenshot({ path: test.info().outputPath('samling-arbetsvy.png'), fullPage: true });
});

test('gemensam ledig tid, lager och resursmatris visas tillsammans utan sidledsrullning', async ({ page }) => {
  await setup(page); await add(page, f.teachers[0].name);
  const view = page.locator('.samling');
  await view.getByLabel(`Markera raden ${f.classes[0].name}`, { exact: true }).check();
  await view.getByLabel(`Markera raden ${f.teachers[0].name}`, { exact: true }).check();
  await view.getByRole('button', { name: 'Visa gemensam ledig tid', exact: true }).click();
  await expect(view.locator('.samling-gemensam')).toBeVisible();
  await view.getByRole('button', { name: 'Lunchtryck', exact: true }).click();
  await expect(view.locator('.samling-lunchtryck')).toBeVisible();
  await view.getByRole('button', { name: 'Resursmatris', exact: true }).click();
  await view.getByRole('combobox', { name: 'Visa dag', exact: true }).selectOption('1');
  const second = f.teachers[1].name;
  await view.getByRole('button', { name: `Lägg till ${second} från resursmatrisen`, exact: true }).click();
  await expect(view.getByRole('button', { name: `Ta bort ${second} från samlingsvyn`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('samling-200.png'), fullPage: true });
});

test('elevresurser saknas utan behörigt lässvar och elevval sparas aldrig i arbetsvyn', async ({ page }) => {
  await setup(page, false); await page.getByRole('button', { name: 'Lägg till resurs', exact: true }).click();
  const input = page.getByRole('combobox', { name: 'Sök resurs' }); await input.fill('Provelev');
  await expect(page.getByText('Inga resurser hittades.')).toBeVisible(); await input.press('Escape');
  await page.reload(); await setup(page, true); await add(page, 'Provelev Samling');
  const view = page.locator('.samling'); await view.getByLabel('Namn på arbetsvyn').fill('Urval utan elev');
  await view.getByRole('button', { name: 'Spara som arbetsvy', exact: true }).click();
  const saved = await page.evaluate(unit => localStorage.getItem(`schema-arbetsvyer:${unit}`), f.unitId);
  expect(saved).not.toContain('elev:'); expect(saved).not.toContain('Provelev');
});

test('filter ändrar visning men ledigsök beskriver ämnesuppdrag och salarnas begränsning', async ({ page }) => {
  await setup(page); const view = page.locator('.samling');
  const title = f.lessons.find(l => l.day === 0 && l.classIds.includes(f.classes[0].id) && (l.term === null || l.term === 'ht'))!.title;
  await view.getByRole('combobox', { name: 'Ämne', exact: true }).selectOption({ label: title });
  const own = view.locator('.samling-ram .folj-pass'); await expect(own.first()).toContainText(title);
  await view.getByText('Sök ledig lärare eller sal', { exact: true }).click();
  await expect(view.getByText('Lärare som undervisar i ämnet i tjänstefördelningen visas först.', { exact: false })).toBeVisible();
  await view.getByRole('button', { name: 'Sök lediga resurser', exact: true }).click();
  await expect(view.locator('.samling-lediga')).toBeVisible();
});

test('samlingsvyn fungerar när åtkomst till localStorage är blockerad och säger att arbetsvyn inte sparades', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Nekad lokal lagring', 'SecurityError'); } }); });
  await setup(page); const view = page.locator('.samling');
  await view.getByLabel('Namn på arbetsvyn').fill('Tillfälligt urval');
  await view.getByRole('button', { name: 'Spara som arbetsvy', exact: true }).click();
  await expect(view.getByText('Arbetsvyn gäller här men kunde inte sparas i webbläsaren.')).toBeVisible();
  await add(page, f.teachers[0].name);
});
