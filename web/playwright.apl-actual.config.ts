import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
const baseURL=process.env.PHASE5_BASE_URL;
const manifest=process.env.APL_ACTUAL_MANIFEST;
const evidence=process.env.APL_ACTUAL_EVIDENCE_DIR;
if(baseURL!=='http://127.0.0.1:3014'||!manifest?.startsWith('/private/tmp/')||!evidence?.startsWith('/private/tmp/'))
  throw new Error('APL actual kräver egen kandidat på3014 och privat manifest från verify-apl-plan-api.mjs.');
export default defineConfig({
  testDir:'./e2e',testMatch:/apl-plan-actual\.spec\.ts$/,outputDir:path.join(evidence,'playwright-output'),
  timeout:900000,expect:{timeout:25000},fullyParallel:false,workers:1,retries:0,maxFailures:1,
  reporter:[['list'],['json',{outputFile:path.join(evidence,'playwright-actual.json')}]],
  use:{baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',trace:'off',video:'off',screenshot:'off',actionTimeout:25000,navigationTimeout:45000},
  projects:[
    {name:'apl-actual-desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},
    {name:'apl-actual-phone',use:{...devices['iPhone 13']}},
  ],
});
