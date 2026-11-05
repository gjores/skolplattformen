// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseValplanChoiceCommand, parseValplanSelfCommand, type ValplanChoiceCommand } from '../lib/valplan-choice-contract';
import { read, id, courses, person, scope } from './fixtures/valplan-choice-data';
const URL = '/e2e/fixtures/valplan-choice-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const at = '2026-11-05T10:00:00.000Z';
type Round = { id: string; status: 'open' | 'closed'; closesOn: string; guardianConfirmation: boolean; revision: number; accepting: boolean };
async function staffMock(page: Page) {
  const m = { state: read(), writes: [] as ValplanChoiceCommand[], lose: false };
  await page.route('**/api/valplaner/val/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: m.state, headers });
    const c = parseValplanChoiceCommand(route.request().postDataJSON()); m.writes.push(c);
    if (m.lose) { m.lose = false; return route.abort('failed'); }
    const extra: Record<string, number> = {};
    const round = m.state.round as Round | null;
    if (c.action === 'set_policy') m.state.guardianConfirmation = c.payload.guardianConfirmation;
    if (c.action === 'open_round') m.state.round = { id: id(40), status: 'open', closesOn: c.payload.closesOn, guardianConfirmation: !!m.state.guardianConfirmation, revision: (round?.revision ?? 0) + 1, accepting: true };
    if (c.action === 'close_round') m.state.round = { ...round!, status: 'closed', accepting: false, revision: round!.revision + 1 };
    if (c.action === 'record_choice') { const { pupilId, courseIds } = c.payload; m.state.pupils = m.state.pupils.map(p => p.id === pupilId ? { ...p, choice: { id: id(50), roundId: id(40), pupilId, revision: 1, courseIds, state: 'ready_for_confirmation', submittedBy: 'school', submittedAt: at, confirmedAt: null } } : p); }
    if (c.action === 'confirm_choice') { const { pupilId } = c.payload; m.state.pupils = m.state.pupils.map(p => p.id === pupilId ? { ...p, choice: { ...(p.choice as object), state: 'confirmed', confirmedAt: at } } : p); }
    if (c.action === 'create_groups') Object.assign(extra, { created: 3, added: 3, notConfirmed: 0 });
    return route.fulfill({ json: { receipt: { commandId: c.commandId, action: c.action, replayed: false, ...extra }, read: m.state }, headers });
  });
  return m;
}
async function selfMock(page: Page, participant: 'pupil' | 'guardian', guardian = false) {
  const m = { offer: { round: { id: id(40), status: 'open', closesOn: '2026-12-01', guardianConfirmation: guardian, revision: 1, accepting: true }, valplanId: scope.valplanId, valplanName: 'Individuellt val 2027/28', kind: 'individualChoice', schoolYear: 2027, targetPoints: 200, courses, choice: null as unknown, decision: null as string | null }, writes: [] as unknown[] };
  const participantRow = { ...person, participant, confirmationRequired: participant === 'guardian' };
  await page.route('**/api/valbara-block/egen/**', route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/urval')) return route.fulfill({ json: { contractVersion: 'elective_self_v1', epoch: 1, identityReference: id(71), participants: [participantRow] }, headers });
    return route.fulfill({ json: { contractVersion: 'elective_self_v1', epoch: 1, participant: participantRow, policy: { unitId: person.unitId, revision: 1, guardianConfirmation: guardian }, offers: [], choices: [], confirmations: [], placements: [] }, headers });
  });
  await page.route('**/api/valplaner/egen/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: { contractVersion: 'valplan_self_v1', epoch: 1, offers: [m.offer] }, headers });
    const c = parseValplanSelfCommand(route.request().postDataJSON()); m.writes.push(c);
    if (c.action === 'submit_choice') m.offer.choice = { id: id(50), roundId: id(40), pupilId: person.pupilId, revision: ((m.offer.choice as { revision?: number })?.revision ?? 0) + 1, courseIds: c.payload.courseIds, state: guardian ? 'awaiting_guardian' : 'ready_for_confirmation', submittedBy: 'participant', submittedAt: at, confirmedAt: null };
    else m.offer.decision = c.payload.decision;
    return route.fulfill({ json: { commandId: c.commandId, action: c.action, bindingId: person.bindingId, choiceId: id(50), choiceRevision: 1, replayed: false }, headers });
  });
  return m;
}

test('skolan öppnar valet, registrerar, bekräftar, skapar grupper och stänger', async ({ page }) => {
  const m = await staffMock(page); await page.goto(URL);
  await expect(page.getByRole('heading', { name: /Elevval – Individuellt val/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Öppna val', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Vårdnadshavare bekräftar' }).click();
  await page.getByRole('button', { name: 'Ingen bekräftelse' }).click();
  await page.getByLabel('Sista valdag').fill('2026-12-01');
  await page.getByRole('button', { name: 'Öppna val', exact: true }).click();
  await expect(page.getByText('Öppet till 2026-12-01')).toBeVisible();
  await page.getByRole('button', { name: 'Registrera val åt Syntetisk Elev A' }).click();
  const save = page.getByRole('button', { name: 'Spara val' });
  await page.getByLabel(/Psykologi/).check(); await expect(page.getByText('50 av 200 p valda.')).toBeVisible(); await expect(save).toBeDisabled();
  await page.getByLabel(/Filosofi/).check(); await page.getByLabel(/Retorik/).check(); await expect(save).toBeEnabled(); await save.click();
  await expect(page.getByText('Valet för Syntetisk Elev A är sparat.')).toBeVisible();
  await expect(page.getByText('Klart att bekräfta', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Bekräfta valet för Syntetisk Elev A' }).click();
  await expect(page.getByRole('cell', { name: 'Bekräftat' })).toBeVisible();
  await page.getByRole('button', { name: 'Skapa grupper från valet' }).click();
  await expect(page.getByText('3 nya grupper och 3 elever tillagda.')).toBeVisible();
  await page.getByRole('button', { name: 'Öppna Undervisningsgrupper' }).click(); await expect(page).toHaveTitle('Grupper');
  await page.getByRole('button', { name: 'Stäng val' }).click(); await expect(page.getByText('Stängt', { exact: true })).toBeVisible();
  expect(m.writes.map(w => w.action)).toEqual(['set_policy', 'set_policy', 'open_round', 'record_choice', 'confirm_choice', 'create_groups', 'close_round']);
  const box = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(box).toBeLessThanOrEqual(0);
});
test('filter och elev utanför valplanens klasser', async ({ page }) => {
  await staffMock(page); await page.goto(URL);
  const table = page.getByRole('table');
  await expect(table.getByText('Syntetisk Elev B')).toBeVisible(); await expect(table.getByText('Syntetisk Elev C')).toHaveCount(0);
  for (const select of await page.getByRole('combobox').all()) if (await select.isVisible()) expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.getByLabel(/Visa även elever utanför/).check(); await expect(table.getByText('Syntetisk Elev C')).toBeVisible();
  await page.getByRole('combobox', { name: 'Klass' }).first().selectOption({ label: 'SA26B' }); await expect(table.getByText('Syntetisk Elev A')).toHaveCount(0);
});
test('ett förlorat svar skickas igen med samma kommando', async ({ page }) => {
  const m = await staffMock(page); await page.goto(URL);
  m.lose = true; await page.getByRole('button', { name: 'Ingen bekräftelse' }).click();
  await page.getByRole('button', { name: 'Kontrollera sparstatus' }).click();
  await expect(page.getByText('Sparandet är bekräftat.')).toBeVisible();
  expect(m.writes[0].commandId).toBe(m.writes[1].commandId);
});
test('eleven väljer två 50-poängskurser och en 100 och kan ändra', async ({ page }) => {
  const m = await selfMock(page, 'pupil'); await page.goto(`${URL}?self`);
  await expect(page.getByRole('heading', { name: 'Individuellt val 2027/28' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Lämna val' });
  await expect(submit).toBeDisabled(); await page.getByLabel(/Psykologi/).check(); await page.getByLabel(/Filosofi/).check();
  await expect(page.getByText('100 p kvar att välja.')).toBeVisible(); await page.getByLabel(/Retorik/).check();
  await expect(page.getByText('Du har valt rätt antal poäng.')).toBeVisible(); await submit.click();
  await expect(page.getByText('Ditt val är inlämnat.')).toBeVisible(); await expect(page.getByText('Valet är inlämnat och väntar på skolans bekräftelse.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ändra val' })).toBeDisabled();
  expect(m.writes).toHaveLength(1);
  const box = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(box).toBeLessThanOrEqual(0);
});
test('stängt val kan inte ändras av eleven', async ({ page }) => {
  const m = await selfMock(page, 'pupil'); m.offer.round.accepting = false; m.offer.round.status = 'closed'; await page.goto(`${URL}?self`);
  await expect(page.getByText('Valet är stängt')).toBeVisible(); await expect(page.getByLabel(/Psykologi/)).toBeDisabled(); await expect(page.getByRole('button', { name: 'Lämna val' })).toBeDisabled();
});
test('vårdnadshavaren bekräftar elevens val', async ({ page }) => {
  const m = await selfMock(page, 'guardian', true);
  m.offer.choice = { id: id(50), roundId: id(40), pupilId: person.pupilId, revision: 1, courseIds: [courses[2].id, courses[0].id, courses[1].id], state: 'awaiting_guardian', submittedBy: 'participant', submittedAt: at, confirmedAt: null };
  await page.goto(`${URL}?self`); await expect(page.getByText('Retorik – nivå 1')).toBeVisible();
  await page.getByRole('button', { name: 'Bekräfta valet' }).click(); await expect(page.getByText('Du har bekräftat detta val.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bekräfta valet' })).toBeDisabled();
});
