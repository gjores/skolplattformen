import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  loginViaKeycloak,
  readPilotManifest,
  waitForHydration,
  type PilotManifest,
} from './helpers/keycloak.ts';
import { psql } from './helpers/pilot-db.ts';

const SUBJECT = {
  anna: '30000000-0000-4000-8000-000000000001',
  bertil: '30000000-0000-4000-8000-000000000002',
  gustav: '30000000-0000-4000-8000-000000000008',
};
let manifest: PilotManifest;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  manifest = readPilotManifest();
});

function skipBuilt(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name === 'protected-built',
    'Provas i devprojekten.',
  );
}

async function login(page: Page, username: string): Promise<void> {
  await loginViaKeycloak(page, username);
  await waitForHydration(page);
}

async function optionValue(page: Page, text: string): Promise<string> {
  const option = page.locator('#uppdrag option').filter({ hasText: text });
  await expect(option).toHaveCount(1);
  return (await option.getAttribute('value')) ?? '';
}

async function session(page: Page): Promise<{
  assignments: Array<{ customerName: string }>;
  context: { customerName: string } | null;
  epoch: number;
}> {
  const response = await page.request.get('/api/session');
  expect(response.status()).toBe(200);
  return response.json();
}

test('startsidan kräver inloggning och visar inget exempelinnehåll', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await waitForHydration(page);
  await expect(
    page.getByRole('link', { name: 'Logga in', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Exempelskola', { exact: true })).toHaveCount(0);
  expect(
    requests.filter((url) => /\/rest\/v1\/|\/auth\/v1\//u.test(url)),
  ).toEqual([]);
});

test('inloggning med engångskod ger arbetskontext i sidhuvudet', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'anna.admin');
  await expect(page.locator('.demo-pill')).toHaveText('Skyddad provmiljö');
  await expect(page.locator('.context-label')).toHaveText(
    'Provkund A · Kundadministration',
  );
  await expect(page.locator('select#uppdrag')).toHaveCount(0);
  if (testInfo.project.name === 'protected-phone') {
    await page
      .getByRole('button', { name: 'Visa eller dölj navigation' })
      .click();
  }
  await expect(
    page.getByRole('button', { name: 'Kundadministration', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Säkerhetslogg', exact: true }),
  ).toHaveCount(0);
  expect((await session(page)).context?.customerName).toBe('Provkund A');
});

test('uppdragsväljaren skiljer giltiga, kommande och avslutade', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'frida.uppdrag');
  const select = page.locator('select#uppdrag');
  await expect(select).toBeVisible();
  await expect(
    select.locator('optgroup[label="Gäller idag"] option'),
  ).toHaveCount(1);
  await expect(
    select.locator('optgroup[label="Gäller idag"] option'),
  ).toBeEnabled();
  await expect(select.locator('optgroup[label="Kommande"] option')).toHaveCount(
    1,
  );
  await expect(
    select.locator('optgroup[label="Kommande"] option'),
  ).toBeDisabled();
  await expect(
    select.locator('optgroup[label="Kommande"] option'),
  ).toContainText('(från ');
  await expect(
    select.locator('optgroup[label="Avslutade"] option'),
  ).toHaveCount(1);
  await expect(
    select.locator('optgroup[label="Avslutade"] option'),
  ).toBeDisabled();
  await expect(
    select.locator('optgroup[label="Avslutade"] option'),
  ).toContainText('(till ');
});

test('kontextbyte sker utan ny inloggning', async ({ page }, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'hanna.tva');
  const realms: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/realms/')) realms.push(request.url());
  });

  const assignmentId = await optionValue(page, 'Provkund B');
  await page.locator('#uppdrag').selectOption(assignmentId);
  await expect(page.locator('#uppdrag option:checked')).toContainText(
    'Provkund B · Kundadministration',
  );
  await expect(
    page.getByRole('heading', { name: 'Kundadministration' }),
  ).toBeVisible();
  await expect(page.getByText('Hantera Provkund B')).toBeVisible();
  expect(realms).toEqual([]);
  const current = await session(page);
  expect(current.context?.customerName).toBe('Provkund B');
  expect(current.epoch).toBe(2);
});

test('byte i en flik låser och rensar andra flikar', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  // Desktop kör även med BroadcastChannel avstängd och bevisar därmed
  // localStorage-reserven; WebKit-projektet bevisar den ordinarie kanalen.
  if (testInfo.project.name === 'protected-desktop') {
    await page.context().addInitScript(() => {
      Object.defineProperty(window, 'BroadcastChannel', {
        value: undefined,
        configurable: true,
      });
    });
  }
  await login(page, 'hanna.tva');
  const page2 = await page.context().newPage();
  await page2.goto('/');
  await waitForHydration(page2);
  const assignmentId = await optionValue(page, 'Provkund B');
  await page.locator('#uppdrag').selectOption(assignmentId);

  const lock = page2.getByRole('alertdialog');
  await expect(lock).toContainText('Kontexten ändrades i en annan flik');
  await expect(
    page2.locator('main#workspace table, main#workspace .og-unit-switch'),
  ).toHaveCount(0);
  await lock.getByRole('button', { name: 'Ladda om' }).click();
  await expect(
    page2.getByRole('heading', { name: 'Kundadministration' }),
  ).toBeVisible();
  await expect(page2.locator('#uppdrag option:checked')).toContainText(
    'Provkund B',
  );
});

test('utloggning låser andra flikar och avslutar sessionen', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'anna.admin');
  const page2 = await page.context().newPage();
  await page2.goto('/');
  await waitForHydration(page2);
  await page.getByRole('button', { name: 'Logga ut', exact: true }).click();
  await expect(page2.getByRole('alertdialog')).toContainText(
    'Du har loggats ut i en annan flik',
  );
  const response = await page2.request.get('/api/session');
  expect(response.status()).toBe(401);
  await page.waitForURL(
    (url) =>
      url.pathname.includes('/realms/skolplattform-test/') ||
      url.origin === new URL(testInfo.project.use.baseURL as string).origin,
  );
});

test('återkomst till fliken efter lång frånvaro kräver ny inloggning (glidande livstid)', async ({
  page,
}, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'gustav.sparr');
  psql(
    manifest,
    `update public.app_sessions set expires_at=now() - interval '1 minute'
     where identity_id='${SUBJECT.gustav}' and revoked_at is null;`,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow')),
  );
  await expect(
    page.getByRole('link', { name: 'Logga in', exact: true }),
  ).toBeVisible();
});

test('osparat varnas före byte', async ({ page }, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'hanna.tva');
  const customerB = await optionValue(page, 'Provkund B');
  await page.locator('#uppdrag').selectOption(customerB);
  await expect(
    page.getByRole('heading', { name: 'Kundadministration' }),
  ).toBeVisible();
  await page
    .getByRole('heading', { name: 'Bjud in' })
    .locator('..')
    .getByLabel('Namn')
    .fill('Osparat prov');

  let dialogText = '';
  page.once('dialog', async (dialog) => {
    dialogText = dialog.message();
    await dialog.dismiss();
  });
  const customerA = await optionValue(page, 'Provkund A');
  await page.locator('#uppdrag').focus();
  await page.locator('#uppdrag').selectOption(customerA);
  await expect.poll(() => dialogText).toContain('Du har osparade ändringar');
  await expect(page.locator('#uppdrag option:checked')).toContainText(
    'Provkund B',
  );
  await expect(page.locator('#uppdrag')).toBeFocused();
});
