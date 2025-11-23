// main.mjs
import fs from "fs";
import playwright from "playwright";
import dotenv from "dotenv";
dotenv.config();

const { chromium } = playwright;

/**
 * Parse MEDIUM_COOKIES secret. Accepts:
 * - raw JSON string of { cookies: [...] } (preferred)
 * - JSON array of cookie objects
 */
function parseCookiesEnv(envValue) {
  if (!envValue) throw new Error("Missing MEDIUM_COOKIES env value.");

  // Accept base64 too if user encoded it (we support both)
  let raw = envValue.trim();
  try {
    // try json directly
    return JSON.parse(raw);
  } catch (e) {
    // try base64 decode
    try {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    } catch (e2) {
      throw new Error("MEDIUM_COOKIES is not valid JSON (or base64-encoded JSON).");
    }
  }
}

async function waitForMediumEditor(page, timeout = 60000) {
  // array of selectors to try (many Medium deployments use different editor markup)
  const candidateSelectors = [
    'div[data-testid="storyTitle"]',          // older/newer test ids
    'h1[data-testid="editable"]',             // some variants
    'div[class*="editor"]',                   // generic
    'div[class*="editorContent"]',
    'div[contenteditable="true"]',
    'h1[contenteditable="true"]'
  ];

  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of candidateSelectors) {
      try {
        const handle = await page.$(sel);
        if (handle) {
          // ensure visible
          const visible = await handle.isVisible?.() ?? (await handle.boundingBox()) !== null;
          if (visible) return sel;
        }
      } catch (err) {
        // ignore
      }
    }
    // heartbeat (helps debug cloud run logs)
    console.log("Editor not ready… retrying");
    await page.waitForTimeout(2500);
  }
  throw new Error("Failed to detect Medium editor — all selectors failed.");
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
  const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES;
  const BROWSERLESS_WS = process.env.BROWSERLESS_WS || `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;

  if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY (set as secret).");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES (set as secret with Playwright storageState JSON).");

  console.log("Connecting to Browserless:", BROWSERLESS_WS);

  // Connect to Browserless via CDP (use production-sfo or your preferred region)
  const browser = await chromium.connectOverCDP(BROWSERLESS_WS, { timeout: 60000 });
  console.log("Connected to browserless.");

  // Parse cookie storage state (should be { cookies: [ ... ], origins: [] } or just { cookies: [...] })
  let storageState = parseCookiesEnv(MEDIUM_COOKIES);

  // If user provided plain array, normalize:
  if (Array.isArray(storageState)) {
    storageState = { cookies: storageState, origins: [] };
  } else if (storageState.cookies && !Array.isArray(storageState.cookies)) {
    throw new Error("Parsed MEDIUM_COOKIES is malformed: cookies must be an array.");
  }

  // Create context with provided cookies
  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
  });

  const page = await context.newPage();

  console.log("Opening Medium editor...");
  try {
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });
  } catch (e) {
    console.warn("First navigation to /new-story timed out or blocked:", e.message);
  }

  // Wait for editor with retries
  let editorSelector;
  try {
    editorSelector = await waitForMediumEditor(page, 90000);
    console.log("Editor detected via selector:", editorSelector);
  } catch (err) {
    console.error("ERROR:", err.message);
    await browser.close();
    throw err;
  }

  // Focus editor and type a test post
  console.log("Typing into editor (test)...");
  try {
    await page.click(editorSelector);
    // Type a title
    await page.keyboard.type("Automated test post — Playwright + Browserless", { delay: 20 });
    // move to body: press Enter, then type some text
    await page.keyboard.press("Enter");
    await page.keyboard.type("This post was published by an automated Playwright script (test).", { delay: 18 });

    // Pause briefly for Medium saving/JS
    await page.waitForTimeout(4000);

    console.log("Test typing complete.");
  } catch (err) {
    console.error("Typing error:", err);
  }

  // Close (we're not publishing in the test — you can extend to click the publish flow)
  await browser.close();
  console.log("Browser closed. Automation finished.");
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
