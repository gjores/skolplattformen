// Avgränsat verkligt OIDC-/API-/UI-prov. Server och DB-slot ordnas av köraren;
// inga äldre fixturer, migreringar, återställningar eller serverstarter körs här.
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PHASE4_BASE_URL ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw new Error('Endast lokal provserver tillåts.');

export default defineConfig({
  testDir: './e2e',
  testMatch: /phase4-permissions\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase4-permissions.json' }]],
  use: { actionTimeout: 15_000, trace: 'off', locale: 'sv-SE', timezoneId: 'Europe/Stockholm', baseURL },
  projects: [
    { name: 'phase4-permission-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phase4-permission-phone', use: { ...devices['iPhone 13'] } },
  ],
});
