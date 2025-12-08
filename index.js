import { chromium } from "playwright";
import fs from "fs";
import path from "path";

/**
 * Safe navigation with retries
 */
async function safeGoto(page, url, retries = 3, timeout = 60000) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout });
      return;
    } catch (err) {
      console.warn(`⚠️ Attempt ${i + 1} failed for ${url}: ${err.message}`);
      if (i === retries - 1) throw err;
    }
  }
}

async function run() {
  const profilePath = process.env.PROFILE_PATH || "./profile";

  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("Loading Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: false,   // non-headless for CI stability
    slowMo: 50,        // slows down actions slightly
  });

  const page = await browser.newPage();

  console.log("Opening Medium new story editor...");
  await safeGoto(page, "https://medium.com/new-story");

  // Test title + content
  const testTitle = "Automation Test Post (Please Ignore)";
  const testBody = "This is a *test post* to confirm Medium automation is working.";

  console.log("Writing post title...");
  await page.click("section div[role='textbox']");
  await page.keyboard.type(testTitle);

  console.log("Writing post body...");
  await page.keyboard.press("Tab");
  await page.keyboard.type(testBody);

  console.log("Opening Publish modal...");
  await page.click('text=Publish');

  console.log("Finalizing publish...");
  await page.waitForSelector('button:has-text("Publish now")', { timeout: 60000 });
  await page.click('button:has-text("Publish now")');

  console.log("🎉 Test post published successfully!");
  await browser.close();
}

run().catch(err => {
  console.error("❌ Error occurred:", err);
  process.exit(1);
});
