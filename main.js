import fs from "fs";
import { chromium } from "playwright";

// -------------------------------------
// Load cookies from GitHub Secret
// -------------------------------------
function loadCookiesFromSecret() {
  const secret = process.env.MEDIUM_COOKIES;

  if (!secret) {
    throw new Error("❌ MEDIUM_COOKIES secret is missing.");
  }

  try {
    const cookies = JSON.parse(secret);
    console.log(`Loaded ${cookies.length} cookies from secret.`);
    return cookies;
  } catch (err) {
    throw new Error("❌ MEDIUM_COOKIES contains invalid JSON.");
  }
}

// -------------------------------------
// Post to Medium using Playwright
// -------------------------------------
async function postToMedium() {
  console.log("=== Medium Post Automation Start ===");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Load cookies from secret
  const cookies = loadCookiesFromSecret();
  await context.addCookies(cookies);
  console.log("Cookies added to browser.");

  const page = await context.newPage();

  // Step 1 — Open Medium new post page
  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new", { waitUntil: "networkidle" });

  // Wait until editor fully loads
  await page.waitForSelector('div[data-testid="editor"]', { timeout: 60000 });

  // Step 2 — Type title
  console.log("Typing title...");
  await page.click('textarea[data-testid="post-title-input"]');
  await page.keyboard.type("🔥 Test Playwright Cookie Post");

  // Step 3 — Type body
  console.log("Typing story body...");
  await page.click('div[data-testid="wysiwyg-wrapper"] div');
  await page.keyboard.type(
    "This story was published using Playwright + Medium cookies stored securely in GitHub Secrets."
  );

  await page.waitForTimeout(2000); // Wait for autosave

  // Step 4 — Publish menu
  await page.click('button[data-testid="publishButton"]');

  await page.waitForSelector('button[data-testid="publishStoryButton"]', {
    timeout: 30000,
  });

  // Step 5 — Publish final
  await page.click('button[data-testid="publishStoryButton"]');

  await page.waitForNavigation({ timeout: 60000 });

  console.log("🎉 Successfully published to Medium!");

  await browser.close();
}

// Run
postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(1);
});
