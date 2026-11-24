// Skyddad arbetsyta med syntetiska rutter och samma samordnade sparanrop som produktflödet.
import { expect, schemaTestDraft, test, type Page, type SchemaDraftTestServer } from './schema-test';
import source from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaKontrollRequest } from '../lib/schema-contract.ts';
import { SCHEMA_DRAFT_VERSION, parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { schemaDatumOriginal } from '../lib/schema-datum.ts';
import { parseSchemaNyttProvSave, type SchemaNyttProvSave } from '../lib/schema-nytt-prov.ts';
import { parseSchemaProvdagarRequest, schemaProvdagarScope } from '../lib/schema-provdagar.ts';
import type { NationellProvbokning, NationellaProvUnderlag } from '../lib/nationella-prov.ts';

const headers = { 'X-Context-Epoch': '1' };
const originalDate = '2026-11-06', targetDate = '2026-11-13';
const lessonId = 'pass-55', durationMin = 75;
const base = structuredClone(source as unknown as SchemaForslag);
const exemplar = base.lessons.find(pass => pass.id === lessonId)!;
exemplar.durationMin = durationMin;
base.trims = base.trims.filter(trim => trim.lesson !== lessonId);
const occurrence = schemaDatumOriginal(base, { lesson: lessonId, originalDate })!;
const klass = base.resurser.klass.find(resource => resource.name === base.classes.find(c => exemplar.classIds.includes(c.id))?.name)!;
const kursrad = `${exemplar.title} · ${klass.name}`;
const scope = { contractVersion: SCHEMA_DRAFT_VERSION, unitId: base.unitId, schoolYear: base.schoolYear, period: base.period };
const key = `${scope.unitId}:${scope.schoolYear}:${scope.period}`;
const placements = base.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
const replacement = { lesson: lessonId, originalDate, date: targetDate, startMin: 900, room: null, durationMin: occurrence.length };
const examId = '52a10000-0000-4000-8000-000000000090';
const sal = { id: 'sal-1', name: 'Provsalen' }, vakt = { ref: '52a10000-0000-4000-8000-000000000091', name: 'Provlärare Ada' };
const granskning = (page: Page) => page.getByRole('region', { name: 'Granska nytt schemaförslag', exact: true });

async function setup(page: Page, server: SchemaDraftTestServer) {
  const { draft } = await schemaTestDraft(parseSchemaDraftSave({ ...scope, commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Sparat schema', basisVillkor: base.villkor, workingVillkor: base.villkor, grundFingerprint: base.grundFingerprint,
    placements: [placements.find(p => p.lesson === lessonId)!], locks: [], intentional: [], datedOverrides: [], activityTypes: [] }), base);
  server.drafts.set(key, draft);
  const plan = { provrevision: 1, sourceHash: `sha256:${'a'.repeat(64)}`, resultHash: `sha256:${'b'.repeat(64)}` };
  const bokning: NationellProvbokning = { id: examId, namn: 'Läsförståelse', datum: originalDate, startMin: 540, slutMin: 660,
    undervisning: 'undervisning:prov', mal: { slag: 'klass', ref: klass.ref }, tidsval: 'fast', salId: null, vakter: [], kontrolleradDatum: '2026-10-19' };
  const underlag: NationellaProvUnderlag = { gallerGymnasiet: true, deltagare: [{ ...klass, slag: 'klass',
    undervisningar: [{ ref: bokning.undervisning, title: exemplar.title }] }], salar: [sal], vakter: [vakt], skoldagar: [originalDate] };
  let revision = 1, calculations = 0, examReads = 0;
  const combinedSaves: SchemaNyttProvSave[] = [], separateExamSaves: unknown[] = [];
  let slappSparande!: () => void;
  const hallSparande = new Promise<void>(resolve => { slappSparande = resolve; });

  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/lasar/nationella-prov/lasa', route => {
    examReads++;
    return route.fulfill({ headers, json: { ...route.request().postDataJSON(),
      register: { revision, savedAt: '2026-10-19T08:00:00.000Z', document: { granskad: true, bokningar: [bokning] } }, underlag } });
  });
  await page.route('**/api/lasar/nationella-prov/spara', route => { separateExamSaves.push(route.request().postDataJSON()); return route.abort(); });
  await page.route('**/api/schema/provdagar', route => {
    const request = parseSchemaProvdagarRequest(route.request().postDataJSON());
    const key = { lesson: lessonId, originalDate };
    const installda = revision === 1 && request.dates.includes(originalDate) ? [{ ...key, date: originalDate }] : [];
    const ersatta = revision === 2 && (request.dates.includes(originalDate) || request.dates.includes(targetDate)) ? [{ ...key, date: targetDate }] : [];
    return route.fulfill({ headers, json: { ...schemaProvdagarScope(request), installda, ersatta, deltagare: [{ provId: examId, refs: [klass.ref] }] } });
  });
  await page.route('**/api/schema/forslag', route => {
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ planeraProv: true, unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period });
    calculations++;
    return route.fulfill({ headers, json: { ...base, villkor: request.villkor, provplanering: { ...plan, draftId: draft.id, expectedRevision: draft.revision,
      bookings: 1, moveCount: 1, replacedMinutes: durationMin, undervisning: [{ ref: 'undervisning:synthetic:pass-55', title: kursrad,
        bortfallMin: durationMin, ersattMin: durationMin, kvarMin: 0 }], bevaradeDatum: [] } } });
  });
  await page.route('**/api/schema/kontroll', route => {
    const request = route.request().postDataJSON() as SchemaKontrollRequest;
    const rooms = Object.fromEntries(request.placements.flatMap(p => p.room === null ? [] : [[p.lesson, p.room]]));
    return route.fulfill({ headers, json: { ...draft.control, grundFingerprint: request.grundFingerprint, fingerprint: base.fingerprint, rooms,
      metrics: { ...base.metrics, placed: request.placements.length, unplaced: base.metrics.lessons - request.placements.length } } });
  });
  await page.route('**/api/schema/forslag/spara', async route => {
    const request = parseSchemaNyttProvSave(route.request().postDataJSON());
    expect(request.prov).toEqual(plan);
    expect(request.save).toMatchObject({ ...scope, name: draft.name, draftId: draft.id, expectedRevision: draft.revision, placements, datedOverrides: [] });
    combinedSaves.push(request);
    await hallSparande;
    const stored = await schemaTestDraft({ ...request.save, datedOverrides: [replacement] }, base, null, draft);
    server.drafts.set(key, stored.draft);
    bokning.salId = sal.id; bokning.vakter = [vakt.ref]; revision++;
    return route.fulfill({ headers, json: { ...scope, draftId: draft.id, commandId: request.save.commandId, revision: stored.draft.revision } });
  });

  await page.goto('/e2e/fixtures/schema-personal-preview.html');
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  await expect.poll(() => examReads).toBeGreaterThan(0);
  await page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Granska', exact: true }).click();
  await page.getByRole('button', { name: 'Räkna om schemat', exact: true }).click();
  const panel = granskning(page);
  await expect(panel).toContainText('1 nationella prov ingår. 75 minuter undervisning');
  expect(calculations).toBe(1);
  return { draft, panel, bokning, combinedSaves, separateExamSaves, provrevision: () => revision, slappSparande };
}

test('Granska ersätter hela undervisningstillfället när schema och prov sparas tillsammans', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page, server);
  await state.panel.getByText('Undervisning som ersätts efter nationella prov', { exact: true }).click();
  const row = state.panel.getByRole('row', { name: new RegExp(kursrad) });
  await expect(row.getByRole('cell', { name: '75 min', exact: true })).toHaveCount(2);
  expect(state.combinedSaves).toHaveLength(0);
  expect(server.drafts.get(key)).toEqual(state.draft);
  try {
    await state.panel.getByRole('button', { name: 'Använd förslaget', exact: true }).click();
    await expect.poll(() => state.combinedSaves.length).toBe(1);
    await expect(state.panel.getByRole('button', { name: 'Sparar förslaget…', exact: true })).toBeDisabled();
    expect(state.provrevision()).toBe(1);
    expect(server.drafts.get(key)).toEqual(state.draft);
  } finally {
    state.slappSparande();
  }

  await expect(state.panel).toHaveCount(0);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  expect(server.drafts.get(key)).toMatchObject({ revision: state.draft.revision + 1, datedOverrides: [replacement] });
  expect(state.provrevision()).toBe(2);
  expect(state.bokning).toMatchObject({ salId: sal.id, vakter: [vakt.ref] });
  expect(server.saves).toHaveLength(0);
  expect(state.separateExamSaves).toHaveLength(0);

  await page.locator('summary').filter({ hasText: 'Bokade nationella prov' }).click();
  await page.getByRole('button', { name: /Visa provdagen för/u }).click();
  const kalenderpass = page.locator(`[data-prov="${examId}"]`);
  await expect(kalenderpass).toContainText(sal.name);
  await expect(kalenderpass).toContainText(vakt.name);
  await expect(page.locator(`[data-occurrence="${occurrence.key}"]`)).toHaveCount(0);
});

test('Granska kan avvisa provomräkningen utan att skriva någon av planerna', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page, server);
  await state.panel.getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  await expect(state.panel).toHaveCount(0);
  expect(state.combinedSaves).toHaveLength(0);
  expect(state.separateExamSaves).toHaveLength(0);
  expect(server.saves).toHaveLength(0);
  expect(state.provrevision()).toBe(1);
  expect(server.drafts.get(key)).toEqual(state.draft);
});
