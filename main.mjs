// main.mjs
import fs from "fs";
import path from "path";
import { chromium } from "playwright";

const CHROME_PROFILE_DIR = process.env.CHROME_PROFILE_DIR || ""; // e.g. /tmp/chrome-profile
const USER_AGENT = process.env.USER_AGENT || "";
const MEDIUM_POST_HTML = process.env.MEDIUM_POST_HTML || ""; // optional

function findProfilePath(parentDir) {
  if (!parentDir) return null;
  try {
    const entries = fs.readdirSync(parentDir, { withFileTypes: true }).map(d => d.name);
    // Common profile folder names
    const candidates = entries.filter(n =>
      /^Profile\s*\d+$/.test(n) || n === "Default" || n.toLowerCase().includes("profile")
    );
    if (candidates.length > 0) {
      return path.join(parentDir, candidates[0]);
    }
    // Maybe user zipped the profile contents directly (contains "Cookies" file)
    if (entries.includes("Cookies") || entries.includes("Local State") || entries.includes("Preferences")) {
      return parentDir;
    }
    // otherwise fallback to first directory
    const firstDir = entries.find(e => fs.statSync(path.join(parentDir, e)).isDirectory());
    if (firstDir) return path.join(parentDir, firstDir);
    return null;
  } catch (err) {
    return null;
  }
}

function stealthInitScript() {
  return `(() => {
    try {
      // hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
      // languages & plugins
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US','en'], configurable: true });
      Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3,4,5], configurable: true });
      // permissions shim
      const _permissions = window.navigator.permissions;
      if (_permissions && _permissions.query) {
        const orig = _permissions.query;
        _permissions.query = (parameters) => parameters.name === 'notifications' ? Promise.resolve({ state: Notification.permission }) : orig(parameters);
      }
    } catch (e) {}
  })();`;
}

async function waitForMediumEditor(page, timeout = 60_000) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[class*="editorContent"]',
    'div[contenteditable="true"]'
  ];
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const html = await page.content().catch(()=>"");
    if (/Just a moment|Enable JavaScript and cookies|cf_chl|cdn-cgi|Checking your browser|Cloudflare/i.test(html)) {
      throw new Error("Blocked by Cloudflare challenge. Playwright can't proceed while challenge is active.");
    }
    for (const s of selectors) {
      try {
        const el = await page.$(s);
        if (el) {
          const vis = await el.isVisible?.();
          if (vis === undefined || vis) return s;
        }
      } catch (err) {}
    }
    await page.waitForTimeout(2000);
  }
  throw new Error("Editor did not become ready in time.");
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");
  const profilePath = findProfilePath(CHROME_PROFILE_DIR);
  if (!profilePath) {
    throw new Error("Cannot find Chrome profile inside CHROME_PROFILE_DIR. Make sure you uploaded and decoded the zip correctly.");
  }
  console.log("Using Chrome profile path:", profilePath);

  // Launch persistent context using profile dir:
  const launchOptions = {
    headless: true, // headless true still uses profile; if you want headful, set false and run xvfb in runner (advanced)
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=site-per-process"
    ],
    ignoreHTTPSErrors: true,
  };

  // If user provided a forced user agent, will set it when creating pages
  const context = await chromium.launchPersistentContext(profilePath, launchOptions);
  try {
    // Best-effort stealth script in every page
    await context.addInitScript({ content: stealthInitScript() }).catch(()=>{});

    const page = await context.newPage();
    if (USER_AGENT && USER_AGENT.trim() !== "") {
      await page.setUserAgent(USER_AGENT);
    }

    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });

    const selector = await waitForMediumEditor(page, 90_000);
    console.log("Editor ready. Selector:", selector);

    try {
      const titleEl = await page.$(selector);
      if (titleEl) {
        await titleEl.click({ timeout: 5000 });
        await page.keyboard.type("Automated test post — GitHub Actions + local Chrome profile", { delay: 30 });
      }
    } catch (err) {
      console.warn("Could not type title:", err.message || err);
    }

    // Type a simple body or use MEDIUM_POST_HTML to paste if provided
    if (MEDIUM_POST_HTML && MEDIUM_POST_HTML.trim().length > 0) {
      // try to paste HTML by evaluating in editor
      try {
        await page.evaluate((html) => {
          // Find a contenteditable and set innerHTML
          const el = document.querySelector('div[contenteditable="true"], div[class*="editorContent"]');
          if (el) {
            el.focus();
            el.innerHTML = html;
          }
        }, MEDIUM_POST_HTML);
      } catch (e) {
        console.warn("Failed to set MEDIUM_POST_HTML, falling back to typing.");
      }
    } else {
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
            "This is an automated test created in GitHub Actions using your uploaded Chrome profile. If this appears, posting flow is working.",
            { delay: 20 }
          );
          break;
        }
      }
    }

    console.log("Done typing. Waiting 2s then closing.");
    await page.waitForTimeout(2000);

    await context.close();
    console.log("Success — script executed without unhandled errors.");
  } catch (err) {
    try {
      const page = context.pages()[0];
      if (page) {
        await page.screenshot({ path: "/tmp/error-screenshot.png", fullPage: true }).catch(()=>{});
        console.log("Saved debug screenshot to /tmp/error-screenshot.png");
      }
    } catch (e) {}
    await context.close().catch(()=>{});
    throw err;
  }
}

postToMedium().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(2);
});
