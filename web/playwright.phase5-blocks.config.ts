import { defineConfig, devices } from '@playwright/test';
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
if(!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL))throw Error('Endast lokal provserver tillåts.');
export default defineConfig({testDir:'./e2e',outputDir:'./test-results/phase5-blocks',testMatch:/phase5-blocks\.spec\.ts/,timeout:120_000,fullyParallel:false,workers:1,retries:0,
  expect:{timeout:20_000},reporter:[['list'],['json',{outputFile:'test-results/phase5-blocks.json'}]],
  use:{baseURL,trace:'off',locale:'sv-SE',timezoneId:'Europe/Stockholm',actionTimeout:20_000,navigationTimeout:30_000},
  projects:[{name:'blocks-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'blocks-phone',use:{...devices['iPhone 13']}}]});
