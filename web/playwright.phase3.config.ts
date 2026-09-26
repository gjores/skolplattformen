// Fas 3-browserprov mot byggd protected-Worker med riktig OIDC-inloggning i den
// lokala testleverantören. Förutsätter: lokalt protected-mål med IdP,
// `node work/pilot/phase3-browser-fixtures.mjs --target protected` och
// `npm run build:protected`. Endast syntetiska uppgifter.
import { defineConfig, devices } from '@playwright/test';

const built = 'http://127.0.0.1:3012';

export default defineConfig({
  testDir: './e2e',
  testMatch: /phase3-workspace\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/phase3-workspace.json' }],
  ],
  use: { trace: 'off', locale: 'sv-SE', timezoneId: 'Europe/Stockholm', baseURL: built },
  projects: [
    {
      name: 'phase3-desktop',
      use: { ...devices['Desktop Chrome'], baseURL: built, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phase3-phone',
      use: { ...devices['iPhone 13'], baseURL: built },
    },
  ],
  webServer: {
    command: 'npm run preview:protected',
    url: `${built}/api/health/db`,
    reuseExistingServer: false,
    timeout: 120_000,
    // run-mode städar sin privata .dev.vars endast vid ordnat avslut.
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
