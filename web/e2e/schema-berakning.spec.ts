// SM-UXF-54: beräkningsläget medan schemamotorn räknar. Syntetiska uppgifter och uttryckligt simulerade rutter.
// Motorns svar hålls kvar tills provet släpper det; motorns verkliga räknetid och transport prövas inte här.
import { test, expect, type Page } from './schema-test';
import proposal from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION } from '../lib/schema-contract.ts';

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const lage = (page: Page) => page.getByRole('dialog', { name: 'Tar fram schemaförslag', exact: true });
const steg = (page: Page, namn: string) => lage(page).getByRole('listitem').filter({ hasText: namn });
const avbrutet = 'Beräkningen avbröts. Utkastet är oförändrat.';

async function setup(page: Page, diagnosMs = 0) {
  // `hall` håller kvar varje nytt motorsvar tills provet anropar slapp().
  const state = { diagnoses: 0, solves: 0, hall: true };
  const vantande: (() => void)[] = [];
  await page.route('**/api/schema/diagnos', async route => {
    state.diagnoses++;
    if (diagnosMs) await new Promise(resolve => setTimeout(resolve, diagnosMs));
    return route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }).catch(() => {});
  });
  await page.route('**/api/schema/forslag', async route => {
    state.solves++;
    const body = route.request().postDataJSON();
    if (state.hall) await new Promise<void>(resolve => vantande.push(resolve));
    // Ett avbrutet anrop kan inte längre besvaras; det sena svaret ska ändå inte nå arbetsytan.
    return route.fulfill({ headers, json: { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION, villkor: body.villkor } }).catch(() => {});
  });
  await page.goto(URL);
  return { state, slapp: () => { for (const resolve of vantande.splice(0)) resolve(); } };
}
async function taFram(page: Page) {
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(lage(page)).toBeVisible();
}

test('nytt förslag visar räknetid och steg tills motorn svarar och lämnar sedan fokus på Beräkning', async ({ page }, info) => {
  test.slow();
  const { state, slapp } = await setup(page);
  await page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true }).selectOption('10000');
  await taFram(page);
  await expect(lage(page).getByRole('heading', { name: 'Tar fram schemaförslag', exact: true })).toBeFocused();
  await expect.poll(() => state.solves).toBe(1);
  const tid = lage(page).getByRole('progressbar', { name: 'Räknetid', exact: true });
  await expect(tid).toHaveAttribute('aria-valuemax', '10');
  await expect(steg(page, 'Kontroll av underlaget')).toContainText('Klart');
  await expect(steg(page, 'Placering av passen')).toContainText('Pågår');
  await expect(steg(page, 'Kontroll av resultatet')).toContainText('Väntar');
  await expect(tid).toHaveAttribute('aria-valuetext', /^[1-9] av 10 sekunder$/u);
  await expect(lage(page).locator('.schema-berakning-pass').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('berakning-pagar.png') });
  // Motorn använder hela räknetiden; därefter väntar läget på kontrollen av resultatet.
  await expect(steg(page, 'Kontroll av resultatet')).toContainText('Pågår', { timeout: 15_000 });
  await expect(steg(page, 'Placering av passen')).toContainText('Klart');
  await expect(tid).toHaveAttribute('aria-valuetext', '10 av 10 sekunder');
  await expect(lage(page)).toContainText('Räknetiden är slut. Resultatet kontrolleras innan det visas.');
  await page.screenshot({ path: info.outputPath('berakning-kontroll.png') });
  slapp();
  await expect(lage(page)).toBeHidden();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beräkning', exact: true })).toBeFocused();
});

test('Avbryt beräkningen lämnar utkastet orört och ett sent motorsvar ignoreras', async ({ page }) => {
  const { state, slapp } = await setup(page);
  await taFram(page); await expect.poll(() => state.solves).toBe(1);
  await lage(page).getByRole('button', { name: 'Avbryt beräkningen', exact: true }).click();
  await expect(lage(page)).toBeHidden();
  await expect(page.getByText(avbrutet, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true })).toBeFocused();
  slapp(); await page.waitForTimeout(500);
  await expect(page.getByText(/^Inget förslag ännu\./u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beräkning', exact: true })).toHaveCount(0);
});

test('avbrott i Lägg schema behåller förra förslaget och återför fokus till Ta fram schemaförslag', async ({ page }) => {
  const { state, slapp } = await setup(page);
  state.hall = false;
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beräkning', exact: true })).toBeFocused();
  state.hall = true;
  await page.getByRole('button', { name: 'Beräkning', exact: true }).click();
  await taFram(page); await expect.poll(() => state.solves).toBe(2);
  await lage(page).getByRole('button', { name: 'Avbryt beräkningen', exact: true }).click();
  await expect(lage(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true })).toBeFocused();
  await expect(page.getByText(avbrutet, { exact: true })).toBeVisible();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible();
  slapp();
});

test('Esc avbryter som knappen medan ett klick utanför läget inte gör det', async ({ page }) => {
  const { state } = await setup(page);
  await taFram(page); await expect.poll(() => state.solves).toBe(1);
  await page.mouse.click(8, 8);
  await expect(lage(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(lage(page)).toBeHidden();
  await expect(page.getByText(avbrutet, { exact: true })).toBeVisible();
});

test('kontrollen av underlaget visas i läget innan räknetiden börjar', async ({ page }) => {
  const { state, slapp } = await setup(page, 1_500);
  await taFram(page);
  await expect(steg(page, 'Kontroll av underlaget')).toContainText('Pågår');
  await expect(steg(page, 'Placering av passen')).toContainText('Väntar');
  await expect(lage(page).getByRole('progressbar', { name: 'Räknetid', exact: true })).toHaveAttribute('aria-valuetext', '0 av 30 sekunder');
  await expect(lage(page)).toContainText('Underlaget kontrolleras. Räknetiden börjar sedan.');
  await expect.poll(() => state.solves).toBe(1);
  await expect(steg(page, 'Placering av passen')).toContainText('Pågår');
  slapp(); await expect(lage(page)).toBeHidden();
});

test('Kontrollera underlaget lägger inget schema och öppnar inget beräkningsläge', async ({ page }) => {
  const { state } = await setup(page, 1_000);
  await page.getByRole('button', { name: 'Kontrollera underlaget', exact: true }).click();
  await expect(page.getByText('Kontrollerar underlaget före beräkning…', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => state.diagnoses).toBe(1);
  await expect(page.getByRole('button', { name: 'Kontrollera underlaget', exact: true })).toBeEnabled();
  expect(state.solves).toBe(0);
});

test.describe('med rörelse', () => {
  test.use({ reducedMotion: 'no-preference' });
  test('sökmarkören hoppar mellan lediga tider och veckan fylls under räknetiden', async ({ page }, info) => {
    const { state, slapp } = await setup(page);
    await page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true }).selectOption('10000');
    await taFram(page); await expect.poll(() => state.solves).toBe(1);
    const markor = lage(page).locator('.schema-berakning-provar');
    await expect(markor).toBeVisible();
    const fore = await markor.getAttribute('style');
    await expect.poll(() => markor.getAttribute('style')).not.toBe(fore);
    await expect.poll(() => lage(page).locator('.schema-berakning-pass').count()).toBeGreaterThan(8);
    await page.screenshot({ path: info.outputPath('berakning-rorelse.png') });
    slapp(); await expect(lage(page)).toBeHidden();
  });
});

test('beräkningsläget ryms vid 200 procent text utan sidledsrullning', async ({ page }, info) => {
  const { state, slapp } = await setup(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await taFram(page); await expect.poll(() => state.solves).toBe(1);
  const knapp = lage(page).getByRole('button', { name: 'Avbryt beräkningen', exact: true });
  await knapp.scrollIntoViewIfNeeded(); await expect(knapp).toBeInViewport();
  expect(await lage(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('berakning-200.png') });
  slapp(); await expect(lage(page)).toBeHidden();
});
