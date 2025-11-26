// main.mjs
import fs from "fs";
import { chromium } from "playwright-core";

const BROWSERLESS_WS = process.env.BROWSERLESS_WS || ""; // optional full ws url
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES || ""; // JSON or base64(JSON)
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

function parseCookiesEnv(str) {
  if (!str) throw new Error("MEDIUM_COOKIES is empty");
  let text = str.trim();

  // If it looks like base64 (no leading { or [), try base64 decode
  if (!text.startsWith("{") && !text.startsWith("[")) {
    try {
      const buff = Buffer.from(text, "base64");
      text = buff.toString("utf-8");
    } catch (err) {
      // ignore and try parse original text below
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error("MEDIUM_COOKIES is not valid JSON (or base64-encoded JSON).");
  }

  if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
  if (parsed.cookies && Array.isArray(parsed.cookies)) return { cookies: parsed.cookies, origins: parsed.origins || [] };
  if (typeof parsed === "object") return { cookies: [parsed], origins: [] };
  throw new Error("Unrecognized cookie structure in MEDIUM_COOKIES.");
}

async function waitForMediumEditor(page, timeout = 60_000) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]'
  ];
  const start = Date.now();
  const retryInterval = 3000;
  let lastErr = null;

  while (Date.now() - start < timeout) {
    const url = page.url();
    const html = await (async () => {
      try { return await page.content(); } catch { return ""; }
    })();

    if (/Just a moment|Enable JavaScript and cookies|cf_chl|cdn-cgi|Checking your browser|Cloudflare/i.test(html + url)) {
      throw new Error("Blocked by Cloudflare challenge. Playwright can't proceed while challenge is active.");
    }

    for (const s of selectors) {
      try {
        const el = await page.$(s);
        if (el) {
          const visible = await el.isVisible?.();
          if (visible === undefined || visible) return s;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    console.log("Editor not ready… retrying");
    await page.waitForTimeout(retryInterval);
  }

  throw new Error(`Failed to detect Medium editor — all selectors failed. Last error: ${lastErr?.message || "none"}`);
}

function stealthInitScript() {
  return `(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'], configurable: true });
      Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5], configurable: true });
      const _permissions = window.navigator.permissions;
      if (_permissions && _permissions.query) {
        const orig = _permissions.query;
        _permissions.query = (parameters) => parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : orig(parameters);
      }
    } catch (e) {
      // fail quietly in the page
    }
  })();`;
}

async function saveDebugScreenshot(page, name = "cf-challenge.png") {
  try {
    const path = `/tmp/${name}`;
    await page.screenshot({ path, fullPage: true });
    console.log(`Saved debug screenshot: ${path}`);
  } catch (err) {
    console.log("Failed to save debug screenshot:", err.message);
  }
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES env (secret).");
  const storageState = parseCookiesEnv(MEDIUM_COOKIES);

  let wsUrl = BROWSERLESS_WS && BROWSERLESS_WS.trim() !== "" ? BROWSERLESS_WS : "";
  if (!wsUrl) {
    if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY or BROWSERLESS_WS");
    wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  }
  console.log("Connecting to Browserless:", wsUrl.replace(/(token=).+$/, "$1***"));

  // connect
  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
  console.log("Connected to browserless.");

  // create new context with injected storageState (cookies)
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1200, height: 800 },
    storageState: { cookies: storageState.cookies, origins: storageState.origins || [] },
    ignoreHTTPSErrors: true,
  });

  // stealth - IMPORTANT: addInitScript expects { path } or { content }
  try {
    await context.addInitScript({ content: stealthInitScript() });
  } catch (err) {
    console.warn("addInitScript failed:", err.message || err);
  }

  const page = await context.newPage();

  try {
    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForTimeout(2000);

    const selector = await waitForMediumEditor(page, 90000);
    console.log("Editor detected with selector:", selector);

    try {
      const titleEl = await page.$(selector);
      if (titleEl) {
        await titleEl.click({ timeout: 5000 });
        await page.keyboard.type("Automated test post — GitHub Actions + Browserless", { delay: 25 });
      }
    } catch (err) {
      console.warn("Could not type title:", err.message);
    }

    const bodySelectors = [
      'div[role="textbox"][contenteditable="true"]',
      'div[data-testid="post-paragraph"]',
      'div[class*="editorContent"] div[contenteditable="true"]',
      'div[contenteditable="true"]'
    ];

    for (const b of bodySelectors) {
      const el = await page.$(b);
      if (el) {
        await el.click({ timeout: 3000 });
        await page.keyboard.type(
          "This is an automated test body created by Playwright running in GitHub Actions via Browserless.",
          { delay: 20 }
        );
        break;
      }
    }

    console.log("Post typed (test). Wait 3s then exit.");
    await page.waitForTimeout(3000);

    console.log("Closing context and disconnecting.");
    await context.close();
    await browser.close();
    console.log("Done — if no errors were thrown the script executed.");
  } catch (err) {
    console.error("ERROR during automation:", err.message || err);
    try { await saveDebugScreenshot(page, "error-medium.png"); } catch (e) {}
    await context.close().catch(()=>{});
    await browser.close().catch(()=>{});
    throw err;
  }
}

postToMedium().catch((err) => {
  console.error(err);
  process.exit(2);
});
