// Fas 3:s namngivna browsergränser återprovade mot fas 4:s elevregister.
// Endast syntetiska data i det lokala protected-målet med riktig Keycloak-inloggning.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { loginViaKeycloak, readPilotManifest, waitForHydration, type PilotManifest } from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';

const OWN_PUPIL = 'Syntetisk elev 11';
const OWN_ID = '33000000-0000-4000-8000-000000000211';
const FOREIGN_PUPILS = ['Syntetisk elev 12', 'Syntetisk elev 21', 'Syntetisk elev 22'];
const LOG_FAILURE = 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.';
let manifest: PilotManifest;
let passwords: Record<string, string>;
let schoolYear: number;
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => {
  manifest = readPilotManifest();
  try {
    passwords = JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase3-users.json', import.meta.url)), 'utf8'));
    Object.assign(passwords, JSON.parse(readFileSync(fileURLToPath(new URL('../../work/pilot/targets/protected/idp/phase4-users.json', import.meta.url)), 'utf8')));
  } catch { throw new Error('BLOCKED: kör node work/pilot/phase3-browser-fixtures.mjs --target protected'); }
  schoolYear = Number(psql(manifest, "select extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end;"));
  psql(manifest, `update public.access_assignments a set ended_at=clock_timestamp()
    from public.memberships m join public.identities i on i.id=m.identity_id
    where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null;`);
});
async function login(page: Page, username: string, requireMfa = false) {
  await loginViaKeycloak(page, username, { password: passwords[username] });
  await waitForHydration(page);
  if (requireMfa) {
    const session = await (await page.request.get('/api/session')).json() as { mfa: { amr: string[] } };
    if (!session.mfa.amr.includes('otp')) {
      await loginViaKeycloak(page, username, { password: passwords[username], stepUp: true });
      await waitForHydration(page);
    }
  }
  if (username === 'p3.rektor') {
    const nav = await openNavigation(page);
    await nav.getByRole('button', { name: 'Mandat' }).click();
  }
}
function bodies(page: Page): string[] {
  const result: string[] = [];
  page.on('response', response => { if (new URL(response.url()).pathname.startsWith('/api/')) void response.text().then(text => result.push(text), () => undefined); });
  return result;
}
async function noForeign(page: Page, responses: string[]) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  for (const name of FOREIGN_PUPILS) {
    expect(await page.content()).not.toContain(name);
    expect(responses.join('\n')).not.toContain(name);
  }
}
function pupil(page: Page, name = OWN_PUPIL) { return page.getByRole('button', { name: `${name}, öppna elevkortet` }).filter({ visible: true }); }
async function loaded(page: Page) {
  await expect(page.getByRole('heading', { name: 'Elever', exact: true })).toBeVisible();
  await expect(page.locator('.pupil-register')).toHaveAttribute('aria-busy', 'false');
}
async function openNavigation(page: Page): Promise<Locator> {
  const nav = page.locator('[data-sidebar="sidebar"]').filter({ hasText: 'ARBETSYTA' }).last();
  const insideViewport = await nav.count() > 0 && await nav.evaluate(element => {
    const box = element.getBoundingClientRect();
    return box.right > 0 && box.left < window.innerWidth;
  }).catch(() => false);
  if (!insideViewport) await page.getByRole('button', { name: 'Visa eller dölj navigation' }).click();
  await expect(nav).toBeAttached();
  return nav;
}
async function card(page: Page, id = OWN_ID) {
  const response = page.waitForResponse(r => {
    const url = new URL(r.url());
    return url.pathname === '/api/elever/elev' && url.searchParams.get('pupilId') === id;
  });
  await pupil(page).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('.pupil-card')).toContainText(OWN_PUPIL);
}
async function directCard(page: Page, id = OWN_ID, caseId: string | null = null) {
  const query = new URLSearchParams({ pupilId: id, schoolYear: String(schoolYear) });
  if (caseId) query.set('caseId', caseId);
  return page.request.get(`/api/elever/elev?${query}`);
}

test('rektor tilldelar och avslutar uppdrag via formuläret', async ({ page }, testInfo) => {
  const responses = bodies(page);
  await login(page, 'p3.rektor', true);
  await expect(page.getByRole('heading', { name: 'Mandat', exact: true })).toBeVisible();
  const nav = await openNavigation(page);
  await expect(nav.getByRole('button', { name: 'Elever' })).toBeVisible();
  if (testInfo.project.name === 'phase3-phone') await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Lars Lärare' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Elin Elevhälsa' })).toBeVisible();
  await page.getByRole('button', { name: 'Tilldela uppdrag' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await expect(dialog).toBeVisible();
  const recipient = dialog.locator('select').nth(1);
  expect(await recipient.locator('option').allTextContents()).not.toContain('Rut Rektor');
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Rätta de markerade fälten');
  await dialog.locator('select').first().selectOption({ label: 'Lärare' });
  await recipient.selectOption({ label: 'Pia Provmottagare' });
  await dialog.getByLabel(/Grupp 1 · Syntetisk skola 11/u).check();
  await dialog.getByRole('button', { name: 'Tilldela uppdraget' }).click();
  await expect(dialog).toBeHidden();
  const assignment = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Pia Provmottagare' }) });
  await expect(assignment).toContainText('Tilldelade grupper · Syntetisk skola 11');
  await assignment.getByRole('button', { name: 'Avsluta uppdrag för Pia Provmottagare' }).click();
  await page.getByRole('dialog', { name: 'Avsluta uppdrag?' }).getByRole('button', { name: 'Ja, avsluta uppdraget' }).click();
  await expect(assignment).toHaveCount(0);
  await noForeign(page, responses);
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
  const assignment = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Sam Support' }) }).filter({ hasText: 'Tidsbegränsad support' });
  await expect(assignment).toHaveCount(1);
  await expect(assignment).toContainText('Syntetisk felsökning');
  await expect(assignment).toContainText('Rut Rektor');
});

test('support ser godkännare och sluttid, innehållet töms vid utgång', async ({ page }) => {
  const responses = bodies(page);
  await login(page, 'p3.support');
  await loaded(page);
  await expect(page.getByText('Godkänt av')).toBeVisible();
  await expect(page.getByText('Rut Rektor')).toBeVisible();
  await expect(page.getByText('Syntetisk felsökning')).toBeVisible();
  await expect(pupil(page)).toBeVisible();
  await card(page);
  await expect(page.getByRole('button', { name: 'Exportera urval…' })).toHaveCount(0);
  await noForeign(page, responses);
  psql(manifest, `update public.access_assignments a set ends_at=clock_timestamp()+interval '6 seconds'
    from public.memberships m join public.identities i on i.id=m.identity_id
    where a.membership_id=m.id and i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`);
  await page.getByRole('button', { name: 'Tillbaka till elevlistan' }).click();
  await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect.poll(() => psql(manifest, `select count(*) from public.access_assignments a
    join public.memberships m on m.id=a.membership_id join public.identities i on i.id=m.identity_id
    where i.email='support@phase3.example.test' and a.function='support' and a.ended_at is null and a.ends_at>clock_timestamp();`), { timeout: 20_000 }).toBe('0');
  if (await page.getByRole('button', { name: 'Hämta aktuellt läge' }).isVisible()) await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/Uppdraget har upphört vid sin sluttid|Kontexten ändrades i en annan flik/u, { timeout: 20_000 });
  expect(await page.content()).not.toContain(OWN_PUPIL);
  const denied = await directCard(page);
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain(OWN_PUPIL);
});

test('lärare ser endast egen grupp och loggfel stoppar läsningen', async ({ page }) => {
  const responses = bodies(page);
  await login(page, 'p3.larare');
  await loaded(page);
  await expect(page.locator('.mandate-facts')).toContainText('Tilldelade grupper');
  await expect(pupil(page)).toBeVisible();
  await noForeign(page, responses);
  try {
    psql(manifest, 'revoke insert on public.security_events from skolplattform_worker;');
    await page.getByRole('button', { name: 'Hämta aktuellt läge' }).click();
    await expect(page.getByRole('alert')).toContainText(LOG_FAILURE);
  } finally { psql(manifest, 'grant insert on public.security_events to skolplattform_worker;'); }
  await expect(pupil(page)).toHaveCount(0);
  expect(await page.content()).not.toContain(OWN_PUPIL);
  await page.getByRole('button', { name: 'Försök igen' }).click();
  await expect(pupil(page)).toBeVisible();
});

test('elevhälsa med ärendescope ser elev endast genom tilldelat ärende', async ({ page }) => {
  const responses = bodies(page);
  await login(page, 'p3.elevhalsa');
  await loaded(page);
  await expect(page.getByText('Välj ett tilldelat ärende för att se den elev ärendet gäller.')).toBeVisible();
  await expect(pupil(page)).toHaveCount(0);
  await page.getByLabel('Tilldelat ärende').selectOption({ label: 'Tilldelat ärende 1' });
  await page.getByRole('button', { name: 'Visa ärendets elev' }).click();
  await expect(pupil(page)).toBeVisible();
  const direct = await directCard(page);
  expect(direct.status()).toBe(404);
  await noForeign(page, responses);
});

test('skoladministratör exporterar det kontrollerade urvalet', async ({ page }) => {
  await login(page, 'p4.admin.skyddad', true);
  await loaded(page);
  await page.getByLabel('Sökord', { exact: true }).fill(OWN_PUPIL);
  await page.getByRole('button', { name: 'Sök elever', exact: true }).click();
  await expect(pupil(page)).toBeVisible();
  await page.getByRole('button', { name: 'Exportera urval…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportera elevurval' });
  await expect(dialog).toBeVisible();
  const count = Number((await dialog.getByRole('button', { name: /^Exportera \d+ elev/u }).innerText()).match(/\d+/u)?.[0]);
  expect(count).toBeGreaterThan(0);
  const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/elever/export' && r.request().postDataJSON()?.mode === 'download');
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: /^Exportera \d+ elev/u }).click();
  expect((await response).status()).toBe(200);
  const content = readFileSync(await (await download).path(), 'utf8');
  expect(content).toContain('elev_id;namn');
  expect(content).toContain(OWN_PUPIL);
  for (const name of FOREIGN_PUPILS) expect(content).not.toContain(name);
});

test('IT pausar, aktiverar och provar anslutningen utan elevdata', async ({ page }) => {
  const responses = bodies(page);
  await login(page, 'p3.it', true);
  await expect(page.getByRole('heading', { name: 'Lokal anslutning', exact: true })).toBeVisible();
  const toggle = page.getByRole('button', { name: /anslutningen$/u }).first();
  const before = await toggle.innerText();
  await toggle.click();
  await expect(page.getByText(/Den lokala anslutningen är (aktiv|pausad)\./u)).toBeVisible();
  const after = page.getByRole('button', { name: /(Pausa|Aktivera) anslutningen/u });
  await expect(after).not.toHaveText(before);
  if ((await after.innerText()).startsWith('Aktivera')) await after.click();
  await page.getByRole('button', { name: 'Kör syntetiskt test' }).click();
  await expect(page.getByText('Det syntetiska testet lyckades. Ingen verklig kommunanslutning har testats.')).toBeVisible();
  const nav = await openNavigation(page);
  await expect(nav.getByRole('button', { name: 'Elever' })).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain(OWN_PUPIL);
  expect(responses.join('\n')).not.toContain('Syntetisk elev');
});

test('huvudman ser rektorsmandatet och kan bara tilldela rektor', async ({ page }) => {
  await login(page, 'p3.huvudman', true);
  const assignment = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Rut Rektor' }) });
  await expect(assignment).toContainText('Skola · Syntetisk skola 11');
  await page.getByRole('button', { name: 'Tilldela uppdrag' }).click();
  const dialog = page.getByRole('dialog', { name: 'Tilldela uppdrag' });
  await expect(dialog.locator('select').first().locator('option')).toHaveText(['Välj uppdrag', 'Rektor']);
  await dialog.getByRole('button', { name: 'Avbryt' }).click();
  expect(await page.locator('body').innerText()).not.toContain(OWN_PUPIL);
});

test('utloggning i en flik rensar elevprovet i andra flikar', async ({ page }) => {
  await login(page, 'p3.larare');
  await expect(pupil(page)).toBeVisible();
  const second = await page.context().newPage();
  await second.goto('/');
  await expect(pupil(second)).toBeVisible();
  await page.getByRole('button', { name: 'Logga ut' }).click();
  await expect(second.getByText('Du har loggats ut i en annan flik')).toBeVisible();
  expect(await second.content()).not.toContain(OWN_PUPIL);
  await second.close();
});
