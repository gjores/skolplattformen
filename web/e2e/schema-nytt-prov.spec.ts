// Samma knapp räknar schema och bokade prov. Rutter och databas är syntetiska i browserprovet.
import { expect, schemaTestDraft, test, type Page, type SchemaDraftTestServer } from './schema-test';
import source from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import { SCHEMA_DRAFT_VERSION, parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { schemaDatumOriginal } from '../lib/schema-datum.ts';
import { parseSchemaNyttProvSave, type SchemaNyttProvSave } from '../lib/schema-nytt-prov.ts';
import type { NationellProvbokning, NationellaProvUnderlag } from '../lib/nationella-prov.ts';

const headers = { 'X-Context-Epoch': '1' };
const base = source as unknown as SchemaForslag;
const scope = { contractVersion: SCHEMA_DRAFT_VERSION, unitId: base.unitId, schoolYear: base.schoolYear, period: base.period };
const key = `${scope.unitId}:${scope.schoolYear}:${scope.period}`;
const originalDate = '2026-11-06', targetDate = '2026-11-13';
const klass = base.resurser.klass[1], klassId = base.classes.find(c => c.name === klass.name)!.id;
const occurrence = base.lessons.filter(l => l.classIds.includes(klassId) && l.startMin !== null && l.startMin >= 540 && l.startMin < 660)
  .flatMap(lesson => schemaDatumOriginal(base, { lesson: lesson.id, originalDate }) ?? [])[0];
const replacement = { lesson: occurrence.lesson.id, originalDate, date: targetDate, startMin: 900, room: null, durationMin: occurrence.length };
const placements = base.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);
const examId = '52a10000-0000-4000-8000-000000000090';
const sal = { id: 'sal-1', name: 'Provsalen' }, vakt = { ref: '52a10000-0000-4000-8000-000000000091', name: 'Provlärare Ada' };

function vantan() {
  let slapp!: () => void;
  const svar = new Promise<void>(resolve => { slapp = resolve; });
  return { svar, slapp };
}

async function setup(page: Page, server: SchemaDraftTestServer, lage: 'komplett' | 'ofullstandigt' | 'avbryt') {
  const { draft } = await schemaTestDraft(parseSchemaDraftSave({ ...scope, commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Sparat schema', basisVillkor: base.villkor, workingVillkor: base.villkor, grundFingerprint: base.grundFingerprint,
    placements: [placements.find(p => p.lesson === occurrence.lesson.id)!], locks: [], intentional: [], datedOverrides: [], activityTypes: [] }), base);
  server.drafts.set(key, draft);
  const plan = { provrevision: 1, sourceHash: `sha256:${'a'.repeat(64)}`, resultHash: `sha256:${'b'.repeat(64)}` };
  const bokning: NationellProvbokning = { id: examId, namn: 'Läsförståelse', datum: originalDate, startMin: 540, slutMin: 660,
    undervisning: 'undervisning:prov', mal: { slag: 'klass', ref: klass.ref }, tidsval: 'fast', salId: null, vakter: [], kontrolleradDatum: '2026-10-19' };
  const underlag: NationellaProvUnderlag = { gallerGymnasiet: true, deltagare: [{ ...klass, slag: 'klass', undervisningar: [{ ref: bokning.undervisning, title: occurrence.lesson.title }] }],
    salar: [sal], vakter: [vakt], skoldagar: [originalDate] };
  let revision = 1, calculations = 0;
  const saves: SchemaNyttProvSave[] = [], hallBerakning = vantan(), hallSparande = vantan();

  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/lasar/nationella-prov/lasa', route => route.fulfill({ headers, json: { ...route.request().postDataJSON(),
    register: { revision, savedAt: '2026-10-19T08:00:00.000Z', document: { granskad: true, bokningar: [bokning] } }, underlag } }));
  await page.route('**/api/schema/forslag', async route => {
    const request = route.request().postDataJSON();
    expect(request).toMatchObject({ planeraProv: true, unitId: scope.unitId, schoolYear: scope.schoolYear, period: scope.period });
    calculations++;
    if (lage === 'avbryt') await hallBerakning.svar;
    if (lage === 'ofullstandigt') return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: {
      reason: 'schema_nytt_prov_unresolved', bookings: 3, unplaced: 2, resourceIssues: 1, remainingMinutes: 90, dateIssues: 2 } } });
    return route.fulfill({ headers, json: { ...base, villkor: request.villkor,
      provplanering: { ...plan, draftId: draft.id, expectedRevision: draft.revision, bookings: 1, moveCount: 1, replacedMinutes: replacement.durationMin } } }).catch(() => {});
  });
  await page.route('**/api/schema/forslag/spara', async route => {
    const request = parseSchemaNyttProvSave(route.request().postDataJSON());
    expect(request.prov).toEqual(plan);
    expect(request.save).toMatchObject({ ...scope, name: draft.name, draftId: draft.id, expectedRevision: draft.revision, placements, datedOverrides: [] });
    saves.push(request);
    await hallSparande.svar;
    const stored = await schemaTestDraft({ ...request.save, datedOverrides: [replacement] }, base, null, draft);
    server.drafts.set(key, stored.draft);
    bokning.salId = sal.id; bokning.vakter = [vakt.ref]; revision++;
    return route.fulfill({ headers, json: { ...scope, draftId: draft.id, commandId: request.save.commandId, revision: stored.draft.revision } });
  });

  await page.goto('/e2e/fixtures/schema-personal-preview.html');
  await page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Lägg schema', exact: true }).click();
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Beräkning', exact: true }).click();
  return { draft, saves, calculations: () => calculations, hallBerakning, hallSparande };
}

const taFram = (page: Page) => page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true });
const avbryt = (page: Page) => page.getByRole('button', { name: 'Avbryt beräkningen', exact: true });

test('ett klick sparar schema, provresurser och ersättningstid tillsammans', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page, server, 'komplett');
  await taFram(page).click();
  await expect(page.getByText('Sparar schema och nationella prov tillsammans…', { exact: true })).toBeVisible();
  await expect(avbryt(page)).toHaveCount(0);
  await expect(page.getByText('Schema och nationella prov sparade', { exact: true })).toHaveCount(0);
  expect(server.drafts.get(key)).toEqual(state.draft);
  expect(server.saves).toHaveLength(0);
  state.hallSparande.slapp();

  const resultat = page.getByRole('region', { name: 'Nationella prov i det sparade schemat', exact: true });
  await expect(resultat).toContainText('Schema och nationella prov sparade');
  await expect(resultat).toContainText(`1 lektion flyttad med ${replacement.durationMin} minuters ersatt undervisningstid.`);
  await resultat.getByRole('button', { name: 'Visa provdagen', exact: true }).click();
  await expect(page.locator(`[data-prov="${examId}"]`)).toContainText('Provsalen');
  await expect(page.locator(`[data-prov="${examId}"]`)).toContainText('Provlärare Ada');
  await expect(page.locator(`[data-occurrence="${occurrence.key}"]`)).toHaveCount(0);
  expect(server.drafts.get(key)?.datedOverrides).toEqual([replacement]);
  expect(state.calculations()).toBe(1);
  expect(state.saves).toHaveLength(1);
  expect(server.saves).toHaveLength(0);
});

test('ofullständig planering visar olösta prov och undervisning utan att ersätta utkastet', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page, server, 'ofullstandigt');
  await taFram(page).click();
  const fel = page.getByRole('alert').filter({ hasText: 'Nationella prov behöver ses över' });
  await expect(fel).toContainText('3 provbokningar kontrollerades. 2 pass saknar tid. 1 resursproblem behöver ses över. 90 minuter undervisning återstår att ersätta. 2 datumavvikelser behöver ses över.');
  await expect(fel).toContainText('Det sparade utkastet ligger kvar.');
  expect(state.calculations()).toBe(1);
  expect(state.saves).toHaveLength(0);
  expect(server.saves).toHaveLength(0);
  expect(server.drafts.get(key)).toEqual(state.draft);
});

test('avbrott under beräkningen lämnar det sparade schemat', async ({ page, schemaDraftServer: server }) => {
  const state = await setup(page, server, 'avbryt');
  await taFram(page).click();
  await expect.poll(state.calculations).toBe(1);
  await expect(page.getByText(/Bokade nationella prov planeras innan förslaget sparas/u)).toBeVisible();
  await avbryt(page).click();
  state.hallBerakning.slapp();
  await expect(page.getByText('Beräkningen avbröts. Det sparade utkastet ligger kvar.', { exact: true })).toBeVisible();
  expect(state.saves).toHaveLength(0);
  expect(server.saves).toHaveLength(0);
  expect(server.drafts.get(key)).toEqual(state.draft);
});
