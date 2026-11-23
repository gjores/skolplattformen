// SM-FORTSATT: användarbeteende i produktens workspace mot uttryckligt simulerade API-rutter.
// Detta bevisar UI, autosave och ångring; faktisk motortransport och servermandat prövas separat.
import { test, expect, schemaTestDraft, type Page, type SchemaDraftTestServer } from './schema-test';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaForslagRequest, type SchemaKontroll, type SchemaKontrollRequest, type SchemaPlacement } from '../lib/schema-contract.ts';
import { parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { schemaDatumOriginal } from '../lib/schema-datum.ts';
import { schemaWeekday } from '../lib/schema-vecka.ts';
import proposal from './schema-fixture';

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const source = proposal as unknown as SchemaForslag, draftKey = `${source.unitId}:2026:lasar`;
const parked = source.lessons.at(-1)!.id;
const placements = (f: SchemaForslag): SchemaPlacement[] => f.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
const panel = (page: Page) => page.locator('[data-schema-continue-panel]');
const berakning = (page: Page) => page.getByRole('button', { name: 'Beräkning', exact: true });
type ContinueRequest = SchemaKontrollRequest & { solveTimeMs: number };
type Outcome = 'improve' | 'same' | 'fewer' | 'rule' | 'time' | 'error';

function withPlacements(f: SchemaForslag, at: SchemaPlacement[], body: SchemaForslagRequest): SchemaForslag {
  const wanted = new Map(at.map(p => [p.lesson, p]));
  return { ...structuredClone(f), unitId: body.unitId, schoolYear: body.schoolYear, period: body.period, villkor: body.villkor,
    ...(body.locks ? { locks: body.locks.placements } : {}),
    lessons: f.lessons.map(l => { const p = wanted.get(l.id); return { ...l, day: p?.day ?? null, startMin: p?.startMin ?? null, roomId: p?.room ?? null }; }),
    metrics: { ...f.metrics, placed: at.length, unplaced: f.lessons.length - at.length }, elapsedMs: 30_000,
    status: at.length < f.lessons.length ? 'time_limit' : 'complete' };
}
function checked(f: SchemaForslag, at: SchemaPlacement[], total = 0): SchemaKontroll {
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, fingerprint: f.fingerprint,
    violations: total ? [{ code: 'teacher_clash', message: 'Syntetisk lärarkrock.', lessons: [at[0].lesson] }] : [], total,
    teachings: f.teachings, trims: f.trims, metrics: { ...f.metrics, placed: at.length, unplaced: f.lessons.length - at.length },
    rooms: Object.fromEntries(at.filter(p => p.room).map(p => [p.lesson, p.room!])) };
}
async function setup(page: Page) {
  const state = { outcome: 'improve' as Outcome, delay: 0, initial: [] as (SchemaForslagRequest & { solveTimeMs: number })[], continues: [] as ContinueRequest[], checks: [] as SchemaKontrollRequest[], last: null as SchemaForslag | null };
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON(); state.initial.push(body);
    const f = withPlacements(source, placements(source).filter(p => p.lesson !== parked), body); state.last = f;
    return route.fulfill({ headers, json: f });
  });
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON(); state.checks.push(body);
    return route.fulfill({ headers, json: checked(state.last ?? source, body.placements) });
  });
  await page.route('**/api/schema/fortsatt', async route => {
    const body = route.request().postDataJSON() as ContinueRequest; state.continues.push(body);
    const outcome = state.outcome;
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (outcome === 'error') return route.fulfill({ headers, status: 503, json: { code: 'schema_engine_unavailable', details: { reason: 'schema_engine_unreachable' } } });
    const at = structuredClone(body.placements), locked = new Set(body.locks?.placements.map(p => p.lesson) ?? []);
    if (outcome === 'improve' || outcome === 'rule' || outcome === 'time') {
      const restore = placements(source).find(p => p.lesson === parked && !at.some(x => x.lesson === p.lesson));
      if (restore) at.push(restore);
      const move = at.find(p => !locked.has(p.lesson) && source.lessons.find(l => l.id === p.lesson)?.classIds.includes(source.classes[0].id));
      if (move) move.startMin += 5;
    }
    if (outcome === 'fewer') at.splice(at.findIndex(p => !locked.has(p.lesson)), 1);
    const f = withPlacements(source, at, body), before = checked(source, body.placements), after = checked(f, at, outcome === 'rule' ? 1 : 0);
    if (outcome === 'time') {
      after.teachings = structuredClone(after.teachings);
      after.teachings[0].deviation = 'calendar';
      f.teachings = after.teachings;
    }
    state.last = f;
    return route.fulfill({ headers, json: { forslag: f, before, after } }).catch(() => {});
  });
  await page.route('**/api/schema/datum', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint, fingerprint: source.fingerprint,
      datedOverrides: body.datedOverrides,
      checkedDates: [...new Set([...body.dates, ...body.datedOverrides.flatMap((a: { originalDate: string; date: string }) => [a.originalDate, a.date])])].sort(),
      violations: [], total: 0, timeChanges: [] } });
  });
  return state;
}
async function start(page: Page) {
  const state = await setup(page); await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await berakning(page).click();
  await expect(page.getByRole('button', { name: 'Fortsätt förbättra', exact: true })).toBeVisible();
  return state;
}
async function saved(server: SchemaDraftTestServer, expected: SchemaPlacement[]) {
  await expect.poll(() => server.drafts.get(draftKey)?.placements).toEqual(expected);
}

test('räknetid har förval 30 sekunder och valt värde går till första beräkningen', async ({ page }) => {
  const state = await setup(page); await page.goto(URL);
  await page.getByRole('button', { name: 'Beräkningsval', exact: true }).click();
  const budget = page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true });
  await expect(budget).toHaveValue('30000');
  await expect(budget.locator('option')).toHaveText(['10 sekunder', '30 sekunder', '60 sekunder']);
  await budget.selectOption('60000');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(berakning(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(budget).toBeHidden();
  await berakning(page).click();
  await expect(page.getByRole('button', { name: 'Fortsätt förbättra', exact: true })).toBeVisible();
  expect(state.initial[0].solveTimeMs).toBe(60_000);
  await expect(page.getByText('Förslag · Mer räknetid kan behövas', { exact: true })).toBeVisible();
  await expect(page.getByText(/Motorn slutade söka/iu)).toBeVisible();
});

test('fortsättning granskas före ändring och kan användas, ångras och göras om i ett steg', async ({ page, schemaDraftServer: server }, info) => {
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  await page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true }).selectOption('60000');
  const trigger = page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }); await trigger.focus(); await page.keyboard.press('Enter');
  await expect(panel(page)).toBeVisible();
  expect(state.initial).toHaveLength(1); expect(state.continues[0].solveTimeMs).toBe(60_000); expect(state.continues[0].placements).toEqual(original);
  expect(server.drafts.get(draftKey)?.placements).toEqual(original);
  await expect(panel(page).getByRole('columnheader', { name: 'Från', exact: true })).toBeVisible();
  await expect(panel(page).getByRole('columnheader', { name: 'Till', exact: true })).toBeVisible();
  await expect(panel(page)).toContainText(/håltid/iu); await expect(panel(page)).toContainText(/regelavvikelser/iu);
  await expect(panel(page).getByRole('heading').first()).toBeFocused();
  const rubrik = await panel(page).getByRole('heading').first().boundingBox(), angra = await page.locator('.schema-undo').boundingBox();
  expect(rubrik!.y).toBeGreaterThanOrEqual(angra!.y + angra!.height);
  await page.screenshot({ path: info.outputPath('fortsatt-granskning.png'), fullPage: false });
  const candidate = placements(state.last!);
  await panel(page).getByRole('button', { name: 'Använd förslaget', exact: true }).click(); await saved(server, candidate);
  await expect(panel(page)).toHaveCount(0);
  await page.locator('.schema-undo').getByRole('button').first().click(); await saved(server, original);
  await page.getByRole('button', { name: 'Gör om', exact: true }).click(); await saved(server, candidate);
  await page.reload(); await berakning(page).click();
  await expect(page.getByRole('button', { name: 'Fortsätt förbättra', exact: true })).toBeVisible();
  expect(state.initial).toHaveLength(1); expect(state.continues).toHaveLength(1); expect(server.drafts.get(draftKey)?.placements).toEqual(candidate);
});

test('behåll nuvarande schema lämnar både placeringar och sparat utkast kvar och återför fokus', async ({ page, schemaDraftServer: server }) => {
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  const trigger = page.getByRole('button', { name: 'Fortsätt förbättra', exact: true });
  await trigger.click(); await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  await expect(panel(page)).toHaveCount(0); await expect(trigger).toBeFocused();
  expect(server.drafts.get(draftKey)?.placements).toEqual(original);
});

test('fel från fortsatt beräkning lämnar det gamla schemat och låsen kvar', async ({ page, schemaDraftServer: server }) => {
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  await page.getByRole('button', { name: 'Lås klassens schema', exact: true }).click();
  await expect.poll(() => server.drafts.get(draftKey)?.locks.length ?? 0).toBeGreaterThan(0);
  const locks = server.drafts.get(draftKey)!.locks;
  state.outcome = 'error'; await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /Schemamotorn svarar inte/iu })).toBeVisible();
  expect(state.continues[0].locks?.placements).toEqual(locks);
  expect(server.drafts.get(draftKey)?.placements).toEqual(original); expect(server.drafts.get(draftKey)?.locks).toEqual(locks);
});

for (const [outcome, name] of [['fewer', 'färre lagda pass'], ['rule', 'fler regelavvikelser'], ['time', 'fler timplansavvikelser']] as const) {
  test(`försämring med ${name} kan inte skriva över det aktuella schemat`, async ({ page, schemaDraftServer: server }) => {
    const state = await start(page), original = placements(state.last!); await saved(server, original);
    state.outcome = outcome; await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole('button', { name: 'Använd förslaget', exact: true })).toBeDisabled();
    expect(server.drafts.get(draftKey)?.placements).toEqual(original);
  });
}

test('en granskad kandidat blir inaktuell efter nytt lås och kan inte godkännas', async ({ page, schemaDraftServer: server }) => {
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click(); await expect(panel(page)).toBeVisible();
  await page.getByRole('button', { name: 'Lås klassens schema', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Använd förslaget', exact: true })).toBeDisabled();
  await expect(panel(page)).toContainText(/ändrats|inaktuell/iu);
  expect(server.drafts.get(draftKey)?.placements).toEqual(original);
});

test('oförändrat resultat ger inget nytt ändringssteg och fortsatt beräkning fungerar med 200 procent text', async ({ page }, info) => {
  const state = await start(page); state.outcome = 'same';
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  const budget = page.getByRole('combobox', { name: 'Räknetid per omgång', exact: true });
  await budget.focus(); await budget.evaluate(el => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: info.outputPath('fortsatt-kontroller-200.png') });
  await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click(); await expect(panel(page)).toBeVisible();
  await expect(panel(page)).toContainText(/ingen.*ändr|oförändrat/iu);
  await expect(panel(page).getByRole('button', { name: 'Använd förslaget', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const rubrik = await panel(page).getByRole('heading').first().boundingBox(), angra = await page.locator('.schema-undo').boundingBox();
  expect(rubrik!.y).toBeGreaterThanOrEqual(angra!.y + angra!.height);
  await page.screenshot({ path: info.outputPath('fortsatt-200.png') });
});

test('handgjorda placeringar, lås och datumändringar används som utgångspunkt och överlever godkännande', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page), locked = 'pass-7', dated = source.lessons.find(l => l.id === 'pass-9')!;
  const original = placements(source).filter(p => p.lesson !== parked).map(p => p.lesson === locked ? { ...p, startMin: p.startMin + 10 } : p);
  const originalDate = source.time.calendar!.days.find(d => d.schoolDay && d.term === dated.term && schemaWeekday(d.date) === dated.day)!.date;
  const occurrence = schemaDatumOriginal(source, { lesson: dated.id, originalDate })!;
  const dates = [{ lesson: dated.id, originalDate, date: originalDate, startMin: dated.startMin! + 10, room: dated.roomId, durationMin: occurrence.length }];
  const input = parseSchemaDraftSave({ contractVersion: 1, unitId: source.unitId, schoolYear: 2026, period: 'lasar', commandId: crypto.randomUUID(), draftId: null,
    expectedRevision: 0, name: 'Handlagd utgångspunkt', basisVillkor: source.villkor, workingVillkor: source.villkor, grundFingerprint: source.grundFingerprint,
    placements: original, locks: [original.find(p => p.lesson === locked)!], intentional: [], datedOverrides: dates, activityTypes: [] });
  const { draft } = await schemaTestDraft(input, source); server.drafts.set(draftKey, draft);
  await page.goto(URL); await expect(page.getByRole('textbox', { name: 'Namn på utkastet', exact: true })).toHaveValue(input.name);
  await berakning(page).click();
  await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click(); await expect(panel(page)).toBeVisible();
  expect(state.initial).toHaveLength(0); expect(state.continues[0].placements).toEqual(original);
  expect(state.continues[0].locks?.placements).toEqual(expect.arrayContaining([original.find(p => p.lesson === locked)!, original.find(p => p.lesson === dated.id)!]));
  const candidate = placements(state.last!);
  expect(candidate.find(p => p.lesson === locked)).toEqual(original.find(p => p.lesson === locked));
  expect(candidate.find(p => p.lesson === dated.id)).toEqual(original.find(p => p.lesson === dated.id));
  await panel(page).getByRole('button', { name: 'Använd förslaget', exact: true }).click(); await saved(server, candidate);
  expect(server.drafts.get(draftKey)?.datedOverrides).toEqual(dates);
  expect(server.drafts.get(draftKey)?.locks).toEqual(input.locks);
});

test('avbruten granskning under körning lämnar sparat schema kvar även när ett sent svar anländer', async ({ page, schemaDraftServer: server }) => {
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  state.delay = 1_000; await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click();
  await expect.poll(() => state.continues.length).toBe(1);
  // Beräkningsläget (05.2-SM-UXF-54) täcker arbetsytan under körningen. Dess Avbryt gör samma sak som Behåll nuvarande schema.
  const lage = page.getByRole('dialog', { name: 'Förbättrar schemat', exact: true });
  await expect(lage.getByRole('heading', { name: 'Förbättrar schemat', exact: true })).toBeFocused();
  await expect(lage.getByRole('listitem').filter({ hasText: 'Sökning från ditt schema' })).toContainText('Pågår');
  await lage.getByRole('button', { name: 'Avbryt beräkningen', exact: true }).click();
  await expect(lage).toBeHidden(); await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fortsätt förbättra', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Fortsätt förbättra', exact: true })).toBeFocused();
  // Fördröjningen i mockservern är avsiktlig: även ett svar efter stängningen ska ignoreras.
  await page.waitForTimeout(1_100);
  await expect(panel(page)).toHaveCount(0); expect(server.drafts.get(draftKey)?.placements).toEqual(original);
});

test('ett nytt lås i ett anslutet fönster gör huvudfönstrets kandidat inaktuell', async ({ page, context, schemaDraftServer: server }) => {
  await context.route('**/api/session', route => route.fulfill({ headers, json: { epoch: 1 } }));
  await context.route('**/api/schema/fonster', route => route.fulfill({ headers, json: { unitId: source.unitId, schoolYear: 2026, scopeKey: '1:prov:prov' } }));
  const state = await start(page), original = placements(state.last!); await saved(server, original);
  await page.getByRole('button', { name: 'Fönster', exact: true }).click();
  const opened = context.waitForEvent('page'); await page.getByRole('menuitem', { name: 'Klassens schema', exact: true }).click();
  const child = await opened; await child.setViewportSize(page.viewportSize()!);
  await expect(child.getByRole('status').filter({ hasText: /^Live$/u })).toBeVisible();
  await page.getByRole('button', { name: 'Fortsätt förbättra', exact: true }).click(); await expect(panel(page)).toBeVisible();
  await child.getByRole('button', { name: 'Lås klassens schema', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Använd förslaget', exact: true })).toBeDisabled();
  await expect(panel(page)).toContainText(/ändrats|inaktuell/iu);
  expect(server.drafts.get(draftKey)?.placements).toEqual(original);
  await child.close();
});
