import { chromium } from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(StealthPlugin());

async function run() {
  console.log('🔵 Running test post in stealth mode...');

  const cookiesEnv = process.env.MEDIUM_COOKIES;
  if (!cookiesEnv) {
    console.error('❌ MEDIUM_COOKIES not found!');
    process.exit(1);
  }

  let cookies;
  try {
    cookies = JSON.parse(cookiesEnv);
    if (!Array.isArray(cookies)) throw new Error('Cookies must be an array');
    cookies = cookies.map(c => ({
      ...c,
      sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax',
    }));
  } catch (e) {
    console.error('❌ Invalid MEDIUM_COOKIES JSON:', e.message);
    process.exit(1);
  }

  // Launch headful browser
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  });

  const context = await browser.newContext({
    storageState: { cookies, origins: [] },
    viewport: { width: 1400, height: 900 }
  });

  const page = await context.newPage();

  console.log("🌐 Navigating to Medium...");
  await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded" });

  console.log("⏳ Waiting for Cloudflare challenge...");
  await page.waitForTimeout(8000);

  // Attempt to detect editor
  const selectors = [
    'div[data-placeholder="Title"]',
    'div[role="textbox"]',
    'div[data-placeholder="Write here…"]',
    'textarea'
  ];

  let found = false;
  for (const sel of selectors) {
    try {
      await page.waitForSelector(sel, { timeout: 10000 });
      console.log(`✅ Editor found: ${sel}`);
      found = true;
      break;
    } catch {}
  }

  if (!found) {
    console.log("❌ Editor not found — Cloudflare may have blocked us.");

    const screenshotDir = path.resolve("screenshots");
    if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

    const ss = path.join(screenshotDir, `cloudflare-block-${Date.now()}.png`);
    await page.screenshot({ path: ss, fullPage: true });

    console.log(`📸 Screenshot saved: ${ss}`);
  }

  await browser.close();
  console.log("✅ Test completed.");
}

run();
