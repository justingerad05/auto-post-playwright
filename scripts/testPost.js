import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  console.log("🔵 Running test post...");

  const cookiesEnv = process.env.MEDIUM_COOKIES;
  if (!cookiesEnv) {
    console.error("❌ MEDIUM_COOKIES not found!");
    process.exit(1);
  }

  const cookies = JSON.parse(cookiesEnv);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: { cookies, origins: [] } });
  const page = await context.newPage();

  await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded" });

  // Close possible modals
  const modalSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button:has-text("Skip for now")',
    'button:has-text("Not now")'
  ];
  for (const sel of modalSelectors) {
    const modal = await page.$(sel);
    if (modal) await modal.click().catch(() => {});
  }

  // Updated selectors (robust)
  const editorSelectors = [
    'div[data-placeholder="Title"]',             // Title box
    'div[role="textbox"]',                        // Main editor
    'div[data-placeholder="Start writing…"]',     // Alternate placeholder
    'div[data-testid="post-content"]',           // New Medium editor container
    'textarea'
  ];

  let editor;
  for (const sel of editorSelectors) {
    try {
      editor = await page.waitForSelector(sel, { timeout: 15000 });
      if (editor) {
        console.log(`✅ Editor found using selector: ${sel}`);
        break;
      }
    } catch {}
  }

  if (!editor) {
    console.warn("❌ Could not find the editor. Saving screenshot for debugging.");
    const screenshotDir = path.resolve(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `medium-editor-fail-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    process.exit(1); // stop workflow since editor not found
  }

  // Optional: type a test title & body
  await editor.type("Test Post from GitHub Actions", { delay: 50 });
  console.log("✅ Test title typed!");

  await browser.close();
}

run();
