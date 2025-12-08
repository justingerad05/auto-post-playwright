import { chromium } from "undetectable-playwright";
import { prepareProfile } from "./profile-helper.js";
import fs from "fs";

async function run() {
  console.log("🛠 Preparing profile...");
  const profilePath = await prepareProfile();

  console.log("🚀 Launching Chrome Stealth...");
  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--start-maximized"
    ],
    viewport: null
  });

  const page = await browser.newPage();

  console.log("🌐 Opening Medium drafts page (Cloudflare-safe)...");
  await page.goto("https://medium.com/me/stories/drafts", { timeout: 0 });

  // Wait for Medium dashboard to load
  await page.waitForLoadState("networkidle");

  console.log("📝 Clicking 'Write a story'...");
  await page.waitForSelector('a[href="/new-story"]');
  await page.click('a[href="/new-story"]');

  console.log("✍️ Waiting for editor...");
  await page.waitForSelector("textarea", { timeout: 30000 });

  console.log("Typing test title...");
  await page.keyboard.type("This is a Test Post from Automation", { delay: 80 });

  await page.keyboard.press("Tab");
  await page.keyboard.type("Hello Medium! This is a fully automated test post.", { delay: 50 });

  console.log("💾 Opening publish popup...");
  await page.click('button:has-text("Publish")');

  console.log("⏳ Waiting publish modal...");
  await page.waitForSelector('button:has-text("Publish now")');

  console.log("🚀 Publishing...");
  await page.click('button:has-text("Publish now")');

  console.log("🎉 POST SENT SUCCESSFULLY!");

  await browser.close();
}

run().catch(console.error);
