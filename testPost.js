// testPost.js
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

function normalizeCookies(rawCookies) {
  if (!Array.isArray(rawCookies)) throw new Error("MEDIUM_COOKIES must be a JSON array.");
  const twentyYears = Math.floor(Date.now() / 1000) + 20 * 365 * 24 * 3600;
  return rawCookies.map(c => {
    const out = {
      name: c.name || c.key || "",
      value: c.value || c.val || "",
      domain: c.domain || c.host || ".medium.com",
      path: c.path || "/",
    };
    out.expires = Math.max(Number(c.expires || c.expiration || 0) || 0, twentyYears);
    const s = (c.sameSite || c.same_site || "").toString().toLowerCase();
    out.sameSite = s === "strict" ? "Strict" : s === "none" ? "None" : "Lax";
    out.httpOnly = !!c.httpOnly || !!c.http_only || !!c.httponly;
    out.secure = !!c.secure;
    return out;
  });
}

function storageToOrigins(storageObj) {
  if (!storageObj) return [];
  if (Array.isArray(storageObj.origins)) return storageObj.origins;
  const entries = [];
  if (typeof storageObj === "object") {
    for (const [k, v] of Object.entries(storageObj)) {
      entries.push({ name: k, value: typeof v === "string" ? v : JSON.stringify(v) });
    }
  }
  return [{
    origin: "https://medium.com",
    localStorage: entries
  }];
}

async function run() {
  console.log("🔵 Running test post…");

  const cookiesRaw = process.env.MEDIUM_COOKIES;
  const storageRaw = process.env.MEDIUM_STORAGE;

  if (!cookiesRaw || !storageRaw) {
    console.error("❌ MEDIUM_COOKIES or MEDIUM_STORAGE not set in secrets!");
    process.exit(1);
  }

  let cookiesJson, storageJson;
  try {
    cookiesJson = JSON.parse(cookiesRaw);
  } catch (e) {
    console.error("❌ Invalid MEDIUM_COOKIES JSON:", e.message);
    process.exit(1);
  }
  try {
    storageJson = JSON.parse(storageRaw);
  } catch (e) {
    console.error("❌ Invalid MEDIUM_STORAGE JSON:", e.message);
    process.exit(1);
  }

  const cookies = normalizeCookies(cookiesJson);
  const origins = storageToOrigins(storageJson);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: { cookies, origins } });
  const page = await context.newPage();

  try {
    console.log("🔵 Opening editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "networkidle", timeout: 45000 });

    // give Cloudflare a little extra time
    await page.waitForTimeout(4000);

    // try to close modals
    const modalSelectors = [
      'button[aria-label="Close"]',
      'button[aria-label="Dismiss"]',
      'button:has-text("Skip for now")',
      'button:has-text("Not now")'
    ];
    for (const sel of modalSelectors) {
      const el = await page.$(sel);
      if (el) {
        try { await el.click({ timeout: 2000 }); await page.waitForTimeout(500); } catch {}
      }
    }

    // editor selectors (broad)
    const editorSelectors = [
      'div[data-placeholder="Title"]',
      'div[role="textbox"]',
      'div[data-placeholder="Write here…"]',
      'textarea'
    ];

    let found = false;
    for (const sel of editorSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 15000 });
        console.log("✅ Editor found:", sel);
        found = true;
        break;
      } catch {}
    }

    if (!found) {
      console.warn("❌ Could not find the editor. Cloudflare or DOM changes may be blocking it.");
      const screenshotDir = path.resolve(process.cwd(), "screenshots");
      if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
      const screenshotPath = path.join(screenshotDir, `medium-editor-fail-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log("📸 Screenshot saved:", screenshotPath);
      process.exit(1);
    }

    console.log("✅ Editor visible — test passed (you can extend test to type content).");
  } catch (err) {
    console.error("❌ Unexpected error:", err.message);
    const screenshotDir = path.resolve(process.cwd(), "screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, `medium-error-${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(()=>{});
    console.log("📸 Screenshot saved:", screenshotPath);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
