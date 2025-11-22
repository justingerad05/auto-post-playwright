import fs from "fs/promises";
import playwright from "playwright-core";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";

chromium.use(stealth());

async function safeWriteFile(path, content) {
  try {
    await fs.writeFile(path, content);
  } catch (e) {
    console.log(`Failed writing ${path}:`, e.message);
  }
}

async function captureDebug(page) {
  try {
    await page.screenshot({ path: "debug-screenshot.png", fullPage: true });
  } catch {}
  try {
    const html = await page.content();
    await safeWriteFile("page-content.html", html);
  } catch {}
}

// -------------------------------
// CLOUDLFARE CHECK
// -------------------------------
async function detectCloudflare(page) {
  const html = await page.content();
  return html.includes("cf-browser-verification") ||
         html.includes("Attention Required") ||
         html.includes("Cloudflare") ||
         html.includes("cf_chl_");
}

// -----------------------------
// MEDIUM EDITOR DETECTION
// -----------------------------
async function waitForEditor(page) {
  const selectors = [
    'div[data-testid="storyTitle"]',
    'h1[data-testid="editable"]',
    'div[role="textbox"]',
    '[contenteditable="true"]',
    'section[contenteditable="true"]',
    'article div[contenteditable="true"]',
    'div[class*="graf--title"]',
    'div[class*="postEditor"]',
  ];

  // Try top-level first
  for (const selector of selectors) {
    try {
      console.log(`Trying selector: ${selector}`);
      await page.waitForSelector(selector, { timeout: 12000 });
      console.log(`Editor found via selector: ${selector}`);
      return selector;
    } catch {}
  }

  // Try clicking "Write"
  try {
    const writeButtons = await page.$x(
      "//button[contains(., 'Write') or contains(., 'New story') or contains(., 'Write a story')]"
    );
    if (writeButtons.length) {
      console.log("Clicking Medium 'Write' button");
      await writeButtons[0].click();
      await page.waitForTimeout(2500);

      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 8000 });
          console.log(`Editor found after clicking 'Write': ${selector}`);
          return selector;
        } catch {}
      }
    }
  } catch {}

  // Try iframes
  const frames = page.frames();
  for (const frame of frames) {
    for (const selector of selectors) {
      try {
        await frame.waitForSelector(selector, { timeout: 6000 });
        console.log(`Editor found inside iframe: ${selector}`);
        return selector;
      } catch {}
    }
  }

  // Failure → write debug
  console.log("Editor not found — capturing debug files...");
  await captureDebug(page);

  throw new Error("Failed to detect Medium editor — all selectors failed.");
}

// -----------------------------
// OPEN MEDIUM WITH CF HANDLING
// -----------------------------
async function gotoMedium(page) {
  console.log("Navigating to Medium...");
  let res = await page.goto("https://medium.com/new-story", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  await page.waitForTimeout(2500);

  if (await detectCloudflare(page)) {
    console.log("⚠ Cloudflare challenge detected — waiting 8 seconds...");
    await page.waitForTimeout(8000);

    console.log("Retrying navigation after Cloudflare...");
    res = await page.goto("https://medium.com/new-story", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForTimeout(3000);
  }

  return res;
}

// -----------------------------
// MAIN MEDIUM POST FUNCTION
// -----------------------------
export async function postToMedium(title, html) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
    viewport: { width: 1400, height: 900 },
  });

  const page = await context.newPage();

  try {
    await gotoMedium(page);

    const selector = await waitForEditor(page);

    // Set title
    await page.fill(selector, title);
    await page.keyboard.press("Enter");

    // Insert HTML
    await page.evaluate((content) => {
      const el = document.activeElement;
      el.innerHTML = content;
    }, html);

    console.log("Medium post complete.");
  } catch (err) {
    console.log("ERROR:", err.message);
    await captureDebug(page);
    throw err;
  } finally {
    await browser.close();
  }
}
