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
import { fillKeycloakLogin, loginViaKeycloak, readPilotManifest, waitForHydration, type KeycloakStep, type PilotManifest } from './helpers/keycloak.ts';
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
// Tillfällig grupp 2 i skola 11 med elev 18; skapas och tas bort av gruppsupportprovet.
const G18 = '33000000-0000-4000-8000-000000000318';
const OWN_PUPIL = 'Syntetisk elev 11';
const SCHOOL_ONLY_PUPIL = 'Syntetisk elev 18';
const FOREIGN_PUPILS = ['Syntetisk elev 12', 'Syntetisk elev 21', 'Syntetisk elev 22'];
const RECIPIENT = 'Pia Provmottagare';
// Elevnamn i provet; personalnamn som "Syntetisk elevhälsa" (från API-proven) ska inte träffa.
const ANY_PUPIL = /Syntetisk elev \d/u;

let manifest: PilotManifest;
let passwords: Record<string, string>;
let schoolYear: number;

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

function removeTemporaryGroup(): void {
  psql(manifest, `delete from public.pupil_class_memberships where class_id='${G18}';
    delete from public.mandate_groups where group_id='${G18}';
    delete from public.school_classes where id='${G18}';`);
}

/** Avslutar kvarvarande supportuppdrag för provets supportkonto (ett uppdrag i taget). */
function endSupportMandates(): void {
  psql(manifest, `update public.access_assignments a set ended_at=clock_timestamp()
    from public.memberships m join public.identities i on i.id=m.identity_id
    where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null;`);
}

function removeTemporaryPupil(): void {
  removeTemporaryGroup();
  psql(manifest, `delete from public.mandate_pupils where pupil_id='${P18}';
    delete from public.pupil_placements where pupil_id='${P18}';
    delete from public.pupils where id='${P18}';`);
}
function insertTemporaryPupil(): void {
  psql(manifest, `insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
    select '${P18}','${CUSTOMER}','${ORGANIZER}','${SCHOOL_ONLY_PUPIL}',s.personal_number,'Elev 18'
    from public.synthetic_pupil_numbers s where not exists(select 1 from public.pupils p where p.customer_id='${CUSTOMER}' and p.personal_number=s.personal_number)
    order by s.personal_number limit 1;
    insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
    select public.phase4_probe_uuid('placement:${P18}'),'${CUSTOMER}','${ORGANIZER}','${P18}','${UNIT}',
      public.phase4_probe_uuid('offering:${UNIT}'),make_date(start_year,7,1)
    from public.offerings where id=public.phase4_probe_uuid('offering:${UNIT}');`);
}
function insertTemporaryGroup(): void {
  psql(manifest, `insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
    select '${G18}','${CUSTOMER}','${ORGANIZER}','${UNIT}',id,'PROV-${G18}',start_year
    from public.offerings where id=public.phase4_probe_uuid('offering:${UNIT}');
    insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
    select public.phase4_probe_uuid('member:${G18}:${P18}'),'${CUSTOMER}','${ORGANIZER}','${P18}','${UNIT}','${G18}',id,starts_on
    from public.pupil_placements where pupil_id='${P18}' and unit_id='${UNIT}';`);
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
  schoolYear = Number(psql(manifest, "select extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end;"));
  endSupportMandates();
  removeTemporaryPupil();
  insertTemporaryPupil();
  endRecipientMandates();
});

test.afterAll(() => {
  if (!manifest) return;
  endSupportMandates();
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

type SessionMfa = { mfa: { acr: string | null; amr: string[]; proof: boolean } };

async function sessionMfa(page: Page): Promise<SessionMfa['mfa']> {
  return ((await (await page.request.get('/api/session')).json()) as SessionMfa).mfa;
}

/**
 * Konton med registrerad engångskod anger koden redan vid inloggningen
 * (användarbeslut 2026-09-27); då finns beviset och ingen step-up görs.
 * Step-up görs bara som reserv om beviset saknas.
 */
async function login(page: Page, username: string, requireMfa = false): Promise<KeycloakStep[]> {
  const steps = await loginViaKeycloak(page, username, { password: passwords[username] });
  await waitForHydration(page);
  if (username === 'p3.rektor') await openMandates(page);
  if (!requireMfa) return steps;
  const session = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
  if (session.mfa.amr.includes('otp')) return steps;
  await loginViaKeycloak(page, username, { password: passwords[username], stepUp: true });
  await waitForHydration(page);
  if (username === 'p3.rektor') await openMandates(page);
  const after = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
  expect(after.mfa.amr).toContain('otp');
  return steps;
}

/** Låter serverns MFA-bevis bli äldre än 8 timmar (samma läge som efter en lång arbetsdag). */
function ageMfaProof(email: string): void {
  const changed = psql(manifest, `update public.app_sessions s set auth_time=s.auth_time-interval '9 hours'
    from public.identities i where i.id=s.identity_id and i.email=${sql(email)} and s.revoked_at is null and s.auth_time is not null
    returning s.id;`);
  expect(changed.split('\n').filter(Boolean).length, 'minst en aktiv session fick äldre bevis').toBeGreaterThan(0);
}

/** Registrerar navigeringar till step-up (verifiering med engångskod). */
function recordStepUps(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.url().includes('step_up=1')) seen.push(request.url());
  });
  return seen;
}

function contextOptions(testInfo: TestInfo, phone = false) {
  const use = testInfo.project.use;
  const device = phone ? devices['iPhone 13'] : {
    viewport: use.viewport, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
  };
  return { ...device, baseURL: use.baseURL, locale: 'sv-SE' };
}

async function openMandates(page: Page): Promise<void> {
  const nav = page.locator('[data-sidebar="sidebar"]').filter({ hasText: 'ARBETSYTA' }).last();
  const insideViewport = await nav.count() > 0 && await nav.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.right > 0 && box.left < window.innerWidth;
  }).catch(() => false);
  if (!insideViewport) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  const button = nav.getByRole('button', { name: 'Mandat' });
  await expect(button).toBeAttached();
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
}
function selection(unitId = UNIT) {
  return { schoolYear, unitId, classId: null, educationId: null, grade: null, status: null, page: 1 };
}
function pupil(page: Page, name = OWN_PUPIL) {
  return page.getByRole('button', { name: `${name}, öppna elevkortet` }).filter({ visible: true });
}
async function loaded(page: Page) {
  await expect(page.getByRole('heading', { name: 'Elever', exact: true })).toBeVisible();
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
}
async function searchPupil(page: Page, name: string) {
  await page.getByLabel('Sökord', { exact: true }).fill(name);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/elever/lista' && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
}
async function cardRequest(page: Page, pupilId: string, caseId: string | null = null) {
  const query = new URLSearchParams({ pupilId, schoolYear: String(schoolYear) });
  if (caseId) query.set('caseId', caseId);
  return page.request.get(`/api/elever/elev?${query}`);
}
async function listRequest(page: Page, search = '', caseId: string | null = null) {
  return page.request.post('/api/elever/lista', { headers: { Origin: new URL(page.url()).origin }, data: { selection: selection(), search, caseId } });
}
async function previewRequest(page: Page) {
  return page.request.post('/api/elever/export', { headers: { Origin: new URL(page.url()).origin }, data: { mode: 'preview', export: { mode: 'filter', schoolYear, selection: selection(), search: '', caseId: null, fields: ['id','displayName'], includePersonalNumber: false, protectedIds: [] } } });
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
  const stepUps = recordStepUps(page);
  const since = dbNow();
  // Rektorn har registrerad engångskod: koden efterfrågas vid inloggningen och
  // beviset räcker för tilldelningen utan separat verifiering.
  const steps = await login(page, 'p3.rektor', true);
  bodies.length = 0; // Startvyn är Elever; här granskas bara Mandat-svaret efter navigering.
  expect(steps).toEqual(['password', 'otp']);
  const mfa = await sessionMfa(page);
  expect(mfa).toMatchObject({ acr: '2', amr: ['pwd', 'otp'], proof: true });
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
  expect(stepUps, 'ingen separat verifiering behövdes').toEqual([]);
  await expectAbsent(page, bodies, FOREIGN_PUPILS);
});

test('lärare loggar in utan engångskod', async ({ page }) => {
  const steps = await login(page, 'p3.larare');
  expect(steps).toEqual(['password']);
  expect(await sessionMfa(page)).toMatchObject({ acr: '1', amr: ['pwd'], proof: false });
  await loaded(page);
  await expect(pupil(page)).toBeVisible();
  const list = await listRequest(page);
  expect(list.status()).toBe(200);
  const ids = (await list.json()).pupils.map((item: { id: string }) => item.id) as string[];
  expect(ids).toContain(P11);
  for (const outside of [P12, P18, P21, '44001600-0000-4000-8000-000000000206']) expect(ids).not.toContain(outside);
});

test('elevhälsa med skolscope', async ({ page }) => {
  const network = recordApi(page);
  await login(page, 'p3.elevhalsa.skola');
  await loaded(page);
  await expect(page.locator('.mandate-facts')).toContainText('Syntetisk skola 11');
  await searchPupil(page, 'Syntetisk elev');
  await expect(pupil(page, OWN_PUPIL)).toBeVisible();
  await expect(pupil(page, SCHOOL_ONLY_PUPIL)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportera urval…' })).toHaveCount(0);
  await pupil(page, SCHOOL_ONLY_PUPIL).click();
  await expect(page.locator('.pupil-card')).toContainText('Syntetisk skola 11');
  const foreign = await cardRequest(page, P12);
  expect(foreign.status()).toBe(404);
  const exported = await previewRequest(page);
  expect(exported.status()).toBe(403);
  expect(`${await foreign.text()}${await exported.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, network, FOREIGN_PUPILS);
});

test('elevhälsa med elevscope', async ({ page }) => {
  const network = recordApi(page);
  await login(page, 'p3.elevhalsa.elev');
  await loaded(page);
  await expect(page.locator('.mandate-facts')).toContainText('Syntetisk skola 11');
  await expect(pupil(page)).toBeVisible();
  const list = await listRequest(page);
  expect(list.status()).toBe(200);
  expect((await list.json()).pupils.map((item: { id: string }) => item.id)).toEqual([P11]);
  const sameSchool = await cardRequest(page, P18);
  const foreign = await cardRequest(page, P21);
  expect(sameSchool.status()).toBe(404);
  expect(foreign.status()).toBe(404);
  expect(`${await sameSchool.text()}${await foreign.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, network, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
});

test('elevhälsa med ärendescope', async ({ page }) => {
  const network = recordApi(page);
  await login(page, 'p3.elevhalsa');
  await loaded(page);
  await expect(page.getByText('Välj ett tilldelat ärende för att se den elev ärendet gäller.')).toBeVisible();
  await expect(pupil(page)).toHaveCount(0);
  await page.getByLabel('Tilldelat ärende').selectOption({ label: 'Tilldelat ärende 1' });
  await page.getByRole('button', { name: 'Visa ärendets elev' }).click();
  await expect(pupil(page)).toBeVisible();
  const allowed = await cardRequest(page, P11, K11);
  expect(allowed.status()).toBe(200);
  const direct = await cardRequest(page, P11);
  const otherCase = await cardRequest(page, P11, K12);
  expect(direct.status()).toBe(404);
  expect(otherCase.status()).toBe(404);
  expect(`${await direct.text()}${await otherCase.text()}`).not.toMatch(ANY_PUPIL);
  await expectAbsent(page, network, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
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
  const assignment = mandateCard(page, 'Sam Support', 'Tidsbegränsad support');
  await expect(assignment).toContainText('Syntetisk felsökning');
  await expect(assignment).toContainText('Rut Rektor');
  expect(eventCount('mandate_granted', 'ok', since)).toBe(1);
  const support = await otherUser(browser, testInfo, 'p3.support');
  try {
    const view = support.page;
    await loaded(view);
    const scope = view.locator('.mandate-facts');
    await expect(scope).toContainText('Godkänt av');
    await expect(scope).toContainText('Rut Rektor');
    await expect(scope).toContainText('Syntetisk felsökning');
    const endsAt = Date.parse(await scope.locator('time').getAttribute('datetime') ?? '');
    expect(Math.abs(endsAt - (grantedAt + 15 * 60_000))).toBeLessThan(120_000);
    await expect(pupil(view)).toBeVisible();
    await expect(view.getByRole('button', { name: 'Exportera urval…' })).toHaveCount(0);
    const only = await listRequest(view);
    expect(only.status()).toBe(200);
    expect((await only.json()).pupils.map((item: { id: string }) => item.id)).toEqual([P11]);
    psql(manifest, `update public.access_assignments a set ends_at=clock_timestamp()+interval '6 seconds'
      from public.memberships m join public.identities i on i.id=m.identity_id
      where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`);
    await expect.poll(() => psql(manifest, `select count(*) from public.access_assignments a join public.memberships m on m.id=a.membership_id join public.identities i on i.id=m.identity_id where i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`), { timeout: 20_000 }).toBe('0');
    if (await view.getByRole('button', { name: 'Hämta aktuellt läge' }).isVisible()) await view.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
    await expect(view.getByRole('alertdialog')).toContainText('Uppdraget har upphört vid sin sluttid');
    expect(await view.content()).not.toContain(OWN_PUPIL);
    const after = await cardRequest(view, P11);
    expect(after.status()).toBe(403);
    expect(await after.text()).not.toMatch(ANY_PUPIL);
    await expectAbsent(view, support.bodies, [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS]);
  } finally { await support.context.close(); }
  await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect(mandateCard(page, 'Sam Support', 'Tidsbegränsad support')).toHaveCount(0);
});

test('rektor ger support till grupper som upphör vid sluttid', async ({ page, browser }, testInfo) => {
  const since = dbNow();
  endSupportMandates();
  removeTemporaryGroup();
  insertTemporaryGroup();
  try {
    await login(page, 'p3.rektor', true);
    const dialog = await openGrantDialog(page);
    await dialog.locator('select').first().selectOption({ label: 'Tidsbegränsad support' });
    await dialog.locator('select').nth(1).selectOption({ label: 'Sam Support' });
    const scopeSelect = dialog.getByLabel('Omfattning');
    await expect(scopeSelect.locator('option')).toHaveText(['En namngiven elev', 'En eller flera grupper på en skola']);
    await scopeSelect.selectOption({ label: 'En eller flera grupper på en skola' });
    await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
    await expect(dialog.locator('#grant-selection-error')).toHaveText('Välj minst en grupp.');
    await dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u).check();
    await dialog.getByLabel(/Grupp 2 · Syntetisk skola 11/u).check();
    await dialog.getByLabel('Varaktighet från nu').selectOption('15');
    await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
    const assignment = mandateCard(page, 'Sam Support', 'Tidsbegränsad support');
    await expect(assignment).toContainText('Tilldelade grupper · Syntetisk skola 11');
    expect(eventCount('mandate_granted', 'ok', since)).toBe(1);
    expect(psql(manifest, `select a.scope_kind||'|'||(select count(*) from public.mandate_groups g where g.assignment_id=a.id)
      ||'|'||(select count(*) from public.mandate_pupils p where p.assignment_id=a.id)||'|'||(select count(*) from public.mandate_units u where u.assignment_id=a.id)
      from public.access_assignments a join public.memberships m on m.id=a.membership_id join public.identities i on i.id=m.identity_id
      where i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`)).toBe('group|2|0|1');
    const support = await otherUser(browser, testInfo, 'p3.support');
    try {
      const view = support.page;
      await loaded(view);
      const scope = view.locator('.mandate-facts');
      await expect(scope).toContainText('Tilldelade grupper');
      await expect(scope).toContainText('Rut Rektor');
      await expect(scope).toContainText('Syntetisk felsökning');
      const list = await listRequest(view);
      expect(list.status()).toBe(200);
      const ids = (await list.json()).pupils.map((item: { id: string }) => item.id) as string[];
      expect(ids).toEqual(expect.arrayContaining([P11, P18]));
      for (const outside of [P12, P21, '44001600-0000-4000-8000-000000000206']) expect(ids).not.toContain(outside);
      await expect(view.getByRole('button', { name: 'Exportera urval…' })).toHaveCount(0);
      const exportDenied = await previewRequest(view);
      expect(exportDenied.status()).toBe(403);
      psql(manifest, `delete from public.pupil_class_memberships where class_id='${G18}' and pupil_id='${P18}';`);
      await view.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
      const reduced = await listRequest(view);
      expect(reduced.status()).toBe(200);
      const reducedIds = (await reduced.json()).pupils.map((item: { id: string }) => item.id) as string[];
      expect(reducedIds).toContain(P11);
      expect(reducedIds).not.toContain(P18);
      const outside = await cardRequest(view, P18);
      expect(outside.status()).toBe(404);
      psql(manifest, `update public.access_assignments a set ends_at=clock_timestamp()+interval '6 seconds'
        from public.memberships m join public.identities i on i.id=m.identity_id
        where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`);
      await expect.poll(() => psql(manifest, `select count(*) from public.access_assignments a join public.memberships m on m.id=a.membership_id join public.identities i on i.id=m.identity_id where i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`), { timeout: 20_000 }).toBe('0');
      if (await view.getByRole('button', { name: 'Hämta aktuellt läge' }).isVisible()) await view.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
      await expect(view.getByRole('alertdialog')).toContainText('Uppdraget har upphört vid sin sluttid');
      expect(await view.content()).not.toContain(OWN_PUPIL);
      const after = await cardRequest(view, P11);
      expect(after.status()).toBe(403);
    } finally { await support.context.close(); }
  } finally { endSupportMandates(); removeTemporaryGroup(); }
});

test('IT pausar och provar anslutning utan elevinsyn', async ({ page }, testInfo) => {
  const network = recordApi(page);
  const since = dbNow();
  await login(page, 'p3.it', true);
  await expect(page.getByRole('heading', { name: 'Lokal anslutning', exact: true })).toBeVisible();
  const pause = page.getByRole('button', { name: 'Pausa anslutningen' });
  const activate = page.getByRole('button', { name: 'Aktivera anslutningen' });
  if (await activate.isVisible()) { await activate.click(); await expect(page.getByText('Den lokala anslutningen är aktiv.')).toBeVisible(); }
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
  const nav = page.locator('[data-sidebar="sidebar"]').filter({ hasText: 'ARBETSYTA' }).last();
  if (!(await nav.isVisible())) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await expect(nav.getByRole('button', { name: 'Elever' })).toHaveCount(0);
  if (testInfo.project.name === 'protected-phone') await page.keyboard.press('Escape');
  for (const response of [await listRequest(page), await cardRequest(page, P11), await previewRequest(page)]) {
    expect(response.status()).toBe(403);
    expect(await response.text()).not.toMatch(ANY_PUPIL);
  }
  await expectAbsent(page, network, [ANY_PUPIL]);
});

test('granskaren följer elevläsning, export och nekande', async ({ page, browser }, testInfo) => {
  const since = dbNow();
  const teacher = await otherUser(browser, testInfo, 'p3.larare');
  let read = '';
  let denied = '';
  try {
    await loaded(teacher.page);
    const response = teacher.page.waitForResponse(r => new URL(r.url()).pathname === '/api/elever/elev');
    await pupil(teacher.page).click();
    const allowed = await response;
    expect(allowed.status()).toBe(200);
    read = allowed.headers()['x-correlation-id'];
    await expect(teacher.page.locator('.pupil-card')).toContainText(OWN_PUPIL);
    const foreign = await cardRequest(teacher.page, P12);
    expect(foreign.status()).toBe(404);
    denied = (await foreign.json()).correlationId;
  } finally { await teacher.context.close(); }
  const admin = await otherUser(browser, testInfo, 'p3.admin');
  try {
    await loaded(admin.page);
    await searchPupil(admin.page, OWN_PUPIL);
    await expect(pupil(admin.page)).toBeVisible();
    const preview = admin.page.waitForResponse(r => new URL(r.url()).pathname === '/api/elever/export' && r.request().postDataJSON()?.mode === 'preview');
    await admin.page.getByRole('button', { name: 'Exportera urval…' }).click();
    expect((await preview).status()).toBe(200);
    const dialog = admin.page.getByRole('dialog', { name: 'Exportera elevurval' });
    const download = admin.page.waitForResponse(r => new URL(r.url()).pathname === '/api/elever/export' && r.request().postDataJSON()?.mode === 'download');
    await dialog.getByRole('button', { name: 'Exportera 1 elev (CSV)' }).click();
    expect((await download).status()).toBe(403);
    await expect(dialog).toContainText('Export kräver verifiering med engångskod.');
  } finally { await admin.context.close(); }
  expect(read).toMatch(/^[0-9a-f-]{36}$/u);
  expect(denied).toMatch(/^[0-9a-f-]{36}$/u);
  const network = recordApi(page);
  await login(page, 'p3.granskare');
  await expect(page.getByRole('heading', { name: 'Säkerhetslogg', exact: true })).toBeVisible();
  const table = page.locator('table.audit-table');
  const action = page.getByLabel('Åtgärd');
  const show = page.getByRole('button', { name: 'Visa', exact: true });
  await action.fill('pupil_read'); await show.click();
  const readRow = table.getByRole('row').filter({ hasText: read.slice(0, 8) });
  await expect(readRow).toHaveCount(1);
  await expect(readRow.locator('td').nth(2)).toHaveText('ok');
  const deniedRow = table.getByRole('row').filter({ hasText: denied.slice(0, 8) });
  await expect(deniedRow).toHaveCount(1);
  await expect(deniedRow.locator('td').nth(2)).not.toHaveText('ok');
  await action.fill('pupil_export_preview'); await show.click();
  await expect(table.getByRole('row').filter({ hasText: 'Administratör' }).first()).toBeVisible();
  await action.fill(''); await show.click();
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera CSV' }).click();
  const csv = readFileSync(await (await csvDownload).path(), 'utf8');
  expect(csv).toContain(read);
  expect(csv).toContain(denied);
  expect(csv).toContain('pupil_export_preview');
  expect(csv).not.toMatch(ANY_PUPIL);
  expect(eventCount('log_exported', 'ok', since)).toBeGreaterThanOrEqual(1);
  const forbidden = await cardRequest(page, P11);
  expect(forbidden.status()).toBe(403);
  await expectAbsent(page, network, [ANY_PUPIL]);
});

test('tangentbord och fältfel i tilldelningen', async ({ page }) => {
  const since = dbNow();
  const dialogs: string[] = [];
  page.on('dialog', (browserDialog) => { dialogs.push(browserDialog.type()); void browserDialog.dismiss(); });
  await login(page, 'p3.rektor');
  // Beviset från inloggningen görs äldre än 8 timmar: då krävs verifiering igen.
  ageMfaProof('rektor@phase3.example.test');
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

  // Servern kräver engångskod för tilldelning: verifieringen erbjuds INUTI dialogen
  // (sidan bakom är oåtkomlig medan dialogen är öppen) och inmatningen finns kvar.
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).focus();
  await page.keyboard.press('Enter');
  const notice = dialog.getByRole('alert').filter({ hasText: 'Tilldelning kräver verifiering med engångskod.' });
  await expect(notice).toBeVisible();
  const verify = notice.getByRole('button', { name: 'Verifiera med engångskod' });
  await expect(verify).toBeVisible();
  await expect(fn).toHaveValue('larare');
  await expect(recipient.locator('option:checked')).toHaveText(RECIPIENT);
  await expect(group).toBeChecked();
  expect(eventCount('mandate_granted', 'ok', since)).toBe(0);

  // Verifieringsknappen nås med Tab inom fokusfällan och aktiveras med Enter.
  for (let index = 0; index < 20 && !(await verify.evaluate((element) => element === document.activeElement)); index += 1) {
    await page.keyboard.press('Tab');
    await expectFocusInside(page, dialog);
  }
  await expect(verify).toBeFocused();
  const appOrigin = new URL(page.url()).origin;
  await page.keyboard.press('Enter');
  await page.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
  expect(await fillKeycloakLogin(page, 'p3.rektor', passwords['p3.rektor'])).toEqual(['password', 'otp']);
  await page.waitForURL((url) => url.origin === appOrigin && !url.pathname.startsWith('/api/'));
  await waitForHydration(page);
  await openMandates(page);
  expect((await sessionMfa(page)).proof).toBe(true);
  expect(dialogs, 'ingen lämna-sidan-fråga stoppade verifieringen').toEqual([]);

  // Tillbaka i arbetsytan: tilldelningen görs om med tangentbordet och lyckas.
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  const again = await openGrantDialog(page, true);
  await again.locator('select').first().selectOption({ label: 'Lärare' });
  await again.locator('select').nth(1).selectOption({ label: RECIPIENT });
  const groupAgain = again.getByLabel(/Grupp 1 · Syntetisk skola 11/u);
  await groupAgain.focus();
  await page.keyboard.press('Space');
  await again.getByRole('button', { name: 'Tilldela uppdraget' }).focus();
  await page.keyboard.press('Enter');
  await expect(again).toBeHidden();
  await expect(page.getByText(`Uppdraget har tilldelats ${RECIPIENT}.`)).toBeVisible();
  expect(eventCount('mandate_granted', 'ok', since)).toBe(1);
  // Escape stänger dialogen och fokus återgår till öppningsknappen.
  const closing = await openGrantDialog(page, true);
  await page.keyboard.press('Escape');
  await expect(closing).toBeHidden();
  await expect(open).toBeFocused();
  endRecipientMandates();
});

test('verifiering nås med pekskärm i avslutsdialogen', async ({ page, browser }, testInfo) => {
  const phone = testInfo.project.name === 'protected-phone';
  const context = phone ? null : await browser.newContext(contextOptions(testInfo, true));
  const view = phone ? page : await context!.newPage();
  const since = dbNow();
  try {
    await login(view, 'p3.rektor', true);
    const dialog = await openGrantDialog(view);
    await dialog.locator('select').first().selectOption({ label: 'Lärare' });
    await dialog.locator('select').nth(1).selectOption({ label: RECIPIENT });
    await dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u).tap();
    await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).tap();
    await expect(view.getByText(`Uppdraget har tilldelats ${RECIPIENT}.`)).toBeVisible();

    ageMfaProof('rektor@phase3.example.test');
    await mandateCard(view, RECIPIENT, 'Lärare').getByRole('button', { name: `Avsluta uppdrag för ${RECIPIENT}` }).tap();
    const confirm = view.getByRole('dialog', { name: 'Avsluta uppdrag?' });
    await confirm.getByRole('button', { name: 'Ja, avsluta uppdraget' }).tap();
    const notice = confirm.getByRole('alert').filter({ hasText: 'Att avsluta uppdrag kräver verifiering med engångskod.' });
    await expect(notice).toBeVisible();
    await expectTouchTargets(view, confirm);
    expect(eventCount('assignment_ended', 'ok', since)).toBe(0);
    const appOrigin = new URL(view.url()).origin;
    await notice.getByRole('button', { name: 'Verifiera med engångskod' }).tap();
    await view.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
    expect(await fillKeycloakLogin(view, 'p3.rektor', passwords['p3.rektor'])).toEqual(['password', 'otp']);
    await view.waitForURL((url) => url.origin === appOrigin && !url.pathname.startsWith('/api/'));
    await waitForHydration(view);
    await openMandates(view);
    expect((await sessionMfa(view)).proof).toBe(true);

    // Uppdraget finns kvar tills användaren avslutar det igen efter verifieringen.
    const card = mandateCard(view, RECIPIENT, 'Lärare');
    await expect(card).toHaveCount(1);
    await card.getByRole('button', { name: `Avsluta uppdrag för ${RECIPIENT}` }).tap();
    await view.getByRole('dialog', { name: 'Avsluta uppdrag?' }).getByRole('button', { name: 'Ja, avsluta uppdraget' }).tap();
    await expect(view.getByText(/Uppdraget är avslutat/u)).toBeVisible();
    await expect(mandateCard(view, RECIPIENT)).toHaveCount(0);
    expect(eventCount('assignment_ended', 'ok', since)).toBe(1);
  } finally {
    endRecipientMandates();
    await context?.close();
  }
});

test('pekytor är minst 44 px på telefon', async ({ page, browser }, testInfo) => {
  const phone = testInfo.project.name === 'protected-phone';
  const context = phone ? null : await browser.newContext(contextOptions(testInfo, true));
  const view = phone ? page : await context!.newPage();
  try {
    await login(view, 'p3.rektor');
    await expect(view.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
    await expectTouchTargets(view, view.locator('#workspace'));
    const dialog = await openGrantDialog(view);
    await dialog.locator('select').first().selectOption({ label: 'Lärare' });
    await expect(dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u)).toBeVisible();
    const box = await dialog.boundingBox(); const viewport = view.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1 && box.y >= 0).toBeTruthy();
    await expectTouchTargets(view, dialog);
    await dialog.getByRole('button', { name: 'Avbryt' }).click();
    await view.getByRole('button', { name: 'Avsluta uppdrag för Lars Lärare' }).click();
    const confirm = view.getByRole('dialog', { name: 'Avsluta uppdrag?' });
    await expectTouchTargets(view, confirm);
    await confirm.getByRole('button', { name: 'Avbryt' }).click();
  } finally { await context?.close(); }
  const phoneContext = await browser.newContext(contextOptions(testInfo, true));
  try {
    const studentView = await phoneContext.newPage();
    await login(studentView, 'p3.larare');
    await loaded(studentView);
    await expect(pupil(studentView)).toBeVisible();
    await expectTouchTargets(studentView, studentView.locator('#workspace'));
  } finally { await phoneContext.close(); }
});

test('utloggning rensar andra flikar', async ({ page }) => {
  await login(page, 'p3.larare');
  await loaded(page);
  await expect(pupil(page)).toBeVisible();
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(pupil(second)).toBeVisible();
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(second.getByText('Du har loggats ut i en annan flik')).toBeVisible();
  await expect(second.locator('body')).not.toContainText(OWN_PUPIL);
  const session = await second.request.get('/api/session');
  expect(session.status()).toBe(401);
  const direct = await cardRequest(second, P11);
  expect(direct.status()).toBe(401);
  expect(await direct.text()).not.toMatch(ANY_PUPIL);
  await second.close();
});

test('nätverkssvar innehåller inga främmande elever', async ({ page, browser }, testInfo) => {
  const cases = [
    { username: 'p3.larare', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], ids: [P12, P18, P21] },
    { username: 'p3.admin', forbidden: FOREIGN_PUPILS, ids: [P12, P21] },
    { username: 'p3.elevhalsa.elev', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], ids: [P18, P12] },
    { username: 'p3.elevhalsa', forbidden: [SCHOOL_ONLY_PUPIL, ...FOREIGN_PUPILS], ids: [P18, P12] },
  ];
  for (const item of cases) {
    const other = await otherUser(browser, testInfo, item.username);
    try {
      await loaded(other.page);
      for (const id of item.ids) {
        const response = await cardRequest(other.page, id);
        const text = await response.text();
        for (const name of item.forbidden) expect(text, `${item.username} ${id}`).not.toContain(name);
      }
      const list = await listRequest(other.page, 'Syntetisk');
      const content = await list.text();
      for (const name of item.forbidden) expect(content, item.username).not.toContain(name);
      if (item.username === 'p3.admin') {
        const preview = await previewRequest(other.page);
        expect(preview.status()).toBe(200);
        expect(await preview.text()).not.toMatch(ANY_PUPIL);
      }
      await expectAbsent(other.page, other.bodies, item.forbidden);
    } finally { await other.context.close(); }
  }
  const network = recordApi(page);
  await login(page, 'p3.rektor');
  const dialog = await openGrantDialog(page);
  await dialog.locator('select').first().selectOption({ label: 'Tidsbegränsad support' });
  await expect(dialog.getByLabel(new RegExp(OWN_PUPIL, 'u'))).toBeVisible();
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  await expectAbsent(page, network, FOREIGN_PUPILS);
  expect(network.join('\n')).toContain(OWN_PUPIL);
});
