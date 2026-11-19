// Datumvyn mot syntetiskt kalenderunderlag och mockade appanrop; ingen inloggad Worker eller verklig anslutning.
import { test, expect, type Page } from './schema-test';
import { valjVeckoresurs, veckoval } from './schema-vecko-val';
import forslag from './schema-fixture';
import kontroll from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import type { SchemaDatumRequest } from '../lib/schema-datum.ts';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers: { 'X-Context-Epoch': '1' }, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
});

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };

async function start(page: Page, proposal = forslag as unknown as SchemaForslag, period?: 'vt') {
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await page.route('**/api/schema/kontroll', route => route.fulfill({ headers, json: { ...kontroll.clash, contractVersion: SCHEMA_CONTRACT_VERSION, violations: [], total: 0 } }));
  await page.goto(URL);
  if (period) await page.getByRole('combobox', { name: 'Schemat gäller', exact: true }).selectOption(period);
  if (proposal.villkor.salar.length) {
    const villkor = page.locator('details.schema-villkor');
    if (await villkor.getAttribute('open') === null) await villkor.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
    for (const sal of proposal.villkor.salar) {
      await villkor.getByLabel('Salens namn', { exact: true }).fill(sal);
      await villkor.getByRole('button', { name: 'Lägg till sal', exact: true }).click();
    }
    await villkor.getByRole('heading', { name: 'Villkor för schemat', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Tid · Alla pass har tid')).toBeVisible();
  return page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen' });
}

test('veckans sökväljare visar hela ämnet och undervisningsgruppens egna pass', async ({ page, schemaDraftServer }, info) => {
  const f = structuredClone(forslag) as unknown as SchemaForslag;
  const grupp = { ref: '52a10000-0000-4000-8000-000000000091', name: 'Mediegruppen' };
  f.resurser.grupp.push(grupp);
  const groupReads: unknown[] = [];
  await page.route('**/api/schema/samling', route => {
    groupReads.push(route.request().postDataJSON());
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, clusters: [], resources: [
      { key: `grupp:${grupp.ref}`, id: 'grupp-42', name: grupp.name, slag: 'grupp', lessons: ['pass-7'], busyLessons: ['pass-7', 'pass-36'], size: 7, antagen: false, year: null },
    ] } });
  });
  const datum = await start(page, f);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  const sparat = structuredClone(schemaDraftServer.saves);
  const week = page.locator('.schema-week');
  const ids = () => week.locator('[data-lesson]').evaluateAll(els => els.map(e => (e as HTMLElement).dataset.lesson).sort());
  await expect(veckoval(page)).toHaveValue('Klass 1 · Klass');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await valjVeckoresurs(page, grupp.name, 'Undervisningsgrupp', true);
  await expect.poll(ids).toEqual(['pass-7']);
  expect(groupReads).toHaveLength(1);
  await valjVeckoresurs(page, 'Matematik', 'Ämne', true);
  const math = f.lessons.filter(l => l.title === 'Matematik' && (l.term === 'ht' || l.term === null)).map(l => l.id).sort();
  await expect.poll(ids).toEqual(math);
  await veckoval(page).fill('Finns ej');
  await expect(page.getByText('Inga resurser matchar sökningen.')).toBeVisible();
  await expect.poll(ids).toEqual(math);
  await veckoval(page).press('Escape');
  await expect(veckoval(page)).toHaveValue('Matematik · Ämne');
  await datum.getByRole('button', { name: 'Jämför HT och VT', exact: true }).click();
  const extra = f.lessons.filter(l => l.title === 'Matematik' && (l.term === 'vt' || l.term === null)).map(l => l.id).sort();
  await expect.poll(ids).toEqual([...math, ...extra].sort());
  await page.getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  await page.getByRole('group', { name: 'Visa schemat som' }).getByRole('button', { name: 'Vecka', exact: true }).click();
  await expect(veckoval(page)).toHaveValue('Matematik · Ämne');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('veckans-resursval-200.png') });
  expect(schemaDraftServer.saves).toEqual(sparat);
});

test('salens vecka skiljer mellan grundschemat och ett tillfälle som byter sal', async ({ page, schemaDraftServer }) => {
  const f = structuredClone(forslag) as unknown as SchemaForslag;
  const pass = f.lessons.find(l => l.id === 'pass-7')!;
  f.rooms = [{ id: 'sal-1', name: 'Ateljén' }, { id: 'sal-2', name: 'Labbet' }];
  f.villkor.salar = f.rooms.map(room => room.name);
  pass.roomIds = f.rooms.map(room => room.id);
  pass.roomId = 'sal-1';
  const date = '2026-11-09';
  await page.route('**/api/schema/datum', route => {
    const input = route.request().postDataJSON() as SchemaDatumRequest;
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, fingerprint: f.fingerprint,
      datedOverrides: input.datedOverrides, checkedDates: [...new Set([...input.dates, date])], violations: [], total: 0, timeChanges: [],
    } });
  });
  const datum = await start(page, f);
  const entry = page.locator(`.schema-week [data-lesson="${pass.id}"]`);
  await valjVeckoresurs(page, 'Labbet', 'Sal');
  await expect(entry).toHaveCount(0);
  await valjVeckoresurs(page, 'Ateljén', 'Sal');
  await expect(entry).toBeVisible();
  await datum.getByRole('button', { name: 'Datumintervall', exact: true }).click();
  await datum.getByLabel('Från', { exact: true }).fill(date);
  await datum.getByLabel('Till', { exact: true }).fill(date);
  const tillfalle = page.locator(`[data-occurrence="${pass.id}@${date}"]`);
  await tillfalle.click();
  const dialog = page.getByRole('dialog', { name: 'Ändra ett tillfälle' });
  await dialog.getByRole('combobox', { name: 'Sal', exact: true }).selectOption('sal-2');
  await dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(tillfalle).toHaveCount(0);
  await valjVeckoresurs(page, 'Labbet', 'Sal');
  await expect(tillfalle).toContainText('Ändrat tillfälle');
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.datedOverrides[0]?.room).toBe('sal-2');
  await tillfalle.click();
  await dialog.getByRole('button', { name: /^Ändra grundschemat för alla veckor/u }).click();
  await expect(datum.getByRole('button', { name: 'Grundschema', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(veckoval(page)).toHaveValue('Ateljén · Sal');
  await expect(entry).toBeVisible();
  await expect(entry).not.toContainText(/i grundschemat|Salskrav:/u);
  await expect(page.getByRole('complementary', { name: 'Valt pass' })).toContainText('Salskrav: Ateljén eller Labbet');
});

test('Grundschema jämför HT och VT per veckodag, med rätt passlängd och direkt öppning i terminsvyn', async ({ page, schemaDraftServer }, info) => {
  const base = forslag as unknown as SchemaForslag;
  const proposal = { ...base, lessons: base.lessons.map(l => l.id === 'pass-7' ? { ...l, term: null } : l),
    trims: [...base.trims, { lesson: 'pass-7', term: 'vt' as const, fixedMin: 10, extraMin: 0, extraCount: 0 }] };
  const dateMode = await start(page, proposal);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  const saves = schemaDraftServer.saves.length;
  const compare = dateMode.getByRole('button', { name: 'Jämför HT och VT', exact: true });
  await compare.click();
  await expect(compare).toHaveAttribute('aria-pressed', 'true');
  await expect(dateMode.getByRole('button', { name: 'Höstterminen', exact: true })).toHaveAttribute('aria-pressed', 'false');
  const grid = page.getByRole('region', { name: 'Grundschema för höst och vår', exact: true });
  const mon = grid.getByRole('region', { name: 'Måndag', exact: true });
  const ht = mon.getByRole('region', { name: 'Höstterminen', exact: true });
  const vt = mon.getByRole('region', { name: 'Vårterminen', exact: true });
  const old = ht.locator('[data-lesson="pass-7"]'), spring = vt.locator('[data-lesson="pass-7"]');
  await expect(old.locator('time')).toHaveText('11:10–12:15');
  await expect(spring.locator('time')).toHaveText('11:10–12:10');
  await expect(ht.locator('[data-lesson="pass-36"]')).toBeVisible();
  await expect(vt.locator('[data-lesson="pass-36"]')).toHaveCount(0);
  await expect(vt.locator('[data-lesson="pass-12"]')).toBeVisible();
  await expect(ht.locator('[data-lesson="pass-12"]')).toHaveCount(0);
  expect(await grid.locator('.schema-terminspar').evaluateAll(days => days.length === 5 && days.every(day => {
    const [autumn, spring] = day.querySelectorAll('ol');
    return autumn.getBoundingClientRect().left < spring.getBoundingClientRect().left
      && autumn.getBoundingClientRect().top === spring.getBoundingClientRect().top;
  }))).toBe(true);
  await grid.screenshot({ path: info.outputPath('grundschema-ht-vt.png') });
  await valjVeckoresurs(page, 'Provlärare 4', 'Lärare');
  await expect(vt.locator('[data-lesson="pass-12"]')).toBeVisible();
  await expect(ht.locator('[data-lesson="pass-36"]')).toHaveCount(0);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  expect(await grid.evaluate(el => el.scrollWidth > el.clientWidth && document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await grid.focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => grid.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  await spring.focus();
  await page.keyboard.press('Enter');
  await expect(grid).toHaveCount(0);
  await expect(dateMode.getByRole('button', { name: 'Vårterminen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.schema-week [data-lesson="pass-7"]')).toBeFocused();
  await expect(page.getByRole('complementary', { name: 'Valt pass', exact: true })).toContainText('11:10–12:10');
  await compare.click();
  await expect(grid).toBeVisible();
  await dateMode.getByRole('button', { name: 'Datumintervall', exact: true }).click();
  await expect(compare).toHaveCount(0);
  await expect(grid).toHaveCount(0);
  expect(schemaDraftServer.saves).toHaveLength(saves);
});

test('grundschemat i ett vårterminsutkast öppnas på vårens pass och saknar jämförelseval', async ({ page }) => {
  const base = forslag as unknown as SchemaForslag;
  const dateMode = await start(page, { ...base, period: 'vt', time: { ...base.time, terms: base.time.terms.filter(t => t.term === 'vt') } }, 'vt');
  await expect(dateMode.getByRole('button', { name: 'Vårterminen', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.schema-week [data-lesson="pass-12"]')).toBeVisible();
  await expect(page.locator('.schema-week [data-lesson="pass-36"]')).toHaveCount(0);
  await expect(dateMode.getByRole('button', { name: 'Jämför HT och VT', exact: true })).toHaveCount(0);
});

test('SM-VECKOVY: lov, studiedag och klassens egen dag utan undervisning visas med datum och orsak', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Vecka', exact: true }).click();
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-10-26');
  await expect(page.locator('.schema-week .schema-lesson')).toHaveCount(0);
  await expect(page.locator('.schema-utan-undervisning')).toHaveCount(5);
  await expect(page.getByRole('heading', { name: /Måndag 26 okt/u })).toContainText('Lovdag');
  await expect(val.getByRole('status')).toContainText('Ändringar här gäller ett enskilt tillfälle');
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-11-09');
  await expect(page.locator('[data-date="2026-11-11"]')).toContainText('Studiedag');
  await expect(page.locator('[data-date="2026-11-11"] .schema-lesson')).toHaveCount(0);
  await valjVeckoresurs(page, 'Klass 12', 'Klass');
  await expect(page.locator('[data-date="2026-11-12"]')).toContainText('Friluftsdag');
  await expect(page.locator('[data-date="2026-11-12"] .schema-lesson')).toHaveCount(0);
  expect(await page.locator('.schema-day').evaluateAll(days => days.every(day => {
    const reason = day.querySelector('.schema-dagorsak'), ol = day.querySelector('ol');
    return !reason || !ol || reason.getBoundingClientRect().bottom <= ol.getBoundingClientRect().top + 1;
  })), 'Kalenderns orsak ska rymmas ovanför tidsbanan').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-kalender-${info.project.name}.png`, fullPage: true });
});

test('SM-VECKOVY: datumintervallet och passtabellen öppnar ändring av just ett tillfälle', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Datumintervall', exact: true }).click();
  await val.getByLabel('Från', { exact: true }).fill('2026-11-06');
  await val.getByLabel('Till', { exact: true }).fill('2026-11-16');
  await expect(page.locator('.schema-week .schema-day')).toHaveCount(11);
  await expect(page.locator('[data-date="2026-11-07"]')).toContainText('Helg');
  await page.getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  const rows = page.locator('.passtabell tr[data-passrad]');
  await expect(rows.first()).toBeVisible();
  await expect(rows.first()).toHaveAttribute('data-passrad', /@2026-11-/u);
  await expect(rows.first().locator('[data-col="6"]')).toContainText(/nov/u);
  await rows.first().locator('[data-col="1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Ändra ett tillfälle' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toHaveCount(0);
  await page.getByRole('dialog', { name: 'Ändra ett tillfälle' }).getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(val.getByRole('status')).toContainText('Ändringar här gäller ett enskilt tillfälle');
  await expect(val.getByLabel('Till', { exact: true })).toHaveAttribute('max', '2026-12-03');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-tabell-${info.project.name}.png`, fullPage: true });
});

test('SM-VECKOVY: tangentbord och 200 procent text ryms på dator', async ({ page }, info) => {
  const val = await start(page);
  await val.getByRole('button', { name: 'Vecka', exact: true }).focus();
  await page.keyboard.press('Space');
  await val.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption('2026-11-16');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(val.getByRole('button', { name: 'Nästa vecka' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await val.getByRole('button', { name: 'Nästa vecka' }).click();
  await expect(val.getByRole('combobox', { name: 'Vecka', exact: true })).toHaveValue('2026-11-23');
  if (process.env.SCHEMA_SHOTS) await page.screenshot({ path: `${process.env.SCHEMA_SHOTS}/vecka-stor-text-${info.project.name}.png`, fullPage: true });
});
