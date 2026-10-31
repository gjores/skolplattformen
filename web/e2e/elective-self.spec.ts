// Syntetiska API-svar, utan verklig inloggning. SQL-/Worker-/OIDC-proven är separat verifiering.
import { test, expect, type Page } from '@playwright/test';
import { createSelfCommandRef, parseSelfCommand, type SelfReceipt } from '../lib/elective-self-contract';
import { eid, choice, selfIndex, selfRead } from './fixtures/elective-data';
const URL = '/e2e/fixtures/elective-self-preview.html';
async function mock(page: Page, guardian = false, lost = false) {
  const data = selfRead(guardian), index = selfIndex(guardian), writes: unknown[] = [], receipts = new Map<string, SelfReceipt>(); let lose = lost;
  await page.route('**/api/valbara-block/egen/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname, headers = { 'X-Context-Epoch': '7' };
    if (path.endsWith('/urval')) return route.fulfill({ json: index, headers });
    if (path.endsWith('/lasa')) return route.fulfill({ json: data, headers });
    const input = route.request().postDataJSON();
    if (path.endsWith('/status')) return route.fulfill({ json: { unitId: data.participant.unitId, pupilId: data.participant.pupilId, participant: data.participant.participant, commandId: input.commandId,
      status: receipts.has(input.commandId) ? 'found' : 'not_found', receipt: receipts.has(input.commandId) ? { ...receipts.get(input.commandId), replayed: true } : null }, headers });
    const command = parseSelfCommand(input), ref = await createSelfCommandRef(command); writes.push(command);
    if (command.action === 'submit_choice') data.choices = [{ ...choice(), revision: (data.choices[0]?.revision ?? 0) + 1, selectedOptionIds: command.payload.selectedOptionIds, state: data.offers[0].round.guardianConfirmation ? 'awaiting_guardian' : 'ready_for_confirmation' }];
    else { data.confirmations = [{ id: eid(40), bindingId: data.participant.bindingId, bindingRevision: 1, choiceId: command.payload.choiceId, choiceRevision: command.payload.expectedChoiceRevision, offeringRevision: command.payload.offeringRevision, decision: command.payload.decision, decidedAt: new Date().toISOString() }]; data.choices[0].state = command.payload.decision === 'approve' ? 'ready_for_confirmation' : 'guardian_declined'; }
    const receipt: SelfReceipt = { ...ref, identityId: eid(41), bindingId: data.participant.bindingId, bindingRevision: 1, choiceId: data.choices[0].id, choiceRevision: data.choices[0].revision, replayed: false };
    receipts.set(command.commandId, receipt);
    if (lose) { lose = false; return route.abort('failed'); }
    return route.fulfill({ json: receipt, headers });
  });
  return { data, index, writes };
}
test('sent indexsvar återvisar inte namn efter sessionslås', async ({ page }) => {
  const m = await mock(page);
  let release!: () => void, entered!: () => void, handled!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), requested = new Promise<void>(resolve => { entered = resolve; }), completed = new Promise<void>(resolve => { handled = resolve; });
  await page.route('**/api/valbara-block/egen/urval', async route => { entered(); await held; await route.fulfill({ json: m.index, headers: { 'X-Context-Epoch': '7' } }).catch(() => {}); handled(); });
  await page.goto(URL); await requested;
  await page.evaluate(() => { const channel = new BroadcastChannel('skolplattform-session'); channel.postMessage({ type: 'logged-out' }); channel.close(); });
  await expect(page.getByText('Inloggningen har ändrats. Hämta dina val igen.', { exact: true })).toBeVisible();
  release(); await completed;
  await page.waitForTimeout(200);
  await expect(page.getByRole('button', { name: 'Logga ut', exact: true })).toHaveCount(0);
  await expect(page.getByText('Prov Elev', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Inloggningen har ändrats. Hämta dina val igen.', { exact: true })).toBeVisible();
});
test('ny erforderlig VH kan svara även när gammal skolbekräftelsetid finns kvar', async ({ page }) => {
  const m = await mock(page, true); m.data.choices[0].confirmedAt = '2026-10-01T12:00:00.000Z'; m.data.choices[0].state = 'awaiting_guardian';
  await page.goto(URL); await expect(page.getByRole('button', { name: 'Bekräfta valet', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Bekräfta valet', exact: true }).click();
  await expect(page.getByText('Du har bekräftat detta val.', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(1);
});
test('efter avslag kan samma alternativ lämnas på nytt som ny valversion', async ({ page }) => {
  const m = await mock(page); m.data.choices = [{ ...choice(), state: 'guardian_declined' }];
  await page.goto(URL); await expect(page.getByRole('button', { name: 'Lämna valet på nytt', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Lämna valet på nytt', exact: true }).click();
  await expect(page.getByText('Ditt val är inlämnat.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.data.choices[0].selectedOptionIds).toEqual([eid(11)]);
});
test('eleven lämnar själv ett uttryckligt val och ser väntande VH-bekräftelse', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await expect(page.getByRole('button', { name: 'Lämna mitt val', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: /^Franska/ }).check();
  await page.getByRole('button', { name: 'Lämna mitt val', exact: true }).click();
  await expect(page.getByText('Ditt val är inlämnat.', { exact: true })).toBeVisible();
  await expect(page.getByText('Väntar på vårdnadshavarens bekräftelse.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.data.choices[0].selectedOptionIds).toEqual([eid(12)]);
  await expect(page.getByRole('button', { name: 'Lämna ändrat val', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('avstängd skolpolicy går direkt till skolans bekräftelse', async ({ page }) => {
  const m = await mock(page); m.data.policy.guardianConfirmation = false; m.data.offers[0].round.guardianConfirmation = false;
  await page.goto(URL); await page.getByRole('radio', { name: /^Spanska/ }).check(); await page.getByRole('button', { name: 'Lämna mitt val', exact: true }).click();
  await expect(page.getByText('Valet är inlämnat och väntar på skolans bekräftelse.', { exact: true })).toBeVisible();
  expect(m.data.confirmations).toHaveLength(0);
});
test('VH kan bekräfta insänt val efter elevdeadline och lämnar ett riktigt beslut', async ({ page }) => {
  const m = await mock(page, true); m.data.offers[0].round.closesAt = new Date(Date.now() - 86400000).toISOString();
  await page.goto(URL); await expect(page.getByRole('heading', { name: 'Elevens val', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bekräfta valet', exact: true }).click();
  await expect(page.getByText('Du har bekräftat detta val.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avböj', exact: true })).toBeDisabled();
  expect(m.writes).toHaveLength(1); expect(m.data.confirmations[0].bindingId).toBe(eid(32));
});
test('tappat elevvalssvar återhämtas efter reload utan ny inlämning eller valdata i journalen', async ({ page }) => {
  const m = await mock(page, false, true); await page.goto(URL);
  await page.getByRole('radio', { name: /^Spanska/ }).check(); await page.getByRole('button', { name: 'Lämna mitt val', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeVisible();
  const journal = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('elective-self-status:')).map(([, value]) => value).join(''));
  expect(journal).not.toContain('selectedOptionIds'); expect(journal).not.toContain('Prov Elev');
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click();
  await expect(page.getByText('Sparandet är bekräftat.', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(1);
});
test('två barn kräver uttryckligt urval och stängd valomgång tillåter inte VH-beslut', async ({ page }) => {
  const m = await mock(page, true); m.index.participants.push({ ...m.index.participants[0], pupilId: eid(61), pupilName: 'Ytterligare Prov', bindingId: eid(62) });
  m.data.offers[0].round.status = 'closed'; await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Elevens val', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Välj elev och skola', exact: true }).selectOption(eid(32));
  await expect(page.getByRole('button', { name: 'Bekräfta valet', exact: true })).toBeDisabled();
  expect(m.writes).toHaveLength(0);
});
