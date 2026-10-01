import { defineConfig, devices } from '@playwright/test';

// An optional system Chromium is useful in restricted sandboxes. CI uses Playwright's
// pinned browsers. This changes only the executable, never assertions or projects.
const chromiumLaunch = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
  : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/multi-spin-wheel-of-fortune/',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch },
    },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    {
      name: 'chromium-390x844',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromiumLaunch,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'webkit-390x844',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    // Browser tests exercise the built multi-page site, not Vite's history fallback.
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/multi-spin-wheel-of-fortune/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
