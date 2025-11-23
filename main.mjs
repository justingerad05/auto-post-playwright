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

  if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed;
  if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
  if (typeof parsed === "object") return { cookies: [parsed], origins: [] };

  throw new Error("Unrecognized cookie structure in MEDIUM_COOKIES.");
}

async function waitForMediumEditor(page) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]',
    '[data-testid="editor"]',
    '[role="textbox"]'
  ];

  for (let i = 0; i < 30; i++) {
    for (const sel of selectors) {
      const found = await page.$(sel);
      if (found) {
        console.log(`Editor detected via: ${sel}`);
        return sel;
      }
    }

    console.log("Editor not ready… retrying");
    await page.waitForTimeout(1500);
  }

  throw new Error("Failed to detect Medium editor — all selectors failed.");
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const { BROWSERLESS_API_KEY, MEDIUM_COOKIES } = process.env;

  if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES");

  const storageState = normalizeCookies(MEDIUM_COOKIES);
  console.log(`Loaded ${storageState.cookies.length} cookies.`);

  // ✔ NEW REQUIRED ENDPOINT (working)
  const WS = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;

  console.log("Connecting to Browserless:", WS);

  const browser = await chromium.connectOverCDP(WS);
  console.log("Connected successfully!");

  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  await page.setViewportSize({ width: 1500, height: 900 });

  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  console.log("Waiting for editor...");
  const editorSelector = await waitForMediumEditor(page);

  console.log("Typing...");
  await page.click(editorSelector);
  await page.keyboard.type(
    "Automated Medium post test using the new Browserless production-sfo WebSocket endpoint!",
    { delay: 20 }
  );

  console.log("Done. Closing browser.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
