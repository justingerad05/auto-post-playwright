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
    headless: true,
    viewport: { width: 1400, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    javaScriptEnabled: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-site-isolation-trials",
      "--disable-web-security",
      "--disable-setuid-sandbox",
      "--no-sandbox",
      "--no-first-run",
      "--disable-infobars",
      "--disable-gpu",
      "--window-size=1400,900"
    ]
  });

  const page = await browser.newPage();

  try {
    console.log("Opening Medium homepage...");
    await page.goto("https://medium.com/", {
      waitUntil: "domcontentloaded",
      timeout: 180000
    });

    // Confirm logged-in session works
    if (page.url().includes("signin")) {
      throw new Error("❌ Login session blocked — cookies not accepted by Medium");
    }

    console.log("Opening new story page (safe load)...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded",
      timeout: 180000
    });

    // Check for blocked page
    const html = await page.content();
    if (
      html.includes("captcha") ||
      html.includes("challenge") ||
      html.includes("error") ||
      page.url().includes("signin")
    ) {
      throw new Error("❌ Medium blocked access to editor — challenge detected.");
    }

    // Fallback: click "Write" button if editor isn't ready
    if (!(await page.$('div[contenteditable="true"]'))) {
      console.log("Editor not found — trying Write button...");
      await page.goto("https://medium.com/", { waitUntil: "domcontentloaded" });
      await page.click('a[href="/new-story"]', { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(5000);
    }

    // Retry 20 times
    const editorSelector = 'div[contenteditable="true"]';
    let editorFound = false;

    for (let i = 0; i < 20; i++) {
      const exists = await page.$(editorSelector);
      if (exists) {
        editorFound = true;
        console.log("✅ Editor detected!");
        break;
      }
      console.log(`Editor retry ${i + 1}/20...`);
      await page.waitForTimeout(4000);
    }

    if (!editorFound) throw new Error("❌ Medium editor not found.");

    const testTitle = "Automation Test Post (Please Ignore)";
    const testBody = "This is a test post created automatically.";

    console.log("Typing title...");
    await page.click(editorSelector);
    await page.keyboard.type(testTitle);

    console.log("Typing body...");
    await page.keyboard.press("Tab");
    await page.keyboard.type(testBody);

    console.log("Opening Publish modal...");
    await page.click('text=Publish', { timeout: 60000 });

    console.log("Publishing...");
    await page.click('button:has-text("Publish now")', { timeout: 60000 });

    console.log("🎉 SUCCESS — Post published!");
  } catch (err) {
    console.error("❌ Error occurred:", err);

    const debugDir = path.join(process.cwd(), "debug");
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const screenshotPath = path.join(debugDir, `failure-${timestamp}.png`);
    const htmlPath = path.join(debugDir, `failure-${timestamp}.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
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
