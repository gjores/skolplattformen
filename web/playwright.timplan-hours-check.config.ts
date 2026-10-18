import {defineConfig} from '@playwright/test';
import base from './playwright.apl-preview.config';
export default defineConfig({...base,testMatch:['timplan-hours-check.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:4194'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 4194',url:'http://127.0.0.1:4194/e2e/fixtures/apl-plan-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/timplan-hours-check-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/timplan-hours-check-ui.json'}]]});
