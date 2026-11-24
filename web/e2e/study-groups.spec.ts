// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseStudyGroupCommand, type StudyGroupCommand, type StudyGroupRead } from '../lib/study-group-contract';
import type { StudyGroup } from '../lib/study-group-model';
const URL = '/e2e/fixtures/study-group-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const id = (n: number) => `58300000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { unitId: id(1), schoolYear: 2027 };
const course = { subjectCode: 'PSYL', subjectVersion: 1, itemCode: 'PSYL1000X', points: 50, languageCode: null };
const pupils = [{ id: id(40), name: 'Syntetisk Elev A', classIds: [id(20)] }, { id: id(41), name: 'Syntetisk Elev B', classIds: [id(20)] }, { id: id(42), name: 'Syntetisk Elev C', classIds: [id(21)] }, { id: id(43), name: 'Syntetisk Elev D', classIds: [id(21)] }];
const group = (n: number, name: string): StudyGroup => ({ id: id(n), unitId: scope.unitId, schoolYear: 2027, name, startsOn: '2027-07-01', endsOn: '2028-06-30', course, minutesHt: 1350, minutesVt: 1350, parallelSetId: id(9), classIds: [id(20), id(21)], origin: { kind: 'classes' }, revision: 1, active: true });
async function mock(page: Page, groups: StudyGroup[] = [], changes: Partial<StudyGroupRead> = {}) {
  const state: StudyGroupRead = { contractVersion: 'study_group_v1', ...scope, groups, memberships: [], pupils,
    classes: [{ id: id(20), name: 'SA26A' }, { id: id(21), name: 'SA26B' }], ...changes };
  const m = { state, writes: [] as StudyGroupCommand[] };
  await page.route('**/api/undervisningsgrupper/**', route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: m.state, headers });
    const c = parseStudyGroupCommand(route.request().postDataJSON()); m.writes.push(c);
    if (c.action === 'save_group') { const { expectedRevision, ...doc } = c.payload; m.state.groups = [...m.state.groups.filter(g => g.id !== doc.id), { ...doc, unitId: scope.unitId, schoolYear: 2027, revision: expectedRevision + 1, active: true }]; }
    if (c.action === 'organize_swedish') {
      for (const plan of c.payload.groups) {
        const source = state.svenskaSources!.find(item => plan.classIds.includes(item.classId))!;
        const old = state.groups.find(item => item.id === plan.groupId);
        state.groups = [...state.groups.filter(item => item.id !== plan.groupId), {
          ...(old ?? group(0, plan.name)), id: plan.groupId, parallelSetId: old?.parallelSetId ?? plan.groupId, name: plan.name,
          classIds: plan.classIds, revision: plan.expectedRevision + 1, minutesHt: source.needHt, minutesVt: source.needVt,
          course: { subjectCode: plan.subjectCode, subjectVersion: 1, itemCode: `${plan.subjectCode}${source.level}000X`, points: 100, languageCode: null },
          svenska: { forecast: plan.forecast },
        }];
      }
      state.svenskaSources = state.svenskaSources?.map(source => c.payload.sources.some(item => item.sourceKey === source.sourceKey)
        ? { ...source, groupIds: c.payload.groups.filter(plan => plan.classIds.includes(source.classId)).map(plan => plan.groupId) } : source);
    }
    if (c.action === 'add_members') for (const x of c.payload.members) m.state.memberships.push({ id: crypto.randomUUID(), groupId: c.payload.groupId, ...x });
    if (c.action === 'move_member') { const { membershipId, toGroupId } = c.payload; m.state.memberships = m.state.memberships.map(x => x.id === membershipId ? { ...x, groupId: toGroupId } : x); }
    if (c.action === 'end_member' || c.action === 'cancel_member') m.state.memberships = m.state.memberships.filter(x => x.id !== c.payload.membershipId);
    const ref = c.action === 'save_group' ? { groupId: c.payload.id, revision: c.payload.expectedRevision + 1 }
      : c.action === 'add_members' || c.action === 'retire_group' ? { groupId: c.payload.groupId }
        : 'membershipId' in c.payload ? { membershipId: c.payload.membershipId } : {};
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

const source = (classId: string, level: 1 | 2 | 3) => ({ classId, level,
  sourceKey: `class_timplan:${classId}:2027:alternative:foundation:SVEN:1:SVEN${level}000X+SVEA:1:SVEA${level}000X`,
  needHt: 2400, needVt: 2400, groupIds: [],
});

test('prognosgrupp sparas före antagning och samma grupp tar emot elever senare', async ({ page }) => {
  const m = await mock(page, [], { pupils: [], svenskaSources: [source(id(20), 1)] });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Organisera Svenska/SvA' }).click();
  await page.getByRole('button', { name: 'Lägg till svenskgrupp' }).click();
  await page.getByRole('button', { name: 'Lägg till SvA-grupp' }).click();
  await page.getByRole('group', { name: 'Svenska', exact: true }).getByLabel('Beräknat elevantal').fill('18');
  await page.getByRole('group', { name: 'Svenska som andraspråk', exact: true }).getByLabel('Beräknat elevantal').fill('12');
  await page.getByRole('button', { name: 'Spara organisation' }).click();
  await expect(page.getByText('Prognos 12 · 0 placerade')).toBeVisible();
  const swedish = m.state.groups.find(item => item.course?.subjectCode === 'SVEA')!;
  expect(m.writes.map(w => w.action)).toEqual(['organize_swedish']);
  expect(m.state.memberships).toHaveLength(0);

  m.state.pupils = pupils;
  await page.reload();
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: swedish.name }) });
  await card.getByRole('button', { name: 'Lägg till elever' }).click();
  await card.getByRole('checkbox', { name: 'Syntetisk Elev A' }).check();
  await card.getByRole('checkbox', { name: 'Syntetisk Elev B' }).check();
  await expect(card.getByRole('checkbox', { name: 'Syntetisk Elev C' })).toHaveCount(0);
  await card.getByRole('button', { name: 'Lägg till valda elever' }).click();
  await expect(card.getByText('Prognos 12 · 2 placerade')).toBeVisible();
  expect(m.state.memberships.map(member => member.groupId)).toEqual([swedish.id, swedish.id]);
});

test('befintlig SvA-grupp används med sina kända deltagare på nästa nivå', async ({ page }) => {
  const existing: StudyGroup = { ...group(10, 'SvA nivå 2'), classIds: [id(21)],
    course: { subjectCode: 'SVEA', subjectVersion: 1, itemCode: 'SVEA2000X', points: 100, languageCode: null } };
  const m = await mock(page, [existing], { svenskaSources: [source(id(20), 1), source(id(21), 2)], memberships: [
    { id: id(11), groupId: existing.id, pupilId: id(42), startsOn: '2027-08-17', endsOn: existing.endsOn, source: 'manual', sourceRef: null },
  ] });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Organisera Svenska/SvA' }).click();
  await page.getByLabel('Nivå', { exact: true }).selectOption('2');
  await page.getByLabel('Använd befintlig grupp').selectOption(existing.id);
  await expect(page.getByLabel('Elevunderlag')).toHaveValue('known');
  await page.getByRole('button', { name: 'Spara organisation' }).click();
  await expect(page.getByText('Grupporganisationen är sparad.')).toBeVisible();
  expect(m.state.groups.map(item => item.id)).toEqual([existing.id]);
  expect(m.state.memberships[0].groupId).toBe(existing.id);
  expect(m.state.groups[0].svenska?.forecast).toBeNull();
});
