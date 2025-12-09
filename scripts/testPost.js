// scripts/testPost.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function run() {
  let cookies;
  try {
    cookies = JSON.parse(process.env.MEDIUM_COOKIES || "[]");
  } catch {
    console.error("❌ Invalid MEDIUM_COOKIES format!");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies }
  });

  const page = await context.newPage();

  try {
    console.log("🔵 Opening Medium new-story page...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded"
    });

    // Close popups
    await page.$$eval(
      'button[aria-label="Close"], button[data-action="close"]',
      (buttons) => buttons.forEach((btn) => btn.click())
    );

    console.log("🔵 Waiting for editor...");
    await page.waitForSelector("h1, div[role='textbox']", { timeout: 30000 });

    console.log("✍️ Typing test title...");
    const title = await page.$("h1");
    if (title) await title.type("Test Post from GitHub Actions", { delay: 40 });

    console.log("✍️ Typing body...");
    const editorBox = await page.$("div[role='textbox']");
    if (editorBox)
      await editorBox.type("This is a test post sent automatically.", {
        delay: 40
      });

    console.log("✅ Test post completed!");

    const successShot = path.join(
      SCREENSHOT_DIR,
      `test-success-${Date.now()}.png`
    );
    await page.screenshot({ path: successShot, fullPage: true });
    console.log(`📸 Screenshot saved: ${successShot}`);
  } catch (err) {
    console.error("❌ Test post error:", err.message);

    const failShot = path.join(
      SCREENSHOT_DIR,
      `test-fail-${Date.now()}.png`
    );
    await page.screenshot({ path: failShot, fullPage: true });
    console.log(`📸 Fail screenshot saved: ${failShot}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
