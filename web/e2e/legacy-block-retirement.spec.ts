// Riktiga React-flöden mot syntetiska API-svar; samma steg mot PostgreSQL finns i verify-legacy-block-retirement-sql.
import { test, expect, type Page } from '@playwright/test';
import { createElectiveCommandRef, parseElectiveCommand, type ElectiveCommand } from '../lib/elective-block-contract';
import { parseYearPlanCommand, type TjanstYearCommand } from '../lib/tjanst-year-contract';
import { eid, source } from './fixtures/elective-data';

const URL = '/e2e/fixtures/study-group-preview.html';
const headers = { 'X-Context-Epoch': '1' }, HASH = `sha256:${'4a'.repeat(32)}`;
const unitId = '58300000-0000-4000-8000-000000000001', year = 2027;
const scope = { unitId, schoolYear: year }, period = { startsOn: `${year}-07-01`, endsOn: `${year + 1}-06-30` };
const ref = () => ({ ...source(), unitId, schoolYear: year, sourceKey: `class_timplan:${eid(2)}:${year}:block:mosp`, frameSourceKey: `class_timplan:${eid(2)}:${year}:block:mosp`, timeDetailRef: null });
const option = { id: eid(11), name: 'Franska', subjectCode: 'MODO', levelCode: 'MODO1000X', language: 'fr', points: 100 };
const group = (id: string, name: string) => ({ id, optionId: option.id, name, ...period, classIds: [eid(2)], sourceKeys: [ref().sourceKey], estimatedPupils: 10, memberCount: 0, membershipRevision: 1 });
const block = (groups: ReturnType<typeof group>[]) => ({ id: eid(10), kind: 'modernLanguage', name: 'Moderna språk', ...period, sourceRefs: [ref()], options: [option], groups, revision: 3, offeringRevision: 1, applied: true, appliedRevision: 2 });
const version = (id: string, status: 'published' | 'draft') => ({ id, versionNo: status === 'draft' ? 2 : 1, status, contentHash: HASH, basedOnVersionId: status === 'draft' ? eid(70) : null, publishedAt: status === 'draft' ? null : `${year}-01-01T10:00:00.000Z`, publishedByName: status === 'draft' ? null : 'Rektor Prov' });
const row = (id: string, groupId: string, jointGroupId: string | null = null) => ({ id, lineageId: eid(95), sourceKind: 'teaching_group', sourceKey: `teaching_group:${groupId}:${year}`, rowKey: `group:${groupId}`, classId: null, groupId, classIds: [eid(2)], sourceRefs: [ref()], groupRevision: 1, personId: eid(80), teacherHt: 600, teacherVt: 600, needHt: 2700, needVt: 2700, needBasis: 'terms', stale: false, jointGroupId, comment: '' });

async function mock(page: Page, { groups = [group(eid(12), 'Franska'), group(eid(13), 'Spanska')], rows = [row(eid(60), eid(12)), row(eid(61), eid(13))] } = {}) {
  const m = { groups, rows, version: version(eid(70), 'published'), revision: 1, electiveRevision: 5, failNext: null as string | null, writes: [] as (ElectiveCommand | TjanstYearCommand)[] };
  const planRead = () => ({ contractVersion: 'tjanst_v1', ...scope, schoolName: 'Provskolan', revision: m.revision, version: m.version, versions: [m.version], teachers: [{ personId: eid(80), displayName: 'Anna Prov', draft: false, shareHere: null }], classes: [], groups: [], rows: m.rows, joints: m.rows.some(r => r.jointGroupId) ? [{ id: eid(90), lineageId: eid(96), name: 'Samläsning', rowIds: m.rows.map(r => r.id), teachers: [{ personId: eid(80), ht: 600, vt: 600 }] }] : [], sharing: [], specials: [], actions: ['save_row', 'delete_row'], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true } });
  const electiveRead = () => ({ contractVersion: 'elective_block_v1', ...scope, schoolName: 'Provskolan', revision: m.electiveRevision, canManage: true, canReadPupils: true, policy: { unitId, revision: 1, guardianConfirmation: false }, sources: [], blocks: [block(m.groups)], pupils: [], rounds: [], choices: [], placements: [] });
  await page.route('**/api/undervisningsgrupper/**', route => route.fulfill({ json: { contractVersion: 'study_group_v1', ...scope, groups: [], memberships: [], pupils: [], classes: [] }, headers }));
  await page.route('**/api/valbara-block/lasa', route => route.fulfill({ json: electiveRead(), headers }));
  await page.route('**/api/tjanst/plan/lasa', route => route.fulfill({ json: planRead(), headers }));
  await page.route('**/api/tjanst/plan/forhandsvisa', route => route.fulfill({ json: { contractVersion: 'tjanst_year_v1', ...scope, mode: 'catalog', currentRevision: m.revision, baseVersionId: m.version.id, basisHash: HASH, candidates: [], totalCandidates: 0 }, headers }));
  await page.route('**/api/tjanst/plan/kommando', route => {
    const c = parseYearPlanCommand(route.request().postDataJSON()); m.writes.push(c);
    if (c.action !== 'delete_row') throw Error('Oväntat kommando');
    // Första ändringen skapar ett utkast, där raderna får nya ID:n.
    if (m.version.status === 'published') { m.version = version(eid(71), 'draft'); m.rows = m.rows.map((r, i) => ({ ...r, id: r.id === c.payload.rowId ? r.id : eid(160 + i) })); }
    m.rows = m.rows.filter(r => r.id !== c.payload.rowId); m.revision++;
    return route.fulfill({ json: { receipt: { commandId: c.commandId, action: c.action, versionId: m.version.id, revision: m.revision, contentHash: HASH, replayed: false, changed: true }, detail: planRead() }, headers });
  });
  await page.route('**/api/valbara-block/kommando', async route => {
    const c = parseElectiveCommand(route.request().postDataJSON()), reference = await createElectiveCommandRef(c);
    if (m.failNext === c.action) { m.failNext = null; return route.abort('failed'); }
    m.writes.push(c);
    if (c.action === 'retire_group') m.groups = m.groups.filter(g => g.id !== c.payload.groupId);
    m.electiveRevision++;
    return route.fulfill({ json: { ...scope, commandId: c.commandId, action: c.action, payloadHash: reference.payloadHash, revision: m.electiveRevision, objectId: eid(12), objectRevision: 2, replayed: false }, headers });
  });
  return m;
}
const card = (page: Page) => page.getByRole('region', { name: 'Gamla valbara block' });
const open = async (page: Page) => { await page.goto(URL); await card(page).getByRole('button', { name: 'Avveckla…' }).click(); };

test('rektor granskar och avvecklar ett block i ett steg', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await expect(card(page).getByText('2 grupper · 2 tjänsterader')).toBeVisible();
  await card(page).getByRole('button', { name: 'Avveckla…' }).click();
  await expect(card(page).getByText('2 tjänsterader tas bort ur tjänstefördelningen.', { exact: false })).toBeVisible();
  await expect(card(page).getByText('Timplanens rader väntar sedan på en valplan med grupp.', { exact: false })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); expect(overflow).toBeLessThanOrEqual(0);
  expect(m.writes).toEqual([]);
  await card(page).getByRole('button', { name: 'Bekräfta avveckling' }).click();
  await expect(page.getByText('Moderna språk är avvecklat. Publicera en ny version i Tjänstefördelningen när du är klar.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gamla valbara block' })).toHaveCount(0);
  expect(m.writes.map(w => w.action)).toEqual(['delete_row', 'delete_row', 'retire_group', 'retire_group']);
  const second = m.writes[1]; expect(second.action === 'delete_row' && second.payload.rowId).toBe(eid(161));
});
test('ett avbrutet förlopp fortsätter från det som återstår', async ({ page }) => {
  const m = await mock(page); m.failNext = 'retire_group'; await open(page);
  await card(page).getByRole('button', { name: 'Bekräfta avveckling' }).click();
  await expect(card(page).getByRole('alert')).toContainText('Försök igen, så fortsätter den från aktuellt läge.');
  await card(page).getByRole('button', { name: 'Bekräfta avveckling' }).click();
  await expect(page.getByText('Moderna språk är avvecklat.', { exact: false })).toBeVisible();
  expect(m.writes.map(w => w.action)).toEqual(['delete_row', 'delete_row', 'retire_group', 'retire_group']);
});
test('en samläst rad stoppar utan att något skrivs', async ({ page }) => {
  const m = await mock(page, { rows: [row(eid(60), eid(12), eid(90)), row(eid(61), eid(13), eid(90))] }); await open(page);
  await card(page).getByRole('button', { name: 'Bekräfta avveckling' }).click();
  await expect(card(page).getByRole('alert')).toContainText('samläsning');
  expect(m.writes).toEqual([]);
});
test('Behåll blocket skickar inget och utan block visas inget kort', async ({ page }) => {
  const m = await mock(page); await open(page);
  await card(page).getByRole('button', { name: 'Behåll blocket' }).click();
  await expect(card(page).getByRole('button', { name: 'Avveckla…' })).toBeVisible(); expect(m.writes).toEqual([]);
  await mock(page, { groups: [], rows: [] }); await page.goto(URL);
  await expect(page.getByText('Inga grupper ännu.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gamla valbara block' })).toHaveCount(0);
});
