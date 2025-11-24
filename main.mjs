// main.mjs
import fs from "fs";
import { chromium } from "playwright";

const BROWSERLESS_WS = process.env.BROWSERLESS_WS || ""; // optional full ws url
const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY || "";
const MEDIUM_COOKIES = process.env.MEDIUM_COOKIES || ""; // JSON or base64(JSON)
const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";
const DEBUG_SCREENSHOT_PATH = "/mnt/data/medium-test-result.png"; // provided screenshot path

function parseCookiesEnv(str) {
  if (!str) throw new Error("MEDIUM_COOKIES is empty");
  let text = str.trim();

  // If looks like base64, decode
  if (!text.startsWith("{") && !text.startsWith("[")) {
    try {
      const buff = Buffer.from(text, "base64");
      const maybe = buff.toString("utf-8").trim();
      // sanity check
      if (maybe.startsWith("{") || maybe.startsWith("[")) text = maybe;
    } catch (err) {
      // ignore and try parsing original
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

// Use fingerprint data you provided to craft a stronger stealth init script
function stealthInitScriptFromFingerprint(fp = {}) {
  // safe defaults if some FP bits missing
  const languages = fp.languages?.value?.[0] ?? ["en-US"];
  const userAgent = fp.userAgent ?? USER_AGENT;
  const pluginsLen = (fp.plugins && fp.plugins.value && Array.isArray(fp.plugins.value)) ? Math.min(7, fp.plugins.value.length) : 5;
  const screenResolution = fp.screenResolution?.value ?? [1200, 800];
  const timezone = fp.timezone?.value ?? "UTC";

  // Also set navigator.hardwareConcurrency, deviceMemory if present
  const hwConcurrency = fp.hardwareConcurrency?.value ?? 8;
  const deviceMemory = fp.deviceMemory?.value ?? 8;
  const vendor = fp.vendor?.value ?? "Google Inc.";

  // stringify safe values:
  const langsJs = JSON.stringify(languages);
  const uaJs = JSON.stringify(userAgent);
  const tzJs = JSON.stringify(timezone);

  return `(() => {
    // basic navigator overrides
    try {
      Object.defineProperty(navigator, 'webdriver', {get: () => false, configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'languages', {get: () => ${langsJs}, configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'userAgent', {get: () => ${uaJs}, configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'platform', {get: () => 'Win32', configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'vendor', {get: () => ${JSON.stringify(vendor)}, configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'hardwareConcurrency', {get: () => ${hwConcurrency}, configurable: true});
    } catch(e){}

    try {
      Object.defineProperty(navigator, 'deviceMemory', {get: () => ${deviceMemory}, configurable: true});
    } catch(e){}

    // Fake plugins length
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const arr = new Array(${pluginsLen});
          for (let i=0;i<${pluginsLen};i++) arr[i] = {name:'Plugin '+i};
          return arr;
        },
        configurable: true
      });
    } catch(e){}

    // Permissions shim
    try {
      const _origQuery = window.navigator.permissions && window.navigator.permissions.query;
      if (_origQuery) {
        window.navigator.permissions.query = (params) => {
          if (params && params.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return _origQuery.call(window.navigator.permissions, params);
        };
      }
    } catch(e){}

    // timezone
    try {
      Object.defineProperty(Intl, 'DateTimeFormat', {
        value: (function(Orig) {
          return function() {
            const dtf = new Orig(...arguments);
            try { dtf.resolvedOptions = function(){ return { timeZone: ${tzJs} }; }; } catch(e){}
            return dtf;
          };
        })(Intl.DateTimeFormat)
      });
    } catch(e){}

    // small helper to mask webdriver detectors on window
    try {
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    } catch(e){}
  })();`;
}

// Waits for Medium editor presence and checks for Cloudflare challenge
async function waitForMediumEditor(page, timeout = 60_000) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]'
  ];
  const start = Date.now();
  const retryInterval = 3000;

  while (Date.now() - start < timeout) {
    // quick Cloudflare challenge detection
    const url = page.url();
    let html = "";
    try { html = await page.content(); } catch(e){ html = ""; }
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
        // ignore and continue
      }
    }

    console.log("Editor not ready… retrying");
    await page.waitForTimeout(retryInterval);
  }
  throw new Error("Failed to detect Medium editor — all selectors failed.");
}

async function saveDebugScreenshot(page, name = "error-medium.png") {
  try {
    const path = `/tmp/${name}`;
    await page.screenshot({ path, fullPage: true }).catch(()=>{});
    console.log(`Saved debug screenshot: ${path}`);
    // Also if we have the repo-mounted debug path, copy to known location if possible
    try { 
      if (fs.existsSync("/mnt/data")) {
        const dest = `/mnt/data/${name}`;
        fs.copyFileSync(path, dest);
        console.log("Also copied screenshot to:", dest);
      }
    } catch(e){}
  } catch (err) {
    console.log("Failed to save debug screenshot:", err?.message || err);
  }
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");
  if (!MEDIUM_COOKIES) throw new Error("Missing MEDIUM_COOKIES env (secret).");
  const storageState = parseCookiesEnv(MEDIUM_COOKIES);

  // Build Browserless connection URL
  let wsUrl = BROWSERLESS_WS && BROWSERLESS_WS.trim() !== "" ? BROWSERLESS_WS : "";
  if (!wsUrl) {
    if (!BROWSERLESS_API_KEY) throw new Error("Missing BROWSERLESS_API_KEY or BROWSERLESS_WS");
    wsUrl = `wss://production-sfo.browserless.io?token=${BROWSERLESS_API_KEY}`;
  }
  console.log("Connecting:", wsUrl.replace(/(token=).+$/, "$1***"));

  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
  console.log("Connected.");

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1200, height: 800 },
    storageState: { cookies: storageState.cookies, origins: storageState.origins || [] },
    ignoreHTTPSErrors: true,
  });

  // inject stealth JS using content (this avoids the "Either path or content property must be present" error)
  const fingerprintOverride = {
    // minimal fingerprint derived from user-provided data (we embed a few safe fields)
    languages: { value: [["en-US"]] },
    userAgent: USER_AGENT,
    screenResolution: { value: [960, 1440] },
    timezone: { value: "Africa/Lagos" },
    hardwareConcurrency: { value: 8 },
    deviceMemory: { value: 8 },
    vendor: { value: "Google Inc." },
    plugins: { value: [] }
  };
  await context.addInitScript({ content: stealthInitScriptFromFingerprint(fingerprintOverride) });

  const page = await context.newPage();

  try {
    console.log("Opening editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    const selector = await waitForMediumEditor(page, 90000);
    console.log("Editor detected with selector:", selector);

    // type title
    const titleEl = await page.$(selector);
    if (titleEl) {
      await titleEl.click({ timeout: 5000 }).catch(()=>{});
      await page.keyboard.type("Automated test post — Playwright + Browserless", { delay: 25 }).catch(()=>{});
    }

    // type body
    const bodySelectors = [
      'div[role="textbox"][contenteditable="true"]',
      'div[data-testid="post-paragraph"]',
      'div[class*="editorContent"] div[contenteditable="true"]',
      'div[contenteditable="true"]'
    ];
    for (const b of bodySelectors) {
      const el = await page.$(b);
      if (el) {
        await el.click({ timeout: 3000 }).catch(()=>{});
        await page.keyboard.type("This is an automated test body created by Playwright running in GitHub Actions via Browserless.", { delay: 20 }).catch(()=>{});
        break;
      }
    }

    console.log("Post typed (test). Wait 3s then close.");
    await page.waitForTimeout(3000);

    console.log("All done. Closing.");
    await context.close();
    await browser.close();
    console.log("Success.");
  } catch (err) {
    console.error("ERROR during automation:", err?.message || err);
    try { await saveDebugScreenshot(page, "error-medium.png"); } catch(e){}
    try { await context.close(); } catch(e){}
    try { await browser.close(); } catch(e){}
    // copy the user's provided debug screenshot path into the log for inspection
    console.log("Provided debug screenshot path (uploaded):", DEBUG_SCREENSHOT_PATH);
    throw err;
  }
}

postToMedium().catch((err) => {
  console.error(err);
  process.exit(2);
});
