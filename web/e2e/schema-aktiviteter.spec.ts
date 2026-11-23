// SM-AKTIVITETER: användarbeteende mot uttryckligt simulerade rutter och syntetiska uppgifter.
import { test, expect, type Page } from './schema-test';
import { valjVeckoresurs } from './schema-vecko-val';
import rawForslag from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaPlacement, type SchemaVillkor } from '../lib/schema-contract.ts';
import { aktivitetsPassId } from '../lib/schema-aktiviteter.ts';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
});

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const base = { ...rawForslag, contractVersion: SCHEMA_CONTRACT_VERSION } as unknown as SchemaForslag;
function forslag(villkor: SchemaVillkor, placements?: SchemaPlacement[]): SchemaForslag {
  const f = structuredClone(base), at = new Map(placements?.map(p => [p.lesson, p]));
  f.villkor = villkor; f.grundFingerprint = 'a'.repeat(27) + (villkor.aktiviteter?.length ? '1' : '0'); f.fingerprint = f.grundFingerprint;
  f.lessons = f.lessons.map(l => { const p = at.get(l.id); return p ? { ...l, day: p.day, startMin: p.startMin, roomId: p.room } : l; });
  for (const a of villkor.aktiviteter ?? []) {
    const id = aktivitetsPassId(a.id), p = at.get(id), tid = a.tid, day = tid.typ === 'fast' ? tid.day : p?.day ?? tid.days[0], startMin = tid.typ === 'fast' ? tid.startMin : p?.startMin ?? tid.startMin;
    f.lessons.push({ id, title: a.name, classIds: a.classRefs.flatMap(ref => { const n = f.resurser.klass.findIndex(c => c.ref === ref); return n >= 0 ? [`grupp-${n + 1}`] : []; }),
      teacherIds: a.teacherRefs.flatMap(ref => { const n = f.resurser.larare.findIndex(t => t.ref === ref); return n >= 0 ? [`larare-${n + 1}`] : []; }), roomIds: [], roomId: null, durationMin: a.durationMin,
      marginMin: 0, marginBeforeMin: 0, vacant: false, term: null, day, startMin,
      egenAktivitet: { id: a.id, typId: a.typId, typ: a.typ, veckor: a.veckor, visibleFor: a.visibleFor } });
  }
  f.metrics = { ...f.metrics, lessons: f.lessons.length, placed: f.lessons.length, unplaced: 0 };
  return f;
}
function kontroll(f: SchemaForslag, placements?: SchemaPlacement[]) {
  const at = new Map(placements?.map(p => [p.lesson, p])), own = f.lessons.filter(l => l.egenAktivitet), violations: { code: string; message: string; lessons: string[] }[] = [];
  for (const a of own) for (const l of f.lessons.filter(l => !l.egenAktivitet)) {
    const p = at.get(l.id) ?? (l.day !== null && l.startMin !== null ? { day: l.day, startMin: l.startMin } : null);
    if (p && p.day === a.day && p.startMin < a.startMin! + a.durationMin && a.startMin! < p.startMin + l.durationMin && l.classIds.some(id => a.classIds.includes(id)))
      violations.push({ code: 'student_clash', message: `Mentorstid krockar med ${l.title} för Klass 1.`, lessons: [a.id, l.id] });
  }
  return { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, fingerprint: f.fingerprint, violations, total: violations.length, teachings: f.teachings, trims: f.trims, metrics: f.metrics, rooms: {} };
}
async function setup(page: Page, reject = false, controls: Record<string, unknown>[] = []) {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: forslag(route.request().postDataJSON().villkor) }));
  await page.route('**/api/schema/aktiviteter', route => {
    const b = route.request().postDataJSON(); requests.push(b);
    if (reject) return route.fulfill({ headers, status: 403, json: { code: 'forbidden', correlationId: 'syntetiskt-prov' } });
    const f = forslag(b.villkor, b.placements);
    return route.fulfill({ headers, json: { forslag: f, kontroll: kontroll(f, b.placements) } });
  });
  await page.route('**/api/schema/kontroll', route => {
    const b = route.request().postDataJSON(), f = forslag(b.villkor, b.placements); controls.push(b); f.grundFingerprint = b.grundFingerprint;
    return route.fulfill({ headers, json: kontroll(f, b.placements) });
  });
  await page.goto(URL); await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('heading', { name: /Aktiviteter utanför/ })).toBeVisible();
  return requests;
}
async function laggTill(page: Page, context = true) {
  if (context) {
    const day = page.locator('ol[data-day="0"]').first(); await day.click({ button: 'right', position: { x: 2, y: 1 } });
    await page.getByRole('menuitem', { name: 'Ny aktivitet här', exact: true }).click();
  } else await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await expect(dialog).toBeVisible(); await dialog.getByLabel('Namn', { exact: true }).fill('Mentorstid prov');
  await dialog.getByRole('combobox', { name: 'Veckodag', exact: true }).selectOption('0'); await dialog.getByLabel('Start', { exact: true }).fill('08:00');
  await dialog.getByLabel('Klass 1', { exact: true }).check();
  await dialog.getByLabel(base.resurser.larare[0].name, { exact: true }).check();
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  return dialog;
}
for (const width of [1280, 1600]) test(`mentorstid via tom tid syns för klass och lärare, tas bort och ångras (${width})`, async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Arbetsytan är beslutad för dator.'); await page.setViewportSize({ width, height: 1000 });
  const requests = await setup(page); await laggTill(page);
  await expect(page.getByRole('dialog', { name: 'Ny aktivitet', exact: true })).toHaveCount(0);
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid');
  await page.screenshot({ path: info.outputPath('aktivitet-i-schemat.png'), fullPage: false });
  await valjVeckoresurs(page, 'Provlärare 1', 'Lärare');
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
  await valjVeckoresurs(page, 'Klass 1', 'Klass');
  const ordinary = base.lessons.find(l => l.classIds.includes('grupp-1') && l.term !== 'vt')!;
  await page.locator(`[data-lesson="${ordinary.id}"]`).focus(); await page.keyboard.press('Enter');
  const move = page.getByRole('form', { name: 'Flytta pass' });
  await move.getByRole('combobox', { name: 'Dag', exact: true }).selectOption('0'); await move.getByRole('combobox', { name: 'Starttid', exact: true }).selectOption('480');
  await move.getByRole('button', { name: 'Flytta hit', exact: true }).click();
  await expect(page.getByText(/Mentorstid krockar med/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Villkor i tabell', exact: true }).click(); await page.getByRole('tab', { name: 'Klasser', exact: true }).click();
  await expect(page.locator('.villkorstabell').getByRole('columnheader', { name: 'Aktiviteter', exact: true })).toBeVisible();
  const resourceRow = page.locator('.villkorstabell tr').filter({ has: page.getByRole('rowheader', { name: 'Klass 1', exact: true }) });
  await expect(resourceRow).toContainText('Mentorstid prov (Mentorstid)');
  await page.getByRole('group', { name: 'Visa schemat som', exact: true }).getByRole('button', { name: 'Vecka', exact: true }).click();
  await page.getByRole('button', { name: 'Ta bort aktiviteten Mentorstid prov', exact: true }).click();
  await expect(page.locator('.schema-lesson.aktivitet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ångra senaste aktivitet', exact: true }).click();
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
  expect(requests).toHaveLength(2);
  const cached = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('schema-villkor:')).map(([, value]) => value));
  expect(cached.join()).not.toContain('Mentorstid prov'); expect(cached.join()).not.toContain('aktiviteter');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('nekad aktivitetsbegäran lämnar det befintliga utkastet orört', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Arbetsytan är beslutad för dator.'); await page.setViewportSize({ width: 1280, height: 1000 });
  const requests = await setup(page, true); await laggTill(page, false);
  await expect(page.getByRole('dialog', { name: 'Ny aktivitet', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Ny aktivitet', exact: true }).getByRole('alert')).toHaveText('Ditt uppdrag tillåter inte den här åtgärden.');
  await expect(page.locator('.schema-lesson.aktivitet')).toHaveCount(0); expect(requests).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('aktivitet-nekat-svar.png'), fullPage: false });
});
test('typer kan grupperas, döpas om och återöppnas från serverutkastet', async ({ page, schemaDraftServer }, info) => {
  test.skip(info.project.name === 'phone', 'Arbetsytan är beslutad för dator.'); await page.setViewportSize({ width: 1280, height: 1000 }); await setup(page);
  await page.getByRole('button', { name: 'Hantera typer', exact: true }).click(); const types = page.getByRole('dialog', { name: 'Hantera aktivitetstyper' });
  await types.getByLabel('Typens namn', { exact: true }).fill('Planeringstid'); await types.getByRole('combobox', { name: 'Grupp', exact: true }).fill('Planering');
  await types.getByRole('button', { name: 'Lägg till typ', exact: true }).click(); await expect(types.getByRole('row', { name: /Planeringstid Planering/ })).toBeVisible();
  await types.getByRole('button', { name: 'Ändra typen Planeringstid' }).click(); await types.getByLabel('Typens namn', { exact: true }).fill('Gemensam planering');
  await types.getByRole('button', { name: 'Spara typen', exact: true }).click(); await types.getByRole('button', { name: 'Stäng', exact: true }).click();
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.activityTypes.some(t => t.name === 'Gemensam planering')).toBe(true);
  await expect(page.getByRole('region', { name: 'Sparat schemautkast' })).toContainText('Sparat på servern');
  await page.reload(); await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await expect(form.getByRole('option', { name: 'Gemensam planering' })).toHaveCount(1); await expect(form.getByRole('button', { name: 'Datum', exact: true })).toBeDisabled();
  await page.evaluate(() => document.documentElement.style.fontSize = '200%');
  await expect(form.getByRole('button', { name: 'Lägg till aktivitet', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('aktivitet-form-200.png'), fullPage: false });
});

// Aktivitetshistoriken återställer aktivitetslistan, inte senare tidsvillkor.
test('gemensam ångring återställer rast och aktivitet i rätt ordning', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Arbetsytan är beslutad för dator.');
  await page.setViewportSize({ width: 1280, height: 1000 });
  const controls: Record<string, unknown>[] = []; await setup(page, false, controls); await laggTill(page, false);
  await expect(page.getByRole('dialog', { name: 'Ny aktivitet', exact: true })).toHaveCount(0);
  await page.locator('details.schema-villkor > summary').click();
  const rast = page.getByRole('combobox', { name: 'Rast mellan pass', exact: true });
  const andraRast = async (n: number) => {
    const checked = page.waitForResponse(r => r.url().includes('/api/schema/kontroll') && r.request().postDataJSON().villkor.breakMin === n);
    await rast.selectOption(String(n)); await checked;
    await expect(page.getByRole('button', { name: 'Ta bort aktiviteten Mentorstid prov', exact: true })).toBeEnabled();
  };
  await andraRast(5);
  await page.getByRole('button', { name: 'Ta bort aktiviteten Mentorstid prov', exact: true }).click();
  await expect(page.locator('.schema-lesson.aktivitet')).toHaveCount(0);
  const checked = page.waitForResponse(r => r.url().includes('/api/schema/kontroll') && r.request().postDataJSON().villkor.breakMin === 15);
  await rast.selectOption('15'); await checked;
  await page.getByRole('button', { name: 'Ångra senaste villkor', exact: true }).click();
  await expect(rast).toHaveValue('5');
  await expect(page.getByRole('button', { name: 'Ångra senaste aktivitet', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Ångra senaste aktivitet', exact: true }).click();
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
  await expect(rast).toHaveValue('5');
  const sent = controls.at(-1)!.villkor as SchemaVillkor;
  expect(sent.breakMin).toBe(5); expect(sent.aktiviteter).toHaveLength(1); expect(sent.aktiviteter![0].name).toBe('Mentorstid prov');
});

test('ändrad uppdelning kan räknas om från aktivitetsdialogen utan att namn och deltagare försvinner', async ({ page }, info) => {
  const requests = await setup(page);
  await page.locator('details.schema-villkor > summary').click();
  await page.locator('details.schema-villkor').getByRole('combobox', { name: 'Längsta pass', exact: true }).selectOption('100');
  const dialog = await laggTill(page, false);
  await expect(dialog.getByRole('alert')).toContainText('längsta lektion');
  await expect(dialog.getByRole('button', { name: 'Ta fram nytt förslag och behåll formuläret', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('Mentorstid prov');
  await dialog.getByRole('button', { name: 'Ta fram nytt förslag och behåll formuläret', exact: true }).click();
  const panel = dialog.getByRole('region', { name: 'Granska nytt schemaförslag', exact: true });
  await panel.getByRole('button', { name: 'Använd förslaget', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('Mentorstid prov');
  await expect(dialog.getByLabel('Klass 1', { exact: true })).toBeChecked();
  await expect(dialog.getByLabel(base.resurser.larare[0].name, { exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
  expect((requests.at(-1)?.villkor as SchemaVillkor | undefined)?.maxLessonMin).toBe(100);
  await page.screenshot({ path: info.outputPath('aktivitet-efter-aterhamtning.png'), fullPage: false });
});

test('aktivitetens återhämtning släpper lås först efter ett lyckat nytt förslag och behåller formuläret vid motorfel', async ({ page }, info) => {
  await setup(page);
  const node = page.locator('[data-lesson="pass-7"]').first(); await node.focus(); await page.keyboard.press('l');
  await expect(page.locator('.schema-lesson .schema-las')).toHaveCount(1);
  await page.locator('details.schema-villkor > summary').click();
  await page.locator('details.schema-villkor').getByRole('combobox', { name: 'Längsta pass', exact: true }).selectOption('100');
  const dialog = await laggTill(page, false);
  const recover = dialog.getByRole('button', { name: 'Lås upp 1 pass och ta fram nytt förslag', exact: true }); await expect(recover).toBeVisible();
  let failures = 0;
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON(); expect(body.locks).toBeUndefined();
    if (failures++ === 0) return route.fulfill({ headers, status: 503, json: { code: 'schema_engine_unavailable', details: { reason: 'schema_engine_unreachable' } } });
    const f = forslag(body.villkor);
    f.lessons = f.lessons.map(l => l.id === 'pass-7' ? { ...l, startMin: l.startMin! + 10 } : l);
    return route.fulfill({ headers, json: f });
  });
  await recover.click(); await expect(dialog.getByRole('alert')).toContainText('Schemamotorn svarar inte');
  await expect(page.locator('.schema-lesson .schema-las')).toHaveCount(1); await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('Mentorstid prov');
  await expect(dialog.getByLabel('Klass 1', { exact: true })).toBeChecked(); await expect(recover).toBeEnabled();
  await page.screenshot({ path: info.outputPath('aktivitet-las-motorfel-bevarat.png'), fullPage: false });
  await recover.click();
  const panel = dialog.getByRole('region', { name: 'Granska nytt schemaförslag', exact: true });
  await expect(panel).toBeVisible();
  await expect(page.locator('.schema-lesson .schema-las')).toHaveCount(1);
  await panel.getByRole('button', { name: 'Använd förslaget', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.schema-lesson .schema-las')).toHaveCount(0); await expect(dialog.getByLabel('Namn', { exact: true })).toHaveValue('Mentorstid prov');
  await dialog.getByRole('button', { name: 'Lägg till aktivitet', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('.schema-lesson.aktivitet')).toContainText('Mentorstid prov');
});
