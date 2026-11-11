import { defineConfig, devices } from '@playwright/test';
import { launchOptions } from './tools/chrome.mjs';
export default defineConfig({
  testDir: 'test', testMatch: '*.spec.mjs', timeout: 60000,
  webServer: { command: 'node tools/sync-web.mjs && node tools/serve.mjs 4173', port: 4173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:4173', launchOptions },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 }, launchOptions } },
    { name: 'phone', use: { ...devices['iPhone 15'], browserName: 'chromium', launchOptions } },
  ],
});
