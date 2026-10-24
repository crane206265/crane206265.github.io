import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/browser',testIgnore:'**/sheets.spec.ts',timeout:30000,workers:1,use:{baseURL:'http://127.0.0.1:5173',headless:true,launchOptions:{executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'},screenshot:'only-on-failure'},reporter:'list'});
