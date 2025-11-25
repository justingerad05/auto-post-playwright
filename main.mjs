// main.mjs
import fs from "fs";
import { chromium } from "playwright";

const BROWSERLESS_WS = process.env.BROWSERLESS_WS || ""; // optional full ws url
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES || ""; // JSON or base64(JSON)
const MEDIUM_FINGERPRINT = process.env.MEDIUM_FINGERPRINT || ""; // OPTIONAL: fingerprint JSON or base64(JSON)
const USER_AGENT = process.env.USER_AGENT || "";

function parseMaybeBase64Json(str, name = "ENV") {
  if (!str) return null;
  let t = str.trim();
  // Heuristic: if it doesn't start with { or [, try base64 decode
  if (!t.startsWith("{") && !t.startsWith("[")) {
    try {
      t = Buffer.from(t, "base64").toString("utf-8");
    } catch (err) {
      // ignore and try parse original
    }
  }
  try {
    return JSON.parse(t);
  } catch (err) {
    throw new Error(`${name} is not valid JSON (or base64-encoded JSON).`);
  }
}

function parseCookiesEnv(str) {
  if (!str) throw new Error("Missing MEDIUM_COOKIES env (secret).");
  const parsed = parseMaybeBase64Json(str, "MEDIUM_COOKIES");
  if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
  if (parsed?.cookies && Array.isArray(parsed.cookies)) return { cookies: parsed.cookies, origins: parsed.origins || [] };
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
    let html = "";
    try { html = await page.content(); } catch {}
    if (/Just a moment|Enable JavaScript and cookies|cf_chl|cdn-cgi|Checking your browser|Cloudflare/i.test(html + url)) {
      throw new Error("Blocked by Cloudflare challenge. Playwright can't proceed while challenge is active.");
    }

    for (const s of selectors) {
      try {
        const el = await page.$(s);
        if (el) {
          try {
            const visible = await el.isVisible();
            if (visible) return s;
          } catch {
            return s;
          }
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
        const orig = _permissions.query.bind(_permissions);
        _permissions.query = (parameters) => parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : orig(parameters);
      }
    } catch (e) {}
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
  if (!USER_AGENT) throw new Error("Missing USER_AGENT env (secret). It must match the browser you exported cookies from.");

  const storageState = parseCookiesEnv(MEDIUM_COOKIES);
  // fingerprint is optional: if provided, we parse and may inject data into page later
  let fingerprint = null;
  if (MEDIUM_FINGERPRINT) {
    try { fingerprint = parseMaybeBase64Json(MEDIUM_FINGERPRINT, "MEDIUM_FINGERPRINT"); } catch (e) {
      console.warn("MEDIUM_FINGERPRINT parsing failed:", e.message);
      fingerprint = null;
    }
  }

  // Build Browserless connection URL
  let wsUrl = BROWSERLESS_WS && BROWSERLESS_WS.trim() !== "" ? BROWSERLESS_WS : "";
  if (!wsUrl) {
    if (!BROWSERLESS_API_KEY) {
      // We allow running Playwright locally without browserless if env not present:
      console.warn("No BROWSERLESS_WS or BROWSERLESS_API_KEY provided — attempting local browser launch.");
    } else {
      wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
      console.log("Connecting to Browserless:", wsUrl.replace(/(token=).+$/, "$1***"));
    }
  } else {
    console.log("Connecting to Browserless (custom):", wsUrl.replace(/(token=).+$/, "$1***"));
  }

  let browser = null;
  let context = null;
  let page = null;
  try {
    if (wsUrl) {
      // connect over CDP to browserless
      browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
      console.log("Connected to browserless.");
      context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1200, height: 800 },
        storageState: { cookies: storageState.cookies, origins: storageState.origins || [] },
        ignoreHTTPSErrors: true,
      });
    } else {
      // local chromium (useful for local testing)
      console.log("Launching local chromium (for local testing) ...");
      browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      context = await browser.newContext({
        userAgent: USER_AGENT,
        viewport: { width: 1200, height: 800 },
        storageState: { cookies: storageState.cookies, origins: storageState.origins || [] },
        ignoreHTTPSErrors: true,
      });
    }

    // IMPORTANT: addInitScript expects { content: '...' } (not script/path)
    await context.addInitScript({ content: stealthInitScript() });

    page = await context.newPage();

    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });

    // small settle
    await page.waitForTimeout(2500);

    // If you provided fingerprint data and it contains fields we want to set
    if (fingerprint && typeof fingerprint === "object") {
      try {
        // inject fingerprint object into window.__FP_TEST (optional)
        await page.addInitScript({ content: `window.__FP_TEST = ${JSON.stringify(fingerprint)};` });
        console.log("Injected MEDIUM_FINGERPRINT into page (window.__FP_TEST).");
      } catch (e) {
        console.warn("Failed to inject fingerprint:", e.message);
      }
    }

    const selector = await waitForMediumEditor(page, 120_000);
    console.log("Editor detected with selector:", selector);

    // Type a simple test title + body
    try {
      const titleEl = await page.$(selector);
      if (titleEl) {
        await titleEl.click({ timeout: 5000 });
        await page.keyboard.type("Automated test post — GitHub Actions + Browserless", { delay: 25 });
      } else {
        console.warn("Title element not found for typing.");
      }
    } catch (err) {
      console.warn("Could not type title:", err.message);
    }

    // Try to type body (attempt common body selectors)
    const bodySelectors = [
      'div[role="textbox"][contenteditable="true"]',
      'div[data-testid="post-paragraph"]',
      'div[class*="editorContent"] div[contenteditable="true"]',
      'div[contenteditable="true"]'
    ];
    for (const b of bodySelectors) {
      try {
        const el = await page.$(b);
        if (el) {
          await el.click({ timeout: 3000 });
          await page.keyboard.type("This is an automated test body created by Playwright running in GitHub Actions via Browserless.", { delay: 20 });
          break;
        }
      } catch (err) {
        // continue trying other selectors
      }
    }

    console.log("Post typed (test). Wait 3s then exit.");
    await page.waitForTimeout(3000);

    console.log("Closing context and disconnecting.");
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
    console.log("Done — script executed without throwing (check GitHub Actions logs for details).");
  } catch (err) {
    console.error("ERROR during automation:", err.message || err);
    try { if (page) await saveDebugScreenshot(page, "error-medium.png"); } catch (e) {}
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
    throw err;
  }
}

postToMedium().catch((err) => {
  console.error(err);
  process.exit(2);
});
