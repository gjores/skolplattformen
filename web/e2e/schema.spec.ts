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
type Placement = { lesson: string; day: number; startMin: number };
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
  await expect(page.getByRole('heading', { name: 'Pass utan tid (1)' })).toBeVisible();
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
  expect(bodies[0].placements).toContainEqual(kontroll.move);
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
  expect(bodies[1].placements).toContainEqual({ lesson: before.id, day: before.day, startMin: before.startMin });
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

test('ett pass utan tid läggs ut för hand och kan tas tillbaka', async ({ page }) => {
  const id = kontroll.move.lesson;
  await mock(page, () => ({ json: { ...forslag, status: 'time_limit', lessons: forslag.lessons.map(l => l.id === id ? { ...l, day: null, startMin: null } : l),
    teachings: kontroll.lifted.teachings, metrics: kontroll.lifted.metrics } }));
  const bodies = await mockKontroll(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('heading', { name: 'Pass utan tid (1)' })).toBeVisible();
  await page.getByRole('button', { name: /^Lägg ut / }).click();
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await expect(panel).toContainText('Har ingen tid.');
  await panel.getByLabel('Dag').selectOption({ label: 'Onsdag' });
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
  await expect(page.getByRole('heading', { name: /Pass utan tid/u })).toHaveCount(0);
  await expect(page.getByText(`${forslag.metrics.lessons} av ${forslag.metrics.lessons} pass har fått en tid.`)).toBeVisible();
  expect(bodies[0].placements).toHaveLength(forslag.lessons.length);
  await page.getByRole('button', { name: 'Ångra senaste flytt' }).click();
  await expect(page.getByRole('heading', { name: 'Pass utan tid (1)' })).toBeVisible();
  expect(bodies[1].placements).toHaveLength(forslag.lessons.length - 1);
});
