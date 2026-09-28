import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PHASE4_BASE_URL ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw new Error('Endast lokal provserver tillåts.');
export default defineConfig({
  testDir: './e2e', testMatch: /phase4-list\.spec\.ts/, timeout: 120_000,
  fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase4-list.json' }]],
  use: { baseURL, trace: 'off', locale: 'sv-SE', timezoneId: 'Europe/Stockholm' },
  projects: [
    { name: 'list-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'list-phone', use: { ...devices['iPhone 13'] } },
    { name: 'list-phone-320', grep: /serverns options och projektion/, use: { ...devices['iPhone 13'], viewport: { width: 320, height: 740 } } },
  ],
});
