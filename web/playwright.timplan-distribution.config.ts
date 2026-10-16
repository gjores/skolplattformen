import base from './playwright.usability.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['timplan-distribution.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:5197'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5197',url:'http://127.0.0.1:5197/e2e/fixtures/timplan-distribution-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/timplan-distribution-ui-final',reporter:[['list'],['json',{outputFile:'/private/tmp/timplan-distribution-ui-final.json'}]]});
