import base from './playwright.usability.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:['named-timplans.spec.ts','operational-class-timplan.spec.ts'],use:{...base.use,baseURL:'http://127.0.0.1:5196'},webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5196',url:'http://127.0.0.1:5196/e2e/fixtures/named-timplan-preview.html',reuseExistingServer:false},outputDir:'/private/tmp/named-timplans-ui',reporter:[['list'],['json',{outputFile:'/private/tmp/named-timplans-ui.json'}]]});
