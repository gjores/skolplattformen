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
  await expect(page.getByText('Tid: 182 skoldagar (HT 84, VT 98) enligt läsårskalendern version 1 (fastställd, gällande).')).toBeVisible();
  await expect(page.getByText('Underlag: tjänstefördelning version 1 (utkast).')).toBeVisible();
  // Timplanen läggs alltid ut: varje termin minst timplanens tid och högst avrundningen uppåt (05.2-SM-TIMPLAN-EXAKT).
  await expect(page.locator('.status-badge', { hasText: 'Tiden följer timplanen' })).toBeVisible();
  expect(forslag.teachings.every(t => t.deviation === null && t.terms.every(x => x.plannedMin >= x.needMin && x.plannedMin <= x.maxMin))).toBe(true);
  expect(forslag.teachings.every(t => t.terms.every(x => x.plannedMin === Math.ceil(x.needMin / 5) * 5))).toBe(true);
  await expect(page.getByText('annan tid över terminen')).toHaveCount(0);
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
  // Justerad längd (05.2-SM-TIMPLAN-VECKA, W3): ett pass som kortas alla veckor visas med sin kortare sluttid; kortning vissa veckor står i text.
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const trimOf = (l: typeof mine[number]) => forslag.trims.find(x => x.lesson === l.id && x.term === 'ht');
  const fixed = mine.find(l => (trimOf(l)?.fixedMin ?? 0) > 0)!, varied = mine.find(l => (trimOf(l)?.extraCount ?? 0) > 0)!;
  expect(fixed && varied).toBeTruthy();
  await expect(page.locator(`[data-lesson="${fixed.id}"] time`)).toHaveText(`${hhmm(fixed.startMin!)}–${hhmm(fixed.startMin! + fixed.durationMin - trimOf(fixed)!.fixedMin)}`);
  const n = trimOf(varied)!.extraCount;
  await expect(page.locator(`[data-lesson="${varied.id}"]`)).toContainText(`kortare ${n === 1 ? 'en vecka' : `${n} veckor`}`);
  await page.locator(`[data-lesson="${fixed.id}"]`).click();
  await expect(page.getByRole('form', { name: 'Flytta pass' })).toContainText(`${fixed.durationMin - trimOf(fixed)!.fixedMin} min (${fixed.durationMin} min i grundschemat)`);
  await page.locator(`[data-lesson="${fixed.id}"]`).click();
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
  await expect(page.getByText('All undervisning följer timplanen.')).toBeVisible();
  await expect(page.getByText('Utlagd tid räknas på faktiska lektionstillfällen', { exact: false })).toBeVisible();
  await expect(page.getByRole('row').nth(1)).toContainText('Ja');
  // Justeringen per tillfälle står i tabellen (05.2-SM-TIMPLAN-VECKA, W3).
  const trimmed = forslag.teachings.find(t => t.terms.some(x => x.trimmedCount > 0))!;
  expect(trimmed).toBeTruthy();
  await expect(page.getByRole('columnheader', { name: 'Justering' })).toBeVisible();
  await expect(page.getByRole('cell', { name: /tillfällen kortare, \d+ min/u }).first()).toBeVisible();

  // Vecka för vecka (W4): veckorna i ordning, tiden per vecka och justerade veckor utmärkta.
  await page.getByRole('heading', { name: 'Vecka för vecka' }).click();
  const perWeek = page.locator('details', { has: page.getByRole('heading', { name: 'Vecka för vecka' }) }).getByLabel('Undervisning');
  const index = (await perWeek.locator('option').allTextContents()).findIndex(o => o.startsWith(trimmed.title) && o.includes(trimmed.classes.join(', ')));
  await perWeek.selectOption(String(index));
  const weeks = page.locator('.schema-weeks li');
  await expect(weeks).toHaveCount(forslag.time.weekLabels.length);
  await expect(weeks.first()).toContainText(forslag.time.weekLabels[0]);
  const w = trimmed.trimPerWeek.findIndex(n => n > 0);
  await expect(weeks.nth(w)).toHaveClass(/trimmed/u);
  await expect(weeks.nth(w)).toContainText(`${trimmed.perWeek[w]} min`);
  await expect(weeks.nth(w)).toContainText(`${trimmed.trimPerWeek[w]} min kortare`);
  await expect(page.getByText(`HT ${trimmed.terms[0].plannedMin} min av timplanens ${trimmed.terms[0].needMin}`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expect(page.getByRole('row').last()).toContainText('Ja');

  await page.getByRole('button', { name: 'Vårterminen' }).click();
  await expect(page.locator('.schema-lesson')).toHaveCount(ofClass.filter(inTerm('vt')).length);
  await expect(page.locator('.schema-lesson', { hasText: 'Psykologi' })).not.toHaveCount(0);
  await expect(page.locator('.schema-lesson', { hasText: 'Religionskunskap' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Lärare', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lärare', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('.schema-filter select').first().selectOption({ label: forslag.teachers[1].name });
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
    time: { source: 'forval', version: null, status: null, current: false, schoolDays: 190, weeks: 38, terms: [{ term: 'ht', schoolDays: 90 }, { term: 'vt', schoolDays: 100 }], weekLabels: forslag.time.weekLabels },
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

test('villkor sparade med det gamla terminsvalet läses in utan valet', async ({ page }) => {
  await mock(page, () => ({ json: forslag }));
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`schema-villkor:${forslag.unitId}`, JSON.stringify({ ...forslag.villkor, breakMin: 5, termDiffPct: 15 })] as const);
  await page.goto(URL);
  await expect(page.locator('.schema-villkor summary')).toContainText('Ändrade:');
  await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
  await expect(page.getByLabel('Rast mellan pass')).toHaveValue('5');
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
  // Valet av egna pass per termin finns inte längre: timplanen avgör.
  await expect(page.getByLabel('Egna pass per termin')).toHaveCount(0);
  await expect(page.locator('.schema-villkor summary')).toContainText('Ändrade: skoldag');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-villkor-${info.project.name}.png`, fullPage: true });
  await page.getByLabel('Schemat gäller').selectOption('ht');
  await submit.click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  const villkor = { ...forslag.villkor, days: forslag.villkor.days.map((d, i) => i === 4 ? { ...d, endMin: 840 } : d), maxLessonMin: 60, lunch: null, studentMaxMinPerDay: 360 };
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
  await form.getByLabel(/^Villkor/u).selectOption('langd');
  await form.getByLabel(/^Längsta pass/u).selectOption('60');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await form.getByLabel(/^Gäller/u).selectOption('larare');
  await form.getByLabel(/^Villkor/u).selectOption('tillaten');
  // Formuläret minns dagarna från förra villkoret; läraren ska gälla alla dagar.
  for (const day of ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag']) await form.getByLabel(day, { exact: true }).check();
  await form.getByLabel('Till', { exact: true }).fill('15:00');
  await form.getByRole('button', { name: 'Lägg till villkor' }).click();
  await expect(rules.getByRole('listitem')).toHaveText([/^Sal Idrottshallen: spärrad fredag 08:00–12:00/u, /^Ämne Idrott och hälsa: sal Idrottshallen/u, /^Klass Klass 1: pass om högst 60 min/u,
    new RegExp(`^Lärare ${forslag.resurser.larare[0].name}: bara alla dagar 08:00–15:00`, 'u')]);
  // Lärare kan inte få villkor för uppdelning eller sal; det avgörs av ämne, grupp och klass.
  await expect(form.getByLabel(/^Villkor/u).locator('option')).toHaveText(['Spärrad tid', 'Tillåten tid', 'Sal']);
  await expect(page.locator('.schema-villkor summary')).toContainText('4 egna villkor');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-egna-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  const sent = bodies[1].villkor as typeof forslag.villkor & { egna: Record<string, unknown>[] };
  expect(sent.egna).toEqual([sparr, { slag: 'amne', ref: 'Idrott och hälsa', typ: 'sal', rooms: ['Idrottshallen'] }, { slag: 'klass', ref: forslag.resurser.klass[0].ref, typ: 'langd', maxMin: 60 },
    { slag: 'larare', ref: forslag.resurser.larare[0].ref, typ: 'tillaten', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 900 }]);
  await expect(page.getByText('Eget villkor: Klass Klass 1: pass om högst 60 min.')).toBeVisible();
  await expect(page.getByText('Salar: Idrottshallen. Bara pass med ett salsvillkor får en sal.')).toBeVisible();
  // En sal som tas bort tar sina villkor med sig; övriga villkor står kvar.
  await page.getByRole('button', { name: 'Ta bort sal Idrottshallen' }).click();
  await expect(rules.getByRole('listitem')).toHaveCount(2);
  await rules.getByRole('button', { name: /^Ta bort villkoret Klass Klass 1/u }).click();
  await expect(rules.getByRole('listitem')).toHaveCount(1);
});

// Arbetsytans grund (05.2-SM-YTA): ångra och gör om i flera steg, lager i veckan och teckenförklaring. Arbetsytan prövas bara på dator (beslut 2026-11-13).
test('flera flyttar ångras i omvänd ordning och görs om', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await mock(page, () => ({ json: forslag }));
  const bodies = await mockKontroll(page);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  const undo = page.getByRole('button', { name: 'Ångra senaste flytt' }), redo = page.getByRole('button', { name: 'Gör om' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  // Teckenförklaringen visar bara det som syns: de förvalda lagren (05.2-SM-VILLKOR-SYNS) och pass utan lärare.
  await expect(page.getByRole('list', { name: 'Teckenförklaring' }).getByRole('listitem')).toHaveText(['Lunchfönster', 'Sena pass (undviks)', 'Pass utan lärare']);
  const before = forslag.lessons.find(l => l.id === kontroll.move.lesson)!, at = (day: number) => page.getByRole('region', { name: DAYS[day] }).locator(`[data-lesson="${before.id}"]`);
  const lesson = await move(page);
  await expect(page.getByText('Ändrat för hand · 1 flytt')).toBeVisible();
  // Steg två: samma pass till viloytan.
  await lesson.click();
  await page.getByRole('form', { name: 'Flytta pass' }).getByRole('button', { name: 'Lägg på viloytan' }).click();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  await expect(page.getByText('Ändrat för hand · 2 flyttar')).toBeVisible();
  await expect(redo).toBeDisabled();

  await undo.click();
  await expect(page.getByRole('heading', { name: 'Viloyta (0)' })).toBeVisible();
  await expect(at(kontroll.move.day)).toContainText('Regelavvikelse');
  await expect(page.getByText('Ändrat för hand · 1 flytt')).toBeVisible();
  await expect(redo).toBeEnabled();
  await expect(page.getByRole('list', { name: 'Teckenförklaring' })).toContainText('Regelavvikelse');
  await undo.click();
  await expect(at(before.day!)).toBeVisible();
  await expect(page.getByText('Ändrat för hand')).toHaveCount(0);
  await expect(undo).toBeDisabled();
  expect(bodies[2].placements).toContainEqual({ ...kontroll.move, room: null });
  expect(bodies[3].placements).toContainEqual({ lesson: before.id, day: before.day, startMin: before.startMin, room: null });

  await redo.click();
  await expect(at(kontroll.move.day)).toContainText('Regelavvikelse');
  await expect(page.getByText('Ändrat för hand · 1 flytt')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: `${before.title} ligger nu ${DAYS[kontroll.move.day].toLowerCase()}` })).toBeVisible();
  await redo.click();
  await expect(page.getByRole('heading', { name: 'Viloyta (1)' })).toBeVisible();
  await expect(page.getByText('Ändrat för hand · 2 flyttar')).toBeVisible();
  await expect(redo).toBeDisabled();
  expect(bodies).toHaveLength(6);
  expect(bodies[5].placements).toHaveLength(forslag.lessons.length - 1);
  // Ett nytt förslag tömmer historiken.
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByRole('heading', { name: 'Viloyta (0)' })).toBeVisible();
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  if (shots) await page.screenshot({ path: `${shots}/schema-yta-1280.png`, fullPage: true });
  if (shots) { await page.setViewportSize({ width: 1600, height: 1000 }); await page.screenshot({ path: `${shots}/schema-yta-1600.png`, fullPage: true }); }
});

test('veckan ritar fält, nedtoning och band under och intill passen, med teckenförklaring', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.');
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto('/e2e/fixtures/schema-vecka-preview.html');
  const monday = page.getByRole('region', { name: 'Måndag' }), tuesday = page.getByRole('region', { name: 'Tisdag' }), friday = page.getByRole('region', { name: 'Fredag' });
  // Fält: synlig etikett och skärmläsartext med typ och tid.
  const sparr = monday.locator('.schema-falt.falt-sparrad');
  await expect(sparr).toHaveText('Spärrad tid: Spärrad · Klass 1 · 08:00–12:00, 08:00–12:00');
  await expect(sparr.getByText('Spärrad · Klass 1 · 08:00–12:00')).toBeVisible();
  await expect(page.locator('.schema-falt.falt-lunch')).toHaveCount(5);
  await expect(friday.locator('.schema-falt.falt-tillaten-ute')).toHaveText('Utanför tillåten tid, 15:00–16:30');
  // Mönster, inte bara färg: spärrad tid har skuggning och streckad kant.
  expect(await sparr.evaluate(el => { const s = getComputedStyle(el); return [s.backgroundImage.includes('repeating-linear-gradient'), s.borderTopStyle]; })).toEqual([true, 'dashed']);
  // Fältet ligger över hela dagens bredd och under passen.
  const column = (await monday.locator('ol').boundingBox())!, field = (await sparr.boundingBox())!;
  expect(Math.abs(field.width - column.width)).toBeLessThan(2);
  const first = monday.locator('[data-lesson="pass-36"]'), box = (await first.boundingBox())!;
  expect(await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-lesson]')?.getAttribute('data-lesson'), [box.x + box.width / 2, box.y + box.height / 2])).toBe('pass-36');
  // Band intill passet: omklädning före, dusch efter, med text för skärmläsare.
  const idrott = (await tuesday.locator('[data-lesson="pass-19"]').boundingBox())!;
  const fore = tuesday.locator('.schema-band', { hasText: 'Omklädning 10 min' }), efter = tuesday.locator('.schema-band', { hasText: 'Dusch 15 min' });
  await expect(fore).toHaveText('Före Idrott och hälsa: Omklädning 10 min');
  await expect(efter).toHaveText('Efter Idrott och hälsa: Dusch 15 min');
  const f = (await fore.boundingBox())!, e = (await efter.boundingBox())!;
  expect(Math.abs(f.y + f.height - idrott.y)).toBeLessThan(3);
  expect(Math.abs(e.y - (idrott.y + idrott.height))).toBeLessThan(4);
  expect(await fore.evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dotted');
  expect(await tuesday.locator('.schema-band.falt-restid').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  // Teckenförklaringen bygger på samma klasser och visar bara det som syns.
  const legend = page.getByRole('list', { name: 'Teckenförklaring' });
  await expect(legend.getByRole('listitem')).toHaveText(['Spärrad tid', 'Utanför tillåten tid', 'Lunchfönster', 'Omklädning och dusch', 'Restid mellan platser', 'Pass utan lärare', 'Regelavvikelse', 'Markerat pass']);
  expect(await legend.locator('.schema-sw.falt-sparrad').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('dashed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-vecka-lager-1280.png`, fullPage: true });
  if (shots) { await page.setViewportSize({ width: 1600, height: 1100 }); await page.screenshot({ path: `${shots}/schema-vecka-lager-1600.png`, fullPage: true }); }

  // Utan lager ritas inget extra.
  await page.goto('/e2e/fixtures/schema-vecka-preview.html?lager=nej');
  await expect(page.locator('.schema-day').first()).toBeVisible();
  await expect(page.locator('.schema-falt, .schema-band')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Teckenförklaring' }).getByRole('listitem')).toHaveText(['Pass utan lärare', 'Regelavvikelse', 'Markerat pass']);
});

// Villkoren syns där de verkar (05.2-SM-VILLKOR-SYNS). Arbetsytan prövas bara på dator (beslut 2026-11-13).
const egnaProv = [
  { slag: 'klass', ref: forslag.resurser.klass[0].ref, typ: 'sparrad', days: [0], startMin: 480, endMin: 600 },
  { slag: 'amne', ref: 'Svenska', typ: 'tillaten', days: [0, 1, 2, 3, 4], startMin: 480, endMin: 900 },
];
async function medVillkor(page: Page) {
  // Programämnet måndag 08:00 har 10 min marginal efter passet (05.2-SM-MARGINAL; förut R4 i förslaget).
  const marginal = { slag: 'pass', ref: 'pass-36', typ: 'marginal', beforeMin: 0, afterMin: 10, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' };
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`schema-villkor:${forslag.unitId}`, JSON.stringify({ ...forslag.villkor, egna: [...egnaProv, marginal] })] as const);
  await mock(page, body => ({ json: { ...forslag, villkor: body.villkor } }));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
}
const chip = (page: Page, name: string) => page.getByRole('group', { name: 'Visa i veckan:' }).getByRole('button', { name, exact: true });

test('villkoren syns i veckan med text, villkoret nås med tangentbord och kan tas bort och ångras', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await medVillkor(page);
  const monday = page.getByRole('region', { name: 'Måndag' }), sparr = monday.locator('.schema-falt.falt-sparrad');
  await expect(page.locator('.status-badge', { hasText: '2 egna villkor syns i veckan' })).toBeVisible();
  // Fälten säger vilket villkor de är, synligt och för skärmläsare.
  await expect(sparr).toHaveText('Spärrad tid: Spärrad · Klass 1 · 08:00–10:00, 08:00–10:00');
  await expect(sparr.getByText('Spärrad · Klass 1 · 08:00–10:00')).toBeVisible();
  await expect(page.locator('.schema-falt.falt-tillaten-ute', { hasText: 'Utanför tillåten tid · Svenska' })).toHaveCount(5);
  await expect(page.locator('.schema-falt.falt-lunch')).toHaveCount(5);
  await expect(page.locator('.schema-falt.falt-onskemal', { hasText: 'Sena pass · efter 15:30' })).toHaveCount(5);
  await expect(monday.locator('.schema-band.falt-marginal')).toHaveText('Efter Programämne: Övergång 10 min');
  // Passen ligger över fälten.
  const first = monday.locator('[data-lesson="pass-36"]'), box = (await first.boundingBox())!;
  expect(await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-lesson]')?.getAttribute('data-lesson'), [box.x + box.width / 2, box.y + box.height / 2])).toBe('pass-36');
  await expect(page.getByRole('list', { name: 'Teckenförklaring' }).getByRole('listitem'))
    .toHaveText(['Spärrad tid', 'Utanför tillåten tid', 'Lunchfönster', 'Sena pass (undviks)', 'Marginal före eller efter pass', 'Pass utan lärare']);
  // Passrutan visar justerad längd mot grundschemat och kortning vissa veckor med text.
  await expect(page.locator('[data-lesson="pass-1"]')).toContainText('65 min · 70 i grundschemat');
  await expect(page.locator('[data-lesson="pass-1"]')).toContainText('kortare 2 veckor');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  if (shots) await page.screenshot({ path: `${shots}/schema-villkor-1280.png`, fullPage: true });
  if (shots) { await page.setViewportSize({ width: 1600, height: 1000 }); await page.screenshot({ path: `${shots}/schema-villkor-1600.png`, fullPage: true }); await page.setViewportSize({ width: 1280, height: 1000 }); }

  // Tab: passen först, sedan dagens fält. Enter visar villkoret, Esc stänger och lämnar fokus på fältet.
  const field = sparr.getByRole('button', { name: /^Spärrad tid: Spärrad · Klass 1 · 08:00–10:00/u });
  await monday.locator('[data-lesson]').last().focus();
  for (let i = 0; i < 12 && !(await field.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await page.keyboard.press('Enter');
  const kalla = page.getByRole('dialog', { name: 'Spärrad tid för Klass 1' });
  await expect(kalla).toBeVisible();
  await expect(kalla).toContainText('Klass Klass 1: spärrad måndag 08:00–10:00.');
  // Programämnet 08:00–09:10 och 09:20–10:25 ligger på spärren.
  await expect(kalla).toContainText('Eget villkor 1. Berör 2 pass just nu.');
  if (shots) await page.screenshot({ path: `${shots}/schema-villkor-kalla-1280.png` });
  await page.keyboard.press('Escape');
  await expect(kalla).toBeHidden();
  await expect(field).toBeFocused();
  // Ändra öppnar villkoret i villkorsformuläret.
  await page.keyboard.press('Enter');
  await kalla.getByRole('button', { name: 'Ändra' }).click();
  await expect(page.locator('details.schema-villkor')).toHaveAttribute('open', '');
  await expect(page.getByRole('list', { name: 'Egna villkor' }).getByRole('listitem').first()).toBeFocused();
  // Ta bort med tangentbord, sedan ångra.
  await field.focus();
  await page.keyboard.press('Enter');
  await kalla.getByRole('button', { name: 'Ta bort' }).focus();
  await page.keyboard.press('Enter');
  await expect(sparr).toHaveCount(0);
  const undo = page.getByRole('button', { name: 'Ångra borttagningen' });
  await expect(undo).toBeFocused();
  await expect(page.getByText('Villkoret är borttaget: Klass Klass 1: spärrad måndag 08:00–10:00.')).toBeVisible();
  await expect(page.locator('.status-badge', { hasText: '1 eget villkor syns i veckan' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Egna villkor' }).getByRole('listitem')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(sparr).toHaveCount(1);
  await expect(field).toBeFocused();
  await expect(page.getByRole('list', { name: 'Egna villkor' }).getByRole('listitem').first()).toHaveText(/^Klass Klass 1: spärrad måndag 08:00–10:00/u);
});

test('lagren visas och döljs med chipsen, valet minns och utan lager ser veckan ut som förut', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await medVillkor(page);
  const sparr = page.getByRole('region', { name: 'Måndag' }).locator('.schema-falt.falt-sparrad');
  // Förval: alla på utom Salar.
  for (const name of ['Spärrad tid', 'Tillåten tid', 'Lunch', 'Marginaler', 'Sena pass']) await expect(chip(page, name)).toHaveAttribute('aria-pressed', 'true');
  await expect(chip(page, 'Salar')).toHaveAttribute('aria-pressed', 'false');
  await chip(page, 'Spärrad tid').click();
  await expect(sparr).toHaveCount(0);
  await expect(page.locator('.schema-falt.falt-lunch')).toHaveCount(5);
  await chip(page, 'Spärrad tid').click();
  await expect(sparr).toHaveCount(1);
  for (const name of ['Spärrad tid', 'Tillåten tid', 'Lunch', 'Marginaler', 'Sena pass']) await chip(page, name).click();
  await expect(page.locator('.schema-falt, .schema-band')).toHaveCount(0);
  await expect(page.locator('.status-badge', { hasText: 'syns i veckan' })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Teckenförklaring' }).getByRole('listitem')).toHaveText(['Pass utan lärare']);
  // Valet minns i webbläsaren.
  await page.reload();
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
  await expect(chip(page, 'Lunch')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.schema-falt, .schema-band')).toHaveCount(0);
});

test('veckan med villkor vid 200 % textstorlek', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.');
  await page.setViewportSize({ width: 1280, height: 1000 });
  await medVillkor(page);
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const sparr = page.getByRole('region', { name: 'Måndag' }).locator('.schema-falt.falt-sparrad');
  await expect(sparr.getByText('Spärrad · Klass 1 · 08:00–10:00')).toBeVisible();
  await expect(chip(page, 'Marginaler')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  // Rutnätet växer med texten.
  expect((await page.getByRole('region', { name: 'Måndag' }).locator('ol').boundingBox())!.height).toBeGreaterThan(1000);
  await sparr.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Spärrad tid för Klass 1' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${shots}/schema-villkor-200-1280.png`, fullPage: true });
  if (shots) { await page.setViewportSize({ width: 1600, height: 1000 }); await page.screenshot({ path: `${shots}/schema-villkor-200-1600.png`, fullPage: true }); }
});

// ---------------------------------------------------------------------------
// Marginal före och efter pass (05.2-SM-MARGINAL, designvyn Regler). Arbetsytan prövas bara på dator (beslut 2026-11-13).
// ---------------------------------------------------------------------------
test.describe('marginaler för pass', () => {
  test.beforeEach(({}, info) => { test.skip(info.project.name === 'phone', 'Schemaläggningens arbetsyta prövas på dator.'); });
  const band = (page: Page, day: string) => page.getByRole('region', { name: day }).locator('.schema-band.falt-marginal');
  async function start(page: Page, width = 1280) {
    await page.setViewportSize({ width, height: 1000 });
    const bodies = await mock(page, body => ({ json: { ...forslag, villkor: body.villkor } }));
    await page.goto(URL);
    await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
    await expect(page.getByText('Förslag · Alla pass lagda')).toBeVisible();
    await page.getByRole('heading', { name: 'Villkor för schemat' }).click();
    return { bodies, m: page.locator('.schema-marginaler') };
  }

  test('marginal för idrotten syns före och efter passet i klassens vy men inte i lärarens, och kan ändras, tas bort och ångras', async ({ page }) => {
    const { bodies, m } = await start(page);
    await expect(m.getByRole('heading', { name: 'Ny marginal' })).toBeVisible();
    await expect(m.getByRole('heading', { name: 'Marginaler (0)' })).toBeVisible();
    // Formuläret som i designvyn: förval 10 min före, 15 efter, omklädning och dusch, upptar eleverna; "Vid byte av plats" väntar på salsregistret.
    await expect(m.getByLabel('Gäller')).toHaveValue('amne');
    await m.getByLabel(/^Ämne/u).selectOption('Idrott och hälsa');
    await expect(m.getByLabel('Före passet')).toHaveValue('10');
    await expect(m.getByLabel('Efter passet')).toHaveValue('15');
    await expect(m.getByLabel('Etikett i schemat')).toHaveValue('Omklädning före, dusch efter');
    await expect(m.getByLabel('Eleverna', { exact: true }).first()).toBeChecked();
    await expect(m.getByRole('button', { name: 'Vid byte av plats' })).toBeDisabled();
    await expect(m.getByRole('button', { name: 'Alltid' })).toHaveAttribute('aria-pressed', 'true');
    await expect(m.getByLabel('Schemaläggaren')).toBeDisabled();
    // Förhandsvisningen ritar samma band som veckan för ett pass marginalen gäller.
    const forhand = m.locator('.schema-marginal-forhand');
    await expect(forhand.getByRole('heading')).toHaveText('Så blir det, fredag 08:10–09:45');
    await expect(forhand.locator('.bana-marginal')).toHaveText(['Före passet, 10 min: Omklädning', 'Efter passet, 15 min: Dusch']);
    await expect(forhand).toContainText('Eleverna är upptagna under omklädning och dusch.');
    await m.getByRole('button', { name: 'Lägg till marginal' }).click();
    await expect(m.getByRole('heading', { name: 'Marginaler (1)' })).toBeVisible();
    const idrott = m.getByRole('row', { name: /Ämne Idrott och hälsa/u });
    await expect(idrott.getByRole('cell')).toHaveText(['Ämne Idrott och hälsaOmklädning före, dusch efter', '10 · 15 min', 'Elever', 'Alltid', 'ÄndraTa bort']);
    // I klassens vy: omklädning före och dusch efter idrotten, med text för skärmläsare. Passets tid är undervisningen.
    await expect(band(page, 'Tisdag')).toHaveText(['Före Idrott och hälsa: Omklädning 10 min', 'Efter Idrott och hälsa: Dusch 15 min']);
    await expect(band(page, 'Fredag')).toHaveCount(2);
    await expect(page.getByRole('list', { name: 'Teckenförklaring' })).toContainText('Marginal före eller efter pass');
    const tisdag = page.getByRole('region', { name: 'Tisdag' });
    const [pass, fore, efter] = await Promise.all([tisdag.locator('[data-lesson="pass-19"]').boundingBox(), band(page, 'Tisdag').nth(0).boundingBox(), band(page, 'Tisdag').nth(1).boundingBox()]);
    expect(fore!.y + fore!.height).toBeLessThanOrEqual(pass!.y + 1);
    expect(efter!.y).toBeGreaterThanOrEqual(pass!.y + pass!.height - 3);
    expect(efter!.height / fore!.height).toBeCloseTo(1.5, 1);
    if (shots) await page.locator('.schema-week').screenshot({ path: `${shots}/schema-marginaler-vecka-1280.png` });

    // Ett enskilt pass: 10 min efter programämnet som bara upptar eleverna. Syns i klassens vy men inte i lärarens.
    await m.getByLabel('Gäller').selectOption('pass');
    await m.getByLabel(/^Pass/u).selectOption('pass-36');
    await m.getByLabel('Före passet').selectOption('0');
    await m.getByLabel('Efter passet').selectOption('10');
    await m.getByLabel('Etikett i schemat').selectOption('Övergång');
    await m.getByRole('button', { name: 'Lägg till marginal' }).click();
    await expect(band(page, 'Måndag')).toHaveText('Efter Programämne: Övergång 10 min');
    await page.getByRole('button', { name: 'Lärare', exact: true }).click();
    await page.locator('.schema-filter select').first().selectOption({ label: 'Provlärare 22' });
    await expect(page.getByRole('region', { name: 'Måndag' }).locator('[data-lesson="pass-36"]')).toBeVisible();
    await expect(page.locator('.schema-band')).toHaveCount(0);
    // Ändra: marginalen upptar också läraren och syns då i lärarens vy.
    await m.getByRole('button', { name: /^Ändra marginalen Pass Programämne/u }).click();
    await expect(m.getByRole('heading', { name: 'Ändra marginal' })).toBeVisible();
    await expect(m.getByLabel('Gäller')).toBeFocused();
    await m.getByLabel('Läraren').check();
    await m.getByRole('button', { name: 'Spara ändringen' }).click();
    await expect(band(page, 'Måndag')).toHaveText('Efter Programämne: Övergång 10 min');
    await expect(m.getByRole('row', { name: /Pass Programämne/u }).getByRole('cell').nth(2)).toHaveText('Elever, lärare');
    await page.getByRole('button', { name: 'Klass', exact: true }).click();

    // Ta bort med tangentbordet; fokus på Ångra, och ångra lägger tillbaka marginalen och banden.
    await m.getByRole('button', { name: 'Ta bort marginalen Ämne Idrott och hälsa' }).focus();
    await page.keyboard.press('Enter');
    await expect(m.getByText('Marginalen är borttagen: Ämne Idrott och hälsa, 10 · 15 min.')).toBeVisible();
    await expect(band(page, 'Tisdag')).toHaveCount(0);
    await expect(m.getByRole('button', { name: 'Ångra borttagningen' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(m.getByRole('heading', { name: 'Marginaler (2)' })).toBeVisible();
    await expect(m.getByRole('row').nth(1)).toContainText('Ämne Idrott och hälsa');
    await expect(band(page, 'Tisdag')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (shots) await m.screenshot({ path: `${shots}/schema-marginaler-1280.png` });

    // Nästa förslag får marginalerna i fast form.
    await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
    await expect.poll(() => bodies.length).toBe(2);
    expect((bodies[1].villkor as typeof forslag.villkor).egna).toEqual([
      { slag: 'amne', ref: 'Idrott och hälsa', typ: 'marginal', beforeMin: 10, afterMin: 15, occupies: ['elever'], label: 'Omklädning före, dusch efter', visibleFor: ['elever'], when: 'alltid' },
      { slag: 'pass', ref: 'pass-36', typ: 'marginal', beforeMin: 0, afterMin: 10, occupies: ['elever', 'larare'], label: 'Övergång', visibleFor: ['elever'], when: 'alltid' }]);
    if (shots) { await page.setViewportSize({ width: 1600, height: 1000 }); await m.screenshot({ path: `${shots}/schema-marginaler-1600.png` }); }
  });

  test('marginal till nästa lektion sparad med det gamla villkoret läses som marginal efter passet som upptar alla', async ({ page }) => {
    await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [`schema-villkor:${forslag.unitId}`,
      JSON.stringify({ ...forslag.villkor, egna: [{ slag: 'amne', ref: 'Programämne', typ: 'marginal', minutes: 20 }] })] as const);
    const { bodies, m } = await start(page);
    expect((bodies[0].villkor as typeof forslag.villkor).egna).toEqual([
      { slag: 'amne', ref: 'Programämne', typ: 'marginal', beforeMin: 0, afterMin: 20, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' }]);
    await expect(m.getByRole('row', { name: /Ämne Programämne/u }).getByRole('cell')).toHaveText(['Ämne ProgramämneÖvergång', '– · 20 min', 'Elever, lärare, sal', 'Alltid', 'ÄndraTa bort']);
    await expect(band(page, 'Måndag').first()).toHaveText('Efter Programämne: Övergång 20 min');
  });

  test('formuläret och listan vid 200 % textstorlek, utan sidledsrullning', async ({ page }) => {
    const { m } = await start(page);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await m.getByLabel(/^Ämne/u).selectOption('Idrott och hälsa');
    await m.getByRole('button', { name: 'Lägg till marginal' }).click();
    await expect(m.getByRole('row', { name: /Ämne Idrott och hälsa/u })).toBeVisible();
    await expect(m.getByRole('button', { name: 'Lägg till marginal' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    if (shots) await m.screenshot({ path: `${shots}/schema-marginaler-200-1280.png` });
  });
});
