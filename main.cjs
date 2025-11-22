// main.cjs
// Run: node main.cjs
// Expects two GitHub secrets set in Actions env: BROWSERLESS_API_KEY, MEDIUM_COOKIES

const fs = require("fs");
const { chromium } = require("playwright-core");

function log(...args) { console.log(...args); }

async function postToMedium() {
  log("=== Medium Automation Start ===");

  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  const rawCookies = process.env.MEDIUM_COOKIES; // JSON string of { "cookies": [...] }

  if (!browserlessKey) throw new Error("BROWSERLESS_API_KEY environment variable is not set.");
  if (!rawCookies) throw new Error("MEDIUM_COOKIES environment variable is not set.");

  let cookiesObj;
  try {
    cookiesObj = JSON.parse(rawCookies);
    if (!Array.isArray(cookiesObj.cookies)) {
      // Accept either { cookies: [...] } or direct array
      if (Array.isArray(cookiesObj)) cookiesObj = { cookies: cookiesObj };
      else throw new Error("invalid cookie format");
    }
  } catch (err) {
    throw new Error("MEDIUM_COOKIES must be valid JSON and contain an array named `cookies`.");
  }

  // Connect to Browserless (Chrome over CDP)
  const wsUrl = `wss://chrome.browserless.io?token=${browserlessKey}`;
  log("Connecting to Browserless CDP...");
  const browser = await chromium.connectOverCDP(wsUrl, { timeout: 60000 });
  log("Connected to Browserless.");

  // Create a new context and add cookies
  const context = await browser.newContext();
  // Playwright expects cookies in Playwright format: domain, name, value, path, secure, httpOnly, sameSite (Optional), expires (optional)
  // Many cookie exports use expirationDate; Playwright uses 'expires' (number of seconds since the UNIX epoch) OR 'expirationDate' in some exports.
  const normalized = cookiesObj.cookies.map(c => {
    const out = {
      name: c.name,
      value: String(c.value ?? ""),
      domain: c.domain,
      path: c.path ?? "/",
      secure: !!c.secure,
      httpOnly: !!c.httpOnly
    };
    // playwrighter accepts 'expires' as seconds since epoch (Number) or omit for session cookie
    if (c.expirationDate || c.expiry || c.expires) {
      // handle both seconds and milliseconds heuristically
      const raw = c.expirationDate ?? c.expires ?? c.expiry;
      let n = Number(raw);
      if (!isFinite(n)) n = undefined;
      if (n && n > 1e12) n = Math.floor(n / 1000); // ms to s
      out.expires = n || undefined;
    }
    // sameSite mapping (Playwright accepts 'Lax' | 'Strict' | 'None')
    if (c.sameSite) {
      const s = String(c.sameSite).toLowerCase();
      if (s.includes("lax")) out.sameSite = "Lax";
      else if (s.includes("strict")) out.sameSite = "Strict";
      else if (s.includes("none") || s.includes("no_restriction")) out.sameSite = "None";
    }
    return out;
  });

  log("Adding cookies to context...");
  await context.addCookies(normalized);
  log("Cookies added.");

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(60000);

  try {
    log("Checking login by opening https://medium.com/me ...");
    await page.goto("https://medium.com/me", { waitUntil: "networkidle", timeout: 60000 });

    // If Cloudflare challenge still present, page content will show challenge. We still proceed to editor.
    log("Opening Medium editor...");
    await page.goto("https://medium.com/new", { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for an editable area - try multiple selectors
    const editorSelectors = [
      "h1", // title
      'div[role="textbox"]',
      'div[contenteditable="true"]',
      "section"
    ];

    let found = null;
    for (const sel of editorSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 15000 });
        found = sel;
        break;
      } catch (e) {
        // try next
      }
    }

    if (!found) {
      throw new Error("Could not find Medium editor elements (editor selectors not found).");
    }
    log("Editor element found:", found);

    // Compose a test title + body
    const now = new Date().toISOString().replace("T", " ").split(".")[0];
    const title = `Automated test post — ${now}`;
    const body = "This is a test post published automatically by Playwright + Browserless.\n\nIf you see this, the automation worked.";

    // Try to focus title and type then tab to body and type
    // Click title element (h1) if exists
    try {
      await page.click("h1", { timeout: 5000 });
      await page.keyboard.type(title, { delay: 20 });
    } catch (e) {
      // fallback: focus first contenteditable
      await page.click('div[contenteditable="true"]', { timeout: 5000 });
      await page.keyboard.type(title, { delay: 20 });
    }

    // press Enter twice to insert body
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    // now type body
    await page.keyboard.type(body, { delay: 15 });

    log("Title and body typed. Attempting to open Publish flow (best-effort).");

    // Try to click "Publish" button (UI may differ). We will try some likely selectors.
    const publishSelectors = [
      'button:has-text("Publish")',
      'button:has-text("Publish story")',
      'button[aria-label="Publish"]',
      'button[data-action="publish"]',
      'button[data-action="open-publish-menu"]'
    ];

    let clickedPublish = false;
    for (const sel of publishSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.click(sel);
        clickedPublish = true;
        log("Clicked publish selector:", sel);
        break;
      } catch (err) {
        // ignore and try next
      }
    }

    if (!clickedPublish) {
      log("Publish button not found or not clicked. Saving draft (if possible) and finishing.");
      // Try to Ctrl+S to save draft (some editors support it)
      try {
        await page.keyboard.down("Control");
        await page.keyboard.press("s");
        await page.keyboard.up("Control");
      } catch (e) {}
    } else {
      // After clicking Publish, try to confirm and apply publish steps
      // Wait for final publish confirm button & click
      try {
        // Wait for "Publish now" or "Set a title" flows
        await page.waitForTimeout(1500);
        const confirmSelectors = [
          'button:has-text("Publish now")',
          'button:has-text("Publish")',
          'button:has-text("Done")'
        ];
        for (const sel of confirmSelectors) {
          try {
            await page.waitForSelector(sel, { timeout: 5000 });
            await page.click(sel);
            log("Clicked confirm publish selector:", sel);
            break;
          } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
    }

    log("Automation completed. Check your Medium stories/drafts for the new post.");
  } finally {
    try { await page.waitForTimeout(2000); } catch (e){}
    await context.close();
    try { await browser.close(); } catch (e) {}
  }
}

postToMedium()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch(err => {
    console.error("ERROR during automation:", err.message || err);
    console.error(err);
    process.exit(2);
  });
