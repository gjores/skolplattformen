import { test, expect, type Page, type SchemaDraftTestServer } from './schema-test';
import fixture from './schema-fixture';
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaKontrollRequest } from '../lib/schema-contract.ts';
import { parseSchemaPublicationRequest, type SchemaPublication, type SchemaPublicationRequest } from '../lib/schema-publication-contract.ts';

const url = '/e2e/fixtures/schema-personal-preview.html';
const headers = { 'X-Context-Epoch': '1' };
const proposal = fixture as unknown as SchemaForslag;
const scope = { unitId: proposal.unitId, schoolYear: 2026, period: 'lasar' } as const;
const draftKey = `${scope.unitId}:${scope.schoolYear}:${scope.period}`;
const panel = (page: Page) => page.getByRole('region', { name: 'Publicering', exact: true });
const publishButton = (page: Page) => panel(page).getByRole('button', { name: 'Publicera schema…', exact: true });
const savedDraft = (page: Page) => page.getByRole('region', { name: 'Sparat schemautkast', exact: true });
type Command = Extract<SchemaPublicationRequest, { action: 'publish' }>;

async function setup(page: Page, drafts: SchemaDraftTestServer, canPublish = true) {
  const server = {
    statusReads: 0,
    commands: [] as Command[],
    publications: [] as SchemaPublication[],
    nextError: null as 'stale' | 'bad_receipt' | 'forbidden' | null,
  };
  const receipts = new Map<string, SchemaPublication>();
  await page.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await page.route('**/api/schema/forslag', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...proposal, unitId: input.unitId, schoolYear: input.schoolYear,
      period: input.period, villkor: input.villkor } });
  });
  await page.route('**/api/schema/kontroll', route => {
    const input = route.request().postDataJSON() as SchemaKontrollRequest;
    return route.fulfill({ headers, json: {
      ...checked.clash, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint,
      fingerprint: proposal.fingerprint, violations: [], total: 0, teachings: proposal.teachings, trims: proposal.trims,
      metrics: { ...proposal.metrics, placed: input.placements.length, unplaced: proposal.lessons.length - input.placements.length },
      rooms: Object.fromEntries(input.placements.filter(p => p.room !== null).map(p => [p.lesson, p.room])),
    } });
  });
  await page.route('**/api/schema/publicering', route => {
    const input = parseSchemaPublicationRequest(route.request().postDataJSON());
    expect(input).toMatchObject(scope);
    if (input.action === 'status') {
      server.statusReads++;
      return route.fulfill({ headers, json: { publication: server.publications.at(-1) ?? null } });
    }
    server.commands.push(input);
    const error = server.nextError;
    server.nextError = null;
    const receipt = receipts.get(input.commandId);
    if (receipt) return route.fulfill({ headers, json: { publication: receipt } });
    if (error === 'forbidden' || !canPublish) return route.fulfill({ headers, status: 403, json: { code: 'forbidden' } });
    const draft = drafts.drafts.get(draftKey);
    if (error === 'stale' || !draft || draft.id !== input.draftId || draft.revision !== input.revision || draft.contentHash !== input.contentHash) {
      return route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'schema_publication_draft_changed' } } });
    }
    const publication = { ...scope, id: crypto.randomUUID(), draftId: input.draftId, revision: input.revision,
      contentHash: input.contentHash, publishedAt: '2026-11-22T09:00:00.000Z' };
    server.publications.push(publication);
    receipts.set(input.commandId, publication);
    return route.fulfill({ headers, json: { publication: error === 'bad_receipt' ? { ...publication, revision: publication.revision + 1 } : publication } });
  });
  await page.goto(`${url}${canPublish ? '' : '?personal=0'}`);
  return server;
}

function openReview(page: Page) {
  return page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Granska', exact: true }).click();
}

async function calculate(page: Page) {
  const prepare = page.getByRole('navigation', { name: 'Arbetsytor', exact: true }).getByRole('button', { name: 'Förbered', exact: true });
  await prepare.click();
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.locator('.schema-week')).toBeVisible();
  await expect(savedDraft(page).getByText('Sparat på servern', { exact: true })).toBeVisible();
  await openReview(page);
}

async function confirmation(page: Page, revision: number) {
  await publishButton(page).click();
  const dialog = page.getByRole('alertdialog', { name: 'Publicera schemat?', exact: true });
  await expect(dialog).toContainText(`den sparade versionen ${revision} för hela läsåret`);
  return dialog;
}

test('Publicering väntar på sparat komplett schema och verifierar kvittot för exakt version', async ({ page, schemaDraftServer }) => {
  const server = await setup(page, schemaDraftServer);
  await openReview(page);
  await expect(panel(page)).toContainText('Inget schema har publicerats');
  await expect(publishButton(page)).toBeDisabled();
  await calculate(page);
  await expect(publishButton(page)).toBeEnabled();

  const first = schemaDraftServer.drafts.get(draftKey)!;
  await (await confirmation(page, first.revision)).getByRole('button', { name: 'Avbryt', exact: true }).click();
  expect(server.commands).toHaveLength(0);
  server.nextError = 'bad_receipt';
  await (await confirmation(page, first.revision)).getByRole('button', { name: 'Publicera schema', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Svaret från publiceringen kunde inte bekräftas');
  await expect(panel(page).getByText('Senaste publiceringen', { exact: true })).toHaveCount(0);
  expect(server.commands).toHaveLength(1);
  expect(server.commands[0]).toMatchObject({ draftId: first.id, revision: first.revision, contentHash: first.contentHash });

  await panel(page).getByRole('button', { name: 'Kontrollera publiceringen', exact: true }).click();
  await expect(panel(page)).toContainText(`Version ${first.revision} · hela läsåret`);
  await expect(publishButton(page)).toHaveCount(0);
  expect(server.commands).toEqual([server.commands[0], server.commands[0]]);
  expect(server.publications).toHaveLength(1);

  await savedDraft(page).getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill('Nästa syntetiska version');
  await expect(publishButton(page)).toBeDisabled();
  await expect(panel(page)).toContainText(`Version ${first.revision} · hela läsåret`);
  await expect(publishButton(page)).toBeEnabled();
  const next = schemaDraftServer.drafts.get(draftKey)!;
  expect(next.revision).toBe(first.revision + 1);
  await (await confirmation(page, next.revision)).getByRole('button', { name: 'Publicera schema', exact: true }).click();
  await expect(panel(page)).toContainText(`Version ${next.revision} · hela läsåret`);
  expect(server.commands[2]).toMatchObject({ draftId: next.id, revision: next.revision, contentHash: next.contentHash });
  expect(server.commands[2].commandId).not.toBe(server.commands[0].commandId);
  expect(server.publications.map(p => p.revision)).toEqual([first.revision, next.revision]);
  await page.reload();
  await expect(panel(page)).toContainText(`Version ${next.revision} · hela läsåret`);
  await expect(publishButton(page)).toHaveCount(0);
  expect(server.commands).toHaveLength(3);
});

test('Publicering begär omläsning vid ändrad version och visar serverns nekade mandat', async ({ page, schemaDraftServer }) => {
  const server = await setup(page, schemaDraftServer);
  await calculate(page);
  await expect(publishButton(page)).toBeEnabled();
  const draft = schemaDraftServer.drafts.get(draftKey)!;
  server.nextError = 'stale';
  await (await confirmation(page, draft.revision)).getByRole('button', { name: 'Publicera schema', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Schemat eller publiceringen har ändrats');
  await expect(publishButton(page)).toBeDisabled();
  expect(server.publications).toHaveLength(0);
  const reads = server.statusReads;
  await panel(page).getByRole('button', { name: 'Läs publiceringen igen', exact: true }).click();
  await expect(publishButton(page)).toBeEnabled();
  expect(server.statusReads).toBe(reads + 1);
  expect(server.commands).toHaveLength(1);

  server.nextError = 'forbidden';
  await (await confirmation(page, draft.revision)).getByRole('button', { name: 'Publicera schema', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Ditt aktuella uppdrag tillåter inte den här publiceringen');
  await expect(publishButton(page)).toHaveCount(0);
  expect(server.publications).toHaveLength(0);
});

test('Granskaren utan publiceringsmandat kan läsa publiceringsstatus', async ({ page, schemaDraftServer }) => {
  const server = await setup(page, schemaDraftServer, false);
  await calculate(page);
  await expect(panel(page)).toContainText('Inget schema har publicerats');
  await expect(publishButton(page)).toHaveCount(0);
  expect(server.statusReads).toBe(1);
  expect(server.commands).toHaveLength(0);
});
