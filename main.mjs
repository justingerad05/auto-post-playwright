// main.mjs
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();

const { chromium } = playwright;

// Normalize cookies for Playwright storageState
function normalizeCookies(inputString) {
  let parsed;
  try {
    parsed = JSON.parse(inputString);
  } catch (err) {
    throw new Error("MEDIUM_COOKIES is not valid JSON.");
  }

  if (parsed.cookies && Array.isArray(parsed.cookies)) {
    return parsed;
  }
  if (Array.isArray(parsed)) {
    return { cookies: parsed, origins: [] };
  }
  if (typeof parsed === "object") {
    return { cookies: [parsed], origins: [] };
  }

  throw new Error("Unrecognized cookie structure in MEDIUM_COOKIES.");
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const { BROWSERLESS_API_KEY, MEDIUM_COOKIES } = process.env;
  if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES");

  console.log("Connecting to Browserless WebSocket (stealth enabled)...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}&stealth=true&blockAds=true&keepalive=true`
  );

  console.log("Browser connected.");

  // Load cookies
  const storageState = normalizeCookies(MEDIUM_COOKIES);

  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });

  const page = await context.newPage();

  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });

  console.log("Waiting for Medium editor root to load...");
  await page.waitForSelector('[data-testid="storyTitle"]', {
    timeout: 90000,
  });

  console.log("Editor detected — typing...");

  // Click into the title field
  await page.click('[data-testid="storyTitle"]');
  await page.keyboard.type("Automated Medium Post — Browserless + Playwright", {
    delay: 25,
  });

  // Body field
  await page.keyboard.press("Tab");
  await page.keyboard.type(
    "This is a test post published automatically using Browserless (stealth mode) and GitHub Actions!",
    { delay: 20 }
  );

  console.log("Typing completed, waiting extra delay...");
  await page.waitForTimeout(4000);

  console.log("Closing browser.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
