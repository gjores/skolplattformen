import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PHASE4_BASE_URL ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw new Error('Endast lokal provserver tillåts.');
// 04-24: skyddsmärke och uttryckligt skyddsval i exporten, behörig och obehörig administratör.
export default defineConfig({
  testDir: './e2e', testMatch: /phase4-protected-export\.spec\.ts/, timeout: 180_000,
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase4-protected.json' }]],
  use: { baseURL, trace: 'off', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' },
  projects: [
    { name: 'protected-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'protected-phone', use: { ...devices['iPhone 13'] } },
    { name: 'protected-phone-320', use: { ...devices['iPhone 13'], viewport: { width: 320, height: 740 } } },
  ],
});
