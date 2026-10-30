import base from './playwright.tjanst-p2.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,
 testMatch:/tjanst-(ui|p1-class|p1-drafts|p2-search|p2-navigation|oneclick|edit-teacher|workspace-ux|review-42)\.spec\.ts/,
 outputDir:'/private/tmp/tjanst-oneclick-37',
 reporter:[['list'],['json',{outputFile:'/private/tmp/tjanst-oneclick-37.json'}]],
});
