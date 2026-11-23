// Syntetiskt webbläsarprov av gransknings- och sparflödet. Motor, mandat och databas prövas separat.
import { expect, schemaTestDraft, test, type Page, type SchemaDraftTestServer } from './schema-test';
import fixture from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaPlacement } from '../lib/schema-contract.ts';
import { type SchemaDatumAndring, type SchemaDatumRequest } from '../lib/schema-datum.ts';
import { parseSchemaDraftSave, type SchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { addSchemaDays, schemaMonday } from '../lib/schema-vecka.ts';
import { valjVeckoresurs } from './schema-vecko-val';

const headers = { 'X-Context-Epoch': '1' };
const proposal = fixture as unknown as SchemaForslag;
const day = '2026-12-08', name = 'Engelsk temaförmiddag';
const movedId = 'pass-13', creditedId = 'pass-62', untouchedId = 'pass-31';
const classes = proposal.resurser.klass.slice(0, 2);
const lessons = proposal.lessons.filter(lesson => [movedId, creditedId, untouchedId].includes(lesson.id));
const teachings = proposal.teachings.filter(t => t.title === 'Engelska' && t.classes.some(label => classes.some(c => c.name === label)));
const teachingRef = teachings[0].ref;
const credits = teachings.map(t => t.ref).sort();
const source: SchemaForslag = { ...proposal, lessons, teachings, trims: [], omitted: [], links: [],
  fordelning: proposal.fordelning.filter(row => credits.includes(row.ref)),
  classes: proposal.classes.slice(0, 2), resurser: { ...proposal.resurser, klass: classes },
  statistics: { iterations: 0, lessons: [], bottlenecks: [] }, metrics: { lessons: lessons.length, placed: lessons.length, unplaced: 0, studentGapMin: 0, teacherGapMin: 0 } };
const scope = { contractVersion: 1 as const, unitId: source.unitId, schoolYear: source.schoolYear, period: 'lasar' as const };
const key = `${scope.unitId}:${scope.schoolYear}:${scope.period}`;
const rawPlacements: SchemaPlacement[] = lessons.map(lesson => ({ lesson: lesson.id, day: lesson.day!,
  startMin: lesson.startMin! + (lesson.id === movedId ? 5 : 0), room: lesson.roomId }));
const moved: SchemaDatumAndring = { lesson: movedId, originalDate: day, date: day, startMin: 780, room: null, durationMin: 60 };
const cancelled = [{ lesson: creditedId, originalDate: day }];

async function setup(page: Page, server: SchemaDraftTestServer) {
  const seed = parseSchemaDraftSave({ ...scope, commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0, name: 'Sparat grundschema',
    basisVillkor: source.villkor, workingVillkor: source.villkor, grundFingerprint: source.grundFingerprint, placements: rawPlacements, locks: [] });
  const { draft } = await schemaTestDraft(seed, source);
  server.drafts.set(key, draft);
  const writes: SchemaDraftSave[] = [], requests: (SchemaDatumRequest & { activity: Record<string, unknown> })[] = [];
  await page.route('**/api/schema/utkast/spara', async route => {
    const input = parseSchemaDraftSave(route.request().postDataJSON());
    writes.push(input);
    const original = server.drafts.get(key);
    if (input.expectedRevision !== original?.revision || input.draftId !== original?.id) {
      return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'schema_draft_conflict' } } });
    }
    const result = await schemaTestDraft(input, source, null, original);
    server.drafts.set(key, result.draft);
    return route.fulfill({ headers, json: { ...scope, ...result } });
  });
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/datum', route => {
    const input = route.request().postDataJSON() as SchemaDatumRequest;
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint,
      fingerprint: source.fingerprint, datedOverrides: input.datedOverrides, checkedDates: input.dates, violations: [], total: 0, timeChanges: [] } });
  });
  await page.route('**/api/schema/daterad-aktivitet', route => {
    const input = route.request().postDataJSON() as typeof requests[number];
    requests.push(input);
    return route.fulfill({ headers, json: { activity: { ...input.activity, moves: [moved], cancelled, credits },
      effects: [
        { lesson: movedId, originalDate: day, title: 'Engelska', classes: [classes[0].name], minutes: 60, status: 'moved', target: moved },
        { lesson: creditedId, originalDate: day, title: 'Engelska', classes: [classes[1].name], minutes: 55, status: 'credited', target: null },
      ],
      totals: teachings.map((t, index) => ({ ref: t.ref, title: t.title, classes: t.classes, lost: index ? 55 : 60,
        moved: index ? 0 : 60, credited: 55, remaining: 0, net: index ? 0 : 55 })), uncreditedClasses: [], blockers: [] } });
  });
  await page.clock.setFixedTime(new Date('2026-11-23T10:00:00Z'));
  await page.goto('/e2e/fixtures/schema-preview.html');
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  return { draft, requests, writes };
}

const area = (page: Page, name: string) => page.getByRole('navigation', { name: 'Arbetsytor', exact: true })
  .getByRole('button', { name, exact: true });

async function previewActivity(page: Page) {
  await area(page, 'Lägg schema').click();
  await page.getByRole('button', { name: 'Ny aktivitet', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Ny aktivitet', exact: true });
  await dialog.getByRole('button', { name: 'Datum', exact: true }).click();
  await dialog.getByLabel('Namn', { exact: true }).fill(name);
  await dialog.getByLabel('Datum', { exact: true }).fill(day);
  await dialog.getByLabel('Starttid', { exact: true }).fill('10:30');
  await dialog.getByLabel('Sluttid', { exact: true }).fill('12:15');
  await dialog.getByRole('button', { name: 'Välj alla klasser', exact: true }).click();
  for (const lessonClass of classes) await expect(dialog.getByRole('checkbox', { name: lessonClass.name, exact: true })).toBeChecked();
  await dialog.getByRole('combobox', { name: 'Ämne och nivå från timplanen', exact: true }).selectOption(teachingRef);
  await dialog.getByRole('spinbutton', { name: 'Minuter undervisningstid', exact: true }).fill('55');
  await dialog.getByRole('button', { name: 'Räkna om schemat', exact: true }).click();
  await expect(area(page, 'Granska')).toHaveAttribute('aria-current', 'page');
  const preview = page.getByRole('region', { name: `Förslag med ${name}`, exact: true });
  await expect(preview.getByRole('heading', { name: `Förslag med ${name}`, exact: true })).toBeFocused();
  const accept = preview.getByRole('button', { name: 'Använd förslaget', exact: true });
  await expect(accept).toBeEnabled();
  return { preview, accept };
}

test('skolgemensam engångsaktivitet granskas före sparande och återläses i rätt faktisk vecka', async ({ page, schemaDraftServer }, info) => {
  const { draft, writes, requests } = await setup(page, schemaDraftServer);
  const { preview } = await previewActivity(page);
  expect(requests).toHaveLength(1);
  expect(requests[0].activity).toMatchObject({ name, date: day, startMin: 630, endMin: 735,
    classRefs: classes.map(c => c.ref), credit: { ref: teachingRef, minutes: 55 } });
  expect(requests[0].placements.find(p => p.lesson === movedId)?.startMin).toBe(645);
  const time = preview.getByRole('table', { name: 'Undervisningstid efter aktiviteten', exact: true });
  await expect(time.getByRole('row').filter({ hasText: 'Klass 1' }).getByRole('cell')).toHaveText([/Engelska\s*Klass 1/u, '60 min', '60 min', '55 min', '0 min', '+55 min']);
  await expect(time.getByRole('row').filter({ hasText: 'Klass 2' }).getByRole('cell')).toHaveText([/Engelska\s*Klass 2/u, '55 min', '0 min', '55 min', '0 min', '0 min']);
  await preview.getByText('Berörda lektioner (2)', { exact: true }).click();
  await expect(preview.getByRole('listitem').filter({ hasText: 'Klass 1' })).toContainText(/Flyttas till .*13:00/u);
  await expect(preview.getByRole('listitem').filter({ hasText: 'Klass 2' })).toContainText('Ersätts av aktiviteten');
  expect(writes).toHaveLength(0);
  expect(schemaDraftServer.drafts.get(key)).toEqual(draft);
  await preview.getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Använd förslaget', exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(0);
  expect(schemaDraftServer.drafts.get(key)).toEqual(draft);

  const { accept } = await previewActivity(page);
  await accept.click();
  await expect(accept).toHaveCount(0);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].placements).toEqual(rawPlacements);
  expect(writes[0].datedOverrides).toEqual([]);
  expect(writes[0].datedActivities).toEqual([{ ...requests[1].activity, moves: [moved], cancelled, credits }]);
  expect(schemaDraftServer.drafts.get(key)?.revision).toBe(draft.revision + 1);
  await expect(page.getByRole('region', { name: 'Sparat schemautkast', exact: true })).toContainText('Sparat på servern');

  await page.reload();
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  await area(page, 'Lägg schema').click();
  const modes = page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen', exact: true });
  await modes.getByRole('button', { name: 'Vecka', exact: true }).click();
  await modes.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption(schemaMonday(day));
  await valjVeckoresurs(page, 'Klass 1', 'Klass');
  await expect(page.locator(`[data-occurrence="${movedId}@${day}"] time`)).toContainText('13:00');
  await expect(page.locator('.schema-week').getByText(name, { exact: true }).first()).toBeVisible();
  await valjVeckoresurs(page, 'Klass 2', 'Klass');
  await expect(page.locator(`[data-occurrence="${creditedId}@${day}"]`)).toHaveCount(0);
  await expect(page.locator('.schema-week').getByText(name, { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('daterad-aktivitet-i-schemat.png'), fullPage: false });
  const next = addSchemaDays(day, 7);
  await modes.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption(schemaMonday(next));
  await expect(page.locator(`[data-occurrence="${creditedId}@${next}"]`)).toBeVisible();
  await expect(page.locator('.schema-week').getByText(name, { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1);
});
