// loadProfile.js
import { chromium } from "playwright";

function normalizeCookies(rawCookies) {
  // Accept either array or object (try to coerce)
  if (!Array.isArray(rawCookies)) throw new Error("MEDIUM_COOKIES must be a JSON array.");
  // Ensure cookie fields match Playwright expected keys and have sane sameSite + expiry
  const twentyYears = Math.floor(Date.now() / 1000) + 20 * 365 * 24 * 3600;
  return rawCookies.map(c => {
    const out = {
      name: c.name || c.key || c[0] || "",
      value: c.value || c.val || c[1] || "",
      domain: c.domain || c.host || ".medium.com",
      path: c.path || "/",
    };
    // expiry in seconds
    out.expires = Math.max(Number(c.expires || c.expiration || c.expiry || 0) || 0, twentyYears);
    // sameSite safe fallback
    const s = (c.sameSite || c.same_site || c.same || "").toString().toLowerCase();
    out.sameSite = s === "strict" ? "Strict" : s === "none" ? "None" : "Lax";
    // secure/ httpOnly flags
    out.httpOnly = !!c.httpOnly || !!c.http_only || !!c.httponly;
    out.secure = !!c.secure;
    return out;
  });
}

function normalizeStorageToOrigins(storageObj) {
  // Accept:
  //  - a storageState-like object { origins: [...] }
  //  - OR simple key=>value mapping/object
  // If given plain entries, we attach them to https://medium.com origin.
  if (!storageObj) return [];
  if (Array.isArray(storageObj.origins)) return storageObj.origins;
  // If it's an object of localStorage key -> value
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

(async () => {
  console.log("🔵 Loading profile (cookies + storage)…");

  const cookiesRaw = process.env.MEDIUM_COOKIES;
  const storageRaw = process.env.MEDIUM_STORAGE;

  if (!cookiesRaw) {
    console.error("❌ MEDIUM_COOKIES secret is missing!");
    process.exit(1);
  }
  if (!storageRaw) {
    console.error("❌ MEDIUM_STORAGE secret is missing!");
    process.exit(1);
  }

  let cookiesJson, storageJson;
  try {
    cookiesJson = JSON.parse(cookiesRaw);
  } catch (err) {
    console.error("❌ MEDIUM_COOKIES is invalid JSON:", err.message);
    process.exit(1);
  }
  try {
    storageJson = JSON.parse(storageRaw);
  } catch (err) {
    console.error("❌ MEDIUM_STORAGE is invalid JSON:", err.message);
    process.exit(1);
  }

  const cookies = normalizeCookies(cookiesJson);
  const origins = normalizeStorageToOrigins(storageJson);

  // Launch headless: true (CI)
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: { cookies, origins }
  });

  const page = await context.newPage();
  try {
    await page.goto("https://medium.com", { waitUntil: "load", timeout: 30000 });
    console.log("✅ Cookies + Storage loaded successfully!");
  } catch (err) {
    console.error("❌ Error opening medium.com:", err.message);
    const screenshotPath = `screenshots/login-fail-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(()=>{});
    console.log("📸 Screenshot saved:", screenshotPath);
    await browser.close();
    process.exit(1);
  }

  await browser.close();
})();
