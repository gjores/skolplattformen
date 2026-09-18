import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import {
  fillKeycloakLogin,
  loginInNewContext,
  loginViaKeycloak,
  readPilotManifest,
  waitForHydration,
  type PilotManifest,
} from './helpers/keycloak.ts';
import {
  cleanupOrganizersLike,
  countEvents,
  psql,
  unblockMembership,
} from './helpers/pilot-db.ts';

const SUBJECT = {
  anna: '30000000-0000-4000-8000-000000000001',
  bertil: '30000000-0000-4000-8000-000000000002',
  erik: '30000000-0000-4000-8000-000000000006',
  gustav: '30000000-0000-4000-8000-000000000008',
};
const MEMBERSHIP = {
  gustav: '40000000-0000-4000-8000-000000000008',
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

function skipUnlessBuilt(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name !== 'protected-built',
    'Provas mot byggd Worker.',
  );
}

async function login(page: Page, username: string, requireMfa = false): Promise<void> {
  await loginViaKeycloak(page, username);
  await waitForHydration(page);
  if (requireMfa) await ensureMfa(page, username);
}

async function optionValue(page: Page, text: string): Promise<string> {
  const option = page.locator('#uppdrag option').filter({ hasText: text });
  await expect(option).toHaveCount(1);
  return (await option.getAttribute('value')) ?? '';
}

async function session(page: Page): Promise<{
  assignments: Array<{ customerName: string }>;
  context: { customerName: string } | null;
  mfa: { amr: string[] };
  epoch: number;
}> {
  const response = await page.request.get('/api/session');
  expect(response.status()).toBe(200);
  return response.json();
}

async function ensureMfa(page: Page, username: string): Promise<void> {
  if ((await session(page)).mfa.amr.includes('otp')) return;
  await loginViaKeycloak(page, username, { stepUp: true });
  await waitForHydration(page);
  expect((await session(page)).mfa.amr).toContain('otp');
}

async function waitForWorkspace(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}

function formByHeading(page: Page, heading: string): Locator {
  return page.getByRole('heading', { name: heading, exact: true }).locator('..');
}

async function memberRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1);
  return row;
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
  await login(page, 'anna.admin', true);
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

test('administrativ åtgärd utan engångskod erbjuder verifiering', async ({ page }, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'ivar.utan-otp');
  await waitForWorkspace(page, 'Kundadministration');
  const row = await memberRow(page, 'Gustav Spärr');
  await row.getByRole('button', { name: 'Spärra', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.getByLabel('Orsak').fill('Browserprov utan MFA');
  await page.getByRole('button', { name: 'Spärra', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText(
    'Åtgärden kräver verifiering med engångskod.',
  );
  const verify = page.getByRole('button', { name: 'Verifiera med engångskod' });
  await expect(verify).toBeVisible();
  expect(
    psql(manifest, `select status from public.memberships where id='${MEMBERSHIP.gustav}';`),
  ).toBe('active');
  await verify.click();
  await page.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
});

test('spärr under öppen session stoppar nästa åtgärd', async ({ browser }, testInfo) => {
  skipBuilt(testInfo);
  const baseURL = testInfo.project.use.baseURL as string;
  const gustav = await loginInNewContext(browser, baseURL, 'gustav.sparr');
  const anna = await loginInNewContext(browser, baseURL, 'anna.admin');
  try {
    await waitForWorkspace(gustav.page, 'Säkerhetslogg');
    await ensureMfa(anna.page, 'anna.admin');
    await waitForWorkspace(anna.page, 'Kundadministration');
    const row = await memberRow(anna.page, 'Gustav Spärr');
    await row.getByRole('button', { name: 'Spärra', exact: true }).click();
    await anna.page.getByLabel('Orsak').fill('Öppen session i browserprov');
    await anna.page.getByRole('button', { name: 'Spärra', exact: true }).last().click();
    await expect(anna.page.getByText('Medlemskapet är spärrat.', { exact: true })).toBeVisible();

    await gustav.page.getByRole('button', { name: 'Visa', exact: true }).click();
    await expect(gustav.page.getByRole('link', { name: 'Logga in', exact: true })).toBeVisible();
    expect((await gustav.page.request.get('/api/kund/oversikt')).status()).toBe(401);
  } finally {
    unblockMembership(manifest, MEMBERSHIP.gustav);
    await Promise.all([gustav.context.close(), anna.context.close()]);
  }
});

test('samma e-post hos två kunder blandas inte', async ({ browser }, testInfo) => {
  skipBuilt(testInfo);
  const baseURL = testInfo.project.use.baseURL as string;
  const a = await loginInNewContext(browser, baseURL, 'cecilia.a');
  const b = await loginInNewContext(browser, baseURL, 'cecilia.b');
  try {
    await expect(a.page.locator('.context-label')).toContainText('Provkund A');
    await expect(b.page.locator('.context-label')).toContainText('Provkund B');
    expect(
      Number(
        psql(
          manifest,
          "select count(*) from public.identities where email='cecilia@example.test';",
        ),
      ),
    ).toBe(2);
    expect((await session(a.page)).assignments).toHaveLength(1);
    expect((await session(b.page)).assignments).toHaveLength(1);
    await expect(a.page.locator('.context-label')).not.toContainText('Provkund B');
  } finally {
    await Promise.all([a.context.close(), b.context.close()]);
  }
});

test('första skyddade ändringen är spårbar för granskaren', async ({ browser }, testInfo) => {
  skipBuilt(testInfo);
  const baseURL = testInfo.project.use.baseURL as string;
  const prefix = `E2E-huvudman ${Date.now()}`;
  const anna = await loginInNewContext(browser, baseURL, 'anna.admin');
  let bertil: Awaited<ReturnType<typeof loginInNewContext>> | null = null;
  try {
    await waitForWorkspace(anna.page, 'Kundadministration');
    await ensureMfa(anna.page, 'anna.admin');
    const form = formByHeading(anna.page, 'Lägg till huvudman');
    await form.getByLabel('Namn').fill(prefix);
    await form.getByLabel('Typ').selectOption('Enskild');
    const created = anna.page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/kund/huvudman',
    );
    await form.getByRole('button', { name: 'Lägg till huvudman' }).click();
    await expect(anna.page.getByText('Huvudmannen är tillagd.', { exact: true })).toBeVisible();
    const { organizerId } = (await (await created).json()) as { organizerId: string };

    const before = countEvents(
      manifest,
      `action='log_exported' and actor_identity_id='${SUBJECT.bertil}'`,
    );
    bertil = await loginInNewContext(browser, baseURL, 'bertil.granskare');
    await waitForWorkspace(bertil.page, 'Säkerhetslogg');
    await bertil.page.getByLabel('Åtgärd').fill('organizer_created');
    await bertil.page.getByRole('button', { name: 'Visa', exact: true }).click();
    const eventRow = bertil.page.getByRole('row').filter({ hasText: organizerId.slice(0, 8) });
    await expect(eventRow).toHaveCount(1);
    await expect(eventRow).toContainText('organizer_created');
    await expect(eventRow).toContainText('30000000');

    const download = bertil.page.waitForEvent('download');
    await bertil.page.getByRole('button', { name: 'Exportera CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^sakerhetslogg-/u);
    await expect
      .poll(() =>
        countEvents(
          manifest,
          `action='log_exported' and actor_identity_id='${SUBJECT.bertil}'`,
        ),
      )
      .toBe(before + 1);
  } finally {
    cleanupOrganizersLike(manifest, prefix);
    await anna.context.close();
    if (bertil) await bertil.context.close();
  }
});

test('pekytor är minst 44 px på telefon', async ({ browser, page }, testInfo) => {
  test.skip(testInfo.project.name !== 'protected-phone', 'Pekytor provas i telefonprojektet.');
  await page.setViewportSize({ width: 320, height: 720 });
  await login(page, 'frida.uppdrag');
  const controls: Locator[] = [
    page.locator('#uppdrag'),
    page.getByRole('button', { name: 'Logga ut', exact: true }),
    page.getByRole('button', { name: 'Om den skyddade provmiljön' }),
    page.getByRole('button', { name: 'Visa eller dölj navigation' }),
  ];

  const anna = await loginInNewContext(browser, testInfo.project.use.baseURL as string, 'anna.admin');
  try {
    // Första Spärra är tillräcklig: tabellraderna använder samma Button-variant och CSS.
    controls.push(anna.page.getByRole('button', { name: 'Spärra', exact: true }).first());
    controls.push(formByHeading(anna.page, 'Bjud in').getByRole('button', { name: 'Bjud in' }));
    controls.push(
      formByHeading(anna.page, 'Lägg till huvudman').getByRole('button', {
        name: 'Lägg till huvudman',
      }),
    );
    const tooSmall: string[] = [];
    for (const [index, control] of controls.entries()) {
      const box = await control.boundingBox();
      if (!box || box.width < 44 || box.height < 44) {
        tooSmall.push(`${index}:${box?.width ?? 0}x${box?.height ?? 0}`);
      }
    }
    expect(tooSmall).toEqual([]);
    await page.evaluate(() => {
      // WebKit saknar CDP-stöd för browserzoom. 200 % rottext ger samma
      // reflowkrav för text och kontroller utan CSS zooms falska dubbla canvas.
      document.documentElement.style.fontSize = '200%';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator('#uppdrag option')).toContainText([
      'Provkund A · Granskning',
      'Provkund A · Kundadministration',
      'Provkund A · Granskning',
    ]);
  } finally {
    await anna.context.close();
  }
});

test('tangentbord når väljaren och låsets knapp', async ({ page }, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'hanna.tva');
  for (let index = 0; index < 15 && !(await page.locator('#uppdrag').evaluate((el) => el === document.activeElement)); index += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(page.locator('#uppdrag')).toBeFocused();
  const page2 = await page.context().newPage();
  await page2.goto('/');
  await waitForHydration(page2);
  await page.locator('#uppdrag').selectOption(await optionValue(page, 'Provkund B'));
  const reload = page2.getByRole('button', { name: 'Ladda om' });
  await expect(reload).toBeFocused();
  await page2.keyboard.press('Enter');
  await waitForWorkspace(page2, 'Kundadministration');
});

test('byggd skyddad vy gör inga främmande anrop och lämnar ingen sb-session', async ({ page }, testInfo) => {
  skipUnlessBuilt(testInfo);
  const urls: string[] = [];
  page.on('request', (request) => urls.push(request.url()));
  await login(page, 'anna.admin', true);
  await waitForWorkspace(page, 'Kundadministration');
  const ownHost = new URL(testInfo.project.use.baseURL as string).host;
  const foreign = [
    ...new Set(
      urls.map((url) => new URL(url).host).filter(
        (host) => !new Set([ownHost, 'host.docker.internal:8180']).has(host),
      ),
    ),
  ];
  expect(foreign).toEqual([]);
  expect(urls.filter((url) => /\/rest\/v1\/|\/auth\/v1\/|\/rpc\/|supabase/iu.test(url))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('sb-')))).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toContain('sp_session');
});

test('step-up binds till ursprungligt uppdrag och epok', async ({ page }, testInfo) => {
  skipBuilt(testInfo);
  await login(page, 'hanna.tva');
  await page.locator('#uppdrag').selectOption(await optionValue(page, 'Provkund B'));
  await waitForWorkspace(page, 'Kundadministration');
  const proofBefore = psql(
    manifest,
    `select concat_ws('|', acr, array_to_string(amr,','), proof_checked_at::text)
     from public.app_sessions where identity_id='30000000-0000-4000-8000-000000000009'
       and revoked_at is null order by created_at desc limit 1;`,
  );
  const challenge = await page.context().newPage();
  const businessPosts: string[] = [];
  challenge.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/api/kund/')) {
      businessPosts.push(request.url());
    }
  });
  await challenge.goto('/api/auth/login?step_up=1&till=%2F');
  await challenge.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
  await page.locator('#uppdrag').selectOption(await optionValue(page, 'Provkund A'));
  await fillKeycloakLogin(challenge, 'hanna.tva');
  await challenge.waitForURL((url) => url.origin === new URL(testInfo.project.use.baseURL as string).origin);
  await expect(challenge.locator('body')).toContainText('login_state_invalid');
  const proofAfter = psql(
    manifest,
    `select concat_ws('|', acr, array_to_string(amr,','), proof_checked_at::text)
     from public.app_sessions where identity_id='30000000-0000-4000-8000-000000000009'
       and revoked_at is null order by created_at desc limit 1;`,
  );
  expect(proofAfter).toBe(proofBefore);
  expect(businessPosts).toEqual([]);
});

test('avbruten verifiering återspelar ingen åtgärd', async ({ browser }, testInfo) => {
  skipBuilt(testInfo);
  const baseURL = testInfo.project.use.baseURL as string;
  const anna = await loginInNewContext(browser, baseURL, 'anna.admin');
  let erik: Awaited<ReturnType<typeof loginInNewContext>> | null = null;
  try {
    const form = formByHeading(anna.page, 'Bjud in');
    await ensureMfa(anna.page, 'anna.admin');
    await form.getByLabel('Namn').fill('Erik browserprov');
    await form.getByLabel('Förväntat subjekt-ID').fill(SUBJECT.erik);
    await form.getByLabel('E-post (valfri)').fill('erik@example.test');
    await form.getByLabel('Funktion').selectOption('granskare');
    await form.getByRole('button', { name: 'Bjud in' }).click();
    await expect(anna.page.getByText('Inbjudan är skapad. Länken visas bara nu.')).toBeVisible();
    const invitationLink = await anna.page.getByLabel('Engångslänk').inputValue();

    const context = await browser.newContext({ baseURL, locale: 'sv-SE' });
    const invitation = await context.newPage();
    erik = { context, page: invitation };
    await invitation.goto(invitationLink.replace(new URL(invitationLink).origin, ''));
    await invitation.getByRole('button', { name: 'Logga in först' }).click();
    await invitation.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
    await fillKeycloakLogin(invitation, 'erik.utan');
    await invitation.waitForURL((url) => url.origin === new URL(baseURL).origin);
    psql(
      manifest,
      `update public.app_sessions set acr='1', amr=array['pwd']::text[]
       where identity_id='${SUBJECT.erik}' and revoked_at is null;`,
    );
    await invitation.getByRole('button', { name: 'Bekräfta inbjudan' }).click();
    await expect(invitation.getByRole('alert')).toContainText(
      'Åtgärden kräver verifiering med engångskod.',
    );
    await invitation.getByRole('button', { name: 'Verifiera med engångskod' }).click();
    await invitation.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));

    // Ett avbrott hos IdP:n återvänder utan att inlösen körs i bakgrunden.
    await invitation.goto('/inbjudan');
    await expect(invitation.getByRole('button', { name: 'Bekräfta inbjudan' })).toBeVisible();
    expect(
      Number(
        psql(
          manifest,
          `select count(*) from public.memberships where identity_id='${SUBJECT.erik}';`,
        ),
      ),
    ).toBe(0);

    await invitation.getByRole('button', { name: 'Bekräfta inbjudan' }).click();
    await invitation.getByRole('button', { name: 'Verifiera med engångskod' }).click();
    await invitation.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
    await fillKeycloakLogin(invitation, 'erik.utan');
    await invitation.waitForURL((url) => url.origin === new URL(baseURL).origin);
    await expect(invitation.getByRole('button', { name: 'Bekräfta inbjudan' })).toBeVisible();
    expect(
      Number(
        psql(
          manifest,
          `select count(*) from public.memberships where identity_id='${SUBJECT.erik}';`,
        ),
      ),
    ).toBe(0);
    await invitation.getByRole('button', { name: 'Bekräfta inbjudan' }).click();
    await expect(invitation.getByRole('heading', { name: 'Inbjudan är inlöst' })).toBeVisible();
    expect(
      Number(
        psql(
          manifest,
          `select count(*) from public.security_events
           where action='invitation_redeemed' and details->'proof' ? 'policyId'
             and details->'proof' ? 'profileId' and details->'proof' ? 'authTime'
             and details->'proof' ? 'checkedAt' and details->'proof' ? 'result';`,
        ),
      ),
    ).toBeGreaterThan(0);
  } finally {
    psql(
      manifest,
      `delete from public.app_sessions where identity_id='${SUBJECT.erik}';
       delete from public.access_assignments where membership_id in
         (select id from public.memberships where identity_id='${SUBJECT.erik}');
       delete from public.memberships where identity_id='${SUBJECT.erik}';
       delete from public.invitations where expected_subject='${SUBJECT.erik}';`,
    );
    await anna.context.close();
    if (erik) await erik.context.close();
  }
});
