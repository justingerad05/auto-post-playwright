import { chromium } from "playwright";
import fs from "fs";

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log("Starting test post…");

  // Load merged login state
  const state = "medium-state.json";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();

  console.log("Opening Medium editor…");
  await page.goto("https://medium.com/new-story", { timeout: 0 });

  // Cloudflare challenge bypass wait
  console.log("Waiting for Cloudflare…");
  await wait(8000);

  // Fill test title
  await page.waitForSelector('textarea[placeholder="Title"]', { timeout: 0 });
  await page.fill('textarea[placeholder="Title"]', "🔥 Test Post From Playwright Automation");

  // Fill test body
  await page.keyboard.press("Tab");
  await page.keyboard.type("This is a test post created automatically using Playwright.");

  // Wait a little
  await wait(2000);

  console.log("Opening publish menu…");
  await page.click('button:has-text("Publish")');

  await page.waitForSelector('button:has-text("Publish now")', { timeout: 0 });
  await page.click('button:has-text("Publish now")');

  console.log("✔ Test post published successfully!");
  await browser.close();
}

run();
