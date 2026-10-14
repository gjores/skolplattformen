import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./e2e',testMatch:'programplan-copy.spec.ts',outputDir:'./test-results/programplan-copy',workers:1,retries:0,timeout:30_000,
 use:{baseURL:'http://127.0.0.1:5195',locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce',trace:'retain-on-failure'},
 projects:[{name:'copy-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'copy-phone',use:{...devices['iPhone 13']}}],
 webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5195',url:'http://127.0.0.1:5195/e2e/fixtures/programplan-copy-preview.html',reuseExistingServer:false},
 reporter:[['list'],['json',{outputFile:'test-results/programplan-copy.json'}]],});
