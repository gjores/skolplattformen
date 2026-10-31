// Syntetiska API-svar provar skolans Reactflöde. Riktig låsning/CAS/behörighet verifieras i separata SQL-/Workerprov.
import { test, expect, type Page } from '@playwright/test';
import { parsePlacementPreviewRequest, type PlacementPreview } from '../lib/elective-placement-contract';
import { createElectiveCommandRef, parseElectiveCommand, type ElectiveCommand, type ElectiveReceipt } from '../lib/elective-block-contract';
import { block, choice, eid, round, schoolRead } from './fixtures/elective-data';
const URL = '/e2e/fixtures/elective-block-preview.html', BASIS = '2b'.repeat(32);
async function mock(page: Page, changed = false) {
  const data = schoolRead(), b = block(); b.applied = true; b.appliedRevision = 1;
  data.blocks = [b]; data.policy.guardianConfirmation = false; data.rounds = [{ ...round(), guardianConfirmation: false }]; data.choices = [{ ...choice(), confirmedAt: '2026-10-01T10:00:00.000Z', state: 'confirmed' }];
  const writes: ElectiveCommand[] = [], previews: unknown[] = [];
  await page.route('**/api/valbara-block/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname, headers = { 'X-Context-Epoch': '1' };
    if (path.endsWith('/lasa')) return route.fulfill({ json: data, headers });
    const input = route.request().postDataJSON();
    if (path.endsWith('/forhandsvisa')) {
      const request = parsePlacementPreviewRequest(input); previews.push(request); const outside = request.payload.startsOn < '2026-11-01';
      const result: PlacementPreview = { unitId: data.unitId, schoolYear: data.schoolYear, revision: data.revision, basisHash: BASIS, allowed: !outside, issues: outside ? ['outside_pupil_class_period'] : [],
        pupil: { id: eid(20), name: 'Prov Elev', version: 1 }, group: { id: request.payload.groupId, name: 'Spanska 1', startsOn: b.startsOn, endsOn: b.endsOn },
        period: { startsOn: request.payload.startsOn, endsOn: request.payload.endsOn ?? b.endsOn }, schoolPeriods: [{ startsOn: '2026-11-01', endsOn: '2027-06-30' }],
        classPeriods: [{ classId: eid(2), className: 'SA26', startsOn: '2026-11-01', endsOn: '2027-06-30' }], previous: null, warnings: [] };
      return route.fulfill({ json: result, headers });
    }
    const command = parseElectiveCommand(input); writes.push(command);
    if (changed) return route.fulfill({ status: 409, json: { code: 'elective_placement_conflict' }, headers });
    data.revision++;
    if (command.action === 'save_placement') { const p = command.payload; data.placements = [{ id: p.placementId, pupilId: eid(20), groupId: p.groupId, choiceId: p.choiceId, choiceRevision: p.expectedChoiceRevision, startsOn: p.startsOn, endsOn: p.endsOn, revision: 1 }]; }
    if (command.action === 'end_placement') data.placements = data.placements?.filter(value => value.id !== command.payload.placementId) ?? [];
    if (command.action === 'retire_group') { data.retiredGroups = [{ id: eid(13), blockId: b.id, optionId: eid(11), name: 'Spanska 1', startsOn: b.startsOn, endsOn: b.endsOn, retiredAt: '2026-10-31T12:00:00.000Z' }]; b.groups = b.groups.filter(group => group.id !== command.payload.groupId); }
    const receipt: ElectiveReceipt = { ...await createElectiveCommandRef(command), revision: data.revision, objectId: command.action === 'save_placement' || command.action === 'end_placement' ? command.payload.placementId : command.action === 'retire_group' ? command.payload.groupId : null, objectRevision: 1, replayed: false };
    return route.fulfill({ json: receipt, headers });
  });
  return { data, writes, previews };
}
async function review(page: Page, date = '2026-11-01') {
  await page.getByRole('button', { name: 'Placera i grupp', exact: true }).click();
  await page.getByRole('combobox', { name: 'Undervisningsgrupp', exact: true }).selectOption(eid(13));
  await page.getByLabel('Från', { exact: true }).fill(date);
  await page.getByRole('button', { name: 'Granska placering', exact: true }).click();
}
test('skolan granskar faktiska perioder och sparar exakt placeringsförslag', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await review(page);
  await expect(page.getByRole('button', { name: 'Bekräfta gruppplacering', exact: true })).toBeEnabled();
  await page.getByText('Skol- och klassperioder som kontrollerats', { exact: true }).click();
  await expect(page.getByText('SA26: 2026-11-01 – 2027-06-30', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Bekräfta gruppplacering', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gruppplaceringar', exact: true })).toBeVisible();
  expect(m.previews).toHaveLength(1); expect(m.writes).toHaveLength(1); expect(m.writes[0].action).toBe('save_placement');
  if (m.writes[0].action === 'save_placement') expect(m.writes[0].payload.expectedBasisHash).toBe(BASIS);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('period utanför elevens klass kan justeras utan att något skrivs', async ({ page }) => {
  const m = await mock(page); await page.goto(URL); await review(page, '2026-10-01');
  await expect(page.getByRole('button', { name: 'Bekräfta gruppplacering', exact: true })).toBeDisabled();
  await expect(page.getByText(/Perioden ryms inte/)).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Justera', exact: true }).click(); await page.getByLabel('Från', { exact: true }).fill('2026-11-01');
  await page.getByRole('button', { name: 'Granska placering', exact: true }).click(); await expect(page.getByRole('button', { name: 'Bekräfta gruppplacering', exact: true })).toBeEnabled();
});
test('klassperiod som ändrats efter granskningen bevarar förslaget och kräver ny granskning', async ({ page }) => {
  const m = await mock(page, true); await page.goto(URL); await review(page);
  await page.getByRole('button', { name: 'Bekräfta gruppplacering', exact: true }).click();
  await expect(page.getByText(/Underlaget har ändrats. Hämta aktuellt läge/)).toBeVisible();
  expect(m.data.placements).toEqual([]); expect(m.writes).toHaveLength(1);
});
test('kommande placering återtas uttryckligt utan en ersättningsgrupp', async ({ page }) => {
  const m = await mock(page); m.data.placements = [{ id: eid(55), groupId: eid(13), pupilId: eid(20), choiceId: eid(22), choiceRevision: 1, startsOn: '2027-01-01', endsOn: '2027-06-30', revision: 2 }];
  await page.goto(URL); await page.getByRole('button', { name: 'Återta planerad placering', exact: true }).click();
  await expect(page.getByText(/Elevens val och klass behålls/)).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Bekräfta återtagning', exact: true }).click();
  expect(m.writes[0].action).toBe('end_placement');
  if (m.writes[0].action === 'end_placement') expect(m.writes[0].payload).toEqual({ placementId: eid(55), expectedPlacementRevision: 2, endsOn: '2026-12-31' });
});
test('avveckling kräver uttryckligt val och behåller gruppnamn på avslutad placering', async ({ page }) => {
  const m = await mock(page); m.data.rounds[0].status = 'closed';
  m.data.placements = [{ id: eid(56), groupId: eid(13), pupilId: eid(20), choiceId: eid(22), choiceRevision: 1, startsOn: '2026-07-01', endsOn: '2026-09-30', revision: 2 }];
  await page.goto(URL); await page.getByRole('button', { name: 'Avveckla grupp', exact: true }).first().click();
  await expect(page.getByText('Tidigare placeringar och publicerad tjänst behåller sin historik.', { exact: false })).toBeVisible(); expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Bekräfta avveckling', exact: true }).click();
  await expect(page.getByText('Gruppen är avvecklad.', { exact: true })).toBeVisible();
  await expect(page.getByText('Prov Elev · Spanska 1', { exact: true })).toBeVisible();
  expect(m.writes).toHaveLength(1); expect(m.writes[0].action).toBe('retire_group');
});
test('pågående valomgång ger konkret avvecklingshinder och gruppen finns kvar', async ({ page }) => {
  const m = await mock(page);
  await page.route('**/api/valbara-block/kommando', route => route.fulfill({ status: 409, json: { code: 'elective_round_open' }, headers: { 'X-Context-Epoch': '1' } }));
  await page.goto(URL); await page.getByRole('button', { name: 'Avveckla grupp', exact: true }).first().click();
  await page.getByRole('button', { name: 'Bekräfta avveckling', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Stäng gruppens öppna valomgångar innan du avvecklar gruppen.' })).toBeVisible();
  expect(m.data.blocks[0].groups).toHaveLength(2); expect(m.data.retiredGroups).toBeUndefined();
});
