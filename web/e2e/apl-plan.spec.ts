import { expect, test, type Page } from '@playwright/test';
import { aplContentHash, parseAplCommand, projectAplPlan, type AplPlan, type AplReadReply, type AplCommandReply } from '../lib/apl-plan';
import { parseGymTimplan as parseAnyGymTimplan, isGymTimplanV2, type GymTimplanLegacy as GymTimplan } from '../lib/gym-timplan';
import { parsePlanDecisionDetail } from '../lib/plan-decision';

// Simulated HTTP only: actual shell, parsers, journal, editor and navigation. No actual Worker/DB/IdP evidence.
const id = (n: number) => `5a170000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const firstRow = 'programmeSpecific:PEDG:1:PEDG1000X', secondRow = 'foundation:ENGE:1:ENGE1000X';
const base = '/e2e/fixtures/apl-plan-preview.html';
const url = (planId = id(1), unitId = id(3)) => `${base}?vy=timplaner&timplan=${planId}&timplansskola=${unitId}&timplansutbildning=${id(2)}&timplansversion=1&planeringslasar=2027&planeringsskola=${unitId}&planeringsform=gymnasium&planeringsallaar=1`;
function gym(planId = id(1), unitId = id(3)): GymTimplan {
  return parseGymTimplan({ id: planId, offeringId: id(2), unitId, schoolName: unitId === id(3) ? 'Exempelskolan Nord' : 'Exempelskolan Syd', version: 1, revision: 0, status: 'utkast',
    series: { id: planId === id(1) ? id(20) : id(21), name: planId === id(1) ? 'BF27A – pedagogik' : 'BF27B – grundfördelning', revision: 0 }, nameAtCreation: 'BF27',
    source: { planId: id(4), offeringId: id(2), version: 1, revision: 0, status: 'faststalld', catalogId: `sha256:${'a'.repeat(64)}`, startedOn: '2027-08-01', educationRevision: 0,
      education: { name: 'Barn- och fritidsprogrammet', cohort: '2027–2030', programCode: 'BF25', orientationCode: null } },
    currentSource: { planId: id(4), version: 1, revision: 0, status: 'faststalld' }, sourceChanged: false, archived: false, canPlan: true,
    rows: [{ key: firstRow, name: 'Pedagogik', levelName: 'Nivå 1', points: 200, part: 'programmeSpecific', pointTerms: [200,0,0,0,0,0], rowKind: 'fixed' },
      { key: secondRow, name: 'Engelska', levelName: 'Nivå 1', points: 100, part: 'foundation', pointTerms: [100,0,0,0,0,0], rowKind: 'fixed' }],
    hours: { [firstRow]: [400,null,null,null,null,null], [secondRow]: [100,null,null,null,null,null] } }, planId);
}
function planned(weeks = 15): AplPlan {
  return { contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'complete', periods: [{ id: id(30), name: 'APL på fritidshem', startsOn: '2027-08-16', endsOn: '2027-11-28', schoolYear: 2027,
    extent: { basis: 'whole_weeks', weeks, reviewed: true, reviewNote: 'Planerad heltid under hela perioden, granskad med ansvariga lärare.' },
    contents: [{ rowKey: firstRow, description: 'Planera och följa upp pedagogiska aktiviteter.' }], allocations: [{ rowKey: firstRow, termIndex: 0, gutMinutes: weeks * 23 * 60 }] }] };
}
type Mode = 'normal' | 'lost' | 'not_sent' | 'conflict' | 'revoked' | 'held';
async function mock(page: Page, options: { plan?: AplPlan | null; mode?: Mode; approved?: boolean; versionAllowed?: boolean; corrupt?: 'row' | 'term'; startedOn?: string | null; multipleTerms?: boolean } = {}) {
  const plans = new Map([[id(1), gym()], [id(11), gym(id(11))], [id(12), gym(id(12), id(13))]]);
  if (options.startedOn !== undefined) plans.get(id(1))!.source.startedOn = options.startedOn;
  if (options.startedOn === null) plans.get(id(1))!.source.catalogId = null;
  if (options.multipleTerms) { plans.get(id(1))!.rows[0].pointTerms = [100,100,0,0,0,0]; plans.get(id(1))!.hours[firstRow] = [400,400,null,null,null,null]; }
  let apl = options.plan === undefined ? null : options.plan, mode = options.mode ?? 'normal', attempt = 0;
  const confirmations: AplReadReply['confirmations'] = [], receipts = new Map<string, AplCommandReply>();
  const commands: unknown[] = [], rows: unknown[] = [], errors: string[] = [], unexpected: string[] = [], reads: string[] = [];
  let release: (() => void) | null = null;
  page.on('pageerror', error => errors.push(error.message));
  const program = { code: 'BF25', version: 1, category: 'VOCATIONAL_PROGRAM', startDate: '2025-07-01', endDate: null, canceledDate: null, sourceSupported: true };
  if (options.approved) { plans.get(id(1))!.status = 'faststalld'; plans.get(id(1))!.canPlan = false; }
  async function read(planId = id(1)): Promise<AplReadReply> {
    const plan = plans.get(planId)!; const value = planId === id(1) && apl ? structuredClone(apl) : null;
    if (value && options.corrupt === 'term') value.periods[0].allocations[0].termIndex = 1;
    if (value && options.corrupt === 'row') { value.periods[0].contents[0].rowKey = 'foundation:SVEN:1:SVEN1000X'; value.periods[0].allocations[0].rowKey = value.periods[0].contents[0].rowKey; }
    return { contractVersion: 'structured_v1', planId, revision: plan.revision, organizerId: id(5), program, plan: value, copyReview: [],
      contentHash: await aplContentHash({ organizerId: id(5), plan, program, copyReview: [] }, value), confirmations: structuredClone(confirmations), capabilities: { canSave: plan.status === 'utkast', canConfirm: plan.status === 'utkast' } };
  }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname, body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    const context = { assignmentId: id(6), membershipId: id(7), customerId: id(8), customerName: 'Exempelhuvudman', organizerId: id(5), organizerName: 'Exempelhuvudman', unitId: null, unitName: null, function: 'rektor', label: 'Rektor', blocked: false, valid: true };
    const assignment = { ...context, id: id(6), validFrom: '2026-01-01', validTo: null, endedAt: null, membershipStatus: 'active', state: 'giltigt' };
    let json: unknown;
    if (path === '/api/session') json = { identity: { issuer: 'synthetic-apl', subject: 'synthetic-rektor', displayName: 'Rektor Exempel', email: null }, assignments: [assignment], assignmentGroups: { valid: [assignment], upcoming: [], ended: [] }, context, today: '2026-10-16', mfa: { acr: null, amr: [], authTime: null, proof: false }, epoch: 1, expiresAt: '2099-01-01T00:00:00Z', correlationId: 'synthetic-apl' };
    else if (path === '/api/planering/urval') json = { customerId: id(8), serverDate: '2026-10-16', currentYear: 2026, minimumYear: 2000, maximumYear: 2100, units: [id(3),id(13)].map(unitId => ({ unitId, schoolName: unitId === id(3) ? 'Exempelskolan Nord' : 'Exempelskolan Syd', canRead: { programplan: true, gymnasium: true, grundskola: false, introduktionsprogram: false } })) };
    else if (path === '/api/elever/urval') json = { scope: { schools: [{ id: id(3), name: 'Exempelskolan Nord' }, { id: id(13), name: 'Exempelskolan Syd' }], groups: [], cases: [] }, schoolYears: [2026,2027,2028], currentSchoolYear: 2026, endsAt: null, approverName: null, purposeCode: null, serverNow: '2026-10-16T10:00:00Z' };
    else if (path === '/api/planbeslut/inkorg') json = { items: [], total: 0, actionCount: 0, decisionCount: 0, truncated: false };
    else if (path === '/api/timplaner/gym/lasa') { reads.push(`gym:${body.planId}`); json = plans.get(body.planId); }
    else if (path === '/api/timplaner/gym/underlag') { const p = plans.get(id(1))!; json = { source: p.source, rows: p.rows, readiness: { ready: true, missing: [] }, units: [{ unitId: p.unitId, schoolName: p.schoolName, canPlan: options.versionAllowed !== false, plans: [{ id: p.id, version: 1, revision: p.revision, status: p.status, series: p.series, sourcePlanId: p.source.planId, sourceVersion: 1, sourceRevision: 0 }] }] }; }
    else if (path === '/api/timplaner/gym/apl/lasa') { reads.push(`apl:${body.planId}`); json = await read(body.planId); }
    else if (path === '/api/planbeslut/underlag') {
      const plan = plans.get(body.planId)!, detail = await read(body.planId), projection = projectAplPlan({ organizerId: id(5), plan, program, copyReview: [] }, detail.plan);
      const current = detail.confirmations.at(-1)?.contentHash === detail.contentHash ? detail.confirmations.at(-1)!.id : null;
      const blockers = [...projection.issues.filter(i => i.level === 'blocker').map(i => i.message), ...(!current ? ['Rektor behöver bekräfta förläggningen.'] : [])];
      json = parsePlanDecisionDetail({ contractVersion: 'apl_decision_v1', kind: 'timplan', planId: plan.id, unitId: plan.unitId, offeringId: id(2), educationName: plan.source.education.name, schoolName: plan.schoolName, series: plan.series, version: 1, revision: plan.revision, decisionRevision: 0,
        stage: options.approved ? 'approved' : 'draft', nextActor: options.approved ? null : 'rektor', basisHash: detail.contentHash, actions: options.approved ? [] : ['submit'], blockers, checks: [{ id: 'apl', label: 'APL-underlaget är granskat' }], history: [], sourceInfo: 'Programplan version 1', apl: { detail, blockers, ready: blockers.length === 0, currentConfirmationId: current } }, { kind: 'timplan', planId: plan.id });
    } else if (path === '/api/timplaner/gym/apl/kommando') {
      const command = parseAplCommand(body); commands.push(command); attempt++;
      const stored = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('apl-plan:')).map(([,value]) => JSON.parse(value)));
      expect(stored.some(item => JSON.stringify(item.request) === JSON.stringify(command))).toBe(true);
      if (mode === 'revoked') return route.fulfill({ status: 403, json: { code: 'assignment_ended' } });
      if (mode === 'not_sent' && attempt === 1) return route.abort();
      if (mode === 'conflict' && attempt === 1) { plans.get(command.planId)!.revision++; plans.get(command.planId)!.hours[firstRow][0] = 350; return route.fulfill({ status: 409, json: { code: 'apl_conflict' } }); }
      if (mode === 'held') await new Promise<void>(resolve => { release = resolve; });
      let result = receipts.get(command.commandId);
      if (!result) {
        const plan = plans.get(command.planId)!; expect(command.expectedRevision).toBe(plan.revision); plan.revision++;
        if (command.action === 'save') apl = structuredClone(command.plan);
        else confirmations.push({ id: id(40), planId: plan.id, unitId: plan.unitId, actorId: id(41), assignmentId: id(6), actorName: 'Rektor Exempel', at: '2026-10-16T10:00:00.000Z', revision: plan.revision, contentHash: command.expectedContentHash, comment: command.comment });
        const detail = await read(command.planId);
        result = { receipt: { contractVersion: 'structured_v1', commandId: command.commandId, planId: plan.id, action: command.action, revision: plan.revision, changed: true, replayed: false, contentHash: detail.contentHash, confirmationId: command.action === 'confirm' ? id(40) : null }, detail };
        receipts.set(command.commandId, structuredClone(result));
      }
      if (mode === 'lost' && attempt === 1) return route.abort();
      json = result;
    } else if (path === '/api/timplaner/gym/apl/status') {
      const result = receipts.get(body.command.commandId);
      json = result ? { state: 'completed', result: { ...result, receipt: { ...result.receipt, replayed: true } } } : { state: 'not_found', result: null };
    } else if (path === '/api/timplaner/gym/rad') {
      rows.push(body); const plan = plans.get(body.planId)!; expect(body.expectedRevision).toBe(plan.revision); plan.revision++; plan.hours[body.rowKey] = body.hours;
      json = { id: plan.id, revision: plan.revision, rowKey: body.rowKey, hours: body.hours };
    } else if (path === '/api/planering/lista') json = { selection: body, selectionRevision: `sha256:${'b'.repeat(64)}`, count: 0, pageSize: 50, rows: [] };
    else { unexpected.push(path); return route.fulfill({ status: 500, json: { code: 'unexpected' } }); }
    await route.fulfill({ json, headers: { 'X-Context-Epoch': '1' } });
  });
  return { commands, rows, reads, plans, get apl() { return apl; }, async later() { plans.get(id(1))!.revision++; apl = planned(14); }, release() { mode = 'normal'; release?.(); }, verify() { expect(errors).toEqual([]); expect(unexpected).toEqual([]); } };
}
const editor = (page: Page) => page.getByRole('region', { name: 'APL-planering', exact: true });
async function open(page: Page) { await page.goto(url()); await expect(editor(page).getByRole('button', { name: 'Planera APL', exact: true })).toBeEnabled(); }
async function editName(page: Page, name = 'Ny APL-period') { await editor(page).getByRole('button', { name: 'Planera APL', exact: true }).click(); await editor(page).getByLabel('Periodens namn').fill(name); await editor(page).getByText('Datum och omfattning', { exact: true }).click(); await editor(page).getByText('Ämnesinnehåll och undervisningstid', { exact: true }).click(); }

test('APL-handledning går att läsa i låst plan utan att ändra underlaget', async ({ page }, info) => {
  const m = await mock(page, { plan: planned(), approved: true });
  await page.goto(url()); await expect(editor(page)).toContainText('Den här versionen är låst');
  const guide = editor(page).getByLabel('Handledning för APL');
  await guide.locator(':scope > summary').focus(); await page.keyboard.press('Enter');
  await expect(guide).toHaveAttribute('open', '');
  await expect(guide.getByText('Minst 15 veckor', { exact: true })).toBeVisible();
  await expect(guide).toContainText('inte elevens arbetsschema');
  await guide.getByText('3. Koppla innehåll och fördela timmar', { exact: true }).click();
  await expect(guide.locator('.apl-guide-example')).toBeVisible();
  await expect(guide.locator('.apl-guide-example')).toContainText('115 GUT-timmar');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await guide.locator('.apl-guide-facts').evaluate(node => node.scrollIntoView({ block: 'start' })); await page.screenshot({ path: info.outputPath('apl-guide-start.png') });
  await guide.locator('.apl-guide-example').evaluate(node => node.scrollIntoView({ block: 'start' })); await page.screenshot({ path: info.outputPath('apl-guide-planning.png') });
  await guide.getByText('5. Säkra arbetsplatsen och följ varje elev', { exact: true }).click();
  await expect(guide.getByText(/Dessa uppgifter registreras eller kontrolleras ännu inte här/)).toBeVisible();
  await guide.getByText('Andra upplägg och regelkällor', { exact: true }).click();
  await expect(guide.getByText(/mer än hälften av utbildningen/)).toBeVisible();
  const links = await guide.locator('a').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).href));
  expect(links.every(link => ['www.riksdagen.se', 'www.skolverket.se', 'www.av.se'].includes(new URL(link).hostname))).toBe(true);
  await guide.getByText(/Dessa uppgifter registreras eller kontrolleras ännu inte här/).evaluate(node => node.scrollIntoView({ block: 'start' })); await page.screenshot({ path: info.outputPath('apl-guide-responsibilities.png') });
  expect(m.commands).toHaveLength(0); m.verify();
});
async function save(page: Page) { await editor(page).getByRole('button', { name: 'Granska ändringar' }).click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('button', { name: 'Spara APL-plan', exact: true }).click(); }

test('äldre plan visar okänt APL, tomt underlag kan granskas och sparas utan att totaltiden ändras', async ({ page }, info) => {
  const m = await mock(page); await open(page); await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText('500 h'); await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText('Okänt');
  await editor(page).getByRole('button', { name: 'Planera APL' }).click(); await editor(page).getByText('Utbildningsform och granskning', { exact: true }).click(); await editor(page).getByRole('combobox', { name: 'Utbildningsform', exact: true }).selectOption('school_based');
  await editor(page).getByRole('button', { name: 'Granska ändringar' }).click(); await expect(page.getByRole('dialog')).toContainText('Tidigare fördelning var okänd'); await expect(page.getByRole('dialog').getByLabel('Efter ändringen')).toContainText('500 h');
  await page.getByRole('button', { name: 'Spara APL-plan', exact: true }).click(); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.plans.get(id(1))!.hours[firstRow][0]).toBe(400); expect(m.rows).toEqual([]);
  await page.reload(); await expect(editor(page)).toContainText('Sparat planeringsunderlag'); await expect(editor(page).getByRole('button', { name: 'Bekräfta förläggningen', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('apl-legacy-empty.png'), fullPage: true }); m.verify();
});

for (const weeks of [14,15]) test(`${weeks} granskade veckor och inkluderad tid ger rätt bekräftelseväg`, async ({ page }, info) => {
  const m = await mock(page, { plan: planned(weeks) }); await open(page); const button = editor(page).getByRole('button', { name: 'Bekräfta förläggningen', exact: true });
  await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText(`${weeks * 23} h`);
  if (weeks === 14) { await expect(button).toBeDisabled(); await editor(page).getByText(/visa vad som saknas/).click(); await expect(editor(page)).toContainText('15'); }
  else { await expect(button).toBeEnabled(); await button.click(); await page.getByLabel('Rektors kommentar').fill('Förläggningen är granskad med lärarna.'); await page.getByRole('dialog').getByRole('button', { name: 'Bekräfta förläggningen', exact: true }).click(); await expect(editor(page)).toContainText('Förläggningen är bekräftad av rektor.'); expect(m.commands).toHaveLength(1); }
  await page.screenshot({ path: info.outputPath(`apl-${weeks}-weeks.png`), fullPage: true }); m.verify();
});

test('flera ämnen delar samma tid; minuter, blandveckor och okänd återstod visas utan omräkning', async ({ page }, info) => {
  const m = await mock(page, { plan: planned() }); await open(page); await editName(page, 'APL med två ämnen');
  await editor(page).getByLabel('Lägg till ämnesinnehåll').selectOption(secondRow); await editor(page).getByLabel('Arbetsmoment').nth(1).fill('Samtala på engelska i verksamheten.');
  await editor(page).getByLabel('Pedagogik, Åk 1 HT, APL timmar', { exact: true }).fill('300'); await editor(page).getByLabel('Engelska, Åk 1 HT, APL timmar', { exact: true }).fill('45');
  await editor(page).getByLabel('Engelska, Åk 1 HT, APL minuter', { exact: true }).fill('1'); await editor(page).getByRole('combobox', { name: 'Omfattning', exact: true }).selectOption('mixed_weeks');
  await expect(editor(page).getByLabel('APL-planens aktuella inmatning')).toContainText('345 h 1 min'); await expect(editor(page).getByLabel('APL-planens aktuella inmatning')).toContainText('Okänt');
  await editor(page).getByRole('button', { name: 'Granska ändringar' }).click(); await expect(page.getByRole('dialog').locator('.apl-review-times')).toHaveAttribute('open', ''); await expect(page.getByRole('dialog').getByLabel('Efter ändringen')).toBeVisible(); await page.getByRole('button', { name: 'Spara APL-plan', exact: true }).click(); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.apl!.periods[0].contents).toHaveLength(2); expect(m.apl!.periods[0].extent.weeks).toBe(null);
  await expect(editor(page).getByRole('button', { name: 'Bekräfta förläggningen', exact: true })).toBeDisabled(); await page.screenshot({ path: info.outputPath('apl-mixed.png'), fullPage: true }); m.verify();
});

for (const mode of ['lost','not_sent','conflict'] as const) test(`sparåterhämtning ${mode} bevarar exakt begäran och gemensam revision`, async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode }); await open(page); await editName(page); await save(page);
  await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Läs om', exact: true })).toBeDisabled();
  if (mode === 'lost') { await page.reload(); await expect(editor(page)).toContainText('Ett tidigare sparförsök'); }
  await editor(page).getByRole('button', { name: 'Läs sparstatus' }).click();
  if (mode === 'not_sent') { await editor(page).getByRole('button', { name: 'Skicka samma sparförsök igen' }).click(); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.commands[1]).toEqual(m.commands[0]); }
  else if (mode === 'conflict') { await expect(editor(page)).toContainText('timplanen har ändrats'); await expect(editor(page).getByLabel('Periodens namn')).toHaveValue('Ny APL-period'); await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect((m.commands[1] as { expectedRevision: number }).expectedRevision).toBe(1); }
  else await expect(editor(page)).toContainText('APL-planen är sparad och återläst.');
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('apl-plan:')))).toHaveLength(0); m.verify();
});

test('äldre kvitto ersätter aldrig en senare sparad plan', async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode: 'lost' }); await open(page); await editName(page); await save(page); await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toBeEnabled();
  await m.later(); await editor(page).getByRole('button', { name: 'Läs sparstatus' }).click(); await expect(editor(page)).toContainText('En senare ändring finns också'); await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText('322 h'); expect(m.commands).toHaveLength(1); m.verify();
});

test('APL-utkast spärrar totaltimmar och beslut; avbryt öppnar den gemensamma timsparningen', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await open(page); await editName(page);
  await expect(page.locator('.gt-term-input')).toHaveCount(0); await expect(page.locator('.plan-decision-actions button')).toHaveCount(0);
  await editor(page).getByRole('button', { name: 'Avbryt ändringar' }).click(); const hours = page.locator('.gt-term-input').first(); await hours.fill('410');
  await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toBeDisabled(); await hours.press('Enter'); await expect(page.locator('.gt-save-state')).toHaveText('Allt sparat'); await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toBeEnabled();
  await editName(page); await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect((m.commands[0] as { expectedRevision: number }).expectedRevision).toBe(1); expect(m.rows).toHaveLength(1); m.verify();
});

test('allokering över totaltid ger rättningsväg och skickar inget', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await open(page); await editName(page); await editor(page).getByLabel('Pedagogik, Åk 1 HT, APL timmar', { exact: true }).fill('401');
  await editor(page).getByRole('button', { name: 'Granska ändringar' }).click(); await expect(editor(page).getByRole('alert').first()).toContainText('total tid'); expect(m.commands).toEqual([]); m.verify();
});

test('term planeras först och datum preciseras senare; tangentbord och mobilfält ryms', async ({ page }, info) => {
  const m = await mock(page); await open(page); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await editor(page).getByText('Utbildningsform och granskning', { exact: true }).click(); await editor(page).getByRole('combobox', { name: 'Utbildningsform', exact: true }).selectOption('school_based');
  await editor(page).getByRole('button', { name: 'Lägg till period' }).click(); await editor(page).getByLabel('Periodens namn').fill('Pröva yrket');
  await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('1'); await editor(page).getByLabel('Termin', { exact: true }).selectOption('HT');
  await editor(page).getByText('Datum och omfattning', { exact: true }).click();
  await editor(page).getByLabel('Startdatum', { exact: true }).fill('2027-08-16'); await editor(page).getByLabel('Slutdatum', { exact: true }).fill('2027-09-05');
  await editor(page).getByRole('combobox', { name: 'Periodens läsår', exact: true }).selectOption('2027'); await editor(page).getByRole('combobox', { name: 'Omfattning', exact: true }).selectOption('whole_weeks');
  await expect(editor(page).getByLabel('Uppgivna hela veckor')).toHaveValue(''); await editor(page).getByLabel('Uppgivna hela veckor').fill('3'); await editor(page).getByLabel('Underlag för omfattningen').fill('Tre hela veckor är planerade tillsammans med arbetsplatsen.');
  await editor(page).getByRole('checkbox', { name: 'Omfattningen är granskad mot underlaget' }).check(); await editor(page).getByText('Ämnesinnehåll och undervisningstid', { exact: true }).click(); await editor(page).getByLabel('Lägg till ämnesinnehåll').selectOption(firstRow); await editor(page).getByLabel('Arbetsmoment').fill('Pröva och planera pedagogiska aktiviteter.');
  const hours = editor(page).getByLabel('Pedagogik, Åk 1 HT, APL timmar', { exact: true }); await hours.fill('69'); await hours.focus(); await hours.press('Tab'); await expect(editor(page).getByLabel('Pedagogik, Åk 1 HT, APL minuter', { exact: true })).toBeFocused();
  const bounds = await editor(page).getByRole('button', { name: 'Granska ändringar' }).boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('apl-period-editor.png'), fullPage: true });
  await editor(page).getByLabel('Periodens namn').scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('apl-period-fields-viewport.png') });
  await editor(page).getByRole('button', { name: 'Granska ändringar' }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('apl-allocation-viewport.png') }); await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.apl!.periods[0]).toMatchObject({ startsOn: '2027-08-16', endsOn: '2027-09-05', schoolYear: 2027 }); m.verify();
});

test('osparad APL skyddas vid skolbyte, läsårsbyte och Tillbaka', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await page.goto(`${base}?vy=timplaner&planeringslasar=2027`);
  await expect(page.getByRole('heading', { name: 'Timplaner för gymnasiet' })).toBeVisible();
  await page.evaluate(target => { history.pushState(null, '', target); window.dispatchEvent(new PopStateEvent('popstate')); }, url());
  await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toBeEnabled(); await editName(page, 'Behåll mitt utkast');
  page.on('dialog', dialog => dialog.dismiss()); await page.getByRole('combobox', { name: 'Planeringsskola' }).selectOption(id(13)); await expect(page.getByRole('combobox', { name: 'Planeringsskola' })).toHaveValue(id(3));
  await page.getByRole('combobox', { name: 'Planeringsläsår' }).selectOption('2028'); await expect(page.getByRole('combobox', { name: 'Planeringsläsår' })).toHaveValue('2027');
  await page.goBack(); await expect(editor(page).getByLabel('Periodens namn')).toHaveValue('Behåll mitt utkast'); expect(new URL(page.url()).searchParams.get('timplan')).toBe(id(1));
  page.removeAllListeners('dialog'); await editor(page).getByRole('button', { name: 'Avbryt ändringar' }).click(); await page.getByRole('combobox', { name: 'Planeringsskola' }).selectOption(id(13));
  await expect(page.getByRole('heading', { name: 'Timplaner för gymnasiet' })).toBeVisible(); expect(new URL(page.url()).searchParams.get('planeringsskola')).toBe(id(13)); expect(m.commands).toEqual([]); m.verify();
});

test('pågående sparning spärrar skolbyte och läsår tills både APL och timplan har återlästs', async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode: 'held' }); await open(page); await editName(page); await save(page); await expect.poll(() => m.commands.length).toBe(1);
  await page.getByRole('combobox', { name: 'Planeringsskola' }).selectOption(id(13)); await expect(page.getByRole('combobox', { name: 'Planeringsskola' })).toHaveValue(id(3));
  await page.getByRole('combobox', { name: 'Planeringsläsår' }).selectOption('2028'); await expect(page.getByRole('combobox', { name: 'Planeringsläsår' })).toHaveValue('2027'); await expect(page.locator('.gt-term-input')).toHaveCount(0);
  const count = m.reads.length; m.release(); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.reads.slice(count)).toContain(`gym:${id(1)}`); expect(m.reads.slice(count)).toContain(`apl:${id(1)}`); m.verify();
});

test('två namngivna planer och annan skola läser inte varandras journal eller APL', async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode: 'lost' }); await open(page); await editName(page, 'Bevarat sparförsök A'); await save(page); await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toBeEnabled();
  await page.goto(url(id(11))); await expect(page.getByRole('heading', { name: 'BF27B – grundfördelning', exact: true })).toBeVisible(); await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toBeEnabled();
  await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toHaveCount(0); await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText('Okänt');
  await page.goto(url(id(12), id(13))); await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toBeEnabled(); await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toHaveCount(0);
  await page.goto(url()); await expect(editor(page)).toContainText('Ett tidigare sparförsök'); await editor(page).getByRole('button', { name: 'Läs sparstatus' }).click(); await expect(editor(page)).toContainText('APL-planen är sparad och återläst.'); expect(m.commands).toHaveLength(1); m.verify();
});

test('sessionslagring måste bekräfta journalen innan någon skrivning skickas', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await open(page); await editName(page);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('apl-plan:')) throw new DOMException('Blocked', 'SecurityError'); original.call(this, key, value); }; });
  await save(page); await expect(editor(page)).toContainText('Inget skickades.'); expect(m.commands).toEqual([]); m.verify();
});

test('indraget mandat under sparande stänger arbetsytan och bevarar det osäkra försöket', async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode: 'revoked' }); await open(page); await editName(page); await save(page); await expect(editor(page)).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('apl-plan:')))).toHaveLength(1); expect(m.commands).toHaveLength(1); m.verify();
});

test('fastställd version är läsbar med tydlig väg till en ny version', async ({ page }) => {
  const m = await mock(page, { plan: planned(), approved: true }); await page.goto(url()); await expect(editor(page)).toContainText('Skapa en ny version av timplanen'); await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toHaveCount(0); await expect(editor(page).getByLabel('Sparad APL-plan')).toContainText('345 h'); m.verify();
});

for (const allowed of [true, false]) test(`ny version återprövar skolans mandat när fastställda planens canPlan är false: ${allowed}`, async ({ page }) => {
  const m = await mock(page, { plan: planned(), approved: true, versionAllowed: allowed }); await page.goto(url()); await expect(editor(page)).toContainText('Skapa en ny version av timplanen');
  expect(m.plans.get(id(1))!.canPlan).toBe(false); await page.getByRole('button', { name: 'Skapa ny version', exact: true }).click();
  if (allowed) { await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByRole('dialog')).toContainText('version'); }
  else { await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('alert')).toContainText('Aktuellt underlag kunde inte hämtas'); }
  expect(m.commands).toEqual([]); m.verify();
});

for (const corrupt of ['row', 'term'] as const) test(`APL-svar med fel ${corrupt} släpps inte in som redigeringsunderlag`, async ({ page }) => {
  const m = await mock(page, { plan: planned(), corrupt }); await page.goto(url()); await expect(editor(page).getByRole('alert')).toContainText('APL-underlaget'); await expect(editor(page).getByRole('button', { name: 'Planera APL' })).toHaveCount(0); expect(m.commands).toEqual([]); m.verify();
});

test('återfunnen journal spärrar timmar även när APL-läsningen misslyckas efter omladdning', async ({ page }) => {
  const m = await mock(page, { plan: planned(), mode: 'lost' }); await open(page); await editName(page); await save(page); await expect(editor(page).getByRole('button', { name: 'Läs sparstatus' })).toBeEnabled();
  await page.route('**/api/timplaner/gym/apl/lasa', route => route.fulfill({ status: 503, json: { code: 'service_unavailable' } }), { times: 1 }); await page.reload();
  await expect(editor(page).getByRole('alert')).toContainText('APL-underlaget'); await expect(page.locator('.gt-term-input')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Läs om', exact: true })).toBeDisabled();
  await editor(page).getByRole('button', { name: 'Läs sparstatus' }).click(); await expect(editor(page)).toContainText('APL-planen är sparad och återläst.'); expect(m.commands).toHaveLength(1); m.verify();
});

for (const startedOn of ['2027-08-01', '2028-01-15', null]) test(`termval använder verifierad källa och avvisar okänd start: ${startedOn}`, async ({ page }, info) => {
  const m = await mock(page, { startedOn });
  if (startedOn === null) { await page.goto(url()); await expect(page.getByRole('alert')).toContainText('Timplanen kunde inte hämtas'); await expect(editor(page)).toHaveCount(0); expect(m.commands).toEqual([]); m.verify(); return; }
  await open(page); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await editor(page).getByRole('button', { name: 'Lägg till period' }).click();
  await expect(editor(page).getByLabel('Startdatum', { exact: true })).not.toBeVisible();
  await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('2'); await editor(page).getByLabel('Termin', { exact: true }).selectOption('VT');
  if (startedOn === null) await expect(editor(page)).toContainText('Läsåret kan inte härledas');
  else await expect(editor(page).locator('.apl-derived-year')).toContainText('2028/2029');
  if (startedOn === '2028-01-15') await expect(editor(page)).toContainText('Utbildningen har vårstart');
  await editor(page).getByLabel('Årskurs', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`apl-term-first-${startedOn ?? 'unknown'}.png`) });
  await editor(page).getByRole('button', { name: 'Granska ändringar' }).click(); await expect(page.getByRole('dialog')).toContainText('Årskurs 2 · Vårtermin'); await expect(page.getByRole('dialog')).toContainText('Preliminär'); await expect(page.getByRole('dialog').locator('.apl-review-times')).not.toHaveAttribute('open', ''); await expect(page.getByRole('dialog').getByRole('button', { name: 'Spara APL-plan', exact: true })).toBeVisible(); await page.screenshot({ path: info.outputPath(`apl-term-review-${startedOn}.png`) });
  await page.getByRole('button', { name: 'Spara APL-plan', exact: true }).click(); await expect(editor(page)).toContainText('APL-planen är sparad.');
  const saved = structuredClone(m.apl!.periods[0]); expect(saved).toMatchObject({ name: '', plannedTermIndex: 3, schoolYear: startedOn === null ? null : 2028, startsOn: null, endsOn: null, contents: [], allocations: [], extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' } });
  await page.reload(); await expect(editor(page).getByRole('button', { name: 'Planera APL', exact: true })).toBeEnabled(); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await expect(editor(page).getByLabel('Årskurs', { exact: true })).toHaveValue('2'); await expect(editor(page).getByLabel('Termin', { exact: true })).toHaveValue('VT'); expect(m.apl!.periods[0]).toEqual(saved);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); m.verify();
});

test('äldre flerminperiod behålls vid omsparning och terminsbyte', async ({ page }) => {
  const old = planned(); old.periods[0].endsOn = '2028-03-01'; old.periods[0].allocations = [{ rowKey: firstRow, termIndex: 0, gutMinutes: 12000 }, { rowKey: firstRow, termIndex: 1, gutMinutes: 8700 }];
  const m = await mock(page, { plan: old, multipleTerms: true }); await open(page); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await expect(editor(page).getByLabel('Årskurs', { exact: true })).toHaveValue(''); await expect(editor(page).locator('.apl-saved-times')).toContainText('Åk 1 VT: 145 h');
  await editor(page).getByLabel('Periodens namn').fill('Tillfällig'); await editor(page).getByLabel('Periodens namn').fill(old.periods[0].name); await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.apl).toEqual(old);
  await editor(page).getByRole('button', { name: 'Planera APL' }).click(); await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('2'); await editor(page).getByLabel('Termin', { exact: true }).selectOption('HT');
  await expect(editor(page)).toContainText('Uppgifterna är kvar'); await expect(editor(page).locator('.apl-saved-times')).toContainText('Åk 1 HT: 200 h'); await expect(editor(page).locator('.apl-saved-times')).toContainText('Åk 1 VT: 145 h');
  await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.apl!.periods[0].allocations).toEqual(old.periods[0].allocations); expect(m.apl!.periods[0].startsOn).toBe(old.periods[0].startsOn); expect(m.apl!.periods[0].endsOn).toBe(old.periods[0].endsOn); expect(m.apl!.periods[0].plannedTermIndex).toBe(2); m.verify();
});

test('ofullständigt terminsval rättas och Avbryt lämnar inte ett dolt val', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await open(page); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('2'); await editor(page).getByRole('button', { name: 'Granska ändringar' }).click();
  await expect(editor(page).getByRole('alert').first()).toContainText('Välj både årskurs och termin'); expect(m.commands).toEqual([]);
  await editor(page).getByRole('button', { name: 'Avbryt ändringar' }).click(); await editor(page).getByRole('button', { name: 'Planera APL' }).click();
  await expect(editor(page).getByLabel('Årskurs', { exact: true })).toHaveValue(''); await expect(editor(page).getByLabel('Termin', { exact: true })).toHaveValue('');
  expect(m.apl!.periods[0]).not.toHaveProperty('plannedTermIndex'); m.verify();
});

test('nytt terminsval efter rektors bekräftelse kräver ny granskning', async ({ page }) => {
  const m = await mock(page, { plan: planned() }); await open(page);
  await editor(page).getByRole('button', { name: 'Bekräfta förläggningen', exact: true }).click(); await page.getByLabel('Rektors kommentar').fill('Kontrollerat med lärarna.'); await page.getByRole('dialog').getByRole('button', { name: 'Bekräfta förläggningen', exact: true }).click();
  await expect(editor(page).locator('.apl-state')).toHaveText('Förläggningen bekräftad');
  await editor(page).getByRole('button', { name: 'Planera APL' }).click(); await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('1'); await editor(page).getByLabel('Termin', { exact: true }).selectOption('HT'); await save(page);
  await expect(editor(page).locator('.apl-state')).toHaveText('Sparat planeringsunderlag'); await expect(editor(page).getByRole('button', { name: 'Bekräfta förläggningen', exact: true })).toBeEnabled(); expect(m.apl!.periods[0].plannedTermIndex).toBe(0); m.verify();
});


test('vald termin visas först och fler terminer kan öppnas utan att flytta tid', async ({ page }) => {
  const m = await mock(page, { multipleTerms: true }); await open(page); await editor(page).getByRole('button', { name: 'Planera APL' }).click(); await editor(page).getByRole('button', { name: 'Lägg till period' }).click();
  await editor(page).getByLabel('Årskurs', { exact: true }).selectOption('1'); await editor(page).getByLabel('Termin', { exact: true }).selectOption('HT'); await editor(page).getByText('Ämnesinnehåll och undervisningstid', { exact: true }).click(); await editor(page).getByLabel('Lägg till ämnesinnehåll').selectOption(firstRow);
  await expect(editor(page).getByLabel('Pedagogik, Åk 1 HT, APL timmar', { exact: true })).toBeVisible(); await expect(editor(page).getByLabel('Pedagogik, Åk 1 VT, APL timmar', { exact: true })).toHaveCount(0);
  await editor(page).getByLabel('Fördela även på andra terminer').check(); await editor(page).getByLabel('Pedagogik, Åk 1 VT, APL timmar', { exact: true }).fill('2'); await editor(page).getByLabel('Fördela även på andra terminer').uncheck();
  await expect(editor(page).getByLabel('Pedagogik, Åk 1 VT, APL timmar', { exact: true })).toBeVisible(); await expect(editor(page).locator('.apl-saved-times')).toContainText('Åk 1 VT: 2 h');
  await save(page); await expect(editor(page)).toContainText('APL-planen är sparad.'); expect(m.apl!.periods[0].plannedTermIndex).toBe(0); expect(m.apl!.periods[0].allocations).toEqual([{ rowKey: firstRow, termIndex: 1, gutMinutes: 120 }]); m.verify();
});

// These regression fixtures deliberately exercise the preserved legacy time model.
function parseGymTimplan(...args: Parameters<typeof parseAnyGymTimplan>) {
  const plan = parseAnyGymTimplan(...args);
  if (isGymTimplanV2(plan)) throw new Error("Expected a legacy fixture");
  return plan;
}
