// SM-PLACERING UI med syntetiska scheman och simulerade route-/kontrollsvar.
// Verklig motorns sökning och servermandat prövas separat; dessa fall prövar granskning, genomförande och ångra i arbetsytan.
import { test, expect, type BrowserContext, type Page } from './schema-test';
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };
import following from './fixtures/schema-folj.json' with { type: 'json' };
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import { samlingResurser } from '../lib/schema-samling.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaPlacement, type SchemaForslag } from '../lib/schema-contract.ts';
import type { SchemaPlaceringRequest, SchemaPlacering } from '../lib/schema-placering.ts';
const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const original = (id: string): SchemaPlacement => { const l = proposal.lessons.find(p => p.id === id)!; return { lesson: id, day: l.day!, startMin: l.startMin!, room: l.roomId }; };
const ownIds = proposal.lessons.filter(l => l.classIds.includes(proposal.classes[0].id) && (l.term === 'ht' || l.term === null));
function suggestion(request: SchemaPlaceringRequest, partial = false): SchemaPlacering {
  const before = new Map(request.placements.map(p => [p.lesson, p])), after = new Map(before);
  const missing = proposal.lessons.filter(l => !before.has(l.id)).map(l => l.id);
  const ids = request.mode === 'rest' ? partial ? missing.slice(0, 1) : missing : [request.lesson!];
  const changes = ids.map(id => {
    const from = before.get(id) ?? null, to = request.target ? { lesson: id, ...request.target } : from ? { ...from, day: (from.day + 1) % 5 } : original(id);
    after.set(id, to); return { lesson: id, from, to };
  });
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: request.grundFingerprint, depth: request.depth, timedOut: false, elapsedMs: 12,
    suggestions: [{ placements: [...after.values()], changes, metricsBefore: { studentGapMin: 30, teacherGapMin: 20, cost: 20 }, metricsAfter: { studentGapMin: 15, teacherGapMin: 10, cost: 10 }, cost: 10 }] };
}
async function setup(context: BrowserContext, page: Page, options: { partial?: boolean; clash?: boolean; denied?: boolean } = {}) {
  const searches: SchemaPlaceringRequest[] = [], controls: { placements: SchemaPlacement[] }[] = [];
  await context.route('**/api/session', r => r.fulfill({ headers, json: { epoch: 1 } }));
  await context.route('**/api/schema/fonster', r => r.fulfill({ headers, json: { unitId: proposal.unitId, schoolYear: 2026, scopeKey: '1:prov:prov' } }));
  await context.route('**/api/schema/diagnos', r => r.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await context.route('**/api/schema/folj', r => r.fulfill({ headers, json: { ...following.utanElever, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await context.route('**/api/schema/lagen', r => r.fulfill({ headers, json: { ...following.alla, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  const f = { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } as SchemaForslag, resources = samlingResurser(f);
  await context.route('**/api/schema/samling', r => r.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources: [...resources, { key: 'elev:1', id: 'elev-1', slag: 'elev', name: 'Provelev Placering', lessons: resources[0].lessons, busyLessons: resources[0].lessons, size: 1, antagen: false, year: null }], clusters: [] } }));
  await context.route('**/api/schema/forslag', r => r.fulfill({ headers, json: { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await context.route('**/api/schema/placering', r => {
    const request = r.request().postDataJSON() as SchemaPlaceringRequest; searches.push(request);
    return options.denied ? r.fulfill({ headers, status: 403, json: { code: 'forbidden' } }) : r.fulfill({ headers, json: suggestion(request, options.partial) });
  });
  await context.route('**/api/schema/kontroll', r => {
    const request = r.request().postDataJSON() as { placements: SchemaPlacement[] }; controls.push(request);
    return r.fulfill({ headers, json: { ...checked.clash, contractVersion: SCHEMA_CONTRACT_VERSION, total: options.clash ? checked.clash.total : 0, violations: options.clash ? checked.clash.violations : [],
      rooms: Object.fromEntries(request.placements.filter(p => p.room !== null).map(p => [p.lesson, p.room])), metrics: { ...proposal.metrics, placed: request.placements.length, unplaced: proposal.lessons.length - request.placements.length } } });
  });
  await page.goto(URL); await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
  return { searches, controls };
}
const panel = (page: Page) => page.getByRole('region', { name: /^Placeringsförslag/u });
async function popupViewport(child: Page, source: Page) {
  const viewport = source.viewportSize()!; await child.setViewportSize(viewport); expect(await child.evaluate(() => window.innerWidth)).toBe(viewport.width);
}
const weekButton = (page: Page, id: string) => page.locator(`button[data-lesson="${id}"]`).first();
async function park(page: Page, id: string) {
  await weekButton(page, id).click({ button: 'right' }); await page.getByRole('menuitem', { name: /^Lägg på viloytan/u }).click();
  await expect(weekButton(page, id)).toHaveCount(0);
}
async function selectTarget(page: Page, id: string) {
  await weekButton(page, id).focus(); await page.keyboard.press('Enter'); const form = page.getByRole('form', { name: 'Flytta pass' });
  await form.getByRole('combobox', { name: 'Dag', exact: true }).selectOption(String(checked.move.day));
  await form.getByRole('combobox', { name: 'Starttid', exact: true }).selectOption(String(checked.move.startMin)); return form;
}

test('parkera → föreslå från viloytan → granska → genomför alla placeringar → ångra ett steg', async ({ context, page }) => {
  const { searches, controls } = await setup(context, page); const id = checked.move.lesson; await park(page, id);
  await page.getByRole('button', { name: new RegExp(`^Föreslå placering för ${proposal.lessons.find(l => l.id === id)!.title},`, 'u') }).click();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  await expect(panel(page)).toContainText('Viloytan'); await expect(panel(page)).toContainText('1 ny placering · 0 redan lagda pass flyttas.'); await expect(panel(page)).toContainText('Ingen sal'); await expect(panel(page)).toContainText('Elevernas håltid: 30 → 15 elevminuter.');
  expect(searches).toHaveLength(1); expect(searches[0].placements).toHaveLength(proposal.lessons.length - 1); expect(searches[0].lesson).toBe(id);
  await expect(weekButton(page, id)).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Godkänn förslag 1' }).click();
  await expect(weekButton(page, id)).toBeVisible(); await expect(weekButton(page, id)).toBeFocused(); expect(controls.at(-1)!.placements).toHaveLength(proposal.lessons.length);
  await page.getByRole('button', { name: 'Ångra senaste flytt', exact: true }).click();
  await expect(weekButton(page, id)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Ångra senaste flytt', exact: true })).toBeEnabled();
  // Bara placeringssteget ångrades; den tidigare parkeringen är fortfarande ett eget steg.
  await expect(page.getByRole('button', { name: 'Gör om', exact: true })).toBeEnabled();
});

test('sökdjup ökar till tre och ett nytt lås gör tidigare förslag omöjliga att godkänna', async ({ context, page }) => {
  const { searches } = await setup(context, page); const id = checked.move.lesson;
  await weekButton(page, id).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Föreslå placering', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  await panel(page).getByRole('button', { name: 'Öka sökdjupet' }).click(); await expect(panel(page).getByText('Sökdjup 2 av 3', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  await panel(page).getByRole('button', { name: 'Öka sökdjupet' }).click(); await expect(panel(page).getByText('Sökdjup 3 av 3', { exact: true })).toBeVisible();
  expect(searches.map(r => r.depth)).toEqual([1, 2, 3]);
  const other = ownIds.find(l => l.id !== id)!; await weekButton(page, other.id).click({ button: 'right' }); await page.getByRole('menuitem', { name: /^Lås här/u }).click();
  await expect(panel(page)).toContainText('Utkastet, låsen eller villkoren har ändrats.');
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeDisabled();
});

test('minsta störning från flyttpanelen visar vald tid och kontrollerar hela kandidaten före ändring', async ({ context, page }) => {
  const { searches } = await setup(context, page); const id = checked.move.lesson, before = await weekButton(page, id).locator('time').textContent();
  const form = await selectTarget(page, id); await form.getByRole('button', { name: 'Lägg här och flytta det som krockar', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  expect(searches[0]).toMatchObject({ mode: 'target', lesson: id, target: { day: checked.move.day, startMin: checked.move.startMin } });
  await expect(weekButton(page, id).locator('time')).toHaveText(before!);
  await context.route('**/api/schema/kontroll', async r => { await new Promise(resolve => setTimeout(resolve, 300)); return r.fulfill({ headers, status: 503, json: { code: 'schema_engine_unavailable' } }); });
  await panel(page).getByRole('button', { name: 'Godkänn förslag 1' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Passen står kvar'); await expect(weekButton(page, id).locator('time')).toHaveText(before!);
  await expect(page.getByRole('button', { name: 'Ångra senaste flytt', exact: true })).toBeDisabled();
});

test('Alt-dra öppnar målsökning och flyttar inget före Godkänn', async ({ context, page }) => {
  const { searches, controls } = await setup(context, page); const id = checked.move.lesson, button = weekButton(page, id);
  await button.scrollIntoViewIfNeeded(); const start = (await button.boundingBox())!, column = page.locator(`ol[data-day="${checked.move.day}"]`).first();
  const box = (await column.boundingBox())!, sourceDay = button.locator('xpath=ancestor::ol[1]'), sourceBox = (await sourceDay.boundingBox())!;
  const span = Number(await column.getAttribute('data-span')), origin = Number(await column.getAttribute('data-start')), held = 3 * span / sourceBox.height;
  await page.keyboard.down('Alt'); await page.mouse.move(start.x + start.width / 2, start.y + 3); await page.mouse.down();
  await page.mouse.move(box.x + box.width * .7, box.y + (checked.move.startMin - origin + held) / span * box.height, { steps: 10 });
  await page.mouse.up(); await page.keyboard.up('Alt');
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  expect(searches[0]).toMatchObject({ mode: 'target', lesson: id, target: { day: checked.move.day } }); expect(controls).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Ångra senaste flytt', exact: true })).toBeDisabled();
});

test('Lägg viloytan omfattar alla parkerade pass och avvisar ett simulerat halvresultat', async ({ context, page }) => {
  const { searches } = await setup(context, page, { partial: true }); const ids = ownIds.slice(0, 2).map(l => l.id);
  for (const id of ids) await park(page, id);
  await page.getByRole('button', { name: 'Lägg viloytan', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Placeringsförslagen kunde inte kontrolleras.');
  expect(searches[0].mode).toBe('rest'); expect(searches[0].placements).toHaveLength(proposal.lessons.length - 2);
  await expect(panel(page).getByRole('button', { name: /^Godkänn/u })).toHaveCount(0);
  await context.route('**/api/schema/placering', r => r.fulfill({ headers, json: suggestion(r.request().postDataJSON()) }));
  await panel(page).getByRole('button', { name: 'Öka sökdjupet' }).click(); await expect(panel(page).getByText('Förslag 1 · 2 pass ändras')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Godkänn förslag 1' }).click(); for (const id of ids) await expect(weekButton(page, id)).toBeVisible();
});

test('en medveten krock behåller regelbrotten, syns i båda fönstren och i passtabellen och kan ångras', async ({ context, page }) => {
  // Tre synkade fönster och tre bevisbilder tog 54–60 s vid parallell slutverifiering; behåll alla produktkontroller.
  test.slow();
  await setup(context, page, { clash: true }); const form = await selectTarget(page, checked.move.lesson); await form.getByRole('button', { name: 'Flytta hit', exact: true }).click();
  const list = page.getByRole('heading', { name: `Regelavvikelser (${checked.clash.total})`, exact: true }); await expect(list).toBeVisible();
  await page.getByRole('button', { name: 'Fönster', exact: true }).click(); const ready = context.waitForEvent('page'); await page.getByRole('menuitem', { name: 'Regelavvikelser', exact: true }).click(); const child = await ready; await popupViewport(child, page); await child.waitForLoadState('domcontentloaded');
  const checkbox = child.getByRole('checkbox', { name: 'Behåll som medveten krock', exact: true }).first(); await expect(checkbox).toBeVisible(); await checkbox.click(); await expect(checkbox).toBeChecked();
  await expect(page.getByText('Medveten krock · regelavvikelse kvar', { exact: true }).first()).toBeVisible();
  await expect(list).toBeVisible(); await expect(child.getByText('Medveten krock · regelavvikelse kvar', { exact: true })).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('medveten-krock-veckan.png'), fullPage: true });
  await child.screenshot({ path: test.info().outputPath('medveten-krock-B-lista.png'), fullPage: true });
  await page.getByRole('group', { name: 'Visa schemat som', exact: true }).getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  const row = page.locator(`tr[data-lesson="${checked.move.lesson}"]`).first(); await expect(row).toContainText('Regelavvikelse'); await expect(row).toContainText('Medveten krock');
  await child.getByRole('button', { name: 'Ångra medveten krock', exact: true }).click(); await expect(checkbox).not.toBeChecked(); await expect(row).not.toContainText('Medveten krock'); await expect(row).toContainText('Regelavvikelse');
  await page.getByRole('button', { name: 'Gör om', exact: true }).click(); await expect(checkbox).toBeChecked();
  await page.getByRole('group', { name: 'Visa schemat som', exact: true }).getByRole('button', { name: 'Vecka', exact: true }).click();
  await weekButton(page, following.lesson).focus(); await page.keyboard.press('f');
  await expect(page.locator(`.folj [data-schema-pass="${checked.move.lesson}"]`).first()).toHaveAttribute('title', /Medveten krock/u);
  await expect(page.getByText('Flagga: Medveten krock', { exact: true }).first()).toBeVisible();
  await page.getByRole('region', { name: /^Följ passet:/u }).screenshot({ path: test.info().outputPath('medveten-krock-sma-pass.png') });
  await page.getByRole('button', { name: 'Fönster', exact: true }).click(); const pupilReady = context.waitForEvent('page'); await page.getByRole('menuitem', { name: 'Elevens schema', exact: true }).click(); const pupil = await pupilReady; await popupViewport(pupil, page); await pupil.waitForLoadState('domcontentloaded');
  await pupil.getByRole('combobox', { name: 'Välj elev', exact: true }).selectOption('elev:1');
  await expect(pupil.locator(`[data-schema-pass="${checked.move.lesson}"]`).first()).toHaveAttribute('title', /Medveten krock/u);
  await expect(pupil.getByText('Flagga: Medveten krock', { exact: true }).first()).toBeVisible();
});

test('nekad sökning bevarar utkast och låst pass erbjuder inga flyttförslag', async ({ context, page }) => {
  await setup(context, page, { denied: true }); const id = checked.move.lesson;
  await weekButton(page, id).click({ button: 'right' }); await page.getByRole('menuitem', { name: 'Föreslå placering', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Ditt uppdrag tillåter inte den här åtgärden.'); await expect(weekButton(page, id)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Stäng placeringsförslagen' }).click(); await weekButton(page, id).click({ button: 'right' }); await page.getByRole('menuitem', { name: /^Lås här/u }).click();
  await weekButton(page, id).click({ button: 'right' }); await expect(page.getByRole('menuitem', { name: 'Föreslå placering', exact: true })).toBeDisabled();
});

test('förslagslistan nås med tangentbord och rullar i egen tabell vid 200 procent text', async ({ context, page }) => {
  await setup(context, page); await weekButton(page, checked.move.lesson).focus(); await page.keyboard.press('Shift+F10');
  const item = page.getByRole('menuitem', { name: 'Föreslå placering', exact: true }); await item.focus(); await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('heading', { level: 2 })).toBeFocused();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled();
  await page.screenshot({ path: test.info().outputPath('placeringsforslag-normal.png'), fullPage: true });
  await page.addStyleTag({ content: 'html{font-size:200%}' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('placeringsforslag-200-full.png'), fullPage: true });
  await panel(page).screenshot({ path: test.info().outputPath('placeringsforslag-200.png') });
  await panel(page).getByRole('button', { name: 'Stäng placeringsförslagen' }).click(); await expect(weekButton(page, checked.move.lesson)).toBeFocused();
});


test('Föreslå placering från Följ passet öppnar samma granskning med fullständiga passnamn', async ({ context, page }) => {
  const { searches } = await setup(context, page);
  await weekButton(page, following.lesson).focus(); await page.keyboard.press('f');
  const follow = page.getByRole('region', { name: /^Följ passet:/u });
  await follow.getByRole('button', { name: 'Föreslå placering', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled(); expect(searches[0]).toMatchObject({ mode: 'lesson', lesson: following.lesson });
  await panel(page).getByRole('button', { name: 'Stäng placeringsförslagen' }).click();
  await expect(follow.getByRole('button', { name: 'Föreslå placering', exact: true })).toBeFocused();
  // En faktisk liten passruta har sitt fulla tillgängliga namn även i kompakt läge.
  await expect(follow.locator(`[data-schema-pass="${following.lesson}"]`).first()).toHaveAttribute('title', /\d{2}:\d{2}/u);
});

test('anslutet barnfönster söker, granskar, genomför och ångrar hela placeringsförslaget via huvudfönstret', async ({ context, page }) => {
  const { searches, controls } = await setup(context, page); const id = checked.move.lesson; await park(page, id);
  await page.getByRole('button', { name: 'Fönster', exact: true }).click(); const ready = context.waitForEvent('page');
  await page.getByRole('menuitem', { name: 'Viloytan', exact: true }).click(); const child = await ready; await popupViewport(child, page);
  await child.getByRole('button', { name: /^Föreslå placering för/u }).first().click();
  await expect(panel(child).getByRole('button', { name: 'Godkänn förslag 1' })).toBeEnabled(); await expect(panel(page)).toBeVisible();
  expect(searches).toHaveLength(1); expect(searches[0].lesson).toBe(id);
  await child.screenshot({ path: test.info().outputPath('placeringsforslag-B.png'), fullPage: true });
  await panel(child).getByRole('button', { name: 'Stäng placeringsförslagen' }).click();
  const origin = child.getByRole('button', { name: /^Föreslå placering för/u }).first(); await expect(origin).toBeFocused(); await origin.click();
  await panel(child).getByRole('button', { name: 'Godkänn förslag 1' }).click();
  await expect(weekButton(page, id)).toBeVisible(); await expect(child.getByText('Inga pass på viloytan.', { exact: true })).toBeVisible();
  await expect(child.getByRole('button', { name: 'Ångra senaste flytt', exact: true })).toBeFocused();
  expect(controls.at(-1)!.placements).toHaveLength(proposal.lessons.length);
  await child.getByRole('button', { name: 'Ångra senaste flytt', exact: true }).click();
  await expect(weekButton(page, id)).toHaveCount(0); await expect(child.getByRole('button', { name: /^Föreslå placering för/u }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Gör om', exact: true })).toBeEnabled();
});

test('tidsregler och andra icke-krockar kan inte markeras som medvetna', async ({ context, page }) => {
  await setup(context, page); const id = checked.move.lesson;
  await page.route('**/api/schema/kontroll', r => { const input = r.request().postDataJSON() as { placements: SchemaPlacement[] }; return r.fulfill({ headers, json: { ...checked.clash, contractVersion: SCHEMA_CONTRACT_VERSION, total: 1,
    violations: [{ code: 'outside_allowed', message: 'Passet ligger på spärrad tid.', lessons: [id] }], rooms: Object.fromEntries(input.placements.filter(p => p.room !== null).map(p => [p.lesson, p.room])) } }); });
  const form = await selectTarget(page, id); await form.getByRole('button', { name: 'Flytta hit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Regelavvikelser (1)', exact: true })).toBeVisible();
  await expect(page.getByText('Passet ligger på spärrad tid.', { exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Behåll som medveten krock', exact: true })).toHaveCount(0);
});
