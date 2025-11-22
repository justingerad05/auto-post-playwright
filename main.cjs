// main.cjs
import fs from "fs";
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

  console.log("Connecting to Browserless CDP...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`
  );

  const context = await browser.newContext({
    storageState: { cookies: JSON.parse(MEDIUM_COOKIES), origins: [] }
  });

  const page = await context.newPage();

  console.log("Loading Medium...");

  await page.goto("https://medium.com/new-story", { waitUntil: "networkidle" });

  console.log("Medium page loaded.");

  await page.waitForTimeout(3000);

  await page.keyboard.type(
    "This is an automated test post. Automation working successfully!",
    { delay: 30 }
  );

  await page.waitForTimeout(2000);

  console.log("Trying to publish...");

  await page.keyboard.press("Control+Shift+P");
  await page.waitForTimeout(3000);

  console.log("Done. Closing browser.");

  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
