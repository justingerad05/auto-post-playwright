import { chromium } from "playwright";
import stealth from "@extra/stealth-playwright";
import * as path from "path";
import * as fs from "fs";

stealth(chromium);

// Enhanced error logging
process.on("uncaughtException", err => {
  console.log("UNCAUGHT ERROR:", err);
});
process.on("unhandledRejection", err => {
  console.log("UNHANDLED PROMISE:", err);
});

async function run() {
  console.log("=== Medium Automation Started ===");

  const profilePath = process.env.PROFILE_PATH || "./profile";

  // Ensure profile exists
  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("Using Medium profile at:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Medium Editor...");

    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded",
      timeout: 180000
    });

    // Cloudflare sanity check
    if (await page.$('div[id="challenge-stage"]')) {
      throw new Error("❌ Cloudflare challenge detected.");
    }

    const editorSelector = 'div[contenteditable="true"]';

    console.log("Waiting for editor...");

    await page.waitForSelector(editorSelector, {
      timeout: 120000
    });

    console.log("Editor found. Writing post...");

    const testTitle = "Automation Test Post (Please Ignore)";
    const testBody = "This is a *test post* to confirm Medium automation is working.";

    await page.click(editorSelector);
    await page.keyboard.type(testTitle);

    await page.keyboard.press("Tab");
    await page.keyboard.type(testBody);

    console.log("Opening publish modal...");

    await page.click('text=Publish');

    console.log("Waiting for 'Publish now' button...");
    await page.waitForSelector('button:has-text("Publish now")', {
      timeout: 60000
    });

    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post published successfully!");
  } catch (err) {
    console.error("❌ Error occurred:", err);

    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const t = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshot = path.join(debugDir, `failure-${t}.png`);
    const html = path.join(debugDir, `failure-${t}.html`);

    console.log("Saving screenshot:", screenshot);
    await page.screenshot({ path: screenshot, fullPage: true });

    console.log("Saving HTML:", html);
    fs.writeFileSync(html, await page.content());

    await browser.close();
    process.exit(1);
  }

  await browser.close();
  console.log("=== Finished ===");
}

run();
