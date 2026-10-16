import base from './playwright.usability.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['apl-decision.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:4188'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 4188',url:'http://127.0.0.1:4188/e2e/fixtures/apl-decision-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/apl-decision-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/apl-decision-ui.json'}]]});
