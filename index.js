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
    headless: true,       // headless works in GitHub Actions
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Medium new story editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle", timeout: 120000 });

    // Wait for editor to appear (title input)
    await page.waitForSelector("section div[role='textbox']", { timeout: 120000 });

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
