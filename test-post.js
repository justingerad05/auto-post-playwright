import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const profilePath = process.env.PROFILE_PATH || "./profile";

async function run() {
  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("🚀 Using Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true, // keep true for GitHub Actions
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--window-size=1280,800"
    ]
  });

  const page = await browser.newPage();

  // Retry navigation to bypass Cloudflare / network issues
  let success = false;
  for (let i = 0; i < 5; i++) {
    try {
      console.log(`🌐 Attempting to open Medium editor (try ${i + 1})...`);
      await page.goto("https://medium.com/new-story", {
        waitUntil: "networkidle",
        timeout: 90000
      });
      success = true;
      break;
    } catch (err) {
      console.warn("⚠️ Navigation failed, retrying in 10s...");
      await page.waitForTimeout(10000);
    }
  }

  if (!success) {
    console.error("❌ Unable to load Medium editor after retries");
    await saveDebug(page);
    await browser.close();
    process.exit(1);
  }

  try {
    const editorSelector = 'div[contenteditable="true"]';
    await page.waitForSelector(editorSelector, { timeout: 30000 });
    await page.click(editorSelector);

    console.log("✍️ Writing test post...");
    await page.keyboard.type("Automation Test Post (Ignore)");
    await page.keyboard.press("Tab");
    await page.keyboard.type("This is a test post to confirm Medium automation is working.");

    console.log("🚀 Publishing...");
    await page.click('text=Publish');
    await page.waitForSelector('button:has-text("Publish now")', { timeout: 60000 });
    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post published successfully!");
  } catch (err) {
    console.error("❌ Error during posting:", err);
    await saveDebug(page);
    process.exit(1);
  }

  await browser.close();
}

async function saveDebug(page) {
  const debugDir = path.join(process.cwd(), "debug");
  if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await page.screenshot({ path: path.join(debugDir, `failure-${timestamp}.png`), fullPage: true });
  fs.writeFileSync(path.join(debugDir, `failure-${timestamp}.html`), await page.content());
}

run().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
