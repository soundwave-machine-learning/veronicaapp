import { defineConfig, devices } from '@playwright/test';

/**
 * The browser tests run the real production build (`NODE_ENV=production`,
 * password required), each server on its own brand-new database:
 * - port 3200: the main workflows (signed in once by e2e/auth.setup.ts)
 * - port 3201: sign-in and first-run tests, starting from an empty database
 */
export const E2E_PASSWORD = 'e2e-test-password';
export const STORAGE_STATE = '.e2e-data/signed-in.json';
const run = Date.now();

const server = (port: number, name: string) => ({
  command: 'node dist/server/server/index.js',
  url: `http://localhost:${port}/api/health`,
  reuseExistingServer: false,
  env: {
    PORT: String(port),
    DATABASE_PATH: `.e2e-data/${name}-${run}.db`,
    NODE_ENV: 'production',
    APP_PASSWORD: E2E_PASSWORD,
    TZ: process.env.TZ ?? 'UTC',
  },
});

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  projects: [
    {
      name: 'first-run',
      testMatch: /0-.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: 'http://localhost:3201' },
    },
    { name: 'sign-in', testMatch: /auth\.setup\.ts/, use: { baseURL: 'http://localhost:3200' } },
    {
      name: 'desktop',
      testMatch: /[12]-.*\.spec\.ts/,
      dependencies: ['sign-in'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        baseURL: 'http://localhost:3200',
        storageState: STORAGE_STATE,
      },
    },
  ],
  webServer: [server(3200, 'workflows'), server(3201, 'first-run')],
});
