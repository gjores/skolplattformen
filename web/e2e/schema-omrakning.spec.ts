// Syntetiska motor- och sparrutter. Provar att en kandidat blir en revision först vid uttryckligt val.
import { expect, schemaTestDraft, test, type Page, type SchemaDraftTestServer } from './schema-test';
import fixture from './schema-fixture';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaForslagRequest, type SchemaKontrollRequest, type SchemaPlacement } from '../lib/schema-contract.ts';
import { schemaDatumOriginal, type SchemaDatumRequest } from '../lib/schema-datum.ts';
import { parseSchemaDraftSave, schemaDraftHash, type SchemaDraftSave } from '../lib/schema-draft-contract.ts';
import { schemaWeekday } from '../lib/schema-vecka.ts';

const headers = { 'X-Context-Epoch': '1' };
const helarsprov = fixture as unknown as SchemaForslag;
const flyttatPass = 'pass-7', lastPass = 'pass-2', datumpass = 'pass-4';
const lessons = helarsprov.lessons.filter(l => [flyttatPass, lastPass, datumpass].includes(l.id));
const source: SchemaForslag = { ...helarsprov, lessons, trims: [], teachings: [], omitted: [],
  statistics: { iterations: 0, lessons: [], bottlenecks: [] }, metrics: { lessons: lessons.length, placed: lessons.length, unplaced: 0, studentGapMin: 0, teacherGapMin: 0 } };
const omfattning = { contractVersion: 1 as const, unitId: source.unitId, schoolYear: source.schoolYear, period: 'lasar' as const };
const draftKey = `${omfattning.unitId}:${omfattning.schoolYear}:${omfattning.period}`;
const nyttFingeravtryck = '50671caa48d11afde77355ab2b84';
const heading = (page: Page) => page.getByRole('heading', { name: 'Granska nytt schemaförslag', exact: true });
const preview = (page: Page) => heading(page).locator('xpath=ancestor::section[1]');

const placements = (f: SchemaForslag): SchemaPlacement[] => f.lessons.flatMap(l => l.day === null || l.startMin === null ? [] :
  [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId }]);

async function setup(page: Page, server: SchemaDraftTestServer, { conflict = false, avvisaEttDatum = false, hallAutospar = false } = {}) {
  const lesson = source.lessons.find(l => l.id === datumpass)!;
  const datum = source.time.calendar!.days.filter(d => d.schoolDay && d.term === lesson.term && schemaWeekday(d.date) === lesson.day)
    .slice(0, avvisaEttDatum ? 2 : 1).map(({ date }) => {
      const original = schemaDatumOriginal(source, { lesson: lesson.id, originalDate: date })!;
      return { lesson: lesson.id, originalDate: date, date, startMin: lesson.startMin! + 20, room: null, durationMin: original.length };
    });
  const input = parseSchemaDraftSave({ ...omfattning, commandId: crypto.randomUUID(), draftId: null, expectedRevision: 0,
    name: 'Tidigare sparat utkast', basisVillkor: source.villkor, workingVillkor: source.villkor, grundFingerprint: source.grundFingerprint,
    placements: placements(source), locks: [placements(source).find(p => p.lesson === lastPass)!], datedOverrides: datum });
  const { draft } = await schemaTestDraft(input, source);
  server.drafts.set(draftKey, draft);

  const writes: SchemaDraftSave[] = [], requests: SchemaForslagRequest[] = [];
  const autospar = hallAutospar ? Promise.withResolvers<void>() : null;
  let candidate: SchemaForslag | null = null;
  let hold: Promise<void> | null = null;
  const holdNext = () => {
    const gate = Promise.withResolvers<void>();
    hold = gate.promise;
    return () => { hold = null; gate.resolve(); };
  };
  await page.route('**/api/schema/utkast/spara', async route => {
    const save = parseSchemaDraftSave(route.request().postDataJSON());
    writes.push(save);
    if (!save.forslagFingerprint) {
      if (!autospar) return route.fulfill({ headers, status: 400, json: { code: 'bad_request', details: { reason: 'schema_draft_invalid' } } });
      await autospar.promise;
    }
    if (conflict) return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'schema_preview_outdated' } } });
    const previous = server.drafts.get(draftKey), f = save.forslagFingerprint ? candidate : source;
    if (!f || save.draftId !== previous?.id || save.expectedRevision !== previous?.revision || (save.forslagFingerprint && save.forslagFingerprint !== f.fingerprint)) {
      return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'schema_draft_conflict' } } });
    }
    const result = await schemaTestDraft(save, f, null, previous);
    server.drafts.set(draftKey, result.draft);
    return route.fulfill({ headers, json: { ...omfattning, ...result } });
  });
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', async route => {
    const body = route.request().postDataJSON() as SchemaForslagRequest;
    requests.push(body);
    if (hold) await hold;
    candidate = { ...source, villkor: body.villkor, fingerprint: nyttFingeravtryck,
      ...(body.locks ? { locks: body.locks.placements } : {}),
      lessons: source.lessons.map(l => l.id === flyttatPass ? { ...l, startMin: l.startMin! + 60 } : l) };
    return route.fulfill({ headers, json: candidate }).catch(() => {});
  });
  await page.route('**/api/schema/kontroll', route => {
    const body = route.request().postDataJSON() as SchemaKontrollRequest;
    return route.fulfill({ headers, json: { ...draft.control, fingerprint: candidate?.fingerprint ?? source.fingerprint,
      metrics: { ...source.metrics, placed: body.placements.length, unplaced: source.metrics.lessons - body.placements.length },
      rooms: Object.fromEntries(body.placements.flatMap(p => p.room === null ? [] : [[p.lesson, p.room]])) } });
  });
  await page.route('**/api/schema/datum', route => {
    const body = route.request().postDataJSON() as SchemaDatumRequest;
    if (avvisaEttDatum && candidate && body.placements.some(p => p.lesson === flyttatPass && p.startMin === candidate?.lessons.find(l => l.id === flyttatPass)?.startMin)
      && body.datedOverrides.some(a => a.originalDate === datum[1].originalDate)) {
      return route.fulfill({ headers, status: 400, json: { code: 'schema_datum_invalid' } });
    }
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: body.grundFingerprint,
      fingerprint: candidate?.fingerprint ?? source.fingerprint, datedOverrides: body.datedOverrides,
      checkedDates: [...new Set([...body.dates, ...body.datedOverrides.flatMap(a => [a.originalDate, a.date])])].sort(),
      violations: [], total: 0, timeChanges: [] } });
  });
  await page.goto('/e2e/fixtures/schema-preview.html', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Namn på utkastet', exact: true })).toHaveValue(draft.name);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  return { draft, writes, requests, holdNext, slappAutospar: () => autospar?.resolve(), candidate: () => candidate! };
}

async function berakna(page: Page) {
  const open = page.getByRole('button', { name: 'Beräkning', exact: true });
  if (await open.isVisible() && await open.getAttribute('aria-expanded') === 'false') await open.click();
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
}

async function framkallaSparfel(page: Page) {
  await page.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill('Namn som inte gick att spara');
  await expect(page.getByText('Utkastet behöver kontrolleras', { exact: true })).toBeVisible();
}

test('Räkna om schemat syns före rullning vid arbetsyteflikarna i Granska', async ({ page, schemaDraftServer }) => {
  const { writes } = await setup(page, schemaDraftServer);
  const navigation = page.getByRole('navigation', { name: 'Arbetsytor', exact: true });
  const granskningsflik = navigation.getByRole('button', { name: 'Granska', exact: true });
  await granskningsflik.click();

  const header = page.locator('.schema-sidhuvud').filter({ has: navigation });
  const omrakna = header.getByRole('button', { name: 'Räkna om schemat', exact: true });
  await expect(page.getByRole('button', { name: 'Räkna om schemat', exact: true })).toHaveCount(1);
  await expect(omrakna).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const a = (await omrakna.boundingBox())!, b = (await granskningsflik.boundingBox())!;
  expect(Math.max(a.y, b.y)).toBeLessThan(Math.min(a.y + a.height, b.y + b.height));

  await omrakna.click();
  await expect(heading(page)).toBeVisible();
  expect(writes).toHaveLength(0);
});

test('räknar trots det gamla sparfelet utan skrivning under körning, granskning eller avvisning', async ({ page, schemaDraftServer }) => {
  const { draft, writes, requests, holdNext } = await setup(page, schemaDraftServer);
  const namn = page.getByRole('textbox', { name: 'Namn på utkastet', exact: true });
  await framkallaSparfel(page);
  expect(writes).toHaveLength(1);
  const release = holdNext();
  try {
    await berakna(page);
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByRole('dialog', { name: 'Tar fram schemaförslag', exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
  } finally {
    release();
  }
  await expect(heading(page)).toBeVisible();
  expect(writes).toHaveLength(1);
  await preview(page).getByRole('button', { name: 'Behåll nuvarande schema', exact: true }).click();
  await expect(heading(page)).toHaveCount(0);
  await expect(namn).toHaveValue('Namn som inte gick att spara');
  expect(writes).toHaveLength(1);
  expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
});

test('vid ett ogiltigt datum visas bortfallet och det andra tillfället behålls', async ({ page, schemaDraftServer }) => {
  const { draft, writes } = await setup(page, schemaDraftServer, { avvisaEttDatum: true });
  await berakna(page);
  await expect(heading(page)).toBeVisible();
  const panel = preview(page);
  await expect(panel.getByRole('listitem').filter({ hasText: draft.datedOverrides[0].originalDate })).toContainText('Följer med.');
  await expect(panel.getByRole('listitem').filter({ hasText: draft.datedOverrides[1].originalDate })).toContainText('Följer inte med.');
  expect(writes).toHaveLength(0);
  expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
  await panel.getByRole('button', { name: 'Använd förslaget', exact: true }).click();
  await expect(heading(page)).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0].datedOverrides).toEqual([draft.datedOverrides[0]]);
});

test('Använd förslaget skriver en enda kontrollerad revision och bevarar överförbara lås och datum', async ({ page, schemaDraftServer }) => {
  const { draft, writes, candidate } = await setup(page, schemaDraftServer);
  await framkallaSparfel(page);
  await berakna(page);
  await expect(heading(page)).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Granska', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(preview(page)).toContainText('Följer med.');
  await preview(page).getByText('Ändrade pass (1)', { exact: true }).click();
  const flytt = preview(page).getByRole('row').filter({ hasText: '11:10–12:20' });
  await expect(flytt).toContainText('12:10–13:20');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await preview(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(writes).toHaveLength(1);
  expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
  const use = preview(page).getByRole('button', { name: 'Använd förslaget', exact: true });
  await use.click();
  await expect(heading(page)).toHaveCount(0);
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  const hash = await schemaDraftHash(candidate().time);
  expect(writes[0].forslagFingerprint).toBeUndefined();
  expect(writes[1]).toMatchObject({ draftId: draft.id, expectedRevision: draft.revision, forslagFingerprint: nyttFingeravtryck,
    forslagKalenderHash: hash, grundFingerprint: candidate().grundFingerprint, placements: placements(candidate()), locks: draft.locks,
    datedOverrides: draft.datedOverrides });
  const saved = schemaDraftServer.drafts.get(draftKey)!;
  expect(saved.revision).toBe(draft.revision + 1);
  expect(saved.placements).toEqual(placements(candidate()));
  expect(saved.datedOverrides).toEqual(draft.datedOverrides);
});

test('ett förslag som hunnit bli inaktuellt kan inte ersätta det sparade utkastet', async ({ page, schemaDraftServer }) => {
  const { draft, writes } = await setup(page, schemaDraftServer, { conflict: true });
  await berakna(page);
  await expect(heading(page)).toBeVisible();
  const use = preview(page).getByRole('button', { name: 'Använd förslaget', exact: true });
  await use.click();
  await expect(page.getByRole('alert').filter({ hasText: /underlaget|förslaget|nytt schema/iu }).first()).toBeVisible();
  await expect(use).toBeDisabled();
  await expect(preview(page).getByRole('button', { name: 'Räkna om igen', exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ draftId: draft.id, expectedRevision: draft.revision, forslagFingerprint: nyttFingeravtryck });
  expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
});

test('ett pågående autospar hindrar inte granskning och nästa revision bygger på kvittensen', async ({ page, schemaDraftServer }) => {
  const { draft, writes, slappAutospar, candidate } = await setup(page, schemaDraftServer, { hallAutospar: true });
  const nyttNamn = 'Namn som sparas medan motorn räknar';
  const sparstatus = page.getByRole('region', { name: 'Sparat schemautkast', exact: true });
  await sparstatus.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill(nyttNamn);
  try {
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toMatchObject({ name: nyttNamn, expectedRevision: 1, placements: draft.placements });
    expect(writes[0].forslagFingerprint).toBeUndefined();
    await berakna(page);
    await expect(heading(page)).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(schemaDraftServer.drafts.get(draftKey)).toEqual(draft);
  } finally {
    slappAutospar();
  }
  await expect(sparstatus).toContainText('version 2');
  expect(schemaDraftServer.drafts.get(draftKey)).toMatchObject({ revision: 2, name: nyttNamn, placements: draft.placements });
  await preview(page).getByRole('button', { name: 'Använd förslaget', exact: true }).click();
  await expect(heading(page)).toHaveCount(0);
  await expect(sparstatus).toContainText('version 3');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toMatchObject({ draftId: draft.id, expectedRevision: 2, name: nyttNamn, forslagFingerprint: nyttFingeravtryck, placements: placements(candidate()) });
  expect(schemaDraftServer.drafts.get(draftKey)).toMatchObject({ revision: 3, name: nyttNamn, placements: placements(candidate()) });
});
