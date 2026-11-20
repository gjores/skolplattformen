import { expect, test, type Page } from '@playwright/test';
import { mockSchemaDrafts } from './schema-test';
import { NATIONELLA_PROV_VERSION, type NationellaProvDocument, type NationellaProvRegister, type NationellaProvUnderlag } from '../lib/nationella-prov';

const calendar = '/e2e/fixtures/lasar-preview.html';
const uid = (value: number) => `52110000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const engelska1 = { amne: 'ENGE', niva: 'ENGE1000X', namn: 'Engelska nivå 1' };
const engelska2 = { amne: 'ENGE', niva: 'ENGE2000X', namn: 'Engelska nivå 2' };
const provkatalog: NonNullable<NationellaProvUnderlag['provkatalog']> = {
  revision: 3, kontrolleradDatum: '2026-11-19',
  prov: [
    { id: 'engelska1-a-ht', namn: 'Engelska nivå 1 · Delprov A', nivaer: [engelska1], tid: { typ: 'period', fran: '2026-11-02' },
      tidsplan: { typ: 'muntlig', minuterPerTillfalle: 15, deltagarePerTillfalle: 2, forberedelseMin: 10 } },
    { id: 'engelska1-c-ht', namn: 'Engelska nivå 1 · Delprov C', nivaer: [engelska1], tid: { typ: 'fast', datum: '2026-11-24' },
      tidsplan: { typ: 'gemensam', minuter: 90 } },
  ],
};
const eng = (ref: string, nivaer = [engelska1]) => ({ ref: `undervisning:${ref}`, title: nivaer.map(l => l.namn).join(' / '), nivaer, terminer: { ht: true, vt: false } });
const underlag: NationellaProvUnderlag = {
  gallerGymnasiet: true,
  deltagare: [
    { slag: 'klass', ref: uid(1), name: 'NA26', undervisningar: [eng('na26')] },
    { slag: 'klass', ref: uid(2), name: 'SA26', undervisningar: [eng('sa26', [engelska1, engelska2])] },
    { slag: 'klass', ref: uid(3), name: 'EK26', undervisningar: [eng('ek26', [engelska2])] },
    { slag: 'grupp', ref: uid(4), name: 'Engelskagrupp 1', undervisningar: [eng('grupp1')], klassRefs: [] },
  ],
  skoldagar: ['2026-11-24', '2026-11-26', '2027-01-26', '2027-11-23'],
  salar: [{ id: 'sal-1', name: 'Aulan' }],
  vakter: [{ ref: uid(5), name: 'Provvakt A' }],
};
type Save = { expectedRevision: number; commandId: string; document: NationellaProvDocument };

async function mockProvplan(page: Page, source = underlag) {
  let register: NationellaProvRegister | null = null;
  const state = { saves: [] as Save[], reads: 0, conflict: false, provkatalog };
  const headers = { 'X-Context-Epoch': '1' };
  await page.route('**/api/lasar/nationella-prov/lasa', route => {
    state.reads++;
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...body, contractVersion: NATIONELLA_PROV_VERSION, register, underlag: { ...source, provkatalog: body.schoolYear === 2026 ? state.provkatalog : null } } });
  });
  await page.route('**/api/lasar/nationella-prov/spara', route => {
    const { unitId, schoolYear, expectedRevision, commandId, document } = route.request().postDataJSON();
    state.saves.push({ commandId, expectedRevision, document });
    if ((document as NationellaProvDocument).bokningar.some(b => b.kallprov && b.kallprov.revision !== state.provkatalog.revision)) {
      return route.fulfill({ status: 409, headers, json: { code: 'conflict', details: { reason: 'nationella_prov_katalog_changed' } } });
    }
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
const provrad = (page: Page, delprov: 'A' | 'C') => panel(page).getByRole('button', { name: new RegExp(`Engelska nivå 1 · Delprov ${delprov}`, 'u') });
const chooseResources = async (page: Page) => {
  const form = panel(page);
  await form.getByText('Ange sal eller provvakter', { exact: true }).click();
  await form.getByLabel('Lås sal').selectOption('sal-1');
  await form.getByRole('checkbox', { name: 'Provvakt A' }).check();
};
const review = (page: Page) => panel(page).getByRole('button', { name: 'Förhandsgranska bokningar', exact: true });
const previewRows = (page: Page) => panel(page).getByRole('table', { name: 'Bokningar som kommer att sparas' }).getByRole('row');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-19T12:00:00Z'));
});

test('provval ger entydiga förslag och visar bokningarna innan kalendern eller Förbered ändras', async ({ page }) => {
  const state = await mockProvplan(page);
  await mockSchemaDrafts(page.context());
  await page.goto(calendar + '?prov=1&status=faststalld');
  const form = panel(page);
  const rekommenderade = form.getByRole('list', { name: 'Rekommenderade prov', exact: true });
  await expect(rekommenderade.getByRole('button', { name: /Delprov C.*24 november/u })).toBeVisible();
  await provrad(page, 'C').click();
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-24');
  await expect(form.getByLabel('Start', { exact: true })).toHaveValue('09:00');
  await expect(form.getByLabel('Slut', { exact: true })).toHaveValue('10:30');
  await expect(form.getByLabel('Underlag kontrollerat')).toHaveCount(0);
  await expect(form.getByRole('checkbox', { name: /NA26/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /Engelskagrupp 1/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /SA26/u })).not.toBeChecked();
  await expect(form.getByRole('checkbox', { name: /EK26/u })).toHaveCount(0);
  await expect(form.getByText('Kontrollera deltagandet.', { exact: true })).toBeVisible();

  await chooseResources(page);
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
  await expect(provrad(page, 'C')).toBeFocused();
  expect(state.saves).toHaveLength(0);

  await provrad(page, 'C').click();
  await chooseResources(page);
  await review(page).click();
  await form.getByRole('button', { name: 'Spara 2 provbokningar' }).click();
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats i läsårskalendern.');
  await expect(day).toHaveAccessibleName(/nationellt prov, 2 bokningar/u);
  expect(state.saves[0].document.bokningar.map(b => b.kallprov)).toEqual([
    { id: 'engelska1-c-ht', revision: 3 }, { id: 'engelska1-c-ht', revision: 3 },
  ]);
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
  await expect(sammaPlan.getByText('Skolverkets provkatalog', { exact: true })).toHaveCount(2);
});

test('eget provunderlag ger förslag i ett senare läsår och kräver ny förhandsgranskning vid konflikt', async ({ page }) => {
  const state = await mockProvplan(page);
  state.conflict = true;
  await page.goto(calendar + '?prov=1&ar=2027');
  const form = panel(page);
  await expect(form.getByRole('list')).toHaveCount(0);
  await expect(form.getByText(/Publicerade provdatum för det här läsåret saknas/u)).toBeVisible();
  await form.getByRole('button', { name: 'Eget provunderlag', exact: true }).click();
  await form.getByLabel('Provets namn').fill('Engelska nivå 1, planerat delprov');
  await form.getByLabel('Ämne och nivå').selectOption('ENGE:ENGE1000X');
  await form.getByLabel('Typ av provtid').selectOption('period');
  await form.getByLabel('Provdatum').fill('2027-11-23');
  await form.getByLabel('Start', { exact: true }).fill('08:30');
  await form.getByLabel('Slut', { exact: true }).fill('10:30');
  await form.getByLabel('Underlag kontrollerat').fill('2026-11-18');
  await chooseResources(page);
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
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats i läsårskalendern.');
  expect(state.saves.map(s => s.expectedRevision)).toEqual([0, 1]);
  expect(state.saves[1].document.bokningar.every(b => b.kallprov === undefined)).toBe(true);
});

test('periodprov använder terminen i provunderlaget även när den visade kalendern skiljer sig', async ({ page }) => {
  const source = structuredClone(underlag);
  source.terminer = { ht: { start: '2026-08-19', end: '2027-01-26' }, vt: { start: '2027-01-27', end: '2027-06-11' } };
  source.deltagare[0].undervisningar[0].terminer = { ht: true, vt: false };
  source.deltagare[3].undervisningar[0].terminer = { ht: false, vt: true };
  const state = await mockProvplan(page, source);
  await page.goto(calendar + '?prov=1');
  const form = panel(page);
  await provrad(page, 'A').click();
  await expect(form.getByLabel('Provdatum')).toHaveAttribute('max', '2027-01-26');
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-24');
  await expect(form.getByLabel('Start', { exact: true })).toHaveValue('09:00');
  await expect(form.getByLabel('Slut', { exact: true })).toHaveValue('10:30');
  await review(page).click();
  await expect(previewRows(page).nth(1)).toContainText('09:00–10:30');
  await form.getByRole('button', { name: 'Ändra uppgifter' }).click();
  await form.getByLabel('Provdatum').fill('2027-01-26');
  await form.getByLabel('Start', { exact: true }).fill('08:30');
  await expect(form.getByRole('checkbox', { name: /NA26/u })).toBeChecked();
  await expect(form.getByRole('checkbox', { name: /Engelskagrupp 1/u })).toHaveCount(0);
  await chooseResources(page);
  await review(page).click();
  await expect(previewRows(page)).toHaveCount(2);
  await expect(previewRows(page).nth(1)).toContainText('NA26');
  expect(state.saves).toHaveLength(0);
});

test('föreslaget muntligt provblock läggs in i läsårskalendern utan inmatning av datum och tid', async ({ page }) => {
  const state = await mockProvplan(page);
  await page.goto(calendar + '?prov=1');
  const form = panel(page);
  await provrad(page, 'A').click();
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-24');
  await expect(form.getByLabel('Start', { exact: true })).toHaveValue('09:00');
  await expect(form.getByLabel('Slut', { exact: true })).toHaveValue('10:30');
  await expect(form.getByLabel('Lås sal')).toBeHidden();
  await expect(form.getByRole('checkbox', { name: 'Provvakt A' })).toBeHidden();
  await review(page).click();
  await expect(previewRows(page)).toHaveCount(3);
  await expect(previewRows(page).nth(1)).toContainText('Sal föreslås i Schema');
  await expect(previewRows(page).nth(1)).toContainText('Provvakter föreslås i Schema');
  expect(state.saves).toHaveLength(0);
  await form.getByRole('button', { name: 'Spara 2 provbokningar' }).click();
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats i läsårskalendern.');
  await expect(page.getByRole('button', { name: /tisdag 24 november 2026 · Skoldag/u })).toHaveAccessibleName(/nationellt prov, 2 bokningar/u);
  const saved = page.getByRole('table', { name: 'Planerade nationella prov' });
  await expect(saved.getByText('Sal föreslås i Schema', { exact: true })).toHaveCount(2);
  await expect(saved.getByText('Provvakter föreslås i Schema', { exact: true })).toHaveCount(2);
  expect(state.saves[0].document.bokningar.map(b => [b.datum, b.startMin, b.slutMin, b.tidsval, b.kallprov?.id, b.salId, b.vakter])).toEqual([
    ['2026-11-24', 540, 630, 'period', 'engelska1-a-ht', null, []], ['2026-11-24', 540, 630, 'period', 'engelska1-a-ht', null, []],
  ]);
});

test('ändrade katalogdatum kräver ny förhandsgranskning och sparas med den nya revisionen', async ({ page }) => {
  const state = await mockProvplan(page);
  await page.goto(calendar + '?prov=1');
  const form = panel(page);
  await provrad(page, 'C').click();
  await chooseResources(page);
  await review(page).click();

  state.provkatalog = { ...provkatalog, revision: 4, prov: provkatalog.prov.map(p => p.id === 'engelska1-c-ht'
    ? { ...p, tid: { typ: 'fast', datum: '2026-11-26' } } : p) };
  const save = form.getByRole('button', { name: 'Spara 2 provbokningar' });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('Provkatalogen har ändrats.');
  await expect(save).toBeDisabled();
  await form.getByRole('button', { name: 'Läs om provplanen' }).click();
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-26');
  await chooseResources(page);
  await review(page).click();
  await save.click();
  await expect(form.getByRole('status')).toContainText('2 provbokningar har sparats i läsårskalendern.');
  expect(state.saves.map(s => s.expectedRevision)).toEqual([0, 0]);
  expect(state.saves[1].document.bokningar.map(b => [b.kallprov?.revision, b.datum])).toEqual([[4, '2026-11-26'], [4, '2026-11-26']]);
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

test('hela katalogen visas som provrader även utan rekommendationer', async ({ page }) => {
  const state = await mockProvplan(page, { ...underlag, deltagare: [] });
  await page.goto(calendar + '?prov=1');
  const form = panel(page);
  const lista = form.getByRole('list', { name: 'Prov i katalogen', exact: true });
  await expect(lista.getByRole('listitem')).toHaveCount(2);
  await expect(lista.getByRole('listitem').nth(0)).toContainText('från 2 november');
  await expect(lista.getByRole('listitem').nth(1)).toContainText('24 november');
  await expect(form.getByRole('combobox')).toHaveCount(0);
  await provrad(page, 'C').focus();
  await provrad(page, 'C').press('Enter');
  await expect(form.getByRole('heading', { name: 'Engelska nivå 1 · Delprov C' })).toBeFocused();
  await expect(form.getByLabel('Provdatum')).toHaveValue('2026-11-24');
  await form.getByRole('button', { name: 'Till provlistan' }).click();
  await expect(provrad(page, 'C')).toBeFocused();
  await expect(lista).toBeVisible();
  expect(state.saves).toHaveLength(0);
});
