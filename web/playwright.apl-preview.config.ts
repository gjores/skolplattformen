import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['apl-plan.spec.ts'], workers: 1, retries: 0, timeout: 40_000,
  use: { baseURL: 'http://127.0.0.1:4187', locale: 'sv-SE', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'phone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: { command: 'npx vite --config vite.mandate-test.config.ts --port 4187',
    url: 'http://127.0.0.1:4187/e2e/fixtures/apl-plan-preview.html', reuseExistingServer: false },
  outputDir: '/private/tmp/apl-plan-ui-results',
  reporter: [['list'], ['json', { outputFile: '/private/tmp/apl-plan-ui-results.json' }]],
});
