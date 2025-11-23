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

  for (let i = 0; i < 25; i++) {
    for (const sel of selectors) {
      const found = await page.$(sel);
      if (found) {
        console.log(`Editor detected via selector: ${sel}`);
        return sel;
      }
    }
    console.log("Editor not loaded yet… retrying");
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

  // ✔ Best option for YOU = chrome.browserless.io (higher stability)
  const WS = `wss://chrome.browserless.io?token=${BROWSERLESS_API_KEY}`;

  const browser = await chromium.connectOverCDP(WS);
  const context = await browser.newContext({ storageState });

  const page = await context.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  console.log("Opening Medium editor...");
  await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 120000
  });

  console.log("Waiting for editor...");
  const editorSelector = await waitForMediumEditor(page);

  console.log("Typing test content...");
  await page.click(editorSelector);
  await page.keyboard.type(
    "This is an automated Medium test post from Browserless + Playwright!",
    { delay: 20 }
  );

  console.log("Done. Closing…");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
