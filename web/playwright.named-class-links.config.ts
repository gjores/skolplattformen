import base from './playwright.usability.config';
import {defineConfig} from '@playwright/test';
export default defineConfig({...base,testMatch:'named-class-links.spec.ts',outputDir:'/private/tmp/named-class-links',reporter:[['list'],['json',{outputFile:'/private/tmp/named-class-links.json'}]]});
