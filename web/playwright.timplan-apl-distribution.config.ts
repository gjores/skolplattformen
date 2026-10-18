import {defineConfig} from '@playwright/test';
import base from './playwright.apl-preview.config';
export default defineConfig({...base,testMatch:['timplan-apl-distribution.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:4195'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 4195',url:'http://127.0.0.1:4195/e2e/fixtures/apl-plan-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/timplan-apl-distribution-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/timplan-apl-distribution-ui.json'}]]});
