import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration for Monmouth Wallet SDK
 *
 * Configuration optimized for:
 * - Wallet extension testing with Chrome
 * - Local Anvil chain integration
 * - CI/CD pipeline support
 */
export default defineConfig({
  testDir: './e2e/specs',

  /* Run tests in files in parallel (disabled in CI for stability) */
  fullyParallel: !process.env.CI,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Limit workers in CI for stability, allow more locally */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'e2e/reports', open: 'never' }],
    ...(process.env.CI ? [['github' as const]] : []),
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL for the test application */
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',

    /* Collect trace on first retry for debugging */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video recording for debugging flaky tests */
    video: process.env.CI ? 'on-first-retry' : 'off',

    /* Timeout for actions like click, fill, etc */
    actionTimeout: 10_000,

    /* Timeout for navigation */
    navigationTimeout: 30_000,
  },

  /* Test timeout */
  timeout: 60_000,

  /* Expect timeout */
  expect: {
    timeout: 10_000,
  },

  /* Configure projects - Chrome only for wallet extension support */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Enable for wallet extension testing */
        launchOptions: {
          args: [
            '--disable-web-security',
            '--allow-running-insecure-content',
          ],
        },
      },
    },
    /* Optional: Chrome with extension for full wallet testing */
    // {
    //   name: 'chrome-with-wallet',
    //   use: {
    //     ...devices['Desktop Chrome'],
    //     launchOptions: {
    //       args: [
    //         `--disable-extensions-except=${process.env.WALLET_EXTENSION_PATH}`,
    //         `--load-extension=${process.env.WALLET_EXTENSION_PATH}`,
    //       ],
    //     },
    //   },
    // },
  ],

  /* Run local dev server before starting the tests */
  webServer: process.env.E2E_SKIP_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },

  /* Output folder for test artifacts */
  outputDir: 'e2e/test-results',

  /* Global setup for Anvil chain */
  globalSetup: process.env.E2E_SKIP_ANVIL ? undefined : './e2e/setup/global-setup.ts',
  globalTeardown: process.env.E2E_SKIP_ANVIL ? undefined : './e2e/setup/global-teardown.ts',
})
