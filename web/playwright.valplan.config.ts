import base from './playwright.usability.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['valplan.spec.ts', 'valplan-choice.spec.ts'], reporter: [['list'], ['json', { outputFile: 'test-results/valplan.json' }]] });
