import base from './playwright.usability.config';
import { defineConfig } from '@playwright/test';
// Schemaläggningens arbetsyta är avsedd för dator (användarbeslut 2026-11-13).
// Båda arbetsbredderna prövar samma flöden, även när nya planer får egna provfiler.
export default defineConfig({
  ...base,
  testMatch: ['schema*.spec.ts'],
  projects: [
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 1000 } } },
    { name: 'desktop-1600', use: { viewport: { width: 1600, height: 1000 } } },
  ],
  reporter: [['list'], ['json', { outputFile: 'test-results/schema.json' }]],
});
