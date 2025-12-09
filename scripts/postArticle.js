// scripts/postArticle.js
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
  } catch (err) {
    console.error("❌ Invalid MEDIUM_COOKIES format.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies }
  });

  const page = await context.newPage();

  try {
    console.log("🔵 Opening new Medium story...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForSelector("h1", { timeout: 20000 });

    const title = "Automated Post Title";
    const body = "This is the body of the automated post.";

    console.log("✍️ Writing title...");
    await page.fill("h1", title);

    console.log("✍️ Writing article body...");
    const editor = await page.$("div[role='textbox']");
    if (editor) {
      await editor.type(body, { delay: 30 });
    } else {
      throw new Error("Could not find editor box");
    }

    const screenshotPath = path.join(
      SCREENSHOT_DIR,
      `article-filled-${Date.now()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Article screenshot saved: ${screenshotPath}`);

    console.log("✅ Article filled successfully.");
  } catch (err) {
    console.error("❌ Error creating article:", err.message);

    const failShot = path.join(
      SCREENSHOT_DIR,
      `article-fail-${Date.now()}.png`
    );
    await page.screenshot({ path: failShot, fullPage: true });
    console.log(`📸 Fail screenshot saved: ${failShot}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
