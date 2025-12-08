import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  const DEBUG_DIR = "./debug";
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR);

  try {
    console.log("Launching with persistent context…");

    const browserContext = await chromium.launchPersistentContext(
      path.resolve("./profile/medium-profile"),
      {
        headless: true,
        viewport: { width: 1280, height: 800 }
      }
    );

    const page = await browserContext.newPage();
    console.log("Opening Medium editor…");

    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

    await page.waitForSelector("section div[role='textbox']");

    await page.click("section div[role='textbox']");
    await page.keyboard.type("Automation Test Post (Ignore)");
    await page.keyboard.press("Tab");
    await page.keyboard.type("This is a test post to verify Playwright automation.");

    await page.click("text=Publish");
    await page.waitForSelector('button:has-text("Publish now")');
    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post published!");
    await browserContext.close();
  } catch (err) {
    console.log("❌ Error:", err);

    const time = Date.now();
    const screenshot = `${DEBUG_DIR}/error-${time}.png`;

    try {
      const page = err.page || null;
      if (page) await page.screenshot({ path: screenshot });
    } catch {}

    process.exit(1);
  }
}

run();
