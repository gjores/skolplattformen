// Component evidence with synthetic responses. No IdP, database or actual mandates are tested here.
import { test, expect, type Page } from '@playwright/test';
import { parsePlanningList, parsePlanningOverview, type PlanningSelection, type PlanningRow } from '../lib/planning-year-contract';

const id = (n: number) => `77101200-0000-4000-8000-${String(n).padStart(12, '0')}`;
const schools = [{ id: id(2), name: 'Exempelskolan Nord' }, { id: id(3), name: 'Exempelskolan Syd' }];
const setup = { customerId: id(1), serverDate: '2026-10-12', currentYear: 2026, minimumYear: 2000 as const, maximumYear: 2100 as const,
  units: schools.map(school => ({ unitId: school.id, schoolName: school.name, canRead: { programplan: true, gymnasium: true, grundskola: true, introduktionsprogram: true } })) };
const revision = `sha256:${'a'.repeat(64)}`;
const scope = { schools, groups: [], cases: [] };
const registerSetup = { scope, schoolYears: [2026, 2027], currentSchoolYear: 2026, endsAt: null, approverName: null, purposeCode: null, serverNow: '2026-10-12T10:00:00Z' };
const capabilities = { canEdit: false, canExport: false, canRevealPersonalNumber: false, canReadHistory: false, canReadProtected: false };
const measure = (value: number) => ({ value, known: value, complete: true });
const base = '/e2e/fixtures/usability-preview.html';

function rowsFor(selection: PlanningSelection): PlanningRow[] {
  if (selection.schoolform !== 'gymnasium' || selection.schoolYear < 2026 || selection.schoolYear > 2028) return [];
  const relativeYear = (selection.schoolYear - 2025) as 1 | 2 | 3;
  const rows: PlanningRow[] = schools.map((school, n) => ({ customerId: id(1), unitId: school.id, schoolName: school.name,
    offeringId: id(10 + n), educationName: 'Samhällsvetenskap', cohort: '2026–2029', schoolform: 'gymnasium',
    plan: { id: id(20 + n), version: n + 1, revision: 0, status: 'utkast' }, source: { planId: id(20 + n), offeringId: id(10 + n), version: n + 1, revision: 0 },
    start: { provenance: selection.view === 'programplan' ? 'program-version' : 'timplan-source', startedOn: '2026-08-15', academicYear: 2026, legacyYear: null },
    relativeYear, relation: relativeYear === 1 ? 'new' : 'continuing', underlag: 'planning', archived: false, columnMap: null, application: null, classes: [], diagnostics: [],
    cells: [{ rowKey: 'alternative:foundation:REL:1:REL1000X+FIL:1:FIL1000X', points: 200, pointTerms: [100, 0, 100, 0, 0, 0], hourValues: selection.view === 'programplan' ? null : [80, null, 80, null, null, null] }],
    ...(selection.view === 'programplan' ? { schoolTimplan: n === 0 ? { id: id(90), version: 3, revision: 1, status: 'utkast' as const, unitId: school.id, offeringId: id(10 + n), sourcePlanId: id(20 + n), sourceVersion: n + 1 } : null } : {}),
    searchDetails: { localCode: `SA${n}`, programCode: 'SA', orientationCode: 'SABEP', programName: 'Samhällsvetenskapsprogrammet', orientationName: 'Beteendevetenskap' },
  }));
  return rows.filter(row => (!selection.unitId || row.unitId === selection.unitId) && selection.archive !== 'archived'
    && (selection.grade === null || row.relativeYear === selection.grade) && (selection.status === 'all' || row.plan?.status === selection.status)
    && (['all', 'relevant'].includes(selection.cohortRelation) || row.relation === selection.cohortRelation)
    && (!selection.query || `${row.educationName} ${row.searchDetails!.localCode}`.toLocaleLowerCase('sv').includes(selection.query.toLocaleLowerCase('sv'))));
}

async function mockApp(page: Page, role = 'rektor') {
  const unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
    const context = { assignmentId: id(4), membershipId: id(5), customerId: id(1), customerName: 'Exempelhuvudmannen', organizerId: null, organizerName: null, unitId: null, unitName: null, function: role, label: role === 'huvudman' ? 'Huvudman' : role === 'administrator' ? 'Administratör' : 'Rektor', blocked: false, valid: true };
    const assignment = { ...context, id: context.assignmentId, validFrom: '2026-01-01', validTo: null, endedAt: null, membershipStatus: 'active', state: 'giltigt' };
    let json: unknown;
    if (path === '/api/session') json = { identity: { issuer: 'synthetic', subject: 'synthetic-ui', displayName: 'Exempelanvändare', email: null }, assignments: [assignment], assignmentGroups: { valid: [assignment], upcoming: [], ended: [] }, context, today: '2026-10-12', mfa: { acr: null, amr: [], authTime: null, proof: false }, epoch: 1, expiresAt: '2099-01-01T00:00:00Z', correlationId: 'synthetic-ui' };
    else if (path === '/api/planering/urval') json = setup;
    else if (path === '/api/planering/lista') json = parsePlanningList({ selection: body, selectionRevision: revision, count: rowsFor(body).length, pageSize: 50, rows: rowsFor(body) }, body, setup);
    else if (path === '/api/planering/oversikt') {
      const rows = rowsFor(body), points = rows.length * (body.schoolYear === 2028 ? 0 : 100);
      json = parsePlanningOverview({ selection: body, selectionRevision: revision, count: rows.length, rows,
        totals: { points: body.schoolform === 'gymnasium' ? measure(points) : null, annualHours: measure(body.view === 'timplan' ? points * .8 : 0), weeklyHours: measure(0), classCount: measure(0), hasForecast: false } }, body, setup);
    } else if (path === '/api/programplaner/val') json = { selection: body, units: schools, canCreateEducation: true, catalogs: [], programs: [], projection: null, decisionReady: false };
    else if (path === '/api/elever/urval') json = registerSetup;
    else if (path === '/api/elever/lista') {
      const pupils = [{ id: id(50), displayName: 'Exempelelev Alfa', unitId: schools[0].id, unitName: schools[0].name, classId: id(60), className: 'SA26', educationId: id(10), educationName: 'Samhällsvetenskap', grade: 1, status: 'aktuell', capabilities }]
        .filter(pupil => pupil.unitId === body.selection.unitId && (!body.search || pupil.displayName.includes(body.search)) && (body.selection.grade === null || body.selection.grade === pupil.grade));
      json = { pupils, scope, capabilities, count: pupils.length, page: 1, pageSize: 50,
        options: { schools, classes: [{ id: id(60), name: 'SA26', unitId: id(2), educationId: id(10) }], educations: [{ id: id(10), name: 'Samhällsvetenskap', unitId: id(2), startYear: 2026 }], grades: [1, 2], statuses: ['aktuell', 'framtida', 'avslutad'] } };
    } else if (path === '/api/kund/mandat') json = { mandates: [] };
    else { unexpected.push(path); return route.fulfill({ status: 500, json: { code: 'unexpected_request' } }); }
    await route.fulfill({ json, headers: { 'X-Context-Epoch': '1' } });
  });
  return () => { expect(unexpected).toEqual([]); expect(errors).toEqual([]); };
}

async function menu(page: Page, name: string, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await page.locator('.nav-button').filter({ hasText: new RegExp(`^${name}$`) }).click();
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const role of ['huvudman', 'rektor', 'administrator']) test(`start visar relevanta uppgifter för ${role}`, async ({ page, isMobile }, info) => {
  const verify = await mockApp(page, role);
  await page.goto(base);
  await expect(page.getByRole('heading', { name: 'Vad vill du arbeta med?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Hitta en elev/ })).toHaveCount(role === 'huvudman' ? 0 : 1);
  await expect(page.getByRole('button', { name: /Hantera uppdrag/ })).toHaveCount(role === 'administrator' ? 0 : 1);
  await fits(page);
  if (role === 'rektor') await page.screenshot({ path: info.outputPath('start.png'), fullPage: true });
  await page.getByRole('button', { name: /Planera läsåret/ }).click();
  await expect(page.getByRole('heading', { name: 'Läsårsöverblick 2026/27' })).toBeVisible();
  await menu(page, 'Start', isMobile);
  await expect(page.getByRole('heading', { name: 'Vad vill du arbeta med?' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Vad vill du arbeta med?' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Läsårsöverblick 2026/27' })).toBeVisible();
  verify();
});

test('filter, direktlänk, återställning och Tillbaka behåller tydliga urval', async ({ page }, info) => {
  const verify = await mockApp(page);
  await page.goto(`${base}?vy=programplaner&planeringsskola=all&planeringsstatus=utkast&planeringsarskurs=1`);
  await expect(page.locator('.plan-list-count')).toContainText('2 träffar');
  await expect(page.getByRole('button', { name: 'Fler filter (2)' })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.plan-filter-summary')).toContainText('åk 1 · utkast');
  await expect(page.getByRole('combobox', { name: 'Planstatus', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Fler filter (2)' }).click();
  await page.getByRole('combobox', { name: 'Årskurs', exact: true }).selectOption('2');
  await expect(page.getByText('Inget underlag matchar valen.', { exact: false })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Årskurs', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.locator('.plan-list-count')).toContainText('2 träffar');
  await expect(page.locator('.plan-filter-summary')).toContainText('åk 1');
  await page.getByLabel('Sök utbildning').fill('Saknas');
  await page.getByRole('button', { name: 'Rensa filter' }).click();
  await expect(page.getByLabel('Sök utbildning')).toHaveValue('');
  await expect(page.locator('.plan-list-count')).toContainText('2 träffar');
  await page.getByLabel('Sök utbildning').fill('SA1');
  await expect(page.locator('.plan-list-count')).toContainText('1 träff');
  await expect(page.locator('tbody')).toContainText('Exempelskolan Syd');
  const openButton = page.getByRole('button', { name: 'Öppna Samhällsvetenskap, Exempelskolan Syd, version 2', exact: true });
  const bounds = await openButton.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.getByRole('button', { name: 'Dölj filter', exact: true }).click();
  await fits(page);
  await page.screenshot({ path: info.outputPath('filtered-list.png'), fullPage: true });
  verify();
});

test('samma skolrad och version öppnas från tabell och telefonkort', async ({ page, isMobile }, info) => {
  const verify = await mockApp(page);
  await page.goto(`${base}?listHarness=1&vy=programplaner&planeringsskola=all`);
  await expect(page.locator('.plan-list-count')).toContainText('2 träffar');
  const row = page.locator('tbody tr').filter({ hasText: 'Exempelskolan Syd' });
  if (isMobile) {
    await expect(row.locator('[data-label="Planversion"]')).toBeHidden();
    await row.getByRole('button', { name: /Visa detaljer/ }).click();
    await expect(row.locator('[data-label="Planversion"]')).toHaveText('Version 2');
    await page.getByRole('combobox', { name: 'Sortera efter' }).selectOption('school');
    await expect(page.getByRole('combobox', { name: 'Sortera efter' })).toHaveValue('school');
    await page.getByRole('button', { name: 'Byt till fallande sortering' }).click();
    await expect(page.getByRole('button', { name: 'Byt till stigande sortering' })).toBeVisible();
  }
  const open = row.getByRole('button', { name: 'Öppna Samhällsvetenskap, Exempelskolan Syd, version 2', exact: true });
  const box = await open.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(page.getByTestId('opened-row')).toHaveText(JSON.stringify({ offeringId: id(11), unitId: id(3), plan: { id: id(21), version: 2, revision: 0, status: 'utkast' } }));
  await fits(page);
  await page.screenshot({ path: info.outputPath('plan-rows.png'), fullPage: true });
  verify();
});

test('elevfilter visas på begäran och sökord hamnar inte i adressen', async ({ page }, info) => {
  const verify = await mockApp(page);
  await page.goto(`${base}?vy=elever`);
  await expect(page.getByRole('heading', { name: 'Elever', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sök elever', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Utbildning', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Fler filter', exact: true }).click();
  await page.getByRole('combobox', { name: 'Årskurs', exact: true }).selectOption('2');
  await expect(page.getByRole('heading', { name: 'Inga elever matchar urvalet' })).toBeVisible();
  await page.getByRole('button', { name: 'Dölj filter (1)' }).click();
  await expect(page.locator('.pupil-filter-summary')).toContainText('Åk 2');
  await page.getByRole('button', { name: 'Rensa filter', exact: true }).click();
  await page.getByLabel('Sökord', { exact: true }).fill('Alfa');
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Exempelelev Alfa, öppna elevkortet' })).toBeVisible();
  expect(page.url()).not.toContain('Alfa');
  await fits(page);
  await page.screenshot({ path: info.outputPath('pupils.png'), fullPage: true });
  verify();
});

test('programrader visar skolans timplan och tydliga nästa steg', async ({ page }, info) => {
  const verify = await mockApp(page);
  await page.goto(`${base}?listHarness=1&programHarness=1&vy=programplaner&planeringsskola=all`);
  const north = page.locator('tbody tr').filter({ hasText: 'Exempelskolan Nord' });
  const south = page.locator('tbody tr').filter({ hasText: 'Exempelskolan Syd' });
  await expect(north.getByText('Timplan skapad', { exact: true })).toBeVisible();
  await expect(north.getByRole('button', { name: /^Skapa timplan/ })).toHaveCount(0);
  await expect(south.getByText('Ingen timplan', { exact: true })).toBeVisible();
  await south.getByRole('button', { name: /^Skapa timplan/ }).click();
  await expect(page.getByTestId('opened-row')).toHaveText(JSON.stringify({ action: 'create-time', unitId: id(3), offeringId: id(11), plan: { id: id(21), version: 2, revision: 0, status: 'utkast' }, timplan: null }));
  await north.getByRole('button', { name: /^Öppna timplan/ }).click();
  await expect(page.getByTestId('opened-row')).toContainText('"action":"open-time"');
  await expect(page.getByTestId('opened-row')).toContainText(id(90));
  await fits(page);
  await page.screenshot({ path: info.outputPath('program-status.png'), fullPage: true });
  verify();
});

test('huvudmannen ser befintlig timplan men får ingen skapaknapp', async ({ page }) => {
  const verify = await mockApp(page, 'huvudman');
  await page.goto(`${base}?vy=programplaner&planeringsskola=all`);
  await expect(page.getByText('Timplan skapad', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Skapa timplan/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Öppna timplan/ })).toBeVisible();
  await expect(page.getByText('Rektor eller skoladministratör skapar timplanen.', { exact: true })).toBeVisible();
  verify();
});
