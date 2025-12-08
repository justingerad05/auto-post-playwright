import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

async function run() {
  const profilePath = process.env.PROFILE_PATH || "./profile";

  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("Loading Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true, // GitHub Actions requires headless
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Medium new story editor...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "networkidle",
      timeout: 180000
    });

    // Retry loop to find the editor reliably
    const editorSelector = 'div[contenteditable="true"]';
    let editorFound = false;
    for (let i = 0; i < 30; i++) { // retry for up to ~3 minutes
      try {
        const visible = await page.$eval(editorSelector, el => !!el.offsetParent);
        if (visible) {
          editorFound = true;
          console.log(`✅ Editor detected on attempt ${i + 1}`);
          await page.click(editorSelector);
          break;
        }
      } catch {}
      await page.waitForTimeout(5000); // wait 5s between retries
    }

    if (!editorFound) throw new Error("❌ Medium editor not found after retries");

    const testTitle = "Automation Test Post (Please Ignore)";
    const testBody = "This is a *test post* to confirm Medium automation is working.";

    console.log("Writing post title...");
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
  } catch (err) {
    console.error("❌ Error occurred:", err);

    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = path.join(debugDir, `failure-${timestamp}.png`);
    const htmlPath = path.join(debugDir, `failure-${timestamp}.html`);

    console.log(`📸 Saving screenshot to: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`💾 Saving page HTML to: ${htmlPath}`);
    fs.writeFileSync(htmlPath, await page.content());

    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

run().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
