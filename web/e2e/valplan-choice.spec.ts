// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseValplanChoiceCommand, parseValplanSelfCommand, type ValplanChoiceCommand } from '../lib/valplan-choice-contract';
import { read, id, courses, person, scope } from './fixtures/valplan-choice-data';
const URL = '/e2e/fixtures/valplan-choice-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const at = '2026-11-05T10:00:00.000Z';
type Round = { id: string; status: 'open' | 'closed'; closesOn: string; guardianConfirmation: boolean; revision: number; accepting: boolean };
async function staffMock(page: Page) {
  const m = { state: read(), writes: [] as ValplanChoiceCommand[], lose: false, refuse: null as string | null };
  await page.route('**/api/valplaner/val/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: m.state, headers });
    const c = parseValplanChoiceCommand(route.request().postDataJSON()); m.writes.push(c);
    if (m.lose) { m.lose = false; return route.abort('failed'); }
    if (m.refuse) return route.fulfill({ status: 400, json: { code: 'bad_request', details: { reason: m.refuse } }, headers });
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
  const m = { offer: { round: { id: id(40), status: 'open', closesOn: '2026-12-01', guardianConfirmation: guardian, revision: 1, accepting: true }, valplanId: scope.valplanId, valplanName: 'Individuellt val 2027/28', kind: 'individualChoice', schoolYear: 2027, targetPoints: 200, courses, blockedCourses: [] as { courseId: string; reason: 'timplan' | 'val' }[], choice: null as unknown, decision: null as string | null }, writes: [] as unknown[] };
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

test('nekar servern öppnandet säger sidan varför, och inget val öppnas', async ({ page }) => {
  const m = await staffMock(page); m.state.guardianConfirmation = false; await page.goto(URL);
  await expect(page.getByText('Välj sista valdag för att öppna valet.')).toBeVisible();
  await page.getByLabel('Sista valdag').fill('2026-12-01');
  await expect(page.getByText('Välj sista valdag för att öppna valet.')).toHaveCount(0);
  for (const [reason, text] of [['valplan_round_points', 'En klass kan inte nå exakt sina poäng'], ['valplan_round_doubled', 'En klass finns i två block'], ['valplan_round_rows', 'En klass finns i två rader'], ['valplan_round_no_classes', 'Inga klasser ingår'], ['valplan_round_time', 'En kurs saknar undervisningstid'], ['valplan_round_row', 'En kopplad timplansrad finns inte längre']]) {
    m.refuse = reason;
    await page.getByRole('button', { name: 'Öppna val', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: text })).toBeVisible();
  }
  await expect(page.getByText('Inte öppnat')).toBeVisible();
  // Without a round the database refuses a registration, so the page offers none.
  await expect(page.getByRole('button', { name: /^Registrera val åt/ })).toHaveCount(0);
  await expect(page.getByText('Skolan kan registrera val när valet har öppnats.')).toBeVisible();
});

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
test('skolan ser kurser som inte går att välja med skäl, poäng kvar och val som blivit ogiltiga', async ({ page }, info) => {
  const m = await staffMock(page); m.state.guardianConfirmation = false; m.state.round = { id: id(40), status: 'open', closesOn: '2026-12-01', guardianConfirmation: false, revision: 1, accepting: true };
  const held = { id: id(50), roundId: id(40), pupilId: id(60), revision: 1, courseIds: [courses[0].id, courses[2].id], state: 'course_held', submittedBy: 'participant', submittedAt: at, confirmedAt: at };
  m.state.pupils = m.state.pupils.map(p => p.id === id(60) ? { ...p, offeredCourseIds: [courses[1].id], blockedCourses: [{ courseId: courses[0].id, reason: 'val' as const }, { courseId: courses[2].id, reason: 'timplan' as const }], choice: held } : p);
  await page.goto(URL);
  await expect(page.getByText('1 val har en kurs eleven redan har.')).toBeVisible();
  const row = page.getByRole('row', { name: /Syntetisk Elev A/ }); await expect(row.getByText('Eleven har redan kursen')).toBeVisible();
  await expect(row.getByText('Retorik – nivå 1: Ingår redan i elevens timplan')).toBeVisible(); await expect(row.getByText('Psykologi – nivå 1: Eleven har redan valt kursen')).toBeVisible();
  await expect(row.getByRole('button', { name: /Bekräfta/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('elevval-ogiltigt.png'), fullPage: true });
  await page.getByRole('button', { name: 'Registrera val åt Syntetisk Elev A' }).click();
  const form = page.getByRole('group', { name: 'Val för Syntetisk Elev A' });
  await expect(form.getByLabel(/Retorik/)).toBeDisabled(); await expect(form.getByLabel(/Retorik/)).not.toBeChecked(); await expect(form.getByText('100 p · Ingår redan i elevens timplan')).toBeVisible();
  await expect(form.getByLabel(/Psykologi/)).toBeDisabled(); await expect(form.getByText('50 p · Eleven har redan valt kursen')).toBeVisible();
  await expect(form.getByText('0 av 200 p valda. 200 p kvar.')).toBeVisible(); await expect(form.getByText('Kurserna eleven kan välja räcker inte till 200 p. Närmast går 50 p.')).toBeVisible();
  await form.getByLabel(/Filosofi/).check(); await expect(form.getByText('50 av 200 p valda. 150 p kvar.')).toBeVisible(); await expect(form.getByRole('button', { name: 'Spara val' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('registrera-spärr.png'), fullPage: true });
  await form.getByRole('button', { name: 'Avbryt' }).click();
  await page.getByLabel('Visa även elever utanför blockets klasser').check();
  await page.getByRole('button', { name: 'Registrera val åt Syntetisk Elev C' }).click(); m.refuse = 'valplan_choice_course_held';
  const outside = page.getByRole('group', { name: 'Val för Syntetisk Elev C' }); await outside.getByLabel(/Psykologi/).check(); await outside.getByRole('button', { name: 'Spara val' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Eleven har redan en av kurserna' })).toBeVisible();
  m.refuse = null; m.state.pupils = m.state.pupils.map(p => p.id === id(62) ? { ...p, blockedCourses: [{ courseId: courses[0].id, reason: 'val' as const }] } : p);
  await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect(outside.getByLabel(/Psykologi/)).toBeDisabled(); await expect(outside.getByLabel(/Psykologi/)).not.toBeChecked(); await expect(outside.getByRole('button', { name: 'Spara val' })).toBeDisabled();
  const box = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(box).toBeLessThanOrEqual(0);
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
test('eleven ser vad som går att välja, varför en kurs inte går och hur många poäng som är kvar', async ({ page }, info) => {
  const m = await selfMock(page, 'pupil'); m.offer.targetPoints = 150;
  m.offer.blockedCourses = [{ courseId: courses[1].id, reason: 'val' }, { courseId: courses[2].id, reason: 'timplan' }]; await page.goto(`${URL}?self`);
  await expect(page.getByLabel(/Retorik/)).toBeDisabled(); await expect(page.getByLabel(/Retorik/)).not.toBeChecked(); await expect(page.getByText('Ingår redan i din timplan')).toBeVisible();
  await expect(page.getByLabel(/Filosofi/)).toBeDisabled(); await expect(page.getByText('Du har redan valt kursen')).toBeVisible();
  await expect(page.getByText('Kurserna du kan välja räcker inte till 150 p. Närmast går 50 p. Kontakta skolan.')).toBeVisible();
  await page.getByLabel(/Psykologi/).check(); await expect(page.getByText('100 p kvar att välja.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lämna val' })).toBeDisabled();
  await page.screenshot({ path: info.outputPath('mina-val-spärr.png'), fullPage: true });
  const box = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(box).toBeLessThanOrEqual(0);
});
test('ett val som blivit ogiltigt säger det, och kursen faller bort först när eleven sparar', async ({ page }) => {
  const m = await selfMock(page, 'pupil');
  m.offer.choice = { id: id(50), roundId: id(40), pupilId: person.pupilId, revision: 2, courseIds: [courses[2].id, courses[0].id, courses[1].id], state: 'course_held', submittedBy: 'participant', submittedAt: at, confirmedAt: null };
  m.offer.blockedCourses = [{ courseId: courses[2].id, reason: 'timplan' }]; m.offer.targetPoints = 100; await page.goto(`${URL}?self`);
  await expect(page.getByText('En kurs i valet finns redan i timplanen eller i ett annat val.')).toBeVisible();
  await expect(page.getByLabel(/Retorik/)).not.toBeChecked(); await expect(page.getByLabel(/Psykologi/)).toBeChecked();
  await expect(page.getByText('Du har valt rätt antal poäng.')).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Ändra val' }).click(); await expect(page.getByText('Ditt val är inlämnat.')).toBeVisible();
  expect((m.writes[0] as { payload: { courseIds: string[] } }).payload.courseIds).toEqual([courses[0].id, courses[1].id]);
});
test('hinner kursen spärras när eleven sparar säger sidan varför', async ({ page }) => {
  const m = await selfMock(page, 'pupil'); await page.route('**/api/valplaner/egen/kommando', route => route.fulfill({ status: 400, json: { code: 'bad_request', details: { reason: 'valplan_choice_course_held' } }, headers }));
  await page.goto(`${URL}?self`); for (const name of [/Psykologi/, /Filosofi/, /Retorik/]) await page.getByLabel(name).check();
  await page.getByRole('button', { name: 'Lämna val' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Du har redan en av kurserna' })).toBeVisible(); expect(m.writes).toHaveLength(0);
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
