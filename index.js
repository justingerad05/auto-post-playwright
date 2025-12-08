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
    headless: false,  // Medium blocks headless
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
      waitUntil: "domcontentloaded",
      timeout: 180000
    });

    // Wait for editor (try multiple possible selectors)
    const editorSelectors = [
      'section div[role="textbox"]',           // current editor
      'div[data-placeholder="Title"]',        // backup selector
      'div[contenteditable="true"]'           // generic editable div
    ];

    let editorFound = false;
    for (const selector of editorSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        console.log(`Editor found using selector: ${selector}`);
        editorFound = true;
        await page.click(selector);
        break;
      } catch {
        // try next selector
      }
    }

    if (!editorFound) {
      throw new Error("❌ Medium editor not found using any selector");
    }

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
    await page.waitForSelector('button:has-text("Publish now")');
    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post published successfully!");
  } catch (err) {
    console.error("❌ Error occurred:", err);

    // Save screenshot and HTML for debugging
    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const screenshotPath = path.join(debugDir, `failure-${timestamp}.png`);
    const htmlPath = path.join(debugDir, `failure-${timestamp}.html`);

    console.log(`📸 Saving screenshot to: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    console.log(`💾 Saving page HTML to: ${htmlPath}`);
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent);

    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

run().catch(async (err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
