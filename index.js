import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

async function run() {
  const profilePath = process.env.PROFILE_PATH || "./profile";

  if (!fs.existsSync(profilePath)) {
    console.error("❌ Profile folder not found:", profilePath);
    process.exit(1);
  }

  console.log("Loading Medium profile from:", profilePath);

  const browser = await chromium.launchPersistentContext(profilePath, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-web-security",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Medium new story editor...");

    // Retry navigation instead of relying on networkidle (Medium never becomes idle)
    for (let i = 0; i < 5; i++) {
      try {
        await page.goto("https://medium.com/new-story", {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        break;
      } catch {
        console.log(`Retrying navigation... attempt ${i + 2}`);
      }
    }

    // Check if Medium kicked you back to login
    if (page.url().includes("signin")) {
      throw new Error("❌ Medium redirected to login. Profile cookies invalid.");
    }

    // Wait for editor
    const editorSelector = 'div[contenteditable="true"]';
    console.log("Waiting for Medium editor to appear...");

    await page.waitForSelector(editorSelector, {
      timeout: 120000
    });

    await page.click(editorSelector);

    console.log("Typing test post...");

    const testTitle = "Automation Test Post (Please Ignore)";
    const testBody = "This is a *test post* to confirm Medium automation works.";

    await page.keyboard.type(testTitle);
    await page.keyboard.press("Tab");
    await page.keyboard.type(testBody);

    console.log("Opening Publish modal...");
    await page.click('text=Publish');

    console.log("Publishing...");
    await page.waitForSelector('button:has-text("Publish now")', { timeout: 60000 });
    await page.click('button:has-text("Publish now")');

    console.log("🎉 Test post successfully published!");

  } catch (err) {
    console.error("❌ Error:", err);

    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    const screenshotPath = path.join(debugDir, `failure-${ts}.png`);
    const htmlPath = path.join(debugDir, `failure-${ts}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, await page.content());

    console.log("📸 Debug files saved.");
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

run();
