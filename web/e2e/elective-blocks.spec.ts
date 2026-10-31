// Syntetiska API-svar prövar riktiga React-komponenter; verklig SQL/Worker/OIDC verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { createElectiveCommandRef, parseElectiveCommand, type ElectiveReceipt } from '../lib/elective-block-contract';
import { block, schoolRead } from './fixtures/elective-data';
const URL = '/e2e/fixtures/elective-block-preview.html';
async function mock(page: Page, lost = false) {
  const state = schoolRead(), writes: unknown[] = [], receipts = new Map<string, ElectiveReceipt>(); let lose = lost;
  await page.route('**/api/valbara-block/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: state, headers: { 'X-Context-Epoch': '1' } });
    const input = route.request().postDataJSON();
    if (path.endsWith('/status')) return route.fulfill({ json: { unitId: state.unitId, schoolYear: state.schoolYear, commandId: input.commandId, status: receipts.has(input.commandId) ? 'found' : 'not_found', receipt: receipts.has(input.commandId) ? { ...receipts.get(input.commandId), replayed: true } : null }, headers: { 'X-Context-Epoch': '1' } });
    const command = parseElectiveCommand(input), ref = await createElectiveCommandRef(command); writes.push(command); state.revision++;
    if (command.action === 'save_block') state.blocks = [{ ...command.payload.block, revision: 1, offeringRevision: 1, appliedRevision: null, applied: false, groups: command.payload.block.groups.map(group => ({ ...group, memberCount: 0, membershipRevision: 1 })) }];
    if (command.action === 'set_policy') state.policy = { ...state.policy, revision: state.policy.revision + 1, guardianConfirmation: command.payload.guardianConfirmation };
    if (command.action === 'apply_groups') state.blocks[0].applied = true;
    const receipt: ElectiveReceipt = { ...ref, revision: state.revision, objectId: command.action === 'save_block' ? command.payload.block.id : null, objectRevision: 1, replayed: false };
    receipts.set(command.commandId, receipt);
    if (lose) { lose = false; return route.abort('failed'); }
    return route.fulfill({ json: receipt, headers: { 'X-Context-Epoch': '1' } });
  });
  return { state, writes };
}
async function prepare(page: Page) {
  await page.getByRole('button', { name: 'Lägg till valbart block', exact: true }).click();
  await page.getByLabel('Blockets namn', { exact: true }).fill('Språk SA26');
  await page.getByRole('checkbox', { name: /SA26/ }).check();
  await page.getByRole('button', { name: 'Lägg till alternativ', exact: true }).click();
  await page.getByLabel('Alternativets namn', { exact: true }).fill('Spanska');
  await page.getByRole('combobox', { name: 'Ämne och nivå', exact: true }).selectOption('MODO1000X');
  await page.getByRole('combobox', { name: 'Språk', exact: true }).selectOption('es');
  await page.getByRole('button', { name: 'Lägg till grupp för alternativet', exact: true }).click();
  await page.getByRole('button', { name: 'Granska block', exact: true }).click();
}
test('block ärver timplanstid och ger stabila grupper utan fri tidinmatning', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await prepare(page);
  await expect(page.getByRole('heading', { name: 'Granska valbart block' })).toBeVisible();
  await expect(page.getByLabel(/undervisningstid/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Bekräfta och spara block', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Språk SA26', exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Använd i tjänstefördelningen', exact: true }).click();
  await expect(page.getByText('Grupprader finns i tjänsteunderlaget', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('tappat sparsvaret återhämtas efter reload utan ett nytt skrivkommando', async ({ page }) => {
  const m = await mock(page, true); await page.goto(URL); await prepare(page);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Bekräfta och spara block', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeVisible();
  const journal = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('elective-status:')).map(([, value]) => value).join(''));
  expect(journal).not.toContain('sourceRefs'); expect(journal).not.toContain('Språk SA26');
  await page.reload(); await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click();
  await expect(page.getByText('Sparandet är bekräftat.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1);
});
test('skolan väljer VH-policy uttryckligt och saknad elevåtkomst visas som begränsning', async ({ page }) => {
  const m = await mock(page); m.state.blocks = [block()]; m.state.canReadPupils = false; m.state.pupils = m.state.choices = m.state.placements = null;
  m.state.blocks[0].groups.forEach(group => { group.memberCount = null; });
  await page.goto(URL); await page.locator('summary').filter({ hasText: 'Skolinställning för VH-bekräftelse' }).click();
  await page.getByRole('button', { name: 'Av', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Av', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('summary').filter({ hasText: 'Öppna elevval' }).click();
  await expect(page.getByText('Ditt uppdrag saknar åtkomst till elevurvalet.', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Elevantal kan inte visas/)).toHaveCount(2);
});
