// Syntetiska API-/komponentprov. Verklig Worker/OIDC/SQL verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { eid } from './fixtures/elective-data';
import { createBindingCommandRef, type BindingCommand, type BindingReply } from '../lib/elective-self-contract';
const FIXTURE = '/e2e/fixtures/elective-staff-tools.html';
test.beforeEach(async({page})=>{await page.clock.install({time:new Date('2026-10-31T12:00:00.000Z')});});
async function mock(page: Page, mode: 'normal' | 'lost' | 'wrong' | 'denied' | 'conflict' | 'epoch' = 'normal') {
  const writes: BindingCommand[] = [], calls: string[] = []; let result: BindingReply | null = null;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; calls.push(path);
    const input = route.request().postDataJSON();
    if (mode === 'denied') return route.fulfill({ status: 403, json: { code: 'forbidden' } });
    if (path.endsWith('/lasa')) return route.fulfill({ headers: { 'X-Context-Epoch': '7' }, json: { contractVersion: 'elective_binding_v1', unitId: input.unitId, pupilId: input.pupilId, bindings: result ? [result.binding] : [] } });
    if (path.endsWith('/kommando')) {
      if (mode === 'conflict') return route.fulfill({ status: 409, json: { code: 'conflict' } });
      writes.push(input);
      const binding = input.action === 'save_binding' ? { unitId: input.unitId, pupilId: input.pupilId, ...input.payload, revision: input.expectedRevision + 1, revokedAt: null, attestedByAssignmentId: eid(91) } : { ...result!.binding, revision: input.expectedRevision + 1, revokedAt: '2026-10-31T12:00:00.000Z' };
      result = { status: 'done', receipt: { commandId: input.commandId, identityId: eid(90), assignmentId: eid(91), bindingId: input.payload.id, bindingRevision: input.expectedRevision + 1, request: input }, binding };
      if (mode === 'lost') return route.abort();
      return route.fulfill({ headers: { 'X-Context-Epoch': mode === 'epoch' ? '8' : '7' }, json: mode === 'wrong' ? { ...result, receipt: { ...result.receipt, commandId: eid(98) } } : result });
    }
    if (path.endsWith('/status') && result) { expect(input).toEqual(await createBindingCommandRef(writes[0])); return route.fulfill({ json: result }); }
    throw Error(`Unexpected synthetic path: ${path}`);
  });
  return { writes, calls };
}
async function bindingForm(page: Page) {
  await page.getByRole('combobox', { name: 'Elev för kontokoppling', exact: true }).selectOption(eid(20));
  await page.getByRole('button', { name: 'Lägg till kontokoppling', exact: true }).click();
  await page.getByRole('textbox', { name: 'Kontoreferens', exact: true }).fill(eid(50));
  await page.getByRole('combobox', { name: 'Kontotyp', exact: true }).selectOption('guardian');
  await page.getByRole('textbox', { name: 'Underlag för skolans kontroll', exact: true }).fill('Syntetisk skolkontroll 42');
}
async function choosePupil(page: Page) {
  await page.getByRole('button', { name: 'Registrera val åt elev', exact: true }).click();
  await page.getByRole('combobox', { name: 'Valomgång', exact: true }).selectOption(eid(21));
  await page.getByRole('combobox', { name: 'Elev', exact: true }).selectOption(eid(20));
}
test('skolan kontrollerar kontot uttryckligt och VH-inställningen sparas separat', async ({ page },testInfo) => {
  const m = await mock(page); await page.goto(FIXTURE); await bindingForm(page);
  const save = page.getByRole('button', { name: 'Spara kontokoppling', exact: true }); await expect(save).toBeDisabled();
  await page.getByRole('checkbox', { name: /^Den här vårdnadshavaren/ }).check();
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await save.click();
  await expect(page.getByText('Kontokopplingen är sparad.', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.writes[0].payload).toMatchObject({ identityId: eid(50), participant: 'guardian', confirmationRequired: true, sourceReference: 'Syntetisk skolkontroll 42', startsOn: '2026-07-01', endsOn: '2027-06-30' });
  expect(m.calls.every(path => path.startsWith('/api/valbara-block/bindningar/'))).toBe(true);
  await page.screenshot({path:testInfo.outputPath('bindings.png'),fullPage:true});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('tappat kopplingssvar återhämtas med minimal referens efter reload utan ny skrivning', async ({ page }) => {
  const m = await mock(page, 'lost'); await page.goto(FIXTURE); await bindingForm(page);
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await page.getByRole('button', { name: 'Spara kontokoppling', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeEnabled();
  const journal = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('elective-binding-status:')).map(([, value]) => JSON.parse(value)));
  expect(journal).toHaveLength(1); expect(Object.keys(journal[0]).sort()).toEqual(['action', 'commandId', 'payloadHash', 'pupilId', 'unitId']);
  expect(JSON.stringify(journal)).not.toContain(eid(50)); expect(JSON.stringify(journal)).not.toContain('skolkontroll');
  await expect(page.getByRole('button', { name: 'Gå vidare i provet' })).toBeDisabled();
  page.once('dialog', dialog => dialog.accept()); await page.reload();
  await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click();
  await expect(page.getByText('Kontokopplingen är sparad.', { exact: true })).toBeVisible(); expect(m.writes).toHaveLength(1);
});
test('felaktigt kvitto ger inget sparbesked och nekat mandat rensar vyn', async ({ page }) => {
  const m = await mock(page, 'wrong'); await page.goto(FIXTURE); await bindingForm(page);
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await page.getByRole('button', { name: 'Spara kontokoppling', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true })).toBeEnabled();
  await expect(page.getByText('Kontokopplingen är sparad.', { exact: true })).toHaveCount(0); expect(m.writes).toHaveLength(1);
  await page.unroute('**/api/**'); await mock(page, 'denied');
  await page.getByRole('button', { name: 'Kontrollera sparstatus', exact: true }).click();
  await expect(page.getByText('Sessionen är låst', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Kontoreferens', exact: true })).toHaveCount(0);
});
test('registrering kräver elevurval och ersätter aktuellt val utan automatisk bekräftelse', async ({ page },testInfo) => {
  await mock(page); await page.goto(`${FIXTURE}?existing`);
  await page.getByRole('button', { name: 'Registrera val åt elev', exact: true }).click();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Valomgång', exact: true }).selectOption(eid(21));
  await expect(page.getByRole('radio')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Elev', exact: true }).selectOption(eid(20));
  await page.getByRole('radio', { name: /^Franska/ }).check();
  await page.getByRole('button', { name: 'Registrera elevens val', exact: true }).click();
  await page.screenshot({path:testInfo.outputPath('staff-choice.png'),fullPage:true});
  const writes = JSON.parse(await page.getByRole('status', { name: 'Syntetiska valkommandon' }).textContent() ?? '[]');
  expect(writes).toHaveLength(1); expect(writes[0]).toEqual({ action: 'record_choice', payload: { roundId: eid(21), pupilId: eid(20), offeringRevision: 1, expectedChoiceRevision: 1, selectedOptionIds: [eid(12)] } });
  await expect(page.getByText(/Valet är registrerat\./)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('ändrat elevval och passerad sista valdag stoppar gammal registrering', async ({ page }) => {
  await mock(page); await page.goto(FIXTURE); await choosePupil(page); await page.getByRole('radio', { name: /^Franska/ }).check();
  await page.getByRole('button', { name: 'Simulera ändrat elevval' }).click();
  await expect(page.getByRole('button', { name: 'Registrera elevens val', exact: true })).toBeDisabled();
  await expect(page.getByText(/Underlaget eller elevens val har ändrats/)).toBeVisible();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Hämta aktuellt val', exact: true }).click();
  await page.getByRole('radio', { name: /^Franska/ }).check(); await page.getByRole('button', { name: 'Simulera sista valdag' }).click();
  await page.clock.runFor(1100); await expect(page.getByRole('button', { name: 'Registrera elevens val', exact: true })).toBeDisabled();
  await expect(page.getByRole('status', { name: 'Syntetiska valkommandon' })).toHaveText('[]');
});
test('osparat val skyddas vid navigering och stängd omgång går inte att registrera i', async ({ page }) => {
  await mock(page); await page.goto(FIXTURE); await choosePupil(page); await page.getByRole('radio', { name: /^Franska/ }).check();
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Gå vidare i provet' }).click();
  await expect(page.getByRole('radio', { name: /^Franska/ })).toBeChecked();
  page.once('dialog', dialog => dialog.accept()); await page.goto(`${FIXTURE}?closed`); await choosePupil(page);
  await expect(page.getByRole('radio', { name: /^Franska/ })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Registrera elevens val', exact: true })).toBeDisabled();
});
test('kontokoppling kräver ny granskning efter konflikt och osparad skolkontroll skyddas', async ({ page }) => {
  const m = await mock(page, 'conflict'); await page.goto(FIXTURE); await bindingForm(page);
  page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Gå vidare i provet' }).click();
  await expect(page.getByRole('textbox', { name: 'Kontoreferens', exact: true })).toHaveValue(eid(50));
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await page.getByRole('button', { name: 'Spara kontokoppling', exact: true }).click();
  await expect(page.getByText(/Kopplingen eller behörigheten har ändrats/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spara kontokoppling', exact: true })).toBeDisabled(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Avbryt redigering och läs om', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Kontoreferens', exact: true })).toHaveCount(0);
});
test('bytt kontextepoch under sparande låser vyn utan ett gammalt grönt kvitto', async ({ page }) => {
  await mock(page, 'epoch'); await page.goto(FIXTURE); await bindingForm(page);
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await page.getByRole('button', { name: 'Spara kontokoppling', exact: true }).click();
  await expect(page.getByText('Sessionen är låst', { exact: true })).toBeVisible(); await expect(page.getByText('Kontokopplingen är sparad.', { exact: true })).toHaveCount(0);
});
test('avslut av en verifierad koppling kräver egen bekräftelse och rätt revision', async ({ page }) => {
  const m = await mock(page); await page.goto(FIXTURE); await bindingForm(page);
  await page.getByRole('checkbox', { name: /^Skolan har kontrollerat/ }).check(); await page.getByRole('button', { name: 'Spara kontokoppling', exact: true }).click();
  await page.getByRole('button', { name: 'Avsluta koppling', exact: true }).click(); expect(m.writes).toHaveLength(1);
  await page.getByRole('button', { name: 'Bekräfta avslut', exact: true }).click();
  await expect(page.getByText(/2026-07-01.*Avslutad/)).toBeVisible(); expect(m.writes).toHaveLength(2);
  expect(m.writes[1]).toMatchObject({ action: 'revoke_binding', expectedRevision: 1, payload: { id: m.writes[0].payload.id } });
});
