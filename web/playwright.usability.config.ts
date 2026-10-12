import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'usability.spec.ts', workers: 1, retries: 0, timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5194', locale: 'sv-SE', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'npx vite --config vite.mandate-test.config.ts', url: 'http://127.0.0.1:5194/e2e/fixtures/usability-preview.html', reuseExistingServer: false },
  reporter: [['list'], ['json', { outputFile: 'test-results/usability.json' }]],
});
