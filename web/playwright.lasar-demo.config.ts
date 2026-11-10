// Demoregression för Läsår & skoldagar (plan 05.1.1-01, LASAR-01).
//
// Startar exempelläget på 127.0.0.1:5191 och jämför demovyns
// DOM-fingeravtryck med e2e/fixtures/lasar-demo-baseline.json.
// Skrivläge: LASAR_DEMO_BASELINE=write (kräver oförändrad app/lasar-view.tsx).
//
// En arbetare, så att skrivläget inte skriver baslinjen samtidigt från två
// projekt. VINEXT_NO_DEV_LOCK=1 som i playwright.config.ts.
import { defineConfig, devices } from '@playwright/test';

const example = 'http://127.0.0.1:5191';

export default defineConfig({
  testDir: './e2e',
  testMatch: /lasar-demo\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '/private/tmp/lasar-demo/test-results',
  reporter: [['list']],
  use: { trace: 'retain-on-failure', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], baseURL: example, viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], baseURL: example },
    },
  ],
  webServer: {
    command: 'npm run dev:example:test',
    url: example,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VINEXT_NO_DEV_LOCK: '1' },
  },
});
