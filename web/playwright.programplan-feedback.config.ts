import base from './playwright.programplan-copy.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'programplan-feedback.spec.ts',outputDir:'/private/tmp/programplan-feedback-ui',use:{...base.use,baseURL:'http://127.0.0.1:5197'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5197',url:'http://127.0.0.1:5197/e2e/fixtures/programplan-flow-preview.html',reuseExistingServer:false},reporter:[['list'],['json',{outputFile:'/private/tmp/programplan-feedback-ui.json'}]]});
