import { defineConfig } from '@playwright/test';
import base from './playwright.schema.config.ts';
// Endast C5:s syntetiska komponentprov. Egen port, ingen ordinarie app, motor eller databas.
export default defineConfig({ ...base, testMatch: ['schema-salar.spec.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:5246' },
  webServer: { command: 'npx vite --config vite.schema-salar-test.config.ts', url: 'http://127.0.0.1:5246/e2e/fixtures/schema-salar-preview.html', reuseExistingServer: false },
  reporter: [['list'], ['json', { outputFile: 'test-results/schema-salar.json' }]],
});
