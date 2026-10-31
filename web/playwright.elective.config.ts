import base from './playwright.usability.config';
import { defineConfig } from '@playwright/test';
export default defineConfig({ ...base, testMatch: ['elective-choice.spec.ts', 'elective-blocks.spec.ts', 'elective-self.spec.ts', 'elective-group.*.spec.ts', 'elective-placement.spec.ts'], projects: base.projects?.map(project => ({ ...project, testIgnore: project.name === 'phone' ? '**/*.desktop.spec.ts' : '**/*.phone.spec.ts' })), reporter: [['list'], ['json', { outputFile: 'test-results/elective.json' }]] });
