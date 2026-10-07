import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PHASE5_BASE_URL ?? 'http://127.0.0.1:3061';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw Error('Endast lokal provserver tillåts.');
export default defineConfig({
  testDir: './e2e', outputDir: './test-results/phase5-planning-year',
  testMatch: /phase5-planning-year-(?:context|lists|gym|other)\.spec\.ts/,
  timeout: 180_000, fullyParallel: false, workers: 1, retries: 0,
  expect: { timeout: 25_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/phase5-planning-year.json' }]],
  use: { baseURL, trace: 'off', locale: 'sv-SE', timezoneId: 'Europe/Stockholm',
    actionTimeout: 25_000, navigationTimeout: 30_000 },
  projects: [
    { name: 'planning-year-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'planning-year-phone', use: { ...devices['iPhone 13'] } },
  ],
});
