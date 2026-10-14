import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './e2e', testMatch: 'school-registry.spec.ts', outputDir: './test-results/school-registry', workers: 1, retries: 0, timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5198', locale: 'sv-SE', timezoneId: 'Europe/Stockholm', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [{ name: 'registry-desktop', use: { ...devices['Desktop Chrome'], viewport: {width:1440,height:1000} } }, { name: 'registry-phone', use: { ...devices['iPhone 13'] } }],
  webServer: { command: 'npx vite --config vite.mandate-test.config.ts --port 5198', url: 'http://127.0.0.1:5198/e2e/fixtures/school-registry-preview.html', reuseExistingServer: false },
  reporter: [['list'], ['json', {outputFile:'test-results/school-registry.json'}]],
});
