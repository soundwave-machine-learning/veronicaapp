import { defineConfig, devices } from '@playwright/test';

// Every run starts the real production server on a brand-new, empty database.
const port = 3200;
const database = `.e2e-data/e2e-${Date.now()}.db`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: 'node dist/server/server/index.js',
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: false,
    env: { PORT: String(port), DATABASE_PATH: database, NODE_ENV: 'production', APP_PASSWORD: '' },
  },
});
