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

async function waitForEditor(page) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    '[role="textbox"]',
    'div[class*="editor"]',
    'h1[data-testid="editable"]'
  ];

  for (const selector of selectors) {
    try {
      console.log(`Trying selector: ${selector}`);
      await page.waitForSelector(selector, { timeout: 15000 });
      console.log(`Editor loaded using selector: ${selector}`);
      return selector;
    } catch (e) {
      console.log(`Selector failed: ${selector}`);
    }
  }

  throw new Error("Failed to detect Medium editor — all selectors failed.");
}

async function sendHeartbeat(browser) {
  setInterval(async () => {
    try {
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        const page = contexts[0].pages()[0];
        if (page) await page.title(); // lightweight keepalive
      }
      console.log("Heartbeat: Browserless still alive.");
    } catch (err) {
      console.log("⚠ Heartbeat failed:", err.message);
    }
  }, 5000); // every 5s
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const { BROWSERLESS_API_KEY, MEDIUM_COOKIES } = process.env;

  if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES");

  console.log("Connecting to Browserless WebSocket (advanced stealth enabled)...");

  const browser = await chromium.connectOverCDP(
    `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}&stealth=1&--disable-web-security`
  );
  console.log("Browser connected.");

  // Keepalive
  sendHeartbeat(browser);

  const storageState = normalizeCookies(MEDIUM_COOKIES);

  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  console.log("Opening Medium editor...");
  let response = await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  // If Cloudflare blocks CDP → we reload
  if (!response || !response.ok()) {
    console.log("⚠ Initial load failed. Retrying...");
    await page.waitForTimeout(2000);
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
  }

  console.log("Waiting for Medium editor root to load...");
  const selector = await waitForEditor(page);

  console.log("Editor ready. Typing...");

  await page.click(selector);
  await page.keyboard.type(
    "This is an automated Medium post using Browserless + Playwright + GitHub Actions!",
    { delay: 20 }
  );

  await page.waitForTimeout(2000);

  console.log("Adding body text...");
  await page.keyboard.press("Enter");
  await page.keyboard.type(
    "This system uses advanced stealth, Cloudflare bypass stabilization, auto-recovery, and CDP heartbeat monitoring.",
    { delay: 18 }
  );

  console.log("Post typed successfully. Taking a save delay...");
  await page.waitForTimeout(4000);

  console.log("Closing browser.");
  await browser.close();
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
