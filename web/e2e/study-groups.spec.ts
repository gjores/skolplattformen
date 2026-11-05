// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseStudyGroupCommand, type StudyGroupCommand } from '../lib/study-group-contract';
const URL = '/e2e/fixtures/study-group-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const id = (n: number) => `58300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { unitId: id(1), schoolYear: 2027 };
const course = { subjectCode: 'PSYL', subjectVersion: 1, itemCode: 'PSYL1000X', points: 50, languageCode: null };
const pupils = [{ id: id(40), name: 'Syntetisk Elev A', classIds: [id(20)] }, { id: id(41), name: 'Syntetisk Elev B', classIds: [id(20)] }, { id: id(42), name: 'Syntetisk Elev C', classIds: [id(21)] }, { id: id(43), name: 'Syntetisk Elev D', classIds: [id(21)] }];
const group = (n: number, name: string) => ({ id: id(n), unitId: scope.unitId, schoolYear: 2027, name, startsOn: '2027-07-01', endsOn: '2028-06-30', course, minutesHt: 1350, minutesVt: 1350, parallelSetId: id(9), classIds: [id(20), id(21)], origin: { kind: 'classes' }, revision: 1, active: true });
async function mock(page: Page, groups: unknown[] = []) {
  const m = { state: { contractVersion: 'study_group_v1', ...scope, groups: groups as ReturnType<typeof group>[], memberships: [] as { id: string; groupId: string; pupilId: string; startsOn: string; endsOn: string; source: string; sourceRef: string | null }[], pupils, classes: [{ id: id(20), name: 'SA26A' }, { id: id(21), name: 'SA26B' }] }, writes: [] as StudyGroupCommand[] };
  await page.route('**/api/undervisningsgrupper/**', route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: m.state, headers });
    const c = parseStudyGroupCommand(route.request().postDataJSON()); m.writes.push(c);
    if (c.action === 'save_group') { const { expectedRevision, ...doc } = c.payload; m.state.groups = [...m.state.groups.filter(g => g.id !== doc.id), { ...doc, unitId: scope.unitId, schoolYear: 2027, revision: expectedRevision + 1, active: true } as ReturnType<typeof group>]; }
    if (c.action === 'add_members') for (const x of c.payload.members) m.state.memberships.push({ id: crypto.randomUUID(), groupId: c.payload.groupId, ...x });
    if (c.action === 'move_member') { const { membershipId, toGroupId } = c.payload; m.state.memberships = m.state.memberships.map(x => x.id === membershipId ? { ...x, groupId: toGroupId } : x); }
    if (c.action === 'end_member' || c.action === 'cancel_member') m.state.memberships = m.state.memberships.filter(x => x.id !== c.payload.membershipId);
    const ref = c.action === 'save_group' ? { groupId: c.payload.id, revision: c.payload.expectedRevision + 1 } : c.action === 'add_members' || c.action === 'retire_group' ? { groupId: c.payload.groupId } : { membershipId: c.payload.membershipId };
    return route.fulfill({ json: { receipt: { commandId: c.commandId, action: c.action, replayed: false, ...ref }, read: m.state }, headers });
  });
  return m;
}
test('skolan skapar en grupp, delar kursen, fördelar jämnt och flyttar en elev', async ({ page }) => {
  const m = await mock(page, [group(10, 'Psykologi 1')]); await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Psykologi 1', level: 3 })).toBeVisible();
  await page.getByRole('button', { name: 'Ny parallell grupp' }).click();
  await expect(page.getByLabel('Namn')).toHaveValue('Psykologi 1 2'); await page.getByRole('button', { name: 'Spara grupp' }).click();
  await expect(page.getByText('2 parallella grupper', { exact: false })).toBeVisible();
  await page.getByLabel('Ändringar gäller från').fill('2027-08-17');
  await page.getByRole('button', { name: 'Fördela jämnt' }).click();
  await expect(page.getByText('4 elever är fördelade.')).toBeVisible();
  const counts = m.state.groups.map(g => m.state.memberships.filter(x => x.groupId === g.id).length); expect(counts).toEqual([2, 2]);
  const first = m.state.memberships[0], name = pupils.find(p => p.id === first.pupilId)!.name;
  await page.getByLabel(`Flytta ${name}`).selectOption({ index: 1 }); await expect(page.getByText(`${name} är flyttad.`)).toBeVisible();
  const moved = m.writes.find(w => w.action === 'move_member')!; expect(moved.action === 'move_member' && moved.payload.on).toBe('2027-08-17');
  await page.getByRole('button', { name: `Avsluta ${name}` }).click(); await expect(page.getByText(`Medlemskapet för ${name} avslutas 2027-08-17.`)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow).toBeLessThanOrEqual(0);
});
test('ny grupp hämtar elever från vald klass', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await expect(page.getByText('Inga grupper ännu.')).toBeVisible();
  await page.getByRole('button', { name: 'Ny grupp' }).click(); await page.getByLabel('Namn').fill('Stödgrupp');
  await page.getByLabel('HT, timmar').fill('20'); await page.getByLabel('VT, timmar').fill('20'); await page.getByLabel('SA26B').check();
  await page.getByLabel('Ändringar gäller från').fill('2027-08-17');
  await page.getByRole('button', { name: 'Spara grupp' }).click();
  await expect(page.getByText('Gruppen är sparad och 2 elever är tillagda.')).toBeVisible();
  expect(m.writes.map(w => w.action)).toEqual(['save_group', 'add_members']);
  const save = m.writes[0]; expect(save.action === 'save_group' && [save.payload.minutesHt, save.payload.origin.kind, save.payload.course]).toEqual([1200, 'classes', null]);
});
test('elevens klass skickas aldrig i gruppkommandon', async ({ page }) => {
  const m = await mock(page, [group(10, 'Psykologi 1')]); await page.goto(URL);
  await page.getByRole('button', { name: 'Lägg till elev' }).click(); await page.getByRole('combobox', { name: 'Lägg till elev' }).selectOption({ label: 'Syntetisk Elev A' });
  await expect(page.getByText('Syntetisk Elev A är tillagd.')).toBeVisible();
  expect(JSON.stringify(m.writes.map(w => w.action === 'add_members' ? w.payload.members : []))).not.toContain('classId');
});
