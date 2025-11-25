// main.mjs
import { chromium } from "playwright-core";
import { FingerprintGenerator } from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";

const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
const MEDIUM_COOKIES = JSON.parse(process.env.MEDIUM_COOKIES || "[]");
const MEDIUM_FINGERPRINT = JSON.parse(process.env.MEDIUM_FINGERPRINT || "{}");
const MEDIUM_POST_HTML = process.env.MEDIUM_POST_HTML || "<p>No content provided.</p>";

if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");

// fingerprint fallback
const generator = new FingerprintGenerator();
const fingerprint = Object.keys(MEDIUM_FINGERPRINT).length
  ? MEDIUM_FINGERPRINT
  : generator.getFingerprint();

const injector = new FingerprintInjector();

async function runMedium() {
  const wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  console.log("Connecting to Browserless:", wsUrl.replace(/token=.*/, "token=***"));

  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
  console.log("Connected to Browserless.");

  const context = await browser.newContext({
    storageState: { cookies: MEDIUM_COOKIES, origins: [] },
    userAgent: fingerprint.navigator.userAgent,
    viewport: { width: 1200, height: 800 },
    ignoreHTTPSErrors: true
  });

  await injector.attachFingerprintToPlaywright(context, fingerprint);

  const page = await context.newPage();
  console.log("Opening Medium editor…");

  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(3000);

  console.log("Trying to insert HTML content…");
  await page.evaluate(html => {
    const article = document.querySelector("article");
    if (article) article.innerHTML = html;
  }, MEDIUM_POST_HTML);

  console.log("Attempting to publish…");
  try {
    await page.click('button[data-action="publish"]', { timeout: 15000 });
    await page.waitForTimeout(5000);
  } catch (err) {
    console.log("Publish button not found. Likely Medium blocked editor rendering.");
  }

  console.log("Extracting updated cookies…");
  const updated = await context.storageState();
  console.log("=== NEW COOKIES (SAVE IN GITHUB SECRET) ===");
  console.log(JSON.stringify(updated.cookies, null, 2));

  await browser.close();
  console.log("Done.");
}

runMedium().catch(err => {
  console.error("Fatal error:", err);
  process.exit(2);
});
