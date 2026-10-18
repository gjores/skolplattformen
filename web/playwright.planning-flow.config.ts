import {defineConfig} from '@playwright/test';
import base from './playwright.apl-preview.config';
export default defineConfig({...base,testMatch:['planning-flow.spec.ts','planning-apl-process.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:4193'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 4193',url:'http://127.0.0.1:4193/e2e/fixtures/apl-plan-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/planning-flow-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/planning-flow-ui.json'}]]});
