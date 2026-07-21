import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5183',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node ../../scripts/start-e2e-api.mjs',
      url: 'http://127.0.0.1:8797/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'VITE_API_URL=http://127.0.0.1:8797 pnpm exec vite --host 127.0.0.1 --port 5183',
      url: 'http://127.0.0.1:5183',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
