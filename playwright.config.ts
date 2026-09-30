import { defineConfig } from "@playwright/test";

const port = Number(process.env["PLAYWRIGHT_DEV_PORT"] ?? "4173");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PLAYWRIGHT_DEV_PORT must be an integer from 1 to 65535.");
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  testIgnore: "**/production.spec.ts",
  forbidOnly: Boolean(process.env["CI"]),
  workers: 2,
  outputDir: "test-results/development",
  reporter: process.env["CI"]
    ? [
        ["github"],
        [
          "html",
          { outputFolder: "playwright-report/development", open: "never" },
        ],
      ]
    : "list",
  use: {
    baseURL,
    launchOptions: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"]
      ? { executablePath: process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH"] }
      : {},
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
  },
});
