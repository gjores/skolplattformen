import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
// 05.1-22: faktiskt prov av tjänstefördelningen. Startas bara av work/pilot/verify-tjanst-actual.mjs, som äger
// kandidaten, Worker på 127.0.0.1:3015, schemakopian och det privata manifestet. Andra mål nekas.
const baseURL=process.env.PHASE5_BASE_URL;
const manifest=process.env.TJANST_ACTUAL_MANIFEST;
const evidence=process.env.TJANST_ACTUAL_EVIDENCE_DIR;
if(baseURL!=='http://127.0.0.1:3015'||!manifest?.startsWith('/private/tmp/')||!evidence?.startsWith('/private/tmp/'))
  throw new Error('Tjänstefördelningens faktiska prov kräver egen kandidat på 3015 och privat manifest från verify-tjanst-actual.mjs.');
const common={baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',trace:'off' as const,video:'off' as const,screenshot:'off' as const,actionTimeout:25000,navigationTimeout:45000};
export default defineConfig({
  testDir:'./e2e',testMatch:/tjanst-actual\.spec\.ts$/,outputDir:path.join(evidence,'playwright-output'),
  timeout:1800000,expect:{timeout:25000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list'],['json',{outputFile:path.join(evidence,'playwright-actual.json')}]],
  use:common,
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],...common,viewport:{width:1440,height:900}}},
    {name:'desktop-small',use:{...devices['Desktop Chrome'],...common,viewport:{width:1024,height:768}}},
    {name:'phone',use:{...devices['iPhone 13'],...common,browserName:'webkit'}},
    {name:'phone-small',use:{...devices['iPhone 13'],...common,browserName:'webkit',viewport:{width:320,height:740}}},
  ],
});
