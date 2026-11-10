// Simulerat UI-prov för Läsår & skoldagar i skyddad drift (05.1.1). Fixturen
// e2e/fixtures/lasar-preview.html svarar på /api/lasar/* med en mock i
// webbläsaren och syntetiska data; ingen databas, server eller inloggning.
import base from './playwright.usability.config';
import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
const out=existsSync('/private/tmp')?'/private/tmp':tmpdir();
// Som playwright.tjanst-ui.config.ts: telefonprojekten kör WebKit lokalt och Chromium där bara den finns.
const chromium=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined);
const {defaultBrowserType:_engine,...iphone}=devices['iPhone 13'];void _engine;
const phoneEngine=chromium?{browserName:'chromium' as const,launchOptions:{executablePath:chromium}}:{};
const desktopEngine=chromium?{launchOptions:{executablePath:chromium}}:{};
export default defineConfig({...base,testMatch:/lasar-(ui|start|basis)\.spec\.ts/,timeout:60_000,outputDir:`${out}/lasar-ui`,
 projects:[
  {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:900},...desktopEngine}},
  {name:'desktop-small',use:{...devices['Desktop Chrome'],viewport:{width:1024,height:768},...desktopEngine}},
  {name:'phone',use:{...iphone,...phoneEngine}},
  {name:'phone-small',use:{...iphone,viewport:{width:320,height:740},...phoneEngine}},
 ],
 reporter:[['list'],['json',{outputFile:`${out}/lasar-ui.json`}]]});
