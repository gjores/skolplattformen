import { test, expect, type Page } from './schema-test';
import { headers, mockUnderlag, utanBerakning } from './schema-underlag-mock';
import { NATIONELLA_PROV_KALLA, parseNationellaProvSave, type NationellaProvDocument, type NationellaProvRegister, type NationellaProvUnderlag } from '../lib/nationella-prov.ts';

const URL = '/e2e/fixtures/schema-preview.html';
const KLASS = '52a10000-0000-4000-8000-000000000011';
const GRUPP = '52a10000-0000-4000-8000-000000000022';
const VAKT = '52a10000-0000-4000-8000-000000000033';
const PROV = 'Engelska nivå 1, delprov B';
const DATUM = '2027-03-15';
const UNDERLAG: NationellaProvUnderlag = {
  gallerGymnasiet: true,
  deltagare: [
    { slag: 'klass', ref: KLASS, name: 'NA26', undervisningar: [
      { ref: 'undervisning:engelska-na26', title: 'Engelska – nivå 1' },
      { ref: 'undervisning:svenska-na26', title: 'Svenska – nivå 1' },
    ] },
    { slag: 'grupp', ref: GRUPP, name: 'SA engelska', undervisningar: [{ ref: 'undervisning:engelska-sa-grupp', title: 'Engelska – nivå 1' }] },
  ],
  salar: [{ id: 'sal-4', name: 'Provsal A' }],
  vakter: [{ ref: VAKT, name: 'Provvakt A' }],
  skoldagar: [DATUM, '2027-03-16'],
};

async function mockProvplan(page: Page) {
  let register: NationellaProvRegister | null = null;
  const receipts = new Map<string, NationellaProvRegister>();
  const state = {
    saves: [] as ReturnType<typeof parseNationellaProvSave>[], reads: 0, loseReply: false, conflict: false,
    andraPaServern(f: (plan: NationellaProvDocument) => NationellaProvDocument) {
      if (!register) throw new Error('Skapa en provplan innan den ändras från ett annat fönster.');
      register = { ...register, revision: register.revision + 1, document: f(register.document) };
    },
  };
  await utanBerakning(page);
  await mockUnderlag(page);
  await page.route('**/api/lasar/nationella-prov/lasa', route => {
    state.reads++;
    return route.fulfill({ headers, json: { ...route.request().postDataJSON(), register, underlag: UNDERLAG } });
  });
  await page.route('**/api/lasar/nationella-prov/spara', route => {
    const input = parseNationellaProvSave(route.request().postDataJSON());
    state.saves.push(input);
    const { contractVersion, unitId, schoolYear, commandId, expectedRevision, document } = input;
    const receipt = receipts.get(commandId);
    if (receipt) return route.fulfill({ headers, json: { contractVersion, unitId, schoolYear, register: receipt, replayed: true } });
    if (state.conflict || expectedRevision !== (register?.revision ?? 0)) {
      state.conflict = false;
      return route.fulfill({ headers, status: 409, json: { code: 'conflict' } });
    }
    register = { revision: expectedRevision + 1, document, savedAt: new Date().toISOString() };
    receipts.set(commandId, register);
    if (state.loseReply) {
      state.loseReply = false;
      return route.abort('failed');
    }
    return route.fulfill({ headers, json: { contractVersion, unitId, schoolYear, register, replayed: false } });
  });
  return state;
}

const provplan = (page: Page) => page.locator('[data-nationella-prov]');

async function angeProv(page: Page) {
  await provplan(page).getByRole('button', { name: 'Planera prov' }).click();
  const dialog = page.getByRole('dialog', { name: 'Planera nationellt prov' });
  await dialog.getByLabel('Provets namn').fill(PROV);
  await dialog.getByLabel('Underlag kontrollerat').fill('2026-10-19');
  await dialog.getByLabel('Provdatum').fill(DATUM);
  await dialog.getByLabel('Slut', { exact: true }).fill('11:00');
  await dialog.getByRole('checkbox', { name: /NA26/u }).check();
  await dialog.getByLabel('Undervisning för NA26').selectOption('undervisning:engelska-na26');
  return dialog;
}

test('planerar prov per klass och grupp, ändrar, tar bort och bekräftar tom provplan', async ({ page }) => {
  const state = await mockProvplan(page);
  await page.goto(URL);
  const plan = provplan(page);
  await expect(plan.getByRole('link', { name: /Provdatum hos Skolverket/u })).toHaveAttribute('href', NATIONELLA_PROV_KALLA);
  const dialog = await angeProv(page);
  await expect(dialog.getByLabel('Start', { exact: true })).toHaveValue('09:00');
  await dialog.getByRole('checkbox', { name: /SA engelska/u }).check();
  await dialog.getByText('Ange sal eller provvakter', { exact: true }).click();
  await dialog.getByLabel('Lås sal').selectOption('sal-4');
  await dialog.getByRole('checkbox', { name: 'Provvakt A' }).check();
  await dialog.getByLabel('Provdatum').fill('2027-03-17');
  await dialog.getByRole('button', { name: 'Spara 2 provbokningar' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Datumet är ingen skoldag i läsårskalendern.');
  expect(state.saves).toHaveLength(0);
  await dialog.getByLabel('Provdatum').fill(DATUM);
  await dialog.getByRole('button', { name: 'Spara 2 provbokningar' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(plan.getByRole('row')).toHaveCount(3);
  const bokningar = state.saves[0].document.bokningar;
  expect(bokningar).toMatchObject([
    { mal: { slag: 'klass', ref: KLASS }, undervisning: 'undervisning:engelska-na26', salId: 'sal-4', vakter: [VAKT], startMin: 540 },
    { mal: { slag: 'grupp', ref: GRUPP }, undervisning: 'undervisning:engelska-sa-grupp', salId: 'sal-4', vakter: [VAKT], startMin: 540 },
  ]);
  expect(new Set(bokningar.map(b => b.id)).size).toBe(2);

  await page.reload();
  await expect(plan.getByRole('row')).toHaveCount(3);
  await plan.getByRole('button', { name: 'Markera som genomgånget' }).click();
  await expect(plan.getByText('Genomgånget', { exact: true })).toBeVisible();
  await plan.getByRole('button', { name: `Ändra ${PROV} för NA26` }).click();
  const edit = page.getByRole('dialog', { name: 'Ändra provbokning' });
  await expect(edit.getByLabel('Lås sal')).toHaveValue('sal-4');
  await expect(edit.getByRole('checkbox', { name: 'Provvakt A' })).toBeChecked();
  await edit.getByLabel('Typ av provtid').selectOption('period');
  await edit.getByLabel('Provdatum').fill('2027-03-16');
  await edit.getByLabel('Start', { exact: true }).fill('10:00');
  await edit.getByRole('button', { name: 'Spara provbokning' }).click();
  await expect(edit).toHaveCount(0);
  await expect(plan.getByText('Återstår att gå igenom', { exact: true })).toBeVisible();
  expect(state.saves[2].document.bokningar[0]).toMatchObject({ id: bokningar[0].id, datum: '2027-03-16', tidsval: 'period', startMin: 600, salId: 'sal-4', vakter: [VAKT] });

  await plan.getByRole('button', { name: `Ändra ${PROV} för NA26` }).click();
  await edit.getByLabel('Lås sal').selectOption('');
  await edit.getByRole('checkbox', { name: 'Provvakt A' }).uncheck();
  await edit.getByRole('button', { name: 'Spara provbokning' }).click();
  await expect(edit).toHaveCount(0);
  const row = plan.getByRole('row').filter({ hasText: 'NA26' });
  await expect(row).toContainText('Sal föreslås i Schema');
  await expect(row).toContainText('Provvakter föreslås i Schema');
  expect(state.saves[3].document.bokningar.find(b => b.id === bokningar[0].id)).toMatchObject({ salId: null, vakter: [] });

  for (const target of ['SA engelska', 'NA26']) {
    await plan.getByRole('button', { name: `Ta bort ${PROV} för ${target}` }).click();
    const confirm = page.getByRole('alertdialog', { name: 'Ta bort provbokningen?' });
    await confirm.getByRole('button', { name: 'Ta bort bokningen' }).click();
    await expect(confirm).toHaveCount(0);
  }
  await plan.getByRole('button', { name: 'Bekräfta att inga prov ska planeras' }).click();
  await expect(plan.getByText('Inga prov bekräftade', { exact: true })).toBeVisible();
  await page.reload();
  await expect(plan.getByText('Det är bekräftat att inga nationella prov ska planeras för läsåret.')).toBeVisible();
  expect(state.saves.at(-1)?.document).toEqual({ granskad: true, bokningar: [] });
});

test('behåller provformuläret vid konflikt och återanvänder bokning och kommando när kvittens saknas', async ({ page }) => {
  const state = await mockProvplan(page);
  state.conflict = true;
  await page.goto(URL);
  const dialog = await angeProv(page);
  const save = dialog.getByRole('button', { name: 'Spara provbokning' });
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Provplanen har ändrats');
  await dialog.getByRole('button', { name: 'Läs om provplanen' }).click();
  await expect.poll(() => state.reads).toBe(2);
  await expect(dialog.getByLabel('Provets namn')).toHaveValue(PROV);

  state.loseReply = true;
  await save.click();
  await expect(dialog.getByRole('alert')).toContainText('Sparandet saknar kvittens');
  await save.click();
  await expect(dialog).toHaveCount(0);
  await expect(provplan(page).getByRole('row')).toHaveCount(2);
  expect(state.saves).toHaveLength(3);
  expect(state.saves[1].commandId).toBe(state.saves[2].commandId);
  expect(state.saves[1].document).toEqual(state.saves[2].document);
  expect(state.saves[0].document.bokningar[0].id).toBe(state.saves[2].document.bokningar[0].id);
});

test('stoppar redigering och borttagning när den öppna bokningen ändrats i ett annat fönster', async ({ page }) => {
  const state = await mockProvplan(page);
  await page.goto(URL);
  const ny = await angeProv(page);
  await ny.getByRole('button', { name: 'Spara provbokning' }).click();
  await expect(ny).toHaveCount(0);

  const plan = provplan(page);
  await plan.getByRole('button', { name: `Ändra ${PROV} för NA26` }).click();
  const edit = page.getByRole('dialog', { name: 'Ändra provbokning' });
  await edit.getByLabel('Provets namn').fill('Mitt försök');
  state.andraPaServern(plan => ({ ...plan, bokningar: plan.bokningar.map(b => ({ ...b, namn: 'Ändrat från annat fönster' })) }));
  const spara = edit.getByRole('button', { name: 'Spara provbokning' });
  await spara.click();
  await edit.getByRole('button', { name: 'Läs om provplanen' }).click();
  await expect(edit.getByRole('alert')).toContainText('Bokningen har ändrats.');
  await expect(edit.getByLabel('Provets namn')).toHaveValue('Mitt försök');
  await expect(spara).toBeDisabled();
  await edit.getByRole('button', { name: 'Avbryt' }).click();
  await expect(plan.getByText('Ändrat från annat fönster')).toBeVisible();

  await plan.getByRole('button', { name: 'Ta bort Ändrat från annat fönster för NA26' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Ta bort provbokningen?' });
  const taBort = confirm.getByRole('button', { name: 'Ta bort bokningen' });
  state.andraPaServern(plan => ({ ...plan, bokningar: [] }));
  await taBort.click();
  await confirm.getByRole('button', { name: 'Läs om provplanen' }).click();
  await expect(confirm.getByRole('alert')).toContainText('Bokningen finns inte längre i provplanen.');
  await expect(taBort).toBeDisabled();
  await confirm.getByRole('button', { name: 'Stäng' }).click();
  await expect(plan.getByText('Inga prov är planerade för läsåret.')).toBeVisible();
  expect(state.saves).toHaveLength(3);
});
