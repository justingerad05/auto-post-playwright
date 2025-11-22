// main.cjs
// Node 18+ with Playwright preinstalled in your actions environment
import fs from "fs";
import { chromium } from "playwright";

async function loadCookiesFromEnv() {
  const b64 = process.env.MEDIUM_COOKIES_B64;
  const raw = process.env.MEDIUM_COOKIES;
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      return JSON.parse(decoded).cookies || JSON.parse(decoded);
    } catch (e) {
      console.error("Failed to parse MEDIUM_COOKIES_B64:", e.message);
      throw e;
    }
  }
  if (raw) {
    try {
      return JSON.parse(raw).cookies || JSON.parse(raw);
    } catch (e) {
      console.error("Failed to parse MEDIUM_COOKIES:", e.message);
      throw e;
    }
  }
  // fallback to local file (useful for local testing)
  if (fs.existsSync("medium_cookies.json")) {
    const txt = fs.readFileSync("medium_cookies.json", "utf8");
    return JSON.parse(txt).cookies || JSON.parse(txt);
  }
  throw new Error("No cookies found in MEDIUM_COOKIES_B64, MEDIUM_COOKIES or medium_cookies.json");
}

async function postToMedium() {
  console.log("=== Medium Post Automation Start ===");
  const cookies = await loadCookiesFromEnv();
  console.log(`Loaded ${cookies.length} cookies.`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    // don't clear cookies; we'll add ours
  });

  // Playwright expects cookie objects to contain: name, value, domain, path, httpOnly (bool), secure (bool)
  // ensure `sameSite` uses Playwright's accepted values: "Strict"|"Lax"|"None"
  const normalized = cookies.map(c => {
    const out = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path || "/",
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
    };
    if (c.sameSite) {
      const s = String(c.sameSite).toLowerCase();
      if (s === "strict") out.sameSite = "Strict";
      else if (s === "lax") out.sameSite = "Lax";
      else out.sameSite = "None";
    }
    if (c.expirationDate) {
      // Playwright accepts 'expires' (number seconds since epoch)
      const exp = Number(c.expirationDate);
      if (!Number.isNaN(exp)) out.expires = exp;
    }
    return out;
  });

  try {
    await context.addCookies(normalized);
    console.log("Cookies added to browser context.");

    const page = await context.newPage();

    // Try to navigate to the medium profile page to confirm logged in
    console.log("Navigating to https://medium.com/me ...");
    await page.goto("https://medium.com/me", { waitUntil: "networkidle", timeout: 60000 })
      .catch(e => { throw new Error("First navigation to /me timed out or was blocked: " + e.message); });

    // Quick check: look for element that indicates logged-in (avatar, "Write" button, etc.)
    // We try a few selectors and proceed when found.
    console.log("Checking login status...");
    const loggedIn = await Promise.any([
      page.waitForSelector("a[href='/me']", { timeout: 10000 }).then(() => true).catch(() => false),
      page.waitForSelector("img[alt*='avatar']", { timeout: 10000 }).then(() => true).catch(() => false),
      page.waitForSelector("a[href='/new']", { timeout: 10000 }).then(() => true).catch(() => false)
    ]).catch(() => false);

    if (!loggedIn) {
      throw new Error("Not logged in or Cloudflare/Challenge detected. Playwright can't proceed while challenge is active.");
    }

    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new", { waitUntil: "networkidle", timeout: 60000 });

    // Wait for editor area to appear
    await page.waitForSelector("section", { timeout: 30000 });

    // Fill a quick test post
    const testTitle = `Test post from automation - ${new Date().toISOString()}`;
    const testBody = "This is a test post published by automation using Playwright + cookies. If you see this, automation worked.";

    // Title: usually an h1 contentEditable or textarea; try a few approaches
    // approach 1: click placeholder and type
    try {
      await page.click("section [role='textbox']", { timeout: 5000 });
      await page.keyboard.type(testTitle);
    } catch (e) {
      // fallback: use the main title selector
      await page.fill("textarea", testTitle).catch(() => {});
    }

    // Body - press Enter then type
    await page.keyboard.press("Enter");
    await page.keyboard.type(testBody);

    // Wait briefly then try to click Publish button
    await page.waitForTimeout(2000);

    // Try to open publish modal
    const publishBtn = await page.$("button:has-text('Publish')") || await page.$("button:has-text('Share')");
    if (publishBtn) {
      console.log("Found publish-like button. Clicking...");
      await publishBtn.click().catch(() => {});
      // If a modal appears, try the final publish confirmation
      await page.waitForTimeout(2000);
      const finalBtn = await page.$("button:has-text('Publish now')") || await page.$("button:has-text('Publish')");
      if (finalBtn) {
        console.log("Confirming publish...");
        await finalBtn.click().catch(() => {});
        console.log("Clicked publish. Check your Medium account for the new story.");
      } else {
        console.log("Could not locate final publish button automatically — you may need to publish manually from the editor.");
      }
    } else {
      console.log("Publish button not found programmatically — the editor may have a different layout. The story is in the editor draft if navigation succeeded.");
    }

    await page.screenshot({ path: "medium-post-result.png", fullPage: true }).catch(()=>{});
    console.log("Automation completed — screenshot saved to medium-post-result.png (in Actions artifacts if saved).");

  } finally {
    await browser.close();
  }
}

postToMedium().catch(err => {
  console.error("ERROR during automation:", err.message || err);
  process.exit(2);
});
