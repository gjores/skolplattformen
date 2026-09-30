import { defineConfig, devices } from '@playwright/test';

const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3056';
if(!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL))throw new Error('Endast lokal provserver tillåts.');
export default defineConfig({
  testDir:'./e2e',testMatch:/phase5-timplan\.spec\.ts/,timeout:120_000,
  fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:'test-results/phase5-timplan.json'}]],
  use:{baseURL,trace:'off',locale:'sv-SE',timezoneId:'Europe/Stockholm',actionTimeout:20_000,navigationTimeout:30_000},
  projects:[
    {name:'timplan-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}}},
    {name:'timplan-phone',use:{...devices['iPhone 13']}},
  ],
});
