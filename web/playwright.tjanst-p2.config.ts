import base from './playwright.tjanst-p1.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,
 testMatch:/tjanst-(ui|p1-class|p1-drafts|p2-search|p2-navigation)\.spec\.ts/,
 outputDir:'/private/tmp/tjanst-p2-36',
 reporter:[['list'],['json',{outputFile:'/private/tmp/tjanst-p2-36.json'}]],
});
