import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

async function run() {
  console.log("🟦 Running STEALTH test...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("🌐 Opening Medium new story page (stealth mode)...");
  await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded" });

  await page.waitForTimeout(5000);
  await page.screenshot({ path: "screenshots/stealth-test.png", fullPage: true });

  console.log("📸 Saved screenshot screenshots/stealth-test.png");

  await browser.close();
}

run();
