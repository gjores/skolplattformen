// Browserproven här kräver ett förberett lokalt protected-mål och en byggd
// Worker: kör `node work/pilot/prepare-local.mjs --target protected --with-idp`
// från projektroten och `npm run build:protected` i web/ först. Utan dessa
// förutsättningar stoppar run-mode körningen som BLOCKED.
import { defineConfig, devices } from '@playwright/test';

const dev = 'http://127.0.0.1:5193';
const built = 'http://127.0.0.1:3012';

export default defineConfig({
  testDir: './e2e',
  testMatch: /phase2-.*\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/phase2-e2e.json' }],
  ],
  use: { trace: 'off', locale: 'sv-SE' },
  projects: [
    {
      name: 'protected-desktop',
      testMatch: /phase2-access\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: dev,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'protected-phone',
      testMatch: /phase2-access\.spec\.ts/,
      use: { ...devices['iPhone 13'], baseURL: dev },
    },
    {
      name: 'protected-built',
      testMatch: /phase2-(?:spike|access)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: built,
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:protected:test',
      url: `${dev}/api/health/db`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VINEXT_NO_DEV_LOCK: '1' },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      command: 'npm run preview:protected',
      url: `${built}/api/health/db`,
      reuseExistingServer: false,
      timeout: 120_000,
      // run-mode städar sin privata dist-protected/server/.dev.vars och låset
      // endast vid ordnat avslut; annars blockeras nästa skyddade server.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
});
