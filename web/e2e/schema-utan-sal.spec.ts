// 05.2-SM-UXF-43: med salregister fylls ingen sal i. En flytt behåller passets sal bara där den är ledig, annars blir passet utan sal, och det syns
// före flytten. Simulerade rutter och syntetiska uppgifter; lägesruttens salprövning är prövad i schema-routes.test.mjs. Inget användarprov.
import { test, expect, type Page } from './schema-test';
import { headers, lagt, mockUnderlag } from './schema-underlag-mock';
import kontrollFixtur from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor, type SchemaPlacement, type SchemaVillkor } from '../lib/schema-contract.ts';
import { laggTillSal, sattSalbehov, tomtSalbehov } from '../lib/schema-salregister.ts';

const URL = '/e2e/fixtures/schema-preview.html', UNIT = '52a10000-0000-4000-8000-000000000001';
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function villkor(): SchemaVillkor {
  let v: SchemaVillkor = { ...defaultSchemaVillkor(), timeBasis: 'lasar' };
  for (const [name, platser] of [['A101', 32], ['A102', 30], ['A103', 28]] as const) v = laggTillSal(v, { name, typ: 'Allmän sal', platser, utrustning: [] });
  return sattSalbehov(v, 'amne', 'Svenska', tomtSalbehov('allman'));
}
// Det första lagda svenskpasset har sal A101 i förslaget; övriga pass står utan sal.
function forslag(v: SchemaVillkor) {
  const f = lagt(v), l = f.lessons.find(x => x.title === 'Svenska' && x.day !== null && x.roomIds.includes('sal-1'))!;
  f.lessons = f.lessons.map(x => ({ ...x, roomId: x.id === l.id ? 'sal-1' : null }));
  return { f, l };
}
async function mocka(page: Page) {
  const v = villkor(), { f, l } = forslag(v), kontroller: { placements: SchemaPlacement[] }[] = [];
  await mockUnderlag(page);
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => route.fulfill({ headers, json: f }));
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON() as { placements: SchemaPlacement[] }; kontroller.push(body);
    return route.fulfill({ headers, json: { ...kontrollFixtur.clash, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, violations: [], total: 0,
      rooms: Object.fromEntries(body.placements.filter(p => p.room).map(p => [p.lesson, p.room])) } });
  });
  // Lägesrutten med register: en start bort är salen upptagen, två starter bort är den ledig. Salen följer passets egen sal i begäran.
  await page.route('**/api/schema/lagen', route => {
    const body = route.request().postDataJSON() as { lesson: string; placements: SchemaPlacement[] }, egen = body.placements.find(p => p.lesson === body.lesson)?.room ?? null;
    const g = f.startGridMin, positions = [0, 1, 2].map(k => ({ day: l.day!, startMin: l.startMin! + k * g, room: k === 1 ? null : egen, state: 'fri', costDelta: 0, reasons: [] }));
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, fingerprint: 'a'.repeat(28), lesson: body.lesson, elev: false, positions } });
  });
  await page.addInitScript(([unit, value]) => { if (window.localStorage.getItem(`schema-villkor:${unit}`) === null) window.localStorage.setItem(`schema-villkor:${unit}`, value); }, [UNIT, JSON.stringify(v)] as const);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('.schema-week')).toBeVisible();
  return { kontroller, f, l };
}

test('flytt dit salen är upptagen: passet blir utan sal, och det sägs före och efter flytten', async ({ page }, info) => {
  const { kontroller, f, l } = await mocka(page);
  await page.locator(`.schema-week [data-lesson="${l.id}"]`).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel.getByLabel('Sal')).toContainText('Ingen sal');
  await expect(panel.getByLabel('Sal')).not.toContainText('Första lediga');
  await panel.getByRole('button', { name: 'Senare start' }).click();
  const mal = l.startMin! + f.startGridMin;
  await expect(panel.getByRole('status')).toContainText(`${clock(mal)}`);
  await expect(panel.getByRole('status')).toContainText('A101 är inte ledig då. Passet blir utan sal.');
  expect((await panel.getByRole('status').innerText()).split(clock(mal)).length - 1).toBe(1);
  // Kartan visar tiden som fri men med ett eget fält, och teckenförklaringen tar upp det.
  await expect(page.locator('.schema-week .falt-fri-utan-sal').first()).toBeVisible();
  await expect(page.locator('.schema-legend')).toContainText('Fri tid, men passet blir utan sal');
  if (process.env.SCHEMA_BILDER && info.project.name === 'desktop-1280') {
    await page.locator('.schema-week').screenshot({ path: `${process.env.SCHEMA_BILDER}/utan-sal.png` });
    const form = await panel.elementHandle();
    await form!.evaluate(e => { (e as HTMLElement).style.visibility = 'hidden'; });
    const dag = page.locator('.schema-week .schema-day').nth(l.day!);
    await page.locator('.schema-week .falt-fri-utan-sal').first().scrollIntoViewIfNeeded();
    await dag.screenshot({ path: `${process.env.SCHEMA_BILDER}/utan-sal-falt.png` });
    await page.locator('.schema-legend').screenshot({ path: `${process.env.SCHEMA_BILDER}/utan-sal-forklaring.png` });
    await form!.evaluate(e => { (e as HTMLElement).style.visibility = ''; });
  }
  const fore = kontroller.length;
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
  await expect.poll(() => kontroller.length).toBe(fore + 1);
  const flyttad = kontroller.at(-1)!.placements.find(p => p.lesson === l.id)!;
  expect([flyttad.day, flyttad.startMin, flyttad.room]).toEqual([l.day, mal, null]);
  await expect(page.getByText('Passet är utan sal: A101 var inte ledig då.')).toBeVisible();
  // Ingen sal fylldes i: Sal-beskedet räknar passet som utan sal.
  await expect(page.locator('[data-lage="sal"]')).toContainText('0 av');
});

test('flytt dit salen är ledig: passet behåller sin sal', async ({ page }) => {
  const { kontroller, f, l } = await mocka(page);
  await page.locator(`.schema-week [data-lesson="${l.id}"]`).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  const senare = panel.getByRole('button', { name: 'Senare start' });
  await senare.click(); await senare.click();
  const mal = l.startMin! + 2 * f.startGridMin;
  await expect(panel.getByRole('status')).toContainText(clock(mal));
  await expect(panel.getByRole('status')).not.toContainText('Passet blir utan sal');
  const fore = kontroller.length;
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
  await expect.poll(() => kontroller.length).toBe(fore + 1);
  const flyttad = kontroller.at(-1)!.placements.find(p => p.lesson === l.id)!;
  expect([flyttad.startMin, flyttad.room]).toEqual([mal, 'sal-1']);
  await expect(page.getByText('Passet är utan sal', { exact: false })).toHaveCount(0);
});
