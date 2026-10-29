import base from './playwright.tjanst-ui.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,
 testMatch:/tjanst-(ui|p1-class|p1-drafts)\.spec\.ts/,
 use:{...base.use,baseURL:'http://127.0.0.1:5209'},
 webServer:{command:'npx vite --config vite.mandate-test.config.ts --port 5209',url:'http://127.0.0.1:5209/e2e/fixtures/tjanst-preview.html',reuseExistingServer:false},
 outputDir:'/private/tmp/tjanst-p1-35',
 reporter:[['list'],['json',{outputFile:'/private/tmp/tjanst-p1-35.json'}]],
});
