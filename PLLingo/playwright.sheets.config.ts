import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,testMatch:'**/sheets.spec.ts',testIgnore:[],outputDir:'test-results/sheets',use:{...base.use,baseURL:'http://127.0.0.1:5174'}});
