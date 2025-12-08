import { chromium } from "playwright";
import path from "path";
import fs from "fs";

async function run() {
  const profilePath = process.env.PROFILE_PATH || "./profile";

  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("🚀 Loading Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    viewport: { width: 1280, height: 800 },
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
    console.log("🌐 Opening Medium new story editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle", timeout: 180000 });

    const editorSelector = 'div[contenteditable="true"]';
    let editorFound = false;
    for (let i = 0; i < 30; i++) {
      try {
        const visible = await page.$eval(editorSelector, el => !!el.offsetParent);
        if (visible) {
          editorFound = true;
          console.log(`✅ Editor detected on attempt ${i + 1}`);
          await page.click(editorSelector);
          break;
        }
      } catch {}
      await page.waitForTimeout(5000);
    }

    if (!editorFound) throw new Error("❌ Medium editor not found after retries");

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
    console.error("❌ Error occurred:", err);

    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    await page.screenshot({ path: path.join(debugDir, `failure-${timestamp}.png`), fullPage: true });
    fs.writeFileSync(path.join(debugDir, `failure-${timestamp}.html`), await page.content());

    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

run().catch(err => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
