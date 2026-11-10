// Riktiga React-flöden mot syntetiska API-svar; SQL, behörighet och installation verifieras separat.
import { test, expect, type Page } from '@playwright/test';
import { parseValplanCommand, type ValplanCommand } from '../lib/valplan-contract';
import type { Valplan } from '../lib/valplan-model';
import { read, otherValplan, id, version, type CourseChoices } from './fixtures/valplan-data';
import { read as choiceRead } from './fixtures/valplan-choice-data';
import { answerConfirm, answerDiscard, autoAnswerDiscard, discardPrompt } from './helpers/confirm-dialog';
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
      const kept = m.state.valplans.find(v => (v.valplan as { id: string }).id === stored.id);
      m.state.valplans = [...m.state.valplans.filter(v => (v.valplan as { id: string }).id !== stored.id), { catalogId: command.catalogId, valplan: stored, choiceCounts: kept?.choiceCounts ?? [], courseChoices: kept?.courseChoices ?? [] }];
      m.state.rows = m.state.rows.map(r => ({ ...r, blocks: m.state.valplans.flatMap(v => (v.valplan as Valplan).rows.filter(l => l.timplanId === r.timplanId && l.rowKey === r.rowKey && l.year === r.year)
        .map(l => ({ valplanId: (v.valplan as Valplan).id, classIds: r.classIds.filter(c => !l.excludedClassIds.includes(c)) }))) }));
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
  await expect(reto.getByText('Alla klasser', { exact: true })).toBeVisible();
  await reto.getByRole('button', { name: /Ändra klasser/ }).click();
  const picks = page.getByRole('group', { name: /Klasser som får läsa Retorik/ });
  await picks.getByRole('checkbox', { name: 'SA26B' }).uncheck(); await expect(reto.getByText('Alla klasser utom SA26B', { exact: true })).toBeVisible();
  await picks.getByRole('checkbox', { name: 'NA26A' }).uncheck();
  await expect(reto.getByText('Bara SA26A', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await expect(page.locator('.valplan-editor .section-heading .status-badge')).toHaveText('Sparad');
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
  await page.getByRole('combobox', { name: /^Språk/ }).selectOption('es');
  await page.getByLabel('Sök kurs att lägga till').fill('MODO1000X');
  await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  await expect(page.getByText('Elevvalet öppnas från ett sparat block.')).toBeVisible();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[0].valplan.kind).toBe('modernLanguage');
  await expect(page.getByRole('button', { name: 'Elevval' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Spara valbart block' })).toHaveCount(0);
});

test('moderna språk tar modersmål, teckenspråk och minoritetsspråk med rätt språk', async ({ page }) => {
  const m = await mock(page); await page.goto(`${URL}?row=${id(14)}|block:mosp|2`);
  const language = page.getByRole('combobox', { name: /^Språk/ }), search = page.getByLabel('Sök kurs att lägga till');
  const pick = async (code: string) => { await search.fill(code); await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button', { name: new RegExp(code) }).click(); };
  await pick('MODE1000X');
  await expect(page.getByText('Välj språk innan du lägger till kursen.')).toBeVisible();
  await language.selectOption('ar'); await pick('MODE1000X');
  await language.selectOption('so'); await pick('MODE1000X');
  await language.selectOption(''); await pick('SVEY1000X'); await pick('FINX1000X');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[0].valplan.courses.map(c => [c.subjectCode, c.languageCode])).toEqual([['MODE', 'ar'], ['MODE', 'so'], ['SVEY', null], ['FINX', 'fi']]);
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
  await expect(page.locator('.valplan-editor .section-heading .status-badge')).toHaveText('Osparade ändringar');
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
  await expect(page.getByRole('combobox', { name: /^Språk/ })).toBeVisible();
  await search.fill('LATI2000X'); await expect(page.getByRole('button', { name: /LATI2000X/ })).toBeVisible();
  await search.fill('PSYL1000X'); await expect(page.getByRole('button', { name: /PSYL1000X/ })).toHaveCount(0);
  await search.fill('MODE1000X'); await expect(page.getByRole('button', { name: /MODE1000X/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Skapa valbart block för .* Naturvetenskapligt ämne/ }).click();
  await expect(page.getByRole('combobox', { name: /^Språk/ })).toHaveCount(0);
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
  const m = await mock(page); m.state.rows = m.state.rows.map(r => ({ ...r, classes: [], classIds: [], blocks: r.blocks.map(b => ({ ...b, classIds: [] })) }));
  await page.goto(`${URL}?open=${id(99)}`);
  await expect(page.getByRole('button', { name: /Skapa valbart block för/ })).toHaveCount(0);
  await expect(page.getByText('Koppla klasser under Klasser och läsår i timplanen först.').first()).toBeVisible();
  await expect(page.getByText('Inga klasser kopplade 2027/28').first()).toBeVisible();
  await page.getByRole('button', { name: 'Lägg till kurs' }).click();
  await page.getByLabel('Sök kurs att lägga till').fill('RETO1000X');
  await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  const reto = page.getByRole('row', { name: /RETO1000X/ });
  await expect(reto.getByText('Inga klasser ännu')).toBeVisible();
  await expect(reto.getByRole('button', { name: /Ändra klasser/ })).toHaveCount(0);
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

const classBox = (page: Page, name: string, plan = 'SA26 – samhälle') => page.getByRole('checkbox', { name: `Klass ${name}, ${plan}, Individuellt val, åk 2` });
const pickCourse = async (page: Page, code: string) => { await page.getByLabel('Sök kurs att lägga till').fill(code); await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click(); };

test('kryssa ur en klass, se Delvis, lägg klassen i ett annat block och se Klart', async ({ page }, info) => {
  const m = await mock(page); await page.goto(URL);
  await startIv(page);
  await expect(classBox(page, 'SA26A')).toBeChecked(); await expect(classBox(page, 'SA26B')).toBeChecked();
  await classBox(page, 'SA26B').uncheck();
  await expect(page.getByText('Saknar block', { exact: true })).toBeVisible();
  await expect(page.getByText('SA26B saknar block och kan inte välja förrän klassen ligger i ett block. Det stoppar inte det här blocket.')).toBeVisible();
  await pickCourse(page, 'PSYL1000X');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[0].valplan.rows[0].excludedClassIds).toEqual([id(21)]);
  await expect(page.getByText('Klasser utan block: SA26B')).toBeVisible();
  await expect(page.getByRole('button', { name: /Individuellt val 2027\/28/ }).getByText('Utan block: SA26B')).toBeVisible();
  await page.screenshot({ path: info.outputPath('sidan-delvis.png'), fullPage: true });

  await page.goto(`${URL}?rows&live`);
  await expect(page.getByText('1 av 2 klasser har block')).toBeVisible();
  const next = page.getByRole('button', { name: 'Välj block för SA26B' });
  await expect(next).toBeVisible(); expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('raden-delvis.png'), fullPage: true });

  await page.goto(`${URL}?row=${id(11)}|block:iv1|2`);
  await expect(page.getByText('SA26B saknar block.')).toBeVisible();
  await page.screenshot({ path: info.outputPath('valet-av-block.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lägg till i IV för EK' }).click();
  await expect(classBox(page, 'SA26B')).toBeChecked();
  await expect(classBox(page, 'SA26A')).not.toBeChecked(); await expect(classBox(page, 'SA26A')).toBeDisabled();
  await expect(page.getByText('Ingår i Individuellt val 2027/28')).toBeVisible();
  await page.screenshot({ path: info.outputPath('andra-blocket.png'), fullPage: true });
  await page.getByRole('button', { name: 'Lägg till kurs' }).click();
  await pickCourse(page, 'FILS1000X');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  const saved = m.writes.at(-1)!.valplan;
  expect(saved.rows.find(l => l.timplanId === id(11))!.excludedClassIds).toEqual([id(20)]);
  await expect(page.getByText('Klasser utan block')).toHaveCount(0);

  await page.goto(`${URL}?rows&live`);
  await expect(page.getByText('Enligt Individuellt val 2027/28 och IV för EK')).toBeVisible();
  await expect(page.getByRole('button', { name: /Välj block/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Visa kurser' }).click();
  await expect(page.getByText('IV för EK: SA26B')).toBeVisible();
  await page.screenshot({ path: info.outputPath('raden-klar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Öppna IV för EK' }).click();
  await expect(page.getByText(`Öppnade ${id(99)}`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const saved = (extra: Partial<Valplan> = {}, choiceCounts: { classId: string; pupils: number }[] = [], courseChoices: CourseChoices[] = []) => ({ catalogId: otherValplan.catalogId, choiceCounts, courseChoices, valplan: { id: id(50), unitId: otherValplan.valplan.unitId, schoolYear: otherValplan.valplan.schoolYear, kind: 'individualChoice', name: 'Sparat block', revision: 1, courses: [],
  rows: [{ timplanId: id(11), timplanVersion: 1, rowKey: 'block:iv1', year: 2, excludedClassIds: [] as string[] }], ...extra } });

test('en klass med lämnade val kryssas ur först efter frågan med antal elever', async ({ page }) => {
  const m = await mock(page); const block = saved({}, [{ classId: id(21), pupils: 3 }]);
  m.state.valplans = [...m.state.valplans, block]; m.state.rows[0] = { ...m.state.rows[0], blocks: [{ valplanId: id(50), classIds: [id(20), id(21)] }] };
  await page.goto(`${URL}?open=${id(50)}`);
  await classBox(page, 'SA26A').uncheck();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await classBox(page, 'SA26A').check();
  const prompt = page.getByRole('alertdialog', { name: 'Elever har lämnat val', exact: true });
  await answerConfirm(page, 'Elever har lämnat val', 'Behåll klassen', async () => { await classBox(page, 'SA26B').click(); await expect(prompt).toContainText('3 elever i SA26B har lämnat val i blocket.'); await expect(prompt).toContainText('Valen finns kvar under Elevval'); });
  await expect(classBox(page, 'SA26B')).toBeChecked();
  await answerConfirm(page, 'Elever har lämnat val', 'Kryssa ur klassen', () => classBox(page, 'SA26B').click());
  await expect(classBox(page, 'SA26B')).not.toBeChecked();
  await classBox(page, 'SA26B').check();
  await answerConfirm(page, 'Elever har lämnat val', 'Ta bort raden', () => page.getByRole('checkbox', { name: /SA26 – samhälle · Individuellt val · åk 2/ }).click());
  await expect(page.getByRole('checkbox', { name: /SA26 – samhälle · Individuellt val · åk 2/ })).not.toBeChecked();
});

test('en senare kopplad klass i två block syns på raden och stoppar sparandet tills den är löst', async ({ page }) => {
  const m = await mock(page), first = saved(), other = saved({ id: id(51), name: 'Andra blocket' });
  first.valplan.rows[0].excludedClassIds = [id(21)]; other.valplan.rows[0].excludedClassIds = [id(20)];
  m.state.rows[0] = { ...m.state.rows[0], classIds: [id(20), id(21), id(24)], classes: [...m.state.rows[0].classes, { id: id(24), name: 'SA26C' }], blocks: [{ valplanId: id(50), classIds: [id(20), id(24)] }, { valplanId: id(51), classIds: [id(21), id(24)] }] };
  m.state.valplans = [...m.state.valplans, first, other];
  await page.goto(`${URL}?rows&live`);
  await expect(page.getByText('SA26C finns i två block')).toBeVisible();
  await page.goto(URL);
  await expect(page.getByText('Finns i två block: SA26C')).toBeVisible();
  await page.getByRole('button', { name: /Välj block för SA26C/ }).click();
  await expect(page.getByLabel('Namn', { exact: true })).toHaveValue('Sparat block');
  await expect(page.locator('.valplan-class-picks').getByText('Finns också i Andra blocket.')).toBeVisible();
  await expect(page.locator('.valplan-check-list').getByText('SA26C finns också i Andra blocket. Kryssa ur klassen här eller i det blocket.')).toBeVisible();
  await expect(page.getByText(/saker återstår innan elevvalet kan öppnas/)).toBeVisible();
  await page.getByLabel('Namn', { exact: true }).fill('Omdöpt');
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(classBox(page, 'SA26C')).toBeFocused();
  expect(m.writes).toHaveLength(0);
  await classBox(page, 'SA26C').uncheck();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes[0].valplan.rows[0].excludedClassIds).toEqual([id(21), id(24)].sort());
});

test('en kurs följer blockets klasser, och alla klasser på en rad går inte att kryssa ur', async ({ page }) => {
  await mock(page); await page.goto(URL);
  await startIv(page);
  await pickCourse(page, 'RETO1000X');
  const reto = page.getByRole('row', { name: /RETO1000X/ });
  await reto.getByRole('button', { name: /Ändra klasser/ }).click();
  await page.getByRole('group', { name: /Klasser som får läsa Retorik/ }).getByRole('checkbox', { name: 'SA26A' }).uncheck();
  await expect(reto.getByText('Alla klasser utom SA26A', { exact: true })).toBeVisible();
  await classBox(page, 'SA26B').uncheck();
  await expect(page.getByText('En vald klass ingår inte längre i blocket.')).toBeVisible();
  await classBox(page, 'SA26A').uncheck();
  await expect(page.getByText('Kryssa i minst en klass, eller ta bort raden från blocket.')).toBeVisible();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Rätta markerade uppgifter' })).toBeVisible();
});

const classes15 = Array.from({ length: 15 }, (_, i) => ({ id: id(200 + i), name: `SA27${String.fromCharCode(65 + i)}` }));
const course = (n: number, subjectCode: string, itemCode: string, points: number) => ({ id: id(300 + n), subjectCode, subjectVersion: version(subjectCode), itemCode, points, languageCode: null, name: `Kurs ${n}`, minutesHt: 2700, minutesVt: 2700, classIds: null as string[] | null });

test('kursen säger vilka som får läsa den, också med 15 klasser, och tangentbordet når alla kryssrutor', async ({ page, browserName }, info) => {
  const m = await mock(page), tab = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  m.state.rows[0] = { ...m.state.rows[0], classIds: classes15.map(c => c.id), classes: classes15 };
  await page.goto(URL);
  await startIv(page); await pickCourse(page, 'RETO1000X');
  const reto = page.getByRole('row', { name: /RETO1000X/ }), edit = reto.getByRole('button', { name: 'Ändra klasser för Retorik – nivå 1' });
  await expect(reto.getByText('Alla klasser', { exact: true })).toBeVisible();
  expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await edit.focus(); await page.keyboard.press('Enter');
  await expect(edit).toHaveAttribute('aria-expanded', 'true');
  const picks = page.getByRole('group', { name: /Klasser som får läsa Retorik/ });
  await page.keyboard.press(tab); await expect(reto.getByRole('button', { name: /Ta bort/ })).toBeFocused();
  for (const k of classes15) { await page.keyboard.press(tab); const box = picks.getByRole('checkbox', { name: k.name, exact: true }); await expect(box).toBeFocused(); if (k.name === 'SA27B') { await page.keyboard.press('Space'); await expect(box).not.toBeChecked(); } }
  await expect(reto.getByText('Alla klasser utom SA27B', { exact: true })).toBeVisible();
  for (const label of await picks.locator('label').all()) expect((await label.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await picks.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('kurs-15-klasser.png'), fullPage: true });
  for (const k of classes15.slice(2)) await picks.getByRole('checkbox', { name: k.name, exact: true }).uncheck();
  await expect(reto.getByText('Bara SA27A', { exact: true })).toBeVisible();
  await expect(page.locator('.valplan-check-list').getByText('14 klasser har ingen kurs att välja, och 100 p ska fyllas.')).toBeVisible();
  await edit.click(); await expect(picks).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function choiceMock(page: Page) {
  const opened: string[] = [];
  await page.route('**/api/valplaner/val/**', async route => {
    const body = route.request().postDataJSON(), state = { ...choiceRead(), unitId: body.unitId, schoolYear: body.schoolYear, valplanId: body.valplanId, guardianConfirmation: false };
    if (route.request().url().endsWith('/lasa')) return route.fulfill({ json: state, headers });
    opened.push(body.action);
    return route.fulfill({ json: { receipt: { commandId: body.commandId, action: body.action, replayed: false }, read: { ...state, round: { id: id(41), status: 'open', closesOn: body.payload.closesOn, guardianConfirmation: false, revision: 1, accepting: true } } }, headers });
  });
  return opened;
}

test('kontrollen säger vad som återstår, elevvalet öppnas inte, och ett rättat fel ger klar kontroll', async ({ page }, info) => {
  const m = await mock(page), opened = await choiceMock(page), list = page.locator('.valplan-check-list'); await page.goto(URL);
  await startIv(page);
  await expect(list.getByText('Lägg till minst en kurs.')).toBeVisible();
  await expect(list.getByText('SA26A och SA26B har ingen kurs att välja, och 100 p ska fyllas.')).toBeVisible();
  await expect(page.getByText('2 saker återstår innan elevvalet kan öppnas.')).toBeVisible();
  await pickCourse(page, 'PSYL1000X');
  await expect(list.getByText('SA26A och SA26B når inte exakt 100 p. Närmast går 50 p med kurser klassen får läsa och inte redan läser.')).toBeVisible();
  await expect(list.getByText('1 kurs att välja.')).toBeVisible();
  const box = list.getByRole('listitem').filter({ hasText: 'Poäng' });
  await expect(box.locator('.status-badge')).toHaveText('Återstår');
  await box.getByRole('button', { name: 'Till kurserna' }).click();
  await expect(page.getByRole('heading', { name: 'Kurser', exact: true })).toBeFocused();
  await list.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('kontroll-aterstar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await expect(page.getByText('Elevvalet går inte att öppna förrän det som återstår under Kontroll är löst.')).toBeVisible();
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  const open = page.getByRole('button', { name: 'Öppna val', exact: true });
  await expect(page.getByText('Valet går inte att öppna förrän det som återstår under Kontroll i blocket är löst:')).toBeVisible();
  await expect(page.getByText('SA26A och SA26B når inte exakt 100 p.')).toBeVisible();
  await page.getByLabel('Sista valdag').fill('2027-12-01');
  await expect(open).toBeDisabled(); expect(opened).toHaveLength(0);
  await page.screenshot({ path: info.outputPath('elevval-stoppat.png'), fullPage: true });
  await page.getByRole('button', { name: 'Tillbaka till blocket' }).click();
  await page.getByRole('button', { name: 'Lägg till kurs' }).click();
  await pickCourse(page, 'FILS1000X');
  await expect(page.getByText('Allt är klart för elevval.')).toBeVisible();
  await expect(box.locator('.status-badge')).toHaveText('Klart');
  await expect(list.getByText('Varje klass kan nå exakt sina poäng med kurser den får läsa.')).toBeVisible();
  await expect(page.locator('.valplan-check-list .status-badge').filter({ hasText: 'Återstår' })).toHaveCount(0);
  await list.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('kontroll-klar.png'), fullPage: true });
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  await page.getByLabel('Sista valdag').fill('2027-12-01');
  await open.click();
  await expect(page.getByText('Valet är öppet för eleverna.')).toBeVisible();
  expect(opened).toEqual(['open_round']);
  expect(m.writes).toHaveLength(2);
});

test('en kurs alla klasser läser går inte att lägga till, och läser några tas de bort från kursen med en notis', async ({ page }, info) => {
  const m = await mock(page);
  m.state.classCourses = [id(20), id(21), id(22)].map(classId => ({ classId, courses: [{ subjectCode: 'ENGE', itemCode: 'ENGE1000X' }] }));
  m.state.classCourses[0].courses.push({ subjectCode: 'PSYL', itemCode: 'PSYL1000X' }); m.state.classCourses[1].courses.push({ subjectCode: 'PSYL', itemCode: 'PSYL1000X' });
  await page.goto(URL); await startIv(page); await page.getByRole('checkbox', { name: /NA26 · Individuellt val · åk 2/ }).check();
  const search = page.getByLabel('Sök kurs att lägga till'), hits = page.getByRole('list', { name: 'Kurser i katalogen' });
  await search.fill('ENGE1000X'); const all = hits.getByRole('button').first();
  await expect(all).toBeDisabled(); await expect(all).toContainText('alla klasser läser kursen redan');
  await page.screenshot({ path: info.outputPath('sokning-alla-laser.png'), fullPage: true });
  await search.fill('PSYL1000X'); await hits.getByRole('button').first().click();
  await expect(page.getByRole('status').filter({ hasText: 'SA26A och SA26B läser redan' })).toContainText('och har tagits bort från kursen.');
  const row = page.getByRole('row', { name: /PSYL1000X/ }); await expect(row.getByText('Bara NA26A')).toBeVisible();
  await page.screenshot({ path: info.outputPath('notis-klasser-borttagna.png'), fullPage: true });
  await search.fill('FILS1000X'); await hits.getByRole('button').first().click(); await expect(page.getByRole('status').filter({ hasText: 'läser redan' })).toHaveCount(0);
  await expect(page.getByRole('row', { name: /FILS1000X/ }).getByText('Alla klasser')).toBeVisible();
  await page.getByRole('button', { name: 'Ändra klasser för Psykologi – nivå 1' }).click();
  await page.getByRole('group', { name: /Klasser som får läsa Psykologi/ }).getByRole('checkbox', { name: 'SA26A' }).check();
  await expect(row.getByText('SA26A läser redan kursen, så eleverna kan inte välja den.')).toBeVisible();
});

test('kontrollen räknar bort en kurs klassen redan läser', async ({ page }) => {
  const m = await mock(page); m.state.classCourses = [{ classId: id(20), courses: [{ subjectCode: 'RETO', itemCode: 'RETO1000X' }] }];
  await page.goto(URL); await startIv(page); await page.getByLabel('Sök kurs att lägga till').fill('RETO1000X');
  await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  const list = page.locator('.valplan-check-list');
  await page.getByRole('button', { name: 'Ändra klasser för Retorik – nivå 1' }).click();
  await page.getByRole('group', { name: /Klasser som får läsa Retorik/ }).getByRole('checkbox', { name: 'SA26A' }).check();
  await expect(list.locator('li').filter({ hasText: 'SA26A har ingen kurs att välja' })).toBeVisible();
  await page.getByLabel('Sök kurs att lägga till').fill('FILS1000X'); await page.getByRole('list', { name: 'Kurser i katalogen' }).getByRole('button').first().click();
  await expect(list.locator('li').filter({ hasText: 'SA26A når inte exakt 100 p. Närmast går 50 p med kurser klassen får läsa och inte redan läser.' })).toBeVisible();
});

test('ett öppet val med fel stängs inte, men Elevval säger vad som behöver rättas', async ({ page }) => {
  const m = await mock(page), block = saved({ courses: [course(1, 'PSYL', 'PSYL1000X', 50)] });
  m.state.valplans = [...m.state.valplans, block]; m.state.rows[0] = { ...m.state.rows[0], blocks: [{ valplanId: id(50), classIds: [id(20), id(21)] }] };
  await page.route('**/api/valplaner/val/**', route => { const q = route.request().postDataJSON(); return route.fulfill({ json: { ...choiceRead(), unitId: q.unitId, schoolYear: q.schoolYear, valplanId: q.valplanId, guardianConfirmation: false, round: { id: id(41), status: 'open', closesOn: '2027-12-01', guardianConfirmation: false, revision: 1, accepting: true } }, headers }); });
  await page.goto(`${URL}?open=${id(50)}`);
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  await expect(page.getByText('Valet är öppet, men Kontroll i blocket visar att något behöver rättas:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stäng val' })).toBeEnabled();
});

test('en kopplad rad som försvunnit tas bort i blocket, efter frågan om elever har lämnat val', async ({ page }, info) => {
  const m = await mock(page), gone = { timplanId: id(11), timplanVersion: 1, rowKey: 'block:gone', year: 2 as const, excludedClassIds: [] as string[] };
  const block = saved({ courses: [course(1, 'PSYL', 'PSYL1000X', 50), course(2, 'FILS', 'FILS1000X', 50)], rows: [{ ...gone, rowKey: 'block:iv1' }, gone] }, [{ classId: id(40), pupils: 2 }]);
  m.state.valplans = [...m.state.valplans, block]; m.state.rows[0] = { ...m.state.rows[0], blocks: [{ valplanId: id(50), classIds: [id(20), id(21)] }] };
  await page.goto(`${URL}?open=${id(50)}`);
  const list = page.locator('.valplan-check-list'), item = page.locator('.valplan-stray-rows li');
  await expect(list.getByText('En kopplad timplansrad finns inte längre för läsåret. Ta bort kopplingen och spara blocket.')).toBeVisible();
  await expect(page.getByText('2 kurser · 2 timplansrader')).toBeVisible();
  await list.getByRole('listitem').filter({ hasText: 'finns inte längre' }).getByRole('button', { name: 'Till klasserna' }).click();
  await expect(page.getByRole('heading', { name: 'Timplaner och klasser' })).toBeFocused();
  await expect(item.getByText('Timplansrad i åk 2')).toBeVisible();
  await page.screenshot({ path: info.outputPath('forsvunnen-rad.png'), fullPage: true });
  const remove = page.getByRole('button', { name: 'Ta bort kopplingen till Timplansrad i åk 2' });
  await answerConfirm(page, 'Elever har lämnat val', 'Behåll kopplingen', async () => { await remove.click(); await expect(page.getByRole('alertdialog').getByText('2 elever utanför blockets klasser har lämnat val.')).toBeVisible(); });
  await expect(item).toHaveCount(1);
  await answerConfirm(page, 'Elever har lämnat val', 'Ta bort kopplingen', () => remove.click());
  await expect(item).toHaveCount(0);
  await expect(page.getByText('Allt är klart för elevval.')).toBeVisible();
  await page.getByRole('button', { name: 'Spara valbart block' }).click();
  await expect(page.getByText('Blocket är sparat.')).toBeVisible();
  expect(m.writes.at(-1)!.valplan.rows.map(l => l.rowKey)).toEqual(['block:iv1']);
  await expect(page.getByText('2 kurser · 1 timplansrad', { exact: false })).toBeVisible();
});

test('datumfältet för sista valdag visar hela datumet', async ({ page }, info) => {
  const m = await mock(page), block = saved({ courses: [course(1, 'PSYL', 'PSYL1000X', 50), course(2, 'FILS', 'FILS1000X', 50)] });
  m.state.valplans = [...m.state.valplans, block]; m.state.rows[0] = { ...m.state.rows[0], blocks: [{ valplanId: id(50), classIds: [id(20), id(21)] }] };
  await choiceMock(page); await page.goto(`${URL}?open=${id(50)}`);
  await page.getByRole('button', { name: 'Elevval', exact: true }).click();
  const field = page.getByLabel('Sista valdag'); await field.fill('2027-12-01');
  // Ett svenskt datum med kalenderikon behöver cirka 150 px.
  expect((await field.boundingBox())!.width).toBeGreaterThan(150);
  await field.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('sista-valdag.png') });
});

test('en kurs eller klass med lämnade val tas bort först efter frågan med antal elever', async ({ page }) => {
  const m = await mock(page), reto = course(1, 'RETO', 'RETO1000X', 100), fils = course(2, 'FILS', 'FILS1000X', 100);
  m.state.valplans = [...m.state.valplans, saved({ courses: [reto, fils] }, [], [{ courseId: reto.id, pupils: 4, classes: [{ classId: id(21), pupils: 3 }] }])];
  m.state.rows[0] = { ...m.state.rows[0], blocks: [{ valplanId: id(50), classIds: [id(20), id(21)] }] };
  await page.goto(`${URL}?open=${id(50)}`);
  await page.getByRole('button', { name: 'Ändra klasser för Kurs 1' }).click();
  const picks = page.getByRole('group', { name: 'Klasser som får läsa Kurs 1' }), row = page.getByRole('row', { name: /RETO1000X/ });
  const prompt = page.getByRole('alertdialog', { name: 'Elever har valt kursen', exact: true });
  await picks.getByRole('checkbox', { name: 'SA26A' }).uncheck(); await expect(prompt).toHaveCount(0);
  await picks.getByRole('checkbox', { name: 'SA26A' }).check();
  await answerConfirm(page, 'Elever har valt kursen', 'Behåll klassen', async () => { await picks.getByRole('checkbox', { name: 'SA26B' }).click(); await expect(prompt).toContainText('3 elever i SA26B har valt Kurs 1.'); });
  await expect(picks.getByRole('checkbox', { name: 'SA26B' })).toBeChecked();
  await answerConfirm(page, 'Elever har valt kursen', 'Ta bort klassen från kursen', () => picks.getByRole('checkbox', { name: 'SA26B' }).click());
  await expect(row.getByText('Alla klasser utom SA26B', { exact: true })).toBeVisible();
  await answerConfirm(page, 'Elever har valt kursen', 'Behåll kursen', async () => { await page.getByRole('button', { name: 'Ta bort Kurs 1' }).click(); await expect(prompt).toContainText('4 elever har valt Kurs 1.'); await expect(prompt).toContainText('Kurs borttagen'); });
  await expect(row).toBeVisible();
  await answerConfirm(page, 'Elever har valt kursen', 'Ta bort kursen', () => page.getByRole('button', { name: 'Ta bort Kurs 1' }).click());
  await expect(row).toHaveCount(0);
  await page.getByRole('button', { name: 'Ta bort Kurs 2' }).click();
  await expect(prompt).toHaveCount(0); await expect(page.getByRole('row', { name: /FILS1000X/ })).toHaveCount(0);
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
