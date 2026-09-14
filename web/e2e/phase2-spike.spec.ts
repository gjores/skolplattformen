import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  fillKeycloakLogin,
  loginViaKeycloak,
  readPilotManifest,
} from './helpers/keycloak.ts';
import { blockMembership, psql, unblockMembership } from './helpers/pilot-db.ts';

const manifest = readPilotManifest();
const annaSubject = '30000000-0000-4000-8000-000000000001';
const annaMembership = '40000000-0000-4000-8000-000000000001';
const appOrigin = 'http://127.0.0.1:3012';
const allowedHosts = new Set(['127.0.0.1:3012', 'host.docker.internal:8180']);
const resultPath = fileURLToPath(
  new URL('../../work/pilot/results/spike.json', import.meta.url),
);

type SavedCookie = Parameters<BrowserContext['addCookies']>[0][number];

let sessionCookie: SavedCookie;
let callbackUrl = '';
const result = {
  checkedAt: '',
  revision: '',
  baseURL: appOrigin,
  login: {
    user: 'anna.admin',
    acr: null as string | null,
    amr: [] as string[],
    authTimeWithinSeconds: null as number | null,
    localProfileVerified: false,
  },
  gotrue: { authUserIdSet: false, authUsersRow: false },
  blocked: { statusBefore: 0, statusAfter: 0, code: '' },
  logout: { redirectHost: '', sessionAfter: 0, code: '' },
  network: { foreignHosts: [] as string[] },
  negative: {
    missingSession: false,
    codeReplay: false,
    otherSubject: false,
    changedEpoch: false,
    blockedBeforeCallback: false,
    userAbort: false,
    logoutBeforeCallback: false,
    logoutDuringIdpOutage: false,
    proofUnchanged: false,
    businessRowsUnchanged: false,
  },
};

function collectRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (request) => {
    urls.push(request.url());
    if (request.url().includes('/api/auth/callback?')) callbackUrl = request.url();
  });
  return urls;
}

async function useSavedSession(page: Page): Promise<void> {
  await page.context().addCookies([sessionCookie]);
}

async function sessionJson(page: Page) {
  const response = await page.request.get('/api/session');
  expect(response.status()).toBe(200);
  return response.json() as Promise<{
    identity: { issuer: string; subject: string };
    mfa: { acr: string | null; amr: string[]; authTime: string | null };
    context: { customerName: string } | null;
  }>;
}

function proofSnapshot(): string {
  return psql(
    manifest,
    `select concat_ws('|', coalesce(s.acr,''), array_to_string(s.amr,','),
      coalesce(s.proof_issuer,''), coalesce(s.proof_client_id,''),
      array_to_string(s.proof_audience,','), coalesce(s.proof_profile_id,''),
      coalesce(s.proof_profile_version::text,''), coalesce(s.auth_time::text,''))
     from public.app_sessions s join public.identities i on i.id=s.identity_id
     where i.subject='${annaSubject}'
     order by s.created_at desc limit 1;`,
  );
}

async function startStepUp(page: Page): Promise<void> {
  await page.goto('/api/auth/login?step_up=1&till=%2F');
  await page.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
}

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  result.checkedAt = new Date().toISOString();
  result.revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  mkdirSync(fileURLToPath(new URL('../../work/pilot/results/', import.meta.url)), {
    recursive: true,
  });
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
});

test('inloggning med TOTP ger en httpOnly-session med profilbundet MFA-bevis', async ({
  page,
}) => {
  const urls = collectRequests(page);
  await loginViaKeycloak(page, 'anna.admin');
  let preliminary = await sessionJson(page);
  if (!preliminary.mfa.amr.includes('otp')) {
    await loginViaKeycloak(page, 'anna.admin', { stepUp: true });
    preliminary = await sessionJson(page);
  }

  expect(await page.evaluate(() => document.cookie)).not.toContain('sp_session');
  const cookies = await page.context().cookies();
  sessionCookie = cookies.find((cookie) => cookie.name === 'sp_session') as SavedCookie;
  expect(sessionCookie).toBeTruthy();
  expect(sessionCookie.httpOnly).toBe(true);
  expect(sessionCookie.sameSite).toBe('Lax');

  const session = preliminary;
  expect(session.identity.subject).toBe(annaSubject);
  expect(session.identity.issuer).toBe(manifest.idp.issuer);
  expect(session.context?.customerName).toBe('Provkund A');
  expect(Array.isArray(session.mfa.amr)).toBe(true);
  expect(session.mfa.amr).toContain('pwd');
  expect(session.mfa.amr).toContain('otp');

  result.login.acr = session.mfa.acr;
  result.login.amr = session.mfa.amr;
  result.login.authTimeWithinSeconds = session.mfa.authTime
    ? Math.abs(Date.now() - new Date(session.mfa.authTime).getTime()) / 1000
    : null;
  const profile = psql(
    manifest,
    `select concat_ws('|', proof_issuer, proof_client_id,
      array_to_string(proof_audience,','), proof_profile_id, proof_profile_version)
     from public.app_sessions s join public.identities i on i.id=s.identity_id
     where i.subject='${annaSubject}' and s.revoked_at is null
     order by s.created_at desc limit 1;`,
  );
  result.login.localProfileVerified =
    profile ===
    `${manifest.idp.issuer}|${manifest.idp.clientId}|${manifest.idp.clientId}|local-keycloak-admin|1`;
  expect(result.login.localProfileVerified).toBe(true);

  const foreignHosts = [
    ...new Set(urls.map((url) => new URL(url).host).filter((host) => !allowedHosts.has(host))),
  ];
  result.network.foreignHosts = foreignHosts;
  expect(foreignHosts).toEqual([]);
  expect(urls.filter((url) => /\/auth\/v1\/|\/rest\/v1\/|\/rpc\//u.test(url))).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('sb-')),
    ),
  ).toEqual([]);
});

test('GoTrue har registrerat den verifierade externa identiteten', () => {
  const linked = Number(
    psql(
      manifest,
      `select count(*) from public.identities where subject='${annaSubject}' and auth_user_id is not null;`,
    ),
  );
  const authRow = Number(
    psql(
      manifest,
      `select count(*) from auth.users u join public.identities i on i.auth_user_id=u.id where i.subject='${annaSubject}';`,
    ),
  );
  result.gotrue.authUserIdSet = linked === 1;
  result.gotrue.authUsersRow = authRow === 1;
  expect(result.gotrue).toEqual({ authUserIdSet: true, authUsersRow: true });
});

test('spärrat medlemskap nekar samma cookie direkt och kan återställas', async ({ page }) => {
  await useSavedSession(page);
  const before = await page.request.get('/api/kund/oversikt');
  result.blocked.statusBefore = before.status();
  expect(before.status()).toBe(200);
  expect((await before.json()).customer.name).toBe('Provkund A');

  try {
    blockMembership(manifest, annaMembership);
    const blocked = await page.request.get('/api/kund/oversikt');
    const body = (await blocked.json()) as { code: string };
    result.blocked.statusAfter = blocked.status();
    result.blocked.code = body.code;
    expect(blocked.status()).toBe(403);
    expect(body.code).toBe('membership_blocked');
  } finally {
    unblockMembership(manifest, annaMembership);
  }
  expect((await page.request.get('/api/kund/oversikt')).status()).toBe(200);
});

test('utloggning återkallar sessionen även om IdP:n är nere', async ({ page }) => {
  await useSavedSession(page);
  execFileSync('docker', ['stop', 'skolplattform-pilot-idp'], { stdio: 'ignore' });
  try {
    const logout = await page.request.post('/api/auth/logout', {
      headers: { 'Sec-Fetch-Site': 'same-origin' },
    });
    const body = (await logout.json()) as { redirect: string };
    result.logout.redirectHost = new URL(body.redirect).host;
    expect(logout.status()).toBe(200);
    expect(result.logout.redirectHost).toBe('host.docker.internal:8180');
    expect(new URL(body.redirect).pathname).toContain('/protocol/openid-connect/logout');
    const after = await page.request.get('/api/session');
    result.logout.sessionAfter = after.status();
    result.logout.code = ((await after.json()) as { code: string }).code;
    expect(after.status()).toBe(401);
    expect(['session_revoked', 'no_session']).toContain(result.logout.code);
    result.negative.logoutDuringIdpOutage = true;
  } finally {
    execFileSync('docker', ['start', 'skolplattform-pilot-idp'], { stdio: 'ignore' });
  }
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${manifest.idp.publicUrl}/realms/skolplattform-test`)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 60_000 },
    )
    .toBe(true);
});

test('manipulerade och avbrutna callbacker skapar eller höjer ingen session', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const missing = await page.request.get('/api/auth/login?step_up=1', { maxRedirects: 0 });
  expect(missing.status()).toBe(401);
  result.negative.missingSession = true;

  await useSavedSession(page);
  const replay = await page.request.get(callbackUrl, { maxRedirects: 0 });
  expect(replay.status()).toBe(400);
  result.negative.codeReplay = true;

  // Den sparade sessionen är återkallad av föregående prov. Skapa en ny Anna-session.
  await page.context().clearCookies();
  await loginViaKeycloak(page, 'anna.admin');
  if (!(await sessionJson(page)).mfa.amr.includes('otp')) {
    await loginViaKeycloak(page, 'anna.admin', { stepUp: true });
  }
  sessionCookie = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'sp_session',
  ) as SavedCookie;
  const proofBefore = proofSnapshot();
  const businessBefore = psql(
    manifest,
    'select concat((select count(*) from public.customers),\'|\',(select count(*) from public.memberships));',
  );

  // Samma session, annan extern subject i step-up: callbacken ska förbrukas och nekas.
  await page.context().clearCookies();
  await useSavedSession(page);
  await startStepUp(page);
  await fillKeycloakLogin(page, 'bertil.granskare');
  await page.waitForURL((url) => url.origin === appOrigin);
  await expect(page.locator('body')).toContainText('login_state_invalid');
  result.negative.otherSubject = true;
  expect(proofSnapshot()).toBe(proofBefore);

  // En ändrad kontextepok under utmaningen gör den förseglade bindningen ogiltig.
  await page.context().clearCookies();
  await useSavedSession(page);
  await startStepUp(page);
  psql(
    manifest,
    `update public.app_sessions s set context_epoch=context_epoch+1 from public.identities i
     where s.identity_id=i.id and i.subject='${annaSubject}' and s.revoked_at is null;`,
  );
  try {
    await fillKeycloakLogin(page, 'anna.admin');
    await page.waitForURL((url) => url.origin === appOrigin);
    result.negative.changedEpoch = true;
    expect(proofSnapshot()).toBe(proofBefore);
  } finally {
    psql(
      manifest,
      `update public.app_sessions s set context_epoch=context_epoch-1 from public.identities i
       where s.identity_id=i.id and i.subject='${annaSubject}' and s.revoked_at is null;`,
    );
  }

  // Spärr före callback får inte höja den gamla sessionen.
  await page.context().clearCookies();
  await useSavedSession(page);
  await startStepUp(page);
  blockMembership(manifest, annaMembership);
  try {
    await fillKeycloakLogin(page, 'anna.admin');
    await page.waitForURL((url) => url.origin === appOrigin);
    result.negative.blockedBeforeCallback = true;
    expect(proofSnapshot()).toBe(proofBefore);
  } finally {
    unblockMembership(manifest, annaMembership);
  }

  // Ett uttryckligt användaravbrott förbrukar login-state utan att ändra proof.
  await page.context().clearCookies();
  await useSavedSession(page);
  await startStepUp(page);
  const state = new URL(page.url()).searchParams.get('state');
  expect(state).toBeTruthy();
  await page.goto(`${appOrigin}/api/auth/callback?error=access_denied&state=${state}`);
  expect((await page.request.get('/api/session')).status()).toBe(200);
  result.negative.userAbort = true;
  expect(proofSnapshot()).toBe(proofBefore);

  // Lokal logout innan callback återkallar originalsessionen; callbacken får inte återuppliva den.
  await startStepUp(page);
  const logout = await page.request.post('/api/auth/logout', {
    headers: { 'Sec-Fetch-Site': 'same-origin' },
  });
  expect(logout.status()).toBe(200);
  await fillKeycloakLogin(page, 'anna.admin');
  await page.waitForURL((url) => url.origin === appOrigin);
  expect((await page.request.get('/api/session')).status()).toBe(401);
  result.negative.logoutBeforeCallback = true;

  result.negative.proofUnchanged = proofSnapshot() === proofBefore;
  expect(result.negative.proofUnchanged).toBe(true);
  result.negative.businessRowsUnchanged =
    psql(
      manifest,
      'select concat((select count(*) from public.customers),\'|\',(select count(*) from public.memberships));',
    ) === businessBefore;
  expect(result.negative.businessRowsUnchanged).toBe(true);
});
