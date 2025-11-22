const fs = require("fs");
const { chromium } = require("playwright");

async function run() {
  console.log("=== Medium Automation Start ===");

  // Load cookies from GitHub secret
  const cookieRaw = process.env.MEDIUM_COOKIES;
  if (!cookieRaw) {
    console.error("❌ No cookies found in MEDIUM_COOKIES secret.");
    process.exit(1);
  }

  let cookieData;
  try {
    cookieData = JSON.parse(cookieRaw);
  } catch (err) {
    console.error("❌ Failed parsing cookies:", err);
    process.exit(1);
  }

  console.log(`Loaded ${cookieData.cookies.length} cookies.`);

  // Start Playwright (Browserless endpoint optional)
  const browser = await chromium.launch({
    headless: true
  });

  const context = await browser.newContext();
  await context.addCookies(cookieData.cookies);

  const page = await context.newPage();

  console.log("Checking login status...");
  try {
    await page.goto("https://medium.com/me", { waitUntil: "networkidle", timeout: 60000 });
  } catch (e) {
    console.log("First attempt blocked, retrying...");
    await page.goto("https://medium.com/me", { waitUntil: "domcontentloaded" });
  }

  // Capture screenshot for debugging
  await page.screenshot({ path: "medium-test-result.png" });

  console.log("If login succeeded, this screenshot will show the dashboard.");
  console.log("Automation complete.");

  await browser.close();
}

run();
