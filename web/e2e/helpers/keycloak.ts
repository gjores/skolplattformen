import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as OTP from 'otpauth';
import type { Page } from '@playwright/test';

export type PilotManifest = {
  dbUrl: string;
  apiUrl: string;
  ports: { api: number; db: number };
  idp: {
    publicUrl: string;
    issuer: string;
    clientId: string;
    totpSecret: string;
    users: { username: string; subject: string; email: string; totp: boolean }[];
  };
};

const enrolledSecrets = new Map<string, OTP.Secret>();
const lastSubmittedCodes = new Map<string, string>();

async function safePageDiagnostic(page: Page): Promise<string> {
  const controls = await page.locator('input, button, a').evaluateAll((elements) =>
    elements
      .filter((element) => element instanceof HTMLElement && element.offsetParent !== null)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        name: element.getAttribute('name'),
        type: element.getAttribute('type'),
        text: element instanceof HTMLInputElement ? null : element.textContent?.trim().slice(0, 80),
      })),
  );
  const url = new URL(page.url());
  return JSON.stringify({ path: url.pathname, controls });
}

function enrolledSecretsPath(): string {
  return fileURLToPath(
    new URL('../../../work/pilot/targets/protected/idp/totp-users.json', import.meta.url),
  );
}

function lastCodesPath(): string {
  return fileURLToPath(
    new URL('../../../work/pilot/targets/protected/idp/totp-last-used.json', import.meta.url),
  );
}

function privateJson(path: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function rememberSubmittedCode(username: string, code: string): void {
  lastSubmittedCodes.set(username, code);
  const stored = privateJson(lastCodesPath());
  stored[username] = code;
  writeFileSync(lastCodesPath(), `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  chmodSync(lastCodesPath(), 0o600);
}

function rememberEnrolledSecret(username: string, base32: string): OTP.Secret {
  const secret = OTP.Secret.fromBase32(base32);
  enrolledSecrets.set(username, secret);
  const stored = privateJson(enrolledSecretsPath());
  stored[username] = base32;
  writeFileSync(enrolledSecretsPath(), `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  chmodSync(enrolledSecretsPath(), 0o600);
  return secret;
}

function codeForUser(manifest: PilotManifest, username: string): string {
  let storedSecret: OTP.Secret | undefined;
  try {
    const stored = JSON.parse(readFileSync(enrolledSecretsPath(), 'utf8')) as Record<string, string>;
    if (stored[username]) storedSecret = OTP.Secret.fromBase32(stored[username]);
  } catch {
    // En ny målmiljö har ännu inga browserregistrerade TOTP-hemligheter.
  }
  const secret =
    enrolledSecrets.get(username) ?? storedSecret ?? OTP.Secret.fromBase32(manifest.idp.totpSecret);
  return new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret }).generate();
}

async function freshCodeForUser(manifest: PilotManifest, username: string): Promise<string> {
  const previous =
    lastSubmittedCodes.get(username) ?? privateJson(lastCodesPath())[username];
  for (;;) {
    const code = codeForUser(manifest, username);
    if (code !== previous) {
      rememberSubmittedCode(username, code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export function readPilotManifest(): PilotManifest {
  const manifestPath = fileURLToPath(
    new URL('../../../work/pilot/targets/protected/manifest.json', import.meta.url),
  );
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')) as PilotManifest;
  } catch {
    throw new Error(
      'BLOCKED: protected-målet saknar manifest (kör prepare-local --with-idp)',
    );
  }
}

export function totpCode(manifest: PilotManifest): string {
  return new OTP.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTP.Secret.fromBase32(manifest.idp.totpSecret),
  }).generate();
}

export async function fillKeycloakLogin(
  page: Page,
  username: string,
  password = 'Provlosenord-1',
): Promise<void> {
  const manifest = readPilotManifest();
  const keycloakOrigin = new URL(page.url()).origin;
  const user = manifest.idp.users.find((candidate) => candidate.username === username);
  const usernameField = page.getByLabel(/Användarnamn|Username/i);
  const passwordField = page.getByRole('textbox', { name: /Lösenord|Password/i });
  const otp = page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
  const enrollmentSecret = page.locator('#kc-totp-secret-key');
  const manualEnrollment = page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i);
  const first = await Promise.race([
    usernameField.waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'credentials' as const),
    passwordField.waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'reauth' as const),
    otp.waitFor({ state: 'visible', timeout: 5_000 }).then(() => 'otp' as const),
  ]).catch(async () => {
    throw new Error(`Okänd Keycloak-sida: ${(await page.locator('body').innerText()).slice(0, 500)}`);
  });
  if (first === 'otp') {
    await otp.fill(await freshCodeForUser(manifest, username));
    await page.getByRole('button', { name: /Logga in|Sign In/i }).click();
    return;
  }
  if (await usernameField.isVisible()) await usernameField.fill(username);
  await passwordField.fill(password);
  await page.getByRole('button', { name: /Logga in|Sign In/i }).click();

  if (user?.totp) {
    const next = await Promise.race([
      enrollmentSecret.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'enroll' as const),
      manualEnrollment.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'manual' as const),
      otp.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'otp' as const),
      page
        .waitForURL((url) => url.origin !== keycloakOrigin, { timeout: 10_000 })
        .then(() => 'returned' as const),
    ]).catch(async () => {
      throw new Error(`Okänt steg efter lösenord: ${await safePageDiagnostic(page)}`);
    });
    if (next === 'returned') return;
    if (next === 'manual') {
      await manualEnrollment.click();
      await enrollmentSecret.waitFor({ state: 'visible' });
    }
    if (await enrollmentSecret.isVisible()) {
      const base32 = (await enrollmentSecret.innerText()).replaceAll(/\s/g, '');
      const secret = rememberEnrolledSecret(username, base32);
      const code = new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret }).generate();
      rememberSubmittedCode(username, code);
      await page.locator('input[name="totp"]').fill(code);
      const label = page.locator('input[name="userLabel"]');
      if (await label.isVisible()) await label.fill('browserprov');
      await page.getByRole('button', { name: /Skicka|Spara|Logga in|Submit/i }).click();
      return;
    }
    await otp.fill(await freshCodeForUser(manifest, username));
    await page.getByRole('button', { name: /Logga in|Sign In/i }).click();
  }
}

export async function loginViaKeycloak(
  page: Page,
  username: string,
  opts: { password?: string; stepUp?: boolean; returnTo?: string } = {},
): Promise<void> {
  const query = new URLSearchParams();
  if (opts.stepUp) query.set('step_up', '1');
  if (opts.returnTo) query.set('till', opts.returnTo);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  if (page.url() === 'about:blank') await page.goto('/');
  const appOrigin = new URL(page.url()).origin;

  await page.goto(`/api/auth/login${suffix}`);
  await page.waitForURL((url) => url.pathname.includes('/realms/skolplattform-test/'));
  await fillKeycloakLogin(page, username, opts.password);
  await page
    .waitForURL((url) => url.origin === appOrigin, { timeout: 15_000 })
    .catch(async () => {
      throw new Error(`Keycloak återvände inte till appen: ${await safePageDiagnostic(page)}`);
    });
  if (new URL(page.url()).pathname.startsWith('/api/auth')) {
    throw new Error(`Inloggningscallback nekades: ${await page.locator('body').innerText()}`);
  }
}
