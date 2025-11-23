// main.mjs - Playwright automation for Medium (uses proxy + stealth tweaks)
import fs from "fs";
import process from "process";
import { chromium } from "playwright";
import dotenv from "dotenv";
dotenv.config();

// Helpers
function decodeEnvJSON(envVar) {
  const v = process.env[envVar] || "";
  if (!v) return null;
  try {
    // support base64 encoded JSON or raw JSON
    // if the value looks like base64 (only base64 chars) we try decode; otherwise parse directly
    const maybeBase64 = /^[A-Za-z0-9+/=\n]+$/.test(v.trim());
    if (maybeBase64) {
      try {
        const buff = Buffer.from(v, "base64").toString("utf8");
        return JSON.parse(buff);
      } catch (_) {
        // fallthrough to try raw JSON
      }
    }
    return JSON.parse(v);
  } catch (e) {
    return null;
  }
}

function normalizeCookies(parsed) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) return { cookies: parsed, origins: [] };
  if (parsed.cookies && Array.isArray(parsed.cookies)) return parsed;
  if (typeof parsed === "object") return { cookies: [parsed], origins: [] };
  return null;
}

async function stealthPageSetup(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1,2,3] });
  });
}

async function postToMedium() {
  console.log("=== Medium Automation Start ===");

  const PROXY_URL = process.env.PROXY_URL || "";
  const MEDIUM_COOKIES_RAW = process.env.MEDIUM_COOKIES || "";
  const USER_AGENT = process.env.USER_AGENT || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

  if (!MEDIUM_COOKIES_RAW) {
    throw new Error("Missing MEDIUM_COOKIES environment variable.");
  }

  const parsed = decodeEnvJSON("MEDIUM_COOKIES");
  const storageState = normalizeCookies(parsed);
  if (!storageState) throw new Error("MEDIUM_COOKIES is not valid JSON or has unexpected structure.");

  console.log(`Loaded ${storageState.cookies.length} cookies.`);

  const launchArgs = [];
  if (PROXY_URL) launchArgs.push(`--proxy-server=${PROXY_URL}`);

  const browser = await chromium.launch({
    headless: true,
    args: launchArgs,
  });

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      ignoreHTTPSErrors: true,
      storageState,
    });

    const page = await context.newPage();
    await stealthPageSetup(page);

    console.log("Opening Medium editor...");
    await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded", timeout: 60000 });

    const editorSelectors = [
      'div[data-testid="storyTitle"]',
      'h1[data-testid="editable"]',
      'div[class*="editorContent"]',
      'div[contenteditable="true"]'
    ];

    let editorFound = false;
    for (const sel of editorSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 15000 });
        console.log("Editor selector found:", sel);
        editorFound = true;
        break;
      } catch (e) {
        console.log("Selector not found yet:", sel);
      }
    }

    if (!editorFound) {
      throw new Error("Failed to detect Medium editor — all selectors failed.");
    }

    try {
      await page.click('div[data-testid="storyTitle"]', { timeout: 5000 }).catch(()=>{});
      await page.keyboard.type("Automated test post (Playwright)", { delay: 40 });
      await page.keyboard.press("Enter");
      await page.keyboard.type("This is a test post created by an automated Playwright script. If you see this, automation worked.", { delay: 20 });
      console.log("Typed test content into editor.");
    } catch (e) {
      console.warn("Typing into editor failed:", e.message);
    }

    await page.waitForTimeout(4000);
    console.log("Done — automation finished.");

    await context.close();
  } finally {
    await browser.close();
  }
}

postToMedium().catch((err) => {
  console.error("ERROR during automation:", err);
  process.exit(2);
});
