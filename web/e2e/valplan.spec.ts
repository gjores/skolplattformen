// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseValplanCommand, type ValplanCommand } from '../lib/valplan-contract';
import { read, otherValplan, id } from './fixtures/valplan-data';
const URL = '/e2e/fixtures/valplan-preview.html';
const headers = { 'X-Context-Epoch': '1' };
async function mock(page: Page) {
  const m = { state: { ...read(), valplans: [otherValplan] as ReturnType<typeof read>['valplans'] }, writes: [] as ValplanCommand[], reject: null as null | { status: number; reason: string }, lose: false };
  await page.route('**/api/valplaner/**', async route => {
    const path = new globalThis.URL(route.request().url()).pathname;
    if (path.endsWith('/lasa')) return route.fulfill({ json: m.state, headers });
    const command = parseValplanCommand(route.request().postDataJSON()); m.writes.push(command);
    if (m.reject) return route.fulfill({ status: m.reject.status, json: { code: m.reject.status === 409 ? 'conflict' : 'bad_request', details: { reason: m.reject.reason } }, headers });
    if (m.lose) { m.lose = false; return route.abort('failed'); }
    const prior = m.writes.slice(0, -1).find(w => w.commandId === command.commandId);
    const stored = { ...command.valplan, revision: command.expectedRevision + 1, rows: [...command.valplan.rows].sort((a, b) => a.timplanId < b.timplanId ? -1 : 1) };
    if (!prior) {
      m.state.valplans = [...m.state.valplans.filter(v => (v.valplan as { id: string }).id !== stored.id), { catalogId: command.catalogId, valplan: stored }];
      m.state.rows = m.state.rows.map(r => ({ ...r, linkedValplanId: stored.rows.some(l => l.timplanId === r.timplanId && l.rowKey === r.rowKey) ? stored.id : r.linkedValplanId === stored.id ? null : r.linkedValplanId }));
    }
    return route.fulfill({ json: { receipt: { commandId: command.commandId, valplanId: stored.id, revision: stored.revision, replayed: !!prior }, read: m.state }, headers });
  });
  return m;
}
async function createIv(page: Page) {
  await page.getByRole('group', { name: 'Ny valplan' }).getByRole('button', { name: 'Individuellt val' }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Individuellt val 2027/28');
  await page.getByRole('checkbox', { name: /SA26 – samhälle · Individuellt val · åk 2/ }).check();
  await page.getByRole('checkbox', { name: /NA26 · Individuellt val · åk 2/ }).check();
  for (const code of ['PSYL1000X', 'FILS1000X', 'RETO1000X']) {
    await page.getByLabel('Sök kurs att lägga till').fill(code);
    await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  }
}

test('skolan skapar en valplan som fyller två timplaner och sparar kurser med tid och klassurval', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Valplaner.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /IV för EK/ })).toBeVisible();
  await createIv(page);
  await expect(page.getByRole('checkbox', { name: /EK26 · Individuellt val/ })).toBeDisabled();
  await expect(page.getByText('Fylls av IV för EK', { exact: false })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Moderna språk/ })).toHaveCount(0);
  const psyHt = page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ });
  await expect(psyHt).toHaveValue('22:30');
  await page.getByRole('textbox', { name: /Retorik – nivå 1, VT timmar/ }).fill('40');
  const reto = page.getByRole('row', { name: /RETO1000X/ });
  await reto.getByText('Alla klasser').click();
  await reto.getByRole('checkbox', { name: 'SA26B' }).uncheck(); await reto.getByRole('checkbox', { name: 'NA26A' }).uncheck();
  await expect(reto.getByText('1 av 3 klasser')).toBeVisible();
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByText('Valplanen är sparad.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Sparad');
  expect(m.writes).toHaveLength(1);
  const w = m.writes[0];
  expect([w.expectedRevision, w.valplan.kind, w.valplan.rows.length, w.valplan.courses.length]).toEqual([0, 'individualChoice', 2, 3]);
  const r = w.valplan.courses.find(c => c.itemCode === 'RETO1000X')!;
  expect([r.minutesHt, r.minutesVt, r.classIds]).toEqual([2700, 2400, [id(20)]]);
  await expect(page.getByRole('button', { name: /Individuellt val 2027\/28/ })).toBeVisible();
  await page.getByLabel('Namn', { exact: true }).fill('IV 27/28');
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByText('Valplanen är sparad.')).toBeVisible();
  expect(m.writes[1].expectedRevision).toBe(1);
});

test('fel visas vid fältet och inget skickas förrän uppgifterna är rättade', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await createIv(page);
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, HT timmar/ }).fill('');
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, VT timmar/ }).fill('');
  await page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }).fill('12,5');
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rätta markerade uppgifter' })).toBeVisible();
  await expect(page.getByText('Ange undervisningstid för HT eller VT.')).toBeVisible();
  await expect(page.getByText('Ange timmar, till exempel 40')).toBeVisible();
  expect(m.writes).toHaveLength(0);
  await page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }).fill('12:30');
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, HT timmar/ }).fill('20');
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByText('Valplanen är sparad.')).toBeVisible();
  expect(m.writes).toHaveLength(1);
});

test('konflikt och obekräftat svar ger tydliga vägar utan att dubbelspara', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await createIv(page);
  m.reject = { status: 409, reason: 'valplan_revision_conflict' };
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByText('Någon annan har ändrat valplanen.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hämta aktuellt läge' })).toBeVisible();
  m.reject = null; m.lose = true;
  await page.getByRole('button', { name: 'Spara valplan' }).click();
  await expect(page.getByText('Sparandet kunde inte bekräftas.')).toBeVisible();
  await page.getByRole('button', { name: 'Kontrollera sparstatus' }).click();
  await expect(page.getByText('Valplanen är sparad.')).toBeVisible();
  expect(m.writes.at(-1)!.commandId).toBe(m.writes.at(-2)!.commandId);
});

test('osparade ändringar skyddas vid byte av vy', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  page.once('dialog', dialog => void dialog.dismiss());
  await page.getByRole('button', { name: 'Till annan vy' }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
});

test('öppna en befintlig valplan direkt från timplanen', async ({ page }) => {
  await mock(page); await page.goto(`${URL}?open=${id(99)}`);
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('IV för EK');
  await expect(page.getByRole('button', { name: /IV för EK/ })).toHaveAttribute('aria-pressed', 'true');
});

test('timplanens valrad fälls ut och visar valplanens kurser', async ({ page }) => {
  await page.goto(`${URL}?rows`);
  const toggle = page.getByRole('button', { name: 'Enligt valplanen Individuellt val 2027/28' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const courses = page.getByRole('list', { name: 'Kurser i Individuellt val 2027/28' });
  await expect(courses.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Läsår 2027/28 · årskurs 2 · SA26A, SA26B')).toBeVisible();
  await page.getByRole('button', { name: 'Öppna valplanen' }).click();
  await expect(page.getByText(`Öppnade ${id(5)}`)).toBeVisible();
  await toggle.click(); await expect(courses).toHaveCount(0);
});

test('valrad utan valplan leder till valplanerna', async ({ page }) => {
  await page.goto(`${URL}?rows&none`);
  await page.getByRole('button', { name: 'Ingen valplan 2027/28' }).click();
  await expect(page.getByText('Ingen valplan fyller raden detta läsår.')).toBeVisible();
  await page.getByRole('button', { name: 'Öppna valplaner' }).click();
  await expect(page.getByText('Öppnade lista')).toBeVisible();
});

test('programplanens valpaket använder samma kurssökning', async ({ page }) => {
  await page.goto(`${URL}?package`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Paketnamn').fill('Samhällsfördjupning');
  for (const code of ['RETO1000X', 'GEOG1000X']) { await dialog.getByLabel('Sök paketnivå').fill(code); await dialog.getByRole('list', { name: 'Tillåtna paketnivåer' }).getByRole('button').first().click(); }
  await expect(dialog.getByText('200 av 200 poäng')).toBeVisible();
  await dialog.getByLabel('Sök paketnivå').fill('PSYL1000X');
  await expect(dialog.getByRole('list', { name: 'Tillåtna paketnivåer' }).getByRole('button').first()).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Skapa valpaket' })).toBeEnabled();
});

test('sidan ryms utan sidledsrullning', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const button of await page.getByRole('button', { name: 'Spara valplan' }).all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
