import {defineConfig,devices} from '@playwright/test';

const baseURL=process.env.PHASE5_BASE_URL;
if(!baseURL||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(baseURL)||new URL(baseURL).port==='3012')
  throw Error('Klassprovet kräver en uttrycklig isolerad lokal Worker-adress via PHASE5_BASE_URL.');

export default defineConfig({
  testDir:'./e2e',testMatch:/class-cohort-actual\.spec\.ts$/,outputDir:'./test-results/class-cohort-actual',
  timeout:360_000,expect:{timeout:25_000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:'test-results/class-cohort-actual.json'}]],
  use:{baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',trace:'off',video:'off',screenshot:'off',
    actionTimeout:25_000,navigationTimeout:45_000},
  projects:[
    {name:'class-cohort-actual-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'class-cohort-actual-phone',use:{...devices['iPhone 13']}},
  ],
});
