// Riktig workspace och rena årsunderlag mot syntetisk, hashbunden API-lagring.
// Motorn och den skyddade API-kedjan prövas separat med samma modell.
import { test, expect, schemaTestDraft, type Page, type SchemaDraftTestServer } from './schema-test';
import { parseSchemaDraftSave, type SchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaForslagRequest, type SchemaSolution, type SchemaVillkor } from '../lib/schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag } from '../lib/schema-underlag.ts';
import { datumFixture } from '../lib/schema-datum-fixture.mjs';
import type { TjanstPlanRead } from '../lib/tjanst-contract.ts';
import { schemaDatumOriginal } from '../lib/schema-datum.ts';

const unitId = '52a10000-0000-4000-8000-000000000001', scope = `${unitId}:2026:lasar`;
const headers = { 'X-Context-Epoch': '1' }, URL = '/e2e/fixtures/schema-spara-preview.html';
function proposal(year: boolean, passRule = false): SchemaForslag {
  const x = datumFixture({ year }), plan = { ...x.plan, unitId } as unknown as TjanstPlanRead;
  const villkor = structuredClone(x.request.villkor) as SchemaVillkor;
  if (passRule) villkor.egna.push({ slag: 'pass', ref: x.of('Franska')!.id, typ: 'marginal', beforeMin: 5, afterMin: 0, occupies: ['elever'], label: 'Förberedelse', visibleFor: ['elever'], when: 'alltid' });
  const request: SchemaForslagRequest = { ...x.request, period: 'lasar', unitId, villkor }, underlag = buildSchemaUnderlag(plan, request, x.basis);
  const placements = underlag.labels.lessons.map(l => ({ lesson: l.id, day: l.title === 'Franska' ? 1 : l.title === 'Historia' ? 2 : 0, startMin: 480, room: l.title === 'Matematik' ? 'sal-1' : 'sal-2' }));
  return schemaForslag(plan, request, underlag, { status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0, metrics: { studentGapMin: 0, teacherGapMin: 0 } } as SchemaSolution);
}
async function setup(page: Page, server: SchemaDraftTestServer, bindings = false) {
  const old = proposal(false, bindings), annual = proposal(true), placements = old.lessons.map(l => ({ lesson: l.id, day: l.day!, startMin: l.startMin!, room: l.roomId }));
  const original = old.lessons.find(l => l.title === 'Franska' && l.term === 'ht')!;
  const occurrence = schemaDatumOriginal(old, { lesson: original.id, originalDate: '2026-11-03' })!;
  const datedOverrides = bindings ? [{ lesson: original.id, originalDate: '2026-11-03', date: '2026-11-04', startMin: 480, room: original.roomId, durationMin: occurrence.length }] : [];
  const locks = bindings ? [placements[0]] : [];
  const input: SchemaDraftSave = parseSchemaDraftSave({ contractVersion: 1, unitId, schoolYear: 2026, period: 'lasar', commandId: crypto.randomUUID(), draftId: null,
    expectedRevision: 0, name: 'Sparat terminsmönster', basisVillkor: old.villkor, workingVillkor: old.villkor, grundFingerprint: old.grundFingerprint,
    placements, locks, intentional: [], datedOverrides, activityTypes: [] });
  const { draft } = await schemaTestDraft(input, old); server.drafts.set(scope, draft);
  const requests: Record<string, unknown>[] = [], state = { fail: false, findings: false };
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: state.findings ? [{ code: 'weekly', message: 'Kontrollera den syntetiska ramen.', proof: false, action: { target: 'villkor', label: 'Visa villkoren' } }] : [] } }));
  await page.route('**/api/schema/forslag', route => {
    const body = route.request().postDataJSON(); requests.push(body);
    return state.fail ? route.fulfill({ headers, status: 503, json: { code: 'schema_engine_unavailable' } })
      : route.fulfill({ headers, json: { ...annual, villkor: body.villkor } });
  });
  await page.route('**/api/schema/utkast/spara', async route => {
    const value = parseSchemaDraftSave(route.request().postDataJSON()), previous = server.drafts.get(scope); server.saves.push(value);
    if (value.expectedRevision !== previous?.revision) return route.fulfill({ headers, status: 409, json: { code: 'conflict' } });
    const source = value.grundFingerprint === annual.grundFingerprint ? annual : old;
    const result = await schemaTestDraft(value, source, null, previous); server.drafts.set(scope, result.draft);
    return route.fulfill({ headers, json: { contractVersion: 1, unitId, schoolYear: 2026, period: 'lasar', ...result } });
  });
  await page.route('**/api/schema/datum', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint, fingerprint: old.fingerprint,
      datedOverrides: body.datedOverrides, checkedDates: [...new Set([...body.dates, ...body.datedOverrides.flatMap((a: { originalDate: string; date: string }) => [a.originalDate, a.date])])],
      violations: [], total: 0, timeChanges: [] } });
  });
  await page.goto(URL);
  await expect(page.getByRole('region', { name: 'Gemensamt läsårsmönster', exact: true })).toBeVisible();
  return { old, annual, draft, requests, state };
}

test('ett gammalt utkast återöppnas och sparas utan tyst byte av årsmodell', async ({ page, schemaDraftServer: server }) => {
  const { old, draft, requests } = await setup(page, server, true);
  expect(server.saves).toHaveLength(0); expect(requests).toHaveLength(0);
  await page.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill('Bevarat terminsmönster');
  await expect.poll(() => server.drafts.get(scope)?.name).toBe('Bevarat terminsmönster');
  await page.reload();
  await expect(page.getByRole('region', { name: 'Gemensamt läsårsmönster', exact: true })).toBeVisible();
  const saved = server.drafts.get(scope)!;
  expect(saved.base?.grundFingerprint).toBe(old.grundFingerprint); expect(saved.basisVillkor?.timeBasis).toBeUndefined();
  expect(saved.workingVillkor.timeBasis).toBeUndefined(); expect(saved.placements).toEqual(draft.placements);
  expect(saved.locks).toEqual(draft.locks); expect(saved.datedOverrides).toEqual(draft.datedOverrides);
  expect(saved.workingVillkor.egna).toEqual(old.villkor.egna); expect(requests).toHaveLength(0);
});

test('avbrutet eller misslyckat årsbyte bevarar gamla passregler, lås, datum och placeringar', async ({ page, schemaDraftServer: server }) => {
  const { draft, requests, state } = await setup(page, server, true);
  const action = page.getByRole('button', { name: 'Lås upp 1 pass och ta fram läsårsmönster', exact: true });
  await action.click(); const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('1 villkor för enskilda pass tas bort');
  await dialog.getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  expect(requests).toHaveLength(0); expect(server.drafts.get(scope)).toEqual(draft);
  state.fail = true; await action.click(); await dialog.getByRole('button', { name: 'Ta fram utan passregler', exact: true }).click();
  await expect(page.getByRole('alert').first()).toBeVisible(); expect(requests).toHaveLength(1);
  expect(server.drafts.get(scope)).toEqual(draft);
  await expect(page.locator(`[data-lesson="${draft.locks[0].lesson}"]`).first()).toContainText('Låst');
});

test('uttryckligt årsbyte sparar det nya gemensamma mönstret och återöppnar samma årsbudget', async ({ page, schemaDraftServer: server }, info) => {
  const { annual, requests } = await setup(page, server, true);
  await page.getByRole('button', { name: 'Lås upp 1 pass och ta fram läsårsmönster', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ta fram utan passregler', exact: true }).click();
  await expect.poll(() => server.drafts.get(scope)?.basisVillkor?.timeBasis).toBe('lasar');
  const saved = server.drafts.get(scope)!;
  expect(requests).toHaveLength(1); expect((requests[0].villkor as { timeBasis: string }).timeBasis).toBe('lasar');
  expect(saved.workingVillkor.egna.some(r => r.slag === 'pass')).toBe(false);
  expect(saved.workingVillkor.egna.filter(r => r.slag === 'amne')).toEqual(annual.villkor.egna);
  expect(saved.locks).toEqual([]); expect(saved.datedOverrides).toEqual([]);
  expect(saved.base?.lessons.every(l => l.term === null)).toBe(true);
  expect(saved.base?.teachings.map(t => [t.needMin, t.plannedMin])).toEqual(annual.teachings.map(t => [t.needMin, t.plannedMin]));
  await expect(page.getByRole('region', { name: 'Gemensamt läsårsmönster', exact: true })).toHaveCount(0);
  const ids = await page.locator('.schema-week [data-lesson]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-lesson')).sort());
  await page.getByRole('button', { name: 'Vårterminen', exact: true }).click();
  expect(await page.locator('.schema-week [data-lesson]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-lesson')).sort())).toEqual(ids);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', await page.evaluate(() => document.documentElement.clientWidth));
  await page.screenshot({ path: info.outputPath('gemensamt-lasarsmonster-200.png'), fullPage: false });
  await page.reload(); await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
  expect(server.drafts.get(scope)?.basisVillkor?.timeBasis).toBe('lasar'); expect(requests).toHaveLength(1);
});
