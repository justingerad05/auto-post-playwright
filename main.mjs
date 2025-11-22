// main.mjs
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();

const { chromium } = playwright;

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
  const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES;

  if (!BROWSERLESS_API_KEY) {
    throw new Error("Missing BROWSERLESS_API_KEY environment variable!");
  }
  if (!MEDIUM_COOKIES) {
    throw new Error("Missing MEDIUM_COOKIES environment variable!");
  }

  console.log("Connecting to Browserless via WebSocket...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`
  );

  const context = await browser.newContext({
    storageState: { cookies: JSON.parse(MEDIUM_COOKIES), origins: [] }
  });

  const page = await context.newPage();

  console.log("Loading Medium new story...");
  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  console.log("Typing into editor...");
  await page.keyboard.type(
    "Automated test post — Browserless + Playwright working!",
    { delay: 20 }
  );

  await page.waitForTimeout(2000);

  console.log("Automation complete. Closing.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
