import {defineConfig} from '@playwright/test';
import base from './playwright.usability.config';
export default defineConfig({...base,testMatch:'named-planning-overview.spec.ts',expect:{timeout:15000},outputDir:'/private/tmp/named-planning',reporter:[['list'],['json',{outputFile:'/private/tmp/named-planning.json'}]]});
