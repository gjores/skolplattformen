// Flera riktiga fönster och BroadcastChannel, med simulerad session/skolbehörighet och syntetiska schemauppgifter.
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import proposal from './fixtures/schema-forslag.json' with { type: 'json' };
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import following from './fixtures/schema-folj.json' with { type: 'json' };
import { samlingResurser } from '../lib/schema-samling.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';

const URL = '/e2e/fixtures/schema-preview.html', headers = { 'X-Context-Epoch': '1' };
async function setup(context: BrowserContext, page: Page) {
  // Mät från huvudfönstrets utskick till barnets synliga ändringsstatus, utan en extra kontrollkanal.
  await context.addInitScript(() => {
    const Native = window.BroadcastChannel;
    const result = window as unknown as { schemaSynkPaintMs: number[]; schemaSynkMessages: string[] }; result.schemaSynkPaintMs = []; result.schemaSynkMessages = [];
    window.BroadcastChannel = class extends Native {
      constructor(name: string) {
        super(name);
        this.addEventListener('message', event => {
          const m = event.data;
          if (m?.type !== 'state' || !m?.state?.utkast?.undo?.length || typeof m.schemaTestSentAt !== 'number') return;
          const observer = new MutationObserver(() => {
            if (!document.body.textContent?.includes('Ändrat för hand')) return;
            result.schemaSynkPaintMs.push(Date.now() - m.schemaTestSentAt); observer.disconnect();
          });
          observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        });
      }
      postMessage(message: unknown) {
        result.schemaSynkMessages.push(JSON.stringify(message));
        super.postMessage(message && typeof message === 'object' && 'protocol' in message ? { ...message, schemaTestSentAt: Date.now() } : message);
      }
    };
  });
  await context.route('**/api/session', route => route.fulfill({ headers, json: { epoch: 1 } }));
  await context.route('**/api/schema/fonster', route => route.fulfill({ headers, json: { unitId: proposal.unitId, schoolYear: 2026, scopeKey: '1:prov:prov' } }));
  await context.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await context.route('**/api/schema/forslag', route => route.fulfill({ headers, json: { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } }));
  await context.route('**/api/schema/kontroll', route => route.fulfill({ headers, json: { ...checked.clash, contractVersion: SCHEMA_CONTRACT_VERSION, violations: [], total: 0 } }));
  await context.route('**/api/schema/folj', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...following.utanElever, contractVersion: SCHEMA_CONTRACT_VERSION, lesson: body.lesson } });
  });
  await context.route('**/api/schema/lagen', route => {
    const body = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...following.alla, contractVersion: SCHEMA_CONTRACT_VERSION, lesson: body.lesson } });
  });
  await page.goto(URL); await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click();
  await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
}
async function open(page: Page, name: string) {
  await page.getByRole('button', { name: 'Fönster', exact: true }).click();
  const ready = page.context().waitForEvent('page');
  await page.getByRole('menuitem', { name, exact: true }).click();
  const child = await ready;
  await child.setViewportSize(page.viewportSize()!);
  await expect(child.getByRole('status').filter({ hasText: /^Live$/u })).toBeVisible();
  return child;
}
async function move(page: Page) {
  await page.getByRole('button', { name: 'Vecka', exact: true }).click();
  const lesson = page.locator(`[data-lesson="${checked.move.lesson}"]`).first();
  await lesson.focus(); await page.keyboard.press('Enter');
  const panel = page.getByRole('form', { name: 'Flytta pass' });
  await panel.getByLabel('Dag').selectOption(String(checked.move.day));
  await panel.getByLabel('Starttid').selectOption(String(checked.move.startMin));
  await panel.getByRole('button', { name: 'Flytta hit' }).click();
}

test('Följ passet uppdateras från huvudfönstret och delar markering och ångra', async ({ context, page }) => {
  await setup(context, page);
  const lesson = page.locator(`[data-lesson="${following.lesson}"]`).first();
  const hostPlacement = () => page.locator(`[data-lesson="${checked.move.lesson}"]`).first().evaluate(el => ({ day: el.closest<HTMLOListElement>('ol')?.dataset.day, start: el.querySelector('time')?.textContent?.split('–')[0] }));
  const originalHostPlacement = await hostPlacement();
  await lesson.focus(); await page.keyboard.press('f');
  const child = await open(page, 'Följ passet');
  await expect(child.getByRole('heading', { name: /^Följ passet:/u })).toBeVisible();
  const changed = child.locator(`[data-schema-pass="${checked.move.lesson}"]`).first();
  const childPlacement = () => changed.evaluate(el => ({ day: el.closest('ul')?.getAttribute('aria-label'), at: (el as HTMLElement).style.getPropertyValue('--at') }));
  await expect(changed).toBeVisible(); const originalChildPlacement = await childPlacement();
  await move(page);
  // Den delade placeringen syns direkt på passets rad i det utlyfta fönstret.
  await expect(changed).toBeVisible();
  await expect.poll(childPlacement).not.toEqual(originalChildPlacement);
  await expect(child.getByText('Ändrat för hand', { exact: false }).first()).toBeVisible();
  const latency = await child.evaluate(() => (window as unknown as { schemaSynkPaintMs: number[] }).schemaSynkPaintMs);
  expect(latency.length).toBeGreaterThan(0); expect(Math.max(...latency)).toBeLessThanOrEqual(200);
  console.log(`Fönstersynk till synligt besked: ${Math.max(...latency)} ms`);
  await child.getByRole('button', { name: /^Ångra/u }).first().click();
  await expect.poll(hostPlacement).toEqual(originalHostPlacement);
  await expect.poll(childPlacement).toEqual(originalChildPlacement);
  for (const window of [page, child]) {
    await expect(window.getByRole('button', { name: /^Ångra/u }).first()).toBeDisabled();
    await expect(window.getByRole('button', { name: 'Gör om', exact: true })).toBeEnabled();
    await expect(window.getByText('Ändrat för hand', { exact: false })).toHaveCount(0);
  }
  const picked = child.locator(`[data-schema-pass]:not([data-schema-pass="${following.lesson}"])`).first();
  await expect(picked).toBeVisible(); const selected = await picked.getAttribute('data-schema-pass');
  await picked.click(); await expect(page.locator(`[data-lesson="${selected}"]`).first()).toHaveAttribute('aria-pressed', 'true');
  await child.screenshot({ path: test.info().outputPath('fonster-folj.png'), fullPage: true });
});

test('huvudfönstret stängs: utlyft vy visar tappad kontakt och lämnar utkastet orört', async ({ context, page }) => {
  await setup(context, page); const child = await open(page, 'Viloytan');
  await page.close(); await expect(child.getByRole('status').filter({ hasText: /Inte uppdaterat sedan/u })).toBeVisible();
  await expect(child.getByRole('button', { name: 'Läs om', exact: true })).toBeVisible();
  await expect(child.getByText('Väntar på huvudfönstret. Inga ändringar kan göras innan kontakten är tillbaka.', { exact: true })).toBeVisible();
  await child.screenshot({ path: test.info().outputPath('fonster-frankopplad.png'), fullPage: true });
});

test('fönsterarbetsvy sparar och öppnar två vyer igen utan elevurval', async ({ context, page }) => {
  await setup(context, page); const first = await open(page, 'Tid över läsåret'), second = await open(page, 'Viloytan');
  await expect(page.getByText('Fönster 1 av 3', { exact: true })).toBeVisible();
  await page.getByText('Fönstren som arbetsvy', { exact: true }).click();
  await page.getByLabel('Namn på fönsterarbetsvyn').fill('Två planeringsvyer');
  await page.getByRole('button', { name: 'Spara fönstren som arbetsvy' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('schema-arbetsvyer:52a10000-0000-4000-8000-000000000001') ?? '[]'));
  expect(saved.at(-1).windows).toEqual([{ view: 'tid' }, { view: 'viloyta' }]);
  await first.close(); await second.close(); await expect(page.getByText('Fönster 1 av 1', { exact: true })).toBeVisible();
  const opened: Page[] = []; const capture = (p: Page) => { opened.push(p); }; context.on('page', capture);
  await page.getByLabel('Öppna fönsterarbetsvy').selectOption({ label: 'Två planeringsvyer' });
  await expect.poll(() => opened.length).toBe(2); context.off('page', capture);
  for (const child of opened) await expect(child.getByRole('status').filter({ hasText: /^Live$/u })).toBeVisible();
});

test('nekad egen behörighet ansluter inte till synk och visar inga schemauppgifter', async ({ context, page }) => {
  await setup(context, page);
  await context.route('**/api/schema/fonster', route => route.fulfill({ headers, status: 403, json: { code: 'forbidden' } }));
  await page.getByRole('button', { name: 'Fönster', exact: true }).click(); const ready = context.waitForEvent('page');
  await page.getByRole('menuitem', { name: 'Klassens schema', exact: true }).click(); const child = await ready;
  await child.setViewportSize(page.viewportSize()!);
  await expect(child.getByRole('heading', { name: 'Schemavyn är stängd' })).toBeVisible();
  await expect(child.locator('[data-lesson], [data-schema-pass]')).toHaveCount(0);
  await expect(page.getByText('Fönster 1 av 1', { exact: true })).toBeVisible();
});


test('resursfönster läser egna listor: lärare, salstomläge och elev med lokal namngräns', async ({ context, page }) => {
  await setup(context, page);
  const f = { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } as SchemaForslag, resources = samlingResurser(f);
  const pupilName = 'Provelev Fönstergräns';
  await context.route('**/api/schema/samling', route => route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources: [...resources,
    { key: 'elev:1', id: 'elev-1', slag: 'elev', name: pupilName, lessons: resources[0].lessons, busyLessons: resources[0].lessons, size: 1, antagen: false, year: null }], clusters: [] } }));
  const teacher = await open(page, 'Lärarens schema'); await expect(teacher.getByRole('combobox', { name: 'Välj lärare' })).toBeVisible();
  await expect(teacher.locator('[data-resource^="larare:"]')).toHaveCount(1);
  const room = await open(page, 'Salens schema'); await expect(room.getByText('Inga salar finns i förslaget. Lägg till salar i villkoren i huvudfönstret.')).toBeVisible();
  const pupil = await open(page, 'Elevens schema'); await expect(pupil.getByRole('combobox', { name: 'Välj elev' })).toHaveValue('');
  await expect(pupil.locator('[data-resource]')).toHaveCount(0); await pupil.getByRole('combobox', { name: 'Välj elev' }).selectOption('elev:1');
  await expect(pupil.locator('[data-resource="elev:1"] .folj-namn')).toContainText(pupilName);
  const messages = await pupil.evaluate(() => (window as unknown as { schemaSynkMessages: string[] }).schemaSynkMessages);
  expect(messages.join('')).not.toContain(pupilName); expect(messages.join('')).not.toContain('elev-1');
  await pupil.addStyleTag({ content: 'html{font-size:200%}' });
  expect(await pupil.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await pupil.screenshot({ path: test.info().outputPath('fonster-elev-200.png'), fullPage: true });
});

test('ny huvudinstans efter omladdning ger nytt tillstånd och kontextsignal stänger elev- och schemavy', async ({ context, page }) => {
  await setup(context, page); const child = await open(page, 'Pass i tabell');
  await expect(child.locator('tr[data-lesson]').first()).toBeVisible();
  await page.reload(); await expect(child.locator('[data-lesson]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ta fram schemaförslag' }).click(); await expect(child.locator('tr[data-lesson]').first()).toBeVisible();
  await page.evaluate(() => { const channel = new BroadcastChannel('skolplattform-session'); channel.postMessage({ type: 'epoch', epoch: 2 }); channel.close(); });
  await expect(child.getByRole('heading', { name: 'Schemavyn är stängd' })).toBeVisible();
  await expect(child.locator('[data-lesson], [data-schema-pass]')).toHaveCount(0);
});

test('rubrikens fönsterknapp öppnar den befintliga vyn Vecka för vecka', async ({ context, page }) => {
  await setup(context, page);
  const ready = context.waitForEvent('page'); await page.getByRole('button', { name: 'Öppna Vecka för vecka i nytt fönster', exact: true }).click();
  const child = await ready;
  await child.setViewportSize(page.viewportSize()!);
  await expect(child.getByRole('heading', { name: 'Vecka för vecka', exact: true })).toBeVisible();
  await expect(child.getByRole('heading', { name: /^Tid över/u })).toHaveCount(0);
});

test('villkor i barnfönstret ångras där och görs om i huvudfönstret som ett gemensamt steg', async ({ context, page }) => {
  await setup(context, page); const child = await open(page, 'Klassens schema');
  await child.getByRole('group', { name: 'Verktyg i schemat' }).getByRole('button', { name: 'Spärra', exact: true }).click();
  await expect(child.getByRole('group', { name: 'Verktyg i schemat' }).getByRole('button', { name: 'Spärra', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await child.locator('[data-markering]').first().focus(); await child.keyboard.press('Enter');
  const panel = child.getByRole('region', { name: 'Ny spärr' }); await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Lägg till spärr', exact: true }).click();
  await expect(page.locator('ul[aria-label="Egna villkor"] > li')).toHaveCount(1);
  const undo = child.getByRole('button', { name: 'Ångra senaste villkor', exact: true }); await expect(undo).toBeEnabled(); await undo.click();
  await expect(page.locator('ul[aria-label="Egna villkor"] > li')).toHaveCount(0);
  await expect(child.getByRole('button', { name: /^Ångra/u }).first()).toBeDisabled();
  const redo = page.getByRole('button', { name: 'Gör om', exact: true }); await expect(redo).toBeEnabled(); await redo.click();
  await expect(page.locator('ul[aria-label="Egna villkor"] > li')).toHaveCount(1);
  await expect(child.getByRole('button', { name: 'Ångra senaste villkor', exact: true })).toBeEnabled();
  await expect(child.getByRole('button', { name: 'Gör om', exact: true })).toBeDisabled();
});

test('klassfönster använder stabil klassreferens och saknad lärarreferens ersätts inte med första läraren', async ({ context, page }) => {
  await setup(context, page); expect(proposal.classes.length).toBeGreaterThan(1);
  const wanted = proposal.classes[1]; await page.getByRole('combobox', { name: 'Klass eller grupp', exact: true }).selectOption(wanted.id);
  const child = await open(page, 'Klassens schema');
  await expect(child.getByRole('combobox', { name: 'Klass eller grupp', exact: true })).toHaveValue(wanted.id);
  const f = { ...proposal, contractVersion: SCHEMA_CONTRACT_VERSION } as SchemaForslag;
  await context.route('**/api/schema/samling', route => route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources: samlingResurser(f), clusters: [] } }));
  const teacher = await open(page, 'Lärarens schema'), address = new globalThis.URL(teacher.url()); address.searchParams.set('resurs', 'larare:ffffffff-ffff-4fff-8fff-ffffffffffff');
  await teacher.goto(address.toString());
  await expect(teacher.getByText('Resursen i arbetsvyn finns inte i detta underlag. Välj en annan resurs.', { exact: true })).toBeVisible();
  await expect(teacher.locator('[data-resource], [data-schema-pass]')).toHaveCount(0);
  await expect(teacher.getByRole('combobox', { name: 'Välj lärare' })).toHaveValue('');
});
