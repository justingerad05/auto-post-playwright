import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  console.log("🔵 Running test post…");

  const cookiesBase64 = process.env.MEDIUM_COOKIES;
  const storageBase64 = process.env.MEDIUM_STORAGE;

  if (!cookiesBase64 || !storageBase64) {
    console.error("❌ MEDIUM_COOKIES or MEDIUM_STORAGE not found!");
    process.exit(1);
  }

  let cookies, storage;
  try {
    cookies = JSON.parse(Buffer.from(cookiesBase64, "base64").toString());
    storage = JSON.parse(Buffer.from(storageBase64, "base64").toString());
  } catch (e) {
    console.error("❌ Failed to parse base64 JSON:", e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: { cookies, origins: storage.origins || [] }
  });

  const page = await context.newPage();
  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  // Wait extra for Cloudflare
  await page.waitForTimeout(8000);

  // Close potential modals
  const modalSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button:has-text("Skip for now")',
    'button:has-text("Not now")'
  ];
  for (const sel of modalSelectors) {
    const modal = await page.$(sel);
    if (modal) {
      await modal.click();
      await page.waitForTimeout(500);
    }
  }

  // Editor selectors
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
    console.warn("❌ Could not find the editor, Cloudflare may still block it.");
    const screenshotDir = path.resolve(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `medium-editor-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
  }

  await browser.close();
}

run();
