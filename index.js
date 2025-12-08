import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  try {
    console.log(`Loading Medium profile from: ./profile`);

    const profilePath = path.resolve("./profile");

    if (!fs.existsSync(profilePath)) {
      throw new Error(`❌ Profile directory not found at ${profilePath}. Make sure your workflow downloads it.`);
    }

    // ============================
    // ✅ FIXED BROWSER LAUNCH HERE
    // ============================
    const context = await chromium.launchPersistentContext(profilePath, {
      headless: true,   // <-- REQUIRED FOR GITHUB ACTIONS
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox"
      ]
    });

    const page = await context.newPage();

    // ============================
    // Your existing Medium logic
    // ============================

    console.log("Navigating to Medium to verify login...");
    await page.goto("https://medium.com/me", { waitUntil: "networkidle" });

    // Check login successful
    const isLoggedIn = await page.locator("text=Profile").first().isVisible().catch(() => false);

    if (!isLoggedIn) {
      throw new Error("❌ Not logged into Medium. Cookies/profile may be invalid.");
    }

    console.log("✅ Logged in successfully!");

    // ============================
    // Create a test post on Medium
    // ============================

    console.log("Opening new Medium story editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

    console.log("Typing test story...");
    await page.locator("div[data-testid='storytitle']").fill("Automation Test Post");
    await page.locator("div[data-testid='storycontent']").fill("This is a test post published automatically using Playwright in GitHub Actions.");

    console.log("Publishing story...");
    await page.keyboard.press('Control+Shift+P');
    await page.waitForTimeout(3000);

    console.log("✅ Test post created successfully!");

    await context.close();

  } catch (error) {
    console.error(`❌ Unexpected error: ${error.message}`);

    // Capture screenshot for debugging
    try {
      if (!fs.existsSync("debug")) fs.mkdirSync("debug");
      const browser = await chromium.launch();
      const page = await browser.newPage();
      await page.screenshot({ path: "debug/error.png" });
      await browser.close();
      console.log("📸 Captured screenshot for debugging.");
    } catch (screenshotError) {
      console.log("⚠️ Could not capture screenshot.");
    }

    process.exit(1);
  }
}

run();
