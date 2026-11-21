// Browser checks with synthetic API responses. Protected server behavior is verified separately.
import { expect, test, type Page } from '@playwright/test';

const id = (n: number) => `77101200-0000-4000-8000-${String(n).padStart(12, '0')}`;
const unitId = id(2);
const classId = id(60);
const schoolName = 'Exempelskolan Nord';
const className = 'SA26A';
const educationName = 'Samhällsvetenskapsprogrammet';
const on = '2026-10-13';
const scope = { unitId, classId, on };
const previewToken = `sha256:${'2'.repeat(64)}`;
const base = '/e2e/fixtures/usability-preview.html?vy=elever';
const selectedClassLocation = `${base}&lasar=2026&skola=${unitId}&klass=${classId}&sida=1`;
const bulkEntry = 'Skapa studieplansutkast…';

const pupils = [
  { pupilId: id(50), displayName: 'Provelev Alva', educationName, status: 'ready', reason: null },
  { pupilId: id(51), displayName: 'Provelev Bo', educationName, status: 'needs_completion', reason: 'choice' },
  { pupilId: id(52), displayName: 'Provelev Cia', educationName, status: 'existing', reason: null },
  { pupilId: id(53), displayName: 'Provelev Dan', educationName, status: 'blocked', reason: 'catalog' },
] as const;
const headers = { 'X-Context-Epoch': '1', 'Cache-Control': 'no-store' };
const registerScope = { schools: [{ id: unitId, name: schoolName }], groups: [], cases: [] };
const capabilities = { canEdit: false, canExport: false, canRevealPersonalNumber: false, canReadHistory: false };

function pupilListRow(pupil: typeof pupils[number]) {
  return { id: pupil.pupilId, displayName: pupil.displayName, unitId, unitName: schoolName, classId, className,
    educationId: id(10), educationName, grade: 1, status: 'aktuell', capabilities };
}

type Outcome = 'pending' | 'saved' | 'existing' | 'changed';
type FixtureOptions = { lostFirstAdvance?: boolean; changeOnAdvance?: string; stalePreview?: boolean };
async function mockClassDrafts(page: Page, options: FixtureOptions = {}) {
  const actions: Record<string, unknown>[] = [];
  const openedPupilIds: string[] = [];
  const unexpected: string[] = [];
  let runId: string | null = null;
  let outcomes: { pupilId: string; displayName: string; educationName: string; outcome: Outcome }[] = [];
  let lost = false;
  let stale = Boolean(options.stalePreview);
  const run = () => runId === null ? null : { ...scope, runId, rows: outcomes, hasPending: outcomes.some(row => row.outcome === 'pending') };
  const context = { assignmentId: id(4), membershipId: id(5), customerId: id(1), customerName: 'Exempelhuvudmannen',
    organizerId: null, organizerName: null, unitId, unitName: schoolName, function: 'rektor', label: 'Rektor', blocked: false, valid: true, scopeKind: 'school' };
  const assignment = { ...context, id: context.assignmentId, validFrom: '2026-01-01', validTo: null, endedAt: null, membershipStatus: 'active', state: 'giltigt' };
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    let json: unknown;
    if (url.pathname === '/api/session') {
      json = { identity: { issuer: 'synthetic', subject: 'synthetic-class-drafts', displayName: 'Exempelanvändare', email: null },
        assignments: [assignment], assignmentGroups: { valid: [assignment], upcoming: [], ended: [] }, context, today: '2026-10-12',
        mfa: { acr: null, amr: [], authTime: null, proof: true }, epoch: 1, expiresAt: '2099-01-01T00:00:00Z', correlationId: 'synthetic-ui' };
    } else if (url.pathname === '/api/planbeslut/inkorg') {
      json = { items: [], total: 0, actionCount: 0, decisionCount: 0, truncated: false };
    } else if (url.pathname === '/api/elever/urval') {
      json = { scope: registerScope, schoolYears: [2026], currentSchoolYear: 2026, endsAt: null, approverName: null,
        purposeCode: null, serverNow: '2026-10-12T10:00:00Z' };
    } else if (url.pathname === '/api/elever/lista') {
      // A register search can hide classmates without changing the separately reviewed class set.
      const body = request.postDataJSON();
      const rows = pupils.filter(pupil => !body.search || pupil.displayName.includes(body.search)).map(pupilListRow);
      json = { pupils: rows, scope: registerScope, capabilities: { ...capabilities, canReadProtected: false }, count: rows.length, page: 1, pageSize: 50,
        options: { schools: registerScope.schools, classes: [{ id: classId, name: className, unitId, educationId: id(10) }],
          educations: [{ id: id(10), name: educationName, unitId, startYear: 2026 }], grades: [1], statuses: ['aktuell'] } };
    } else if (url.pathname === '/api/elever/elev') {
      const pupil = pupils.find(row => row.pupilId === url.searchParams.get('pupilId'));
      expect(pupil).toBeDefined();
      if (!pupil) throw Error('Unknown fixture pupil');
      const place = id(451);
      openedPupilIds.push(pupil.pupilId);
      json = { ...pupilListRow(pupil), version: 1, placements: [{ id: place, unitId, educationId: id(10), startsOn: '2026-08-17', endsOn: null }],
        classes: [{ id: id(405), placementId: place, classId, startsOn: '2026-08-17', endsOn: null }] };
    } else if (url.pathname === '/api/studieplaner/klass') {
      expect(request.method()).toBe('POST');
      const body = request.postDataJSON();
      actions.push(body);
      if (body.action === 'preview') {
        expect(body).toMatchObject(scope);
        json = { scope, schoolName, className, classStartsOn: '2026-08-17', previewToken, rows: pupils };
      } else if (body.action === 'start') {
        expect(body).toMatchObject({ scope, previewToken });
        expect(body.runId).toMatch(/^[0-9a-f-]{36}$/u);
        if (stale) {
          stale = false;
          return route.fulfill({ status: 409, json: { code: 'conflict', details: { reason: 'study_plan_class_changed' } }, headers });
        }
        if (runId === null) {
          runId = body.runId;
          outcomes = pupils.filter(pupil => body.pupilIds.includes(pupil.pupilId)).map(({ pupilId, displayName, ...row }) => ({
            pupilId, displayName, educationName: row.educationName, outcome: 'pending',
          }));
        } else expect(body.runId).toBe(runId);
        json = run();
      } else if (body.action === 'status') {
        expect(body).toMatchObject({ unitId, classId });
        if (body.runId !== undefined) expect(body.runId).toBe(runId);
        else expect(body.schoolYear).toBe(2026);
        json = run();
      } else if (body.action === 'advance') {
        expect(body).toMatchObject({ unitId, classId, runId });
        const pending = outcomes.find(row => row.outcome === 'pending');
        if (pending) pending.outcome = pending.pupilId === options.changeOnAdvance ? 'changed' : 'saved';
        if (options.lostFirstAdvance && !lost) {
          lost = true;
          return route.abort('failed');
        }
        json = run();
      } else {
        unexpected.push(String(body.action));
        return route.fulfill({ status: 500, json: { code: 'unexpected_request' }, headers });
      }
    } else {
      unexpected.push(url.pathname);
      return route.fulfill({ status: 500, json: { code: 'unexpected_request' }, headers });
    }
    await route.fulfill({ json, headers });
  });
  return { actions, openedPupilIds, unexpected };
}

async function openClassDrafts(page: Page) {
  await page.getByRole('button', { name: bulkEntry, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Studieplansutkast för ${className}`, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function previewClassDrafts(page: Page) {
  const dialog = await openClassDrafts(page);
  await dialog.getByLabel('Elever i klassen den', { exact: true }).fill(on);
  await dialog.getByRole('button', { name: 'Förhandsgranska', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true })).toBeEnabled();
  return dialog;
}

test('klassvisa studieplansutkast granskas, väljs bort och öppnas från resultatet', async ({ page }) => {
  const fixture = await mockClassDrafts(page);
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Sök elever', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: bulkEntry, exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Klass', exact: true }).selectOption(classId);
  await page.getByLabel('Sökord', { exact: true }).fill('Provelev Alva');
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  await expect(page.getByRole('button', { name: /Provelev Bo, öppna elevkortet/u })).toHaveCount(0);

  const dialog = await previewClassDrafts(page);
  await expect(dialog.getByText('Studieplan finns', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Provelev Cia', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Öppna elevkort för Provelev Cia', exact: true })).toBeEnabled();
  await expect(dialog.getByText('Provelev Dan', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /Provelev (Cia|Dan)/u })).toHaveCount(0);
  expect(fixture.actions.filter(call => call.action !== 'status').map(call => call.action)).toEqual(['preview']);
  expect(await dialog.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);

  await dialog.getByRole('checkbox', { name: 'Ta med Provelev Alva', exact: true }).uncheck();
  const save = dialog.getByRole('button', { name: 'Skapa 1 utkast', exact: true });
  await expect(save).toBeEnabled();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await save.click();

  await expect(dialog.getByText('1 utkast skapat', { exact: true })).toBeVisible();
  expect(fixture.actions.filter(call => call.action === 'start').map(call => call.pupilIds)).toEqual([[pupils[1].pupilId]]);
  expect(fixture.actions.filter(call => call.action === 'advance')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Öppna elevkort för Provelev Bo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Provelev Bo', exact: true })).toBeFocused();
  expect(fixture.openedPupilIds).toEqual([pupils[1].pupilId]);
  expect(page.url()).not.toContain(pupils[1].pupilId);
  expect(fixture.unexpected).toEqual([]);
});

test('klassvisa studieplansutkast återläser kvitto efter omladdning och fortsätter med återstående elev', async ({ page }) => {
  const fixture = await mockClassDrafts(page, { lostFirstAdvance: true });
  await page.goto(selectedClassLocation);

  const dialog = await previewClassDrafts(page);
  await dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Kontrollera sparandet', exact: true })).toBeEnabled();
  const start = fixture.actions.find(call => call.action === 'start');
  expect(start?.runId).toBeTruthy();
  expect(fixture.actions.filter(call => call.action === 'advance')).toHaveLength(1);

  await page.reload();
  await openClassDrafts(page);
  const resume = dialog.getByRole('button', { name: 'Fortsätt skapa utkast', exact: true });
  await expect(resume).toBeEnabled();
  expect(fixture.actions.filter(call => call.action === 'advance')).toHaveLength(1);
  await resume.click();
  await expect(dialog.getByText('2 utkast skapade', { exact: true })).toBeVisible();
  expect(fixture.actions.filter(call => call.action === 'start')).toHaveLength(1);
  expect(fixture.actions.filter(call => call.action === 'advance').map(call => call.runId)).toEqual([start?.runId, start?.runId]);
  expect(fixture.unexpected).toEqual([]);
});

test('klassvisa studieplansutkast kräver ny förhandsgranskning när klassen har ändrats', async ({ page }) => {
  const fixture = await mockClassDrafts(page, { stalePreview: true });
  await page.goto(selectedClassLocation);

  const dialog = await previewClassDrafts(page);
  await dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Underlaget har ändrats.');
  await expect(dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true })).toBeHidden();
  expect(fixture.actions.filter(call => call.action === 'advance')).toHaveLength(0);
  expect(fixture.actions.filter(call => call.action === 'preview')).toHaveLength(1);

  await dialog.getByRole('button', { name: 'Förhandsgranska på nytt', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true })).toBeEnabled();
  expect(fixture.actions.filter(call => call.action === 'preview')).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});

test('klassvisa studieplansutkast skiljer sparat utkast från en rad som ändrades under körningen', async ({ page }) => {
  const fixture = await mockClassDrafts(page, { changeOnAdvance: pupils[1].pupilId });
  await page.goto(selectedClassLocation);

  const dialog = await previewClassDrafts(page);
  await dialog.getByRole('button', { name: 'Skapa 2 utkast', exact: true }).click();
  const result = dialog.getByRole('region', { name: 'Sparresultat', exact: true });
  await expect(result.getByText(/^1 utkast skapat · 1 behöver granskas på nytt$/u)).toBeVisible();
  const changed = result.getByRole('listitem').filter({ hasText: 'Provelev Bo' });
  await expect(changed.getByText('Granska på nytt', { exact: true })).toBeVisible();
  expect(fixture.actions.filter(call => call.action === 'advance')).toHaveLength(2);
  expect(fixture.unexpected).toEqual([]);
});
