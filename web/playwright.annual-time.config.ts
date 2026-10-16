import base from './playwright.usability.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['annual-time.spec.ts'], use: { ...base.use, baseURL: 'http://127.0.0.1:5198' }, webServer: { command: 'npx vite --config vite.mandate-test.config.ts --port 5198', url: 'http://127.0.0.1:5198/e2e/fixtures/annual-time-preview.html', reuseExistingServer: false }, outputDir: '/private/tmp/annual-time-ui', reporter: [['list'], ['json', { outputFile: '/private/tmp/annual-time-ui.json' }]] });
