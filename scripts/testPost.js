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

  // Wait longer for the editor to appear
  try {
    await page.waitForSelector('div[role="textbox"]', { timeout: 30000 });
    console.log("✅ Editor loaded, ready to post!");
  } catch (err) {
    console.warn("⚠ Editor not found, maybe Medium changed the DOM or a modal is blocking it.");
  }

  await browser.close();
}

run();
