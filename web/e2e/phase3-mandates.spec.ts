// Fas 3 (03-07): mandatflöden och spårbarhet i de befintliga protected-projekten
// (dator och telefon mot protected-devservern, samt byggd Worker). Riktig OIDC-
// inloggning mot den lokala test-IdP:n; endast syntetiska uppgifter.
//
// Konton och mandat skapas av work/pilot/phase3-browser-fixtures.mjs. Lösenord
// läses ur den gitignorerade målkatalogen och skrivs aldrig ut. Titlarna måste
// stämma med MANDATE_BROWSER i scripts/verify-phase3.mjs.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { devices, expect, test, type Browser, type BrowserContext, type Locator, type Page, type TestInfo } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';

const CUSTOMER = '33000000-0000-4000-8000-000000000001';
const ORGANIZER = '33000000-0000-4000-8000-000000000011';
const UNIT = '33000000-0000-4000-8000-000000000111';
const P11 = '33000000-0000-4000-8000-000000000211';
const P12 = '33000000-0000-4000-8000-000000000212';
const P21 = '33000000-0000-4000-8000-000000000221';
const K11 = '33000000-0000-4000-8000-000000000411';
const K12 = '33000000-0000-4000-8000-000000000412';
// Tillfällig elev i skola 11 utan grupp och ärende; skapas och tas bort av specen.
const P18 = '33000000-0000-4000-8000-000000000218';
const OWN_PUPIL = 'Syntetisk elev 11';
const SCHOOL_ONLY_PUPIL = 'Syntetisk elev 18';
const FOREIGN_PUPILS = ['Syntetisk elev 12', 'Syntetisk elev 21', 'Syntetisk elev 22'];
const RECIPIENT = 'Pia Provmottagare';
// Elevnamn i provet; personalnamn som "Syntetisk elevhälsa" (från API-proven) ska inte träffa.
const ANY_PUPIL = /Syntetisk elev \d/u;

let manifest: PilotManifest;
let passwords: Record<string, string>;

// Fallen körs i ordning (workers: 1) men inte seriellt: ett fel hindrar inte att övriga fall redovisas.

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function endRecipientMandates(): void {
  psql(manifest, `update public.access_assignments a set ended_at=clock_timestamp()
    from public.memberships m join public.identities i on i.id=m.identity_id
    where a.membership_id=m.id and i.issuer='https://phase3.example.test' and i.subject='browser-recipient'
      and a.customer_id='${CUSTOMER}' and a.ended_at is null;`);
}

function removeTemporaryPupil(): void {
  psql(manifest, `delete from public.mandate_pupils where pupil_id='${P18}';
    delete from public.phase3_probe_group_members where pupil_id='${P18}';
    delete from public.phase3_probe_pupils where id='${P18}';`);
}

test.beforeAll(() => {
  manifest = readPilotManifest();
  try {
    passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8')) as Record<string, string>;
  } catch {
    throw new Error('BLOCKED: kör node work/pilot/phase3-browser-fixtures.mjs --target protected');
  }
  for (const username of ['p3.huvudman', 'p3.rektor', 'p3.larare', 'p3.admin', 'p3.elevhalsa', 'p3.elevhalsa.skola', 'p3.elevhalsa.elev', 'p3.support', 'p3.it', 'p3.granskare']) {
    if (!passwords[username]) throw new Error(`BLOCKED: fixturkontot ${username} saknas; kör phase3-browser-fixtures`);
  }
  removeTemporaryPupil();
  psql(manifest, `insert into public.phase3_probe_pupils values ('${P18}','${CUSTOMER}','${ORGANIZER}','${UNIT}','${SCHOOL_ONLY_PUPIL}');`);
  endRecipientMandates();
});

test.afterAll(() => {
  if (!manifest) return;
  removeTemporaryPupil();
  endRecipientMandates();
});

function dbNow(): string {
  return psql(manifest, 'select clock_timestamp()::text;');
}

function eventCount(action: string, outcome: string, since: string, extra = ''): number {
  return Number(psql(manifest, `select count(*) from public.security_events
    where customer_id='${CUSTOMER}' and action=${sql(action)} and outcome=${sql(outcome)} and occurred_at>=${sql(since)}::timestamptz ${extra};`));
}

async function login(page: Page, username: string, requireMfa = false): Promise<void> {
  await loginViaKeycloak(page, username, { password: passwords[username] });
  await waitForHydration(page);
  if (!requireMfa) return;
  const session = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
  if (session.mfa.amr.includes('otp')) return;
  await loginViaKeycloak(page, username, { password: passwords[username], stepUp: true });
  await waitForHydration(page);
  const after = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
  expect(after.mfa.amr).toContain('otp');
}

function contextOptions(testInfo: TestInfo, phone = false) {
  const use = testInfo.project.use;
  const device = phone ? devices['iPhone 13'] : {
    viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
  };
  return { ...device, baseURL: use.baseURL, locale: 'sv-SE' };
}

/** Ytterligare användare i en egen webbläsarkontext med projektets enhetsinställningar. */
async function otherUser(browser: Browser, testInfo: TestInfo, username: string, requireMfa = false): Promise<{ context: BrowserContext; page: Page; bodies: string[] }> {
  const context = await browser.newContext(contextOptions(testInfo));
  const page = await context.newPage();
  const bodies = recordApi(page);
  await login(page, username, requireMfa);
  return { context, page, bodies };
}

/** Samlar alla API-svar så att förbjudet innehåll kan uteslutas även ur nätverket. */
function recordApi(page: Page): string[] {
  const bodies: string[] = [];
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.startsWith('/api/')) return;
    void response.text().then((text) => bodies.push(text), () => undefined);
  });
  return bodies;
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function expectAbsent(page: Page, bodies: string[], names: (string | RegExp)[]): Promise<void> {
  await settle(page);
  const dom = await page.content();
  const network = bodies.join('\n');
  for (const name of names) {
    if (typeof name === 'string') {
      expect(dom, `DOM innehåller ${name}`).not.toContain(name);
      expect(network, `nätverket innehåller ${name}`).not.toContain(name);
    } else {
      expect(dom, `DOM innehåller ${String(name)}`).not.toMatch(name);
      expect(network, `nätverket innehåller ${String(name)}`).not.toMatch(name);
    }
  }
}

async function expectTouchTargets(page: Page, scope: Locator): Promise<void> {
  // Dialogernas öppningsanimation skalar innehållet; mät först när den är klar.
  await scope.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, 'ingen horisontell sidoscroll').toBeLessThanOrEqual(innerWidth + 1);
  const small = await scope.locator('button, select, input, label.mandate-check, summary').evaluateAll((elements) => elements
    .filter((element) => element instanceof HTMLElement && element.offsetParent !== null && !(element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)))
    .map((element) => ({ text: (element.textContent ?? element.getAttribute('aria-label') ?? '').trim().slice(0, 40), height: Math.round(element.getBoundingClientRect().height) }))
    .filter((item) => item.height < 44));
  expect(small, 'pekytor under 44 px').toEqual([]);
}

async function expectFocusInside(page: Page, dialog: Locator): Promise<void> {
  // Fokusfällans kantvakter flyttar tillbaka fokus i en händelsehanterare; ge den en kort stund.
  const where = () => dialog.evaluate((element) => (element.contains(document.activeElement) ? 'inne' : `${document.activeElement?.tagName} "${(document.activeElement?.textContent ?? '').trim().slice(0, 30)}"`));
  await expect.poll(where, { message: 'fokus stannar i dialogen', timeout: 2_000 }).toBe('inne');
}

/** Öppnar tilldelningsdialogen och väntar tills serverns tillåtna urval har laddats. */
async function openGrantDialog(page: Page, viaKeyboard = false): Promise<Locator> {
  const open = page.getByRole('button', { name: 'Tilldela uppdrag' });
  // Knappen är inaktiv medan mandatlistan hämtas.
  await expect(open).toBeEnabled();
  if (viaKeyboard) { await open.focus(); await page.keyboard.press('Enter'); } else await open.click();
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.locator('select').nth(1).locator('option').count()).toBeGreaterThan(1);
  return dialog;
}

function mandateCard(page: Page, name: string, text?: string): Locator {
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  return text ? card.filter({ hasText: text }) : card;
}

test('huvudman utser rektor', async ({ page }) => {
  const bodies = recordApi(page);
  const since = dbNow();
  await login(page, 'p3.huvudman', true);
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  await expect(mandateCard(page, 'Rut Rektor')).toContainText('Skola · Syntetisk skola 11');
  await expect(mandateCard(page, RECIPIENT)).toHaveCount(0);

  const dialog = await openGrantDialog(page);
  const fn = dialog.locator('select').first();
  await expect(fn.locator('option')).toHaveText(['Välj uppdrag', 'Rektor']);
  await expect(fn).toHaveValue('rektor');
  await dialog.locator('select').nth(1).selectOption({ label: RECIPIENT });
  await dialog.getByLabel('Syntetisk skola 12').check();
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Uppdraget har tilldelats ${RECIPIENT}.`)).toBeVisible();
  const card = mandateCard(page, RECIPIENT, 'Rektor');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Skola · Syntetisk skola 12');
  await expect(card).toContainText('Giltigt');
  expect(eventCount('principal_appointed', 'ok', since)).toBe(1);

  await card.getByRole('button', { name: `Avsluta uppdrag för ${RECIPIENT}` }).click();
  const confirm = page.getByRole('dialog', { name: 'Avsluta uppdrag?' });
  await expect(confirm).toContainText(`${RECIPIENT} förlorar uppdraget Rektor för Syntetisk skola 12`);
  await confirm.getByRole('button', { name: 'Ja, avsluta uppdraget' }).click();
  await expect(page.getByText(/Uppdraget är avslutat/u)).toBeVisible();
  await expect(mandateCard(page, RECIPIENT)).toHaveCount(0);
  expect(eventCount('assignment_ended', 'ok', since)).toBe(1);
  await expectAbsent(page, bodies, [ANY_PUPIL]);
});

test('rektor ger och avslutar läraruppdrag', async ({ page }) => {
  const bodies = recordApi(page);
  const since = dbNow();
  await login(page, 'p3.rektor', true);
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  const dialog = await openGrantDialog(page);
  const fn = dialog.locator('select').first();
  const offered = await fn.locator('option').allTextContents();
  expect(offered).toContain('Lärare');
  expect(offered).not.toContain('Rektor');
  expect(await dialog.locator('select').nth(1).locator('option').allTextContents()).not.toContain('Rut Rektor');
  await fn.selectOption({ label: 'Lärare' });
  await dialog.locator('select').nth(1).selectOption({ label: RECIPIENT });
  await dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u).check();
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Uppdraget har tilldelats ${RECIPIENT}.`)).toBeVisible();
  const card = mandateCard(page, RECIPIENT, 'Lärare');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Tilldelade grupper · Syntetisk skola 11');
  expect(eventCount('mandate_granted', 'ok', since)).toBe(1);

  await card.getByRole('button', { name: `Avsluta uppdrag för ${RECIPIENT}` }).click();
  const confirm = page.getByRole('dialog', { name: 'Avsluta uppdrag?' });
  await expect(confirm).toContainText(`${RECIPIENT} förlorar uppdraget Lärare för Syntetisk skola 11`);
  await confirm.getByRole('button', { name: 'Ja, avsluta uppdraget' }).click();
  await expect(page.getByText(/Uppdraget är avslutat/u)).toBeVisible();
  await expect(mandateCard(page, RECIPIENT)).toHaveCount(0);
  await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect(page.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
  await expect(mandateCard(page, RECIPIENT)).toHaveCount(0);
  expect(eventCount('assignment_ended', 'ok', since)).toBe(1);
  expect(Number(psql(manifest, `select count(*) from public.access_assignments a join public.memberships m on m.id=a.membership_id
    join public.identities i on i.id=m.identity_id where i.subject='browser-recipient' and public.phase3_mandate_is_valid(a.id);`))).toBe(0);
  await expectAbsent(page, bodies, FOREIGN_PUPILS);
});

test('elevhälsa med skolscope', async ({ page }) => {
  const bodies = recordApi(page);
  await login(page, 'p3.elevhalsa.skola');
  await expect(page.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
  await expect(page.locator('.probe-scope')).toContainText('Skola · Syntetisk skola 11');
  const list = page.locator('.probe-list');
  await expect(list.getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  await expect(list.getByRole('heading', { name: SCHOOL_ONLY_PUPIL })).toBeVisible();
  await expect(page.locator('.probe-list > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Exportera urvalet (CSV)' })).toHaveCount(0);
  await page.getByRole('button', { name: `Visa ${SCHOOL_ONLY_PUPIL}` }).click();
  await expect(page.locator('.probe-detail')).toContainText('Syntetisk skola 11');
  const foreign = await page.request.get(`/api/prov/elev?elev=${P12}`);
  expect(foreign.status()).toBe(404);
  const exported = await page.request.get('/api/prov/export');
  expect(exported.status()).toBe(403);
  expect(`${await foreign.text()}${await exported.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, bodies, FOREIGN_PUPILS);
});

test('elevhälsa med elevscope', async ({ page }) => {
  const bodies = recordApi(page);
  await login(page, 'p3.elevhalsa.elev');
  await expect(page.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
  await expect(page.locator('.probe-scope')).toContainText('Tilldelade elever · Syntetisk skola 11');
  await expect(page.locator('.probe-list > li')).toHaveCount(1);
  await expect(page.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  const sameSchool = await page.request.get(`/api/prov/elev?elev=${P18}`);
  expect(sameSchool.status()).toBe(404);
  const foreign = await page.request.get(`/api/prov/elev?elev=${P21}`);
  expect(foreign.status()).toBe(404);
  expect(`${await sameSchool.text()}${await foreign.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, bodies, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
});

test('elevhälsa med ärendescope', async ({ page }) => {
  const bodies = recordApi(page);
  await login(page, 'p3.elevhalsa');
  await expect(page.locator('.probe-scope')).toContainText('Tilldelade ärenden · Syntetisk skola 11');
  await expect(page.getByText('Välj ett tilldelat ärende')).toBeVisible();
  await expect(page.locator('.probe-list > li')).toHaveCount(0);
  await page.getByLabel('Tilldelat ärende').selectOption({ label: 'Tilldelat ärende 1 · Syntetisk skola 11' });
  await page.getByRole('button', { name: 'Visa ärendets elev' }).click();
  await expect(page.locator('.probe-detail')).toContainText(OWN_PUPIL);
  // Utan ärendet får elevhälsan inte läsa eleven direkt, inte heller skolans andra elever.
  const direct = await page.request.get(`/api/prov/elev?elev=${P11}`);
  expect(direct.status()).toBe(404);
  const otherCase = await page.request.get(`/api/prov/elev?arende=${K12}`);
  expect(otherCase.status()).toBe(404);
  expect(`${await direct.text()}${await otherCase.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, bodies, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
});

test('rektor godkänner support som upphör vid sluttid', async ({ page, browser }, testInfo) => {
  const since = dbNow();
  await login(page, 'p3.rektor', true);
  const dialog = await openGrantDialog(page);
  await dialog.locator('select').first().selectOption({ label: 'Tidsbegränsad support' });
  await dialog.locator('select').nth(1).selectOption({ label: 'Sam Support' });
  await expect(dialog.getByText('Syfte: syntetisk felsökning. Du godkänner uppdraget; det upphör automatiskt.')).toBeVisible();
  await dialog.getByLabel(new RegExp(OWN_PUPIL, 'u')).check();
  await dialog.getByLabel('Varaktighet från nu').selectOption('15');
  const grantedAt = Date.now();
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(page.getByText('Uppdraget har tilldelats Sam Support.')).toBeVisible();
  const card = mandateCard(page, 'Sam Support', 'Tidsbegränsad support');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Syntetisk felsökning');
  await expect(card).toContainText('Rut Rektor');
  expect(eventCount('mandate_granted', 'ok', since)).toBe(1);

  const support = await otherUser(browser, testInfo, 'p3.support');
  try {
    const view = support.page;
    await expect(view.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
    const scope = view.locator('.probe-scope');
    await expect(scope).toContainText('Godkänt av');
    await expect(scope).toContainText('Rut Rektor');
    await expect(scope).toContainText('Syntetisk felsökning');
    const endsAt = Date.parse(await scope.locator('time').getAttribute('datetime') ?? '');
    expect(Math.abs(endsAt - (grantedAt + 15 * 60_000))).toBeLessThan(120_000);
    await expect(view.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
    await expect(view.locator('.probe-list > li')).toHaveCount(1);
    await expect(view.getByRole('button', { name: 'Exportera urvalet (CSV)' })).toHaveCount(0);

    // Kortar endast detta syntetiska supportuppdrag så att sluttiden kan prövas i provet.
    psql(manifest, `update public.access_assignments a set ends_at=clock_timestamp()+interval '6 seconds'
      from public.memberships m join public.identities i on i.id=m.identity_id
      where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`);
    await view.getByRole('button', { name: 'Hämta aktuellt urval' }).click();
    await expect(view.getByRole('alert')).toContainText('Uppdraget har upphört vid sin sluttid', { timeout: 20_000 });
    expect(await view.content()).not.toContain(OWN_PUPIL);
    const after = await view.request.get('/api/prov/elev');
    expect(after.status()).toBe(403);
    expect(await after.text()).not.toMatch(ANY_PUPIL);
    await expectAbsent(view, support.bodies, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
  } finally {
    await support.context.close();
  }
  await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect(page.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
  await expect(mandateCard(page, 'Sam Support', 'Tidsbegränsad support')).toHaveCount(0);
});

test('IT pausar och provar anslutning utan elevinsyn', async ({ page }, testInfo) => {
  const bodies = recordApi(page);
  const since = dbNow();
  await login(page, 'p3.it', true);
  await expect(page.getByRole('heading', { name: 'Lokal anslutning', exact: true })).toBeVisible();
  await expect(page.getByText('Status:')).toBeVisible();
  const pause = page.getByRole('button', { name: 'Pausa anslutningen' });
  const activate = page.getByRole('button', { name: 'Aktivera anslutningen' });
  if (await activate.isVisible()) {
    await activate.click();
    await expect(page.getByText('Den lokala anslutningen är aktiv.')).toBeVisible();
  }
  await pause.click();
  await expect(page.getByText('Den lokala anslutningen är pausad.')).toBeVisible();
  await page.getByRole('button', { name: 'Kör syntetiskt test' }).click();
  await expect(page.getByText('Anslutningen är pausad. Aktivera den innan du kör testet.')).toBeVisible();
  await activate.click();
  await expect(page.getByText('Den lokala anslutningen är aktiv.')).toBeVisible();
  await page.getByRole('button', { name: 'Kör syntetiskt test' }).click();
  await expect(page.getByText('Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.')).toBeVisible();
  expect(eventCount('connection_update', 'ok', since)).toBeGreaterThanOrEqual(2);
  expect(eventCount('connection_test', 'ok', since)).toBeGreaterThanOrEqual(2);

  const trigger = page.getByRole('button', { name: 'Visa eller dölj navigation' });
  const nav = page.locator('[data-sidebar="sidebar"]').filter({ hasText: 'ARBETSYTA' }).last();
  if (!(await nav.isVisible())) await trigger.click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Syntetiskt elevprov' })).toHaveCount(0);
  if (testInfo.project.name === 'protected-phone') await page.keyboard.press('Escape');
  for (const endpoint of ['/api/prov/elev', `/api/prov/elev?elev=${P11}`, '/api/prov/export']) {
    const response = await page.request.get(endpoint);
    expect(response.status(), endpoint).toBe(403);
    expect(await response.text()).not.toMatch(ANY_PUPIL);
  }
  await expectAbsent(page, bodies, [ANY_PUPIL]);
});

test('granskaren följer elevläsning, export och nekande', async ({ page, browser }, testInfo) => {
  const since = dbNow();
  // Lärare läser en elev och försöker läsa en främmande elev (nekas).
  const teacher = await otherUser(browser, testInfo, 'p3.larare');
  let denied: { correlationId: string };
  let read: string;
  try {
    const view = teacher.page;
    await expect(view.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
    const readResponse = view.waitForResponse((response) => response.url().includes(`/api/prov/elev?elev=${P11}`));
    await view.getByRole('button', { name: `Visa ${OWN_PUPIL}` }).click();
    read = (await readResponse).headers()['x-correlation-id'];
    await expect(view.locator('.probe-detail')).toContainText(OWN_PUPIL);
    const foreign = await view.request.get(`/api/prov/elev?elev=${P12}`);
    expect(foreign.status()).toBe(404);
    denied = await foreign.json() as { correlationId: string };
  } finally {
    await teacher.context.close();
  }
  // Skoladministratören exporterar urvalet.
  const admin = await otherUser(browser, testInfo, 'p3.admin');
  try {
    await expect(admin.page.getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
    const download = admin.page.waitForEvent('download');
    await admin.page.getByRole('button', { name: 'Exportera urvalet (CSV)' }).click();
    await download;
    await expect(admin.page.getByText('Exporten av det syntetiska urvalet är klar.')).toBeVisible();
  } finally {
    await admin.context.close();
  }
  expect(read).toMatch(/^[0-9a-f-]{36}$/u);
  expect(denied.correlationId).toMatch(/^[0-9a-f-]{36}$/u);

  const bodies = recordApi(page);
  await login(page, 'p3.granskare');
  await expect(page.getByRole('heading', { name: 'Säkerhetslogg', exact: true })).toBeVisible();
  const table = page.locator('table.audit-table');
  const action = page.getByLabel('Åtgärd');
  const show = page.getByRole('button', { name: 'Visa', exact: true });

  await action.fill('pupil_probe_read');
  await show.click();
  const readRow = table.getByRole('row').filter({ hasText: read.slice(0, 8) });
  await expect(readRow).toHaveCount(1);
  await expect(readRow.locator('td').nth(2)).toHaveText('ok');
  await expect(readRow).toContainText('Lärare');
  const deniedRow = table.getByRole('row').filter({ hasText: denied.correlationId.slice(0, 8) });
  await expect(deniedRow).toHaveCount(1);
  await expect(deniedRow.locator('td').nth(2)).not.toHaveText('ok');
  await deniedRow.getByText('Detaljer', { exact: true }).click();
  await expect(deniedRow).toContainText(denied.correlationId);

  await action.fill('pupil_probe_exported');
  await show.click();
  await expect(table.getByRole('row').filter({ hasText: 'Administratör' }).first()).toBeVisible();

  await action.fill('');
  await show.click();
  // Exporten gäller det tillämpade filtret; vänta tills den ofiltrerade listan visas.
  await expect(table.getByRole('row').filter({ hasText: read.slice(0, 8) })).toHaveCount(1);
  await expect(table.getByRole('row').filter({ hasText: 'pupil_probe_exported' }).first()).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera CSV' }).click();
  const csv = readFileSync(await (await download).path(), 'utf8');
  expect(csv).toContain(read);
  expect(csv).toContain(denied.correlationId);
  expect(csv).toContain('pupil_probe_exported');
  expect(csv).not.toMatch(ANY_PUPIL);
  await expect(page.getByText('CSV-exporten har laddats ner och registrerats i loggen.')).toBeVisible();
  expect(eventCount('log_exported', 'ok', since)).toBeGreaterThanOrEqual(1);
  // Granskaren ser inga elevuppgifter och saknar elevläsning.
  const probe = await page.request.get('/api/prov/elev');
  expect(probe.status()).toBe(403);
  await expectAbsent(page, bodies, [ANY_PUPIL]);
});

test('tangentbord och fältfel i tilldelningen', async ({ page }) => {
  const since = dbNow();
  await login(page, 'p3.rektor');
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  const open = page.getByRole('button', { name: 'Tilldela uppdrag' });
  const dialog = await openGrantDialog(page, true);
  await expectFocusInside(page, dialog);
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInside(page, dialog);
  }
  // Skicka tomt formulär med tangentbordet: fälten märks och felen knyts till fälten.
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Formuläret innehåller fel. Rätta de markerade fälten.');
  const fn = dialog.locator('select').first();
  const recipient = dialog.locator('select').nth(1);
  await expect(fn).toHaveAttribute('aria-invalid', 'true');
  await expect(fn).toHaveAttribute('aria-describedby', 'grant-fn-error');
  await expect(dialog.locator('#grant-fn-error')).toHaveText('Välj vilket uppdrag som ska tilldelas.');
  await expect(recipient).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.locator('#grant-recipient-error')).toHaveText('Välj mottagare.');

  await fn.focus();
  await fn.selectOption({ label: 'Lärare' });
  await expect(fn).not.toHaveAttribute('aria-invalid', 'true');
  await recipient.selectOption({ label: RECIPIENT });
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.locator('#grant-selection-error')).toHaveText('Välj minst en grupp.');
  const group = dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u);
  await group.focus();
  await page.keyboard.press('Space');
  await expect(group).toBeChecked();

  // Servern kräver engångskod för tilldelning: felet visas i dialogen och inmatningen finns kvar.
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('alert')).toContainText('Tilldelning kräver verifiering med engångskod.');
  await expect(fn).toHaveValue('larare');
  await expect(recipient.locator('option:checked')).toHaveText(RECIPIENT);
  await expect(group).toBeChecked();
  await expect(page.getByText('Åtgärden kräver verifiering med engångskod.')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
  await expect(mandateCard(page, RECIPIENT)).toHaveCount(0);
  expect(eventCount('mandate_granted', 'ok', since)).toBe(0);
});

test('pekytor är minst 44 px på telefon', async ({ page, browser }, testInfo) => {
  const phone = testInfo.project.name === 'protected-phone';
  const context = phone ? null : await browser.newContext(contextOptions(testInfo, true));
  const view = phone ? page : await context!.newPage();
  try {
    await login(view, 'p3.rektor');
    await expect(view.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
    await expect(view.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
    await expectTouchTargets(view, view.locator('#workspace'));
    const dialog = await openGrantDialog(view);
    await dialog.locator('select').first().selectOption({ label: 'Lärare' });
    await expect(dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u)).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = view.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.y >= 0).toBeTruthy();
    await expectTouchTargets(view, dialog);
    await dialog.getByRole('button', { name: 'Avbryt' }).click();
    await expect(dialog).toBeHidden();
    await view.getByRole('button', { name: `Avsluta uppdrag för Lars Lärare` }).click();
    const confirm = view.getByRole('dialog', { name: 'Avsluta uppdrag?' });
    await expectTouchTargets(view, confirm);
    await confirm.getByRole('button', { name: 'Avbryt' }).click();
    await expect(confirm).toBeHidden();
  } finally {
    await context?.close();
  }
  // Elevprovet för en lärare på telefon.
  const probeContext = await browser.newContext(contextOptions(testInfo, true));
  const probe = await probeContext.newPage();
  try {
    await login(probe, 'p3.larare');
    await expect(probe.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
    await expectTouchTargets(probe, probe.locator('#workspace'));
  } finally {
    await probeContext.close();
  }
});

test('utloggning rensar andra flikar', async ({ page }) => {
  await login(page, 'p3.larare');
  await expect(page.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(second.getByText('Du har loggats ut i en annan flik')).toBeVisible();
  await expect(second.locator('body')).not.toContainText(OWN_PUPIL);
  await expect(page.getByRole('link', { name: 'Logga in', exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(OWN_PUPIL);
  const session = await second.request.get('/api/session');
  expect(session.status()).toBe(401);
  const probe = await second.request.get('/api/prov/elev');
  expect(probe.status()).toBe(401);
  expect(await probe.text()).not.toMatch(ANY_PUPIL);
  await second.close();
});

test('nätverkssvar innehåller inga främmande elever', async ({ page, browser }, testInfo) => {
  const cases: { username: string; forbidden: string[]; probes: string[] }[] = [
    { username: 'p3.larare', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], probes: [`?elev=${P12}`, `?elev=${P18}`, `?elev=${P21}`, `?arende=${K11}`, '?q=Syntetisk'] },
    { username: 'p3.admin', forbidden: FOREIGN_PUPILS, probes: [`?elev=${P12}`, `?elev=${P21}`, `?arende=${K12}`] },
    { username: 'p3.elevhalsa.elev', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], probes: [`?elev=${P18}`, `?elev=${P12}`] },
    { username: 'p3.elevhalsa', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], probes: [`?arende=${K12}`, `?elev=${P18}`] },
  ];
  for (const item of cases) {
    const other = await otherUser(browser, testInfo, item.username);
    try {
      await expect(other.page.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
      for (const query of item.probes) {
        const response = await other.page.request.get(`/api/prov/elev${query}`);
        const text = await response.text();
        for (const name of item.forbidden) expect(text, `${item.username} ${query}`).not.toContain(name);
      }
      if (item.username === 'p3.admin') {
        const exported = await other.page.request.get('/api/prov/export');
        expect(exported.status()).toBe(200);
        const csv = await exported.text();
        expect(csv).toContain(OWN_PUPIL);
        for (const name of item.forbidden) expect(csv).not.toContain(name);
      }
      await expectAbsent(other.page, other.bodies, item.forbidden);
    } finally {
      await other.context.close();
    }
  }
  // Rektorns tilldelningsurval innehåller bara den egna skolans elever.
  const bodies = recordApi(page);
  await login(page, 'p3.rektor');
  const dialog = await openGrantDialog(page);
  await dialog.locator('select').first().selectOption({ label: 'Tidsbegränsad support' });
  await expect(dialog.getByLabel(new RegExp(OWN_PUPIL, 'u'))).toBeVisible();
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  await expectAbsent(page, bodies, FOREIGN_PUPILS);
  expect(bodies.join('\n')).toContain(OWN_PUPIL);
});
