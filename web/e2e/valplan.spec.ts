// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseValplanCommand, type ValplanCommand } from '../lib/valplan-contract';
import { read, otherValplan, id } from './fixtures/valplan-data';
import { answerDiscard, autoAnswerDiscard, discardPrompt } from './helpers/confirm-dialog';
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
async function startIv(page: Page) {
  await page.getByRole('button', { name: /Skapa valbart block för SA26 – samhälle · Individuellt val · åk 2/ }).click();
  await page.getByRole('button', { name: 'Skapa nytt block' }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Individuellt val 2027/28');
  await expect(page.getByRole('checkbox', { name: /SA26 – samhälle · Individuellt val · åk 2/ })).toBeChecked();
}
async function createIv(page: Page) {
  await startIv(page);
  await page.getByRole('checkbox', { name: /NA26 · Individuellt val · åk 2/ }).check();
  for (const code of ['PSYL1000X', 'FILS1000X', 'RETO1000X']) {
    await page.getByLabel('Sök kurs att lägga till').fill(code);
    await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  }
}

test('skolan skapar ett block från en rad, lägger till en timplan och sparar kurser med tid och klassurval', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Valbara block.' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await expect(page.locator('.status-badge')).toHaveText('Sparad');
  expect(m.writes).toHaveLength(1);
  const w = m.writes[0];
  expect([w.expectedRevision, w.valplan.kind, w.valplan.rows.length, w.valplan.courses.length]).toEqual([0, 'individualChoice', 2, 3]);
  const r = w.valplan.courses.find(c => c.itemCode === 'RETO1000X')!;
  expect([r.minutesHt, r.minutesVt, r.classIds]).toEqual([2700, 2400, [id(20)]]);
  await expect(page.getByRole('button', { name: /Individuellt val 2027\/28/ })).toBeVisible();
  await page.getByLabel('Namn', { exact: true }).fill('IV 27/28');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[1].expectedRevision).toBe(1);
});

test('fel visas vid fältet och inget skickas förrän uppgifterna är rättade', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await createIv(page);
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, HT timmar/ }).fill('');
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, VT timmar/ }).fill('');
  await page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }).fill('12,5');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rätta markerade uppgifter' })).toBeVisible();
  await expect(page.getByText('Ange undervisningstid för HT eller VT.')).toBeVisible();
  await expect(page.getByText('Ange timmar, till exempel 40')).toBeVisible();
  expect(m.writes).toHaveLength(0);
  await page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }).fill('12:30');
  await page.getByRole('textbox', { name: /Filosofi – nivå 1, HT timmar/ }).fill('20');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes).toHaveLength(1);
});

test('konflikt och obekräftat svar ger tydliga vägar utan att dubbelspara', async ({ page }) => {
  const m = await mock(page); await page.goto(URL);
  await createIv(page);
  m.reject = { status: 409, reason: 'valplan_revision_conflict' };
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Någon annan har ändrat blocket.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hämta aktuellt läge' })).toBeVisible();
  m.reject = null; m.lose = true;
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Sparandet kunde inte bekräftas.')).toBeVisible();
  await page.getByRole('button', { name: 'Kontrollera sparstatus' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes.at(-1)!.commandId).toBe(m.writes.at(-2)!.commandId);
});

test('osparade ändringar skyddas vid byte av vy', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  await answerDiscard(page, false, () => page.getByRole('button', { name: 'Till annan vy' }).click());
  await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
  await answerDiscard(page, true, () => page.getByRole('button', { name: 'Till annan vy' }).click());
  await expect(page.getByText('Annan arbetsyta öppnad')).toBeVisible();
});

test('frågan om osparat besvaras med tangentbord och fungerar på telefon', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  const leave = page.getByRole('button', { name: 'Till annan vy' });
  await leave.focus(); await page.keyboard.press('Enter');
  const prompt = discardPrompt(page), stay = prompt.getByRole('button', { name: 'Stanna kvar', exact: true }), go = prompt.getByRole('button', { name: 'Lämna ändringarna', exact: true });
  await expect(prompt).toContainText('Du har osparade ändringar. Vill du lämna dem?');
  await expect(stay).toBeFocused();
  for (const button of [stay, go]) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0); await expect(leave).toBeFocused();
  await expect(page.getByLabel('Namn', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter'); await go.click();
  await expect(page.getByText('Annan arbetsyta öppnad')).toBeVisible();
});

test('kurs som läggs till före timplansraden får radens tid, och inskriven tid står kvar', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await startIv(page);
  const row = page.getByRole('checkbox', { name: /SA26 – samhälle · Individuellt val · åk 2/ });
  await row.uncheck();
  for (const code of ['PSYL1000X', 'FILS1000X']) {
    await page.getByLabel('Sök kurs att lägga till').fill(code);
    await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  }
  const psyHt = page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }), filHt = page.getByRole('textbox', { name: /Filosofi – nivå 1, HT timmar/ });
  await expect(psyHt).toHaveValue('0');
  await filHt.fill('10');
  await row.check();
  await expect(psyHt).toHaveValue('22:30');
  await expect(filHt).toHaveValue('10');
});

test('utan valbara rader förklarar sidan varför den är tom', async ({ page }) => {
  const m = await mock(page); m.state.rows = []; m.state.valplans = []; await page.goto(URL);
  await expect(page.locator('.empty-state')).toHaveText('Inga valbara rader 2027/28. Raderna visas här när en timplan med valbara block är fastställd och gäller läsåret.');
  await expect(page.getByRole('button', { name: /Skapa valbart block/ })).toHaveCount(0);
});

test('sidan har inga typknappar och visar först raderna som saknar block', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Rader som saknar block' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Skapa valbart block för/ })).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Moderna språk', exact: true })).toHaveCount(0);
  const [missing, blocks] = await Promise.all(['Rader som saknar block', 'Läsårets block'].map(name => page.getByRole('heading', { name }).boundingBox()));
  expect(missing!.y).toBeLessThan(blocks!.y);
});

test('från raden utan block av samma typ öppnas utkastet direkt med allt ifyllt', async ({ page }) => {
  const m = await mock(page); await page.goto(`${URL}?row=${id(14)}|block:mosp|2`);
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Moderna språk 2027/28');
  await expect(page.getByRole('checkbox', { name: /Moderna språk · åk 2/ })).toBeChecked();
  await expect(page.getByText('Typ', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Typ' })).toHaveCount(0);
  await expect(page.getByText('Lägg till minst en kurs innan du sparar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spara valbart block' })).toBeDisabled();
  await page.getByLabel('Språk för moderna språk').selectOption('es');
  await page.getByLabel('Sök kurs att lägga till').fill('MODO1000X');
  await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  await expect(page.getByText('Elevvalet öppnas från ett sparat block.')).toBeVisible();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[0].valplan.kind).toBe('modernLanguage');
  await expect(page.getByRole('button', { name: 'Elevval' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Spara valbart block' })).toHaveCount(0);
});

test('finns ett block av samma typ väljer användaren mellan det och ett nytt', async ({ page }) => {
  const m = await mock(page); await page.goto(`${URL}?row=${id(12)}|block:iv1|2`);
  await expect(page.getByLabel('Namn', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Avbryt' }).click();
  await expect(page.getByText('Välj ett block eller skapa ett från en rad som saknar block.')).toBeVisible();
  expect(m.writes).toHaveLength(0);
  await page.getByRole('button', { name: /Skapa valbart block för NA26/ }).click();
  await page.getByRole('button', { name: 'Lägg till i IV för EK' }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('IV för EK');
  await expect(page.getByRole('checkbox', { name: /NA26 · Individuellt val · åk 2/ })).toBeChecked();
  await expect(page.locator('.valplan-editor .status-badge')).toHaveText('Osparade ändringar');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect([m.writes[0].valplan.id, m.writes[0].valplan.rows.length]).toEqual([id(99), 2]);
});

test('fel i namnet visas vid fältet som får fokus', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  await page.getByLabel('Namn', { exact: true }).fill(' ');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Ange ett namn.')).toBeVisible();
  await expect(page.getByLabel('Namn', { exact: true })).toBeFocused();
});

test('språkämne och naturvetenskapligt ämne visar bara tillåtna ämnen', async ({ page }) => {
  const m = await mock(page), base = m.state.rows[0];
  m.state.rows.push({ ...base, timplanId: id(15), rowKey: 'block:sprk', blockKind: 'languageSubject' as never, rowLabel: 'Språkämne' }, { ...base, timplanId: id(16), rowKey: 'block:nave', blockKind: 'naturalScience' as never, rowLabel: 'Naturvetenskapligt ämne' });
  await page.goto(URL);
  const search = page.getByLabel('Sök kurs att lägga till');
  await page.getByRole('button', { name: /Skapa valbart block för .* Språkämne/ }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Språkämne 2027/28');
  await expect(page.getByText('Här finns moderna språk, engelska, klassisk grekiska och latin')).toBeVisible();
  await expect(page.getByLabel('Språk för moderna språk')).toBeVisible();
  await search.fill('LATI2000X'); await expect(page.getByRole('button', { name: /LATI2000X/ })).toBeVisible();
  await search.fill('PSYL1000X'); await expect(page.getByRole('button', { name: /PSYL1000X/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Skapa valbart block för .* Naturvetenskapligt ämne/ }).click();
  await expect(page.getByLabel('Språk för moderna språk')).toHaveCount(0);
  await search.fill('KEMI2000X'); await expect(page.getByRole('button', { name: /KEMI2000X/ })).toBeVisible();
  await search.fill('ENGE3000X'); await expect(page.getByRole('button', { name: /ENGE3000X/ })).toHaveCount(0);
});

test('ett orört utkast låser inte sidan och kan slängas', async ({ page }) => {
  await mock(page); await page.goto(URL);
  const dialogs: string[] = []; await autoAnswerDiscard(page, false, dialogs);
  await page.getByRole('button', { name: /Skapa valbart block för SA26 – samhälle · Moderna språk/ }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Moderna språk 2027/28');
  await startIv(page);
  expect(dialogs).toHaveLength(0);
  await page.getByRole('button', { name: 'Släng utkastet' }).click();
  await expect(page.getByText('Välj ett block eller skapa ett från en rad som saknar block.')).toBeVisible();
  await page.getByRole('button', { name: 'Till annan vy' }).click();
  await expect(page.getByText('Annan arbetsyta öppnad')).toBeVisible();
  expect(dialogs).toHaveLength(0);
});

test('rad utan klasser säger varför den inte kan få block, och kursen visar var klasserna kopplas', async ({ page }) => {
  const m = await mock(page); m.state.rows = m.state.rows.map(r => ({ ...r, classes: [], classIds: [] }));
  await page.goto(`${URL}?open=${id(99)}`);
  await expect(page.getByRole('button', { name: /Skapa valbart block för/ })).toHaveCount(0);
  await expect(page.getByText('Koppla klasser under Klasser och läsår i timplanen först.').first()).toBeVisible();
  await expect(page.getByText('Inga klasser kopplade 2027/28').first()).toBeVisible();
  await page.getByRole('button', { name: 'Lägg till kurs' }).click();
  await page.getByLabel('Sök kurs att lägga till').fill('RETO1000X');
  await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  const reto = page.getByRole('row', { name: /RETO1000X/ });
  await reto.getByText('Inga klasser ännu').click();
  await expect(reto.getByText('Inga klasser är kopplade till timplanerna 2027/28. Koppla klasser under Klasser och läsår i timplanen.')).toBeVisible();
});

test('kurser ryms när redigeringsytan är smal i ett brett fönster', async ({ page }) => {
  await mock(page); await page.setViewportSize({ width: 1000, height: 800 }); await page.goto(URL);
  await createIv(page);
  const wrap = page.locator('.valplan-table-wrap');
  expect(await wrap.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  const time = await page.getByRole('textbox', { name: /Psykologi – nivå 1, HT timmar/ }).boundingBox();
  expect(time!.width).toBeGreaterThanOrEqual(80);
  const remove = page.getByRole('button', { name: /Ta bort Psykologi/ });
  await remove.scrollIntoViewIfNeeded(); await expect(remove).toBeInViewport({ ratio: 1 });
});

test('öppna ett befintligt block direkt från timplanen', async ({ page }) => {
  await mock(page); await page.goto(`${URL}?open=${id(99)}`);
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('IV för EK');
  await expect(page.getByRole('button', { name: /IV för EK/ })).toHaveAttribute('aria-pressed', 'true');
});

test('klar rad säger vilket block som fyller den, fälls ut och öppnar blocket', async ({ page }) => {
  await page.goto(`${URL}?rows`);
  await expect(page.getByText('Enligt Individuellt val 2027/28')).toBeVisible();
  const toggle = page.getByRole('button', { name: 'Visa kurser' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus(); await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const courses = page.getByRole('list', { name: 'Kurser i Individuellt val 2027/28' });
  await expect(courses.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Läsår 2027/28 · årskurs 2 · SA26A, SA26B')).toBeVisible();
  await toggle.click(); await expect(courses).toHaveCount(0);
  const open = page.getByRole('button', { name: 'Öppna blocket' });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  await expect(page.getByText(`Öppnade ${id(5)}`)).toBeVisible();
});

test('rad som saknar block erbjuder att skapa det', async ({ page }) => {
  await page.goto(`${URL}?rows&none`);
  await expect(page.getByText('Saknar block 2027/28')).toBeVisible();
  await page.getByRole('button', { name: 'Skapa valbart block' }).click();
  await expect(page.getByText('Öppnade nytt block')).toBeVisible();
});

test('rad utan klasser leder till Klasser och läsår', async ({ page }) => {
  await page.goto(`${URL}?rows&noclasses`);
  await expect(page.getByText('Koppla klasser först.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skapa valbart block' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Till Klasser och läsår' }).click();
  await expect(page.getByText('Öppnade klasser')).toBeVisible();
});

test('rad i ett utkast säger när blocket kan kopplas', async ({ page }) => {
  await page.goto(`${URL}?rows&draft`);
  await expect(page.getByText('Valbart block', { exact: true })).toBeVisible();
  await expect(page.getByText('Kopplas när timplanen är fastställd.')).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(0);
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

test('frågan fungerar ovanpå en öppen dialog och Esc stänger bara frågan', async ({ page }) => {
  await page.goto(`${URL}?package`);
  const dialog = page.getByRole('dialog'), cancel = dialog.getByRole('button', { name: 'Avbryt', exact: true }), prompt = discardPrompt(page);
  await dialog.getByLabel('Paketnamn').fill('Samhällsfördjupning');
  await cancel.click(); await expect(prompt).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(prompt).toHaveCount(0); await expect(dialog).toBeVisible(); await expect(cancel).toBeFocused();
  await expect(dialog.getByLabel('Paketnamn')).toHaveValue('Samhällsfördjupning');
  await answerDiscard(page, false, () => cancel.click());
  await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Paketnamn')).toHaveValue('Samhällsfördjupning');
  await page.keyboard.press('Escape'); await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Lämna ändringarna', exact: true }).click();
  await expect(prompt).toHaveCount(0); await expect(page.getByText('Skickat stängd')).toBeVisible();
});

test('sidan ryms utan sidledsrullning', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await createIv(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const button of await page.getByRole('button', { name: 'Spara valbart block' }).all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
