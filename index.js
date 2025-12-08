import { chromium } from "playwright";
import fs from "fs";
import path from "path";

async function run() {
  try {
    console.log(`Loading Medium profile from: ./profile`);

    const profilePath = path.resolve("./profile");

    if (!fs.existsSync(profilePath)) {
      throw new Error(`❌ Profile directory missing: ${profilePath}`);
    }

    console.log("Launching browser...");
    const context = await chromium.launchPersistentContext(profilePath, {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await context.newPage();

    // ⏳ Give Medium enough time to load cookies/session
    await page.waitForTimeout(5000);

    console.log("Navigating to Medium...");
    await page.goto("https://medium.com/me", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    // Check login
    const loggedIn = await page.locator("a[href*='/@']").first().isVisible().catch(() => false);

    if (!loggedIn) {
      throw new Error("❌ Not logged in. Profile / cookies may be invalid.");
    }

    console.log("✅ Logged in successfully!");

    console.log("Opening new story...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded"
    });

    await page.waitForSelector("div[data-testid='storytitle']");

    console.log("Typing title...");
    await page.locator("div[data-testid='storytitle']").fill("Automation Test Post From GitHub");

    console.log("Typing body...");
    await page.locator("div[data-testid='storycontent']").fill(
      "This is a test post automatically published using Playwright + GitHub Actions."
    );

    console.log("Publishing...");
    await page.keyboard.press("Control+Shift+P");
    await page.waitForTimeout(5000);

    console.log("✅ Test post created!");

    await context.close();
  } catch (err) {
    console.error(`❌ Unexpected error: ${err.message}`);
    throw err;
  }
}

run();
