// Granskningsflödet i produktens komponenter med syntetiska schema- och sparrutter.
import { test, expect, type Page } from './schema-test';
import { veckoval } from './schema-vecko-val';
import fixture from './schema-fixture';
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import {
  SCHEMA_CONTRACT_VERSION,
  type SchemaForslag,
  type SchemaKontrollRequest,
  type SchemaViolation,
} from '../lib/schema-contract.ts';
import { schemaDatumOriginal, type SchemaDatumRequest } from '../lib/schema-datum.ts';
import { samlingResurser, type SamlingResurs } from '../lib/schema-samling.ts';

const url = '/e2e/fixtures/schema-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const base = fixture as unknown as SchemaForslag;
const granskningsyta = (page: Page) => page.getByRole('region', { name: 'Granska utkastet', exact: true });
const granskatPass = (page: Page) => page.getByRole('region', { name: 'Pass från granskningen', exact: true });
const vyval = (page: Page) => page.getByRole('navigation', { name: 'Arbetsytor', exact: true });

async function start(page: Page, proposal = base, violationsFor: (request: SchemaKontrollRequest) => SchemaViolation[] = () => [], entry = url) {
  const controlRequests: SchemaKontrollRequest[] = [];
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...proposal, villkor: input.villkor, period: input.period } });
  });
  await page.route('**/api/schema/kontroll', route => {
    const input = route.request().postDataJSON() as SchemaKontrollRequest;
    controlRequests.push(input);
    const violations = violationsFor(input);
    return route.fulfill({ headers, json: {
      ...checked.clash,
      contractVersion: SCHEMA_CONTRACT_VERSION,
      grundFingerprint: input.grundFingerprint,
      fingerprint: proposal.fingerprint,
      violations,
      total: violations.length,
      metrics: { ...proposal.metrics, placed: input.placements.length, unplaced: proposal.lessons.length - input.placements.length },
      teachings: proposal.teachings,
      trims: proposal.trims,
      rooms: Object.fromEntries(input.placements.filter(p => p.room !== null).map(p => [p.lesson, p.room])),
    } });
  });
  await page.goto(entry);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('.schema-week')).toBeVisible();
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  return controlRequests;
}

test('Granska tar fram ett daterat provförslag med resurser och ersättningstid utan att spara', async ({ page, schemaDraftServer }) => {
  const originalDate = '2026-11-06', date = '2026-11-13';
  const occurrence = base.lessons.flatMap(l => schemaDatumOriginal(base, { lesson: l.id, originalDate }) ?? []).find(o => !o.lesson.egenAktivitet)!;
  const calls: SchemaDatumRequest[] = [];
  await page.route('**/api/schema/provforslag', route => {
    const request = route.request().postDataJSON() as SchemaDatumRequest;
    calls.push(request);
    const { contractVersion, unitId, schoolYear, period, grundFingerprint } = request;
    return route.fulfill({ headers, json: { contractVersion, unitId, schoolYear, period, grundFingerprint, provrevision: 2,
      bokningar: [{ id: '52a10000-0000-4000-8000-000000000090', namn: 'Läsförståelse', datum: originalDate, startMin: 540, slutMin: 660,
        deltagarnamn: 'Klass 2', deltagare: 24, sal: { id: 'sal-1', name: 'Provsalen' },
        vakter: [{ ref: '52a10000-0000-4000-8000-000000000091', name: 'Provlärare Ada' }], problem: [] }],
      bortfall: [{ ref: 'undervisning:test', title: `${occurrence.lesson.title} · Klass 2`, bortfallMin: occurrence.length, ersattMin: occurrence.length, kvarMin: 0 }],
      ersattningar: [{ lesson: occurrence.lesson.id, originalDate, date, startMin: 900, room: null, durationMin: occurrence.length }],
    } });
  });
  await start(page, base, undefined, '/e2e/fixtures/schema-personal-preview.html');
  const saved = structuredClone(schemaDraftServer.saves);
  await vyval(page).getByRole('button', { name: 'Granska', exact: true }).click();
  const calculate = page.getByRole('button', { name: 'Ta fram provförslag', exact: true });
  await expect(calculate).toBeEnabled();
  await calculate.click();
  await expect(page.getByText('Läsförståelse', { exact: true })).toBeVisible();
  await expect(page.getByText('Provsalen', { exact: true })).toBeVisible();
  await expect(page.getByText('Provlärare Ada', { exact: true })).toBeVisible();
  await expect(page.getByText(`${occurrence.lesson.title} · Klass 2`, { exact: true })).toBeVisible();
  const original = page.getByRole('button', { name: /^Visa tillfället för/u });
  await original.click();
  await expect(granskatPass(page)).toContainText(occurrence.lesson.title);
  await granskatPass(page).getByRole('button', { name: /^Tillbaka till/u }).click();
  await expect(page.getByText('Läsförståelse', { exact: true })).toBeVisible();
  await expect(original).toBeFocused();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ period: 'lasar', grundFingerprint: base.grundFingerprint, dates: [], datedOverrides: [] });
  expect(calls[0].placements.some(p => p.lesson === occurrence.lesson.id)).toBe(true);
  expect(schemaDraftServer.saves).toEqual(saved);
});

test('regelkrocken öppnar valt pass och tillfällig jämförelse återgår till samma fynd utan skrivning', async ({ page, schemaDraftServer }, info) => {
  const ena = base.lessons.find(l => l.id === 'pass-7')!;
  const andra = base.lessons.find(l => l.id === 'pass-145')!;
  const clash = { code: 'teacher_clash', message: 'Matematik och Svenska överlappar för Provlärare 4.', lessons: [ena.id, andra.id] };
  const group = { ref: '52a10000-0000-4000-8000-000000000099', name: 'Filmgruppen' };
  const groupResource: SamlingResurs = { key: `grupp:${group.ref}`, id: 'grupp-film', slag: 'grupp', name: group.name, lessons: [ena.id], busyLessons: [ena.id], size: null, antagen: false, year: null };
  const proposal = { ...base, resurser: { ...base.resurser, grupp: [...base.resurser.grupp, group] }, lessons: base.lessons.map(l => l.id === andra.id ? { ...l, day: ena.day, startMin: ena.startMin } : l) };
  await page.route('**/api/schema/samling', route => route.fulfill({ headers, json: {
    contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: proposal.grundFingerprint, resources: [...samlingResurser(proposal), groupResource], clusters: [],
  } }));
  const controls = await start(page, proposal, input => input.placements.some(p => p.lesson === andra.id) ? [clash] : []);
  await vyval(page).getByRole('button', { name: 'Granska', exact: true }).click();
  const review = granskningsyta(page);
  await expect(review).toBeVisible();
  await expect(vyval(page).getByRole('button', { name: 'Granska', exact: true })).toHaveAttribute('aria-current', 'page');
  await review.getByRole('button', { name: /^Kontrollera (schemat|igen)$/u }).click();
  const filter = review.getByLabel('Visa fynd', { exact: true });
  await filter.selectOption('regler');
  const finding = review.locator('[data-granskafynd]').filter({ hasText: clash.message });
  await expect(finding.getByRole('button', { name: 'Visa passet', exact: true })).toHaveCount(2);
  const selected = finding.locator(`[data-granskamal="${andra.id}"]`);
  await selected.scrollIntoViewIfNeeded();
  const top = await selected.evaluate(element => element.getBoundingClientRect().top);
  const savedBefore = structuredClone(schemaDraftServer.saves);
  const controlCount = controls.length;

  await selected.click();
  await expect(granskatPass(page)).toContainText(andra.title);
  await expect(page.locator('.schema-week').locator(`[data-lesson="${andra.id}"]`)).toBeFocused();
  await expect(veckoval(page)).toHaveValue(`${base.classes.find(c => c.id === andra.classIds[0])!.name} · Klass`);

  await granskatPass(page).getByRole('button', { name: 'Jämför resurser', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Jämför resurser', exact: true });
  const compared = comparison.getByRole('list', { name: 'Jämförda resurser', exact: true });
  await expect(compared).toContainText('Klass 4');
  await expect(compared.getByRole('listitem').filter({ hasText: 'Provlärare 4' }).getByText(/Matematik/u)).toBeVisible();
  const search = comparison.getByRole('combobox', { name: 'Lägg till resurs', exact: true });
  await search.fill('Klass 2');
  await page.getByRole('option', { name: /^Klass 2 klass$/u }).click();
  const candidate = compared.getByRole('listitem').filter({ hasText: /^Klass 2/u });
  await expect(candidate).toBeVisible();
  await candidate.getByRole('button', { name: 'Ta bort klass Klass 2 från jämförelsen', exact: true }).click();
  await expect(candidate).toHaveCount(0);
  await expect(search).toBeFocused();
  await search.fill(group.name);
  await page.getByRole('option', { name: /^Filmgruppen grupp$/u }).click();
  await expect(compared.getByRole('listitem').filter({ hasText: group.name }).getByText(/Matematik/u)).toBeVisible();

  await granskatPass(page).getByRole('button', { name: /^Tillbaka till/u }).click();
  await expect(filter).toHaveValue('regler');
  await expect(selected).toBeFocused();
  await expect(selected).toBeInViewport();
  expect(Math.abs((await selected.evaluate(element => element.getBoundingClientRect().top)) - top)).toBeLessThan(8);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  expect(schemaDraftServer.saves).toEqual(savedBefore);
  expect(controls).toHaveLength(controlCount);
  await page.screenshot({ path: info.outputPath('tillbaka-till-samma-fynd.png') });

  await selected.click();
  await page.getByRole('button', { name: 'Ta bort tiden', exact: true }).click();
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.placements.some(p => p.lesson === andra.id)).toBe(false);
  await granskatPass(page).getByRole('button', { name: /^Tillbaka till/u }).click();
  await expect(filter).toHaveValue('regler');
  await expect(finding).toHaveCount(0);
  await expect(review.getByRole('paragraph').filter({ hasText: /^Fyndet finns inte längre i listan\.$/u })).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Fynd och ändringar', exact: true })).toBeFocused();
});

test('ett flyttat datumtillfälle öppnas på rätt dag även när samma pass förekommer två gånger', async ({ page, schemaDraftServer }, info) => {
  const originalDate = '2026-11-06', date = '2026-11-13', startTime = '15:00';
  await page.route('**/api/schema/datum', route => {
    const input = route.request().postDataJSON() as SchemaDatumRequest;
    const checkedDates = [...new Set([...input.dates, ...input.datedOverrides.flatMap(a => [a.originalDate, a.date])])].sort();
    const violations = input.datedOverrides.map(a => ({
      date: a.date, code: 'teacher_clash', message: 'De två tillfällena behöver jämföras.',
      lessons: [a.lesson], occurrences: [`${a.lesson}@${a.originalDate}`, `${a.lesson}@${a.date}`],
    }));
    return route.fulfill({ headers, json: {
      contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, fingerprint: base.fingerprint,
      datedOverrides: input.datedOverrides, checkedDates, violations, total: violations.length, timeChanges: [],
    } });
  });
  await start(page);
  const val = page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen', exact: true });
  await val.getByRole('button', { name: 'Datumintervall', exact: true }).click();
  await val.getByLabel('Från', { exact: true }).fill(originalDate);
  await val.getByLabel('Till', { exact: true }).fill(date);
  const original = page.locator(`[data-date="${originalDate}"] [data-occurrence]`).first();
  const key = (await original.getAttribute('data-occurrence'))!;
  const passId = (await original.getAttribute('data-lesson'))!;
  await original.click();
  const dialog = page.getByRole('dialog', { name: 'Ändra ett tillfälle', exact: true });
  await dialog.getByLabel('Datum', { exact: true }).fill(date);
  await dialog.getByLabel('Starttid', { exact: true }).fill(startTime);
  await dialog.getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.datedOverrides.length).toBe(1);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  const savedBefore = structuredClone(schemaDraftServer.saves);

  await vyval(page).getByRole('button', { name: 'Granska', exact: true }).click();
  const review = granskningsyta(page);
  const filter = review.getByLabel('Visa fynd', { exact: true });
  await filter.selectOption('regler');
  const finding = review.locator('[data-granskafynd]').filter({ hasText: 'De två tillfällena behöver jämföras.' });
  await expect(finding.getByRole('button', { name: 'Visa tillfället', exact: true })).toHaveCount(2);
  const hit = finding.locator(`[data-granskamal="${key}"]`);
  await hit.click();
  const moved = page.locator(`[data-date="${date}"] [data-occurrence="${key}"]`);
  const regular = page.locator(`[data-date="${date}"] [data-occurrence="${passId}@${date}"]`);
  await expect(moved).toBeFocused();
  await expect(regular).toBeVisible();
  await expect(regular).not.toBeFocused();
  await granskatPass(page).getByRole('button', { name: 'Ändra tillfället', exact: true }).click();
  await expect(dialog.getByLabel('Datum', { exact: true })).toHaveValue(date);
  await expect(dialog.getByLabel('Starttid', { exact: true })).toHaveValue(startTime);
  await expect(dialog).toContainText('Tillfället hör ursprungligen till 6 nov');
  await dialog.getByRole('button', { name: 'Avbryt', exact: true }).click();

  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await granskatPass(page).getByRole('button', { name: 'Jämför resurser', exact: true }).click();
  const comparison = page.getByRole('region', { name: 'Jämför resurser', exact: true });
  await expect(comparison.getByText(/15:00.*Faktiskt tillfälle/u)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('jamfor-faktiskt-tillfalle-200.png') });
  await granskatPass(page).getByRole('button', { name: /^Tillbaka till/u }).click();
  await expect(filter).toHaveValue('regler');
  await expect(hit).toBeFocused();
  expect(schemaDraftServer.saves).toEqual(savedBefore);
});
