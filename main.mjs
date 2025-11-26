// main.mjs
import fs from "fs";
import { chromium } from "playwright-core";

// === ENV ===
const BROWSERLESS_WS = process.env.BROWSERLESS_WS || "";
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES || "";
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

// === FINGERPRINT ===
let FINGERPRINT = {};
try {
  if (process.env.MEDIUM_FINGERPRINT) {
    FINGERPRINT = JSON.parse(process.env.MEDIUM_FINGERPRINT);
    console.log("Loaded fingerprint.");
  }
} catch (e) {
  console.log("Invalid fingerprint JSON.");
}

// === COOKIES PARSER ===
function parseCookiesEnv(str) {
  if (!str) throw new Error("MEDIUM_COOKIES is empty");
  let text = str.trim();

  if (!text.startsWith("{") && !text.startsWith("[")) {
    try {
      const decoded = Buffer.from(text, "base64").toString("utf8");
      text = decoded;
    } catch {}
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
    if (parsed.cookies && Array.isArray(parsed.cookies))
      return { cookies: parsed.cookies, origins: parsed.origins || [] };
    if (typeof parsed === "object") return { cookies: [parsed], origins: [] };
  } catch (err) {
    throw new Error("MEDIUM_COOKIES is not valid JSON or base64(JSON).");
  }

  throw new Error("Unrecognized cookie structure in MEDIUM_COOKIES.");
}

// === CLOUDFLARE CHECK ===
async function waitForMediumEditor(page, timeout = 60_000) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]'
  ];

  const start = Date.now();
  let lastErr = null;

  while (Date.now() - start < timeout) {
    const html = await page.content().catch(() => "");
    const url = page.url();

    if (/Just a moment|cf_chl|cdn-cgi|Checking your browser|Cloudflare/i.test(html + url)) {
      throw new Error("Blocked by Cloudflare challenge. Playwright can't proceed.");
    }

    for (const s of selectors) {
      try {
        const el = await page.$(s);
        if (el) {
          const vis = await el.isVisible?.();
          if (vis === undefined || vis) return s;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    console.log("Editor not ready… retrying");
    await page.waitForTimeout(2500);
  }

  throw new Error("Medium editor never appeared. Last error: " + (lastErr?.message || "none"));
}

// === BASIC STEALTH ===
function stealthInitScript() {
  return `(() => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (params) => {
        if (params.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(params);
      };
    } catch (e) {}
  })();`;
}

// === DEEP FINGERPRINT INJECTION ===
function generateFingerprintScript(fp) {
  return `
    Object.defineProperty(navigator, "userAgent", { get: () => "${fp.userAgent || USER_AGENT}" });
    Object.defineProperty(navigator, "platform", { get: () => "${fp.platform || "Win32"}" });
    Object.defineProperty(navigator, "vendor", { get: () => "${fp.vendor || "Google Inc."}" });
    Object.defineProperty(navigator, "languages", { get: () => ${JSON.stringify(fp.languages || ["en-US","en"])} });

    Object.defineProperty(navigator, "deviceMemory", { get: () => ${fp.deviceMemory || 8} });
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => ${fp.hardwareConcurrency || 8} });

    Object.defineProperty(window.screen, "width", { get: () => ${fp.screen?.width || 1366} });
    Object.defineProperty(window.screen, "height", { get: () => ${fp.screen?.height || 768} });
    Object.defineProperty(window.screen, "availWidth", { get: () => ${fp.screen?.availWidth || 1366} });
    Object.defineProperty(window.screen, "availHeight", { get: () => ${fp.screen?.availHeight || 728} });

    const _getParam = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return "${fp.webglVendor || "Google Inc."}";
      if (param === 37446) return "${fp.webglRenderer || "ANGLE (Intel, Intel(R) UHD Graphics)"}";
      return _getParam.apply(this, arguments);
    };
  `;
}

// === DEBUG SCREENSHOT ===
async function saveDebugScreenshot(page, name = "cf.png") {
  try {
    await page.screenshot({ path: `/tmp/${name}`, fullPage: true });
    console.log("Saved debug screenshot:", `/tmp/${name}`);
  } catch {}
}

// === AUTOMATION MAIN ===
async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const storageState = parseCookiesEnv(MEDIUM_COOKIES);

  let ws = BROWSERLESS_WS || "";
  if (!ws) {
    if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY");
    ws = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  }

  console.log("Connecting:", ws.replace(/token=.*/, "token=***"));

  const browser = await chromium.connectOverCDP(ws);
  console.log("Connected.");

  // === CONTEXT WITH FINGERPRINT ===
  const context = await browser.newContext({
    userAgent: FINGERPRINT.userAgent || USER_AGENT,
    locale: FINGERPRINT.languages ? FINGERPRINT.languages[0] : "en-US",
    timezoneId: FINGERPRINT.timezone || "Africa/Lagos",
    viewport: {
      width: FINGERPRINT.screen?.width || 1366,
      height: FINGERPRINT.screen?.height || 768
    },
    screen: {
      width: FINGERPRINT.screen?.width || 1366,
      height: FINGERPRINT.screen?.height || 768
    },
    storageState: storageState,
    ignoreHTTPSErrors: true,
  });

  // === APPLY STEALTH & FINGERPRINT SPOOF ===
  try {
    await context.addInitScript({ content: stealthInitScript() });
    await context.addInitScript({ content: generateFingerprintScript(FINGERPRINT) });
  } catch (e) {
    console.log("Fingerprint inject failed:", e.message);
  }

  const page = await context.newPage();

  try {
    console.log("Opening Medium...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded" });

    const selector = await waitForMediumEditor(page, 90000);
    console.log("Editor ready:", selector);

    const title = await page.$(selector);
    if (title) {
      await title.click();
      await page.keyboard.type("Automated post — Fully Stealth", { delay: 25 });
    }

    console.log("Typing body...");
    const bodySel = 'div[contenteditable="true"]';
    await page.click(bodySel);
    await page.keyboard.type("This is a test body injected with full stealth.", { delay: 20 });

    await page.waitForTimeout(3000);
  } catch (err) {
    console.error("ERROR:", err.message);
    await saveDebugScreenshot(page, "error.png");
    throw err;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log("DONE.");
}

// === RUN ===
postToMedium().catch(() => process.exit(2));
