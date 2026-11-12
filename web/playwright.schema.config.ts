import base from './playwright.usability.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['schema.spec.ts'], reporter: [['list'], ['json', { outputFile: 'test-results/schema.json' }]] });
