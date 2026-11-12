// Vyn Schema mot ett syntetiskt förslag som schemamotorn har räknat (work/schema/verify-koppling.mjs).
// Rutt, behörighet och motoranrop verifieras separat; här prövas bara vad användaren ser.
import { test, expect, type Page } from '@playwright/test';
import forslag from './fixtures/schema-forslag.json' with { type: 'json' };
// En flytt som motorns kontrollant har prövat: passet läggs där klassen redan har ett annat pass.
import kontroll from './fixtures/schema-kontroll.json' with { type: 'json' };
const URL = '/e2e/fixtures/schema-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const shots = process.env.SCHEMA_SHOTS;
async function mock(page: Page, reply: (body: Record<string, unknown>) => { status?: number; json: unknown }) {
  const bodies: Record<string, unknown>[] = [];
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    return route.fulfill({ headers, ...reply(body) });
  });
  return bodies;
}
const DAYS = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
const clean = { ...kontroll.clash, violations: [], total: 0 };
type Placement = { lesson: string; day: number; startMin: number; room: string | null };
/** Kontrollens svar följer placeringarna: flyttat pass ger avvikelserna, borttagen tid ett olagt pass, annars inga avvikelser. */
async function mockKontroll(page: Page, status?: number) {
  const bodies: { fingerprint: string; placements: Placement[] }[] = [];
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON() as { fingerprint: string; placements: Placement[] };
    bodies.push(body);
    if (status) return route.fulfill({ headers, status, json: { code: 'schema_underlag_changed', correlationId: 'prov', details: { reason: 'schema_underlag_changed' } } });
    const at = body.placements.find(p => p.lesson === kontroll.move.lesson);
    return route.fulfill({ headers, json: !at ? kontroll.lifted : at.day === kontroll.move.day && at.startMin === kontroll.move.startMin ? kontroll.clash : clean });
  });
  return bodies;
}
async function move(page: Page) {
  const lesson = page.locator(`[data-lesson="${kontroll.move.lesson}"]`);
  await lesson.focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel.getByLabel('Dag')).toBeFocused();
  await panel.getByLabel('Dag').selectOption({ label: DAYS[kontroll.move.day] });
  await panel.getByLabel('Starttid').selectOption(String(kontroll.move.startMin));
  await panel.getByRole('button', { name: 'Flytta hit' }).focus();
  await page.keyboard.press('Enter');
  return lesson;
}

test('förslaget visas som vecka per klass och per lärare, utan sidledsrullning', async ({ page }, info) => {
  const bodies = await mock(page, () => ({ json: forslag }));
  await page.goto(URL);
  await expect(page.getByText('Inget förslag ännu.')).toBeVisible();
  await expect(page.getByText('Det sparas inte och publiceras inte.')).toBeVisible();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  expect(bodies).toEqual([{ unitId: forslag.unitId, schoolYear: 2026, period: 'lasar', villkor: forslag.villkor }]);
  await expect(page.getByText(`Hela läsåret. ${forslag.metrics.placed} av ${forslag.metrics.lessons} pass har fått en tid.`)).toBeVisible();
  await expect(page.getByText('Tid: 181 skoldagar (HT 88, VT 93) enligt läsårskalendern version 1 (fastställd, gällande).')).toBeVisible();
  await expect(page.getByText('Underlag: tjänstefördelning version 1 (utkast).')).toBeVisible();
  // Timplanen är ram: veckotiden följer den, och skillnad som beror på veckodagarnas skoldagar redovisas för sig.
  await expect(page.locator('.status-badge', { hasText: 'Veckotiden följer timplanen' })).toBeVisible();
  const byCalendar = forslag.teachings.filter(t => t.deviation === 'calendar').length;
  expect(byCalendar).toBeGreaterThan(0);
  await expect(page.getByText(`${byCalendar} undervisningar får annan tid över terminen än timplanens`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Viloyta (0)' })).toBeVisible();
  await expect(page.getByText('Inga pass på viloytan.')).toBeVisible();

  const monday = page.getByRole('region', { name: 'Måndag' });
  await expect(monday.getByRole('listitem').first()).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/u);
  // Klass 1 har idrott utan lärare i underlaget.
  await expect(page.locator('.schema-lesson.vacant').first()).toContainText('Ingen lärare');
  // Veckan visas för en termin i taget: pass som bara går den andra terminen är inte med.
  const inTerm = (term: string) => (l: typeof forslag.lessons[number]) => l.term === null || l.term === term;
  const ofClass = forslag.lessons.filter(l => l.classIds.includes(forslag.classes[0].id));
  const mine = ofClass.filter(inTerm('ht'));
  expect(mine.length).toBeLessThan(ofClass.length);
  await expect(page.getByRole('button', { name: 'Höstterminen' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.schema-lesson')).toHaveCount(mine.length);
  await expect(page.locator('.schema-lesson', { hasText: 'Religionskunskap' })).not.toHaveCount(0);
  await expect(page.locator('.schema-lesson', { hasText: 'Psykologi' })).toHaveCount(0);
  // Blockets alternativ går samtidigt för olika elever i klassen: passen ska stå bredvid varandra, aldrig ovanpå.
  expect(mine.some(a => mine.some(b => a.id < b.id && a.day === b.day && a.startMin! < b.startMin! + b.durationMin && b.startMin! < a.startMin! + a.durationMin))).toBe(true);
  for (const day of await page.locator('.schema-day').all()) {
    const boxes = (await Promise.all((await day.locator('.schema-lesson').all()).map(l => l.boundingBox()))).map(b => b!);
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1))
      expect(a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1 || a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1).toBe(true);
  }
  await expect(page.getByText('300 elevers klasser och gruppmedlemskap under läsåret avgör vilka pass som inte får gå samtidigt.')).toBeVisible();
  await expect(page.getByText('Spanska, Tyska, Franska: 10 elever i blockets klasser har ingen grupp')).toBeVisible();
  await expect(page.getByText('Grupper utan elever (1): Franska.')).toBeVisible();
  await page.getByRole('heading', { name: `Tid över läsåret (${forslag.teachings.length})` }).click();
  await expect(page.getByRole('columnheader', { name: 'Utlagt' })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText(/[+−]?\d+(,\d)? h/u);
  await expect(page.getByRole('row').nth(1)).toContainText('Nej: veckodagarnas skoldagar');
  await expect(page.getByRole('row').last()).toContainText('Ja');

  await page.getByRole('button', { name: 'Vårterminen' }).click();
  await expect(page.locator('.schema-lesson')).toHaveCount(ofClass.filter(inTerm('vt')).length);
  await expect(page.locator('.schema-lesson', { hasText: 'Psykologi' })).not.toHaveCount(0);
  await expect(page.locator('.schema-lesson', { hasText: 'Religionskunskap' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lärare', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lärare', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.schema-filter select').selectOption({ label: forslag.teachers[1].name });
  await expect(page.locator('.schema-lesson')).toHaveCount(forslag.lessons.filter(l => l.teacherIds.includes(forslag.teachers[1].id)).filter(inTerm('vt')).length);
  await expect(page.locator('.schema-lesson').first()).toContainText('Klass');
  await expect(page.getByRole('heading', { name: 'Villkor och antaganden i förslaget' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-${info.project.name}.png`, fullPage: true });
});

test('olagda pass, förklaring och utelämnade behov redovisas i text', async ({ page }) => {
  const first = forslag.lessons[0];
  await mock(page, () => ({ json: { ...forslag, status: 'time_limit', lessons: [{ ...first, day: null, startMin: null }, ...forslag.lessons.slice(1)],
    diagnoses: [{ message: `Pass ${first.title} fick ingen plats.`, proof: false }],
    omitted: [{ title: 'Liten kurs', classes: ['Klass 1'], reason: 'too_short' }, { title: 'Praktik', classes: ['Klass 2'], reason: 'no_days' }],
    time: { source: 'forval', version: null, status: null, current: false, schoolDays: 190, weeks: 38, terms: [{ term: 'ht', schoolDays: 90 }, { term: 'vt', schoolDays: 100 }] },
    members: { pupils: 0, groupsWithoutMembers: [], classesWithoutPupils: [], withoutChoice: [] },
    metrics: { ...forslag.metrics, placed: forslag.metrics.lessons - 1, unplaced: 1 } } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Räknetiden tog slut')).toBeVisible();
  await expect(page.getByText('Pass på viloytan räknas som avvikelse från timplanen.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  await expect(page.getByText(`Pass ${first.title} fick ingen plats.`)).toBeVisible();
  await expect(page.getByText('Liten kurs · Klass 1: mindre än 20 min i veckan')).toBeVisible();
  await expect(page.getByText('Praktik · Klass 2: inga skoldagar')).toBeVisible();
  await expect(page.getByText('Läsårskalender saknas för läsåret: 38 lika veckor har antagits.')).toBeVisible();
  await expect(page.getByText('Inga elever med klass eller grupp kunde läsas för läsåret.')).toBeVisible();
});

test('motor som inte är ansluten ger ett tydligt besked och inget schema', async ({ page }) => {
  await mock(page, () => ({ status: 503, json: { code: 'schema_engine_unavailable', correlationId: 'prov', details: { reason: 'schema_engine_unconfigured' } } }));
  await page.goto(URL);
  await page.getByLabel('Schemat gäller').selectOption('vt');
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('alert')).toHaveText('Schemamotorn är inte ansluten i den här miljön. Inget förslag kan tas fram.');
  await expect(page.locator('.schema-week')).toHaveCount(0);
});

test('svar för en annan period än den begärda visas inte', async ({ page }) => {
  await mock(page, () => ({ json: { ...forslag, period: 'vt' } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('alert')).toHaveText('Schemaförslaget kunde inte tas fram. Försök igen.');
});

test('villkoren prövas i vyn, skickas med begäran och finns kvar för skolan', async ({ page }, info) => {
  const bodies = await mock(page, body => ({ json: { ...forslag, period: body.period, villkor: body.villkor } }));
  await page.goto(URL);
  const submit = page.getByRole('button', { name: 'Ta fram schemaförslag' });
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.locator('.schema-villkor summary')).toContainText('Förval: skoldag 08:00–16:30 måndag–fredag');
  await expect(page.getByRole('button', { name: 'Återställ förval' })).toBeDisabled();
  // En skoldag som slutar före den börjar går inte att räkna på.
  await page.getByLabel('Måndag slutar').fill('07:00');
  await expect(page.getByRole('alert')).toContainText('Rätta villkoren för att kunna ta fram ett förslag:');
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Återställ förval' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(submit).toBeEnabled();

  await page.getByLabel('Fredag slutar').fill('14:00');
  await page.getByLabel('Längsta pass').selectOption('60');
  await page.getByLabel('Lägg in lunch varje dag').uncheck();
  await expect(page.getByLabel('Lunchens längd')).toHaveCount(0);
  await page.getByLabel('Högst undervisning per dag, elever').selectOption('360');
  await page.getByLabel('Egna pass per termin').selectOption('');
  await expect(page.locator('.schema-villkor summary')).toContainText('Ändrade: skoldag');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-villkor-${info.project.name}.png`, fullPage: true });
  await page.getByLabel('Schemat gäller').selectOption('ht');
  await submit.click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  const villkor = { ...forslag.villkor, days: forslag.villkor.days.map((d, i) => i === 4 ? { ...d, endMin: 840 } : d), maxLessonMin: 60, lunch: null, studentMaxMinPerDay: 360, termDiffPct: null };
  expect(bodies).toEqual([{ unitId: forslag.unitId, schoolYear: 2026, period: 'ht', villkor }]);
  await expect(page.getByText('Höstterminen. ')).toBeVisible();
  await expect(page.getByRole('heading', { name: `Tid över terminen (${forslag.teachings.length})` })).toBeVisible();

  // Webbläsaren minns villkoren för skolan först när ett förslag har tagits fram.
  await page.reload();
  await expect(page.locator('.schema-villkor summary')).toContainText('Ändrade: skoldag');
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.getByLabel('Längsta pass')).toHaveValue('60');
  await expect(page.getByLabel('Lägg in lunch varje dag')).not.toBeChecked();
});

test('ett pass flyttas med tangentbordet, avvikelser märks ut och flytten kan ångras', async ({ page }, info) => {
  await mock(page, () => ({ json: forslag }));
  const bodies = await mockKontroll(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Flyttar sparas inte')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ångra senaste flytt' })).toBeDisabled();
  const before = forslag.lessons.find(l => l.id === kontroll.move.lesson)!;
  const lesson = await move(page);
  await expect(page.getByText('Ändrat för hand · 1 flytt')).toBeVisible();
  expect(bodies).toHaveLength(1);
  expect(bodies[0].fingerprint).toBe(forslag.fingerprint);
  expect(bodies[0].placements).toHaveLength(forslag.lessons.length);
  expect(bodies[0].placements).toContainEqual({ ...kontroll.move, room: null });
  // Passet står på den nya dagen, är märkt i text och har fått fokus tillbaka.
  await expect(page.getByRole('region', { name: DAYS[kontroll.move.day] }).locator(`[data-lesson="${kontroll.move.lesson}"]`)).toContainText('Regelavvikelse');
  await expect(lesson).toBeFocused();
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: `Regelavvikelser (${kontroll.clash.total})` })).toBeVisible();
  await expect(page.locator('.status-badge', { hasText: `${kontroll.clash.total} regelavvikelser` })).toBeVisible();
  await expect(page.getByText(kontroll.clash.violations[0].message)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: `${before.title} ligger nu ${DAYS[kontroll.move.day].toLowerCase()}` })).toBeVisible();
  expect(await page.locator('.schema-lesson.deviation').count()).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-flytt-${info.project.name}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  await expect(page.getByText('Inga regler bryts av schemat som det ligger nu.')).toBeVisible();
  expect(bodies[1].placements).toContainEqual({ lesson: before.id, day: before.day, startMin: before.startMin, room: null });
  await expect(page.getByText('Ändrat för hand')).toHaveCount(0);
  await expect(page.locator('.schema-lesson.deviation')).toHaveCount(0);
  await expect(page.getByRole('region', { name: DAYS[before.day!] }).locator(`[data-lesson="${before.id}"]`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ångra senaste flytt' })).toBeDisabled();
});

test('ändrat underlag nekar flytten och passet står kvar', async ({ page }) => {
  await mock(page, () => ({ json: forslag }));
  await mockKontroll(page, 409);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  const before = forslag.lessons.find(l => l.id === kontroll.move.lesson)!;
  await move(page);
  await expect(page.getByRole('alert')).toHaveText('Underlaget har ändrats sedan förslaget togs fram. Passet står kvar. Ta fram ett nytt schemaförslag för att fortsätta.');
  await expect(page.getByRole('region', { name: DAYS[before.day!] }).locator(`[data-lesson="${before.id}"]`)).toBeVisible();
  await expect(page.getByText('Ändrat för hand')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Regelavvikelser/u })).toHaveCount(0);
});

test('ett pass på viloytan läggs ut för hand och kan tas tillbaka', async ({ page }) => {
  const id = kontroll.move.lesson;
  await mock(page, () => ({ json: { ...forslag, status: 'time_limit', lessons: forslag.lessons.map(l => l.id === id ? { ...l, day: null, startMin: null } : l),
    teachings: kontroll.lifted.teachings, metrics: kontroll.lifted.metrics } }));
  const bodies = await mockKontroll(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  await page.getByRole('button', { name: /^Lägg ut / }).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel).toContainText('Ligger på viloytan.');
  await expect(panel.getByRole('button', { name: 'Lägg på viloytan' })).toHaveCount(0);
  await panel.getByLabel('Dag').selectOption({ label: 'Onsdag' });
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
  await expect(page.getByRole('heading', { name: 'Viloyta (0)' })).toBeVisible();
  await expect(page.getByText(`${forslag.metrics.lessons} av ${forslag.metrics.lessons} pass har fått en tid.`)).toBeVisible();
  expect(bodies[0].placements).toHaveLength(forslag.lessons.length);
  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  expect(bodies[1].placements).toHaveLength(forslag.lessons.length - 1);
});

test('pass dras till viloytan och tillbaka ut i veckan; på telefon används flyttpanelen', async ({ page }, info) => {
  await mock(page, () => ({ json: forslag }));
  const bodies = await mockKontroll(page);
  const id = kontroll.move.lesson, before = forslag.lessons.find(l => l.id === id)!;
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  const lesson = page.locator(`[data-lesson="${id}"]`), rest = page.locator('.schema-rest');
  if (info.project.name === 'phone') {
    await lesson.click();
    await page.getByRole('form', { name: 'Flytta pass' }).getByRole('button', { name: 'Lägg på viloytan' }).click();
    await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: `${before.title} ligger nu på viloytan` })).toBeVisible();
    expect(bodies[0].placements).toHaveLength(forslag.lessons.length - 1);
    return;
  }
  // Hela veckan och viloytan ska rymmas i fönstret medan passet dras.
  await page.setViewportSize({ width: 1440, height: 2200 });
  const center = async (target: typeof lesson) => { const b = (await target.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const from = await center(lesson), to = await center(rest);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(rest).toHaveClass(/over/u);
  await expect(page.locator('.schema-lesson.dragging')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  await expect(page.locator('.status-badge', { hasText: 'Avviker från timplanen' })).toBeVisible();
  // Släppet räknas inte som ett klick: flyttpanelen öppnas inte.
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toHaveCount(0);
  expect(bodies[0].placements).toHaveLength(forslag.lessons.length - 1);

  // Från viloytan ut på onsdagen: släppmarkeringen visar tiden och passet hamnar på startrutnätet.
  const item = rest.getByRole('listitem').first(), column = page.getByRole('region', { name: 'Onsdag' }).locator('ol');
  const start = await center(item), box = (await column.boundingBox())!;
  await page.mouse.move(start.x - 40, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 40, start.y - 20, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await expect(column.locator('.schema-drop')).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}/u);
  if (shots) await page.screenshot({ path: `${shots}/schema-dra-${info.project.name}.png`, fullPage: true });
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Viloyta (0)' })).toBeVisible();
  const dropped = bodies[1].placements.find(p => p.lesson === id)!;
  expect([dropped.day, dropped.startMin % forslag.villkor.startGridMin, dropped.room]).toEqual([2, 0, null]);
  await expect(column.locator(`[data-lesson="${id}"]`)).toBeVisible();
  await expect(page.locator('.schema-drop')).toHaveCount(0);
  await expect(page.getByText('Ändrat för hand · 2 flyttar')).toBeVisible();
  // Ett kort klick utan drag öppnar fortfarande flyttpanelen.
  await column.locator(`[data-lesson="${id}"]`).click();
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toBeVisible();
});

test('salar och egna villkor läggs till, skickas med begäran och redovisas i förslaget', async ({ page }, info) => {
  const bodies = await mock(page, body => ({ json: { ...forslag, villkor: body.villkor, rooms: (body.villkor as typeof forslag.villkor).salar.map((name, i) => ({ id: `sal-${i + 1}`, name })) } }));
  await page.goto(URL);
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.getByText('Ta fram ett första förslag för att kunna välja klass, grupp, ämne och lärare.')).toBeVisible();
  await expect(page.locator('.schema-egna-form')).toHaveCount(0);
  // Enter i salens fält lägger till salen och skickar inte formuläret.
  await page.getByLabel('Salens namn').fill('Idrottshallen');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Salar' })).toContainText('Idrottshallen');
  expect(bodies).toHaveLength(0);
  await page.getByLabel('Salens namn').fill('idrottshallen');
  await expect(page.getByRole('button', { name: 'Lägg till sal' })).toBeDisabled();
  await page.getByLabel('Salens namn').fill('');
  const form = page.locator('.schema-egna-form'), rules = page.getByRole('list', { name: 'Egna villkor' });
  // Före första förslaget går bara salen att välja: spärra hallen på fredagar.
  await expect(form.getByLabel(/^Gäller/u)).toHaveValue('sal');
  for (const day of ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag']) await form.getByLabel(day, { exact: true }).uncheck();
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await expect(rules).toContainText('Sal Idrottshallen: spärrad fredag 08:00–12:00');
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  const sparr = { slag: 'sal', ref: 'Idrottshallen', typ: 'sparrad', days: [4], startMin: 480, endMin: 720 };
  expect(bodies[0].villkor).toEqual({ ...forslag.villkor, salar: ['Idrottshallen'], egna: [sparr] });

  // När ett förslag finns går klass, grupp, ämne och lärare att välja.
  await form.getByLabel(/^Gäller/u).selectOption('amne');
  await form.getByLabel(/^Ämne/u).selectOption('Idrott och hälsa');
  await form.getByLabel(/^Villkor/u).selectOption('sal');
  await form.getByLabel('Idrottshallen').check();
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await form.getByLabel(/^Gäller/u).selectOption('klass');
  await form.getByLabel(/^Klass/u).selectOption({ label: 'Klass 1' });
  await form.getByLabel(/^Villkor/u).selectOption('marginal');
  await form.getByLabel(/^Marginal/u).selectOption('20');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await form.getByLabel(/^Gäller/u).selectOption('larare');
  await form.getByLabel(/^Villkor/u).selectOption('tillaten');
  // Formuläret minns dagarna från förra villkoret; läraren ska gälla alla dagar.
  for (const day of ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag']) await form.getByLabel(day, { exact: true }).check();
  await form.getByLabel('Till', { exact: true }).fill('15:00');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await expect(rules.getByRole('listitem')).toHaveText([/^Sal Idrottshallen: spärrad fredag 08:00–12:00/u, /^Ämne Idrott och hälsa: sal Idrottshallen/u, /^Klass Klass 1: 20 min marginal till nästa lektion/u,
    new RegExp(`^Lärare ${forslag.resurser.larare[0].name}: bara alla dagar 08:00–15:00`, 'u')]);
  // Lärare kan inte få villkor för uppdelning eller sal; det avgörs av ämne, grupp och klass.
  await expect(form.getByLabel(/^Villkor/u).locator('option')).toHaveText(['Spärrad tid', 'Tillåten tid', 'Marginal till nästa lektion', 'Sal']);
  await expect(page.locator('.schema-villkor summary')).toContainText('4 egna villkor');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-egna-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  const sent = bodies[1].villkor as typeof forslag.villkor & { egna: Record<string, unknown>[] };
  expect(sent.egna).toEqual([sparr, { slag: 'amne', ref: 'Idrott och hälsa', typ: 'sal', rooms: ['Idrottshallen'] }, { slag: 'klass', ref: forslag.resurser.klass[0].ref, typ: 'marginal', minutes: 20 },
    { slag: 'larare', ref: forslag.resurser.larare[0].ref, typ: 'tillaten', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 900 }]);
  await expect(page.getByText('Eget villkor: Klass Klass 1: 20 min marginal till nästa lektion.')).toBeVisible();
  await expect(page.getByText('Salar: Idrottshallen. Bara pass med ett salsvillkor får en sal.')).toBeVisible();
  // En sal som tas bort tar sina villkor med sig; övriga villkor står kvar.
  await page.getByRole('button', { name: 'Ta bort sal Idrottshallen' }).click();
  await expect(rules.getByRole('listitem')).toHaveCount(2);
  await rules.getByRole('button', { name: /^Ta bort villkoret Klass Klass 1/u }).click();
  await expect(rules.getByRole('listitem')).toHaveCount(1);
});
