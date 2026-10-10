import { chromium } from "@playwright/test";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

const PROFILE = join(homedir(), ".cache", "gh-upload-profile");
const ASSET = /https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+/;
const COMMENT_BOX = "textarea#new_comment_field";
const USAGE = `Usage:
  npm run media:login
  npm run media:upload -- <pull-request-or-issue-url> <image-or-video>...`;

async function login(): Promise<void> {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1200, height: 900 },
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://github.com/login");
    await page.waitForURL(
      (url) => !/^\/(login|session|sessions)|two-factor/.test(url.pathname),
      { timeout: 600_000 },
    );
    console.log("Signed in. The session is saved outside the repo.");
  } finally {
    await context.close();
  }
}

async function upload(url: string, files: readonly string[]): Promise<void> {
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(url);
    const box = page.locator(COMMENT_BOX);
    await box.waitFor({ timeout: 30_000 });
    const input = page
      .locator('form.js-new-comment-form input[type="file"]')
      .first();
    for (const file of files) {
      await box.fill("");
      await input.setInputFiles(resolve(file));
      await page.waitForFunction(
        ([selector, source]) => {
          const field = document.querySelector(selector ?? "");
          return (
            field instanceof HTMLTextAreaElement &&
            new RegExp(source ?? "").test(field.value)
          );
        },
        [COMMENT_BOX, ASSET.source],
        { timeout: 60_000 },
      );
      const link = ASSET.exec(await box.inputValue())?.[0];
      if (!link) throw new Error(`GitHub returned no link for ${file}.`);
      console.log(`${basename(file)}\t${link}`);
    }
    await box.fill("");
  } finally {
    await context.close();
  }
}

const [command, url, ...files] = process.argv.slice(2);
if (command === "login") await login();
else if (command === "upload" && url && files.length) await upload(url, files);
else {
  console.error(USAGE);
  process.exitCode = 2;
}
