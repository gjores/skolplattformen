import base from './playwright.usability.config';
import {defineConfig,devices} from '@playwright/test';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
const out=existsSync('/private/tmp')?'/private/tmp':tmpdir();
// Cloud containers ship only a pre-installed Chromium. There the phone project keeps the iPhone 13 viewport,
// touch and mobile flags but runs in Chromium instead of WebKit; the report states which engine was used.
const chromium=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE??(existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':undefined);
const {defaultBrowserType:_engine,...iphone}=devices['iPhone 13'];void _engine;
const projects=chromium?[
 {name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000},launchOptions:{executablePath:chromium}}},
 {name:'phone',use:{...iphone,browserName:'chromium' as const,launchOptions:{executablePath:chromium}}},
]:base.projects;
export default defineConfig({...base,projects,testMatch:'grim-class-links.spec.ts',outputDir:`${out}/grim-class-links`,reporter:[['list'],['json',{outputFile:`${out}/grim-class-links.json`}]]});
