// Riktig flyttpanel och salsök, syntetiskt underlag och uttryckligt simulerad skyddad POST. Verklig motor provas separat i Node-serien.
import { test, expect, type Page } from './schema-test';
import { SCHEMA_CONTRACT_VERSION } from '../lib/schema-contract.ts';
import { schemaSalInputFingerprint, type SchemaSalRequest, type SchemaSalSvar } from '../lib/schema-salar.ts';
const URL = '/e2e/fixtures/schema-salar-preview.html';
function reply(body: SchemaSalRequest): SchemaSalSvar {
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint, fingerprint: 'a'.repeat(28), inputFingerprint: schemaSalInputFingerprint(body), lesson: body.lesson,
    target: body.target, datedTarget: body.datedTarget, durationMin: 70, marginBeforeMin: 10, marginAfterMin: 15, timedOut: false, checkedRooms: 2,
    explanation: 'Hela schemat är prövat vid vald tid. Flytta hit kontrollerar flytten igen.', rooms: [
      { id: 'sal-1', name: 'A101', status: 'upptagen', reasons: [{ code: 'room_clash', message: 'A101 är upptagen av Personalmöte inklusive marginal.', lessons: ['pass-1'] }], total: 1 },
      { id: 'sal-2', name: 'A102', status: 'ledig', reasons: [], total: 0 },
      { id: 'sal-3', name: 'Laboratorium', status: 'otillaten', reasons: [{ code: 'room_unwanted', message: 'Salen ingår inte bland passets tillåtna salar.', lessons: ['pass-1'] }], total: 1 }] };
}
async function setup(page: Page) {
  const requests: SchemaSalRequest[] = [];
  await page.route('**/api/schema/salar', route => { const input = route.request().postDataJSON() as SchemaSalRequest; requests.push(input);
    return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: reply(input) }); });
  await page.goto(URL); return requests;
}
test('sök gäller exakt mål och visar orsaker; salval lämnar passet kvar tills Flytta hit väljs', async ({ page }, info) => {
  const requests = await setup(page); await page.getByRole('button', { name: 'Sök ledig sal', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Salar vid vald tid' }); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('1 ledig och tillåten sal'); await expect(dialog).toContainText('Pass 10:00–11:10'); await expect(dialog).toContainText('Marginal före 10 min och efter 15 min');
  await expect(dialog).toContainText('A101 är upptagen av Personalmöte inklusive marginal.'); await expect(dialog).toContainText('Inte tillåten för passet');
  await expect(dialog.getByRole('button', { name: 'Välj A101', exact: true })).toHaveCount(0); await expect(page.locator('[data-moves]')).toHaveText('0');
  await page.screenshot({ path: info.outputPath('salar-vid-vald-tid.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Välj A102', exact: true }).click(); await expect(dialog).toBeHidden();
  await expect(page.getByRole('combobox', { name: /^Sal/u })).toHaveValue('sal-2'); await expect(page.getByText('A102 är vald.', { exact: false })).toBeVisible();
  await expect(page.locator('[data-moves]')).toHaveText('0'); expect(requests[0].target).toEqual({ day: 0, startMin: 600 }); expect(requests[0].placements[0].startMin).toBe(540);
  await page.getByRole('button', { name: 'Flytta hit', exact: true }).click(); await expect(page.locator('[data-moves]')).toHaveText('1');
});
test('inaktuellt svar kan inte väljas och en ny sökning binder den ändrade tiden', async ({ page }) => {
  const requests = await setup(page); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/schema/salar', async route => { const body = route.request().postDataJSON() as SchemaSalRequest; requests.push(body); await gate;
    await route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: reply(body) }).catch(() => {}); });
  await page.getByRole('button', { name: 'Sök ledig sal', exact: true }).click(); await expect(page.getByText('Kontrollerar salar…', { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('schema-sal-test-target', { detail: 620 }))); release();
  const dialog = page.getByRole('dialog', { name: 'Salar vid vald tid' }); await expect(dialog).toContainText('schemat har ändrats'); await expect(dialog.getByRole('button', { name: 'Välj A102', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Sök igen', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Välj A102', exact: true })).toBeEnabled();
  expect(requests.at(-1)?.target.startMin).toBe(620); await expect(page.locator('[data-moves]')).toHaveText('0');
});
test('läsfel visar en konkret ny handling och beskriver aldrig en sal som fri', async ({ page }) => {
  await setup(page); await page.route('**/api/schema/salar', route => route.fulfill({ status: 503, headers: { 'X-Context-Epoch': '1' }, json: { code: 'schema_engine_unavailable', details: { reason: 'schema_engine_unconfigured' } } }));
  await page.getByRole('button', { name: 'Sök ledig sal', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Salar vid vald tid' });
  await expect(dialog.getByRole('alert')).toContainText('Försök igen'); await expect(dialog.getByRole('button', { name: /^Välj /u })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Sök igen', exact: true })).toBeEnabled(); await dialog.getByRole('button', { name: 'Stäng salsökningen', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sök ledig sal', exact: true })).toBeFocused(); await expect(page.locator('[data-moves]')).toHaveText('0');
});
test('alla salar och handlingar ryms vid 200 procent text och tangentbordet kan stänga dialogen', async ({ page }, info) => {
  await setup(page); await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
  await page.getByRole('button', { name: 'Sök ledig sal', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Salar vid vald tid' });
  await expect(dialog.getByRole('button', { name: 'Välj A102', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Stäng salsökningen', exact: true }).scrollIntoViewIfNeeded();
  const box = await dialog.boundingBox(); expect(box).toBeTruthy(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('salar-stor-text.png'), fullPage: false }); await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Sök ledig sal', exact: true })).toBeFocused();
});
test('låst pass kan inte börja söka eller genomföra en flytt', async ({ page }) => {
  const requests: unknown[] = []; await page.route('**/api/schema/salar', route => { requests.push(route.request().postDataJSON()); return route.abort(); });
  await page.goto(`${URL}?locked=1`); await expect(page.getByRole('button', { name: 'Sök ledig sal', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Flytta hit', exact: true })).toBeDisabled(); await expect(page.getByText('Passet är låst.', { exact: false })).toBeVisible(); expect(requests).toEqual([]);
});
