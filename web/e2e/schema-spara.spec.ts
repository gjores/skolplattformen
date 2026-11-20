// Produktens workspace, skrivkö och navigationsprovider i ett uttryckligt simulerat skal. Servern är en hashbunden mock, ingen faktisk DB/OIDC.
import { test, expect, schemaTestDraft, type Page, type SchemaDraftTestServer } from './schema-test';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor, type SchemaForslag } from '../lib/schema-contract.ts';
import { parseSchemaDraftResetRequest, parseSchemaDraftSave, schemaDraftResetHash, type SchemaDraftResetRequest, type SchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { schemaSparinnehall } from '../lib/schema-spara.ts';
import { schemaDatumOriginal } from '../lib/schema-datum.ts';
import { schemaWeekday } from '../lib/schema-vecka.ts';
import proposal from './schema-fixture';
const URL = '/e2e/fixtures/schema-spara-preview.html', source = proposal as unknown as SchemaForslag;
const key = (year = 2026) => `${source.unitId}:${year}:lasar`;
const saved = (page: Page) => page.getByRole('region', { name: 'Sparat schemautkast', exact: true });
const name = (page: Page) => saved(page).getByRole('textbox', { name: 'Namn på utkastet', exact: true });
function input(extra: Partial<SchemaDraftSave> = {}): SchemaDraftSave {
  return parseSchemaDraftSave({ contractVersion: 1, unitId: source.unitId, schoolYear: 2026, period: 'lasar', commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Serverns schema', basisVillkor: null, workingVillkor: defaultSchemaVillkor(), grundFingerprint: null, placements: [], locks: [], intentional: [], datedOverrides: [], activityTypes: [], ...extra });
}
async function seed(server: SchemaDraftTestServer, value = input()) {
  const { draft } = await schemaTestDraft(value, source); server.drafts.set(`${value.unitId}:${value.schoolYear}:${value.period}`, draft); return draft;
}
async function setup(page: Page) {
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => { const body = route.request().postDataJSON(); return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { ...source, unitId: body.unitId, schoolYear: body.schoolYear, period: body.period, villkor: body.villkor } }); });
  await page.route('**/api/schema/kontroll', route => { const body = route.request().postDataJSON(); return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: {
    contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint, fingerprint: source.fingerprint, violations: [], total: 0,
    teachings: source.teachings, trims: source.trims, metrics: { ...source.metrics, placed: body.placements.length, unplaced: source.lessons.length - body.placements.length },
    rooms: Object.fromEntries(body.placements.filter((p: { room: string | null }) => p.room).map((p: { lesson: string; room: string }) => [p.lesson, p.room])) } }); });
  await page.route('**/api/schema/datum', route => { const body = route.request().postDataJSON(); return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: {
    contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint, fingerprint: source.fingerprint, datedOverrides: body.datedOverrides,
    checkedDates: [...new Set([...body.dates, ...body.datedOverrides.flatMap((a: { originalDate: string; date: string }) => [a.originalDate, a.date])])].sort((a, b) => String(a).localeCompare(String(b))), violations: [], total: 0, timeChanges: [] } }); });
  await page.goto(URL);
}
async function settled(page: Page, server: SchemaDraftTestServer) {
  await expect(saved(page).getByText('Sparat på servern', { exact: true })).toBeVisible();
  const count = server.saves.length, revision = server.drafts.get(key())?.revision;
  // En hel stabil period efter bekräftelsen ska inte ge en ny revision utan en ny användarändring.
  await page.waitForTimeout(1_600); expect(server.saves.length).toBe(count); expect(server.drafts.get(key())?.revision).toBe(revision);
}

test('serverläsning slutförs före redigering; namnet autosparas och stabilt innehåll skapar ingen revisionsloop', async ({ page, schemaDraftServer: server }, info) => {
  server.delayRead = 500; await setup(page);
  await expect(name(page)).toBeDisabled(); await expect(page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true })).toBeDisabled();
  await expect(name(page)).toBeEnabled(); await name(page).fill('Höstschema A');
  await expect.poll(() => server.drafts.get(key())?.name).toBe('Höstschema A'); await settled(page, server);
  expect(server.saves).toHaveLength(1); expect(server.drafts.get(key())?.revision).toBe(1); expect(server.reads).toBe(1);
  await page.screenshot({ path: info.outputPath('autosparat-namn.png'), fullPage: false });
});

test('ett beräknat schema autosparas och återöppnas efter omladdning utan ny beräkning eller extra revision', async ({ page, schemaDraftServer: server }) => {
  let solves = 0; await setup(page);
  await page.route('**/api/schema/forslag', route => { solves++; const body = route.request().postDataJSON(); return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { ...source, villkor: body.villkor } }); });
  await expect(name(page)).toBeEnabled(); await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible(); await expect.poll(() => server.drafts.get(key())?.placements.length).toBe(source.lessons.length);
  await settled(page, server); const writes = server.saves.length;
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await expect(page.getByText('Tid · Alla pass har tid', { exact: true })).toBeVisible(); await settled(page, server);
  expect(solves).toBe(1); expect(server.saves.length).toBe(writes); expect(server.reads).toBe(2);
});

test('valt HT-utkast autosparas och återöppnas direkt efter omladdning utan nytt periodval', async ({ page, schemaDraftServer: server }) => {
  const htKey = `${source.unitId}:2026:ht`, placements = source.lessons.filter(l => l.day !== null && l.startMin !== null)
    .map(l => ({ lesson: l.id, day: l.day!, startMin: l.startMin!, room: l.roomId }));
  const reads: { schoolYear: number; period: string }[] = [];
  page.on('request', request => { if (request.url().endsWith('/api/schema/utkast/las')) reads.push(request.postDataJSON()); });
  await seed(server, input({ period: 'ht', name: 'Höstterminens sparade schema', basisVillkor: source.villkor, workingVillkor: source.villkor,
    grundFingerprint: source.grundFingerprint, placements, locks: [placements.find(p => p.lesson === 'pass-7')!] }));
  await setup(page); const period = page.getByRole('combobox', { name: 'Schemat gäller', exact: true });
  await expect(period).toBeEnabled(); await period.selectOption('ht'); await expect(name(page)).toHaveValue('Höstterminens sparade schema');
  await name(page).fill('Höstterminens rättade namn'); await expect.poll(() => server.drafts.get(htKey)?.name).toBe('Höstterminens rättade namn');
  await expect(saved(page).getByText('Sparat på servern', { exact: true })).toBeVisible();
  const readIndex = reads.length, writes = server.saves.filter(s => s.period === 'ht').length;
  await page.reload();
  // Ingen selectOption efter reload: den första serverläsningen ska öppna det ihågkomna HT-utkastet.
  await expect(period).toHaveValue('ht'); await expect(name(page)).toHaveValue('Höstterminens rättade namn');
  await expect(page.locator('[data-lesson="pass-7"]').first()).toContainText('Låst');
  expect(reads.slice(readIndex).map(r => r.period)).toEqual(['ht']);
  expect(server.drafts.get(htKey)?.placements).toEqual(placements); expect(server.saves.filter(s => s.period === 'ht')).toHaveLength(writes);
});

test('Töm schema gäller valt terminsutkast och kan ångras efter omladdning', async ({ page, schemaDraftServer: server }) => {
  const htKey = `${source.unitId}:2026:ht`;
  const originalDate = '2026-11-06';
  const datePass = source.lessons.flatMap(lesson => schemaDatumOriginal(source, { lesson: lesson.id, originalDate }) ?? [])
    .find(occurrence => !occurrence.lesson.egenAktivitet)!;
  const placements = source.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
  const contents = { basisVillkor: source.villkor, workingVillkor: source.villkor, grundFingerprint: source.grundFingerprint, placements };
  const annual = await seed(server, input({ ...contents, name: 'Hela läsårets schema' }));
  const host = await seed(server, input({ ...contents, period: 'ht', name: 'Höstschemat', locks: [placements.find(p => p.lesson !== datePass.lesson.id)!],
    datedOverrides: [{ lesson: datePass.lesson.id, originalDate, date: '2026-11-13', startMin: 900, room: null, durationMin: datePass.length }] }));
  const changes: SchemaDraftResetRequest[] = [], reads: string[] = [], examWrites: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/schema/utkast/las')) reads.push(request.postDataJSON().period);
    if (request.url().endsWith('/api/lasar/nationella-prov/spara')) examWrites.push(request.url());
  });
  await page.route('**/api/schema/utkast/aterstall', async route => {
    const request = parseSchemaDraftResetRequest(route.request().postDataJSON());
    const { action, ...command } = request, { contractVersion, unitId, schoolYear, period, draftId, expectedRevision } = command;
    const current = server.drafts.get(htKey)!;
    expect({ unitId, schoolYear, period, draftId, expectedRevision }).toEqual({ unitId: source.unitId, schoolYear: 2026, period: 'ht', draftId: host.id, expectedRevision: current.revision });
    changes.push(request);
    const values = action === 'clear'
      ? { name: current.name, workingVillkor: current.workingVillkor, activityTypes: current.activityTypes }
      : schemaSparinnehall(host);
    const { draft, receipt } = await schemaTestDraft(input({ ...command, ...values }), source, action === 'undo' ? host.control : null, current);
    server.drafts.set(htKey, action === 'clear' ? { ...draft, resetUndoRevision: current.revision } : draft);
    return route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { contractVersion, unitId, schoolYear, period,
      draft, receipt: { ...receipt, requestHash: await schemaDraftResetHash(request) } } });
  });
  await setup(page);
  const period = page.getByRole('combobox', { name: 'Schemat gäller', exact: true });
  await period.selectOption('ht');
  await expect(name(page)).toHaveValue(host.name);
  const tom = saved(page).getByRole('button', { name: 'Töm schema…', exact: true });
  const undo = saved(page).getByRole('button', { name: 'Ångra tömning', exact: true });
  const yta = page.getByRole('navigation', { name: 'Arbetsytor', exact: true });
  await yta.getByRole('button', { name: 'Lägg schema', exact: true }).click();
  const week = page.locator('.schema-week');
  await expect(week.locator('[data-lesson]').first()).toBeVisible();

  await tom.click();
  const confirm = page.getByRole('alertdialog', { name: 'Töm schema?' });
  await expect(confirm).toContainText('Provskolan · läsår 2026/27 · Höstterminen');
  const cancel = confirm.getByRole('button', { name: 'Behåll schemat', exact: true });
  await expect(cancel).toBeFocused();
  await cancel.click();
  expect(changes).toHaveLength(0);
  await expect(week.locator('[data-lesson]').first()).toBeVisible();

  await tom.click();
  await confirm.getByRole('button', { name: 'Töm schema', exact: true }).click();
  await expect(undo).toBeFocused();
  await expect(yta.getByRole('button', { name: 'Förbered', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(week).toHaveCount(0);
  expect(server.drafts.get(htKey)).toMatchObject({ id: host.id, revision: host.revision + 1, base: null, placements: [], locks: [], datedOverrides: [],
    intentional: [], workingVillkor: host.workingVillkor });
  expect(server.drafts.get(key())).toEqual(annual);

  const beforeReload = reads.length;
  await page.reload();
  await expect(period).toHaveValue('ht');
  await expect(undo).toBeEnabled();
  expect(reads.slice(beforeReload)).toEqual(['ht']);
  await undo.click();
  await expect(tom).toBeFocused();
  await expect(yta.getByRole('button', { name: 'Lägg schema', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(week.locator('[data-lesson]').first()).toBeVisible();
  await expect(undo).toHaveCount(0);
  expect(changes.map(command => command.action)).toEqual(['clear', 'undo']);
  expect(server.drafts.get(htKey)).toMatchObject({ id: host.id, revision: host.revision + 2, placements: host.placements, locks: host.locks,
    datedOverrides: host.datedOverrides, workingVillkor: host.workingVillkor });
  expect(server.drafts.get(key())).toEqual(annual);
  expect(server.saves).toHaveLength(0);
  expect(examWrites).toHaveLength(0);
});

test('ett inaktuellt utkast kan byta period när inga lokala ändringar väntar', async ({ page, schemaDraftServer: server }) => {
  const placements = source.lessons.filter(l => l.day !== null && l.startMin !== null)
    .map(l => ({ lesson: l.id, day: l.day!, startMin: l.startMin!, room: l.roomId }));
  const annual = await seed(server, input({ basisVillkor: source.villkor, workingVillkor: source.villkor,
    grundFingerprint: source.grundFingerprint, placements }));
  annual.stale = true;
  await seed(server, input({ period: 'ht', name: 'Sparat HT-utkast' }));
  server.delayRead = 500;
  await setup(page);
  const period = page.getByRole('combobox', { name: 'Schemat gäller', exact: true });
  await expect(period).toBeDisabled();
  await expect(saved(page).getByText('Underlaget har ändrats', { exact: true })).toBeVisible();
  await expect(period).toBeEnabled();

  await name(page).fill('Lokalt ändrat namn');
  await expect(period).toBeDisabled();
  await expect(period).toHaveValue('lasar');
  await expect(name(page)).toHaveValue('Lokalt ändrat namn');

  await name(page).fill(annual.name);
  await period.selectOption('ht');
  await expect(name(page)).toHaveValue('Sparat HT-utkast');
  await expect(period).toHaveValue('ht');
  expect(server.saves).toHaveLength(0);
  expect(server.drafts.get(key())).toEqual(annual);
});

test('periodval hålls isär mellan HT2026 och VT2027 och ett nytt läsår börjar med hela läsåret', async ({ page, schemaDraftServer: server }) => {
  await seed(server, input({ name: 'Hela 2026' }));
  await seed(server, input({ period: 'ht', name: 'HT2026' }));
  await seed(server, input({ schoolYear: 2027, name: 'Hela 2027' }));
  await seed(server, input({ schoolYear: 2027, period: 'ht', name: 'Fel HT2027' }));
  await seed(server, input({ schoolYear: 2027, period: 'vt', name: 'VT2027' }));
  await setup(page); const period = page.getByRole('combobox', { name: 'Schemat gäller', exact: true });
  await expect(period).toBeEnabled(); await period.selectOption('ht'); await expect(name(page)).toHaveValue('HT2026');
  await page.getByRole('button', { name: 'Byt läsår', exact: true }).click();
  await expect(name(page)).toHaveValue('Hela 2027'); await expect(period).toHaveValue('lasar');
  await period.selectOption('vt'); await expect(name(page)).toHaveValue('VT2027');
  // Testskalet återgår till 2026 vid reload; produktens workspace ska läsa det årets eget periodval.
  await page.reload(); await expect(period).toHaveValue('ht'); await expect(name(page)).toHaveValue('HT2026');
  await page.getByRole('button', { name: 'Byt läsår', exact: true }).click();
  await expect(period).toHaveValue('vt'); await expect(name(page)).toHaveValue('VT2027');
  await expect(page.getByText('Fel HT2027', { exact: true })).toHaveCount(0);
});

test('serverutkast återställer flytt, viloyta, lås, arbetsvillkor, datum och aktivitetstyper efter rensad lokal lagring', async ({ page, schemaDraftServer: server }, info) => {
  const parked = 'pass-8', lock = source.lessons.find(l => l.id === 'pass-7')!, dated = source.lessons.find(l => l.id === 'pass-9')!;
  const placements = source.lessons.filter(l => l.id !== parked && l.day !== null && l.startMin !== null).map(l => ({ lesson: l.id, day: l.day!, startMin: l.startMin! + (l.id === lock.id ? 10 : 0), room: l.roomId }));
  const originalDate = source.time.calendar!.days.find(d => d.schoolDay && d.term === dated.term && schemaWeekday(d.date) === dated.day)!.date;
  const occurrence = schemaDatumOriginal(source, { lesson: dated.id, originalDate })!;
  const activityTypes = [{ id: 'server-typ', name: 'Lokal studiedel', group: 'Mina typer', participants: 'personal' as const, visibleFor: 'personal' as const, margin: null }];
  const value = input({ name: 'Bevarat schema', basisVillkor: source.villkor, workingVillkor: { ...source.villkor, breakMin: 15 }, grundFingerprint: source.grundFingerprint,
    placements, locks: [placements.find(p => p.lesson === lock.id)!], datedOverrides: [{ lesson: dated.id, originalDate, date: originalDate, startMin: dated.startMin! + 10, room: dated.roomId, durationMin: occurrence.length }], activityTypes });
  await seed(server, value); await setup(page); await expect(name(page)).toHaveValue('Bevarat schema'); await settled(page, server);
  await page.evaluate(() => localStorage.clear()); await page.reload(); await expect(name(page)).toHaveValue('Bevarat schema');
  await expect(page.locator('[data-lesson="pass-7"]').first()).toContainText('11:20'); await expect(page.locator('[data-lesson="pass-7"]').first()).toContainText('Låst');
  await expect(page.locator('[data-schema-rest-lesson="pass-8"]')).toBeVisible(); await expect(page.getByRole('region', { name: 'Datumändringar', exact: true })).toContainText(originalDate);
  await page.getByRole('button', { name: 'Hantera typer', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Hantera aktivitetstyper', exact: true });
  await expect(dialog).toContainText('Lokal studiedel'); await page.keyboard.press('Escape');
  await name(page).fill('Bevarat schema v2'); await expect.poll(() => server.drafts.get(key())?.name).toBe('Bevarat schema v2'); await settled(page, server);
  const reopened = server.drafts.get(key())!; expect(reopened.placements).toEqual(placements); expect(reopened.locks).toEqual(value.locks); expect(reopened.workingVillkor).toEqual(value.workingVillkor);
  expect(reopened.datedOverrides).toEqual(value.datedOverrides); expect(reopened.activityTypes).toEqual(value.activityTypes); expect(reopened.revision).toBe(2); expect(server.saves).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('ateroppnat-utkast.png'), fullPage: false });
});

test('ett tappat svar följs upp med samma kommando och visar Sparat först efter en verifierad serverversion', async ({ page, schemaDraftServer: server }, info) => {
  server.loseReply = true; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Återfunnet schema');
  await expect.poll(() => server.statusChecks.length).toBe(1); await settled(page, server);
  expect(server.saves).toHaveLength(1); expect(server.statusChecks[0].commandId).toBe(server.saves[0].commandId); expect(server.drafts.get(key())?.revision).toBe(1); expect(server.reads).toBe(2);
  await page.screenshot({ path: info.outputPath('tappat-svar-avstamt.png'), fullPage: false });
});

test('en ändring under pågående sparande blir nästa version och får ingen för tidig Sparat-status', async ({ page, schemaDraftServer: server }) => {
  server.replyDelay = 700; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Första namnet');
  await expect.poll(() => server.drafts.get(key())?.name).toBe('Första namnet'); await name(page).fill('Senaste namnet');
  await expect(saved(page).getByText('Sparat på servern', { exact: true })).toHaveCount(0);
  await expect.poll(() => server.drafts.get(key())?.name).toBe('Senaste namnet'); await expect(name(page)).toHaveValue('Senaste namnet');
  await settled(page, server); expect(server.saves).toHaveLength(2); expect(server.saves.map(s => s.expectedRevision)).toEqual([0, 1]); expect(server.drafts.get(key())?.revision).toBe(2);
});

test('okänt utfall utan registrerat kommando kan kontrolleras och återförsökas med samma kommando', async ({ page, schemaDraftServer: server }) => {
  server.failSave = true; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Återförsök utan dublett');
  await expect(saved(page).getByText('Sparandet behöver kontrolleras', { exact: true })).toBeVisible(); expect(server.drafts.size).toBe(0);
  const commandId = server.saves[0].commandId; expect(server.statusChecks[0].commandId).toBe(commandId);
  server.failSave = false; await saved(page).getByRole('button', { name: 'Kontrollera sparandet', exact: true }).click(); await settled(page, server);
  expect(server.saves).toHaveLength(2); expect(new Set(server.saves.map(s => s.commandId)).size).toBe(1); expect(server.saves[1].commandId).toBe(commandId); expect(server.drafts.get(key())?.revision).toBe(1);
});

for (const corruption of ['corruptReceipt', 'corruptDocument'] as const) test(`${corruption === 'corruptReceipt' ? 'felaktig kvittens' : 'ändrad dokumenthash'} ger aldrig falskt Sparat; en ny verifiering skapar ingen revision`, async ({ page, schemaDraftServer: server }) => {
  server[corruption] = true; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Hashskyddat schema');
  await expect(saved(page).getByText('Sparandet behöver kontrolleras', { exact: true })).toBeVisible(); await expect(saved(page).getByText('Sparat på servern', { exact: true })).toHaveCount(0);
  // Vänta på att den automatiska status-/läskedjan faktiskt har avvisats, innan servern börjar ge giltiga svar igen.
  await expect(saved(page).getByRole('alert')).toContainText('Det går ännu inte att avgöra');
  expect(server.saves).toHaveLength(1); expect(server.drafts.get(key())?.name).toBe('Hashskyddat schema');
  server[corruption] = false; await saved(page).getByRole('button', { name: 'Kontrollera sparandet', exact: true }).click(); await settled(page, server);
  expect(server.saves).toHaveLength(1); expect(server.drafts.get(key())?.revision).toBe(1);
});

test('samtidig serverändring behåller lokalt arbete och ersätts bara efter uttryckligt val', async ({ page, schemaDraftServer: server }, info) => {
  const old = await seed(server); await setup(page); await expect(name(page)).toHaveValue(old.name);
  server.drafts.set(key(), { ...old, name: 'Serverns nyare version', revision: 2, savedAt: new Date().toISOString() });
  await name(page).fill('Mina lokala ändringar'); await expect(saved(page).getByText('En nyare version finns', { exact: true })).toBeVisible();
  await expect(name(page)).toHaveValue('Mina lokala ändringar'); await expect(saved(page).getByRole('button', { name: 'Spara nu', exact: true })).toBeDisabled();
  await saved(page).getByRole('button', { name: 'Läs serverns version…', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Behåll lokala ändringar', exact: true }).click(); await expect(name(page)).toHaveValue('Mina lokala ändringar');
  await page.screenshot({ path: info.outputPath('konflikt-bevarar-lokalt.png'), fullPage: false });
  await saved(page).getByRole('button', { name: 'Läs serverns version…', exact: true }).click(); await page.getByRole('alertdialog').getByRole('button', { name: 'Läs serverns version', exact: true }).click();
  await expect(name(page)).toHaveValue('Serverns nyare version'); await settled(page, server); expect(server.drafts.get(key())?.revision).toBe(2); expect(server.saves).toHaveLength(1);
});

test('oläst eller felaktigt utkast blockerar redigering och kan läsas igen utan att skriva över servern', async ({ page, schemaDraftServer: server }) => {
  await seed(server); server.failRead = true; await setup(page);
  await expect(saved(page).getByRole('alert')).toContainText('kunde inte läsas'); await expect(name(page)).toBeDisabled(); expect(server.saves).toHaveLength(0);
  server.failRead = false; server.corruptDocument = true; await saved(page).getByRole('button', { name: 'Försök läsa utkastet igen', exact: true }).click();
  await expect(saved(page).getByRole('alert')).toContainText('kunde inte läsas'); await expect(name(page)).toBeDisabled(); expect(server.saves).toHaveLength(0);
  server.corruptDocument = false; await saved(page).getByRole('button', { name: 'Försök läsa utkastet igen', exact: true }).click(); await expect(name(page)).toHaveValue('Serverns schema'); await settled(page, server);
  expect(server.saves).toHaveLength(0);
});

test('ett saknat namn kan rättas utan falsk sparstatus eller förlorat lokalt arbete', async ({ page, schemaDraftServer: server }) => {
  await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('');
  await expect(saved(page).getByRole('alert')).toContainText('Ge utkastet ett namn'); await expect(saved(page).getByText('Sparat på servern', { exact: true })).toHaveCount(0); expect(server.saves).toHaveLength(0);
  await name(page).fill('Rättat namn'); await expect.poll(() => server.drafts.get(key())?.name).toBe('Rättat namn'); await settled(page, server); expect(server.saves).toHaveLength(1);
});

test('pågående och misslyckat sparande skyddar navigering; stanna kvar behåller namnet', async ({ page, schemaDraftServer: server }, info) => {
  server.failSave = true; server.statusUnavailable = true; server.delaySave = 600; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Osparat lokalt schema');
  await expect(saved(page).getByText('Sparar utkast…', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Byt läsår', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Osparade ändringar', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Stanna kvar', exact: true }).click();
  await expect(name(page)).toHaveValue('Osparat lokalt schema'); await expect(saved(page).getByText('Sparandet behöver kontrolleras', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lämna arbetsytan', exact: true }).click(); await expect(page.getByRole('alertdialog', { name: 'Osparade ändringar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stanna kvar', exact: true }).click(); await expect(name(page)).toHaveValue('Osparat lokalt schema');
  const beforeUnload = page.waitForEvent('dialog'); const leaving = page.getByRole('link', { name: 'Öppna annan sida', exact: true }).click().catch(() => {});
  const prompt = await beforeUnload; expect(prompt.type()).toBe('beforeunload'); await prompt.dismiss(); await leaving;
  await expect(name(page)).toHaveValue('Osparat lokalt schema'); await page.screenshot({ path: info.outputPath('osparat-navigationsskydd.png'), fullPage: false });
});

test('en ny fältändring skyddar läsårsbyte direkt innan autosparandet har börjat', async ({ page, schemaDraftServer: server }) => {
  await seed(server); await setup(page); await expect(saved(page).getByText('Sparat på servern', { exact: true })).toBeVisible();
  await name(page).fill('Precis ändrat namn'); await page.getByRole('button', { name: 'Byt läsår', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Osparade ändringar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Stanna kvar', exact: true }).click(); await expect(name(page)).toHaveValue('Precis ändrat namn');
  await expect(page.getByText('Testskal · läsår 2026', { exact: false })).toBeVisible();
});

test('ett försenat svar efter avslutat uppdrag kan inte återställa gammalt innehåll i nästa läsår', async ({ page, schemaDraftServer: server }) => {
  server.replyDelay = 1_200; await setup(page); await expect(name(page)).toBeEnabled(); await name(page).fill('Gamla uppdragets schema');
  await expect.poll(() => server.drafts.get(key())?.name).toBe('Gamla uppdragets schema'); await expect(saved(page).getByText('Sparar utkast…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Simulera avslutat uppdrag', exact: true }).click(); await expect(page.getByText('arbetsytan är stängd', { exact: false })).toBeVisible();
  server.replyDelay = 0; await page.getByRole('button', { name: 'Byt läsår', exact: true }).click(); await expect(name(page)).toHaveValue('Schemautkast');
  await expect.poll(() => server.drafts.get(key(2027))?.name).toBe('Schemautkast'); await page.waitForTimeout(1_300);
  await expect(name(page)).toHaveValue('Schemautkast'); await expect(page.getByText('Gamla uppdragets schema', { exact: true })).toHaveCount(0);
  expect(server.saves.filter(s => s.schoolYear === 2026)).toHaveLength(1); expect(server.saves.filter(s => s.schoolYear === 2027)).toHaveLength(1);
  expect(server.drafts.get(key(2027))?.revision).toBe(1);
});
