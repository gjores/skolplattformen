// SM-BYT: användarbeteende mot syntetiska, simulerade API-svar. Riktig motor verifieras i verify-koppling.mjs.
import { test, expect, type Page } from './schema-test';
import { SCHEMA_CONTRACT_VERSION } from '../lib/schema-contract.ts';
import fixture from './fixtures/schema-forslag.json' with { type: 'json' };
import kontroll from './fixtures/schema-kontroll.json' with { type: 'json' };
import folj from './fixtures/schema-folj.json' with { type: 'json' };
const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
const shots = process.env.SCHEMA_SHOTS;
const f = { ...fixture, contractVersion: SCHEMA_CONTRACT_VERSION, statistics: { lessons: [], bottlenecks: [], iterations: 0 } };
type Placement = { lesson: string; day: number; startMin: number; room: string | null };
async function start(page: Page) {
  const requests: { locks?: { grundFingerprint: string; placements: Placement[] } }[] = [];
  const checks: { placements: Placement[] }[] = [];
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const places = new Map<string, Placement>((body.locks?.placements ?? []).map((p: Placement) => [p.lesson, p]));
    return route.fulfill({ headers, json: { ...f, ...(body.locks ? { locks: body.locks.placements } : {}), lessons: f.lessons.map(l => { const p = places.get(l.id); return p ? { ...l, day: p.day, startMin: p.startMin, roomId: p.room } : l; }) } });
  });
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON(); checks.push(body);
    return route.fulfill({ headers, json: { ...kontroll.clash, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint,
      violations: [], total: 0, metrics: { ...kontroll.clash.metrics, placed: body.placements.length, unplaced: f.lessons.length - body.placements.length } } });
  });
  await page.route('**/api/schema/lagen', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...folj.alla, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, lesson: body.lesson } });
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('.schema-week')).toBeVisible();
  return { requests, checks };
}
const pass = (page: Page, id: string) => page.locator(`.schema-week [data-lesson="${id}"]`);
const visible = f.lessons.filter(l => l.classIds.includes(f.classes[0].id) && (l.term === null || l.term === 'ht') && l.day !== null);

test('möjlighetskartan syns vid tangentbordsflytt och under ett drag', async ({ page }, info) => {
  await start(page);
  const button = pass(page, visible[0].id);
  await button.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toBeVisible();
  await expect(page.locator('.schema-week .falt-fri').first()).toBeVisible();
  await expect(page.locator('.schema-week .falt-brott').first()).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/schema-byt-karta-${info.project.name}.png`, fullPage: true });
  await page.getByRole('form', { name: 'Flytta pass' }).getByRole('button', { name: 'Avbryt', exact: true }).click();
  const box = await button.boundingBox(); expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 20, box!.y + 16); await page.mouse.down(); await page.mouse.move(box!.x + 30, box!.y + 40, { steps: 4 });
  await expect(page.locator('.schema-week .falt-fri').first()).toBeVisible();
  await page.mouse.up();
});

test('passmenyn byter två pass och ett ångra återställer båda', async ({ page }) => {
  const calls = await start(page), a = visible[0], b = visible.find(l => l.id !== a.id && l.day !== a.day)!;
  await pass(page, a.id).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Byt med ett annat pass…' }).click();
  await pass(page, b.id).click();
  await expect.poll(() => calls.checks.length).toBe(1);
  const after = calls.checks[0].placements;
  expect(after.find(p => p.lesson === a.id)).toMatchObject({ day: b.day, startMin: b.startMin });
  expect(after.find(p => p.lesson === b.id)).toMatchObject({ day: a.day, startMin: a.startMin });
  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  await expect.poll(() => calls.checks.length).toBe(2);
  expect(calls.checks[1].placements.find(p => p.lesson === a.id)).toMatchObject({ day: a.day, startMin: a.startMin });
  expect(calls.checks[1].placements.find(p => p.lesson === b.id)).toMatchObject({ day: b.day, startMin: b.startMin });
});

test('tre pass markeras med skift, parkeras och återställs i ett steg', async ({ page }) => {
  const calls = await start(page), ids = visible.slice(0, 3).map(l => l.id);
  for (const id of ids) await pass(page, id).click({ modifiers: ['Shift'] });
  await expect(page.getByText('3 pass markerade', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Parkera markerade' }).click();
  await expect.poll(() => calls.checks.length).toBe(1);
  expect(calls.checks[0].placements.filter(p => ids.includes(p.lesson))).toEqual([]);
  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  for (const id of ids) await expect(pass(page, id)).toBeVisible();
});

test('klassens lås följer nästa begäran och visas i passtabellens filter', async ({ page }, info) => {
  const calls = await start(page);
  await page.getByRole('button', { name: 'Lås klassens schema' }).click();
  await expect(pass(page, visible[0].id)).toContainText('Låst');
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect.poll(() => calls.requests.length).toBe(2);
  const klass = f.lessons.filter(l => l.classIds.includes(f.classes[0].id) && l.day !== null);
  expect(calls.requests[1].locks?.placements.map(p => p.lesson).sort()).toEqual(klass.map(l => l.id).sort());
  for (const l of visible) await expect(pass(page, l.id)).toContainText('Låst');
  await page.getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  await page.getByRole('combobox', { name: 'Lägg till filter', exact: true }).selectOption('status|last');
  await expect(page.locator('.passtabell tbody tr')).toHaveCount(klass.length);
  await expect(page.locator('.passtabell tbody .status-badge').first()).toHaveText('Låst');
  if (shots) await page.screenshot({ path: `${shots}/schema-byt-last-${info.project.name}.png`, fullPage: true });
});

test('dagmenyn låser dagens pass och stor text behåller arbetsytans bredd', async ({ page }, info) => {
  await start(page);
  const day = visible[0].day!, heading = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'][day];
  await page.getByRole('button', { name: `Åtgärder för ${heading}` }).click();
  await page.getByRole('menuitem', { name: 'Lås hela dagen' }).click();
  for (const l of visible.filter(l => l.day === day)) await expect(pass(page, l.id)).toContainText('Låst');
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-byt-200-${info.project.name}.png`, fullPage: true });
});

test('markerade pass flyttas med samma tidsförskjutning och ramen markerar dagens pass', async ({ page }) => {
  const calls = await start(page), ls = visible.slice(0, 3), ids = ls.map(l => l.id);
  for (const id of ids) await pass(page, id).click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Flytta markerade' }).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  const day = ls[0].day!, starts = await panel.getByLabel('Starttid').locator('option').evaluateAll(els => els.map(el => Number((el as HTMLOptionElement).value)));
  const next = starts.find(t => t > ls[0].startMin!) ?? starts.find(t => t < ls[0].startMin!)!;
  const delta = next - ls[0].startMin!;
  await panel.getByLabel('Dag').selectOption(String(day));
  await panel.getByLabel('Starttid').selectOption(String(next));
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
  await expect.poll(() => calls.checks.length).toBe(1);
  for (const l of ls) expect(calls.checks[0].placements.find(p => p.lesson === l.id)).toMatchObject({ day: l.day, startMin: l.startMin! + delta });
  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  await expect.poll(() => calls.checks.length).toBe(2);
  await expect(page.getByRole('button', { name: 'Ångra senaste flytt' })).toBeDisabled();
  const own = page.locator(`.schema-week ol[data-day="${day}"]`);
  await own.scrollIntoViewIfNeeded();
  // Hela dagen ska ligga nedanför den fasta ångraraden, som kan täcka en punkt inom viewporten.
  await own.evaluate(el => {
    const bar = document.querySelector('.schema-moves')?.getBoundingClientRect();
    if (bar) window.scrollBy(0, el.getBoundingClientRect().top - bar.bottom - 8);
  });
  await expect(own).toBeInViewport({ ratio: 1 });
  const b = (await own.boundingBox())!;
  const from = { x: b.x + b.width - 1, y: b.y + 2 }, to = { x: b.x + 1, y: b.y + b.height - 2 };
  // Börja på kolumnens tomma kant: träffytan ska ligga i dagen och inte i en passknapp.
  expect(await own.evaluate((el, point) => { const hit = document.elementFromPoint(point.x, point.y); return !!hit && el.contains(hit) && !hit.closest('.schema-lesson'); }, from)).toBe(true);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(page.locator('.schema-urvalsram')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.schema-urvalsram')).toHaveCount(0);
  const count = visible.filter(l => l.day === day).length;
  await expect(page.getByText(`${count} pass markerade`, { exact: true })).toBeVisible();
});


test('låst pass har tydligt besked och markeringen kan avbrytas utan upplåsning', async ({ page }) => {
  await start(page); const l = visible[0], node = pass(page, l.id);
  await node.focus(); await page.keyboard.press('l');
  await expect(node).toContainText('Låst');
  await node.click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel.getByText('Passet är låst. Lås upp det innan du flyttar det.', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Flytta hit', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Kontrollerar…', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Avbryt', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Avbryt', exact: true }).click();
  await expect(panel).toHaveCount(0); await expect(node).toContainText('Låst');
});

test('Byt-verktyget byter två pass när ett pass släpps på det andra', async ({ page }) => {
  const calls = await start(page), a = visible[0], b = visible.find(l => l.id !== a.id && l.day !== a.day)!;
  await page.getByRole('button', { name: 'Byt', exact: true }).click();
  const week = page.locator('.schema-week');
  await week.scrollIntoViewIfNeeded();
  // Musens båda faktiska passytor ska vara helt i bild; veckans ytterkant kan få avrundad intersection-ratio.
  await expect(pass(page, a.id)).toBeInViewport({ ratio: 1 });
  await expect(pass(page, b.id)).toBeInViewport({ ratio: 1 });
  const from = (await pass(page, a.id).boundingBox())!, to = (await pass(page, b.id).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 12);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(18, to.height / 2), { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => calls.checks.length).toBe(1);
  expect(calls.checks[0].placements.find(p => p.lesson === a.id)).toMatchObject({ day: b.day, startMin: b.startMin });
  expect(calls.checks[0].placements.find(p => p.lesson === b.id)).toMatchObject({ day: a.day, startMin: a.startMin });
});
