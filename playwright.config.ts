import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './ui-tests',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:8899',
    headless: true
  },
  reporter: [['line'], ['html', { open: 'never' }]]
});

