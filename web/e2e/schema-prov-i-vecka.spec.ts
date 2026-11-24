// Arbetsytans provdag med sparade, syntetiska prov och hashbundet schemautkast.
import { expect, schemaTestDraft, test } from './schema-test';
import { valjVeckoresurs, veckoval } from './schema-vecko-val';
import { headers, utanBerakning } from './schema-underlag-mock';
import source from './schema-fixture';
import type { SchemaForslag } from '../lib/schema-contract.ts';
import { SCHEMA_DRAFT_VERSION, parseSchemaDraftSave } from '../lib/schema-draft-contract.ts';
import type { NationellProvbokning, NationellaProvRegister, NationellaProvUnderlag } from '../lib/nationella-prov.ts';

const date = '2026-11-09', nextWeek = '2026-11-16';
const ids = {
  klass1: '52a10000-0000-4000-8000-000000000011',
  klass2: '52a10000-0000-4000-8000-000000000012',
  nastaVecka: '52a10000-0000-4000-8000-000000000013',
};

test('Provdagen ställer in krockande lektioner för klass och provvakt utan att ändra grundschemat', async ({ page, schemaDraftServer }) => {
  const forslag = source as unknown as SchemaForslag;
  const [klass1, klass2] = forslag.resurser.klass;
  const provvakt = forslag.resurser.larare.find(l => l.name === 'Provlärare 7')!;
  const undervisning = (klass: typeof klass1) => ({ ref: `undervisning:engelska-${klass.ref}`, title: 'Engelska – nivå 1' });
  const bokning = (id: string, klass: typeof klass1, datum: string, salId: string | null): NationellProvbokning => ({
    id, namn: 'Engelska nivå 1, delprov C', mal: { slag: 'klass', ref: klass.ref }, undervisning: undervisning(klass).ref,
    datum, tidsval: 'fast', startMin: 540, slutMin: 630, kontrolleradDatum: '2026-10-19', salId, vakter: [],
  });
  const register: NationellaProvRegister = { revision: 4, savedAt: '2026-10-19T08:00:00.000Z', document: { granskad: true, bokningar: [
    bokning(ids.klass1, klass1, date, 'sal-4'), { ...bokning(ids.klass2, klass2, date, null), vakter: [provvakt.ref] }, bokning(ids.nastaVecka, klass2, nextWeek, null),
  ] } };
  const underlag: NationellaProvUnderlag = { gallerGymnasiet: true, deltagare: [klass1, klass2].map(klass => ({ ...klass, slag: 'klass', undervisningar: [undervisning(klass)] })),
    salar: [{ id: 'sal-4', name: 'Ateljén' }], vakter: [provvakt], skoldagar: [date, nextWeek] };
  const lasningar: unknown[] = [], provSparanden: unknown[] = [];
  await page.route('**/api/lasar/nationella-prov/lasa', route => {
    const scope = route.request().postDataJSON();
    lasningar.push(scope);
    return route.fulfill({ headers, json: { ...scope, register, underlag } });
  });
  await page.route('**/api/schema/provdagar', route => {
    const { contractVersion, unitId, schoolYear, period, grundFingerprint, provrevision, dates } = route.request().postDataJSON();
    const installda = dates.includes(date)
      ? ['pass-70', 'pass-75', 'pass-151', 'pass-291'].map(lesson => ({ lesson, originalDate: date, date })) : [];
    return route.fulfill({ headers, json: { contractVersion, unitId, schoolYear, period, grundFingerprint, provrevision, dates,
      installda, ersatta: [], deltagare: [] } });
  });
  await page.route('**/api/lasar/nationella-prov/spara', route => {
    provSparanden.push(route.request().postDataJSON());
    return route.abort();
  });
  const berakningar = await utanBerakning(page);
  const { unitId, schoolYear, period, grundFingerprint, villkor } = forslag;
  const input = parseSchemaDraftSave({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period, commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Läsårets schema', basisVillkor: villkor, workingVillkor: villkor, grundFingerprint,
    placements: forslag.lessons.flatMap(l => l.day === null || l.startMin === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]),
    locks: [], intentional: [], datedOverrides: [], activityTypes: [],
  });
  const { draft } = await schemaTestDraft(input, forslag);
  const key = `${unitId}:${schoolYear}:${period}`;
  schemaDraftServer.drafts.set(key, draft);

  await page.goto('/e2e/fixtures/schema-preview.html');
  await page.getByRole('button', { name: 'Lägg schema', exact: true }).click();
  const datumval = page.getByRole('region', { name: 'Grundschema eller faktiska tillfällen' });
  const vecka = page.locator('.schema-week');
  await expect(veckoval(page)).toHaveValue('Klass 1 · Klass');
  await expect(vecka.locator('[data-lesson]').first()).toBeVisible();
  const grundpass = () => vecka.locator('[data-lesson]').evaluateAll(els => els.map(el => el.getAttribute('data-lesson')));
  const innan = await grundpass();
  await expect(vecka.locator('[data-prov]')).toHaveCount(0);

  await page.locator('summary').filter({ hasText: 'Bokade nationella prov' }).click();
  await page.getByRole('button', { name: /Visa provdagen för Klass 2 9 nov/u }).click();
  await expect(datumval.getByRole('button', { name: 'Datumintervall', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(datumval.getByLabel('Från', { exact: true })).toHaveValue(date);
  await expect(datumval.getByLabel('Till', { exact: true })).toHaveValue(date);
  await expect(veckoval(page)).toHaveValue('Klass 2 · Klass');
  const provdag = vecka.locator(`section[data-date="${date}"]`);
  await expect(vecka.locator('section[data-date]')).toHaveCount(1);
  await expect(provdag.locator(`[data-prov="${ids.klass2}"]`)).toContainText('09:00–10:30');
  await expect(provdag.locator(`[data-prov="${ids.klass2}"]`)).toContainText('Sal återstår');
  await expect(provdag.locator('[data-prov]')).toHaveCount(1);
  await expect(provdag.locator('[data-lesson="pass-70"], [data-lesson="pass-75"]')).toHaveCount(0);
  await expect(provdag.locator('[data-lesson="pass-66"]')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Nationella prov i datumvyn' })).toContainText('2 lektioner är inställda');
  await valjVeckoresurs(page, 'Provlärare 7', 'Lärare');
  await expect(provdag.locator(`[data-prov="${ids.klass2}"]`)).toBeVisible();
  await expect(provdag.locator('[data-lesson="pass-151"], [data-lesson="pass-291"]')).toHaveCount(0);
  await expect(provdag.locator('[data-lesson="pass-469"]')).toBeVisible();


  await valjVeckoresurs(page, 'Klass 1', 'Klass');
  await expect(provdag.locator(`[data-prov="${ids.klass1}"]`)).toContainText('Klass 1 · Ateljén');
  await expect(provdag.locator(`[data-prov="${ids.klass2}"]`)).toHaveCount(0);
  await page.getByRole('button', { name: 'Pass i tabell', exact: true }).click();
  await expect(page.locator('tr[data-lesson="pass-70"], tr[data-lesson="pass-151"]')).toHaveCount(0);
  await expect(page.locator('tr[data-lesson="pass-66"]')).toBeVisible();
  await page.getByRole('group', { name: 'Visa schemat som' }).getByRole('button', { name: 'Vecka', exact: true }).click();
  await datumval.getByRole('button', { name: 'Grundschema', exact: true }).click();
  await expect(vecka.locator('[data-prov]')).toHaveCount(0);
  expect(await grundpass()).toEqual(innan);
  await page.waitForTimeout(1_000); // Låt utkastets sparfördröjning löpa ut innan sparanrop kontrolleras.
  expect(lasningar).toHaveLength(1);
  expect(provSparanden).toEqual([]);
  expect(berakningar).toEqual([]);
  expect(schemaDraftServer.saves).toEqual([]);
  expect(schemaDraftServer.drafts.get(key)).toEqual(draft);
});
