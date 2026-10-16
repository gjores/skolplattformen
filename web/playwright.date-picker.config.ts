import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'date-picker.spec.ts',workers:1,retries:0,timeout:30000,
 use:{baseURL:'http://127.0.0.1:5196',locale:'sv-SE',reducedMotion:'reduce',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000},timezoneId:'Europe/Stockholm'}},{name:'phone',use:{...devices['iPhone 13'],timezoneId:'America/Los_Angeles'}}],
 webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5196',url:'http://127.0.0.1:5196/e2e/fixtures/date-picker-preview.html',reuseExistingServer:false},
 outputDir:'/private/tmp/date-picker-ui-results',reporter:[['list'],['json',{outputFile:'/private/tmp/date-picker-ui-results.json'}]]});
