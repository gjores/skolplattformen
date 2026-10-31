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
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByRole('checkbox', { name: /SA26/ }).check();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg till alternativ', exact: true }).click();
  await page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true }).fill('spanska');
  await page.getByRole('option', { name: /Spanska.*MODO1000X/ }).click();
  await page.getByLabel('Alternativets namn', { exact: true }).fill('Spanska');
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
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

async function alternatives(page: Page) {
  await page.getByRole('button', { name: 'Lägg till valbart block', exact: true }).click();
  await page.getByLabel('Blockets namn', { exact: true }).fill('Mitt språkblock');
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByRole('checkbox', { name: /SA26/ }).check();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByRole('button', { name: 'Lägg till alternativ', exact: true }).click();
}
test('sökbart katalogval kommer före namn, fyller språk och bevarar eget namn', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await alternatives(page);
  const search = page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true });
  await search.fill('spanska MODO1000X'); await search.press('ArrowDown'); await search.press('Enter');
  await expect(page.getByLabel('Alternativets namn', { exact: true })).toHaveValue(/Spanska/);
  await expect(page.getByRole('combobox', { name: 'Språk', exact: true })).toHaveValue('es');
  expect(await search.evaluate((node, nameId) => !!(node.compareDocumentPosition(document.getElementById(nameId!)!) & Node.DOCUMENT_POSITION_FOLLOWING), await page.getByLabel('Alternativets namn', { exact: true }).getAttribute('id'))).toBe(true);
  await page.getByLabel('Alternativets namn', { exact: true }).fill('Eget namn');
  await search.fill('franska'); await page.getByRole('option', { name: /Franska.*MODO1000X/ }).click();
  await expect(page.getByLabel('Alternativets namn', { exact: true })).toHaveValue('Eget namn');
  await page.screenshot({ path: `/private/tmp/vb12-alternatives-${test.info().project.name}.png` });
  await page.getByRole('button', { name: 'Visa allt på en sida', exact: true }).click();
  await expect(page.getByLabel('Blockets namn', { exact: true })).toHaveValue('Mitt språkblock');
  await expect(page.getByLabel('Gruppens namn', { exact: true })).toHaveCount(1);
  expect(m.writes).toHaveLength(0);
});
test('ett namn utan katalogval ger rättningsbart fältfel och fokus i synlig sökruta', async ({ page }) => {
  await mock(page); await page.goto(URL); await alternatives(page);
  await page.getByLabel('Alternativets namn', { exact: true }).fill('Spanska 1');
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  const search = page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true });
  await expect(search).toBeFocused(); await expect(search).toHaveAttribute('aria-invalid', 'true');
  const bounds = await search.boundingBox(); expect(bounds!.y).toBeGreaterThanOrEqual(0); expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height);
  await expect(page.getByRole('alert')).toContainText('Ett eget namn räcker inte');
  await search.fill('matematik'); await expect(page.getByRole('option')).toHaveCount(0);
  await search.fill('spanska'); await page.getByRole('option', { name: /Spanska.*MODO1000X/ }).click();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hur ska grupperna organiseras?' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('olika timplanstider kan rättas i gruppens klassurval utan att lämna utkastet', async ({ page }) => {
  const m = await mock(page), original = m.state.sources[0];
  m.state.sources.push({ ...original, classId: '75300400-0000-4000-8000-000000000099', className: 'NA26', sourceKey: original.sourceKey.replace(original.classId, '75300400-0000-4000-8000-000000000099'), frameSourceKey: original.frameSourceKey.replace(original.classId, '75300400-0000-4000-8000-000000000099'), needHt: 3000 });
  await page.goto(URL); await alternatives(page);
  await page.getByRole('button', { name: 'Tillbaka', exact: true }).click(); await page.getByRole('checkbox', { name: /NA26/ }).check();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true }).fill('spanska'); await page.getByRole('option', { name: /Spanska.*MODO1000X/ }).click();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click(); await page.getByRole('button', { name: 'Granska block', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Klasserna har olika undervisningstid');
  const group = page.getByRole('group', { name: 'Gruppens klasser', exact: true }); await expect(group).toBeFocused();
  await group.getByRole('checkbox', { name: /NA26/ }).uncheck();
  await page.getByRole('button', { name: 'Granska block', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Granska valbart block' })).toBeVisible(); expect(m.writes).toHaveLength(0);
});
test('befintligt block öppnas samlat och byte av visning behåller sparad identitet', async ({ page }) => {
  const m = await mock(page); m.state.blocks = [block()]; await page.goto(URL);
  await page.getByRole('button', { name: 'Ändra block', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Visa steg för steg', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Ämne, kurs eller nivå' }).first()).toBeDisabled();
  await page.getByLabel('Blockets namn', { exact: true }).fill('Ändrat namn');
  await page.getByRole('button', { name: 'Visa steg för steg', exact: true }).click();
  await page.getByRole('button', { name: 'Visa allt på en sida', exact: true }).click();
  await expect(page.getByLabel('Blockets namn', { exact: true })).toHaveValue('Ändrat namn');
  await page.getByRole('button', { name: 'Granska block', exact: true }).click();
  await page.getByRole('button', { name: 'Bekräfta och spara block', exact: true }).click();
  expect(m.state.blocks[0].id).toBe(block().id); expect(m.state.blocks[0].options[0].id).toBe(block().options[0].id);
});
test('serverkonflikt visas nära sparandet och omhämtning bevarar inmatning utan överskrivning', async ({ page }) => {
  const m = await mock(page); m.state.blocks = [block()]; await page.goto(URL);
  await page.getByRole('button', { name: 'Ändra block', exact: true }).click(); await page.getByLabel('Blockets namn', { exact: true }).fill('Mina uppgifter');
  await page.route('**/api/valbara-block/kommando', route => route.fulfill({ status: 409, json: { code: 'elective_revision_conflict' }, headers: { 'X-Context-Epoch': '1' } }));
  await page.getByRole('button', { name: 'Granska block', exact: true }).click(); await page.getByRole('button', { name: 'Bekräfta och spara block', exact: true }).click();
  const alert = page.getByRole('alert'); await expect(alert).toBeFocused();
  expect((await alert.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  m.state.blocks[0].revision++; m.state.revision++;
  await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
  await expect(page.getByLabel('Blockets namn', { exact: true })).toHaveValue('Mina uppgifter');
  await expect(page.getByRole('alert')).toContainText('Blocket har ändrats av någon annan');
  await page.getByRole('button', { name: 'Granska block', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bekräfta och spara block', exact: true })).toBeDisabled(); await expect(page.getByRole('alert')).toContainText('Blocket har ändrats av någon annan'); expect(m.writes).toHaveLength(0);
});
test('MFA-hjälp visas vid sparandet i samma synliga formulär', async ({ page }) => {
  await mock(page); await page.goto(URL); await prepare(page);
  await page.route('**/api/valbara-block/kommando', route => route.fulfill({ status: 403, json: { code: 'mfa_required' }, headers: { 'X-Context-Epoch': '1' } }));
  await page.getByRole('button', { name: 'Bekräfta och spara block', exact: true }).click();
  const action = page.locator('.elective-editor-footer').getByRole('button', { name: 'Verifiera med engångskod', exact: true });
  await expect(action).toBeVisible(); await expect(page.getByRole('alert')).toHaveCount(1);
  const rect = await action.boundingBox(); expect(rect!.y).toBeGreaterThanOrEqual(0); expect(rect!.y + rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
});
test('ämnesnamn går att söka och visas tillsammans med nivå och kod', async ({ page }) => {
  const m = await mock(page), source = m.state.sources[0]; source.blockKind = 'individualChoice'; source.label = 'Individuellt val'; source.allowedOptionCodes = ['ENGE1000X'];
  await page.goto(URL); await alternatives(page);
  await page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true }).fill('Engelska');
  await page.getByRole('option', { name: /Engelska.*Nivå 1.*ENGE1000X/ }).click();
  await expect(page.getByLabel('Alternativets namn', { exact: true })).toHaveValue(/Engelska.*Nivå 1/);
});
test('saknad timplanstid kan hämtas på nytt utan att gruppens namn eller identitet försvinner', async ({ page }) => {
  const m = await mock(page); m.state.sources[0].needHt = null;
  await page.goto(URL); await alternatives(page);
  await page.getByRole('combobox', { name: 'Ämne, kurs eller nivå', exact: true }).fill('spanska'); await page.getByRole('option', { name: /Spanska.*MODO1000X/ }).click();
  await page.getByRole('button', { name: 'Nästa', exact: true }).click();
  await page.getByLabel('Gruppens namn', { exact: true }).fill('Mitt gruppnamn'); await page.getByRole('button', { name: 'Granska block', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Undervisningstid saknas');
  await expect(page.getByRole('link', { name: 'Öppna timplanens tidsutrymmen i en ny flik' })).toHaveAttribute('target', '_blank');
  m.state.sources[0].needHt = 2700;
  await page.getByRole('button', { name: 'Hämta aktuellt underlag', exact: true }).click();
  await expect(page.getByLabel('Gruppens namn', { exact: true })).toHaveValue('Mitt gruppnamn');
  await page.getByRole('button', { name: 'Granska block', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Granska valbart block' })).toBeVisible(); expect(m.writes).toHaveLength(0);
});
