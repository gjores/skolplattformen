import {defineConfig} from '@playwright/test';
import base from './playwright.apl-preview.config';
export default defineConfig({...base,testMatch:['programplan-examination.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:4196'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 4196',url:'http://127.0.0.1:4196/e2e/fixtures/programplan-copy-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/programplan-examination-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/programplan-examination-ui.json'}]]});
