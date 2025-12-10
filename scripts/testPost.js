import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  console.log("🔵 Running test post…");

  // Read secrets (raw JSON strings, not base64)
  let cookies, storage;

  try {
    cookies = JSON.parse(process.env.MEDIUM_COOKIES);
    storage = JSON.parse(process.env.MEDIUM_STORAGE);
  } catch (e) {
    console.error("❌ Failed to parse MEDIUM_COOKIES or MEDIUM_STORAGE:", e.message);
    process.exit(1);
  }

  // Build a proper Playwright storageState object
  const storageState = {
    cookies: cookies,
    origins: storage.origins || []
  };

  const browser = await chromium.launch({ headless: false });

  const context = await browser.newContext({
    storageState
  });

  const page = await context.newPage();
  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  // Wait for Cloudflare
  await page.waitForTimeout(6000);

  // Try closing modals
  const modalSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button:has-text("Skip for now")',
    'button:has-text("Not now")'
  ];
  for (const sel of modalSelectors) {
    try {
      const modal = await page.$(sel);
      if (modal) await modal.click();
    } catch {}
  }

  // Look for editor
  const editorSelectors = [
    'div[data-placeholder="Title"]',
    'div[role="textbox"]',
    'div[data-placeholder="Write here…"]',
    'textarea'
  ];

  let editorFound = false;
  for (const sel of editorSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 15000 });
      console.log(`✅ Editor found: ${sel}`);
      editorFound = true;
      break;
    } catch {}
  }

  if (!editorFound) {
    console.warn("❌ Editor not found, screenshotting page…");
    const screenshotPath = `medium-editor-fail-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log("📸 Saved:", screenshotPath);
  }

  await browser.close();
}

run();
