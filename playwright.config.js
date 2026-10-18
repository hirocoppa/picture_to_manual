import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test',
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, ...process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {} },
  webServer: { command: 'npm run build && npm run preview -- --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
