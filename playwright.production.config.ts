import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "**/pageRoutes.spec.ts",
    "**/production.spec.ts",
    "**/compConcurrentSaves.spec.ts",
    "**/mapPicker.spec.ts",
  ],
  forbidOnly: Boolean(process.env["CI"]),
  workers: 2,
  outputDir: "test-results/production",
  reporter: process.env["CI"]
    ? [
        ["github"],
        [
          "html",
          { outputFolder: "playwright-report/production", open: "never" },
        ],
      ]
    : "list",
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        launchOptions: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
          ? {
              executablePath:
                process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"],
            }
          : {},
      },
    },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command:
      "npm run build && npm run preview -- --host 127.0.0.1 --port 4174 --strictPort",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
