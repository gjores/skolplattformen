// Fas 3 (03-05): mandat- och elevprovsflöden i byggd protected-Worker med riktig
// OIDC-inloggning (lokal Keycloak) på dator och telefon. Endast syntetiska data.
// Konton och mandat skapas av work/pilot/phase3-browser-fixtures.mjs; lösenord
// läses från den gitignorerade målkatalogen och skrivs aldrig ut.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';

const LOG_FAILURE = 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.';
const OWN_PUPIL = 'Syntetisk elev 11';
const FOREIGN_PUPILS = ['Syntetisk elev 12', 'Syntetisk elev 21', 'Syntetisk elev 22'];
let manifest: PilotManifest;
let passwords: Record<string, string>;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  manifest = readPilotManifest();
  try {
    passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8')) as Record<string, string>;
  } catch {
    throw new Error('BLOCKED: kör node work/pilot/phase3-browser-fixtures.mjs --target protected');
  }
});

async function login(page: Page, username: string, requireMfa = false): Promise<void> {
  await loginViaKeycloak(page, username, { password: passwords[username] });
  await waitForHydration(page);
  if (!requireMfa) return;
  const session = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
  if (session.mfa.amr.includes('otp')) return;
  await loginViaKeycloak(page, username, { password: passwords[username], stepUp: true });
  await waitForHydration(page);
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

async function expectNoForeignPupils(page: Page, bodies: string[]): Promise<void> {
  const dom = await page.content();
  for (const name of FOREIGN_PUPILS) {
    expect(dom).not.toContain(name);
    expect(bodies.join('\n')).not.toContain(name);
  }
}

async function expectPhoneLayout(page: Page, scope: Locator): Promise<void> {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
  const small = await scope.locator('button, select, label.mandate-check').evaluateAll((elements) => elements
    .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
    .map((element) => ({ text: element.textContent?.trim().slice(0, 40), height: element.getBoundingClientRect().height }))
    .filter((item) => item.height < 44));
  expect(small).toEqual([]);
}

async function openNavigation(page: Page): Promise<Locator> {
  const trigger = page.getByRole('button', { name: 'Visa eller dölj navigation' });
  const nav = page.locator('[data-sidebar="sidebar"]').filter({ hasText: 'ARBETSYTA' }).last();
  if (!(await nav.isVisible())) await trigger.click();
  await expect(nav).toBeVisible();
  return nav;
}

test('rektor tilldelar och avslutar uppdrag via formuläret', async ({ page }, testInfo) => {
  const bodies = recordApi(page);
  await login(page, 'p3.rektor', true);
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  const nav = await openNavigation(page);
  await expect(nav.getByRole('button', { name: 'Syntetiskt elevprov' })).toBeVisible();
  if (testInfo.project.name === 'phase3-phone') await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elin Elevhälsa' })).toBeVisible();

  const open = page.getByRole('button', { name: 'Tilldela uppdrag' });
  await open.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await expect(dialog).toBeVisible();
  const recipient = dialog.locator('select').nth(1);
  await expect(recipient).toBeVisible();
  expect(await recipient.locator('option').allTextContents()).not.toContain('Rut Rektor');

  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Rätta de markerade fälten');
  await expect(dialog.locator('select').first()).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByText('Välj mottagare.')).toBeVisible();

  await dialog.locator('select').first().selectOption({ label: 'Lärare' });
  await recipient.selectOption({ label: 'Pia Provmottagare' });
  await dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u).check();
  if (testInfo.project.name === 'phase3-phone') {
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize();
    expect(box && viewport && box.x >= 0 && box.x + box.width <= viewport.width + 1).toBeTruthy();
    await expectPhoneLayout(page, dialog);
  }
  await page.screenshot({ path: testInfo.outputPath('tilldelning.png') });
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Uppdraget har tilldelats Pia Provmottagare.')).toBeVisible();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pia Provmottagare' }) });
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Tilldelade grupper · Syntetisk skola 11');

  await card.getByRole('button', { name: 'Avsluta uppdrag för Pia Provmottagare' }).click();
  const confirm = page.getByRole('dialog', { name: 'Avsluta uppdrag?' });
  await expect(confirm).toContainText('Pia Provmottagare förlorar uppdraget Lärare för Syntetisk skola 11');
  await confirm.getByRole('button', { name: 'Ja, avsluta uppdraget' }).click();
  await expect(page.getByText(/Uppdraget är avslutat/u)).toBeVisible();
  await expect(card).toHaveCount(0);
  if (testInfo.project.name === 'phase3-phone') await expectPhoneLayout(page, page.locator('#workspace'));
  await expectNoForeignPupils(page, bodies);
});

test('rektor godkänner tidsbegränsad support för en elev', async ({ page }) => {
  await login(page, 'p3.rektor', true);
  await page.getByRole('button', { name: 'Tilldela uppdrag' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await dialog.locator('select').first().selectOption({ label: 'Tidsbegränsad support' });
  await dialog.locator('select').nth(1).selectOption({ label: 'Sam Support' });
  await dialog.getByLabel(new RegExp(OWN_PUPIL, 'u')).check();
  await dialog.getByLabel('Varaktighet från nu').selectOption('15');
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(page.getByText('Uppdraget har tilldelats Sam Support.')).toBeVisible();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Sam Support' }) }).filter({ hasText: 'Tidsbegränsad support' });
  // Endast det pågående uppdraget listas; tidigare utgångna supportuppdrag visas inte som giltiga.
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Syntetisk felsökning');
  await expect(card).toContainText('Rut Rektor');
});

test('support ser godkännare och sluttid, innehållet töms vid utgång', async ({ page }, testInfo) => {
  const bodies = recordApi(page);
  await login(page, 'p3.support');
  await expect(page.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
  await expect(page.getByText('Godkänt av')).toBeVisible();
  await expect(page.getByText('Rut Rektor')).toBeVisible();
  await expect(page.getByText('Syntetisk felsökning')).toBeVisible();
  await expect(page.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  await page.getByRole('button', { name: `Visa ${OWN_PUPIL}` }).click();
  await expect(page.locator('.probe-detail')).toContainText('Syntetisk skola 11');
  await expect(page.getByRole('button', { name: 'Exportera urvalet (CSV)' })).toHaveCount(0);
  if (testInfo.project.name === 'phase3-phone') await expectPhoneLayout(page, page.locator('#workspace'));
  await page.screenshot({ path: testInfo.outputPath('support-elevprov.png'), fullPage: true });
  await expectNoForeignPupils(page, bodies);

  // Kortar endast detta syntetiska supportuppdrag; varaktigheten förblir giltig.
  psql(manifest, `update public.access_assignments a set ends_at=clock_timestamp()+interval '6 seconds'
    from public.memberships m join public.identities i on i.id=m.identity_id
    where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`);
  await page.getByRole('button', { name: 'Hämta aktuellt urval' }).click();
  await expect(page.locator('.probe-detail')).toHaveCount(0);
  await expect(page.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Uppdraget har upphört vid sin sluttid', { timeout: 15_000 });
  expect(await page.content()).not.toContain(OWN_PUPIL);
  const after = await page.request.get('/api/prov/elev');
  expect(after.status()).toBe(403);
  expect(await after.text()).not.toContain(OWN_PUPIL);
});

test('lärare ser endast egen grupp och loggfel stoppar läsningen', async ({ page }, testInfo) => {
  const bodies = recordApi(page);
  await login(page, 'p3.larare');
  await expect(page.getByRole('heading', { name: 'Syntetiskt elevprov', exact: true })).toBeVisible();
  await expect(page.getByText('Tilldelade grupper · Syntetisk skola 11')).toBeVisible();
  await expect(page.getByRole('heading', { name: OWN_PUPIL })).toHaveCount(1);
  await expect(page.locator('.probe-list > li')).toHaveCount(1);
  await expect(page.locator('.probe-list > li')).toContainText('Syntetisk skola 11 · 1 grupp');
  await expectNoForeignPupils(page, bodies);
  if (testInfo.project.name === 'phase3-phone') await expectPhoneLayout(page, page.locator('#workspace'));
  try {
    psql(manifest, 'revoke insert on public.security_events from skolplattform_worker;');
    await page.getByRole('button', { name: 'Hämta aktuellt urval' }).click();
    await expect(page.getByRole('alert')).toContainText(LOG_FAILURE);
    await expect(page.getByRole('alert')).toContainText('Referens:');
  } finally {
    psql(manifest, 'grant insert on public.security_events to skolplattform_worker;');
  }
  await expect(page.locator('.probe-list > li')).toHaveCount(0);
  expect(await page.content()).not.toContain(OWN_PUPIL);
  await page.getByRole('button', { name: 'Hämta aktuellt urval' }).click();
  await expect(page.locator('.probe-list').getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
});

test('elevhälsa med ärendescope ser elev endast genom tilldelat ärende', async ({ page }) => {
  const bodies = recordApi(page);
  await login(page, 'p3.elevhalsa');
  await expect(page.getByText('Tilldelade ärenden · Syntetisk skola 11')).toBeVisible();
  await expect(page.getByText('Välj ett tilldelat ärende')).toBeVisible();
  await expect(page.locator('.probe-list > li')).toHaveCount(0);
  await page.getByLabel('Tilldelat ärende').selectOption({ label: 'Tilldelat ärende 1 · Syntetisk skola 11' });
  await page.getByRole('button', { name: 'Visa ärendets elev' }).click();
  await expect(page.locator('.probe-detail')).toContainText(OWN_PUPIL);
  await expectNoForeignPupils(page, bodies);
});

test('skoladministratör exporterar det kontrollerade urvalet', async ({ page }) => {
  await login(page, 'p3.admin');
  await expect(page.getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportera urvalet (CSV)' }).click();
  const file = await download;
  const content = readFileSync(await file.path(), 'utf8');
  expect(content).toContain('elev_id;namn;skolenhet_id;grupp_id');
  expect(content).toContain(OWN_PUPIL);
  for (const name of FOREIGN_PUPILS) expect(content).not.toContain(name);
  await expect(page.getByText('Exporten av det syntetiska urvalet är klar.')).toBeVisible();
});

test('IT pausar, aktiverar och provar anslutningen utan elevdata', async ({ page }, testInfo) => {
  const bodies = recordApi(page);
  await login(page, 'p3.it', true);
  await expect(page.getByRole('heading', { name: 'Lokal anslutning', exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: /anslutningen$/u }).first();
  const before = await toggle.innerText();
  await toggle.click();
  await expect(page.getByText(/Den lokala anslutningen är (aktiv|pausad)\./u)).toBeVisible();
  const after = page.getByRole('button', { name: /(Pausa|Aktivera) anslutningen/u });
  await expect(after).not.toHaveText(before);
  if ((await after.innerText()).startsWith('Aktivera')) {
    await after.click();
    await expect(page.getByText('Den lokala anslutningen är aktiv.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Kör syntetiskt test' }).click();
  await expect(page.getByText('Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.')).toBeVisible();
  const nav = await openNavigation(page);
  await expect(nav.getByRole('button', { name: 'Syntetiskt elevprov' })).toHaveCount(0);
  if (testInfo.project.name === 'phase3-phone') await page.keyboard.press('Escape');
  expect(await page.content()).not.toContain('Syntetisk elev');
  expect(bodies.join('\n')).not.toContain('Syntetisk elev');
});

test('huvudman ser rektorsmandatet och kan bara tilldela rektor', async ({ page }) => {
  await login(page, 'p3.huvudman', true);
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Rut Rektor' }) });
  await expect(card).toContainText('Skola · Syntetisk skola 11');
  await page.getByRole('button', { name: 'Tilldela uppdrag' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await expect(dialog.locator('select').first().locator('option')).toHaveText(['Välj uppdrag', 'Rektor']);
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.content()).not.toContain('Syntetisk elev');
});

test('utloggning i en flik rensar elevprovet i andra flikar', async ({ page }) => {
  await login(page, 'p3.larare');
  await expect(page.getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(second.getByRole('heading', { name: OWN_PUPIL })).toBeVisible();
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(second.getByText('Du har loggats ut i en annan flik')).toBeVisible();
  expect(await second.content()).not.toContain(OWN_PUPIL);
  await second.close();
});
