// Riktiga host-/child-fönster och BroadcastChannel. Auth-, schema- och sparrutter är uttryckligt simulerade.
import { test, expect, type BrowserContext, type Page } from './schema-test';
import proposal from './schema-fixture';
import checked from './fixtures/schema-kontroll.json' with { type: 'json' };
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag } from '../lib/schema-contract.ts';
import { schemaDatumOriginal, type SchemaDatumRequest } from '../lib/schema-datum.ts';
import { addSchemaDays, schemaMonday } from '../lib/schema-vecka.ts';

const headers = { 'X-Context-Epoch': '1' }, URL = '/e2e/fixtures/schema-preview.html', lessonId = 'pass-7';
const base = proposal as unknown as SchemaForslag;
const original = base.time.calendar!.days.flatMap(d => {
  const o = schemaDatumOriginal(base, { lesson: lessonId, originalDate: d.date });
  return d.date >= '2026-11-16' && o && schemaDatumOriginal(base, { lesson: lessonId, originalDate: addSchemaDays(d.date, 7) }) ? [o] : [];
})[0];
const clock = (n: number) => `${Math.floor(n / 60).toString().padStart(2, '0')}:${(n % 60).toString().padStart(2, '0')}`;
type TransportState = { hold: boolean; held: { channel: BroadcastChannel; message: Record<string, unknown> }[];
  latest: { owner: unknown; version: unknown; fingerprint: unknown; phase: unknown } | null; release: () => void };

async function setup(context: BrowserContext, page: Page) {
  // Behåll en faktisk dialoghandling tills ett nytt transportkuvert finns. Den gamla avsikten får aldrig omtolkas som nya pass-n.
  await context.addInitScript(() => {
    const Native = window.BroadcastChannel, post = (channel: BroadcastChannel, message: unknown) => Native.prototype.postMessage.call(channel, message);
    const state: TransportState = { hold: false, held: [], latest: null, release: () => undefined };
    (window as unknown as { schemaDatumTransport: TransportState }).schemaDatumTransport = state;
    window.BroadcastChannel = class extends Native {
      constructor(name: string) {
        super(name); this.addEventListener('message', event => {
          const m = event.data;
          if (m?.type === 'state') state.latest = { owner: m.owner, version: m.version, fingerprint: m.state?.base?.grundFingerprint, phase: m.state?.sparstatus?.phase };
        });
      }
      postMessage(message: unknown) {
        const m = message as Record<string, unknown> & { action?: { typ?: string }; actions?: {typ?: string}[] };
        const actions = Array.isArray(m.actions) ? m.actions : m.action ? [m.action] : [];
        if (state.hold && m?.type === 'action' && actions.some(action => action.typ === 'date')) { state.held.push({ channel: this, message: m }); return; }
        post(this, message);
      }
    };
    state.release = () => {
      state.hold = false;
      for (const { channel, message } of state.held.splice(0)) {
        // Motsvarar en äldre öppen dialog i ett uppdaterat child-fönster: transportversionen är aktuell, formulärets inputKey är gammal.
        post(channel, { ...message, owner: state.latest?.owner, version: state.latest?.version });
      }
    };
  });
  const calls: SchemaDatumRequest[] = [], callers: Page[] = []; let generations = 0, current = base;
  await context.route('**/api/session', route => route.fulfill({ headers, json: { epoch: 1 } }));
  await context.route('**/api/schema/fonster', route => route.fulfill({ headers, json: { unitId: base.unitId, schoolYear: base.schoolYear, scopeKey: '1:prov:prov' } }));
  await context.route('**/api/schema/diagnos', route => route.fulfill({ headers, json: { version: SCHEMA_CONTRACT_VERSION, findings: [] } }));
  await context.route('**/api/schema/forslag', route => {
    const input = route.request().postDataJSON(); generations++;
    current = { ...base, villkor: input.villkor, period: input.period, grundFingerprint: generations > 1 ? 'f'.repeat(28) : base.grundFingerprint,
      lessons: base.lessons.map(l => generations > 1 && l.id === lessonId ? { ...l, title: 'Ny undervisning i samma passnummer' } : l) };
    return route.fulfill({ headers, json: current });
  });
  await context.route('**/api/schema/kontroll', route => {
    const input = route.request().postDataJSON();
    return route.fulfill({ headers, json: { ...checked.clash, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, fingerprint: current.fingerprint,
      violations: [], total: 0, teachings: current.teachings, trims: current.trims, metrics: current.metrics, rooms: Object.fromEntries(input.placements.filter((p: {room: string | null}) => p.room).map((p: {lesson: string;room:string}) => [p.lesson, p.room])) } });
  });
  await context.route('**/api/schema/datum', route => {
    const input = route.request().postDataJSON() as SchemaDatumRequest; calls.push(input); callers.push(route.request().frame().page());
    return route.fulfill({ headers, json: { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: input.grundFingerprint, fingerprint: current.fingerprint,
      datedOverrides: input.datedOverrides, checkedDates: [...new Set([...input.dates, ...input.datedOverrides.flatMap(a => [a.originalDate, a.date])])].sort(), violations: [], total: 0, timeChanges: [] } });
  });
  await page.goto(URL); await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(page.getByText('Förslag · Alla pass lagda', { exact: true })).toBeVisible();
  await expect(page.getByText('Sparat på servern', { exact: true })).toBeVisible();
  return { calls, callers, fingerprint: () => current.grundFingerprint };
}
async function childWindow(page: Page) {
  await page.getByRole('button', { name: 'Fönster', exact: true }).click();
  const opened = page.context().waitForEvent('page'); await page.getByRole('menuitem', { name: 'Klassens schema', exact: true }).click();
  const child = await opened; await child.setViewportSize(page.viewportSize()!);
  await expect(child.getByRole('status').filter({ hasText: /^Live$/u })).toBeVisible();
  const modes = child.getByRole('region', { name: 'Grundschema eller faktiska tillfällen', exact: true });
  await modes.getByRole('button', { name: 'Vecka', exact: true }).click();
  await modes.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption(schemaMonday(original.originalDate));
  return child;
}
const tile = (page: Page, date = original.originalDate) => page.locator(`[data-occurrence="${lessonId}@${date}"]`);
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Ändra ett tillfälle', exact: true });

test('ett child-tillfälle synkas, sparas och ångras som datumändring medan grundschema och nästa vecka behålls', async ({ context, page, schemaDraftServer }, info) => {
  const state = await setup(context, page), child = await childWindow(page), oldStart = clock(original.lesson.startMin!), nextStart = clock(original.lesson.startMin! + 10);
  await tile(child).click(); await expect(dialog(child)).toBeVisible();
  await dialog(child).getByLabel('Starttid', { exact: true }).fill(nextStart);
  await dialog(child).getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();
  await expect(dialog(child)).toHaveCount(0); await expect(tile(child).locator('time')).toContainText(nextStart);
  await expect(page.getByRole('region', { name: 'Datumändringar', exact: true })).toBeVisible();
  expect(state.calls.length).toBeGreaterThan(0);
  expect(state.callers.every(caller => caller === page)).toBe(true);
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.datedOverrides.length).toBe(1);
  const saved = schemaDraftServer.saves.at(-1)!;
  expect(saved.datedOverrides[0]).toEqual({ lesson: lessonId, originalDate: original.originalDate, date: original.originalDate, startMin: original.lesson.startMin! + 10, room: original.lesson.roomId, durationMin: original.length });
  expect(saved.placements.find(p => p.lesson === lessonId)?.startMin).toBe(original.lesson.startMin);
  await expect(page.locator(`[data-lesson="${lessonId}"]`).first().locator('time')).toContainText(oldStart);
  const modes = child.getByRole('region', { name: 'Grundschema eller faktiska tillfällen', exact: true });
  await modes.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption(schemaMonday(addSchemaDays(original.originalDate, 7)));
  await expect(tile(child, addSchemaDays(original.originalDate, 7)).locator('time')).toContainText(oldStart);
  await modes.getByRole('combobox', { name: 'Vecka', exact: true }).selectOption(schemaMonday(original.originalDate));
  await child.getByRole('button', { name: 'Ångra senaste datumändring', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Datumändringar', exact: true })).toHaveCount(0);
  await expect(tile(child).locator('time')).toContainText(oldStart);
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.datedOverrides.length).toBe(0);
  await page.getByRole('button', { name: 'Gör om', exact: true }).click();
  await expect(tile(child).locator('time')).toContainText(nextStart);
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.datedOverrides.length).toBe(1);
  await child.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await child.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await child.screenshot({ path: info.outputPath('datum-synkat-child-200.png'), fullPage: false });
});

test('en äldre datumdialog och dess kvarhållna avsikt kan inte ändra återanvänt passnummer i ny grund', async ({ context, page, schemaDraftServer }) => {
  const state = await setup(context, page), child = await childWindow(page);
  await tile(child).click(); await dialog(child).getByLabel('Starttid', { exact: true }).fill(clock(original.lesson.startMin! + 10));
  await child.evaluate(() => { (window as unknown as {schemaDatumTransport:TransportState}).schemaDatumTransport.hold = true; });
  await dialog(child).getByRole('button', { name: 'Spara ändringen för detta tillfälle', exact: true }).click();
  await expect.poll(() => child.evaluate(() => (window as unknown as {schemaDatumTransport:TransportState}).schemaDatumTransport.held.length)).toBe(1);
  expect(state.calls).toHaveLength(0);
  await page.getByRole('button', { name: 'Ta fram schemaförslag', exact: true }).click();
  await expect(child.locator(`[data-lesson="${lessonId}"]`).first()).toContainText('Ny undervisning i samma passnummer');
  await expect(dialog(child)).toHaveCount(0);
  await expect.poll(() => schemaDraftServer.saves.at(-1)?.grundFingerprint).toBe('f'.repeat(28));
  await expect.poll(() => child.evaluate(() => (window as unknown as {schemaDatumTransport:TransportState}).schemaDatumTransport.latest?.phase)).toBe('saved');
  await child.evaluate(() => { (window as unknown as {schemaDatumTransport:TransportState}).schemaDatumTransport.release(); });
  await expect(page.getByRole('alert').filter({ hasText: 'Schemat har ändrats sedan datumdialogen öppnades' })).toBeVisible();
  expect(state.calls).toHaveLength(0); expect(schemaDraftServer.saves.at(-1)?.datedOverrides).toEqual([]);
  expect(schemaDraftServer.saves.at(-1)?.placements.find(p => p.lesson === lessonId)?.startMin).toBe(original.lesson.startMin);
  expect(state.fingerprint()).toBe('f'.repeat(28));
});

test('stale sparstatus stänger en redan öppen child-dialog och visar varför fortsatt datumredigering stoppas', async ({ context, page, schemaDraftServer }) => {
  const state = await setup(context, page), child = await childWindow(page);
  await tile(child).click(); await expect(dialog(child)).toBeVisible();
  await dialog(child).getByLabel('Starttid', { exact: true }).fill(clock(original.lesson.startMin! + 10));
  await context.route('**/api/schema/utkast/spara', route => route.fulfill({ headers, status: 409, json: { code: 'conflict', details: { reason: 'schema_draft_source_changed' } } }));
  await page.getByRole('textbox', { name: 'Namn på utkastet', exact: true }).fill('Källan ändras under pågående datumval');
  await expect(dialog(child)).toHaveCount(0);
  await expect(child.getByRole('region', { name: 'Sparat schemautkast', exact: true }).getByRole('alert')).toContainText('Underlaget har ändrats');
  await expect(tile(child)).toBeDisabled();
  expect(state.calls).toHaveLength(0); expect(schemaDraftServer.saves.at(-1)?.datedOverrides).toEqual([]);
});
