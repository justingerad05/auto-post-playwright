// main.mjs
import fs from "fs";
import { chromium } from "playwright";

const BROWSERLESS_WS = process.env.BROWSERLESS_WS || "";
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES || "";
const USER_AGENT =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

// -------------------------
// COOKIE PARSER
// -------------------------
function parseCookiesEnv(str) {
  if (!str) throw new Error("MEDIUM_COOKIES is empty");
  let text = str.trim();

  if (!text.startsWith("{") && !text.startsWith("[")) {
    try {
      text = Buffer.from(text, "base64").toString("utf-8");
    } catch {}
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("MEDIUM_COOKIES is not valid JSON or base64(JSON)");
  }

  if (Array.isArray(parsed)) return { cookies: parsed };
  if (parsed.cookies) return { cookies: parsed.cookies };
  if (typeof parsed === "object") return { cookies: [parsed] };

  throw new Error("Unrecognized cookie structure.");
}

// -------------------------
// STEALTH SCRIPT
// -------------------------
function stealthInitScript() {
  return `
    Object.defineProperty(navigator, 'webdriver', { get: () => false });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US','en']
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [1,2,3,4,5]
    });

    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (p) => {
        if (p.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(p);
      };
    }
  `;
}

// -------------------------
// WAIT FOR MEDIUM EDITOR
// -------------------------
async function waitForMediumEditor(page, timeout = 90000) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[contenteditable="true"]',
    'div[class*="editor"]'
  ];

  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        const visible = await el.isVisible().catch(() => false);
        if (visible) return sel;
      }
    }
    console.log("Editor not ready… retrying");
    await page.waitForTimeout(2000);
  }

  throw new Error("Medium editor not detected.");
}

// -------------------------
// MAIN FUNCTION
// -------------------------
async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const storageState = parseCookiesEnv(MEDIUM_COOKIES);

  // build ws URL
  let wsUrl = BROWSERLESS_WS.trim();
  if (!wsUrl) {
    if (!BROWSERLESS_API_KEY) throw new Error("Missing Browserless key");
    wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  }

  console.log("Connecting:", wsUrl.replace(/token=.*/, "token=***"));

  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
  console.log("Connected.");

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1200, height: 800 },
    storageState: { cookies: storageState.cookies },
    ignoreHTTPSErrors: true
  });

  // stealth
  await context.addInitScript(stealthInitScript);

  const page = await context.newPage();

  try {
    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(2000);

    const selector = await waitForMediumEditor(page);
    console.log("Editor detected:", selector);

    const titleEl = await page.$(selector);
    if (titleEl) {
      await titleEl.click();
      await page.keyboard.type(
        "Automated GitHub Action Post — Browserless + Playwright",
        { delay: 25 }
      );
    }

    const bodyEl = await page.$('div[contenteditable="true"]');
    if (bodyEl) {
      await bodyEl.click();
      await page.keyboard.type(
        "This is an automated test post created on Medium using Playwright inside GitHub Actions.",
        { delay: 20 }
      );
    }

    console.log("Typing complete.");
    await page.waitForTimeout(3000);

    console.log("Closing...");
    await context.close();
    await browser.close();
  } catch (err) {
    console.log("ERROR:", err.message);
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    throw err;
  }
}

postToMedium().catch(() => process.exit(2));
