import { chromium } from "playwright";

async function run() {
  console.log("🔵 Running test post...");

  const cookiesEnv = process.env.MEDIUM_COOKIES;

  if (!cookiesEnv) {
    console.error("❌ MEDIUM_COOKIES not found!");
    process.exit(1);
  }

  let cookies;
  try {
    cookies = JSON.parse(cookiesEnv);
    if (!Array.isArray(cookies)) throw new Error("Cookies must be an array");

    // Normalize sameSite
    cookies = cookies.map(c => ({
      ...c,
      sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax",
    }));
  } catch (e) {
    console.error("❌ Invalid MEDIUM_COOKIES JSON:", e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: { cookies, origins: [] } });

  const page = await context.newPage();
  await page.goto("https://medium.com/new-story", { waitUntil: "domcontentloaded" });

  // Close possible modals
  const modalSelectors = [
    'button[aria-label="Close"]',
    'button[aria-label="Dismiss"]',
    'button:has-text("Skip for now")'
  ];
  for (const sel of modalSelectors) {
    const modal = await page.$(sel);
    if (modal) {
      console.log(`⚡ Closing modal ${sel}`);
      await modal.click();
      await page.waitForTimeout(500); // wait a bit after closing
    }
  }

  // Try multiple possible editor selectors
  const editorSelectors = [
    'div[role="textbox"]',
    'div[data-placeholder="Title"]',
    'textarea'
  ];

  let editorFound = false;
  for (const sel of editorSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 15000 });
      console.log(`✅ Editor found: ${sel}`);
      editorFound = true;
      break;
    } catch {}
  }

  if (!editorFound) {
    console.warn("❌ Could not find the editor, Medium DOM may have changed.");
  }

  await browser.close();
}

run();
