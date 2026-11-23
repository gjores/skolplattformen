// Smalt regressionsprov: återöppnat/minimerat serverutkast, faktisk arbetsyta, uttryckligt simulerade API-svar.
import { test, expect, schemaTestDraft, type Page, type SchemaDraftTestServer } from './schema-test';
import raw from './schema-fixture';
import { type SchemaForslag, type SchemaVillkor } from '../lib/schema-contract.ts';
import { parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { type TjanstPerson, type TjanstPersonalRead } from '../lib/tjanst-contract.ts';
const source = raw as unknown as SchemaForslag, headers = { 'X-Context-Epoch': '1' }, URL = '/e2e/fixtures/schema-personal-preview.html';
const key = `${source.unitId}:2026:lasar`, extraName = 'Alma Extra', extraRef = uid(901);
function uid(n: number) { return `52a1e000-0000-4000-8000-${String(n).padStart(12, '0')}`; }
function person(n: number, givenName: string, startsOn = '2026-07-01', endsOn: string | null = null, patch: Partial<TjanstPerson> = {}): TjanstPerson {
  return { id: uid(n), givenName, familyName: 'Extra', externalId: null, externalIdSource: null, status: 'active', proposedForUnitId: null, draftNote: null, revision: 1, employments: [],
    duties: [{ id: uid(n + 100), unitId: source.unitId, schoolName: 'Syntetisk skola', percent: 100, startsOn, endsOn }], ...patch };
}
function personnel(): TjanstPersonalRead {
  return { contractVersion: 'tjanst_v1', scope: 'unit', unitId: source.unitId, actions: [], blockers: [], capabilities: { canManage: false, canCreateDraft: true }, people: [
    person(901, 'Alma'), person(902, 'Juni', '2027-06-30'), person(903, 'Juli', '2025-01-01', '2026-07-01'),
    person(904, 'Framtida', '2027-07-01'), person(905, 'Tidigare', '2025-01-01', '2026-06-30'),
    person(906, 'Utkast', '2026-07-01', null, { status: 'draft', proposedForUnitId: source.unitId }),
    person(907, 'Oanvänd dublett', '2026-07-01', null, { id: source.resurser.larare[0].ref }),
  ] };
}
async function reopen(page: Page, server: SchemaDraftTestServer, lookup = true) {
  const placements = source.lessons.filter(l => l.day !== null && l.startMin !== null).map(l => ({ lesson: l.id, day: l.day!, startMin: l.startMin!, room: l.roomId }));
  const input = parseSchemaDraftSave({ contractVersion: 1, unitId: source.unitId, schoolYear: 2026, period: 'lasar', commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Återöppnat minimerat schema', basisVillkor: source.villkor, workingVillkor: source.villkor, grundFingerprint: source.grundFingerprint,
    placements, locks: [], intentional: [], datedOverrides: [], activityTypes: [] });
  server.drafts.set(key, (await schemaTestDraft(input, source)).draft);
  await page.goto(`${URL}?personal=${lookup ? '1' : '0'}`);
  await expect(page.getByRole('textbox', { name: 'Namn på utkastet', exact: true })).toHaveValue('Återöppnat minimerat schema');
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true }); await expect(dialog).toBeVisible(); return dialog;
}
test('återöppnat utkast får valbar extra personal utan att ändra grund, radordning eller sparversion', async ({ page, schemaDraftServer: server }, info) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), calls: unknown[] = [], submissions: { villkor: SchemaVillkor }[] = [];
  await page.route('**/api/tjanst/personal/lasa', async r => { calls.push(r.request().postDataJSON()); await gate; return r.fulfill({ headers, json: personnel() }); });
  await page.route('**/api/schema/aktiviteter', r => { submissions.push(r.request().postDataJSON()); return r.fulfill({ headers, status: 403, json: { code: 'forbidden' } }); });
  await reopen(page, server); expect(calls).toHaveLength(0);
  const dialog = await open(page), staff = dialog.getByRole('group', { name: 'Ansvariga', exact: true });
  await expect(staff.getByRole('status')).toContainText('Hämtar');
  await dialog.getByRole('textbox', { name: 'Namn', exact: true }).fill('Mentorstid med extra personal'); await dialog.getByLabel(source.resurser.larare[0].name, { exact: true }).check();
  release(); await expect(dialog.getByLabel(extraName, { exact: true })).toBeVisible();
  expect(calls).toEqual([{ unitId: source.unitId }]);
  expect((await staff.locator('label').allTextContents()).map(s => s.trim())).toEqual([...source.resurser.larare.map(p => p.name), extraName, 'Juli Extra', 'Juni Extra']);
  await expect(dialog.getByRole('textbox', { name: 'Namn', exact: true })).toHaveValue('Mentorstid med extra personal'); await expect(dialog.getByLabel(source.resurser.larare[0].name, { exact: true })).toBeChecked();
  await dialog.getByLabel(extraName, { exact: true }).check(); await page.waitForTimeout(1_100);
  expect(server.saves).toHaveLength(0); expect(server.drafts.get(key)?.revision).toBe(1); expect(server.drafts.get(key)?.base?.resurser.larare).toEqual(source.resurser.larare);
  const cached = await page.evaluate(() => JSON.stringify(Object.entries(localStorage))); expect(cached).not.toContain(extraName); expect(cached).not.toContain(extraRef);
  await page.screenshot({ path: info.outputPath('extra-personal-efter-ateroppning.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ditt uppdrag tillåter inte');
  expect(submissions).toHaveLength(1); expect(submissions[0].villkor.aktiviteter?.[0].teacherRefs).toEqual([source.resurser.larare[0].ref, extraRef]);
  await expect(dialog.getByLabel(extraName, { exact: true })).toBeChecked(); expect(server.saves).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click(); await page.reload(); await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  expect(server.drafts.get(key)?.base?.resurser.larare).toEqual(source.resurser.larare); expect(server.saves).toHaveLength(0);
});
test('fel och fel skolkontext i personaluppslaget bevarar namn och planens val; återförsök kan lägga till personal', async ({ page, schemaDraftServer: server }, info) => {
  let calls = 0;
  await page.route('**/api/tjanst/personal/lasa', r => { calls++; return calls === 1 ? r.fulfill({ headers, status: 503, json: { code: 'unavailable' } })
    : r.fulfill({ headers, json: calls === 2 ? { ...personnel(), unitId: uid(999) } : personnel() }); });
  await reopen(page, server); const dialog = await open(page), staff = dialog.getByRole('group', { name: 'Ansvariga', exact: true });
  await dialog.getByRole('textbox', { name: 'Namn', exact: true }).fill('Bevarat formulär'); await dialog.getByLabel(source.resurser.larare[0].name, { exact: true }).check();
  for (const attempt of [1, 2]) {
    await expect(staff.getByRole('alert')).toContainText('Personalen i schemat och dina val finns kvar');
    await expect(dialog.getByRole('textbox', { name: 'Namn', exact: true })).toHaveValue('Bevarat formulär'); await expect(dialog.getByLabel(source.resurser.larare[0].name, { exact: true })).toBeChecked();
    expect(calls).toBe(attempt); await expect(dialog.getByLabel(extraName, { exact: true })).toHaveCount(0);
    if (attempt === 2) await page.screenshot({ path: info.outputPath('personaluppslag-fel-bevarat.png'), fullPage: false });
    await staff.getByRole('button', { name: 'Försök igen', exact: true }).click();
  }
  await expect(dialog.getByLabel(extraName, { exact: true })).toBeVisible(); await expect(staff.getByRole('alert')).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Namn', exact: true })).toHaveValue('Bevarat formulär'); await expect(dialog.getByLabel(source.resurser.larare[0].name, { exact: true })).toBeChecked();
  expect(server.saves).toHaveLength(0);
});
test('utan rektors tips gör aktivitetsdialogen inget personaluppslag', async ({ page, schemaDraftServer: server }) => {
  let calls = 0; await page.route('**/api/tjanst/personal/lasa', r => { calls++; return r.fulfill({ headers, json: personnel() }); });
  await reopen(page, server, false); const dialog = await open(page), staff = dialog.getByRole('group', { name: 'Ansvariga', exact: true });
  await dialog.getByRole('textbox', { name: 'Namn', exact: true }).fill('Utan personaluppslag'); await dialog.getByLabel(source.resurser.larare[0].name, { exact: true }).check();
  await page.waitForTimeout(1_100); expect(calls).toBe(0); expect(server.saves).toHaveLength(0);
  expect((await staff.locator('label').allTextContents()).map(s => s.trim())).toEqual(source.resurser.larare.map(p => p.name));
});
test('401 från personaluppslaget går till arbetsytans sessionshantering', async ({ page, schemaDraftServer: server }) => {
  await page.route('**/api/tjanst/personal/lasa', r => r.fulfill({ headers, status: 401, json: { code: 'unauthorized' } }));
  await reopen(page, server); await open(page); await expect(page).toHaveTitle('Utloggad'); expect(server.saves).toHaveLength(0);
});
