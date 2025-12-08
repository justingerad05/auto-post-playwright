import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const DEBUG_DIR = path.join(process.cwd(), "debug");
if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

async function safeGoto(page, url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      console.log(`Navigating to ${url} (attempt ${i})...`);
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      return;
    } catch (err) {
      console.warn(`⚠️ Attempt ${i} failed: ${err.message}`);
      if (i === retries) throw err;
    }
  }
}

async function run() {
  try {
    console.log("Launching browser...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      storageState: './mediumState.json'
    });

    const page = await context.newPage();

    await safeGoto(page, "https://medium.com/new-story");

    console.log("Waiting for editor textbox...");
    await page.waitForSelector("section div[role='textbox']", { timeout: 60000 });

    const testTitle = "Automation Test Post (Please Ignore)";
    const testBody = "This is a *test post* to confirm Medium automation is working.";

    await page.click("section div[role='textbox']");
    await page.keyboard.type(testTitle);
    await page.keyboard.press("Tab");
    await page.keyboard.type(testBody);

    console.log("Opening Publish modal...");
    await page.click('text=Publish');
    await page.waitForSelector('button:has-text("Publish now")', { timeout: 30000 });
    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post published successfully!");
    await browser.close();
  } catch (err) {
    console.error("❌ Error occurred:", err);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = path.join(DEBUG_DIR, `failure-${timestamp}.png`);
    const htmlPath = path.join(DEBUG_DIR, `failure-${timestamp}.html`);

    try {
      if (err.page) {
        await err.page.screenshot({ path: screenshotPath });
        fs.writeFileSync(htmlPath, await err.page.content());
        console.log(`📸 Screenshot saved to: ${screenshotPath}`);
        console.log(`💾 HTML saved to: ${htmlPath}`);
      }
    } catch (e) {
      console.log("⚠️ Could not capture screenshot/HTML:", e);
    }

    process.exit(1);
  }
}

run();
