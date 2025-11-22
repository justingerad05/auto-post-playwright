// main.mjs
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();

const { chromium } = playwright;

// Normalize cookies into Playwright format
function normalizeCookies(inputString) {
  let parsed;

  try {
    parsed = JSON.parse(inputString);
  } catch (err) {
    throw new Error("MEDIUM_COOKIES is not valid JSON.");
  }

  // CASE 1: Already storageState
  if (parsed.cookies && Array.isArray(parsed.cookies)) {
    return parsed;
  }

  // CASE 2: Already array of cookies
  if (Array.isArray(parsed)) {
    return {
      cookies: parsed,
      origins: []
    };
  }

  // CASE 3: Single cookie object
  if (typeof parsed === "object") {
    return {
      cookies: [parsed],
      origins: []
    };
  }

  throw new Error("Unrecognized cookie format for MEDIUM_COOKIES");
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
  const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES;

  if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES");

  console.log("Connecting to Browserless via WebSocket...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`
  );

  const storageState = normalizeCookies(MEDIUM_COOKIES);

  const context = await browser.newContext({
    storageState
  });

  const page = await context.newPage();

  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "networkidle",
  });

  console.log("Typing test post...");
  await page.keyboard.type(
    "Automated Medium Test — Browserless + GitHub Actions working!",
    { delay: 20 }
  );

  await page.waitForTimeout(2000);

  console.log("Done. Closing browser.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
