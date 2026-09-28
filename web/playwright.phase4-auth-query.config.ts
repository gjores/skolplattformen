import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PHASE4_BASE_URL ?? 'http://127.0.0.1:3000';
if (!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)) throw new Error('Endast lokal provserver tillåts.');
export default defineConfig({
  testDir: './e2e', testMatch: /phase4-auth-query\.spec\.ts/, timeout: 30_000,
  workers: 1, retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/phase4-auth-query.json' }]],
  use: { ...devices['Desktop Chrome'], baseURL, trace: 'off', locale: 'sv-SE' },
});
