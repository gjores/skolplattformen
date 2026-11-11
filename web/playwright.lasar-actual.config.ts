import {defineConfig,devices} from '@playwright/test';
import path from 'node:path';
// 05.1-22: faktiskt prov av läsårskalendern. Startas bara av work/pilot/verify-lasar-actual.mjs, som äger
// kandidaten, Worker på 127.0.0.1:3016, schemakopian och det privata manifestet. Andra mål nekas.
const baseURL=process.env.PHASE5_BASE_URL;
const manifest=process.env.LASAR_ACTUAL_MANIFEST;
const evidence=process.env.LASAR_ACTUAL_EVIDENCE_DIR;
if(baseURL!=='http://127.0.0.1:3016'||!manifest?.startsWith('/private/tmp/')||!evidence?.startsWith('/private/tmp/'))
  throw new Error('Läsårskalenderns faktiska prov kräver egen kandidat på 3016 och privat manifest från verify-lasar-actual.mjs.');
const common={baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',trace:'off' as const,video:'off' as const,screenshot:'off' as const,actionTimeout:25000,navigationTimeout:45000};
export default defineConfig({
  testDir:'./e2e',testMatch:/lasar-actual\.spec\.ts$/,outputDir:path.join(evidence,'playwright-output'),
  timeout:1800000,expect:{timeout:25000},fullyParallel:false,workers:1,retries:0,maxFailures:1,
  reporter:[['list'],['json',{outputFile:path.join(evidence,'playwright-actual.json')}]],
  use:common,
  webServer:{command:'npx vite --config vite.mandate-test.config.ts --host 127.0.0.1 --port 3017 --strictPort',url:'http://127.0.0.1:3017/e2e/fixtures/lasar-preview.html',reuseExistingServer:false,timeout:60000},
  projects:[
    {name:'desktop',use:{...devices['Desktop Chrome'],...common,viewport:{width:1440,height:900}}},
    {name:'desktop-small',use:{...devices['Desktop Chrome'],...common,viewport:{width:1024,height:768}}},
    {name:'phone',use:{...devices['iPhone 13'],...common,browserName:'webkit'}},
    {name:'phone-small',use:{...devices['iPhone 13'],...common,browserName:'webkit',viewport:{width:320,height:740}}},
  ],
});
