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
    else if (path === '/api/planbeslut/inkorg') json = { items: [{ apl:null,series:role==='administrator'?{id:id(800),name:'Grundfördelning',revision:0}:null, kind: role === 'administrator' ? 'timplan' : 'programplan', planId: id(20), offeringId: id(10), unitId: role === 'administrator' ? id(2) : null, educationName: 'Plan att hantera', schoolName: role === 'administrator' ? schools[0].name : null, version: 1, stage: role === 'huvudman' ? 'submitted' : role === 'administrator' ? 'returned' : 'draft', nextActor: role === 'huvudman' ? 'huvudman' : 'rektor', task: role === 'huvudman' ? 'review' : role === 'administrator' ? 'revise' : 'prepare' }, {apl:null,series:null,kind: 'programplan', planId: id(99), offeringId: id(98), unitId: null, educationName: 'Arkiverad plan', schoolName: null, version: 1, stage: 'draft', nextActor: null, task: 'blocked'}], total: 2, actionCount: 1, decisionCount: role === 'huvudman' ? 1 : 0, truncated: false };
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
  return (expectedErrors: string[] = []) => { expect(unexpected).toEqual([]); expect(errors).toEqual(expectedErrors); };
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
  await expect(page.getByRole('button', { name: `Att göra: 1 uppgift, ${role === 'huvudman' ? 1 : 0} beslut` })).toBeVisible();
  await expect(page.getByRole('button', { name: role === 'huvudman' ? 'Granska och besluta' : role === 'administrator' ? 'Läs återkoppling och rätta' : 'Förbered beslut', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visa varför', exact: true })).toBeVisible();
  await expect(page.getByText('1 uppgift att arbeta vidare med', { exact: true })).toBeVisible();
  if (role === 'administrator') await expect(page.getByText('Tillbaka för rättning · Nästa steg hos rektor eller skoladministratör', { exact: true })).toBeVisible();
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
  await expect(page.locator('.plan-filter-summary')).toContainText('åk 1 · ej fastställda');
  await expect(page.getByRole('combobox', { name: 'Planstatus', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Fler filter (2)' }).click();
  await expect(page.getByRole('combobox', { name: 'Planstatus', exact: true }).getByRole('option', { name: 'Ej fastställda', exact: true })).toHaveAttribute('value', 'utkast');
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
  await expect(north.locator('.program-row-timplans')).toBeVisible();
  await expect(north.getByText('Ej fastställd · Öppna för beslutsstatus', { exact: true })).toBeVisible();
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
  await expect(page.locator('.program-row-timplans')).toBeVisible();
  await expect(page.getByText('Inväntar beslut · Nästa steg hos huvudmannen', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Granska och besluta om/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Skapa timplan/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Öppna timplan/ })).toBeVisible();
  await expect(page.getByText('Rektor eller skoladministratör skapar timplanen.', { exact: true })).toBeVisible();
  verify();
});


for (const kind of ['programplan', 'timplan'] as const) test(`${kind}: huvudmannen kommenterar och skickar tillbaka före fastställande`, async ({ page }, info) => {
  let stage = 'draft', revision = 0;
  const commands: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];
  // Historical decision-only flow; structured APL approval has its own suite.
  const detail = () => ({ contractVersion:'legacy', kind, planId: id(20), offeringId: id(10), unitId: kind === 'timplan' ? id(2) : null, educationName: 'Bygg- och anläggningsprogrammet', schoolName: kind === 'timplan' ? 'Exempelskolan Nord' : null,
    version: 1, revision, decisionRevision: revision, basisHash: `sha256:${'b'.repeat(64)}`, stage, nextActor: stage === 'approved' ? null : stage === 'submitted' ? 'huvudman' : 'rektor',
    actions: stage === 'approved' ? [] : stage === 'submitted' ? ['approve','return','withdraw'] : ['submit'], blockers: [], checks: [{ id: 'review', label: 'Jag har granskat ämnen och poäng.' }], history, sourceInfo: null });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/planbeslut/inkorg') return route.fulfill({ json: { items: [], total: 0, actionCount: 0, decisionCount: 0, truncated: false } });
    if (path === '/api/planbeslut/andra') {
      const command = route.request().postDataJSON(); commands.push(command);
      stage = command.action === 'submit' ? 'submitted' : command.action === 'return' ? 'returned' : command.action === 'approve' ? 'approved' : 'draft'; revision++;
      history.unshift({ action: command.action, at: '2026-10-12T12:00:00Z', actorName: 'Exempelhandläggare', comment: command.comment });
    }
    await route.fulfill({ json: detail() });
  });
  await page.goto(`${base}?decisionHarness=1&decisionKind=${kind}`);
  await expect(page.getByRole('button', { name: 'Skicka för beslut', exact: true })).toBeDisabled();
  await page.getByLabel('Jag har granskat ämnen och poäng.').check();
  await page.getByRole('button', { name: 'Skicka för beslut', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('1');
  await expect(page.getByRole('button', { name: 'Skicka tillbaka för rättning', exact: true })).toBeDisabled();
  await fits(page);
  await page.screenshot({ path: info.outputPath('decision-submitted.png'), fullPage: true });
  await page.getByRole('textbox', { name: /Kommentar/ }).fill('   ');
  await expect(page.getByRole('button', { name: 'Skicka tillbaka för rättning', exact: true })).toBeDisabled();
  await page.getByRole('textbox', { name: /Kommentar/ }).fill('Kontrollera poängfördelningen.\nFörtydliga APL-upplägget.');
  await page.getByRole('button', { name: 'Skicka tillbaka för rättning', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('2');
  const feedback = page.getByRole('region', { name: 'Återkoppling från huvudmannen' });
  await expect(feedback.getByRole('heading', { name: 'Det här behöver rättas' })).toBeVisible();
  await expect(page.locator('.plan-decision-heading')).toContainText(kind === 'programplan' ? 'Nästa steg hos rektor' : 'Nästa steg hos rektor eller skoladministratör');
  await expect(feedback).toContainText('Kontrollera poängfördelningen.');
  await expect(feedback).toContainText('Förtydliga APL-upplägget.');
  await expect(feedback).toContainText(kind === 'programplan' ? 'Rektor rättar' : 'Rektor eller skoladministratör rättar');
  await expect(page.getByText('Beslutshistorik (2)', { exact: true }).locator('..')).not.toHaveAttribute('open', '');
  expect(commands[1]).toMatchObject({ kind, action: 'return', comment: 'Kontrollera poängfördelningen.\nFörtydliga APL-upplägget.' });
  await fits(page);
  await page.screenshot({ path: info.outputPath('decision-returned-comment.png'), fullPage: true });
  await page.getByLabel('Jag har granskat ämnen och poäng.').check();
  await page.getByRole('button', { name: 'Skicka för beslut', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('3');
  await page.getByRole('textbox', { name: /Kommentar/ }).fill('Senaste återkopplingen: kontrollera sista terminen.');
  await page.getByRole('button', { name: 'Skicka tillbaka för rättning', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('4');
  await expect(feedback).toContainText('Senaste återkopplingen: kontrollera sista terminen.');
  await expect(feedback).not.toContainText('Förtydliga APL-upplägget.');
  await page.getByLabel('Jag har granskat ämnen och poäng.').check();
  await page.getByRole('button', { name: 'Skicka för beslut', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('5');
  await page.getByLabel('Jag har granskat ämnen och poäng.').check();
  await page.getByRole('button', { name: 'Fastställ planen', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(commands).toHaveLength(5);
  await page.getByRole('button', { name: 'Ja, fastställ planen', exact: true }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('6');
  await expect(page.getByText('Den här versionen är fastställd och låst.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fastställ planen', exact: true })).toHaveCount(0);
  await page.getByText('Beslutshistorik (6)', { exact: true }).click();
  await expect(page.locator('.decision-history')).toContainText('Förtydliga APL-upplägget.');
  await expect(page.getByRole('button', { name: 'Skicka tillbaka för rättning', exact: true })).toHaveCount(0);
  await fits(page);
  await page.screenshot({ path: info.outputPath('decision-approved.png'), fullPage: true });
});

test('okänt beslut låser navigation, återanvänder kommandot och läser nyare beslut efter återspelning', async ({ page }) => {
  const commands: Record<string, unknown>[] = [];
  const baseDetail = { contractVersion:'apl_decision_v1',apl:null,series:null, kind: 'programplan', planId: id(20), offeringId: id(10), unitId: null, educationName: 'Samhällsvetenskap', schoolName: null,
    version: 1, revision: 0, decisionRevision: 0, basisHash: `sha256:${'b'.repeat(64)}`, stage: 'draft', nextActor: 'huvudman', actions: ['submit'], blockers: [], checks: [], history: [], sourceInfo: null };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/planbeslut/inkorg') return route.fulfill({ json: { items: [], total: 0, actionCount: 0, decisionCount: 0, truncated: false } });
    if (path === '/api/planbeslut/andra') {
      commands.push(route.request().postDataJSON());
      if (commands.length === 1) return route.fulfill({ status: 503, json: { code: 'unavailable' } });
      return route.fulfill({ json: { ...baseDetail, stage: 'submitted', actions: ['withdraw'] } });
    }
    await route.fulfill({ json: commands.length ? { ...baseDetail, stage: 'approved', nextActor: null, actions: [] } : baseDetail });
  });
  await page.goto(`${base}?decisionHarness=1`);
  await page.getByRole('button', { name: 'Skicka för beslut', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lämna planen', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Kontrollera och försök igen' }).click();
  await expect(page.getByTestId('decision-changed')).toHaveText('1');
  expect(commands).toHaveLength(2); expect(commands[0]).toEqual(commands[1]);
  await expect(page.getByRole('button', { name: 'Lämna planen', exact: true })).toBeEnabled();
  await expect(page.getByText('Den här versionen är fastställd och låst.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ta tillbaka för ändring', exact: true })).toHaveCount(0);
});

for (const previousStatus of ['atersand', 'forslag'] as const) test(`korrigerad programkälla: ${previousStatus} timplan får rätt väg vidare`, async ({ page }) => {
  const verify = await mockApp(page);
  const series={id:id(92),name:'Grundfördelning',revision:0};
  const rowKey = 'foundation:ENGE:1:ENGE1000X';
  const source = { planId: id(30), offeringId: id(10), version: 2, revision: 1, status: 'utkast', catalogId: `sha256:${'c'.repeat(64)}`, startedOn: '2026-08-15', educationRevision: 2,
    education: { name: 'Korrigerad utbildning', cohort: '2026–2029', programCode: 'SA', orientationCode: 'SABEP' } };
  const rows = [{ key: rowKey, name: 'Engelska', levelName: 'Nivå 1', points: 100, part: 'foundation', pointTerms: [50, 50, 0, 0, 0, 0], rowKind: 'fixed' }];
  const currentSource = { planId: source.planId, version: source.version, revision: source.revision, status: source.status };
  const oldPlan = { series,nameAtCreation:series.name,id: id(90), offeringId: id(10), unitId: id(2), schoolName: schools[0].name, version: 1, revision: 3, status: previousStatus,
    source: { ...source, planId: id(20), version: 1 }, currentSource, rows, hours: { [rowKey]: [40, 40, null, null, null, null] }, canPlan: true, archived: false, sourceChanged: true };
  const newPlan = { ...oldPlan, id: id(91), version: 2, revision: 0, status: 'utkast', source, sourceChanged: false };
  const commands: Record<string, unknown>[] = [];
  await page.route('**/api/timplaner/gym/**', async route => {
    const path = new URL(route.request().url()).pathname, body = route.request().postDataJSON();
    if (path.endsWith('/underlag')) return route.fulfill({ json: { source, rows, readiness: { ready: true, missing: [] },
      units: [{ unitId: id(2), schoolName: schools[0].name, canPlan: true, plans: [{ series,id: id(90), version: 1, revision: 3, status: previousStatus, sourcePlanId: id(20), sourceRevision: 1, sourceVersion: 1 }] }] } });
    if (path.endsWith('/lasa')) return route.fulfill({ json: body.planId === id(90) ? oldPlan : newPlan });
    if (path.endsWith('/skapa')) {
      commands.push(body);
      return route.fulfill({ json: { id: id(91), offeringId: id(10), unitId: id(2), version: 2, revision: 0, sourcePlanId: id(30), sourceRevision: 1, replayed: false, carriedRows: 1, resetRows: 0 } });
    }
    return route.fulfill({ status: 500, json: { code: 'unexpected_request' } });
  });
  await page.route('**/api/planbeslut/underlag', route => route.fulfill({ json: { contractVersion:'apl_decision_v1',apl:null, kind: 'timplan', series,planId: route.request().postDataJSON().planId, offeringId: id(10), unitId: id(2), educationName: source.education.name, schoolName: schools[0].name,
    version: route.request().postDataJSON().planId===id(90)?1:2, revision: route.request().postDataJSON().planId===id(90)?3:0, decisionRevision: 0, basisHash: `sha256:${'d'.repeat(64)}`, stage: 'draft', nextActor: 'rektor', actions: ['submit'], blockers: [], checks: [], history: [], sourceInfo: null } }));
  await page.goto(`${base}?vy=timplaner&timplan=${id(90)}&timplansskola=${id(2)}&timplansutbildning=${id(10)}&timplansversion=1&planeringsskola=${id(2)}&planeringsform=gymnasium`);
  const next = page.getByRole('button', { name: 'Skapa ny version', exact: true });
  if (previousStatus === 'forslag') {
    await expect(next).toHaveCount(0); expect(commands).toHaveLength(0); verify(); return;
  }
  await expect(next).toBeEnabled(); await next.click();
  await expect(page.getByRole('dialog')).toContainText('Tidigare versioner och klasskopplingar bevaras.');
  await page.getByRole('dialog').getByRole('button', { name: 'Granska', exact: true }).click();
  await page.getByRole('button',{name:'Bekräfta och spara',exact:true}).click();
  await expect(page.getByText('Utkast · Timplan version 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skicka för beslut', exact: true })).toBeEnabled();
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ sourcePlanId: id(30), expectedSourceRevision: 1, unitId: id(2), predecessorPlanId: id(90), expectedPredecessorRevision: 3 });
  await fits(page); verify();
});

test('huvudmannen inväntar rättning efter retur av båda plantyperna', async ({ page }) => {
  const verify = await mockApp(page, 'huvudman');
  await page.route('**/api/planbeslut/inkorg', route => route.fulfill({ json: {
    items: ['programplan', 'timplan'].map((kind, n) => ({ apl:null,series:kind==='timplan'?{id:id(810+n),name:'Grundfördelning',revision:0}:null, kind, planId: id(70+n), offeringId: id(10),
      unitId: kind === 'timplan' ? id(2) : null, schoolName: kind === 'timplan' ? schools[0].name : null,
      educationName: 'Barn- och fritidsprogrammet', version: 1, stage: 'returned', nextActor: 'rektor', task: 'waiting' })),
    total: 2, actionCount: 0, decisionCount: 0, truncated: false,
  } }));
  await page.goto(base);
  await expect(page.getByRole('button', { name: 'Att göra: 0 uppgifter, 0 beslut' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inväntar rättning', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Inväntar beslut', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Granska och besluta', exact: true })).toHaveCount(0);
  await expect(page.getByText('Tillbaka för rättning · Nästa steg hos rektor', { exact: true })).toBeVisible();
  await expect(page.getByText('Tillbaka för rättning · Nästa steg hos rektor eller skoladministratör', { exact: true })).toBeVisible();
  await fits(page); verify();
});

// Real workspace components with isolated transport; retain input focus and grid state.
for (const outcome of ['saved', 'conflict', 'decision-read-failed'] as const) test(`programplan redigeras utan omladdning: ${outcome}`, async ({ page }, info) => {
  const verify = await mockApp(page);
  const artifact = (await import('../lib/programplan-catalog.generated.json', { with: { type: 'json' } })).default;
  const { defaultProgramplanChoiceBlocks } = await import('../lib/programplan-choice-blocks');
  const program = artifact.programs.find(p => p.code === 'ES25')!;
  const orientationCode = program.orientations[0].code;
  let planRevision = 0, terms: { rowKey: string; points: number[] }[] = [];
  let refs: {subjectCode:string;subjectVersion:number;itemCode:string;points:number}[] = [];
  let decisions = 0, reads = 0, termReads = 0, writes = 0;
  const basis = () => ({catalogId:artifact.catalogId,programRef:{code:program.code,version:program.version},orientationCode,startedOn:'2027-08-15',specializationRefs:refs,choiceBlocks:defaultProgramplanChoiceBlocks(program,orientationCode)});
  const education = {name:'Redigerbar programplan',cohort:'2027–2030',programCode:program.code,orientationCode};
  const plan = () => ({id:id(20),offeringId:id(10),unitId:id(2),schoolName:schools[0].name,education,version:1,revision:planRevision,status:'utkast',decidedOn:null,catalogId:artifact.catalogId,basisReference:basis(),resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[],decisionReady:false}});
  await page.route('**/api/programplaner/underlag', async route => {
    reads++;const p=plan();
    const selected=route.request().postDataJSON().catalogId!==null;
    const codes=new Set([...program.foundation,...program.programmeSpecific,...program.orientations.flatMap(o=>o.subjects),...program.specialization].filter(s=>s.subjectVersion!==null).map(s=>s.code));
    await route.fulfill({json:{education:{id:id(10),unitId:id(2),schoolName:schools[0].name,kind:'gymnasium',...education,localCode:null,startYear:2027,status:'planerad',latestVersion:1,draftId:id(20)},
      lifecycle:{phase:'framtida',startsOn:'2027-08-15',archived:false,revision:0,units:[{...schools[0],primary:true,inMandate:true}]},
      versions:[{id:p.id,version:1,revision:p.revision,status:p.status,decidedOn:null,catalogId:p.catalogId,basisReference:p.basisReference,legacySpecialization:null}],versionCount:1,versionPage:1,pageSize:50,
      catalogs:[{catalogId:artifact.catalogId,source:artifact.source}],catalog:selected?{status:'selected',catalogId:artifact.catalogId,diagnostic:null,source:artifact.source,program,subjects:artifact.subjects.filter(s=>codes.has(s.code))}:{status:'unselected',catalogId:null,diagnostic:null,source:null,program:null,subjects:[]},decisionReady:false}});
  });
  await page.route('**/api/programplaner/lasa',route=>route.fulfill({json:plan()}));
  await page.route('**/api/programplaner/terminer/lasa',route=>{termReads++;return route.fulfill({json:{planId:id(20),revision:planRevision,status:'utkast',distribution:terms}});});
  await page.route('**/api/programplaner/terminer',async route=>{
    writes++;const body=route.request().postDataJSON();expect(body.expectedRevision).toBe(planRevision);
    if(outcome==='conflict')return route.fulfill({status:409,json:{code:'conflict',message:'Planen har ändrats.'}});
    terms=body.distribution;planRevision++;
    await route.fulfill({json:{planId:id(20),revision:planRevision,status:'utkast',distribution:terms}});
  });
  await page.route('**/api/programplaner/fordjupning',route=>{const body=route.request().postDataJSON();expect(body.expectedRevision).toBe(planRevision);refs=body.specializationRefs;planRevision++;return route.fulfill({json:plan()});});
  let releaseRead: (()=>void)|undefined;
  await page.route('**/api/planbeslut/underlag',async route=>{
    decisions++;
    if(decisions>1)await new Promise<void>(resolve=>{releaseRead=resolve;});
    if(outcome==='decision-read-failed'&&decisions>1)return route.fulfill({status:503,json:{code:'unavailable'}});
    await route.fulfill({json:{contractVersion:'apl_decision_v1',apl:null,series:null,kind:'programplan',planId:id(20),offeringId:id(10),unitId:null,educationName:education.name,schoolName:null,version:1,revision:planRevision,decisionRevision:0,basisHash:`sha256:${'b'.repeat(64)}`,stage:'draft',nextActor:'rektor',actions:['submit'],blockers:[],checks:[],history:[],sourceInfo:null}});
  });
  await page.goto(`${base}?vy=programplaner&utbildning=${id(10)}&programplan=${id(20)}&programplansversion=1&planeringsskola=${id(2)}&planeringslasar=2027&planeringsallaar=1`);
  const workspace=page.getByTestId('protected-programplan-workspace');
  const board=workspace.getByRole('region',{name:'Programplanen',exact:true});
  const cell=board.locator('input[data-term="0"]').first();
  await expect(cell).toBeEnabled();
  const initialReads=reads,initialTerms=termReads;
  await cell.focus();await cell.pressSequentially('25',{delay:100});
  await expect(cell).toBeFocused();await expect(cell).toHaveValue('25');
  expect(decisions).toBe(1);expect(writes).toBe(0);expect(reads).toBe(initialReads);
  const next=board.locator('input[data-term="0"]').nth(1);
  await next.focus();
  if(outcome==='conflict'){
    await expect(board).toContainText('Någon annan har ändrat planen');await expect(cell).toHaveValue('25');expect(decisions).toBe(1);verify(['Failed to load resource: the server responded with a status of 409 (Conflict)']);return;
  }
  await expect.poll(()=>decisions).toBe(2);
  await expect(next).toBeFocused();await expect(next).toBeEnabled();
  await expect(workspace.getByRole('button',{name:'Skicka för beslut',exact:true})).toBeDisabled();
  expect(reads).toBe(initialReads);expect(termReads).toBe(initialTerms);
  releaseRead!();
  if(outcome==='decision-read-failed'){
    await expect(workspace).toContainText('Beslutsunderlaget kunde inte hämtas');
    await expect(board.locator('input[data-term="0"]')).toHaveCount(0);verify(['Failed to load resource: the server responded with a status of 503 (Service Unavailable)']);return;
  }
  await expect(workspace.getByRole('button',{name:'Skicka för beslut',exact:true})).toBeEnabled();
  await board.evaluate(el=>{el.setAttribute('data-retained','yes');});
  const search=board.getByRole('searchbox',{name:'Lägg till ämne eller nivå'});
  await search.fill('ANIM');
  await board.locator('button[data-level-code="ANIM1000X"]').click();
  await expect.poll(()=>decisions).toBeGreaterThan(2);
  releaseRead!();
  await expect(search).toBeEnabled();await expect(search).toHaveValue('ANIM');
  await expect(board).toHaveAttribute('data-retained','yes');
  await expect(board.getByRole('button',{name:'Ta bort ANIM1000X',exact:true})).toBeVisible();
  expect(termReads).toBe(initialTerms+1);
  await fits(page);await page.screenshot({path:info.outputPath('programplan-edit-retained.png'),fullPage:true});verify();
});

for (const role of ['huvudman','rektor','administrator']) test(`beslutsinkorg söker och bläddrar genom fler än 500 uppgifter: ${role}`, async ({page}, info) => {
  const verify=await mockApp(page,role);
  const items=Array.from({length:520},(_,i)=>({apl:null,series:role==='administrator'?{id:id(5000+i),name:'Grundfördelning',revision:0}:null,kind:role==='administrator'?'timplan':'programplan',planId:id(2000+i),offeringId:id(3000+i),unitId:role==='administrator'?id(2):null,
    schoolName:role==='administrator'?schools[0].name:null,educationName:`Syntetisk uppgift ${String(i).padStart(4,'0')}`,version:1,
    stage:i<260?(role==='huvudman'?'submitted':'returned'):(role==='huvudman'?'returned':'submitted'),nextActor:i<260?(role==='huvudman'?'huvudman':'rektor'):(role==='huvudman'?'rektor':'huvudman'),
    task:i<260?(role==='huvudman'?'review':'revise'):'waiting'}));
  await page.route('**/api/planbeslut/inkorg',route=>route.fulfill({json:{items:items.slice(0,500),total:520,actionCount:260,decisionCount:role==='huvudman'?260:0,truncated:true}}));
  await page.route('**/api/planbeslut/lista',async route=>{
    const selection=route.request().postDataJSON();
    const found=items.filter(item=>(selection.kind==='all'||item.kind===selection.kind)&&(selection.stage==='all'||item.stage===selection.stage)
      &&(selection.tasks==='all'||(selection.tasks==='mine')===(item.task!=='waiting'))&&item.educationName.toLowerCase().includes(selection.query.toLowerCase()));
    await route.fulfill({json:{selection,items:found.slice((selection.page-1)*50,selection.page*50),actionCount:260,decisionCount:role==='huvudman'?260:0,total:520,count:found.length,pageSize:50}});
  });
  await page.goto(base);
  const inbox=page.getByRole('region',{name:'Dina uppgifter och beslut'});
  await expect(inbox).toContainText('Sida 1 av 11');await expect(inbox).toContainText('Syntetisk uppgift 0049');
  await inbox.getByRole('button',{name:'Nästa sida',exact:true}).click();await expect(inbox).toContainText('Sida 2 av 11');await expect(inbox).toContainText('Syntetisk uppgift 0050');
  await inbox.getByRole('searchbox',{name:'Sök uppgift'}).fill('0519');await inbox.getByRole('button',{name:'Sök',exact:true}).click();
  await expect(inbox).toContainText('Syntetisk uppgift 0519');await expect(inbox).toContainText('1 träff');await expect(page.getByRole('button',{name:new RegExp('Att göra: 260')})).toBeVisible();
  await inbox.getByRole('combobox',{name:'Uppgifter',exact:true}).selectOption('mine');await expect(inbox).toContainText('0 träffar');
  await inbox.getByRole('button',{name:'Rensa filter',exact:true}).click();await expect(inbox).toContainText('Sida 1 av 11');
  await inbox.getByRole('combobox',{name:'Beslutsskede'}).selectOption('returned');await expect(inbox).toContainText('260 träffar');
  await page.screenshot({path:info.outputPath(`decision-search-${role}.png`),fullPage:true});verify();
});

test('programlistan filtrerar inskickat och återsänt utan att ändra utkastets planstatus',async({page})=>{
 const verify=await mockApp(page);
 await page.route('**/api/planering/lista',async route=>{
  const selected=route.request().postDataJSON(), stage=selected.status==='forslag'?'submitted':selected.status==='atersand'?'returned':'draft';
  const rows=rowsFor({...selected,status:'all'}).map(row=>({...row,plan:row.plan?{...row.plan,decisionStage:stage}:null}));
  await route.fulfill({json:{selection:selected,selectionRevision:revision,count:rows.length,pageSize:50,rows}});
 });
 await page.goto(`${base}?vy=programplaner`);await page.getByRole('button',{name:'Fler filter',exact:true}).click();
 await page.getByRole('combobox',{name:'Planstatus',exact:true}).selectOption('forslag');
 await expect(page).toHaveURL(/planeringsstatus=forslag/);await expect(page.getByRole('region',{name:'Alla programplaner'})).toContainText('Inväntar beslut');
 await page.getByRole('combobox',{name:'Planstatus',exact:true}).selectOption('atersand');
 await expect(page).toHaveURL(/planeringsstatus=atersand/);await expect(page.getByRole('region',{name:'Alla programplaner'})).toContainText('Tillbaka för rättning');verify();
});
