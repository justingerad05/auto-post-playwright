// main.mjs
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();

const { chromium } = playwright;

// Normalize cookies into proper Playwright storageState
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

  console.log("Connecting to Browserless via WebSocket...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`
  );

  const storageState = normalizeCookies(MEDIUM_COOKIES);

  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  // Wait for the editor to load
  console.log("Waiting for editor...");
  await page.waitForSelector('div[data-testid="storyTitle"]', { timeout: 60000 });

  // Type a test post
  console.log("Typing into editor...");
  await page.keyboard.type(
    "This is a Medium automated test post using Browserless & GitHub Actions!",
    { delay: 30 }
  );

  await page.waitForTimeout(3000);

  console.log("Closing browser.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
