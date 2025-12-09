// scripts/loadProfile.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const cookiesEnv = process.env.MEDIUM_COOKIES;

if (!cookiesEnv) {
  console.error("❌ MEDIUM_COOKIES environment variable not set!");
  process.exit(1);
}

let cookies;
try {
  cookies = JSON.parse(cookiesEnv);
} catch (err) {
  console.error("❌ Failed to parse MEDIUM_COOKIES:", err.message);
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: { cookies } });
  const page = await context.newPage();

  try {
    console.log("🔵 Validating login...");
    await page.goto("https://medium.com/me", { waitUntil: "domcontentloaded" });

    console.log("✅ Cookies loaded. Login successful!");
  } catch (err) {
    console.error("❌ Login failed:", err.message);

    const screenshotPath = path.join(
      SCREENSHOT_DIR,
      `login-fail-${Date.now()}.png`
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    process.exit(1);
  } finally {
    await browser.close();
  }
})();
