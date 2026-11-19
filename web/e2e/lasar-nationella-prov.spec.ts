import { expect, test, type Page } from '@playwright/test';
import { mockSchemaDrafts } from './schema-test';
import { NATIONELLA_PROV_VERSION, type NationellaProvDocument, type NationellaProvRegister, type NationellaProvUnderlag } from '../lib/nationella-prov';

const calendar = '/e2e/fixtures/lasar-preview.html';
const uid = (value: number) => `52110000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const engelska1 = { amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' };
const engelska2 = { amne: 'ENGE', niva: 'ENGE2000X', namn: 'Engelska nivå 2' };
const eng = (ref: string, nivaer = [engelska1]) => ({ ref: `undervisning:${ref}`, title: nivaer.map(l => l.namn).join(' / '), nivaer, terminer: { ht: true, vt: true } });
const underlag: NationellaProvUnderlag = {
  gallerGymnasiet: true,
  deltagare: [
    { slag: 'klass', ref: uid(1), name: 'NA26', undervisningar: [eng('na26')] },
    { slag: 'klass', ref: uid(2), name: 'SA26', undervisningar: [eng('sa26', [engelska1, engelska2])] },
    { slag: 'klass', ref: uid(3), name: 'EK26', undervisningar: [eng('ek26', [engelska2])] },
    { slag: 'grupp', ref: uid(4), name: 'Engelskagrupp 1', undervisningar: [eng('grupp1')], klassRefs: [] },
  ],
  skoldagar: ['2026-11-24', '2027-01-26', '2027-11-23'],
  salar: [{ id: 'sal-1', name: 'Aulan' }],
  vakter: [{ ref: uid(5), name: 'Provvakt A' }],
};
type Save = { expectedRevision: number; commandId: string; document: NationellaProvDocument };

async function mockProvplan(page: Page, source = underlag) {
  let register: NationellaProvRegister | null = null;
  const state = { saves: [] as Save[], reads: 0, conflict: false };
  const headers = { 'X-Context-Epoch': '1' };
  await page.route('**/api/lasar/nationella-prov/lasa', route => {
    state.reads++;
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...body, contractVersion: NATIONELLA_PROV_VERSION, register, underlag: source } });
  });
  await page.route('**/api/lasar/nationella-prov/spara', route => {
    const { unitId, schoolYear, expectedRevision, commandId, document } = route.request().postDataJSON();
    state.saves.push({ commandId, expectedRevision, document });
    if (state.conflict) {
      state.conflict = false;
      register = { revision: 1, document: { granskad: true, bokningar: [] }, savedAt: '2026-11-18T11:00:00Z' };
      return route.fulfill({ status: 409, headers, json: { code: 'conflict', details: { reason: 'nationella_prov_conflict' } } });
    }
    expect(expectedRevision).toBe(register?.revision ?? 0);
    register = { revision: expectedRevision + 1, document, savedAt: '2026-11-19T11:00:00Z' };
    return route.fulfill({ headers, json: { contractVersion: NATIONELLA_PROV_VERSION, unitId, schoolYear, register, replayed: false } });
  });
  return state;
}
const panel = (page: Page) => page.getByRole('region', { name: 'Nationella prov', exact: true });
const fillBooking = async (page: Page) => {
  const form = panel(page);
  await form.getByLabel('Slut', { exact: true }).fill('10:30');
  await form.getByLabel('Underlag kontrollerat').fill('2026-11-18');
  await form.getByLabel('Sal (valfri)').selectOption('sal-1');
  await form.getByRole('checkbox', { name: 'Provvakt A' }).check();
};
const review = (page: Page) => panel(page).getByRole('button', { name: 'Förhandsgranska bokningar', exact: true });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Bokningar som kommer att sparas' }).getByRole('row');

test('provval ger entydiga förslag och visar bokningarna innan kalendern eller Förbered ändras', async ({ page }) => {
  const state = await mockProvplan(page);
  await mockSchemaDrafts(page.context());
  await page.goto(calendar + '?prov=1&status=faststalld');
  const form = panel(page);
  await form.getByLabel('Välj prov', { exact: true }).selectOption('engelska1-c-2026-11-24');
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-24');
  await expect(form.getByLabel('Start', { exact: true })).toHaveValue('09:00');
  await expect(form.getByRole('checkbox', { name: /NA26/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /Engelskagrupp 1/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /SA26/u })).not.toBeChecked();
  await expect(form.getByRole('checkbox', { name: /EK26/u })).toHaveCount(0);
  await expect(form.getByText('Kontrollera deltagandet.', { exact: true })).toBeVisible();

  await fillBooking(page);
  await review(page).click();
  await expect(previewRows(page)).toHaveCount(3);
  await expect(previewRows(page).nth(1)).toContainText('NA26');
  await expect(previewRows(page).nth(2)).toContainText('Engelskagrupp 1');
  await expect(previewRows(page).nth(1)).toContainText('09:00–10:30');
  await expect(previewRows(page).nth(2)).toContainText('Aulan');
  await expect(previewRows(page).nth(2)).toContainText('Provvakt A');
  const day = page.getByRole('button', { name: /tisdag 24 november 2026 · Skoldag/u });
  await expect(day).not.toHaveAccessibleName(/nationellt prov/u);
  expect(state.saves).toHaveLength(0);
  await form.getByRole('button', { name: 'Ändra uppgifter' }).click();
  await form.getByRole('button', { name: 'Avbryt', exact: true }).click();
  expect(state.saves).toHaveLength(0);

  await form.getByLabel('Välj prov', { exact: true }).selectOption('engelska1-c-2026-11-24');
  await fillBooking(page);
  await review(page).click();
  await form.getByRole('button', { name: 'Spara 2 provbokningar' }).click();
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats.');
  await expect(day).toHaveAccessibleName(/nationellt prov, 2 bokningar/u);
  expect(state.saves.map(s => s.document.bokningar.map(b => [b.mal.ref, b.startMin, b.slutMin, b.datum, b.salId, b.vakter]))).toEqual([[
    [uid(1), 540, 630, '2026-11-24', 'sal-1', [uid(5)]], [uid(4), 540, 630, '2026-11-24', 'sal-1', [uid(5)]],
  ]]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => innerWidth + 1));
  await page.reload();
  await expect(day).toHaveAccessibleName(/nationellt prov, 2 bokningar/u);
  await page.goto('/e2e/fixtures/schema-preview.html');
  const sammaPlan = page.locator('[data-nationella-prov]').getByRole('table', { name: 'Planerade nationella prov' });
  await expect(sammaPlan).toContainText('NA26');
  await expect(sammaPlan).toContainText('Engelskagrupp 1');
});

test('eget provunderlag ger förslag i ett senare läsår och kräver ny förhandsgranskning vid konflikt', async ({ page }) => {
  const state = await mockProvplan(page);
  state.conflict = true;
  await page.goto(calendar + '?prov=1&ar=2027');
  const form = panel(page);
  const prov = form.getByLabel('Välj prov', { exact: true });
  await expect(prov.locator('option')).toHaveCount(2);
  await prov.selectOption({ label: 'Eget provunderlag' });
  await form.getByLabel('Provets namn').fill('Engelska nivå 1, planerat delprov');
  await form.getByLabel('Ämne och nivå').selectOption('ENGE:ENGE1000X');
  await form.getByLabel('Typ av provtid').selectOption('period');
  await form.getByLabel('Provdatum').fill('2027-11-23');
  await form.getByLabel('Start', { exact: true }).fill('08:30');
  await fillBooking(page);
  await review(page).click();
  const save = form.getByRole('button', { name: 'Spara 2 provbokningar' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Provplanen har ändrats');
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Läs om provplanen' }).click();
  await expect(save).toHaveCount(0);
  await expect(form.getByLabel('Provets namn')).toHaveValue('Engelska nivå 1, planerat delprov');
  await review(page).click();
  await expect(previewRows(page).nth(1)).toContainText('08:30–10:30');
  await save.click();
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats.');
  expect(state.saves.map(s => s.expectedRevision)).toEqual([0, 1]);
});

test('periodprov använder terminen i provunderlaget även när den visade kalendern skiljer sig', async ({ page }) => {
  const source = structuredClone(underlag);
  source.terminer = { ht: { start: '2026-08-19', end: '2027-01-26' }, vt: { start: '2027-01-27', end: '2027-06-11' } };
  source.deltagare[0].undervisningar[0].terminer = { ht: true, vt: false };
  source.deltagare[3].undervisningar[0].terminer = { ht: false, vt: true };
  const state = await mockProvplan(page, source);
  await page.goto(calendar + '?prov=1');
  const form = panel(page);
  await form.getByLabel('Välj prov', { exact: true }).selectOption('engelska1-a-2026-11-02');
  await expect(form.getByLabel('Provdatum')).toHaveAttribute('max', '2027-01-26');
  await form.getByLabel('Provdatum').fill('2027-01-26');
  await form.getByLabel('Start', { exact: true }).fill('08:30');
  await expect(form.getByRole('checkbox', { name: /NA26/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /Engelskagrupp 1/u })).toHaveCount(0);
  await fillBooking(page);
  await review(page).click();
  await expect(previewRows(page)).toHaveCount(2);
  await expect(previewRows(page).nth(1)).toContainText('NA26');
  expect(state.saves).toHaveLength(0);
});

test('skolans provplan visas bara för behörigt uppdrag i gymnasiets skolkalender', async ({ page }) => {
  const state = await mockProvplan(page);
  for (const params of ['', '?prov=1&roll=huvudman', '?prov=1&mal=ram&roll=huvudman']) {
    await page.goto(calendar + params);
    await expect(page.locator('.ly-calendar')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  }
  expect(state.reads).toBe(0);
});
